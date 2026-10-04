# Feature: Google and Microsoft sign-in

## Metadata

| Field | Value |
| --- | --- |
| ID | B-009 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-007](../B-007-access-sessions/README.md), [B-008](../B-008-password-sign-in/README.md) |
| Spec readiness | The finish function is decided. The HTTP JSON and the redirect URLs are not. |

## 1. Problem

- **Pain today:** A licensed email cannot be accepted from Google or Microsoft, and an unverified provider email could be linked by mistake.
- **Why now:** The login screen shows both buttons, and neither may hide behind a flag.
- **Cost of doing nothing:** The first OAuth library we added would invent scopes, URLs, and a body.

## 2. Audience

- **Primary user:** A person whose provisioned email is verified by Google or Microsoft.
- **Secondary user:** The same person, who may also have a password on that user.
- **Job to be done:** When the provider says my licensed email is verified, I want that to be the same user id, so that company A can use a password and company B can use a provider.

## 3. Outcome

> When this ships, `completeProviderAuthentication` links `google` or `microsoft` only for an existing user with an active membership and a verified email, and it does not create a user or a session.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | Unverified email writes no `linked_logins` row | Test |
| Lagging | A verified licensed email resolves to the existing `users.id` | Test |
| Guardrail | `POST /api/v1/authenticate` is not mounted | HTTP test |

## 5. Scope

### In scope (this MVP slice)

- Providers are `google` and `microsoft` only.
- `completeProviderAuthentication` takes `provider`, `providerSubject`, `email`, and `emailVerified`.
- `providerSubject` is the stable id from that provider. It is not the email.
- `emailVerified` must be boolean `true`. Anything else is `unverified_provider_email`. No `linked_logins` row is written. No user is created.
- The email is normalized and must already be a user with at least one active membership. Otherwise the call is rejected and nothing is linked.
- On success, insert `linked_logins` if that `(provider, provider_subject)` is new and belongs to this user. If it already belongs to this user, leave it. If it belongs to someone else, reject with `provider_subject_conflict` and do not move it.
- One user may have a password and either provider, or both providers.
- Success does not issue a token and does not choose a company. The test calls `issueSession` with the seeded membership, the same way password sign-in does.
- If this API later runs the browser redirect, `createPkcePair` makes a `state` and an S256 PKCE pair. The helpers do not persist them and do not register a callback route. No authorize URL, token URL, scope list, or redirect URI is hardcoded.
- OAuth client id and secret env names exist and ship blank. Nothing reads them to call a provider.

### Out of scope

- Sign in with Apple, Facebook, SMS, passkeys, SCIM.
- Request and response JSON for `POST /api/v1/authenticate`.
- The decision of whether the provider or this API completes the browser flow. Both are allowed. This repo implements the finish function and the PKCE tools, not the browser round trip.
- Hiding Microsoft.

### Later (not now)

- A callback route that checks `state` and PKCE, after its URL exists.
- The JSON body, which might be an authorization code or a provider assertion. This function starts after that assertion has already been reduced to a verified email and a subject.

## 6. Stories

1. As a provisioned person, I want a verified Google or Microsoft email to resolve to my existing user, so that I am not duplicated.
2. As that person, I want an unverified email to be rejected, so that the provider subject is not linked.
3. As a person with a password and a provider, I want both on one user.

## 7. Experience

- **Entry points:** Tests call the finish function. The mobile buttons do nothing today.
- **Happy path:** Verified email, active membership, stable subject. Link stored. Memberships returned. No session.
- **Alternate paths:** Unverified, unknown email, inactive membership, subject already linked to another user.
- **Empty / loading / error / permission denied:** Same rejection shape as the rest of auth.
- **Copy & brand notes:** Button labels are Google and Microsoft. This API does not render them.

## 8. Requirements

### Must (MVP)

- Verified licensed email only.
- Do not create a user on failure.
- Do not write `linked_logins` on failure.
- Unique `(provider, provider_subject)`.
- PKCE and `state` available for a future redirect. No callback route yet.
- Do not publish authenticate JSON.

### Should

- Emit `login_failed` with method `google` or `microsoft`. Do not emit `login_succeeded` until `issueSession`.

### Could (nice if cheap)

- None.

### Non-functional

- Client secrets stay in the environment and out of git.
- Do not log the subject together with a raw token. The subject itself is not a password; still do not log provider access tokens. This function never sees an access token.

## 9. Acceptance criteria

1. Given an email with no active membership, when Google or Microsoft finishes, then the call is rejected and no user is created.
2. Given an unverified email, when the call finishes, then no `linked_logins` row is written.
3. Given an active membership, when the provider returns that verified email, then the linked user id is that membership's user.
4. Given a second call with the same subject, when it finishes, then there is still one link.
5. Given `POST /api/v1/authenticate`, when it is requested, then the response is 404.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Subject already linked to another user | Reject, do not move the row | High |
| Password already set on that user | Keep both | High |
| Inventing Google's token endpoint | Do not | High |

## 11. Dependencies

- **Features:** B-004 `linked_logins`, B-005 memberships, B-007 when a test issues a token.
- **External services / vendors:** Google identity and Microsoft identity, later. No SDK is bundled.
- **Design, legal, infra:** OAuth consent screens are not configured here.

## 12. Analytics

- Events / funnels: `login_failed` on rejection. `login_succeeded` only when a session is issued afterward.
- Properties: method `google` or `microsoft`, user id when the row exists, company id only when there is a single active membership, error class.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Finish function takes a verified email and a subject | The HTTP body and the code exchange are not specified | |
| 2026-09-26 | PKCE helpers do not persist `state` | No session store or cookie name was specified | |
| 2026-09-26 | No provider HTTP client | Authorize and token URLs were not named | |

## 14. Open questions

- **Q: Authenticate JSON?** Not published.
- **Q: Does this API own the redirect, and what is the callback URL?** Helpers exist. The route does not.
- **Q: Where are `state` and the PKCE verifier stored between redirect and callback?** Not decided. Nothing is stored.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Redirect and JSON stay open
- [x] Success signal exists
- [x] Feature list row matches this file

# Feature: Password sign-in

## Metadata

| Field | Value |
| --- | --- |
| ID | B-008 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-006](../B-006-password-credentials/README.md), [B-007](../B-007-access-sessions/README.md), [B-012](../B-012-rejection-errors/README.md) |
| Spec readiness | The function is decided. The HTTP JSON is not. |

## 1. Problem

- **Pain today:** A provisioned person with a password cannot prove it to the API.
- **Why now:** The mobile screen already shows Email, Password, and Sign in, and it does not call an API yet.
- **Cost of doing nothing:** F-002 cannot be wired later, or it would be wired to a shape this repo invented.

## 2. Audience

- **Primary user:** A person with an active membership and a password hash.
- **Secondary user:** The Flutter app, later. This slice does not change that app.
- **Job to be done:** When I submit my email and password, I want a rejection or a proven user, so that a stranger cannot create an account.

## 3. Outcome

> When this ships, `verifyPasswordLogin` accepts an email and a password, requires an active membership and a matching hash, and does not create a user, choose a company, or issue a token. Issuing a token is `issueSession`, which the caller invokes with a known `companyUserId`.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | Unknown email creates no user | Test |
| Lagging | A matching hash returns that user id and the active memberships | Test |
| Guardrail | `POST /api/v1/login` is not mounted | HTTP test |

## 5. Scope

### In scope (this MVP slice)

- `verifyPasswordLogin({ email, password })`.
- Email is normalized before lookup. There is no username field.
- Success requires at least one active membership and a hash that matches.
- Failure classes: `unknown_email`, `inactive_membership`, `bad_password`.
- A user with an active membership and no `user_passwords` row fails as `bad_password`. A distinct "no password" class would tell the caller the hash is missing. The silent-reset rule is the strict case; login still should not grow a new class the spec did not name.
- The function returns `userId` and `activeMemberships` (`companyUserId`, `companyId`). It writes no session.
- It does not pick a membership when several are active. It also does not pick one when only one is active. Session creation stays outside this function so login cannot quietly choose.
- Tests that need a token call `issueSession` with the membership id they seeded. The test name says so.
- The path `POST /api/v1/login` is the name the client will use. It is not registered.

### Out of scope

- Request and response JSON.
- Self-serve create.
- Choosing a company.
- The Flutter `hello` page.

### Later (not now)

- Mount the route after the JSON is specified. The handler should call `verifyPasswordLogin` and then `issueSession` only once something else has supplied `companyUserId`.

## 6. Stories

1. As a provisioned person, I want email and password to identify my existing user, so that sign-in is not registration.
2. As a person at two companies, I want this step to stop before a company is chosen, so that the API does not guess which office I entered.
3. As a client developer, I want the route absent until the body is specified, so that I do not code against a guess.

## 7. Experience

- **Entry points:** Tests call the function. The mobile Sign in button does not call this repo yet.
- **Happy path:** Normalized email, matching hash, one or more active memberships. Return the user and those memberships. Analytics does not emit `login_succeeded` here. That event waits until a session exists.
- **Alternate paths:** Unknown email, bad password, inactive membership. No user is created on failure.
- **Empty / loading / error / permission denied:** Rejections use B-012.
- **Copy & brand notes:** Button label in the app is Sign in. This API does not send that string.

## 8. Requirements

### Must (MVP)

- Email plus password only.
- Active membership required.
- Do not create a user on failure.
- Do not choose `companyUserId`.
- Do not publish a JSON schema.

### Should

- Emit `login_failed` with method `password` and the error class.
- Include company id only when there is exactly one active membership, so the property does not pick among several. Omit it when there are two or more.

### Could (nice if cheap)

- None.

### Non-functional

- Do not log the password.

## 9. Acceptance criteria

1. Given an email with no user, when password login runs, then it is rejected and no user row appears.
2. Given an active membership and a hash, when the password matches, then the result is that user and that membership, and no session row appears.
3. Given that result, when the test calls `issueSession` with the seeded `companyUserId`, then the token expires in one week and resolves to that user.
4. Given `POST /api/v1/login`, when it is requested, then the response is 404.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Two active companies | Return both memberships. Issue no token | High |
| No hash | `bad_password`. Do not reveal a missing hash as its own class | Medium |
| Wrong password | `bad_password`. User row stays | High |

## 11. Dependencies

- **Features:** B-005 for rows, B-006 for verify, B-007 for the token the test issues, B-013 for `login_failed`.
- **External services / vendors:** None.
- **Design, legal, infra:** None.

## 12. Analytics

- Events / funnels: `login_failed` from this function. `login_succeeded` only from `issueSession`.
- Properties: method `password`, user id when a row exists, company id only for a single active membership, error class.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Verification does not issue the token | Issuing would force a company choice | |
| 2026-09-26 | Missing hash is `bad_password` | The spec did not name a separate class | |
| 2026-09-26 | Route stays unmounted | JSON is an open question | |

## 14. Open questions

- **Q: Login JSON?** Not published.
- **Q: Which company?** Not chosen here.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] JSON and company choice stay open
- [x] Success signal exists
- [x] Feature list row matches this file

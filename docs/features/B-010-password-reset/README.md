# Feature: Password reset

## Metadata

| Field | Value |
| --- | --- |
| ID | B-010 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-006](../B-006-password-credentials/README.md), [B-013](../B-013-analytics/README.md) |
| Spec readiness | Functions are decided. Routes, lifetime, and wording are not. |

## 1. Problem

- **Pain today:** A person who already has a password cannot replace it, and a person who never set one must not be told to reset it.
- **Why now:** The mobile screen has Forgot password. It does nothing until this exists.
- **Cost of doing nothing:** The first route someone adds would invent `/forgot-password` and a lifetime.

## 2. Audience

- **Primary user:** A person who already has `user_passwords` row.
- **Secondary user:** A person who has only used Google or Microsoft. Their request must look the same and send nothing.
- **Job to be done:** When I ask for a reset, I want a link if I have a password, and silence if I do not, so that I can replace the hash without teaching a stranger whether the account exists.

## 3. Outcome

> When this ships, `requestPasswordReset` stores a hashed token and asks a mailer to send a link only when a hash exists, and `confirmPasswordReset` replaces that hash when the new password and the confirm field match the rules.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | A user with a hash causes one mail send | Test |
| Lagging | Confirm changes the hash and a second submit does not | Test |
| Guardrail | No guessed route and no product lifetime | Code review |

## 5. Scope

### In scope (this MVP slice)

- `requestPasswordReset` and `confirmPasswordReset`. Tests call them. There is no HTTP path.
- Mail is sent only when `user_passwords` exists for the normalized email. Unknown email and missing hash return the same `{ result: 'accepted' }`. No email. No analytics event.
- The caller supplies `from`, `subject`, `expiresAt` (an absolute `Date`), `renderLink(rawToken)`, and `sendMail`. If any of those are missing, the function throws `ResetNotConfiguredError` before it looks up the user. That error is not the rejection shape and it does not mean "no password".
- There is no default lifetime. A test may pass a fixture `Date`. That fixture is not the product lifetime.
- The mail body is the string `renderLink` returns, and nothing else. Wording beyond the link is an open question, so this build does not add a sentence. The invite template is not the reset mail.
- The raw token is given only to `renderLink`. The row stores SHA-256. `used_at` starts null.
- Confirm requires `password` and `confirmPassword` to match, the password rules, and no reuse of the current hash or the last five history hashes. On success it replaces `user_passwords.password_hash`, appends history, and sets `used_at` in one transaction. The reset row is locked with `FOR UPDATE`.
- A rejected candidate does not set `used_at`. The spec requires replay after success to fail, and it requires a bad password to leave the hash unchanged. It does not say a typo consumes the token.
- A second confirm after success is rejected. The hash stays as it was after the first success.
- Confirm rejects when `used_at` is set, the token is unknown, or `expires_at <= now`. Honoring a stored timestamp is not choosing the lifetime.
- This does not create the first hash. No row means the silent request path.

### Out of scope

- The page URL, the token lifetime, and the request and confirm paths.
- Reset email wording, subject, and From address. The caller passes subject and From. The product has not chosen them.
- A web page. The function is the page's server behavior.

### Later (not now)

- Routes in the client path file, next to `/api/v1/login`, once they are named.
- A product lifetime, passed in as `expiresAt` by that route.

## 6. Stories

1. As a person with a password, I want a reset email, so that I can enter a new password and a matching confirm.
2. As a person without a password, I want no email and no distinct error, so that I am not told a password was missing.
3. As that person, I want a second submit of a used token to fail, so that the link is not a standing credential.

## 7. Experience

- **Entry points:** Tests. Forgot password on the phone does not call this yet.
- **Happy path:** Hash exists. Mailer is invoked once. Confirm with a new valid pair updates the hash and history and sets `used_at`.
- **Alternate paths:** Silent accept. Rule failure. Mismatch. Reuse. Replay. Expired stored timestamp.
- **Empty / loading / error / permission denied:** Silent path returns `{ result: 'accepted' }`. Real failures use the rejection shape. Configuration failure is `ResetNotConfiguredError`.
- **Copy & brand notes:** Body is the link alone. Do not use the invite sentence.

## 8. Requirements

### Must (MVP)

- Send only when a hash exists.
- Silent otherwise, including unknown email.
- Token stored as a hash.
- Confirm matches, rules, last five, replace hash, set `used_at`, reject replay.
- Do not invent the route or the lifetime.

### Should

- Lock the reset row during confirm.
- Emit `password_reset_requested` only after the mailer resolves, and `password_reset_completed` only after the hash is replaced. Omit company id. Reset is per user, and choosing a company is open.

### Could (nice if cheap)

- Wording beyond the link. Not added.

### Non-functional

- Do not log the raw token, the link, or the password.
- Do not emit an event that exists only on the silent path.

## 9. Acceptance criteria

1. Given a user with a hash, when they request a reset, then the mailer is called once and the body is the link the caller built.
2. Given that token, when confirm gets a new password and a different confirm, then it is rejected and the hash is unchanged.
3. Given a new password that is too short, has no number, has no special character, or matches any of the last five, when it is submitted, then it is rejected and the hash is unchanged.
4. Given a valid pair, when confirm succeeds, then the hash changes, history grows, and `used_at` is set.
5. Given that used token, when confirm runs again, then it is rejected and the hash stays at the first success.
6. Given no password hash, when reset is requested, then no mail is sent, the return value matches the success return, and no analytics event is emitted.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Two confirms at once | Row lock. One success | High |
| Caller omits `expiresAt` | Configuration error before lookup | High |
| Fixture lifetime mistaken for policy | Tests must not assert a product duration | Medium |

## 11. Dependencies

- **Features:** B-006 rules and hashes. B-013 events. B-014 must not see the link.
- **External services / vendors:** An email sender is injected. No vendor SDK.
- **Design, legal, infra:** From address is not the invite sender. The invite domain is still open, and reset From was never named.

## 12. Analytics

- Events / funnels: `password_reset_requested`, `password_reset_completed`.
- Properties: method `password`, user id. No company id. No token. The silent path emits nothing.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Caller passes an absolute `expiresAt` | A duration inside this module would be a lifetime | |
| 2026-09-26 | Mail body is only the link | Wording is open. "Here is the link" is satisfied without a sentence | |
| 2026-09-26 | Failed rule checks do not consume the token | Replay-after-success is the specified consume rule | |
| 2026-09-26 | Internal return `{ result: 'accepted' }` | Tests need one silent and success value. It is not the HTTP schema | |

## 14. Open questions

- Token lifetime.
- Request path and confirm path.
- Reset wording, subject, and From address.
- The concrete link URL. `renderLink` is the caller's job.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Lifetime, routes, and wording stay open
- [x] Success signal exists
- [x] Feature list row matches this file

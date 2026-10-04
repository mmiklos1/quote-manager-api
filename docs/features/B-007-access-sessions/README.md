# Feature: Access sessions

## Metadata

| Field | Value |
| --- | --- |
| ID | B-007 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-005](../B-005-membership-seats/README.md), [B-008](../B-008-password-sign-in/README.md), [B-009](../B-009-provider-sign-in/README.md) |
| Spec readiness | Complete except which membership login should pass in |

## 1. Problem

- **Pain today:** A signed token cannot be killed when one company membership is turned off.
- **Why now:** The access token lasts a week, and deprovision has to revoke it sooner.
- **Cost of doing nothing:** A valid signature would keep working after deprovision.

## 2. Audience

- **Primary user:** A person with an active membership who has just signed in.
- **Secondary user:** Later APIs that must resolve the token to `users.id`.
- **Job to be done:** When I sign in, I want a token that expires in one week from that sign-in and that the server can revoke, so that a leaked token does not outlive the membership.

## 3. Outcome

> When this ships, `issueSession` requires a `companyUserId`, stores only a hash of the JWT, and sets `expires_at` one week from that call. `validateAccessToken` rejects a missing, forged, expired, revoked, or inactive-membership token, and the user it returns is the token's user.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | A session row exists after issue | Test |
| Lagging | Validation checks the row, not only the signature | Test |
| Guardrail | Login does not choose `companyUserId` | B-008 |

## 5. Scope

### In scope (this MVP slice)

- JWT signed with HMAC-SHA256 (`HS256`). The signing key is `JWT_SIGNING_KEY`, at least 32 characters, never committed.
- Payload is `sub` (`users.id`), `iat`, and `exp` only. Company context is the session row, not a claim. Putting the company in the token would look like an answer to the multi-company question.
- `sessions.token_hash` is the SHA-256 hex of the raw JWT. The raw token is returned to the caller of `issueSession` and is not stored.
- `expires_at` is one week after the login second. JWT `exp` is a whole second, so the lifetime is `7 * 24 * 60 * 60` seconds from the floored login second, and the row uses that same instant. A second login uses the second login's clock, not the first login's.
- `revoked_at` null means the row is still usable.
- Validation order: missing, signature and JWT expiry (`clockTolerance` 0), session hash, `sub` matches the row, `revoked_at`, `expires_at <= now`, membership `active`. No grace window.
- The resolved user is `sessions.user_id`. The function does not take a client-supplied user id.
- `issueSession` requires `companyUserId`, checks that the membership belongs to that user, and checks that it is active. It does not search for "the" membership.

### Out of scope

- Choosing the membership inside login.
- Refresh tokens, rotation, and signing out of other sessions on a new login. The spec does not say to revoke the previous session.
- Clock-skew tolerance.

### Later (not now)

- Whatever a multi-company login is supposed to pass as `companyUserId`.

## 6. Stories

1. As a signed-in person, I want the token to last one week from this login, so that a later login does not extend the old token.
2. As the API, I want a forged or revoked token to fail even when someone knows a user id.
3. As company B, I want my session to keep working when company A is deprovisioned.

## 7. Experience

- **Entry points:** `issueSession` after a successful credential check, once a caller knows the membership. `validateAccessToken` for later protected calls.
- **Happy path:** Issue returns the raw token and `expiresAt`. Validate returns `userId` and `companyUserId` from the row.
- **Alternate paths:** Each failure class is distinct: `missing_token`, `forged_token`, `expired_token`, `revoked_token`, `inactive_membership`.
- **Empty / loading / error / permission denied:** A signature that verifies but has no session row is `forged_token`.
- **Copy & brand notes:** None.

## 8. Requirements

### Must (MVP)

- Subject is `users.id`.
- Store the hash only.
- One week from the login that created the row.
- Reject the five cases the spec names, with no skew window.
- Do not choose the company.

### Should

- Unique `token_hash` so a lookup is one row.

### Could (nice if cheap)

- None.

### Non-functional

- Signing key stays in the environment.
- Do not log the raw token.

## 9. Acceptance criteria

1. Given an active membership, when `issueSession` is called with that `companyUserId`, then the token's expiry is one week from that call and validation resolves to that user.
2. Given a second successful issue, when its expiry is read, then it is one week from the second call.
3. Given a missing, forged, expired, or revoked token, or a token whose membership is inactive, when it is validated, then it is rejected.
4. Given a token for user A, when it is validated, then the user is A.
5. Given the raw token, when the session row is read, then `token_hash` is not the raw token.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Valid signature, revoked row | Reject | High |
| `expires_at` equal to now | Reject. "Passed" includes that instant, matching JWT `exp` | Medium |
| Two companies | Caller must pass `companyUserId`. This feature will not pick | High |

## 11. Dependencies

- **Features:** B-004 `sessions`. B-005 deprovision sets `revoked_at`. B-013 `login_succeeded` is emitted here because this is the moment a token exists.
- **External services / vendors:** `jsonwebtoken` 9.0.3.
- **Design, legal, infra:** `JWT_SIGNING_KEY`.

## 12. Analytics

- Events / funnels: `login_succeeded` on issue, with method, user id, and the company id of the membership that was passed in.
- Properties we will wish we had: None beyond the allowed list. The raw token is not a property.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | HS256 and a 32-character minimum key | The spec requires a JWT signing key and does not name the algorithm | |
| 2026-09-26 | JWT claims are `sub`, `iat`, `exp` only | Company context stays on the session until multi-company login is decided | |
| 2026-09-26 | Lifetime is whole seconds from the login second | JWT `exp` is a second. The row uses that same instant. This is not a skew window | |
| 2026-09-26 | `clockTolerance: 0` and `expires_at <= now` rejects | The spec forbids a grace window | |

## 14. Open questions

- **Q: Which membership does login pass?** `issueSession` requires the id and does not choose it.
- **Q: Clock skew?** No grace window was added.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Multi-company choice stays open
- [x] Success signal exists
- [x] Feature list row matches this file

# Feature: Password credentials

## Metadata

| Field | Value |
| --- | --- |
| ID | B-006 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-008](../B-008-password-sign-in/README.md), [B-010](../B-010-password-reset/README.md) |
| Spec readiness | Complete except how the first hash is created |

## 1. Problem

- **Pain today:** A password cannot be stored in a way that survives a later reset, and a fast hash would be guessable.
- **Why now:** Password login and reset both depend on one current hash and the last five.
- **Cost of doing nothing:** Reset would have nothing trustworthy to replace.

## 2. Audience

- **Primary user:** A person who already has a password hash.
- **Secondary user:** Tests that need a hash in the database. They are not the product setting a first password.
- **Job to be done:** When I choose a new password, I want it checked against the rules and the last five hashes, so that a weak or reused password is not saved.

## 3. Outcome

> When this ships, passwords are Argon2id hashes, the rules reject short values and values with no number or no special character, and a new password that matches any of the last five hashes is rejected.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | Rules are pure functions with tests | `src/passwords/policy.js` |
| Lagging | Reset confirm uses them and leaves the old hash in place on failure | B-010 tests |
| Guardrail | No first-password enrollment flow | No route and no product function for it |

## 5. Scope

### In scope (this MVP slice)

- Rules: 8 or more characters (Unicode code points), at least one number (`\p{N}`), at least one special character. A special character is a code point that is not a letter (`\p{L}`) and not a number. A space counts. The spec said that, and this build does not narrow it.
- Algorithm: Argon2id. Parameters recorded beside the hasher: memoryCost 19456 KiB, timeCost 2, parallelism 1, hashLength 32. These are the OWASP password-storage parameters this build adopted because the spec did not name an algorithm and forbade a fast hash such as raw SHA-256.
- The current hash lives only on `user_passwords`. History rows live on `password_histories`.
- Reuse compares the candidate with the current `user_passwords` hash and with the five newest history rows. Overlap between those sets does not change the outcome. Older rows than those five are not required to be deleted, and they are not required to be checked.
- There is no `user_passwords` row until a hash exists. This feature does not create the first one.

### Out of scope

- How a user sets the first password. Tests that need a hash write `user_passwords` and a matching history row themselves, using the same hasher. That helper is not a product flow.
- A username.
- Two-factor.

### Later (not now)

- The first-password flow, after it is named.

## 6. Stories

1. As a person resetting a password, I want a short password, a password with no number, a password with no special character, or one of my last five to be rejected, so that the current hash stays as it was.
2. As an operator, I want the hash parameters written next to the code, so that a later change is visible.

## 7. Experience

- **Entry points:** Password reset confirm. Login only verifies.
- **Happy path:** A candidate that passes the rules and is not one of the last five is hashed and stored by the reset feature.
- **Alternate paths:** Each rule failure has its own error class and does not write.
- **Empty / loading / error / permission denied:** A missing hash is not a password-rule error. Login reports it as a bad password. Reset stays silent. See those features.
- **Copy & brand notes:** No user-facing sentence is defined here.

## 8. Requirements

### Must (MVP)

- Slow adaptive hash. Parameters sit next to the call.
- Reject the four cases the spec names.
- Do not store the plaintext.

### Should

- Verify with the hash string's own parameters (`argon2.verify`), so a later parameter change can still read old hashes.

### Could (nice if cheap)

- None.

### Non-functional

- Do not log the password or the hash.

## 9. Acceptance criteria

1. Given a password shorter than 8 characters, or with no number, or with no special character, when it is judged, then the matching rule class is returned.
2. Given a hash, when the plaintext is verified, then only that plaintext matches.
3. Given the last five hashes, when a candidate matches any of them, then reuse is rejected.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| First password | No product flow. Do not add one | High |
| Space used as the special character | Allowed, because the spec's definition includes it | Low |
| Plus-tag emails | Unrelated; passwords are per user, and the user is per full normalized email | Low |

## 11. Dependencies

- **Features:** B-004 stores the rows. B-010 is the only product writer.
- **External services / vendors:** `argon2` 0.45.1.
- **Design, legal, infra:** None.

## 12. Analytics

- Events / funnels: Rule failures are not a fifth analytics event.
- Properties we will wish we had: None. Do not attach the password.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Argon2id with the parameters in `src/passwords/hash.js` | Spec required a slow hash and a written record of the parameters | Which hash algorithm? |
| 2026-09-26 | Characters are Unicode code points | "Character" is not a UTF-16 code unit | |
| 2026-09-26 | No first-password function in `src/` | That flow is an open question | |

## 14. Open questions

- **Q: How does a user set their first password?** Unanswered. Reset will not create the first hash.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] First-password question stays open
- [x] Success signal exists
- [x] Feature list row matches this file

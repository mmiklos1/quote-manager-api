# Feature: Rejection errors

## Metadata

| Field | Value |
| --- | --- |
| ID | B-012 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-008](../B-008-password-sign-in/README.md), [B-010](../B-010-password-reset/README.md) |
| Spec readiness | The JSON object is an implementation choice. HTTP status for auth is not published. |

## 1. Problem

- **Pain today:** Each failure could invent its own payload, and the client would have nothing stable to map.
- **Why now:** The spec asks for one shape, and it does not name the status codes or the strings.
- **Cost of doing nothing:** Login, provider, reset, and seats would each return a different object.

## 2. Audience

- **Primary user:** The future client that maps a failure.
- **Secondary user:** Tests asserting a class.
- **Job to be done:** When something is rejected, I want one object shape, so that silent reset is the only special case.

## 3. Outcome

> When this ships, every product rejection is `{ error: { code: "rejected", class: "<class>" } }`, and the silent reset does not use it.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | `ApiError.shape` is stable | Unit test |
| Lagging | Login, provider, session, reset, and seat failures throw `ApiError` | Tests |
| Guardrail | Silent reset returns `{ result: 'accepted' }` | B-010 test |

## 5. Scope

### In scope (this MVP slice)

The JSON shape, as an implementation choice:

```json
{ "error": { "code": "rejected", "class": "<class>" } }
```

`code` is always `rejected`. `class` is the snake_case reason. Classes used by this build:

| Class | When |
| --- | --- |
| `unknown_email` | No user for that email |
| `bad_password` | Hash missing or not a match |
| `inactive_membership` | No active membership, or the session's membership is inactive |
| `unverified_provider_email` | Provider did not say `emailVerified === true` |
| `provider_subject_conflict` | Subject already belongs to another user |
| `invalid_provider` | Provider is not `google` or `microsoft` |
| `invalid_email` | Email is not a string, or it is empty after normalization |
| `missing_token` | Access token is missing |
| `forged_token` | Signature, session, or subject does not check out |
| `expired_token` | JWT `exp` or `sessions.expires_at` has passed |
| `revoked_token` | `revoked_at` is set |
| `password_too_short` | Fewer than 8 characters |
| `password_missing_number` | No number |
| `password_missing_special` | No special character |
| `password_reused` | Matches the current hash or one of the last five |
| `password_confirm_mismatch` | New password and confirm differ |
| `reset_token_rejected` | Unknown, used, or expired reset token |
| `seat_limit_reached` | Active seats are at the cap |
| `permission_company_mismatch` | Permission company is not the membership's company |
| `unknown_company` | Provision names a missing company |
| `unknown_membership` | Deprovision names a missing membership |
| `not_found` | HTTP path is not mounted |

Unknown HTTP paths use this shape with class `not_found` and status 404. That status is ordinary HTTP for an unknown path. It is not an auth status.

Auth rejections are thrown as `ApiError` from functions. No auth route is mounted, so this build does not publish an HTTP status for them. Choosing 401 or 400 now would be a second public contract. The number stays open with the login JSON.

`ResetNotConfiguredError` is not this shape. It means the caller forgot `expiresAt`, the mailer, or the link builder.

The silent reset does not use a class that means "no password on file."

### Out of scope

- A human-readable message catalog. The spec did not name the strings. `class` is the machine value. There is no `message` field, so we do not invent copy.
- HTTP status numbers for auth.

### Later (not now)

- Map `class` to status codes when the routes are specified.

## 6. Stories

1. As a client, I want one object for every rejection, so that I can branch on `class` later.
2. As a person without a password, I want reset to skip that object, so that the response is not "no password".

## 7. Experience

- **Entry points:** Thrown from the functions in B-005 through B-010. Returned as JSON only for unmounted HTTP paths.
- **Happy path:** Not an error feature.
- **Alternate paths:** Listed in the class table.
- **Empty / loading / error / permission denied:** This is the error shape.
- **Copy & brand notes:** No prose.

## 8. Requirements

### Must (MVP)

- One shape everywhere except silent reset and the configuration error.
- Stable `class` strings documented here.

### Should

- `errorClass` on the thrown error matches `shape.error.class`.

### Could (nice if cheap)

- None.

### Non-functional

- The shape contains no password, hash, token, or link.

## 9. Acceptance criteria

1. Given an `ApiError`, when `shape` is read, then `code` is `rejected` and `class` is the constructor argument.
2. Given the silent reset, when it returns, then the value is not this shape.
3. Given an unknown path, when it is requested, then status is 404 and the body is this shape with class `not_found`.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| A class that means "no password" | Do not add one | High |
| Auth HTTP status guessed as 401 | Do not publish it | Medium |

## 11. Dependencies

- **Features:** Used by B-005, B-007, B-008, B-009, B-010, and the B-001 404.
- **External services / vendors:** None.
- **Design, legal, infra:** None.

## 12. Analytics

- Events / funnels: `class` is the analytics `errorClass` for login failures. The silent reset has no event.
- Properties we will wish we had: None.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Shape `{ error: { code: "rejected", class } }` | The spec said to pick one shape and document it | Error strings, as an implementation choice |
| 2026-09-26 | No `message` field | User-facing copy was not named | |
| 2026-09-26 | No auth HTTP status | The routes that would carry it are not published | |

## 14. Open questions

- **Q: HTTP status per class, once routes exist?** Open. Not guessed here.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Auth status stays open
- [x] Success signal exists
- [x] Feature list row matches this file

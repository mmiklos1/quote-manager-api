# Feature: Logging

## Metadata

| Field | Value |
| --- | --- |
| ID | B-014 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-013](../B-013-analytics/README.md) |
| Spec readiness | Complete |

## 1. Problem

- **Pain today:** A log line could contain a password, a hash, a raw token, or a reset link.
- **Why now:** Analytics and process start both write logs, and the spec forbids those values.
- **Cost of doing nothing:** The first `console.log` of a request body would store a credential.

## 2. Audience

- **Primary user:** An operator reading stdout.
- **Secondary user:** Analytics, which writes through this logger.
- **Job to be done:** When the process records an event, I want a JSON line with secrets removed, so that the log is safe to keep.

## 3. Outcome

> When this ships, `createLogger` writes one JSON object per line and replaces values whose keys look like passwords, hashes, tokens, secrets, or links.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | A line is JSON with `time` and `level` | Unit test |
| Lagging | Secret keys are `[redacted]` | Unit test |
| Guardrail | Reset does not log the mail body | Code review of B-010 |

## 5. Scope

### In scope (this MVP slice)

- JSON lines on a writer. The default writer is stdout.
- Levels `info`, `warn`, and `error`.
- Redaction walks objects and arrays. A key that matches `password`, `passwd`, `hash`, `token`, `secret`, `authorization`, `cookie`, `link`, or `credential` has its value replaced with `[redacted]`.
- Nested objects are redacted. Depth is capped.
- Process start logs `api_listening` and the port only.
- There is no log vendor and no log table. The spec does not name one. Login tables stay the B-004 list.

### Out of scope

- Request-body logging. No product route reads a body, and a body logger would be the hazard this feature exists to prevent.
- Log shipping, retention, and a production host.

### Later (not now)

- A log drain, if one is specified.

## 6. Stories

1. As an operator, I want JSON logs, so that an event and a boot line share a format.
2. As a person, I want a field named `password` or `resetLink` stored as `[redacted]`, so that a mistake in a caller does not write the secret.

## 7. Experience

- **Entry points:** `createLogger()`. Analytics and the server use it.
- **Happy path:** One line: `{ "time", "level", ...fields }`.
- **Alternate paths:** A secret key is replaced. The key remains so the operator can see that a field existed.
- **Empty / loading / error / permission denied:** Not a screen.
- **Copy & brand notes:** None.

## 8. Requirements

### Must (MVP)

- Do not write passwords, hashes, raw tokens, or reset links.
- Structured lines, not a vendor.

### Should

- Redact on the key name so a future caller cannot bypass it by passing the field through.

### Could (nice if cheap)

- None.

### Non-functional

- Redaction is a backstop. Call sites still must not pass secrets. Reset does not log `sendMail` arguments.

## 9. Acceptance criteria

1. Given a record with `password` and `resetLink`, when it is logged, then those values are `[redacted]` and the line is valid JSON.
2. Given a record with `event` and `userId`, when it is logged, then those values remain.
3. Given the server start log, when it is read, then it has the port and not the database URL or the signing key.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Secret placed in a field named `message` | Not redacted by the key rule. Call sites must not do this. Reset does not | Medium |
| `companyId` redacted by mistake | The key does not match the pattern, so it is kept | Low |

## 11. Dependencies

- **Features:** B-013 is the main caller. B-001 logs startup.
- **External services / vendors:** None.
- **Design, legal, infra:** stdout.

## 12. Analytics

- Events / funnels: This logger carries them. It does not invent events.
- Properties we will wish we had: None.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | JSON lines to stdout | No log product was named | |
| 2026-09-26 | Redact by key name | The forbidden values are passwords, hashes, tokens, and links | |
| 2026-09-26 | No logging table | Same reason as analytics: the record list is the identity tables | |

## 14. Open questions

- None. Production log shipping was not part of F-003.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] No blocking question was closed by a guess
- [x] Success signal exists
- [x] Feature list row matches this file

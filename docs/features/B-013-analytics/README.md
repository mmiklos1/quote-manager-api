# Feature: Analytics

## Metadata

| Field | Value |
| --- | --- |
| ID | B-013 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-007](../B-007-access-sessions/README.md), [B-008](../B-008-password-sign-in/README.md), [B-010](../B-010-password-reset/README.md), [B-014](../B-014-logging/README.md) |
| Spec readiness | Complete |

## 1. Problem

- **Pain today:** Login and reset have no structured record, so a later dashboard would scrape prose logs.
- **Why now:** The spec names four events and the properties they may carry.
- **Cost of doing nothing:** Someone would add a vendor SDK or a table the spec does not describe.

## 2. Audience

- **Primary user:** An operator reading structured logs.
- **Secondary user:** The functions that emit the events.
- **Job to be done:** When a login or a reset happens, I want one of the named events, so that I can count them without storing a secret.

## 3. Outcome

> When this ships, the process can emit `login_succeeded`, `login_failed`, `password_reset_requested`, and `password_reset_completed` through the logger, with only the allowed properties.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | Unknown event names throw | Unit test |
| Lagging | A password property passed by mistake is dropped | Unit test |
| Guardrail | Silent reset emits nothing | B-010 test |

## 5. Scope

### In scope (this MVP slice)

- Events: `login_succeeded`, `login_failed`, `password_reset_requested`, `password_reset_completed`.
- Properties: `method` (`google`, `microsoft`, `password`), `userId`, `companyId`, `errorClass`.
- Any other property is dropped, including `password`, `token`, and `link`.
- The sink is the B-014 logger. There is no third-party product and no analytics table. The spec did not name a store. A new table would be a schema the records section does not list.
- `login_succeeded` is emitted only from `issueSession`, because that is when a token exists. Credential checks that do not choose a company do not emit success.
- `login_failed` includes `companyId` only when the failed attempt has exactly one active membership. Several memberships omit it, so the event does not pick a company.
- Reset events omit `companyId` for the same reason. They include `method: "password"` and `userId`.
- The silent no-hash reset does not emit a substitute event.

### Out of scope

- Segment, PostHog, or any other vendor.
- Events from the Flutter app. That app does not authenticate yet.
- Provision and deprovision events. Not in the spec list.

### Later (not now)

- A warehouse, if one is ever specified.

## 6. Stories

1. As an operator, I want four event names, so that I can count sign-in and reset without a vendor.
2. As a person, I want my password and reset link absent from those events, so that the log is not a credential store.

## 7. Experience

- **Entry points:** Called by sign-in, session issue, and reset.
- **Happy path:** Logger receives `{ kind: "analytics", event, ...allowed }`.
- **Alternate paths:** A method outside the three names throws before a write. An unknown event name cannot be emitted; there is no generic `emit` export.
- **Empty / loading / error / permission denied:** Not a screen.
- **Copy & brand notes:** None.

## 8. Requirements

### Must (MVP)

- Only the four events.
- Only the allowed properties.
- No vendor.
- No distinct silent-reset event.

### Should

- Require an analytics object in the auth functions so a failure is not forgotten.

### Could (nice if cheap)

- None.

### Non-functional

- The logger still redacts secret-looking keys if one is ever nested inside an allowed value. Allowed values are ids and class names.

## 9. Acceptance criteria

1. Given a `login_failed` call that also includes a password field, when it is logged, then the line has the event name and does not have the password.
2. Given a method `apple`, when `loginFailed` is called, then it throws and writes nothing.
3. Given the silent reset, when it returns, then the event list is empty.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Two companies on a failure | Omit `companyId` | Medium |
| Success before a company is chosen | Do not emit `login_succeeded` | High |

## 11. Dependencies

- **Features:** B-014 writes the line. B-007, B-008, B-009, and B-010 call this module.
- **External services / vendors:** None.
- **Design, legal, infra:** None.

## 12. Analytics

This feature is the analytics list.

- Events / funnels: the four names above.
- Properties: method, user id, company id, error class.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | In-process events through the logger, not a table | No store was named. Tables are the B-004 list | |
| 2026-09-26 | `login_succeeded` waits for `issueSession` | A token is the successful login. Company choice is still open | |
| 2026-09-26 | Omit company id when it would mean picking one | The multi-company question is open | |

## 14. Open questions

- None added. Company id on multi-company login stays omitted until that question is answered.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] No blocking question was closed by a guess
- [x] Success signal exists
- [x] Feature list row matches this file

# Feature: Membership and seats

## Metadata

| Field | Value |
| --- | --- |
| ID | B-005 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-004](../B-004-identity-records/README.md), [B-007](../B-007-access-sessions/README.md) |
| Spec readiness | Complete for the write rules that are decided |

## 1. Problem

- **Pain today:** A company cannot add a person, cap the seats, or turn off one membership without deleting the person.
- **Why now:** Login is only allowed for an active membership, and deprovision has to kill that membership's sessions.
- **Cost of doing nothing:** F-005 would invent a second set of write rules.

## 2. Audience

- **Primary user:** A person who is active at one or more companies.
- **Secondary user:** Tests, and later the company admin in F-005. There is no provisioning UI here.
- **Job to be done:** When my email is added to a company, I want one user row and an active seat, so that a later company can add another seat without cloning me.

## 3. Outcome

> When this ships, `provisionMembership` creates the user on first use and activates one seat under the company's `seat_limit`, and `deprovisionMembership` inactivates that seat and revokes only that seat's sessions.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | Two companies can share one user | Acceptance test |
| Lagging | A last-seat race has one winner | Acceptance test |
| Guardrail | No provisioning HTTP route | App route list |

## 5. Scope

### In scope (this MVP slice)

- `provisionMembership({ companyId, email })` is a function tests call. It is not an HTTP route.
- The first provision of an email inserts `users`. A later company activates `company_users` for the same user.
- Reactivating an inactive membership for that pair counts as taking a seat. It does not insert a second pair.
- An already active pair is returned as-is and does not consume another seat.
- Active rows cannot exceed `companies.seat_limit`. The company row is locked with `SELECT … FOR UPDATE` for the duration of the count and write, so two transactions racing for the last seat cannot both commit.
- Inactive rows do not count.
- `deprovisionMembership({ companyUserId })` sets `status` to `inactive`, sets `deactivated_at`, and sets `revoked_at` on sessions for that `company_user_id`. The user row stays. Other companies stay. `linked_logins` and `user_passwords` stay.
- `grantCompanyUserPermission` refuses a permission from another company. The database trigger is the backstop.

### Out of scope

- HTTP for provision or deprovision (F-005). Those paths are not named.
- Sending the invite. Direct inserts and this function do not send mail.
- Creating the company, setting `seat_limit`, or assigning admin (super-admin app and F-006).
- Choosing which membership a login uses.

### Later (not now)

- F-005 calls these functions and sends the invite.

## 6. Stories

1. As a person new to the product, I want my first company to create my user, so that I exist once.
2. As that person, I want a second company to add a membership, so that I still have one user id.
3. As a company with a full seat cap, I want the next active membership to fail, including when two writes race.
4. As a person at two companies, I want company A to be turned off without killing company B's sessions.

## 7. Experience

- **Entry points:** Tests and, later, F-005. Not a public form.
- **Happy path:** Provision email at company A. Provision the same email at company B. One user, two memberships.
- **Alternate paths:** The 31st active membership of a 30-seat company fails with class `seat_limit_reached`. Deprovision sets inactive and revokes that membership's sessions only.
- **Empty / loading / error / permission denied:** Unknown company and unknown membership are rejections. They are not login errors.
- **Copy & brand notes:** No invite is sent from this feature.

## 8. Requirements

### Must (MVP)

- One user per normalized email.
- Seat cap on the active count, safe under a concurrent last seat.
- Deprovision is a function, not a route.
- Same-company permission grant.

### Should

- Reactivation goes through the same seat check.

### Could (nice if cheap)

- None.

### Non-functional

- The seat lock is per company row, so two companies do not block each other.

## 9. Acceptance criteria

1. Given an email that has never been provisioned, when a membership is created for company A, then one user and one active membership for A exist.
2. Given that user, when company B activates the same email, then there is still one user and a second membership for B.
3. Given seat limit 30 and 30 active memberships, when another active membership is written, then the write fails.
4. Given two concurrent provisions for the last seat, when both finish, then one succeeds and one active row remains.
5. Given company A is deprovisioned and company B stays active, when sessions are checked, then A's are revoked, the user remains, and B's sessions remain.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Last seat, two transactions | Only one commit | High |
| Deprovision deletes the user | Do not | High |
| Provision sends mail | Do not | Medium |

## 11. Dependencies

- **Features:** B-004 tables. B-007 sessions are revoked by id. B-011 invite is not called.
- **External services / vendors:** None.
- **Design, legal, infra:** None.

## 12. Analytics

- Events / funnels: Provision and deprovision do not emit login events.
- Properties we will wish we had: None in this slice.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Seat check locks the company row, then counts active memberships | A single-threaded count loses the race | |
| 2026-09-26 | Functions, not routes | F-005 paths are not named | |
| 2026-09-26 | Reactivation uses the same cap | An inactive row that becomes active is an active seat | |

## 14. Open questions

- No HTTP shape for these functions. Do not add routes to close that.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Route names stay unnamed
- [x] Success signal exists
- [x] Feature list row matches this file

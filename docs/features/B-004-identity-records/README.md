# Feature: Identity records

## Metadata

| Field | Value |
| --- | --- |
| ID | B-004 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-003](../B-003-prisma/README.md), [B-005](../B-005-membership-seats/README.md), [B-006](../B-006-password-credentials/README.md) |
| Spec readiness | Complete for the columns that are decided |

## 1. Problem

- **Pain today:** There is nowhere to store a person, a company membership, a password, a provider link, or a revocable session.
- **Why now:** Every F-003 behavior reads these rows. Testers insert companies and the admin permission themselves.
- **Cost of doing nothing:** Login would invent tables that F-005 and F-006 cannot share.

## 2. Audience

- **Primary user:** The person whose `users` row is the token subject.
- **Secondary user:** A tester inserting rows, and later F-005 and F-006.
- **Job to be done:** When an email is provisioned, I want one user and one membership per company, so that deprovision can turn off one company.

## 3. Outcome

> When this ships, Prisma models and the first migration create the F-003 tables, keys, and the single-admin rule, and they do not add profile columns, two-factor columns, or keys inside `permissions.access`.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | Every record in the F-003 spec has a model | `prisma/schema.prisma` |
| Lagging | The migration matches those columns | `prisma/migrations/20260926120000_identity_records` |
| Guardrail | No quote tables, no 2FA, no invite-code table | Schema review |

## 5. Scope

### In scope (this MVP slice)

Tables: `companies`, `users`, `company_users`, `permissions`, `company_user_permissions`, `user_passwords`, `password_histories`, `linked_logins`, `sessions`, `password_resets`.

Ids are UUIDs. Timestamps are `timestamptz`. The spec's column list is the list. Tables that the spec does not give `updated_at` do not get one. That overrides the general Prisma habit of putting `createdAt` and `updatedAt` on every model.

`users.email` is unique. The application stores it normalized. The normalization is trim plus lowercase of the whole address. Plus-tags stay. Domains are not rewritten.

`company_users` is unique on `(company_id, user_id)`. `status` is `active` or `inactive`.

`permissions` is unique on `(company_id, name)`. At most one row per company has `is_admin` true. That rule is a partial unique index in the migration, because Prisma cannot express it.

`permissions.access` is nullable `jsonb`. Null means no document is stored. The code does not read keys inside it.

`company_user_permissions` is unique on `(company_user_id, permission_id)`. The permission must belong to the same company as the membership. The write path checks that, and a trigger enforces it when a caller inserts SQL directly.

`user_passwords.user_id` is unique. `linked_logins` is unique on `(provider, provider_subject)` and `provider` is `google` or `microsoft`. `sessions.token_hash` is unique. `password_resets.token_hash` is unique.

Foreign keys do not cascade deletes.

### Out of scope

- Profile columns on `company_users` (name, title, phone).
- A schema for `permissions.access`.
- Two-factor columns or tables.
- Quote domain models.
- An invite-code table.
- F-006's script that inserts the admin permission. Tests insert that row themselves. No other permission names are seeded.

### Later (not now)

- F-006 baseline scripts.
- Whatever profile columns and access keys get named later.

## 6. Stories

1. As a person at two companies, I want one `users` row, so that both memberships share my id.
2. As a company, I want exactly one admin permission, so that a custom option cannot become a second admin.
3. As a reviewer, I want `access` stored opaquely, so that unnamed keys are not invented.

## 7. Experience

- **Entry points:** Testers write rows. There is no permissions CRUD API.
- **Happy path:** A company row, a user row, an active membership, and at most one admin permission.
- **Alternate paths:** A second `is_admin` row for the same company fails. A grant whose permission belongs to another company fails.
- **Empty / loading / error / permission denied:** Not a screen in this slice.
- **Copy & brand notes:** The admin permission's name, when a test inserts it, is `admin`. This feature does not insert it automatically.

## 8. Requirements

### Must (MVP)

- Models match the spec columns.
- Unique keys and foreign keys exist.
- One `is_admin` row per company.
- Same-company grant is enforced in the write path and by a trigger.
- `access` stays opaque.

### Should

- Check constraints for membership status, provider, non-empty email, and stored email equal to lowercase trimmed email.

### Could (nice if cheap)

- None.

### Non-functional

- Ids are UUIDs. Timestamps are `timestamptz`.

## 9. Acceptance criteria

1. Given a company, when a second `is_admin` permission is inserted, then the insert fails.
2. Given a membership at company A and a permission at company B, when they are linked, then the write fails.
3. Given an arbitrary JSON value stored in `access`, when it is read back, then the value is unchanged and no code required a particular key.
4. Given the schema, when it is reviewed, then there is no 2FA column and no profile column beyond the spec.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| `prisma migrate diff` cannot see the partial index, checks, or trigger | A later diff may try to drop them. Do not apply that drop | High |
| SQL `btrim` versus JavaScript `trim` | The app normalizes with JavaScript `trim` before insert. The check stops ASCII-space and case drift on direct SQL | Low |

## 11. Dependencies

- **Features:** B-003 applies this schema. B-005 writes memberships.
- **External services / vendors:** Postgres 18.
- **Design, legal, infra:** None.

## 12. Analytics

- Events / funnels: None from table creation.
- Properties we will wish we had: None.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Column list matches the spec, including omitted `updated_at` | The spec listed the fields to create | |
| 2026-09-26 | Email normalization is trim + lowercase of the whole address | The build prompt defined the function the spec left unnamed | What does normalized mean in this build? |
| 2026-09-26 | `access` is nullable jsonb with no keys defined | The shape is an open question. Null does not invent an empty schema | |
| 2026-09-26 | Partial unique index for one admin | Prisma cannot express the predicate. The migration still enforces it | |
| 2026-09-26 | Trigger plus a transaction check for same company | The spec asked for both when a constraint is possible | |

## 14. Open questions

- Extra `company_users` columns. Not added.
- Keys inside `permissions.access`. Not defined.
- Where a company edits its permission catalog. No API added.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Open questions above stay open
- [x] Success signal exists
- [x] Feature list row matches this file

# Feature: Prisma integration

## Metadata

| Field | Value |
| --- | --- |
| ID | B-003 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-002](../B-002-local-postgres/README.md), [B-004](../B-004-identity-records/README.md) |
| Spec readiness | Complete for this slice |

## 1. Problem

- **Pain today:** There is no schema toolchain, so tables would be hand-maintained SQL that can drift.
- **Why now:** F-003 says Prisma is the source of the tables, and `pg` is the driver.
- **Cost of doing nothing:** A second schema would appear the first time someone wrote SQL by hand.

## 2. Audience

- **Primary user:** A developer generating the client and applying migrations.
- **Secondary user:** Feature code that needs a Postgres connection.
- **Job to be done:** When I have a `DATABASE_URL`, I want one Prisma client on the `pg` driver, so that feature code does not open a second ORM.

## 3. Outcome

> When this ships, `prisma/schema.prisma` and `prisma.config.ts` are the Prisma entry points, and `createPrismaClient` connects with `pg` through `@prisma/adapter-pg`.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | Config points the CLI at the schema and `DATABASE_URL` | `prisma.config.ts` |
| Lagging | The client factory uses `pg.Pool` | `src/db/client.js` |
| Guardrail | No second ORM, and no database URL with a made-up name | Code review |

## 5. Scope

### In scope (this MVP slice)

- Prisma ORM 7.10.0, the latest stable release on 2026-09-26.
- The npm `latest` tag that day was `8.0.0-rc.17`, a release candidate. This build does not use the release candidate.
- `@prisma/client` 7.10.0 and `@prisma/adapter-pg` 7.10.0.
- `pg` 8.23.0. The pool is created in this repo and passed to `PrismaPg`.
- `prisma.config.ts` holds the datasource URL. The schema file does not.
- Generator `prisma-client`, output `src/generated/prisma`, ESM, TypeScript. That output uses runtime namespaces, which Node's type stripper cannot execute. `tsx` loads it. Generated code is not committed.
- Migrations live in `prisma/migrations`. Applying them is documented and not part of writing this code.

### Out of scope

- A hosted database.
- `prisma db seed` and the F-006 script runner.
- Editing generated client files.

### Later (not now)

- Revisit Prisma 8 after it is a stable release.

## 6. Stories

1. As a developer, I want Prisma to own the schema, so that migrations come from the models.
2. As a developer, I want the SQL driver to be `pg`, so that the stack table stays true under Prisma 7's adapter.

## 7. Experience

- **Entry points:** `npx prisma generate`, then `npx prisma migrate deploy` once `DATABASE_URL` is set.
- **Happy path:** `createPrismaClient(databaseUrl)` returns a client and the pool.
- **Alternate paths:** An empty URL throws. It does not fall back to a local default URL.
- **Empty / loading / error / permission denied:** Not a product screen.
- **Copy & brand notes:** None.

## 8. Requirements

### Must (MVP)

- Latest stable Prisma, not the 8.0 release candidate.
- `pg` is the driver on the connection.
- URL comes from `DATABASE_URL` only.

### Should

- Document generate and migrate in the README. Do not document a production deploy.

### Could (nice if cheap)

- None.

### Non-functional

- Do not log the connection string.

## 9. Acceptance criteria

1. Given `DATABASE_URL` is empty, when `createPrismaClient` is called, then it throws and does not connect.
2. Given the schema datasource, when it is read, then it names the provider `postgresql` and does not embed a URL.
3. Given `package.json`, when dependencies are read, then Prisma 7.10.0 and `pg` are both present, and no other ORM is.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| `migrate diff` drops SQL-only constraints | Do not apply that diff. See B-004 | High |
| Generated client is TypeScript | Start and test through `tsx` | Medium |

## 11. Dependencies

- **Features:** B-002 supplies Postgres. B-004 supplies models.
- **External services / vendors:** None.
- **Design, legal, infra:** `DATABASE_URL` must be set by the operator before generate-time CLI commands that need a URL, and before migrate.

## 12. Analytics

- Events / funnels: None.
- Properties we will wish we had: None.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Prisma 7.10.0 instead of 8.0.0-rc.17 | Latest stable, not a release candidate | |
| 2026-09-26 | Explicit `pg.Pool` plus `PrismaPg` | Prisma 7 has no built-in engine; `pg` stays the driver | |
| 2026-09-26 | `tsx` loads the generated client | Node cannot execute the generated runtime namespaces | |

## 14. Open questions

- **Q: Local connection values?** Still open. The client refuses to invent a URL.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] The URL question stays open
- [x] Success signal exists
- [x] Feature list row matches this file

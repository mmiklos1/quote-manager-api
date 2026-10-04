# Feature: Local Postgres

## Metadata

| Field | Value |
| --- | --- |
| ID | B-002 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-001](../B-001-service-scaffolding/README.md), [B-003](../B-003-prisma/README.md) |
| Spec readiness | Complete for this slice |

## 1. Problem

- **Pain today:** There is no local database for membership rows.
- **Why now:** Testers create companies, users, and memberships by writing Postgres.
- **Cost of doing nothing:** Every later auth test would depend on a hosted database.

## 2. Audience

- **Primary user:** A developer running Postgres on this machine.
- **Secondary user:** None. This is not a customer-facing feature.
- **Job to be done:** When I need the F-003 tables, I want a local Postgres I start myself, so that no production database URL is committed.

## 3. Outcome

> When this ships, Docker Compose can start official Postgres 18.4 once the operator fills in a user, password, database name, and host port. Those four values ship blank.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | `docker-compose.yml` exists and has no default database name | File review |
| Lagging | README tells the operator how to start it | `README.md` |
| Guardrail | No filled `.env` and no production URL | `.gitignore` |

## 5. Scope

### In scope (this MVP slice)

- Docker Compose for Postgres only.
- Image pin `postgres:18.4` (latest stable major on 2026-09-26; 19 was still beta). The data volume is `/var/lib/postgresql`, which is the path the official 18 image persists.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT` are required and have no defaults. Compose fails if they are empty.
- `.env.example` lists those names with empty values.

### Out of scope

- Choosing the database name, user, password, or port.
- A second database, a hosted database, or a production deploy.
- A public certificate for local Postgres.

### Later (not now)

- Whatever database name the team actually wants. Fill `.env` locally. Do not commit it.

## 6. Stories

1. As a developer, I want Postgres in Docker, so that I can insert the rows F-003 tests require.
2. As a reviewer, I want the connection values blank in git, so that an example URL is not mistaken for a decision.

## 7. Experience

- **Entry points:** `docker compose up -d` after `.env` is filled locally.
- **Happy path:** The container starts with the operator's own names. Prisma uses `DATABASE_URL`, which the operator builds from those names. This repo does not show a sample URL, because a sample would pick a database name.
- **Alternate paths:** Empty variables make Compose refuse to start.
- **Empty / loading / error / permission denied:** Not a product screen.
- **Copy & brand notes:** None.

## 8. Requirements

### Must (MVP)

- Local database is Postgres in Docker.
- Connection values are environment variables.
- `.env.example` says the values are unset on purpose.

### Should

- Pin the image tag so "latest" cannot move the major version under us.

### Could (nice if cheap)

- None.

### Non-functional

- Do not commit `POSTGRES_PASSWORD` or `DATABASE_URL`.

## 9. Acceptance criteria

1. Given a fresh clone, when `.env.example` is read, then database name, user, password, and port are empty.
2. Given those variables are unset, when Compose interpolates them, then it errors instead of substituting a name.
3. Given the compose file, when it is read, then the only service is Postgres.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Someone commits a real `.env` | `.gitignore` excludes `.env` | High |
| Postgres 18 volume path | Mount `/var/lib/postgresql`, not the old `/var/lib/postgresql/data` | Medium |

## 11. Dependencies

- **Features:** B-003 reads `DATABASE_URL`.
- **External services / vendors:** Docker, official `postgres` image.
- **Design, legal, infra:** None.

## 12. Analytics

- Events / funnels: None.
- Properties we will wish we had: None.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Image `postgres:18.4` | Reproducible latest stable major. This does not choose the database name | |
| 2026-09-26 | No default user, database, password, or port | Those values are an open question | |

## 14. Open questions

- **Q: Local Postgres connection values?** Still open. See `TODO-questions.md`.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] The connection-value question stays open on purpose
- [x] Success signal exists
- [x] Feature list row matches this file

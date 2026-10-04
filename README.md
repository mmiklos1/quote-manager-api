# Quote Manager API

Auth backend for Quote Manager (Apollo Media Group, LLC). This repo is the sibling of `../quote-manager`. It issues access tokens for provisioned emails. It does not serve the mobile app, and it does not provision companies over HTTP.

Product behavior that is still unnamed is listed in `TODO-questions.md`. Feature notes are in `docs/FEATURE_LIST.md`.

## Stack

- Node.js 26.10.0 (Current). `package.json` requires `>=26.10.0`.
- Express 5.2.1
- `pg` 8.23.0, used by Prisma's Postgres adapter
- Prisma ORM 7.10.0 (latest stable; the 8.0 npm tag was a release candidate and is not used)
- Local Postgres 18.4 in Docker

The generated Prisma client is TypeScript and uses runtime namespaces. Node's built-in type stripper cannot run those files. `npm test` loads them with `tsx`. `npm start` does not open the database.

## Local setup

Do not commit a filled `.env`. Copy `.env.example`. Local Postgres is database `quote_manager_db`, user `user`, password `postgres`, port `5432`.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Local `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT` are already set in the example
4. `DATABASE_URL` in the example points at that local database
5. Set `PORT` to the TCP port you want this process to listen on. Port 8080 is not a requirement. The Flutter app's `API_BASE_URL` is a client setting.
6. Set `JWT_SIGNING_KEY` to a secret of at least 32 characters
7. Start Postgres: `docker compose up -d`
8. Generate the client: `npx prisma generate`
9. Apply migrations: `npx prisma migrate deploy`
10. Start the API: `npm start`

HTTPS is required wherever this API is hosted. Terminate TLS at the host. This process speaks HTTP. Local Postgres does not need a public certificate. There is no production deploy in this repo.

`POST /api/v1/login` and `POST /api/v1/authenticate` are the names the client will use. They are not mounted. Their JSON is an open question. Until that is decided, tests call the functions in `src/`.

## Tests

`npm test` runs unit tests and `test/db/acceptance.test.js`.

The database file needs `DATABASE_URL`, a migrated Postgres, and a generated client. It inserts its own rows. It does not go through an admin UI. It was not executed as part of writing this repo.

## What is not in this repo

- F-004 two-factor authentication
- F-005 provisioning HTTP API and the invite send
- F-006 company activation scripts
- Quote models, billing, Apple, Facebook, SMS, passkeys, SCIM
- Changes to `../quote-manager`

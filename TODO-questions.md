# Open questions

These are unanswered on purpose. Do not close them by guessing a payload, route, lifetime, domain, column, or company-selection rule.

The product spec is `../quote-manager/docs/features/F-003-auth-backend.md`. This build implemented the slices that do not depend on the blanks.

## From the spec

1. **When an email is active at two companies, what does one login return?**
   - `issueSession` requires a `companyUserId`. `verifyPasswordLogin` and `completeProviderAuthentication` return every active membership and do not create a session. They do not pick a company, including when only one membership is active.
   - Analytics omits `companyId` when more than one membership is active, and reset events omit it always.

2. **How does a user set their first password?**
   - Reset runs only when `user_passwords` already has a row.
   - There is no enrollment function in `src/`. Tests that need a hash insert `user_passwords` and a history row with `hashPassword`. That helper is not a product flow.

3. **Password-reset token lifetime, and the API paths for request and confirm.**
   - No route was added. `/api/v1/forgot-password` was not invented.
   - `requestPasswordReset` requires the caller to pass an absolute `expiresAt`. There is no default duration. A test fixture date is not the product lifetime.
   - Confirm rejects a row whose `expires_at` is at or before now. That honors the stored timestamp. It does not choose how far ahead the timestamp should be.

4. **Request and response JSON for `/api/v1/login` and `/api/v1/authenticate`.**
   - Both paths respond 404. They are not registered.
   - Function return values (`{ result: 'accepted' }`, membership lists, the raw token from `issueSession`) are for tests. They are not a public JSON contract.

5. **What are `${domainName}` and `${TLD}`, and what URL is `${link}`?**
   - `inviteFromAddress({ domainName, tld })` and `inviteBody({ companyName, link })` take those values as arguments.
   - No domain, TLD, store URL, or deep link is stored in the repo.
   - The invite is not sent.

6. **Reset email wording.**
   - The mail body is only the string returned by the caller's `renderLink`. No sentence was added. The invite sentence is not reused.
   - Subject and From are also caller arguments. The spec did not name them. No product subject or From address was chosen.
   - Reset From is not assumed to be the invite mailbox.

7. **Extra columns on `company_users`.**
   - Not added. No name, title, or phone.

8. **What is inside `permissions.access`?**
   - The column is nullable jsonb. Null means no document is stored.
   - Code does not read or require keys. Callers can store any JSON value and get it back unchanged.

9. **Where does a company create and edit its own permission options?**
   - No permissions CRUD API. Tests insert the one admin row themselves. F-006 is not implemented.

10. **Local Postgres connection values (database name, user, port).**
    - `.env.example` lists `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, and `DATABASE_URL` with empty values.
    - Docker Compose errors if those Postgres variables are empty. No sample URL is documented.

11. **Clock-skew tolerance on the 1-week expiry.**
    - None. JWT verify uses `clockTolerance: 0`. A session is expired when `expires_at <= now`.

## Leftovers from this build

These are implementation gaps the spec did not answer. They are not decisions.

12. **HTTP status codes for auth rejections.**
    - The JSON shape `{ error: { code: "rejected", class } }` is an implementation choice, documented in `docs/features/B-012-rejection-errors/README.md`.
    - Unknown paths use status 404 with class `not_found`. That is ordinary HTTP, not an auth status.
    - No auth route is mounted, so no 401/400/409 mapping was published.

13. **Whether this API runs the OAuth redirect.**
    - The finish function takes `provider`, `providerSubject`, `email`, and `emailVerified` after some other code has already learned those facts.
    - No Google or Microsoft authorize URL, token URL, scope list, or redirect URI is hardcoded.
    - `createPkcePair` returns `state` and an S256 verifier. Nothing persists them. No callback route is registered. Where `state` and the verifier would be stored is unnamed.
    - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, and `MICROSOFT_CLIENT_SECRET` are blank env names. Nothing sends them to a provider.

14. **Bind address.**
    - The spec does not say which interface to listen on. `app.listen(port)` uses Node's default. `PORT` has no default.

15. **Reset token consumption on a bad new password.**
    - A mismatch, a rule failure, or a reused password does not set `used_at`. The spec requires a second submit after success to fail, and it requires a bad password to leave the current hash unchanged. It does not say a typo consumes the link. This build leaves the link usable until a success or until `expires_at`.

16. **SQL-only constraints versus Prisma diff.**
    - The partial unique index for one admin, the status and provider checks, the normalized-email check, and the same-company trigger are in `prisma/migrations/20260926120000_identity_records/migration.sql`.
    - Prisma's schema cannot express them. A later `migrate diff` may try to drop them. Do not apply that drop.

17. **JavaScript `trim` versus SQL `btrim`.**
    - The application normalizes with `String.prototype.trim` and `toLowerCase` before insert.
    - The database check uses `lower(btrim(email))`, which only strips ASCII spaces. Values written by the application already match. Direct SQL that uses other whitespace is not fully covered by that check.

18. **Prisma and Node pins that are not product decisions.**
    - Node.js 26.10.0 Current, not the 24.x LTS line.
    - Prisma 7.10.0, not Prisma 8.0.0-rc.17.
    - Postgres image `postgres:18.4`.
    - Password hash Argon2id with the parameters in `src/passwords/hash.js`.
    - JWT HMAC-SHA256. Claims are `sub`, `iat`, and `exp` only. Company context stays on the session row.
    - A space counts as a special character, because it is not a letter and not a number.

19. **No analytics table and no log table.**
    - Events go through the JSON logger. The spec names events and forbids a vendor. It does not name a store. Adding tables would invent columns outside the identity records.

20. **Invite subject.**
    - The spec says the subject is not decorated and does not give the subject string. No subject constant was added.

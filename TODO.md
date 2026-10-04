# F-003 build todo — quote-manager-api

This file is the build prompt for the auth backend. It is the only file that should exist from the handoff. Do not treat it as permission to invent product behavior that the spec left blank.

**Source spec:** `../quote-manager/docs/features/F-003-auth-backend.md`  
**Spec status when this list was written:** Draft. Spec readiness is incomplete. Blocking open questions have empty defaults.  
**Product:** Quote Manager. Company: Apollo Media Group, LLC. App display name: **Quote Manager**. Mobile bundle id: `com.quotemanager.app`. Dart package: `quote_manager`.  
**This repo:** `quote-manager-api`, sibling of `../quote-manager` (the Flutter app).  
**Last aligned with the spec:** 2026-09-26.

## How to use this file

You are building this API repo. Work the checklist from top to bottom. The sections after the checklist are the requirements. They repeat the spec on purpose so you do not have to guess from a short bullet.

Rules for this build:

- Implement only what is written below as decided.
- Where a subsection is marked **Open question — do not invent**, do not pick a payload, route, lifetime, domain, column, or company-selection rule. Leave that slice unfinished, name the question in a short `docs/OPEN_QUESTIONS.md` (or at the bottom of this file as you go), and keep going on slices that do not depend on it.
- Do not implement F-004, F-005, or F-006. Notes on those features are here only so you do not build them "while you are here."
- Do not edit the Flutter app in `../quote-manager`.
- Do not log passwords, password hashes, raw access tokens, or reset links.
- Do not commit OAuth client secrets, the JWT signing key, or a production database URL.
- Testers create companies, users, and memberships by writing Postgres rows. There is no public registration and no provisioning HTTP API in this slice.

---

## Checklist

### Repo and local database

- [ ] Create the Node.js service in this repo (not inside the Flutter repo).
- [ ] Use the latest stable Node.js, Express, and the `pg` driver.
- [ ] Use the latest Prisma for the schema and for migration files. Prisma is the source of the tables. Do not maintain a second hand-written schema that can drift.
- [ ] Add Docker for local Postgres. Connection values (database name, user, port) are an open question. Wire them through environment variables. Ship a `.env.example` that lists the variable names and says the values are unset on purpose. Do not commit a filled `.env`.
- [ ] HTTPS is required wherever this API is hosted. Local Docker does not need a public certificate.
- [ ] Document how to start Postgres, run migrations, and start the API. Do not document a production deploy.

### Schema

- [ ] Add Prisma models and the first migration for every table in [Records](#records).
- [ ] Enforce the unique keys, foreign keys, and the single admin permission per company described there.
- [ ] Enforce the seat cap in the write path: active `company_users` for a company cannot exceed `companies.seat_limit`. A concurrent pair of writes for the last seat must leave only one success.
- [ ] Do not add profile columns on `company_users` (name, title, and so on). That list is an open question.
- [ ] Do not define keys inside `permissions.access`. The column exists. Its JSON shape is an open question. Treat the value as opaque.
- [ ] Do not add two-factor columns or tables.

### Identity rules (no HTTP required to prove these)

- [ ] One `users` row per email. Email is unique and stored normalized. The spec says "normalized" and does not define the function. Use trim plus lowercase of the whole address, and document that as the normalization used by this build. Do not strip plus-tags, do not rewrite domains, and do not accept a second row for the same normalized email.
- [ ] The `users` row is created the first time that email is provisioned. A later company does not insert a second user. It activates a `company_users` row for that company.
- [ ] Deprovision sets that `company_users.status` to `inactive`, sets `deactivated_at`, and revokes sessions whose `company_user_id` is that row (`revoked_at` set). The `users` row stays. Other companies for that email stay as they are. Their sessions keep working.
- [ ] Implement deprovision as a function tests can call. Do not expose a provisioning or deprovisioning HTTP route. Those routes are F-005 and are not named yet.
- [ ] Login, Google, and Microsoft succeed only when the email already has at least one **active** membership. Unknown email, bad password, inactive membership, or an unverified provider email is rejected. Do not create a user on a failed login.
- [ ] Passwords are stored only as hashes. Current hash lives on `user_passwords`. There is no `user_passwords` row until a password has been set. Previous hashes live on `password_histories`. Reject reuse of any of the last 5 hashes, including the current one.
- [ ] Password rules: 8 or more characters, at least one number, at least one special character. A special character is a character that is not a letter and not a number.
- [ ] The spec does not name the hash algorithm. Use a slow adaptive password hash. Do not use a raw SHA-256 or similar fast hash. Record the algorithm and its parameters next to the code that hashes.

### Tokens and sessions

- [ ] A successful login issues an access token. Lifetime is 1 week from **that** login. A later login gets a new token whose expiry is 1 week from the new login, not from the first one.
- [ ] The token subject is `users.id`.
- [ ] Store only `sessions.token_hash`. Never store the raw token.
- [ ] Each session row points at `user_id` and `company_user_id`. `expires_at` is 1 week after the login that created the row. `revoked_at` is null while the session is usable.
- [ ] The spec mentions a JWT signing key, so sign the access token as a JWT and keep the signing key out of git. Validation still has to check the session row. A valid signature is not enough.
- [ ] Validation rejects a token that is missing, expired, forged, revoked, or whose `company_users.status` is not `active`. The resolved user is the token's user, not a user id supplied by the client.
- [ ] Clock-skew tolerance is an open question. Do not add a grace window. Reject when `expires_at` has passed.
- [ ] Which membership a login uses when the email is active at two companies is an open question. Do not pick "the first company," "all companies," or "ask the client" as if the spec said so. Build session creation so it requires a `company_user_id`, and do not choose that id inside login until the question is answered.

### HTTP surface that is named

- [ ] `POST /api/v1/login` — email + password. No username field. No self-serve create.
- [ ] `POST /api/v1/authenticate` — used when the backend must finish a Google or Microsoft login. Google and Microsoft may instead complete at the provider. Both are allowed by the spec. This route is the backend finish path.
- [ ] If this API runs the OAuth redirect, the callback uses `state` and PKCE.
- [ ] Provider login accepts the licensed email only when that provider says the email is verified. If it is unverified, or it is not the licensed address, reject and do not write `linked_logins`.
- [ ] A user may have a password and a Google or Microsoft link on the same `users` row. One email at two companies is one user and two memberships, even if one company uses a password and the other uses a provider.
- [ ] `linked_logins.provider` is `google` or `microsoft`. Unique `(provider, provider_subject)`. `provider_subject` is the stable id from that provider, not the email.
- [ ] Request and response JSON for both routes is an open question. Do not invent the body. You may implement the login and authenticate **functions** and cover them with tests that call the functions. Do not publish a guessed JSON schema as if F-002 could rely on it.
- [ ] Client paths are supposed to live in one JSON file on the client, joined to `{BACKEND_API_URL}`. That file is a client concern. Do not add it to the Flutter app from this repo. The two starting paths are `/api/v1/login` and `/api/v1/authenticate`.

### Password reset

- [ ] Reset mail is sent only when `user_passwords` has a row for that user.
- [ ] If there is no password hash, the request fails silently: no email, and the response must not reveal that the email is unknown or that no password exists. Do not emit a distinct analytics event for that case.
- [ ] When a hash exists, store a `password_resets` row with `token_hash` (not the raw token) and `used_at` null. The email contains a link. Wording beyond "here is the link" is an open question. The invite template further down is **not** the reset email.
- [ ] The link opens a page that asks for a new password and a confirm field. They must match. The new password must meet the rules and must not match any of the last 5 hashes. On success, replace `user_passwords.password_hash`, append history, and set `used_at`.
- [ ] A second submit of the same reset token is rejected. The current hash stays as it was after the first success.
- [ ] Token lifetime, the request path, and the confirm path are open questions. Do not invent `/api/v1/forgot-password` or a web page URL. Implement the send and confirm **functions** and test them directly until those paths are named.
- [ ] How a user sets a **first** password is an open question. Reset is only for an existing hash. Do not add a "set initial password" flow.

### Invite copy (do not send it)

- [ ] This slice does not send the provisioning invite. F-005 will send it later. Direct database inserts used to test F-003 do not send mail.
- [ ] Keep the copy in one place in this repo so F-005 does not rewrite it. Subject is not decorated. Body, exactly:

  `Your company ${companyName} has provisioned you an account on ${AppName}. Please click this link to open the app and sign in. ${link}.`

- [ ] `AppName` is the configured app name, **Quote Manager**. `companyName` is `companies.name`.
- [ ] Sender is `provisioning@${domainName}.${TLD}`. `${domainName}`, `${TLD}`, and the URL for `${link}` are open questions. Do not invent a domain or a store URL. Leave the placeholders.
- [ ] The link opens the installed app, otherwise the App Store or Play Store. It is not a one-time login code and it does not create a session. There is no invite-code table.

### Errors, logs, analytics

- [ ] Login failures the spec calls out (unknown email, bad password, inactive membership, unverified provider email) are rejections. Use one consistent error shape the client can map later. The spec does not name the status codes or the error strings. Pick one shape, document it as an implementation choice, and use it everywhere except the silent reset.
- [ ] The silent reset is the exception: it must not use a distinct code that means "no password on file."
- [ ] Structured events, if you emit any: `login_succeeded`, `login_failed`, `password_reset_requested`, `password_reset_completed`.
- [ ] Allowed properties: method (`google`, `microsoft`, `password`), user id, company id on the membership, error class.
- [ ] Never put passwords, hashes, raw tokens, or reset links in logs or events.
- [ ] Do not add a third-party analytics product. Do not emit `login_succeeded` from the Flutter app; that app does not authenticate yet.

### Tests that match the acceptance criteria

Write tests that fail if the behavior changes. Seed rows directly. Do not go through an admin UI.

- [ ] An email that has never been provisioned, when a membership is created for company A, produces one `users` row and one active `company_users` row for A.
- [ ] When company B then activates that same email, there is still one `users` row and a second `company_users` row for B.
- [ ] Company A with `seat_limit` 30 and 30 active memberships rejects another active membership. A race on the last seat allows only one winner.
- [ ] An email with no active membership is rejected by password login and by Google or Microsoft, and no `users` row is created.
- [ ] An active membership plus a password hash: password login returns a token that expires in 1 week and resolves to that user. (If the HTTP JSON shape is still blocked, assert this on the function that issues the token, and say so in the test name.)
- [ ] Google or Microsoft returning that same verified email resolves to the same `users.id`.
- [ ] A second successful login gets a new expiry 1 week from the second login.
- [ ] Deprovision company A, leave company B active: A's sessions are rejected, the `users` row still exists, B's sessions still work.
- [ ] A user with a password hash can request a reset, and the confirm path requires a new password and a matching confirm. Assert the mail send was attempted. Do not assert a guessed URL.
- [ ] A new password shorter than 8 characters, or with no number, or with no special character, or matching any of the last 5 hashes, is rejected and the current hash is unchanged.
- [ ] A user with no password hash: reset sends no email and does not reveal the missing hash.
- [ ] A missing, expired, forged, or revoked token, or a token whose membership is inactive, is rejected.
- [ ] A token for user A resolves to user A only.

### Explicitly do not build

- [ ] No sign-up, no "create account," no username.
- [ ] No provisioning UI and no provisioning HTTP API (F-005).
- [ ] No super-admin UI. Creating a company, setting `seat_limit`, and assigning the company admin is a sibling application. This slice is tested by inserting rows.
- [ ] No F-006 activation scripts yet. Those scripts will live in this repo later. Until then, tests insert the company and its single admin permission themselves. Do not invent the rest of the company baseline.
- [ ] No two-factor authentication, no second prompt, no company 2FA setting (F-004). A company that has not turned 2FA on must be able to finish F-003 login with no extra step. Do not add the setting "just in case."
- [ ] No billing. `seat_limit` is a column a super admin has already set.
- [ ] No quote domain models.
- [ ] No Sign in with Apple, Facebook, SMS, passkeys, or SCIM.
- [ ] No second product app. This API is the token issuer so another app can be added later.
- [ ] No Flutter changes, including replacing the `hello` stub. That wiring happens when the mobile work is asked for.
- [ ] No base-URL screen inside a product UI. Until then the client is specified to read `BACKEND_API_URL` from env. See the mismatch note below.

---

## What this feature is

There is no backend identity today. A provisioned email cannot sign in, and a company cannot turn off one membership without deleting the person. The same email must be able to belong to more than one company.

When this ships, a person whose rows were inserted in Postgres, and who has an **active** membership, can sign in with Google, Microsoft, or a password, receive an access token that lasts one week, and reset that password by email when a password hash already exists. Deprovisioning one membership kills only that company's sessions and leaves the user row in place.

Primary user: a person with an active membership at one or more companies.  
Secondary user: future apps that must accept the same user id. Company admins and super admins do not get a UI in this feature.

Success looks like this:

- Password login, Google, Microsoft, and password reset each complete against a seeded membership.
- A valid access token resolves to that user id and that company membership.
- Unknown emails, inactive memberships, and revoked sessions get no access.

---

## Stack (decided)

| Piece | Choice |
| --- | --- |
| Repo | `quote-manager-api`, next to `../quote-manager` |
| Runtime | Latest stable Node.js |
| HTTP | Express |
| SQL driver | `pg` |
| Local database | Postgres in Docker |
| Schema and migrations | Latest Prisma |
| Token | JWT (a signing key is required by the spec) plus a `sessions` row so the token can be revoked |
| Secrets | Environment only. Not committed |

Do not add a second web framework, an ORM besides Prisma, or a hosted database for local development.

---

## Records

Minimum columns. These are the Prisma fields to create. Timestamps are `timestamptz`. Ids are UUIDs.

### companies

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| name | text | `${companyName}` in the invite |
| seat_limit | int | Maximum `company_users` rows with `status = active` |
| created_at | timestamptz | |

### users

One row per email. Deprovision never deletes this row.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key. This is the token subject |
| email | text | Unique, normalized |
| is_super_admin | boolean | Global. Not a per-company role. Default false |
| created_at | timestamptz | Set on first provision of this email |

`is_super_admin` is not a company role. Do not create a second user row to represent a company.

### company_users

This row is the license, the per-company profile anchor, and the seat. Extra profile fields are an open question. Do not add them.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| company_id | uuid | FK → companies |
| user_id | uuid | FK → users |
| status | text | `active` or `inactive` |
| created_at | timestamptz | |
| deactivated_at | timestamptz | Null while active. Set on deprovision |

Unique `(company_id, user_id)`. The seat check counts rows with `status = active`.

### permissions

The catalog of permission options for one company. Each company has its own rows. Companies add their own options. They do not invent a second admin.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| company_id | uuid | FK → companies |
| name | text | Unique per company |
| is_admin | boolean | True only for the automatic admin permission. Default false |
| access | jsonb | Opaque. Shape is an open question. Do not invent keys |
| created_at | timestamptz | |

Unique `(company_id, name)`.

The admin row is inserted when the company is created (that job is F-006, later): `name` is **admin**, `is_admin` is true. Exactly one `is_admin` row per company. This F-003 build does not have to ship the F-006 script runner. Tests that need an admin permission insert that one row themselves. Do not seed other permission names.

### company_user_permissions

Which of that company's options this membership has.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| company_user_id | uuid | FK → company_users |
| permission_id | uuid | FK → permissions. Must belong to the same company as the membership |

Unique `(company_user_id, permission_id)`. The same email can hold company A's admin permission and a different permission that company B defined. Granting the admin permission is what makes that user the company admin. Enforce "same company" in the write path. A database constraint is appropriate if you can express it; a transaction check is required even if you cannot.

### user_passwords

Absent until they set a password. SSO-only users have no row here.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | Unique FK → users |
| password_hash | text | Current hash only |
| updated_at | timestamptz | |

### password_histories

The last 5 hashes, including the current hash.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| password_hash | text | |
| created_at | timestamptz | |

When a new password is saved, the current hash is the newest history row and older rows beyond 5 for that user are not required to be deleted by the spec. The rule is "reject reuse of any of the last 5." Keep at least those 5. Comparing against more than 5 is not required. Do not accept a password that matches any of those 5.

### linked_logins

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| provider | text | `google` or `microsoft` |
| provider_subject | text | Stable id from that provider |

Unique `(provider, provider_subject)`.

### sessions

Exists so a one-week token can be killed on deprovision.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| company_user_id | uuid | FK → company_users. Revoke these rows when that membership is deprovisioned |
| token_hash | text | Raw token is not stored |
| expires_at | timestamptz | 1 week after the login that created it |
| revoked_at | timestamptz | Null while usable |
| created_at | timestamptz | |

### password_resets

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| token_hash | text | Raw reset token is not stored |
| expires_at | timestamptz | Lifetime is an open question. Do not pick one |
| used_at | timestamptz | Null until the new password is saved |

No invite-code table. The provision link does not sign anyone in.

---

## Login behavior (decided)

Entry points for a human tester are seeded Postgres rows. The app will eventually call `POST /api/v1/login` or `POST /api/v1/authenticate`. It does not do that today. See [Flutter app today](#flutter-app-today).

### Password

Email plus password must match the stored hash, and the email must have at least one active membership. The API then issues an access token that expires in 1 week. The client will store it later. There is no username.

A Gmail or Microsoft user may also have a password on that same user row. Password login and provider login are both attached to that one user.

### Google and Microsoft

The provider must return the licensed email as verified. Same token rule as password. If the email is unverified or is not the licensed address, reject and do not link the provider subject.

Buttons in the product are **Google**, **Microsoft**, and **Login with password**. A domain may be both providers. Do not hide Microsoft behind a flag. Apple and Facebook are out of scope.

### Who may sign in

Only an email that was provisioned and still has an active membership. There is no public registration. A stranger cannot create an account by calling login.

### Deprovision

Set that membership to `inactive`. Revoke sessions for that `company_user_id` only. Do not delete `users`. Do not revoke the other company's sessions. Do not remove `linked_logins` or `user_passwords` as part of deprovision. The spec does not say to.

### Seat cap

`companies.seat_limit` is the max count of `company_users` with `status = active` for that company. The example in the spec: a 31st active membership for a 30-seat company must fail. Inactive rows do not count. The check has to hold under a concurrent write, not only in a single-threaded test.

This slice does not include the admin UI that would hit the cap. The data rule still has to exist, because tests and later F-005 both rely on it.

---

## Password reset behavior (decided)

Happy path: a password hash exists. The API emails a reset link. The link opens a page with a new password and a confirm field. They must match. The new password meets the rules and is not one of the last 5. The hash is replaced. `password_resets.used_at` is set. Replaying the token fails.

SSO-only user (no `user_passwords` row): do not send mail. Fail silently. Do not tell the caller that no password was set.

The page and the mail are required by the acceptance criteria. The URL, the token lifetime, and the HTTP paths are not. Build the functions. Do not publish guessed routes.

---

## Invite (defined here, sent later)

F-005 sends this. F-003 does not.

Body, with no extra decoration:

`Your company ${companyName} has provisioned you an account on ${AppName}. Please click this link to open the app and sign in. ${link}.`

- `AppName` = **Quote Manager**
- `companyName` = `companies.name`
- Sender = `provisioning@${domainName}.${TLD}`
- `${link}` opens the app if it is installed, otherwise the App Store or Play Store
- The link is not a one-time code and does not create a session

`${domainName}`, `${TLD}`, and the concrete `${link}` are open. Keep the sentence as the template.

---

## Flutter app today

Do not change this app while building the API. This is context so you do not "finish" login in the wrong repo.

Repo: `../quote-manager`.

- F-001 and F-002 are already in that repo. Cold start is splash, then a login screen.
- The login screen shows **Google**, **Microsoft**, and **Login with password**. Password view has Email, Password, **Sign in**, **Forgot password**, and **Back**.
- Google, Microsoft, and Forgot password do nothing. **Sign in** does not call an API. It opens a blank page whose only text is `hello`.
- Local env in the Flutter app is `.env`, loaded with `flutter_dotenv`. The committed example sets `API_BASE_URL=http://localhost:8080`.
- F-003's spec says the client reads `BACKEND_API_URL`, and that paths live in one client JSON file: `{BACKEND_API_URL}/api/v1/login` and `{BACKEND_API_URL}/api/v1/authenticate`.
- Those two names are not the same variable. Do not rename the Flutter env from this repo, and do not assume the API's listen URL must be `API_BASE_URL`. The mobile wiring is a later change in `../quote-manager`.
- Branding JSON for the app is `assets/config/app_config.json` (`appName`, colors, `logoAsset`, footer). The API does not serve that file.
- On an Android emulator, `localhost` is the emulator, not the host machine. The Flutter README tells a developer to use `http://10.0.2.2:8080` when an API is running on the PC. That is a client note, not a decision that this API must bind to port 8080. The listen port is not specified. Do not treat 8080 as a product requirement.

F-002 will later replace `hello` with the real post-login page and will call this API. That is not part of the API repo's first build.

---

## Related features you must not implement

### F-004 — two-factor authentication

Not this slice. It is a later per-company setting with two modes: require a second factor before the app can be used, or a restricted mode for members who have not enrolled. The rule is per company, not global. A company with the feature off stays on plain F-003 login. Do not add the column, the prompt, or the policy table.

### F-005 — license provisioning interface

Later UI for a company admin to provision and deprovision emails. Only a membership that holds that company's admin permission (`permissions.is_admin`) may do it. On provision: create `users` if needed, then activate `company_users`. On deprovision: inactive membership, revoke that membership's sessions, do not delete the user. Send the invite email defined above. Reject when the seat cap is full. An admin of company A cannot provision for company B.

Until F-005 exists, provisioning is tested by writing the F-003 tables directly, and those writes do not send the invite. API paths for provision and deprovision are not named. Do not add them.

### F-006 — activate company

Later SQL scripts in **this** repo that load a company's baseline. The only known baseline row is the admin permission: `permissions.name` = `admin`, `permissions.is_admin` = true, exactly one per company. Do not seed stand-in roles. Which other scripts run, who starts a run, and what a failed or repeated run does are all open. Do not write that runner in this F-003 build. Do not invent a second admin row.

The super-admin application that creates a company, sets `seat_limit`, and assigns the company admin is a sibling app. It is not this API and not the Flutter app.

---

## Open questions — do not invent

Each of these is unchecked in the spec. The "default if unanswered" line is empty. Leaving them blank was intentional.

1. **When an email is active at two companies, what does one login return?**  
   Sessions are per membership so deprovision can kill one company. The token still needs a company context. Do not choose a company for the user.

2. **How does a user set their first password?**  
   Reset is only for an existing hash. Login with password has nothing to check until a hash exists. Do not add an enrollment flow.

3. **Password-reset token lifetime, and the API paths for request and confirm.**  
   Only `/api/v1/login` and `/api/v1/authenticate` are named. Reset needs routes in the same client JSON file, and those routes are not named yet.

4. **Request and response JSON for `/api/v1/login` and `/api/v1/authenticate`.**  
   F-002 cannot call these from a shape you make up. Implement the functions. Do not freeze a public JSON contract.

5. **What are `${domainName}` and `${TLD}`, and what URL is `${link}`?**  
   Sender is `provisioning@${domainName}.${TLD}`. The link must open the app or the correct store listing. Do not pick a domain or a store URL.

6. **Reset email wording.**  
   Invite copy is fixed. Reset copy is not. Sending a link is required. Decorating the sentence is not.

7. **Extra columns on the per-company profile (`company_users`).**  
   Only the membership columns above are specified. Do not add name, title, or phone.

8. **What is inside `permissions.access`?**  
   The column is jsonb. The keys are not named. Store what you are given and do not invent a schema.

9. **Where does a company create and edit its own permission options?**  
   No screen or API is named. The admin permission itself is created by F-006, not by the company. Do not add a permissions CRUD API.

10. **Local Postgres connection values (database name, user, port).**  
    Docker and Prisma need a URL. Do not commit a production secret. Do not pretend a local database name was chosen. Use env vars and an example file with the values blank.

11. **Clock-skew tolerance on the 1-week expiry.**  
    Do not add a skew window. Compare against `expires_at`.

The spec's own blocked list, in its words: which company a multi-company login enters, how the first password is set, reset routes and token lifetime, login/authenticate payloads, the provisioning mailbox domain, and the invite/store link.

---

## Analytics and logging (decided)

Events: `login_succeeded`, `login_failed`, `password_reset_requested`, `password_reset_completed`.

Properties: method (`google`, `microsoft`, `password`), user id, company id on the membership, error class.

Never log passwords, hashes, raw tokens, or reset links. Do not emit a distinct event for the silent SSO-only reset if that event would reveal that no password exists.

No vendor is named. Do not add one.

---

## Suggested module split

This is a way to keep the work reviewable. It is not a product decision. Rename if you already have a layout, as long as the behavior above stays intact.

- `prisma/schema.prisma` and `prisma/migrations/` — tables in [Records](#records)
- Docker compose for Postgres only
- Password hashing, password rules, and last-5 check
- Membership and seat-cap writes, including deprovision
- Session issue and session validate
- Provider verification (verified email, no user create on failure, `linked_logins`)
- Reset token create, silent no-hash path, confirm and history update
- Invite template constant, unused by a sender
- HTTP: only the two named routes, and only after their JSON is specified. Until then, tests call the functions
- Tests listed in the checklist

---

## Done when

- The checklist items that are not blocked by an open question are implemented and covered by tests.
- Every open question above is still unanswered in code. None of them have been "closed" by a guess.
- `../quote-manager` is unchanged.
- F-004, F-005, and F-006 are not implemented.
- A reader can start local Postgres from the notes in this repo without a production secret in git.

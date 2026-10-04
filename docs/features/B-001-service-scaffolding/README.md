# Feature: Service scaffolding

## Metadata

| Field | Value |
| --- | --- |
| ID | B-001 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-002](../B-002-local-postgres/README.md), [B-008](../B-008-password-sign-in/README.md), [B-009](../B-009-provider-sign-in/README.md) |
| Spec readiness | Complete for this slice |

## 1. Problem

- **Pain today:** `quote-manager-api` had no process a later login call could reach.
- **Why now:** F-003 puts the API in this repo, beside the Flutter app.
- **Cost of doing nothing:** Auth behavior would have nowhere to live except the mobile repo.

## 2. Audience

- **Primary user:** A developer starting the API on this machine.
- **Secondary user:** Later product clients that will call this process.
- **Job to be done:** When I have set the environment, I want a Node process to listen, so later routes have a host.

## 3. Outcome

> When this ships, `npm start` boots an Express process on the port in `PORT` and answers unknown paths with the shared rejection shape. It does not expose login.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | The process module and Express app exist | `src/server.js`, `src/app.js` |
| Lagging | A developer can see how to start it | `README.md` |
| Guardrail | The Flutter app is not edited, and no product route is mounted | `POST /api/v1/login` is not registered |

## 5. Scope

### In scope (this MVP slice)

- Node.js 26.10.0 (Current, the latest stable release on 2026-09-26). The Active LTS line that day was 24.x. This repo follows the spec's "latest stable Node.js", which is the Current line.
- Express 5.2.1.
- ESM (`"type": "module"`).
- `dotenv` loads a local `.env` that is not committed.
- Listen port comes only from `PORT`. There is no default, and 8080 is not assumed. The Flutter app's `API_BASE_URL` is a client setting and is not this process's bind port.
- HTTPS is required wherever the API is hosted. This process speaks HTTP. The host terminates TLS. Local Postgres does not need a public certificate. There is no production deploy document.

### Out of scope

- Login, authenticate, reset, and provisioning routes.
- Choosing a bind address. `listen(port)` uses Node's default (all interfaces). See `TODO-questions.md`.
- Production hosting, certificates, and a reverse proxy config.

### Later (not now)

- Mount `POST /api/v1/login` and `POST /api/v1/authenticate` after their JSON is specified.

## 6. Stories

1. As a developer, I want a Node and Express process in this repo, so that F-003 is not built inside the Flutter app.
2. As an operator, I want the listen port to come from the environment, so that a client note about port 8080 is not treated as an API requirement.

## 7. Experience

- **Entry points:** `npm start` after the variables in `.env.example` are filled locally.
- **Happy path:** The process logs `api_listening` and the port. It does not log secrets.
- **Alternate paths:** If `PORT` is missing or not a TCP port, the process throws before it listens.
- **Empty / loading / error / permission denied:** Any path, including the two named auth paths, responds 404 with the B-012 JSON shape and class `not_found`.
- **Copy & brand notes:** App display name used later by the invite is Quote Manager. This process does not serve `app_config.json`.

## 8. Requirements

### Must (MVP)

- Runtime and HTTP library are the ones in the F-003 stack table.
- Secrets are read from the environment only.
- `.env.example` lists names and leaves values empty.
- No product route is registered.

### Should

- `x-powered-by` is disabled.

### Could (nice if cheap)

- None.

### Non-functional

- Do not log passwords, hashes, raw tokens, or reset links.
- Do not commit `.env`.

## 9. Acceptance criteria

1. Given `PORT` is unset, when the server entry runs, then it throws and does not choose 8080.
2. Given any URL, when it is requested, then the response is 404 and the body uses the rejection shape.
3. Given the two named auth paths, when they are requested, then they are 404, because their JSON is not specified.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Flutter `API_BASE_URL` says port 8080 | This API does not adopt that port | High |
| Host has no TLS | Production is out of spec; local HTTP is allowed | Medium |

## 11. Dependencies

- **Features:** None inside the product. B-012 supplies the 404 body.
- **External services / vendors:** None.
- **Design, legal, infra:** Node.js 26.10.0.

## 12. Analytics

- Events / funnels: None from process start.
- Properties we will wish we had: None.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Node.js 26.10.0 Current, Express 5.2.1, ESM | Latest stable runtime and the required HTTP library | Backend stack |
| 2026-09-26 | No default listen port | The spec does not name one | |
| 2026-09-26 | Auth routes stay unmounted | Request and response JSON are an open question | |

## 14. Open questions

Inherited. See `TODO-questions.md`. This slice adds none that it then answers.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Blocking questions for this slice are deferred in `TODO-questions.md`
- [x] Success signal exists
- [x] Feature list row matches this file

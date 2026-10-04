# Feature: Provisioning invite copy

## Metadata

| Field | Value |
| --- | --- |
| ID | B-011 |
| Status | Implemented |
| MVP | Yes |
| Priority | P0 |
| Owner | |
| Last updated | 2026-09-26 |
| Related features | [B-005](../B-005-membership-seats/README.md) |
| Spec readiness | The sentence is decided. The domain and the link are not. |

## 1. Problem

- **Pain today:** The provision email sentence exists only in the spec, so F-005 would rewrite it.
- **Why now:** F-003 owns the copy. F-005 will send it later.
- **Cost of doing nothing:** A sender would invent a domain and a store URL.

## 2. Audience

- **Primary user:** A person who will later receive the provision mail.
- **Secondary user:** F-005, which must import this sentence instead of restating it.
- **Job to be done:** When my company provisions me, the mail should use the agreed sentence, so that the app name and the company name are the only filled-in product words.

## 3. Outcome

> When this ships, one module renders the spec sentence and the sender address pattern, and nothing in this repo sends that mail.

## 4. Success

| Type | Metric or signal | Target |
| --- | --- | --- |
| Leading | The body matches the spec character for character once names are filled | Unit test |
| Lagging | No mailer imports the template | Code review |
| Guardrail | Domain and link have no defaults | `inviteFromAddress` throws if they are empty |

## 5. Scope

### In scope (this MVP slice)

- App name is **Quote Manager**.
- Body, exactly:

  `Your company ${companyName} has provisioned you an account on ${AppName}. Please click this link to open the app and sign in. ${link}.`

- `companyName` is the caller's company name (`companies.name` when F-005 has it).
- Sender pattern is `provisioning@${domainName}.${tld}`.
- `${domainName}`, `${tld}`, and `${link}` are arguments. There is no default domain, TLD, store URL, or deep link.
- The link is not a one-time code and this module does not create a session. There is no invite-code table.
- Provisioning in B-005 does not call this module.

### Out of scope

- Sending the message.
- Choosing the domain, TLD, or store URL.
- A subject line. The spec says the subject is not decorated, and it does not give the subject text. No subject constant is invented.
- Reset mail. That wording is a different open question.

### Later (not now)

- F-005 sends `inviteBody` and `inviteFromAddress` after the domain and the link exist.

## 6. Stories

1. As F-005, I want the sentence in one function, so that I do not paraphrase it.
2. As a reviewer, I want a missing domain to throw, so that a real mailbox is not assumed.

## 7. Experience

- **Entry points:** A future mailer. Not this slice.
- **Happy path:** `inviteBody({ companyName, link })` returns the sentence. `inviteFromAddress({ domainName, tld })` returns the sender.
- **Alternate paths:** Empty company name, link, domain, or TLD throws a programmer error.
- **Empty / loading / error / permission denied:** Not a screen.
- **Copy & brand notes:** The sentence is not decorated. App name is Quote Manager. Company is the membership's company, not Apollo Media Group. Apollo is the footer on the phone, not this sentence.

## 8. Requirements

### Must (MVP)

- One copy module.
- Exact body.
- Sender pattern with placeholders supplied by the caller.
- Do not send.

### Should

- Export the app name from that same module so a second string does not drift.

### Could (nice if cheap)

- None.

### Non-functional

- None beyond not sending.

## 9. Acceptance criteria

1. Given company name `Acme` and a link, when the body is rendered, then it equals the spec sentence with those substitutions and app name Quote Manager.
2. Given a domain and a TLD, when the sender is rendered, then it is `provisioning@` plus those two labels separated by a dot.
3. Given this repo is searched for a mailer that sends the invite, then none exists.

## 10. Edge cases and risks

| Case or risk | What should happen | Severity |
| --- | --- | --- |
| Someone uses the invite sentence as the reset mail | Do not. Reset body is the link alone | High |
| A store URL is hardcoded | Do not | High |

## 11. Dependencies

- **Features:** F-005 will send it. B-005 must not.
- **External services / vendors:** A mailbox at `provisioning@…`, later.
- **Design, legal, infra:** Domain and store listings are open.

## 12. Analytics

- Events / funnels: None. Sending is not this feature.
- Properties we will wish we had: None.

## 13. Decisions

| Date | Decision | Why | Open question it closed |
| --- | --- | --- | --- |
| 2026-09-26 | Copy lives in `src/invite/template.js` and is not sent | F-003 owns the words. F-005 owns the send | |
| 2026-09-26 | No subject constant | The spec did not provide subject text | |

## 14. Open questions

- **Q: `${domainName}`, `${TLD}`, and `${link}`?** Arguments only. No defaults.

## 15. Spec readiness

- [x] Problem, audience, and outcome are written
- [x] In-scope MVP and out-of-scope are listed
- [x] At least one story has testable acceptance criteria
- [x] Happy path and primary error states are described
- [x] Domain and link stay open
- [x] Success signal exists
- [x] Feature list row matches this file

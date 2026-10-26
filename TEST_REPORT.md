# Verification report — 2026-10-26

Final result: TypeScript and 16 automated API/risk/persistence tests passed. The four Chromium browser tests passed in the prior run. Two user-approved live Llama 3.3 requests succeeded through the Cloudflare REST API using the production chat handler and a REST adapter for AI.run. The native Wrangler AI binding remains blocked by missing workers.dev onboarding. Nothing was deployed. Exactly two potentially billable inference requests were made; actual billed cost was not inspected.

## Environment and setup

- Node.js 22.21.1; npm 10.9.4; Wrangler 4.153.0.
- Installed dependencies and Chromium; added a dependency lockfile for reproducibility.
- Final dependency installation/audit reported zero vulnerabilities.
- Applied both local D1 migrations successfully, including the 12-shipment/12-inventory seed and the follow-up uniqueness constraint.
- Started Wrangler with `npx wrangler dev --local --ip 127.0.0.1 --port 8787`.
- Local app: http://127.0.0.1:8787 . D1 and assets are local; Wrangler reports AI as unsupported in this local-only session.
- The sandbox initially blocked registry DNS and local sockets. Dependency installation, migration, server and test commands were rerun with approved access.

## Passed coverage

| Area | Verified |
| --- | --- |
| TypeScript | Application, risk tests, integration tests and browser test source compile with `npm run typecheck` |
| GET /api/health | Service/model metadata, successful response, no-store header |
| GET /api/dashboard | Seed totals, inventory, shipment risk ordering, KPIs, task ordering and counts beyond the 100-task display limit |
| POST /api/scan | Scan creation, alert upserts without duplicates, audit records, delivery resolves alerts, subsequent delay reopens alerts |
| POST /api/shipments/:id/status | All five allowed statuses, unknown shipment and invalid status errors, risk recalculation |
| POST /api/followups | Creation, invalid/unknown shipment errors, duplicate conflict, recreation after completion, five simultaneous requests produce one creation and four conflicts |
| POST /api/followups/:id/complete | Completion, repeated completion and missing task errors |
| GET /api/chat/history | Session validation, isolated histories, chronological ordering, most recent 12 messages |
| POST /api/chat | Malformed/non-object/missing JSON, session/message validation, access-code gating, both supported response formats, structured database errors |
| Mock AI integration | Exact Llama 3.3 model identifier, snapshot grounded in shipment data, previous conversation supplied to model, successful exchanges persisted, empty/error responses return 503 without adding failed exchanges |
| Routing | Asset delegation, unknown endpoints, unsupported methods, OPTIONS rejection |
| Risk rules | On-time, overdue/critical/low-stock escalation, delivered suppression, UTC calendar days, unknown inventory |
| Desktop browser | Four views, KPIs, shipment rows, search/no-results, status and risk filters, modal open/close, status save, both backend workflow and visible risk-scan results, inventory, follow-up create/complete |
| Persistence | Shipment updates, tasks and scans survive page reload against real local Wrangler/D1; chat rows survive separate handler requests against isolated D1 |
| Chat browser | Suggested prompt, access-code storage, safe literal rendering of script-like model text, restore-on-reload and 503 recovery; all successful chat/history browser responses are mocks |
| Mobile browser | 390×844 viewport: navigation, search, shipment details, modal close |

The desktop workflow test also asserts there are no uncaught browser JavaScript errors. Browser tests exercise real local D1 writes for shipments, scans and tasks. The isolated API tests use ephemeral D1 and a mocked AI binding. Browser chat restoration uses a fixture, while actual chat database persistence is checked separately in the API integration suite.

## Fixes

1. Await the chat handler inside the router's try/catch. Previously malformed chat JSON or database failures could reject outside the API error boundary instead of returning structured JSON errors.
2. List open follow-ups before completed rows. Previously completed rows sorted first and could push open work out of the 100-row display limit.
3. Count open tasks with a separate database aggregate. Previously the KPI counted only the displayed subset. The task view now labels its limited list as rows shown.
4. Enforce one open follow-up per shipment with a partial unique index and conflict-safe insertion. Previously concurrent creation requests could both pass the pre-insert duplicate check. The migration preserves old rows, marking any extra pre-existing open duplicates done before creating the constraint.
5. Add Node test typings so the original TypeScript check can compile its tests. Align the documented/package Node requirement with the installed Wrangler/Miniflare requirement of Node 22+.
6. Replace the unverified sidebar claim “AI ENGINE ONLINE” with “AI COPILOT”. No inference health is implied by the dashboard loading.
7. Add repeatable API/D1 and browser regression suites, browser configuration, lockfile, and ignored generated test artifacts.

## Remaining limitations

- **The native Wrangler AI binding remains unverified.** Cloudflare login succeeded, but the live dev server could not establish its remote AI proxy because the account has no workers.dev subdomain. Complete Workers onboarding before testing the normal dashboard-to-native-binding path. The two successful live checks instead used a real REST adapter around the production chat handler; this does not make the existing local-only dashboard chat live. Both approved inference requests have now been used.
- Hosted D1/deployment remains untested. The configured database ID is still the local placeholder; no remote migrations or deployment were performed.
- Existing demo limitations remain: shared shipment/task data and unauthenticated operational write endpoints; chat session IDs separate histories but are not authentication. This testing does not constitute a production security audit.
- Browser verification used Chromium desktop and a mobile viewport, not physical devices, Firefox or WebKit.
- Browser runs retain local scan audit entries and completed test follow-ups. They restore the shipment's prior status; they do not erase audit history. Ephemeral integration-test records do not enter the local development database.

## Reproduce

```bash
npm ci
npx playwright install chromium
npm run db:local
npm run check
npm run test:browser
```

The browser suite reuses an existing local server on port 8787, or starts local-only Wrangler automatically. `npm run check` runs TypeScript followed by 16 API/risk/persistence tests; `npm run test:browser` runs four browser/local-HTTP tests. Successful AI calls in both suites are mocks, so passing these commands does not verify live AI availability.

## Approved live verification — completed with REST transport

The user authorized up to two potentially billable inference requests and completed Cloudflare device login. The account's model catalog request returned HTTP 200 and listed `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

Wrangler startup correctly showed D1/assets local and AI remote, but Cloudflare rejected the remote proxy session because no workers.dev subdomain is registered. No account subdomain was created and nothing was deployed. To test the model without that proxy, the verifier imported the actual production `src/index.ts` handler and supplied an AI.run adapter that sent its unchanged model identifier and input to Cloudflare's real REST endpoint. AI responses were not mocked during these two calls. The database was an isolated local D1 seeded from the application's migration.

| Live request | Provider result | Model output check | Usage | Provider latency |
| --- | --- | --- | --- | --- |
| 1: status and risk of SHP-2401 | HTTP 200, success true | Correctly reported delayed, Toronto CA, risk score 100, 3 days overdue, stock 2 against reorder point 10 | 1,409 input + 102 output tokens | 4,007 ms |
| 2: which shipment were we discussing? | HTTP 200, success true | Correctly recalled SHP-2401 and Toronto CA; captured model input includes the first user/assistant exchange | 1,536 input + 23 output tokens | 806 ms |

Total provider-reported usage: **2,945 input tokens + 125 output tokens = 3,070 tokens**. These are usage records, not a statement of the amount billed. Exactly two live inference requests were made, with no inference retries.

The production handler persisted both successful exchanges, and its history endpoint returned the exact four messages. The first harness restart check failed because Miniflare 5's compatibility converter ignored the older `d1Persist` option and used temporary storage. This was a harness configuration mistake. The original failure is retained in the evidence file.

The harness was corrected to use `resourcePersistencePath`. The captured answers were then replayed locally through the handler, with **zero additional inference requests**. After disposing and recreating the D1 runtime, all four messages were present and matched exactly. This corrected replay is a separate offline persistence check; it is not another live end-to-end inference run. A new automated regression test, `tests/persistence.test.ts`, also verifies chat history across a D1 runtime restart with a mocked answer. `npm run check` passed all 16 tests after this addition.

Raw evidence: [live-ai-verification.json](live-ai-verification.json), including timestamps, complete provider responses, Cloudflare request identifiers, token usage, both prompts and answers, the original harness failure, and the successful offline persistence recheck. No credentials are stored in that artifact.

Cloudflare documents the direct inference route in its [REST API guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/). This test leaves application source and its normal Workers AI binding configuration unchanged; the REST adapter was used only in the temporary verification harness.

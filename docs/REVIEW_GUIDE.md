# Reviewing InfraFlow AI

InfraFlow AI is a fictional data-center hardware logistics copilot built for the Cloudflare AI application assignment. The core workflow is: identify shipment risk, inspect the supporting data, create a human follow-up, and ask a data-grounded question.

## Assignment mapping

| Component | Implementation | Source |
| --- | --- | --- |
| LLM | Llama 3.3 70B on Workers AI, using `env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', ...)` | [Worker chat handler](../src/index.ts) |
| Workflow / coordination | Worker routes run deterministic risk scans, upsert/resolve alerts, track scan runs, update shipment status, and create/complete follow-ups | [Worker routes](../src/index.ts), [risk rules](../src/risk.ts) |
| User input | Browser chat with suggested prompts, loading/error states and conversation restoration | [Browser application](../public/app.js), [HTML](../public/index.html) |
| Memory / state | D1 tables for shipments, inventory, alerts, follow-ups, scan audit records and session chat history | [Schema and seed](../migrations/0001_init.sql), [follow-up constraint](../migrations/0002_unique_open_followup.sql) |

Workers coordinate the workflows directly. The project does not claim to use the separate Cloudflare Workflows product. The chat UI is served as Worker static assets; Pages and voice input are not required for this implementation.

## Five-minute local walkthrough

Use Node.js 22 or later:

```bash
npm ci
npm run db:local
npm run dev -- --local
```

1. Open the URL Wrangler prints. The overview starts with 12 fictional shipments and 12 inventory records.
2. Run a risk scan. Open **Risk intelligence** to inspect alert reasons, inventory shortages and the scan audit trail.
3. Open **Shipments**, search for `SHP-2401`, and inspect its details.
4. Create a follow-up, open **Follow-up tasks**, and mark it done.
5. Change a delayed shipment to **Delivered**, run a new scan, and inspect its resolved alert and updated risk. Reload the page to check persistence.

The local-only command deliberately disables remote AI. See the README's live AI setup to enable the normal chat connection. Chat has no tool permissions to mutate shipment/task data or send external messages.

## What was actually verified

- TypeScript and 16 automated API/risk/persistence tests passed.
- Four Chromium tests exercised desktop/mobile interactions, local HTTP APIs and mocked browser chat.
- Two real Llama 3.3 requests returned HTTP 200 with provider-reported token usage. The app's actual chat handler supplied its D1 context and prior conversation to a temporary REST adapter.
- The first answer matched the shipment's status, destination, score, overdue days and stock. The second recalled the prior shipment.
- The original same-runtime history matched all four messages. A corrected offline replay and an automated test verified persistence across a D1 runtime restart.

The account's missing `workers.dev` subdomain blocked Wrangler's native remote AI proxy. That path and hosted deployment remain unverified. This limitation is separate from the successful live REST inference. Details and the original harness failure are retained in [TEST_REPORT.md](../TEST_REPORT.md) and [live-ai-verification.json](../live-ai-verification.json).

## Automated checks

```bash
npm run check
npx playwright install chromium
npm run db:local
npm run test:browser
```

Automated checks use mocked AI responses and do not consume inference quota. Browser tests operate on the local development database and retain scan/task audit history. See [screenshots](SCREENSHOTS.md) for captured local UI views.

## Scope

This is a portfolio prototype with synthetic data. Its operational write endpoints are shared and unauthenticated; session IDs are not user authentication. Risk scoring is deterministic. There are no carrier, email, procurement or autonomous external integrations. These constraints are explicit in the README rather than presented as production capabilities.

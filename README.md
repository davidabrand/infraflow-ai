# InfraFlow AI

**Cloudflare-native logistics operations copilot powered by Llama 3.3 on Workers AI.**

A deployable portfolio application for managing *fictional* global data center hardware shipments. It combines a dashboard, deterministic risk analysis, a persistent relational database, human-approved workflow actions, and conversational analysis grounded in recorded shipment data.

> **Disclaimer:** This is an independent portfolio demonstration. Not affiliated with Cloudflare or any logistics provider. Shipment records, vendors, inventory, ETAs and operational scenarios are synthetic.

## Reviewer quick start

This repository implements the four components of the Cloudflare AI application assignment: Workers AI, Worker-based coordination, browser chat, and D1 memory. All shipment and inventory records are synthetic.

- **Validation:** TypeScript, 16 automated API/risk/persistence tests, and four Chromium browser tests passed. See [the test report](TEST_REPORT.md).
- **Real inference:** Two approved Llama 3.3 calls succeeded through Cloudflare's REST API using the production chat handler with a REST adapter. See [the captured responses and usage](live-ai-verification.json).
- **Current limitation:** The native Wrangler AI connection has not been verified because the test account still needs a `workers.dev` subdomain. No hosted application has been deployed. The REST verification is not presented as a deployed dashboard demo.
- **Project guide:** [Assignment mapping and review walkthrough](docs/REVIEW_GUIDE.md).

![InfraFlow AI operations overview, captured from local Wrangler with synthetic D1 data](docs/screenshots/overview.png)

## Four required AI components

| Assignment requirement | Implementation |
|---|---|
| LLM | Meta **Llama 3.3 70B** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) invoked using `env.AI.run()` |
| Workflow / coordination | **Cloudflare Worker** routes, risk-scan orchestration (`/api/scan`), persisted alert upserts, and follow-up creation and completion |
| Chat / voice | Responsive **chat UI** with suggested prompts and persisted multi-turn context |
| Memory / state | **Cloudflare D1** persistent tables for shipments, inventory, alert history, follow-ups, scan runs and per-session chat memory |

## Screens and features

- **Operations overview:** total/active/delivered/at-risk KPIs, risk signals, pipeline distribution, recent shipments.
- **Shipment tracker:** interactive search, filters, shipment details, simulated status changes.
- **Risk intelligence:** explainable severity scores based on overdue days, reported carrier delays, stock thresholds, and criticality. Scans persist alerts and audit entries.
- **Follow-up workflow:** staff can create and complete a follow-up for a shipment, without fabricated integrations or autonomous external actions.
- **AI copilot:** Cloudflare-hosted Llama 3.3 answers logistics questions using a live snapshot of synthetic database records and recent session history. Model can recommend follow-ups, but cannot mutate state through chat.

## Requirements

- Node.js 22+ and npm
- Cloudflare account with Workers AI enabled (inference can be billable, including when using `wrangler dev`)
- Wrangler login and D1 database for hosted deployment

## Local setup

```bash
npm ci
npm run db:local
npm run dev -- --local
```

Open the URL printed by Wrangler (typically `http://localhost:8787`).

**Important:** The `wrangler.jsonc` D1 `database_id` is an all-zero placeholder **for local prototyping only**. Local `wrangler d1 migrations apply ... --local` uses local storage. Replace it with a real Cloudflare database ID for remote deployment.

The command above runs the dashboard, scans, inventory, task queue and API with local D1 and remote bindings disabled. It is suitable for reviewing the app without making inference calls. Chat cannot generate live answers in this mode.

To enable real AI after reviewing Cloudflare usage charges:

1. Run `npx wrangler login`.
2. Complete Workers onboarding and register your account's `workers.dev` subdomain if Wrangler requests it.
3. Stop the local-only server, then run `npm run dev` (without `--local`). D1 stays local; the AI binding connects to Cloudflare.
4. Send a message from the Copilot panel. Each live message can incur Workers AI usage charges.

The supplied AI binding already targets Workers AI; you do not need an external LLM key. The optional `.dev.vars.example` documents the app's demo access-code setting.

## Deploy to Cloudflare

1. Log in:
   ```bash
   npx wrangler login
   ```
2. Create the hosted D1 database:
   ```bash
   npx wrangler d1 create infraflow-db
   ```
3. Copy the `database_id` returned by Cloudflare into `wrangler.jsonc`, replacing the all-zero placeholder. Keep `binding: "DB"` and `database_name: "infraflow-db"`.
4. Apply the seed migration to the hosted database:
   ```bash
   npm run db:remote
   ```
5. **Recommended before public deployment:** Protect LLM spending by requiring a private demo access code:
   ```bash
   npx wrangler secret put DEMO_ACCESS_CODE
   ```
   Then enter the code via the **⚙** icon in the application's Copilot panel. This gates the `/api/chat` inference endpoint only; it is a simple demo guard, not an enterprise authentication system. For public demonstrations, additionally configure Cloudflare WAF rate limits and proper access controls as appropriate.
6. Deploy:
   ```bash
   npm run deploy
   ```
7. Verify `/api/health`, `/api/dashboard`, run a risk scan, and send an AI chat message on the deployed `*.workers.dev` URL.

### Troubleshooting

- **Tables missing?** Run `npm run db:local` or `npm run db:remote` as appropriate before opening the dashboard.
- **Remote proxy requires a subdomain?** Complete Workers onboarding under Cloudflare **Workers & Pages** and register your `workers.dev` subdomain, then restart `npm run dev`.
- **AI replies with 503?** Ensure your Cloudflare account is logged in, Workers AI is available for that account, and quotas/payment settings permit inference.
- **AI replies with 401?** If you configured `DEMO_ACCESS_CODE`, enter that value with the Copilot ⚙ button. It is stored in browser session storage rather than in the repository.
- **Workers AI fees?** Cloudflare provides pricing/limits; review them before inviting public traffic. Llama 3.3 70B inference is not guaranteed to be free.
- **Local test commands:** `npm run check` (TypeScript, API integration and risk engine tests).

## Architecture

```text
 Browser SPA (public/index.html, app.js, styles.css)
  ├── GET  /api/dashboard ──────────→ D1: shipments, inventory, scans, alerts, tasks
  ├── POST /api/scan ───────────────→ Worker risk engine → D1 alert upserts + audit
  ├── POST /api/followups ──────────→ Worker validated task creation → D1
  ├── POST /api/shipments/:id/status → Worker demo update → D1
  ├── GET  /api/chat/history ───────→ D1 session-scoped memory
  └── POST /api/chat ───────────────→ D1 snapshot + conversation context
                                      → Workers AI (Llama 3.3 70B)
                                      → D1 append user/assistant exchange
```

The chat model does not have direct database writes or autonomous email actions. The risk engine is deterministic and has unit tests. All SQL input values use prepared statements. Browser rendering escapes user-influenced strings. Cross-origin AJAX is unsupported.

## Security and limitations

This is a **portfolio demo**, not a multi-tenant SaaS product. The shipment, inventory and task records are shared between visitors who use the same deployment, and the write endpoints are **not authenticated**. A chat session ID separates message histories but is *not* an authentication credential. Anyone with an ID could retrieve that conversation, so use fictional inputs only. Do not deploy with real customer data, trade secrets, personal information, confidential data center locations or credentials. Add per-user authentication, authorization, access policies, rate limiting and data isolation before any actual use.

The app does **not** include real carrier integrations, scheduled Workflows, an email API, actual procurement actions, or voice input. The Worker-based risk scan is triggered by a user click; it is not a scheduled cron job. Adding those capabilities would be follow-up work. The demo is intentionally constrained to the four requested components rather than pretending to be a production system.

## Verification

```bash
npm run check
```

Run the local Worker and verify the following manually:

1. Visit dashboard; confirm 12 seeded shipments and inventory data.
2. Select **Run risk scan**; audit entries and alerts should appear in Risk intelligence.
3. Open a shipment, create a follow-up, and mark it complete from Follow-up tasks.
4. Change a shipment to Delivered, run another risk scan, and confirm the risk is recalculated.
5. In Copilot ask "Which shipments need immediate attention?". A successful response requires an active Cloudflare Workers AI account and uses live D1 data.
6. Reload the page and confirm task history, scan history, shipment changes and chat context remain available.

## Submission assets

- [Review guide](docs/REVIEW_GUIDE.md) — requirement mapping, source entry points and a short walkthrough.
- [Screenshots](docs/SCREENSHOTS.md) — actual local overview, shipment tracker, risk intelligence and follow-up queue. These do not depict a hosted deployment or a live chat session.
- [Test report](TEST_REPORT.md) — passed checks, fixes, live verification method and remaining limitations.
- [Live AI evidence](live-ai-verification.json) — the two actual provider responses, usage records and conversation checks; contains synthetic data only.
- [AI assistance and prompt history](PROMPT_HISTORY.md) — development disclosure and selected prompts, not a complete conversation export.

The requested submission is this GitHub repository URL. Hosted deployment is an optional next step and requires a real D1 database ID and completed Cloudflare account setup.

## Documentation

- [Cloudflare Workers AI Llama 3.3 70B](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
- [Workers AI Wrangler setup](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)

### Automated regression tests

Use Node.js 22+ and the included lockfile:

```bash
npm ci
npx playwright install chromium
npm run db:local
npm run check
npm run test:browser
```

The browser suite starts local-only Wrangler automatically if port 8787 is available,
or reuses the local server already running there. Integration tests use a separate,
ephemeral D1 database. Browser workflow tests use the local development database:
they retain completed test tasks and scan audit entries and restore shipment status.
All successful AI calls in tests use mocks. The suites do not verify live inference
and must not be treated as evidence that Cloudflare credentials or quotas work.
A live inference check requires explicit approval because Workers AI can be billable.

See `TEST_REPORT.md` for the completed verification and remaining limitations.

# Local application screenshots

Captured from the actual application served by local Wrangler on 2026-10-26, using synthetic D1 records. No image generation or mocked dashboard data was used. No live inference requests were made for these screenshots. The Copilot is shown in its idle state; these are not screenshots of a hosted deployment.

## Operations overview

![Operations overview showing shipment KPIs and priority signals](screenshots/overview.png)

## Shipment tracker

![Shipment tracker with search, filters, status and risk columns](screenshots/shipments.png)

## Risk intelligence

![Persisted risk alerts, inventory levels and scan audit history](screenshots/risk-intelligence.png)

## Follow-up tasks

![Follow-up task history in the local development database](screenshots/followup-tasks.png)

## Reproduce

With the initialized local development server running at `http://127.0.0.1:8787`:

```bash
node scripts/capture-screenshots.mjs
```

The script may record an initial risk scan if no scan exists. It blocks chat POST requests and captures the current local data without resetting it.

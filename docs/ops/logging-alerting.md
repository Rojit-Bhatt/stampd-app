# Logging & Alerting (G12)

## What exists in code

| Component | File | Behaviour |
|---|---|---|
| Structured logger | `backend/utils/logger.js` | JSON lines: `ts, level, module, msg, ...context`. Console-only until an ingest target is attached. |
| Error tracker bridge | `backend/utils/errorTracker.js` | Sentry-shaped `captureException/captureMessage`; no-op until `SENTRY_DSN` is set, so no dependency outage in dev. |
| Cron failure alert | `server.js` cron wrapper | `runDailyTriggers` failures are logged AND emailed to `TRIGGER_FAILURE_ALERT_EMAIL` — a silent cron death is the worst outage because points expiry sweeps, report emails and digests all live there. |
| Sanity checksum | `services/checksumService.js` + `/api/platform/sanity-checksum` | Daily document-count + points-balance digest; drift = corruption signal (see `dr-runbook.md`). |

## Log levels

`LOG_LEVEL` env var (default `info`). Cron/alert noise goes to `warn` so
`error` stays actionable.

## Attaching real alerting (optional, when volume justifies)

1. Set `SENTRY_DSN` on Render — the bridge starts forwarding immediately;
   the React error boundary maps onto the same DSN.
2. Uptime check on `GET /health` (Render's own healthcheck already restarts
   a failing container; add UptimeRobot/BetterStack for an external view).
3. Route cron-failure emails through the same channel as Sentry so there is
   one on-call surface.

## What to alert on

| Signal | Threshold | Channel |
|---|---|---|
| Cron failure | any | Email (`TRIGGER_FAILURE_ALERT_EMAIL`) |
| Sanity digest drift | document count or points total moves > expected churn | Email |
| Error rate spike | > 50 errors/10min | Sentry → Slack/email |
| Container restart loop | 3 restarts in 10 min | Render healthcheck |

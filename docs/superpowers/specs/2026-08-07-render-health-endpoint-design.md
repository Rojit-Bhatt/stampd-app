# Group A — Render sleep-after-15min fix

## Problem
Render's free-tier web service sleeps after 15 minutes of inbound-traffic inactivity, causing a cold start on the next request. There is no code-level fix for this — the agreed workaround is an external cron pinging a lightweight health endpoint every ~10 minutes to keep the instance warm.

## Design
- Add `GET /health` in `backend/server.js`, mounted before tenant/auth middleware (no `resolveTenant`, no `verifyToken`).
- Handler returns `200 { status: "ok" }` synchronously — no DB round-trip needed, just confirms the Node process is alive and serving.
- No rate limiting needed (not abuse-prone, and it's the one endpoint that specifically must never sleep-gate itself).

## Operational step (outside this codebase)
After deploying to Render, the user sets up a free cron-job.org job hitting `https://<render-url>/health` every 10 minutes. This is a manual dashboard step, not something this session can do.

## Testing
Add a one-line check to an existing or new lightweight test hitting `/health` and asserting `200`.

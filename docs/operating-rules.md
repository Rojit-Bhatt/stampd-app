# Stampd Operating Rules — Lessons from the 2026-08-13 Outage

This document captures the hard lessons from the two-hour outage on
2026-08-13, when the production website silently lost its connection to the
backend and nobody (including the diagnostic work itself) noticed for two
hours. It is the project's standing playbook. Any agent or human working on
this repo MUST follow these rules.

## What happened (the root cause, for the record)

The Cloudflare worker for stampdd.club was redeployed as an assets-only
worker (no worker script), which dropped the `/api/*` proxy that forwards
browser requests to the Render backend. Every API call from the website
returned the SPA's own HTML, and every feature depending on the API failed
silently. The deployment itself reported success; the backend data was
correct; tests passed; the code was correct. The only thing broken was the
boundary between the two deployed systems.

## The rules

### 1. Verify the live boundary first, before any deep diagnosis

For ANY reported production issue, the FIRST step is a real HTTP call
against the LIVE system (`scripts/smoke-prod.js` exists for this exact
purpose). Check what the production stack actually answers, not what the
code, database, or CI says it should answer. This rule would have found the
2026-08-13 outage in 30 seconds: `curl https://stampdd.club/api/company/outlets`
returned SPA HTML instead of JSON.

Do NOT spend time on databases, code paths, migrations, or logs before this
check has been made and its result recorded. Correct data and correct code
with a failing live site point at the deployment boundary, not the data.

### 2. Never trust a deploy's own success message

A deploy finishing without errors proves only that the tooling did its job.
It says nothing about what is now running in production. Always run the
smoke test against the live site after any deployment (`scripts/smoke-prod.js`
is now invoked automatically at the end of `scripts/deploy-frontend.sh` and
in CI on pushes to main).

### 3. If it works locally but not in production, the difference is in the
###    boundary, the deployment, or the environment — not the logic

A locally-passing reproduction with a production-only failure means the
application logic is fine. The fault is one of: what is actually deployed
(stale commit, broken deploy), the environment between the components
(missing proxy/redirect/route, CORS, env vars, CDN configuration), or
environment-specific configuration (production env vars, seeds). Prioritize
these in that order.

### 4. Check what changed recently, concretely

Before theorizing, look at the actual recent changes: the last deploy
(what exactly was deployed — a worker script? assets only?), commits since
the last known-good state, environment variable changes, and infrastructure
configuration diffs (wrangler config, redirects, route rules). Guessing
starts only after these are examined.

### 5. Silent failures are the enemy — demand loud errors

Frontend features that show an empty state instead of an error hide
outages. The company console showed "0 active outlets" instead of "could
not reach the server". When an outage is discovered, raise the quality bar:
propagate real API errors to the UI (a banner or error state) so the next
outage announces itself. This is a standing improvement task (open issue).

### 6. Keep the smoke test current

`scripts/smoke-prod.js` is the contract of the production deployment. When
the deployment architecture changes (new endpoints, new proxies, new
domains), update the smoke test accordingly. CI on pushes to main fails if
the live site stops answering correctly.

## The smoke test contract

`scripts/smoke-prod.js` asserts (all must pass):

| Check | Expected | Failure signature |
|---|---|---|
| `GET /` | SPA `index.html` (200, text/html) | broken site shell |
| `GET /api/company/me` | JSON, 401/403 without token | /api proxy lost |
| `GET /api/company/outlets` | JSON, 401/403 without token | /api proxy lost |
| `GET /api/tenant` with tenant headers | 200 real tenant JSON | proxy or backend broken |
| `OPTIONS /api/*` preflight | 204 + CORS allow-origin | browsers block all calls |
| `GET {API_BASE}/health` | 200 `{"status":"ok"}` | backend down |

The JSON-vs-HTML distinction on `/api/*` is the specific failure mode of
2026-08-13 and is the most important assertion.

## Standing hygiene

Deploy tokens and passwords must never be committed (GitHub secret
scanning blocks pushes containing them; use environment variables or
repository secrets instead). Rotate any secret that was shared in chat
history (Cloudflare API token, MongoDB password). After every update,
users should hard-refresh their browsers (Ctrl+Shift+R).

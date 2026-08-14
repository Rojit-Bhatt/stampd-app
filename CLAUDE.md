# Stampd (stampdd.club)

Multi-tenant café loyalty platform: Customer Web App, Barista Admin Console, Company Console, and a public platform site (landing, pricing, Google-review QR tool). Node/Express backend, React + Vite frontend, npm workspaces (`backend/`, `frontend/`) at the repo root.

## Package managers — npm for dev/CI, pnpm for the Cloudflare build

This is intentional, not drift: `package-lock.json` (npm) is the source of truth for local dev and this repo's own CI (`.github/workflows/quality.yml`). `pnpm-lock.yaml` (root + `frontend/`) exists only because the frontend's actual production build — Cloudflare Workers Static Assets, via `wrangler deploy` — runs `pnpm install --frozen-lockfile`. pnpm's strict dependency resolution catches missing/undeclared deps that npm's looser hoisting hides (this is exactly how an undeclared `http-errors` require in `smsService.js` slipped past `npm ci` but broke the Cloudflare build). `.github/workflows/build.yml` and `deploy.yml` mirror the pnpm path specifically to catch this in CI before it reaches production.

**Rule:** any time frontend or root dependencies change, regenerate both lockfiles (`npm install` and `pnpm install`) — letting them drift is what caused the Aug 2026 build breaks.

## Production topology

- **Backend**: Render, npm, `NODE_ENV=production npm start`.
- **Frontend**: Cloudflare Workers Static Assets. `frontend/wrangler.jsonc`'s `main: worker/worker.js` is load-bearing — it proxies `/api/*` to the Render backend. Without it, wrangler deploys assets-only and every `/api` call from the browser returns the SPA's `index.html` instead of JSON (this exact bug caused a production outage — see `docs/operating-rules.md` and the "lost-bridge" post-mortem).
- Security headers (`Permissions-Policy`, CSP) are duplicated in `frontend/public/_headers` and `frontend/wrangler.jsonc` — **keep both in sync when editing either.**
- CSP ships as `Content-Security-Policy-Report-Only` by design (rollout staging, not a bug) — see the comment block in `frontend/public/_headers` before promoting it to enforcing.

## Backend data layer

MongoDB via Mongoose in production (`MONGODB_URI` required, backend refuses to boot in production without it and `JWT_SECRET`). Locally, when `MONGODB_URI` is unset and `NODE_ENV !== 'production'`, the backend falls back to an in-memory mock (`backend/utils/mockMongoose.js`) — convenient for dev, but data is ephemeral. **Known limitation:** the mock's `.populate()` only supports the `userId` path; models that need populated refs elsewhere use denormalized fields written at insert time (actor name/role copied onto audit-log rows, etc.) instead of relying on `.populate()` — follow that pattern for new models rather than assuming full Mongoose populate semantics work everywhere.

## Security posture

Session/auth hardening, MFA (TOTP, opt-in via `ENABLE_MFA`), CSP report-only, tenant audit logging, and input validation landed in three phases (`374b452`, `21c39a7`, `025d7a8`, merged in `ce2cc59`). Cloudflare Turnstile bot-protection on login/register/forgot-password was removed entirely (`4e06b2b`) because a missing-secret fatal boot was production-hostile on key rotation — rate limiting (`backend/middleware/rateLimitMiddleware.js`) is the only remaining anti-abuse control on those routes; there is currently no CAPTCHA-equivalent replacement.

`TenantAuditLog` (`backend/models/TenantAuditLog.js`) is a write-only, per-company audit ledger with no read endpoint yet — every points earn/redeem, claim fulfill, customer edit, and subscription change should call `tenantAuditService.logAction()`. It's indexed on `{companyId, sequence}`; don't remove that index, the per-write `countDocuments({companyId})` sequence assignment turns into a full collection scan without it.

## Before making changes

- Tenant isolation is load-bearing — run `npm run test:isolation -w backend` for anything touching tenant resolution, auth, or permissions.
- Frontend/backend security headers live in two places (`_headers` and `wrangler.jsonc`) — grep both before assuming a header change is complete.
- Check `docs/operating-rules.md` and `docs/bug/` before touching deploy config — several production incidents already happened here and have documented root causes.

# Stampd (stampdd.club)

Multi-tenant café loyalty platform: Customer Web App, Barista Admin Console, Company Console, and a public platform site (landing, pricing, Google-review QR tool). Node/Express backend, React + Vite frontend, npm workspaces (`backend/`, `frontend/`) at the repo root.

## Commands

```bash
npm run dev                          # backend :5001 (mock DB if MONGODB_URI unset) + frontend :3000
npm test -w backend                  # registered suites (backend/package.json "test")
npm run test:isolation -w backend    # tenant isolation — required for auth/tenant/permission changes
cd frontend && npx tsc --noEmit      # frontend "lint" is typecheck only; no frontend test runner
npm run build -w frontend
```

Backend tests are standalone node scripts (`backend/tests/*.js`, each boots its own server via `tests/helpers/bootServer`). **Register new suites in `backend/package.json` "test"** — but CI's pnpm job (`build.yml`) runs *every* `tests/*.js`, registered or not, and `csp-report-only.js` needs `frontend/dist` built first. Copy `backend/.env.example` → `backend/.env` for local dev.

## Package managers — npm for dev/CI, pnpm for the Cloudflare build

This is intentional, not drift: `package-lock.json` (npm) is the source of truth for local dev and this repo's own CI (`.github/workflows/quality.yml`). `pnpm-lock.yaml` (root + `frontend/`) exists only because the frontend's actual production build — Cloudflare Workers Static Assets, via `wrangler deploy` — runs `pnpm install --frozen-lockfile`. pnpm's strict dependency resolution catches missing/undeclared deps that npm's looser hoisting hides (this is exactly how an undeclared `http-errors` require in `smsService.js` slipped past `npm ci` but broke the Cloudflare build). `.github/workflows/build.yml` and `deploy.yml` mirror the pnpm path specifically to catch this in CI before it reaches production.

**Rule:** any time frontend, backend or root dependencies change, regenerate both lockfiles — `npm install` and `npx pnpm@9 install --lockfile-only` (CI pins pnpm 9; a newer local pnpm rewrites the lockfile format) — letting them drift is what caused the Aug 2026 build breaks. Verify with `npx pnpm@9 install --frozen-lockfile --lockfile-only` at the root and in `frontend/`. An npm `overrides` entry nested under a parent range (`"minimatch@<=3.1.5": {...}`) once leaked into unrelated versions — check `npm ls <pkg>` shows no `invalid`.

## Production topology

- **Backend**: Render service `stampd-app` (workspace "Stampd's workspace", Singapore), auto-deploys `main`, root dir `backend`, npm, `NODE_ENV=production npm start`. Served at `https://api.stampdd.club` behind Cloudflare.
- **Frontend**: `https://loyalty.stampdd.club` (the apex `stampdd.club` is the separate marketing site — `/api` there is a 404). Cloudflare Workers Static Assets, deployed on push to `main` by Cloudflare Workers Builds *and* `.github/workflows/deploy.yml` (which waits on `build.yml`'s production smoke test). `frontend/wrangler.jsonc`'s `main: worker/worker.js` is load-bearing — it proxies `/api/*` to the Render backend. Without it, wrangler deploys assets-only and every `/api` call from the browser returns the SPA's `index.html` instead of JSON (this exact bug caused a production outage — see `docs/operating-rules.md` and the "lost-bridge" post-mortem).
- Security headers (`Permissions-Policy`, CSP) are duplicated in `frontend/public/_headers` and `frontend/wrangler.jsonc` — **keep both in sync when editing either.**
- Traffic reaches Express as browser → Cloudflare → Render proxy, so `req.ip` is a Cloudflare edge IP. Rate limiters key on `CF-Connecting-IP`, trusted only from Cloudflare ranges (`clientKey` in `rateLimitMiddleware.js`) — keep that when adding limiters.
- CSP ships as `Content-Security-Policy-Report-Only` by design (rollout staging, not a bug) — see the comment block in `frontend/public/_headers` before promoting it to enforcing.

## Customer auth model

Two tokens: a **global session** (`customer_global_session`, proves the CustomerAccount; rolling — 90d of inactivity, re-issued via the `X-Session-Token` header once a day old, hard cap 365d since sign-in, revoked by `sign-out-everywhere`/password change via `revokeAllSessions`) exchanged via `POST /api/customer-auth/enter-tenant` for a **tenant JWT** (`customer_auth_token`, 7d, one membership `User` row per outlet). The tenant slot is shared across outlets. `ensureTenantSession` must never reuse an expired or other-outlet tenant JWT, and `apiRequest` recovers a customer 401 once by re-exchanging — the 2026-10 "sign in again / 0 points" incident was a reused expired tenant JWT. Never render a failed balance read as 0.

## Backend data layer

MongoDB via Mongoose in production (`MONGODB_URI` required, backend refuses to boot in production without it and `JWT_SECRET`). Locally, when `MONGODB_URI` is unset and `NODE_ENV !== 'production'`, the backend falls back to an in-memory mock (`backend/utils/mockMongoose.js`) — convenient for dev, but data is ephemeral. **Known limitation:** the mock's `.populate()` only supports the `userId` path; models that need populated refs elsewhere use denormalized fields written at insert time (actor name/role copied onto audit-log rows, etc.) instead of relying on `.populate()` — follow that pattern for new models rather than assuming full Mongoose populate semantics work everywhere.

The mock also does **not** enforce unique indexes, run TTL expiry, or apply `.lean()` semantics (lean is a pass-through), so duplicate-key, TTL and lean-defaults bugs only show up in production. `.lean()` skips schema defaults — only use it where every field read has a fallback; keep Organization/Company as full docs (they feed `resolveProgram`). `User.syncIndexes()`/`CustomerAccount.syncIndexes()` run at boot, so new indexes on those two build on deploy.

Known open issues: `DynamicQRToken`'s TTL index (`expireAfterSeconds: 30`) deletes redeem tokens long before their 180s app-level window (fixing it needs a `collMod` on production); production has no `PUSH_VAPID_*` keys, so push subscriptions break on every restart.

## Security posture

Session/auth hardening, MFA (TOTP, opt-in via `ENABLE_MFA`), CSP report-only, tenant audit logging, and input validation landed in three phases (`374b452`, `21c39a7`, `025d7a8`, merged in `ce2cc59`). Cloudflare Turnstile bot-protection on login/register/forgot-password was removed entirely (`4e06b2b`) because a missing-secret fatal boot was production-hostile on key rotation — rate limiting (`backend/middleware/rateLimitMiddleware.js`) is the only remaining anti-abuse control on those routes; there is currently no CAPTCHA-equivalent replacement.

`TenantAuditLog` (`backend/models/TenantAuditLog.js`) is a write-only, per-company audit ledger with no read endpoint yet — every points earn/redeem, claim fulfill, customer edit, and subscription change should call `tenantAuditService.logAction()`. It's indexed on `{companyId, sequence}`; don't remove that index, the per-write `countDocuments({companyId})` sequence assignment turns into a full collection scan without it.

## Before making changes

- Tenant isolation is load-bearing — run `npm run test:isolation -w backend` for anything touching tenant resolution, auth, or permissions.
- Frontend/backend security headers live in two places (`_headers` and `wrangler.jsonc`) — grep both before assuming a header change is complete.
- Check `docs/operating-rules.md` and `docs/bug/` before touching deploy config — several production incidents already happened here and have documented root causes.

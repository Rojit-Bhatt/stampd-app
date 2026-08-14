# Investigation notes — outlet switch stuck loader (internal)

## Repo state
- Repo: /home/ubuntu/stampd-app, branch: fix/outlet-switch-stuck-loader
- Live checks: scripts/smoke-prod.js = 6/6 PASS on stampdd.club + api.stampdd.club
- Recent relevant commits: e32e3b3 (sessionStale gate in CustomerLayout), 34e13ee (latestTenantRequestRef guard in CustomerAuthContext.ensureTenantSession)

## Root cause (confirmed)
CustomerLayout stays mounted across outlet-to-outlet nav. sessionStale = token JWT org id !== tenant.id → full-screen spinner. ensureTenantSession is only (re)fired by TenantSessionSync effect on [tenant?.slug, tenant?.id] — unchanged on 2nd visit → no re-fire → deadlocked spinner. Additionally the race guard can discard the newer outlet's response while the shared localStorage customer_auth_token holds the old outlet's JWT.

## Backend facts (verified by probing a live in-memory server)
- /api/points/balance scopes strictly to JWT's organizationId (from decoded JWT), ignores URL headers. Tenant-A JWT + tenant-B headers → 200 serving tenant A's own row. Verified.
- tenant-A JWT cannot be exchanged at enter-tenant for tenant B (401 invalid signature — uses global-session verification). Verified.
- Balance response shape: { success, data: { balance, lastActivityAt, expiresAt, earnPercent, pointsExpiryDays, multiplier, activeCampaign, tier } } — NO organizationId in payload.
- JWT payload claims: userId, role, organizationId, pv. Signed with JWT secret (getJwtSecret). Frontend decodeJwtPayload = atob base64url decode, display-only.
- Test helper patterns: tests/helpers/bootServer.js ({port:0} → {baseUrl, stop}), makeSiblingOutlet(baseUrl,{label}) → {outletSlug, outletId, adminToken}. Suit suites are plain CommonJS fetch, e.g. tests/global-customer-identity.js, tests/multi-tenant-isolation.js. CI runs `for f in tests/*.js; do timeout 300 node $f`.
- __test__/mint-global-token dev hook exists (POST {email, type:"email_verify"}).
- Global session token secret: JWT_GLOBAL_SECRET (different from tenant JWT secret).
- /api/points/claim requires tenant JWT (verifyToken), scopes to decoded organizationId — cross-tenant claim rejected.

## Fix plan (frontend only, backend is fine)
In CustomerAuthContext.ensureTenantSession: when a cached JWT exists whose decoded organizationId != tenantOrgId requested, do NOT use the cache — issue fresh /api/customer-auth/enter-tenant (global session is valid; only tenant JWT is wrong). This recovers the stuck state without relying on TenantSessionSync re-firing.
Keep latestTenantRequestRef guard as-is.

## Regression test
backend/tests/outlet-switch-stuck-loader.js (written, being fixed). New regression-suite file in tests/*.js gets picked up by CI automatically.

## Frontend commands
- dev: npm run dev -w frontend (or pnpm from root; local pnpm 11 broken → use npx -y pnpm@9)
- typecheck: cd frontend && pnpm exec tsc --noEmit
- build: pnpm run --filter frontend build (uncompressed outputs required)
- deploy: scripts/deploy-frontend.sh (needs CLOUDFLARE_API_TOKEN from user env/GitHub secret)
- CI: .github/workflows/build.yml — lockfile, typecheck, build, full backend suite, smoke test

## Deployment facts
Frontend CF via deploy-frontend.sh (VITE_API_BASE_URL must be set). Backend Render auto-deploy on push to main. Render free plan, no shell.

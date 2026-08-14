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

## Deployment status (2026-08-14)
PR #68 MERGED to main at 2026-08-14T04:28:36Z, squash merge commit 5df32043c76cf001c57428511375a86622088052.
Title: "fix: stuck loader when switching between outlets with a shared tenant JWT".
CI on main (build.yml) pending after merge — must confirm success INCLUDING the live production smoke test step before declaring done.
csp-report-only is a pre-existing flaky test (failed 1/10 local runs, failed once in CI on this PR — unrelated to the fix; main's previous build.yml run passed).
Local full backend suite: 69/69 pass. Frontend typecheck: only pre-existing zod 3/4 errors.
CLOUDFLARE_API_TOKEN not set in sandbox; main CI deploys frontend via wrangler + runs live smoke test (scripts/smoke-prod.js) automatically on push to main.
User confirmed merge; awaiting CI + live verification.
Live endpoints: https://stampdd.club, https://api.stampdd.club. Smoke script: node scripts/smoke-prod.js (env SITE/API_BASE).

## Follow-up bug report (2026-08-14, user recording analysis)
Recording analysis: user opens Magic Cups (points 60.01, bronze card, chess tournament event) fine, goes back to Discover, taps Cafe Coffeesarowar card — but the opened page shows header "Magic Cups" and ALL Magic Cups content (60.01 pts, same featured picks). NO stuck spinner this time; the page renders immediately with the OLD outlet's token/data.

KEY FINDING from deployed bundle (https://stampdd.club/assets/index-BVIV1jNE.js, verified live):
The DEPLOYED customer ensureTenantSession ALREADY contains the fix:
  L=async(q,G)=>{const te=G||q; if(v.current=te, localStorage.getItem("customer_global_session")){const oe=I(),ve=oe?zp(oe):null,_e=ve?.organizationId||null; if(!(!_e||_e!==G)){ /* cached JWT matches -> reuse */ u(oe),w(!1);return } w(!0); POST enter-tenant ... } ...}
So the fix IS deployed. The failure must be elsewhere.

Hypothesis: TenantContext's tenant query (useDiscover/useTenant) — maybe cached tenant data returns the SAME org id for both outlets?? OR the JWT decode: `zp` (decodeJwtPayload) uses base64url decoding; if organizationId claim is missing/undefined (e.g., some JWT versions), cachedOrgId null -> !(!_e||_e!==G) becomes false -> exchange fires... need to check the actual branch:
  if(!(!_e||_e!==G)) { reuse cached; w(!1); return }  — exchange happens only when !_e || _e!==G.
  That matches the intended fix. So if exchange is NOT happening, either:
  1. cachedOrgId === G even for the wrong outlet (tenant ids equal? explore vs detail org ids differ? company slug scoping?), or
  2. global session missing -> falls to "no global session" branch which CLEARS the tenant token if wrong-org then returns — page shows login? But user sees content, so that branch doesn't apply (has global session).
  3. enter-tenant POST fires but latestTenantRequestRef guard discards the response (v.current!==te) — e.g., TenantSessionSync re-fires due to tenant ref change (tenant.id stable? if tenant object recreated with new ref but same id, effect doesn't re-fire due to tenant?.id dep...).
  4. The "wrong page" is because CustomerDashboard renders from a query keyed on slug but data cached from prior slug (React Query staleData / cache keyed on slug — switching slug may reuse query?) — points/featured picks are tenant-scoped API calls; if the JWT were correct they'd show Coffeesarowar data. So JWT is still Magic Cups' at the time the queries run.
  5. The enter-tenant response's token may encode orgId of the WRONG tenant?? Backend scopes to JWT organizationId — enter-tenant issues token for tenant identified by... what? The global session. If global session doesn't know the tenant, which tenant does it mint for? NEED to re-check backend enterTenant: which tenant is the JWT minted for when POST has no tenant param.

## CRITICAL finding (deployment truth)
CI (build.yml/quality.yml) does NOT deploy to Cloudflare — it only builds and smoke-tests the ALREADY-DEPLOYED site. Production frontend deploy is ONLY via scripts/deploy-frontend.sh, which needs CLOUDFLARE_API_TOKEN (not in sandbox env, must come from repo GitHub Actions secrets or manual).
So: my merge to main never pushed the new frontend to stampdd.club. The served bundle (index-BVIV1jNE.js) contains CustomerAuthContext with the fix (needExchange path IS present) but NO sessionStale guard, matching an older build state.
WAIT — the deployed bundle DOES contain my fix's needExchange code but NOT sessionStale. That means the deployed bundle predates my fix? No — my fix only added needExchange; sessionStale lives in CustomerLayout which existed before. Actually: deployed bundle lacks sessionStale entirely → deployed build is from BEFORE commit e32e3b3 (sessionStale fix)?? My branch built locally with fix+sessionStale present. The bundle served has needExchange (my fix) but no sessionStale — inconsistent; maybe vite chunk split put CustomerLayout code in another chunk that index.html doesn't reference? No — grep found 0 matches. Deployed bundle seems to be a DIFFERENT build than mine (older). Whatever: conclusion = production frontend is STALE (not my merge's build), so the real bug persists.
Resolution: build with latest main, deploy via deploy-frontend.sh (need token from GitHub secrets), verify with smoke test, then user tests.

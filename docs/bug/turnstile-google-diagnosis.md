# Diagnosis — Turnstile widget missing + Google button missing (2026-08-14)

## Live evidence (fetched 2026-08-14 from stampdd.club)
- `https://stampdd.club/assets/index-CP-7lYux.js` (live bundle) contains:
  - ZERO occurrences of `challenges.cloudflare.com` → Turnstile widget code is dead-code eliminated
  - ZERO occurrences of `GoogleLogin`, `react-oauth`, `VITE_GOOGLE_CLIENT_ID` → Google button code is also eliminated
  - `turnstileToken` request body fields remain (authContext POSTs still include turnstileToken:ne / turnstileToken:C)
  - Bundle has `""` (empty string) 350x — env vars were empty at build

## Root cause
Both widgets depend on env vars baked in at build time:
- `VITE_TURNSTILE_SITE_KEY` (empty → `TURNSTILE_ENABLED=false` → widget renders nothing)
- `VITE_GOOGLE_CLIENT_ID` (empty → `GOOGLE_CLIENT_ID` falsy → GoogleLogin not rendered)

User suspects a recent API key/token rotation changed these secrets.
The build in CI/deploy does NOT set VITE_TURNSTILE_SITE_KEY or VITE_GOOGLE_CLIENT_ID
(deploy.yml only sets VITE_API_BASE_URL), so the build only works if the token values
are in repo .env or in the environment of whoever builds. Currently production has neither.

## User decision (2026-08-14)
> "Lets do one thing. Remove the cloudflare verification thing entirely."

## Required changes for Turnstile removal
1. Frontend:
   - Remove `<Turnstile>` usage from: GlobalCustomerLogin, GlobalCustomerRegister,
     AdminLogin, AdminForgotPassword, PlatformLogin (PlatformAuthContext may also reference).
   - Remove `turnstileToken` state/refs; submit buttons no longer disabled by TURNSTILE_ENABLED.
   - Optionally delete frontend/src/components/shared/Turnstile.tsx and any authContext turnstileToken fields.
2. Backend:
   - Remove `turnstileMiddleware.js` (middleware exits app in production when TURNSTILE_SECRET_KEY unset — dangerous!).
   - Remove `verifyTurnstile` from all routes: adminAuthRoutes (login, resend-verification, forgot-password),
     authRoutes (register, login, forgot-password), customerAccountRoutes (register, login, resend-verification, forgot-password), platformRoutes (login).
   - Google endpoint /api/customer-auth/google and /api/auth/google are NOT turnstile-protected (good).
3. CSP: `public/_headers` and `frontend/wrangler.jsonc` carry `https://challenges.cloudflare.com` — remove after Turnstile gone; keep Google domains (user wants Google button back).
   NOTE: Google button should ALSO be restored. It's hidden because VITE_GOOGLE_CLIENT_ID is empty in the build. Removing Turnstile won't restore it unless we also address the client ID. Need to confirm with user where the Google client ID is configured (Render env var GOOGLE_CLIENT_ID exists server-side; frontend needs VITE_GOOGLE_CLIENT_ID at build).
4. Tests: csp-report-only.js sets TURNSTILE_SECRET_KEY="test-only-fake-key" — remove.
5. docs/ops/rotation-runbook.md references TURNSTILE — update.

## Deployment facts
- Backend (Render) auto-deploys on push to main; tests run via quality.yml on every push.
- Frontend: deploy via scripts/deploy-frontend.sh (needs CLOUDFLARE_API_TOKEN).
- CI deploy workflow: verify-live-bundle.sh checks bundle hash + fix markers.
- smoke-prod.js verifies SPA/proxy/health/CORS.

## Progress state (2026-08-14)
- Branch: `remove-turnstile` (working dir /home/ubuntu/stampd-app). Plan at docs/superpowers/plans/2026-08-14-remove-turnstile.md
- DONE (frontend, Task 1):
  - Deleted frontend/src/components/shared/Turnstile.tsx
  - Removed Turnstile from GlobalCustomerLogin, GlobalCustomerRegister, AdminLogin, AdminForgotPassword, PlatformLogin (incl. unused useRef import in AdminForgotPassword)
  - CustomerAuthContext: login now (email, password) only; registerUser options dropped turnstileToken
  - PlatformAuthContext: login (email, password) only
  - frontend/lib/api.ts had no turnstile references
  - CSP: removed https://challenges.cloudflare.com from frontend/public/_headers + frontend/wrangler.jsonc (Google domains kept)
  - tsc --noEmit passes (exit 0); Vite build passes with pnpm@9 (plain outputs, no .gz/.br)
  - Built bundle (dist/assets/index-*.js): 0 occurrences of challenges.cloudflare.com/Turnstile/turnstileToken
  - scripts/verify-live-bundle.sh: added check 4 — live bundle must NOT contain challenges.cloudflare.com (regression guard)
  - docs/ops/rotation-runbook.md: TURNSTILE row removed
- TODO next: Task 2 (backend) — delete backend/middleware/turnstileMiddleware.js; remove verifyTurnstile mounts from backend/routes/customerAccountRoutes.js (lines ~20-31), authRoutes.js (~13-18), adminAuthRoutes.js (~13-17), platformRoutes.js (~28); remove TURNSTILE_SECRET_KEY override from backend/tests/csp-report-only.js (~line 102); create backend/tests/turnstile-removal.js regression suite (bootServer port 0, in-memory mock; POST /api/customer-auth/register + login WITHOUT turnstileToken, expect token back; same for /api/auth/login, /api/admin-auth/login (durbarmarg@coffesarowar.com/password), /api/platform/login (admin@stampd.co/password)); run npm test (full suite, all must pass)
- Backend login payload note: controllers may still accept turnstileToken in body — check; middleware removal is the enforcement layer
- TODO Task 3: git commit, push main, CI must be green, deploy via scripts/deploy-frontend.sh (needs CLOUDFLARE_API_TOKEN in env — not in this sandbox yet; may need user or repo secret), verify live bundle + smoke-prod.js
- User confirmed: will remove Turnstile only; Google Client ID exists in Render env but NOT set for builds (VITE_GOOGLE_CLIENT_ID) — Google button stays conditional
- Live evidence before fix: live bundle /assets/index-CP-7lYux.js had 0 occurrences of challenges.cloudflare.com, GoogleLogin, VITE_GOOGLE_CLIENT_ID, sitekey

## Latest state (2026-08-14, Phase 4)
- Commit 4e06b2b pushed to main (branch remove-turnstile). CI jobs: Quality checks SUCCESS, Production build check SUCCESS, Secret scan SUCCESS, Deploy frontend to Cloudflare FAILED (3m17s)
- All local backend tests passed (37 suites, incl. new turnstile-removal.js added to npm test loop before health-endpoint)
- CLOUDFLARE_API_TOKEN NOT in sandbox env — CI's deploy job uses repo secret; deploy failed for unknown reason, need to inspect: gh run view 31774323788 --log-failed or view logs via gh api
- CI deploy workflow builds frontend with VITE_API_BASE_URL=https://api.stampdd.club then runs scripts/deploy-frontend.sh which runs verify-live-bundle.sh
- User instructions: wait for user confirmation after deployment; user verifies in browser

## Deployment findings (2026-08-14 CI run 31774323788)
- CI deploy FAILED at verify step with: `FAIL live bundle hash mismatch: built=8a9ded9f... live=2ef17d98...`
- BUT the deploy DID upload 121 files successfully (`Uploaded stampd (4.24 sec)`, Version ID 622ef196-f7c9-4714-8879-20a6612bc776)
- Root cause of VERIFY failure: wrangler on CI warned "[custom build] Unexpected fields found in assets field: 'headers'" — so wrangler's custom build command re-ran `VITE_API_BASE_URL=... pnpm run build` itself, producing dist with hash 8a9ded9f (different from workflow's pre-build 2ef17d98). The verify step compared against the WORKFLOW's build hash, not the build actually deployed. Deployed = CI's own wrangler-rebuilt build. So the failure is a false-positive from the hash mismatch (CI built twice).
- CRITICAL NEW ISSUE found after: live /api/health returns 404 — the edge worker /api proxy appears DOWN on production NOW. Verify again: maybe transient. Must check `curl -s https://stampdd.club/api/health` again. If still 404, the worker deploy broke the /api proxy (this is the exact outage pattern from 2026-08-13!).
- Live index.html now references /assets/index-n5yOgPl5.js which has sha256 8a9ded9f (CI build, Turnstile-free bundle, correct).
- Fix path: verify /api proxy again; if 404, the worker failed — check wrangler deploy log for worker script warnings. Possibly the deploy succeeded but the worker has no /api proxy because wrangler rejected 'headers' in assets and maybe other fields, or the worker upload failed. Actually 'Uploaded stampd (4.24 sec)' refers to worker script upload.
- CI: CLOUDFLARE_API_TOKEN comes from repo secret; sandbox lacks it. To deploy manually I need the token from user or .user_env.

## ROLLBACK SESSION (2026-08-14 ~06:00)
### User provided CF token (secret — supplied at runtime, NEVER committed; GitHub push protection blocks pushes containing it)
- Account ID: d34229f93ab7aa8e06bfacb7febe25cc (official.stampd@gmail.com)
- Worker script: stampd. Versions API: GET /accounts/{id}/workers/scripts/stampd/versions?per_page=10 → result.items[].id, number, metadata.created_on
- Content API (multipart, strip '--boundary' lines): GET /accounts/{id}/workers/scripts/stampd/content/v2/versions/{id}
- Deployed versions: 152 (622ef196..., 05:54:07, my push), 151 (3ee39552..., 05:52:29), 150 (4715d26f..., 05:09:48 = GOOD workflow_dispatch), 149 (30a5f3e7..., 05:08:07)

### PROOF chain (evidence)
1. curl https://stampd.official-stampd.workers.dev/api/health → 404 {"success":false,"message":"Internal Server Error"} — worker returns it
2. curl https://api.stampdd.club/health → 200 {"status":"ok"} — backend /health OK directly
3. curl https://api.stampdd.club/api/health → 404 SAME backend error shape — direct backend also 404s /api/health
4. Deployed worker v150 == v152 byte-identical and both match repo frontend/worker/worker.js exactly — worker CODE is fine
5. CONCLUSION: worker proxies /api/health → backend /api/health; backend responds 404 for /api/health because /health is mounted at root (app.get("/health",...) in server.js) — so /api/health 404 is CORRECT backend behavior. The "404 Internal Server Error" JSON is the backend's generic 404.
6. CRITICAL COROLLARY: the site was ALWAYS served via worker proxy at stampdd.club and Vite build uses VITE_API_BASE_URL=https://api.stampdd.club (absolute). smoke-prod.js check "GET /api/company/me returns JSON" PASSES at 05:54 (see CI log 6/6 PASS). So the API at stampdd.club IS working via the PROXY — my earlier panic was a misunderstanding: /api/health doesn't exist on the backend; smoke-prod uses /api/company/me.
7. What actually FAILED at 05:54 CI verify: live bundle hash mismatch (built=8a9ded9f workflow build vs live=2ef17d98... — wait, CI log said live=2ef17d98; live now serves 8a9ded9f = CI's wrangler-custom-build output). So after rollout, live = CI's own build. False positive from double build.
8. Live bundle index-n5yOgPl5.js sha256 = 8a9ded9ffbc05d3f9d82a0cfd01fe7e32ee0f3d762bfb1b66cbd666ee6f14a90 (Turnstile-free) — CORRECT new build IS live now.
9. Wrangler warning on CI: "Unexpected fields found in assets field: headers" — cosmetic; deploy still succeeded. But CI verify step needs fixing: workflow builds BEFORE deploy, then wrangler rebuilds dist itself (custom build command), making hashes diverge.

### NEXT ACTIONS
- Fix .github/workflows/deploy.yml: remove pre-deploy build hash step OR have verify use wrangler-out hash; simplest: compute hash AFTER wrangler deploy from the deployed content, or pass the wrangler-rebuilt hash (the workflow's build is redundant since wrangler custom build command re-builds).
- Verify live: run node scripts/smoke-prod.js (SITE=https://stampdd.club, API_BASE=https://api.stampdd.club) and verify-live-bundle.sh with correct hash (8a9ded9f).
- Also note 404 on workers.dev for /api/health is expected (backend has no /api prefix route); backend /health direct = 200.
- User wants confirmation after deployment; user verifies in browser.
- Remaining: fix CI false-positive, re-run/fix deploy job, verify live, report to user. Also remind user about Google Client ID (VITE_GOOGLE_CLIENT_ID) for the Google button.

## Regression test plan
- Backend: add a `turnstile-removal.js` suite (bootServer) asserting:
  - POST /api/customer-auth/login without turnstileToken succeeds (correct creds)
  - POST /api/auth/login, /api/admin-auth/login, /api/platform/login, /api/customer-auth/register, /api/auth/register, forgot-password endpoints all work WITHOUT turnstileToken
  - Backend boot does NOT require TURNSTILE_SECRET_KEY (no fatal exit)
- Frontend: build + grep live bundle assertions:
  - no `challenges.cloudflare.com` in bundle
  - `GoogleLogin` and `accounts.google` script load present in bundle (once client ID is provided)
  - Add to smoke/verify scripts so CI catches regressions.

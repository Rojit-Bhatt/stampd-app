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

## Regression test plan
- Backend: add a `turnstile-removal.js` suite (bootServer) asserting:
  - POST /api/customer-auth/login without turnstileToken succeeds (correct creds)
  - POST /api/auth/login, /api/admin-auth/login, /api/platform/login, /api/customer-auth/register, /api/auth/register, forgot-password endpoints all work WITHOUT turnstileToken
  - Backend boot does NOT require TURNSTILE_SECRET_KEY (no fatal exit)
- Frontend: build + grep live bundle assertions:
  - no `challenges.cloudflare.com` in bundle
  - `GoogleLogin` and `accounts.google` script load present in bundle (once client ID is provided)
  - Add to smoke/verify scripts so CI catches regressions.

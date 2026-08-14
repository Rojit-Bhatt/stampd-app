# Remove Cloudflare Turnstile Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely remove Cloudflare Turnstile verification from stampdd.club — the visible widget on every login/register page and the server-side token check on every protected endpoint — so sign-in works with email/password (+ Google, once a Client ID is configured) with no bot-check step.

**Architecture:** Turnstile is wired in two layers: a frontend `<Turnstile>` React component (baked into each login/register page; dead-code eliminated when `VITE_TURNSTILE_SITE_KEY` is unset) and a backend `verifyTurnstile` Express middleware (fatal-exits production if `TURNSTILE_SECRET_KEY` is unset). Removal = delete both layers, strip every route mount and every `turnstileToken` form field, and prune the leftover references (CSP headers, runbook, test config). The Google sign-in button remains untouched: it is conditional on `VITE_GOOGLE_CLIENT_ID` at build time and stays hidden until that key is configured.

**Tech Stack:** React/Vite frontend (pnpm 9 build), Express backend on Render (Node 22), Cloudflare static + worker deploy, GitHub Actions CI, Jest-free native `node` test suites.

## Global Constraints
- Do NOT touch the production database; no writes, read-only checks only.
- Frontend deploys MUST use `scripts/deploy-frontend.sh` logic with `VITE_API_BASE_URL=https://api.stampdd.club`, plain (uncompressed) outputs, built with `npx -y pnpm@9`.
- After deploy, the smoke test (`scripts/smoke-prod.js`) must pass against the live site; the CI deploy workflow also re-verifies the live bundle.
- Every backend change must pass all suites in `backend/package.json` `test` script locally before pushing.
- Secrets never committed; tokens live only in GitHub Actions secrets / env vars.
- Frontend must be built with plain (uncompressed) outputs.

## File Structure

| File | Role |
|------|------|
| `frontend/src/components/shared/Turnstile.tsx` | Widget component — DELETE |
| `frontend/src/routes/GlobalCustomerLogin.tsx` | Removes `<Turnstile>`, `turnstileToken` state, submit disabled-guard |
| `frontend/src/routes/GlobalCustomerRegister.tsx` | Same removal |
| `frontend/src/routes/AdminLogin.tsx` | Same removal |
| `frontend/src/routes/AdminForgotPassword.tsx` | Same removal |
| `frontend/src/routes/platform/PlatformLogin.tsx` | Same removal |
| `frontend/src/context/CustomerAuthContext.tsx` | Remove `turnstileToken` params from `login`/`register` calls |
| `frontend/src/context/PlatformAuthContext.tsx` | Remove `turnstileToken` params from `platformLogin` |
| `frontend/src/lib/api.ts` | Remove any `turnstileToken` field passing |
| `backend/middleware/turnstileMiddleware.js` | DELETE |
| `backend/routes/customerAccountRoutes.js` | Remove `verifyTurnstile` from 4 routes |
| `backend/routes/authRoutes.js` | Remove `verifyTurnstile` from 3 routes |
| `backend/routes/adminAuthRoutes.js` | Remove `verifyTurnstile` from 3 routes |
| `backend/routes/platformRoutes.js` | Remove `verifyTurnstile` from 1 route |
| `backend/tests/turnstile-removal.js` | NEW regression suite |
| `backend/tests/csp-report-only.js` | Remove `TURNSTILE_SECRET_KEY` from boot env |
| `frontend/public/_headers`, `frontend/wrangler.jsonc` | Remove `https://challenges.cloudflare.com` from CSP; keep Google domains |
| `scripts/verify-live-bundle.sh` | Add a `challenges.cloudflare.com ABSENT` marker check |
| `docs/ops/rotation-runbook.md` | Remove TURNSTILE row |

---

### Task 1: Frontend — delete the widget and clean every page + auth contexts

**Files:**
- Delete: `frontend/src/components/shared/Turnstile.tsx`
- Modify: `frontend/src/routes/GlobalCustomerLogin.tsx`, `frontend/src/routes/GlobalCustomerRegister.tsx`, `frontend/src/routes/AdminLogin.tsx`, `frontend/src/routes/AdminForgotPassword.tsx`, `frontend/src/routes/platform/PlatformLogin.tsx`, `frontend/src/context/CustomerAuthContext.tsx`, `frontend/src/context/PlatformAuthContext.tsx`, `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: none (this is the first task)
- Produces: login/register forms that submit `{email, password}` (no `turnstileToken`) and are never disabled by a bot-check state; auth contexts expose `login(email, password)` and `register(payload)` without a third turnstile argument.

- [ ] **Step 1: Record the current (broken) state for evidence**
  Fetch `https://stampdd.club/assets/index-CP-7lYux.js` (read from the SPA's index.html) and assert with `grep` that `challenges.cloudflare.com`, `GoogleLogin`, and `VITE_GOOGLE_CLIENT_ID` are all absent. Save the output. This proves the current deploy is missing the features before touching code.

- [ ] **Step 2: Delete the Turnstile component and remove usage from the 5 pages**
  Delete `frontend/src/components/shared/Turnstile.tsx`. In each of the 5 pages: remove the `Turnstile`/`TURNSTILE_ENABLED`/`TurnstileHandle` imports, the `turnstileToken` state and ref, the `<Turnstile ref={...} onVerify={...} />` JSX, and change the submit `disabled` condition to drop the `(TURNSTILE_ENABLED && !turnstileToken)` guard.

- [ ] **Step 3: Clean the auth contexts and api client**
  In `CustomerAuthContext.tsx`: `login` removes its turnstile argument and posts `{email, password}` only; `register` posts without `turnstileToken`. In `PlatformAuthContext.tsx`: `platformLogin` posts without `turnstileToken`. Check `frontend/src/lib/api.ts` for any hardcoded `turnstileToken` field and remove it. TypeScript must compile: `npx -y pnpm@9 --filter frontend exec tsc --noEmit` (or the repo's check script).

- [ ] **Step 4: Update CSP + bundle verification**
  In `frontend/public/_headers` and `frontend/wrangler.jsonc`: remove `https://challenges.cloudflare.com` from `script-src` and `connect-src` in the report-only CSP (leave `accounts.google.com` / `*.googleapis.com` untouched — the Google button will need them). In `scripts/verify-live-bundle.sh` step 3, add a marker assertion that the live bundle does NOT contain `challenges.cloudflare.com` (a regression guard: if anyone re-adds Turnstile, CI fails).

- [ ] **Step 5: Build the frontend and verify the bundle locally**
  `cd frontend && npx -y pnpm@9 install --frozen-lockfile && VITE_API_BASE_URL=https://api.stampdd.club npx -y pnpm@9 run build`. Then grep `dist/assets/index-*.js`: `challenges.cloudflare.com` = 0 occurrences (removed), `GoogleLogin` still 0 (expected — no Client ID yet), SPA still renders.

- [ ] **Step 6: Commit**
  ```bash
  git add -A && git commit -m "feat(auth): remove Cloudflare Turnstile verification everywhere
  - deletes Turnstile widget component and its use on all login/register pages
  - login/register payloads no longer carry turnstileToken
  - drops challenges.cloudflare.com from the CSP policy
  - live-bundle verification now fails if turnstile script domains reappear"
  ```

### Task 2: Backend — delete the middleware, unmount it from every route

**Files:**
- Delete: `backend/middleware/turnstileMiddleware.js`
- Modify: `backend/routes/customerAccountRoutes.js`, `backend/routes/authRoutes.js`, `backend/routes/adminAuthRoutes.js`, `backend/routes/platformRoutes.js`

**Interfaces:**
- Consumes: Task 1's frontend changes are independent; backend tests cover this server-side.
- Produces: `POST /api/customer-auth/login`, `/api/auth/login`, `/api/admin-auth/login`, `/api/platform/login`, both `/register` endpoints, and all three `/forgot-password` + `/resend-verification` endpoints accept requests WITHOUT a `turnstileToken` body field and authenticate/validate normally.

- [ ] **Step 1: Write the failing regression test first**
  Create `backend/tests/turnstile-removal.js` following the `account-settings.js` pattern: boot via `helpers/bootServer.js` (port 0, in-memory mock DB), register a customer via `POST /api/customer-auth/register` with NO `turnstileToken`, then login via `POST /api/customer-auth/login` with NO `turnstileToken` and assert `status === 200` and a token is returned. Also assert the same for `POST /api/auth/login` (tenant customer), `POST /api/admin-auth/login` (`durbarmarg@coffesarowar.com` / `password`), and `POST /api/platform/login` (`admin@stampd.co` / `password`). Include explicit checks: `body.turnstileToken === undefined` in the request (the request simply doesn't carry the field).

- [ ] **Step 2: Run it — it must fail**
  `cd backend && node tests/turnstile-removal.js`. Expected: FAIL, because the live middleware rejects requests without a token (returns 400 "Verification challenge is required").

- [ ] **Step 3: Implement the minimal removal**
  Delete `backend/middleware/turnstileMiddleware.js`. In each of the 4 route files: delete the `require` line and remove `verifyTurnstile, ` from every route mount, leaving the remaining middleware order intact. Also remove the `TURNSTILE_SECRET_KEY: "test-only-fake-key"` override from `backend/tests/csp-report-only.js` (it imports the deleted middleware — without this the suite would crash). Note: `csp-report-only.js` boot env must still work without it since the middleware is gone.

- [ ] **Step 4: Run the regression test — it must pass**
  `cd backend && node tests/turnstile-removal.js`. Expected: all PASS.

- [ ] **Step 5: Run the full backend suite**
  `cd backend && npm test` (the full list from `backend/package.json` "test" script). Expected: all suites PASS. This protects against accidentally breaking auth anywhere.

- [ ] **Step 6: Commit**
  ```bash
  git add -A && git commit -m "fix(auth): remove Turnstile verification from all protected endpoints
  - deletes turnstileMiddleware (previously fatal-exited production when the secret was missing)
  - login/register/forgot-password no longer require a turnstile token
  - adds a regression suite asserting token-free login works on every role"
  ```

### Task 3: Push, run CI, and deploy the frontend to Cloudflare

**Files:** `scripts/deploy-frontend.sh` (execution only)

**Interfaces:**
- Consumes: Tasks 1–2 committed to `main`.
- Produces: a live-verified production deploy.

- [ ] **Step 1: Push to `main` and watch CI**
  `git push origin main`. CI (`quality.yml` + `build.yml` + `deploy.yml`) must go green. The deploy workflow runs its own live-bundle verification (hash match + outlet-switch markers) after deploying.

- [ ] **Step 2: Deploy via the repo script (the canonical deploy path)**
  Run `./scripts/deploy-frontend.sh` (requires `CLOUDFLARE_API_TOKEN` from the environment). This rebuilds with `VITE_API_BASE_URL` and runs `smoke-prod.js` after deploy. Do NOT proceed on a red CI or a failed smoke test.

- [ ] **Step 3: Verify the live site with real evidence**
  Re-fetch the new SPA index.html → new bundle URL. Assert: (a) `challenges.cloudflare.com` = 0 occurrences in the new bundle, (b) bundle hash matches the freshly built one, (c) `scripts/smoke-prod.js` passes against `https://stampdd.club` + `https://api.stampdd.club`, (d) the backend on Render has restarted with the new code (`curl https://api.stampdd.club/health` → `{"status":"ok"}` and backend login works without a token field — exercise `POST /api/customer-auth/login` via the test suite's own assertions against production is out of scope; the health check + CI cover it).

- [ ] **Step 4: Verify the TURNSTILE_SECRET_KEY env var is harmless on Render**
  Render keeps the old env var; with the middleware gone, Node's `process.env` simply never reads it — no crash. Optionally, advise the owner to remove `TURNSTILE_SECRET_KEY` from Render in a follow-up (not in this plan's scope).

### Task 4: Report to the user

- [ ] **Step 1: Send final status** — what was removed, evidence from the live bundle, CI/smoke results, and the note that the Google sign-in button will reappear automatically once `VITE_GOOGLE_CLIENT_ID` is set at build time (user has confirmed the Client ID exists in Render's environment; offer to wire it into the build as a GitHub secret as a follow-up).

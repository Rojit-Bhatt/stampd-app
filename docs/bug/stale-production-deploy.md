# Spec & Implementation Plan — Production frontend never received the outlet-switch fix

## 1. Problem statement (user-reported, plain language)

The user (customer app) tested the outlet-switch fix and reported it is still broken:
opening "Cafe Coffesarowar" after "Magic Cups" loads a page whose header says
"Magic Cups" and shows Magic Cups' points, featured picks, and events.

## 2. Root cause (verified with real evidence)

1. **The fix was merged to GitHub (PR #68, commit 5df3204) but the frontend was
   NEVER deployed to Cloudflare.** Evidence:
   - `gh run list` shows CI workflows `build.yml`/`quality.yml` — both only
     *build* and *smoke-test the already-deployed site*; neither workflow runs
     `wrangler deploy` or anything touching Cloudflare.
   - The live bundle `https://stampdd.club/assets/index-BVIV1jNE.js` does NOT
     contain the `sessionStale` guard (present in `CustomerLayout.tsx` on
     `origin/main`) and does NOT match a build produced from the merged code.
   - The deploy path is only `scripts/deploy-frontend.sh`, which requires
     `CLOUDFLARE_API_TOKEN` — that secret is not available in this session,
     and no push-to-main auto-deploy exists.

2. **Why CI "passed" after merge:** the CI smoke test (`scripts/smoke-prod.js`)
   checks that the *currently deployed* site answers correctly. It does not
   rebuild or redeploy, so it passed against the old build. The user's
   debugging rules said "never trust a deployment's success message" — but
   here the deployment was silent: nobody deployed at all, and nothing in CI
   fails to say so.

3. **Why the observed behavior was "Magic Cups content under the Coffesarowar
   header" instead of the old stuck-spinner:** the old build still has the
   `sessionStale` spinner gate, but the page also renders content once
   `isLoading` clears — with the stale Magic Cups JWT, the API returns Magic
   Cups data, and the sessionStale guard only shows the spinner while
   `isLoading`/stale. In the recorded flow the layout rendered the (wrong)
   outlet's content because the token-slot logic in the old build had a
   different deadlock path. Either way: the old code, not the fix, is what
   the user tested.

## 3. Requirements (spec)

R1. The merged frontend (with the outlet-switch fix) must be deployed to
    `stampdd.club` and the live bundle must verifiably contain the fix.
R2. The deployment gap must be closed at the process level: a push to `main`
    must trigger an automatic Cloudflare deploy, so this "merged but not
    shipped" failure mode cannot repeat.
R3. Post-deploy, the live smoke test must pass, and the deployed bundle must
    be checked for the fix markers before the deploy is declared done.
R4. The user verifies the outlet-switch flow on their phone with real
    accounts and confirms before this task is closed.

Non-requirements (out of scope): no further code changes to the outlet-switch
fix itself (it is verified locally and in CI backend suites), no database
changes, no backend deploy needed.

## 4. Implementation plan

### Step 1 — Obtain the Cloudflare deploy token [blocked until user acts]
- User adds `CLOUDFLARE_API_TOKEN` as a repo GitHub Actions secret
  (Settings → Secrets and variables → Actions) OR shares it in chat.
- Verify it is available before proceeding; never commit it.

### Step 2 — Build the frontend from latest `main`
- `git checkout main && git pull` (include the CSP-flake-fix commits).
- `cd frontend && npx -y pnpm@9 run build` with
  `VITE_API_BASE_URL=https://api.stampdd.club` (plain/uncompressed outputs).

### Step 3 — Add an automated "main → deploy" GitHub Actions workflow
- New workflow `deploy.yml`: triggers on push to `main`, runs only if
  the build workflow for the same push succeeded.
- Jobs: lockfile check → frontend build (plain outputs) →
  `scripts/deploy-frontend.sh` (wrangler deploy with token from secret) →
  15s settle → `scripts/smoke-prod.js` against the live site →
  **bundle-content check**: curl the deployed `index-*.js` and fail the job
  if it does not contain BOTH fix markers (`needExchange` in
  CustomerAuthContext build and `sessionStale` in CustomerLayout build).
- Never log the token; keep it secret-only.

### Step 4 — Deploy now (same path the new workflow will use)
- Run `scripts/deploy-frontend.sh` locally in the sandbox with the token,
  or trigger the workflow manually.
- After deploy: verify the served bundle fingerprint changed and contains
  the markers; run smoke test against live site.

### Step 5 — Regression verification on the live site
- Smoke test 6/6 must pass.
- Document the expected user test (open outlet A → back → open outlet B;
  B must show B's name/points/picks, and switching back to A must show A's).

### Step 6 — Update docs
- docs/bug/stale-production-deploy.md (this file) records the deployment
  truth so future sessions don't repeat the assumption.

## 5. Acceptance criteria

- AC1: `curl https://stampdd.club/...` bundle contains the fix markers and
  its hash differs from the pre-deploy bundle.
- AC2: Live smoke test 6/6 pass after deploy.
- AC3: New `deploy.yml` workflow exists and passes once on a test run.
- AC4: User confirms outlet switching works on their phone.

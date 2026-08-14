# Spec & Implementation Plan — slow reloads + outlet switch still broken on device

Reported 2026-08-14 from a screen recording of the production app on Android
Chrome (`Chrome/151.0.0.0 Mobile Safari`), taken at 14:08:33 +0545
(= 08:23:33 UTC).

Two symptoms:

- S1. Every reload takes a long time.
- S2. Switching outlets does not work — tapping a different outlet card still
  shows the first outlet's data. Reported as "the token of the first one is
  caching".

---

## 1. Root cause investigation (evidence, not guesses)

### 1.1 The outlet-switch fix IS deployed — the phone is not running it

`origin/main@5cb3656` ("fix: outlet switch shows previous outlet's dashboard
data (#70)") resets `TenantContext`'s status latch when the outlet identity
changes. That fix **is present in the live bundle**:

```
GET https://stampdd.club/assets/index-DZk8SIL3.js
  ... N=`${t}/${i}`,O=R.useRef(null),I=R.useRef("loading");
      O.current!==N&&(O.current=N,I.current="loading"), ...
```

So this is not a repeat of `docs/bug/stale-production-deploy.md` (merged but
never shipped). The CDN has the fix. The device does not.

### 1.2 Root cause A — the service worker can never activate

`frontend/vite.config.ts` uses `strategies: "injectManifest"` with
`registerType: "autoUpdate"`. With `injectManifest`, vite-plugin-pwa does
**not** inject any lifecycle code into a hand-written `sw.ts` — the author
must supply it. `frontend/src/sw.ts` supplies none:

```ts
precacheAndRoute(self.__WB_MANIFEST);
// ... push + notificationclick listeners only
```

Verified against the deployed artifacts:

```
$ curl -s https://stampdd.club/sw.js | grep -oE "skipWaiting|clientsClaim|SKIP_WAITING" | wc -l
0

$ curl -s https://stampdd.club/registerSW.js
if('serviceWorker' in navigator) {window.addEventListener('load', () => {
  navigator.serviceWorker.register('/sw.js', { scope: '/' })})}
```

`frontend/src/main.tsx` never imports `virtual:pwa-register`, so the generated
`registerSW.js` is the bare register — no update poll, no `controllerchange`
reload. Net effect: `registerType: "autoUpdate"` is **inert**.

Consequence: after a deploy the new service worker installs and then sits in
the `waiting` state forever, because control is only released when every tab
under the scope is closed. `precacheAndRoute` serves the *precached*
`index.html`, which points at the *precached* `assets/index-<oldhash>.js`.
The user reloads, and the SW hands back the pre-fix application every time.

This explains S2 exactly: the fix is live, the phone is pinned to the old
bundle, and no number of reloads changes that.

### 1.3 Root cause B — CSP report storm, ~40–100 extra POSTs per page load

`frontend/public/_headers` ships a `Content-Security-Policy-Report-Only`
policy that does not describe the app it is applied to. Measured on a real
load of `https://stampdd.club/explore`:

- `font-src 'self' data:` — the app loads Inter and Space Grotesk from
  `https://fonts.gstatic.com`. **26 font violations** on that one page.
- `style-src 'self' 'unsafe-inline'` — missing `https://accounts.google.com`;
  the Google Sign-In stylesheet violates.
- No `frame-src`, so it falls back to `default-src 'self'` — the Google
  Sign-In iframe violates, repeatedly.

Every violation is its own `POST /api/csp-report`. Observed in the network
log for a single `/explore` load:

```
POST https://stampdd.club/api/csp-report → 204     (x40+, before the route
                                                    chunks even start loading)
```

The Render logs for the recording window (08:20:05.72 → 08:20:05.85 UTC)
show the same burst — ~100 `csp-violation` entries inside 130 ms, all from
the Android Chrome UA in the recording.

These POSTs are same-origin as the document and are issued during load, so
they contend with the actual application requests. This is the single
largest contributor to S1.

Secondary note: the reports arrive malformed — the collector logs
`[CSP report-only] undefined on undefined (blocked: n/a)` with
`blockedUri: null`, i.e. `backend/server.js`'s `req.body?.["csp-report"]`
shape assumption does not match what is being posted. The collector is
storing noise.

### 1.4 Root cause C — 128-entry precache, whole app on every customer phone

The deployed `sw.js` manifest has **128 entries** and includes every admin
and platform route chunk (`AdminBroadcasts`, `PlatformAuditLog`,
`SubscriptionKeys`, …). A customer's phone downloads and stores the entire
console it will never open, on every new service-worker version.

### 1.5 Root cause D — four serial round trips before any number renders

On a cold load of `/:company/:outlet/dashboard`:

1. `index.html` → `assets/index-*.js`
2. `GET /api/tenant` — `TenantProvider` renders a **full-screen spinner** and
   mounts no children until this resolves
3. only then does `TenantSessionSync` fire
   `POST /api/customer-auth/enter-tenant`
4. only then does `CustomerLayout`'s `sessionStale` gate open and the
   dashboard queries (`/api/points/balance`, `/catalog`, `/campaigns`,
   `/api/account/me`) start

Steps 2 and 3 are needlessly serial: `enter-tenant` identifies the outlet
purely from the `X-Company-Slug` / `X-Outlet-Slug` headers
(`backend/middleware/tenantMiddleware.js` → `extractTenantRef`), which
`TenantProvider` already sets synchronously from the URL params. It does not
need the `/api/tenant` response at all.

Backend is Singapore, users are in Nepal, so each hop is a real RTT.

### 1.6 Ruled out

- **Backend cold start / resource pressure.** Render `stampd-app` is on the
  `free` plan, but metrics for 08:00–08:40 UTC show one continuously-running
  instance (`srv-...-xwpxh`, no restart), CPU peaking at 0.015 of a 0.15
  limit, memory 114 MB of 512 MB. The backend was warm and idle during the
  recording. A warm `GET /api/tenant` measures ~190 ms from here.
- **Query-key collisions.** `usePoints.ts` keys are correctly scoped by
  `companySlug` + `outletSlug`. (`useAccount.ts` is the one exception — see
  P5 below — but it is not the reported symptom.)

---

## 2. Requirements

- **R1.** A deploy must reach an already-installed device on the next load,
  without the user closing every tab or uninstalling the PWA.
- **R2.** A page load must not issue tens of CSP violation reports. The
  report-only policy must describe the assets the app actually loads.
- **R3.** A customer's phone must not precache the admin and platform
  console chunks.
- **R4.** The tenant fetch and the tenant-session exchange must not be
  serial; one round trip should come out of the cold-load path.
- **R5.** No regression to outlet isolation: a dashboard must never render,
  or cache, another outlet's data. `#70`'s guarantee stays intact.
- **R6.** Swapping the service worker must not break an open tab (stale lazy
  chunk requests against a freshly-replaced precache).

Out of scope: upgrading the Render plan; enforcing (vs reporting) CSP;
changing the backend auth model.

---

## 3. Implementation plan

Work happens on a **new branch off `origin/main`**. The current local branch
`feat/celebration-animation-redesign` is 67 commits behind `main` and holds
unrelated, uncommitted celebration work — it must not be the base, and its
working-tree changes must be preserved untouched.

### P1 — Make the service worker actually take over (fixes S2, R1, R6)

`frontend/src/sw.ts`:

```ts
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
```

`frontend/src/main.tsx`: import `virtual:pwa-register` and register with
`immediate: true`, so `registerSW.js` stops being the bare stub and starts
polling for updates. Because `skipWaiting` + `clientsClaim` swap the
precache under a live page (R6), the registration reloads the page on
`controllerchange` — that is what `autoUpdate` is supposed to do and what
the current bare stub silently omits.

Add `virtual:pwa-register` to `frontend/src/vite-env.d.ts` types if absent.

### P2 — Correct the report-only CSP (fixes R2, most of S1)

`frontend/public/_headers`, on the `Content-Security-Policy-Report-Only`
line:

- `font-src 'self' data: https://fonts.gstatic.com`
- `style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com`
- add `frame-src https://accounts.google.com`

Then re-measure: a `/explore` load must issue **zero** `POST /api/csp-report`.

### P3 — Trim the precache (fixes R3)

Add `injectManifest.globIgnores` in `frontend/vite.config.ts` for the
admin/platform route chunks, so the customer PWA precaches only the customer
surface. Verify the manifest entry count drops materially from 128.

### P4 — Collapse the tenant waterfall (fixes R4)

Start `ensureTenantSession` from the outlet **slugs** as soon as
`TenantProvider` has set the tenant ref, in parallel with the `/api/tenant`
query, rather than waiting on `tenant.id` in `TenantSessionSync`.

`ensureTenantSession(slug, tenantOrgId)` already tolerates a null
`tenantOrgId` — it is used only for the request-key guard and the
cached-token org check. Keep the guard keyed on the `company/outlet` pair so
the existing in-flight-race protection (`latestTenantRequestRef`) is
unchanged, and keep `CustomerLayout`'s `sessionStale` gate exactly as it is,
so R5 still holds: the gate, not the request ordering, is what guarantees
isolation.

**Narrowed during implementation.** The plan above assumed the early call
could simply run on every outlet open. It can't: the tenant JWT carries only
`organizationId`, no slugs (`authService.formatAuthPayload`), so a caller
that doesn't yet know the id cannot evaluate the existing skip test
`!cachedOrgId || cachedOrgId !== tenantOrgId` — with a null id and a cached
JWT present, that is unconditionally true. A naive early call would therefore
exchange on **every** outlet open, turning the revisit case from zero network
calls into one and handing straight back the round trip it just saved.

So the early call proceeds only when there is no cached tenant JWT at all —
first entry after login, after logout, a new device — the one case where the
exchange is required regardless of what the id turns out to be. Strict
improvement, no revisit regression. It does mean an outlet **switch** (cached
JWT present, belonging to the other outlet) still waits for `/api/tenant`
before exchanging; removing that last serial hop needs the slug→orgId mapping
on the client, which is a larger change than this bug warrants. Listed under
follow-ups instead.

The request key also moved from `tenantOrgId || slug` to the `company/outlet`
pair across all callers, because the early and late calls for one outlet must
share an identity or the in-flight guard would discard the early call's own
response. That incidentally closes a latent collision: a bare outlet slug is
unique only within its company.

Regression harness: `docs/bug/repro-tenant-session-prefetch.js`.

### P5 — Scope the account query by outlet (small, R5 hardening)

`useAccount.ts` keys on `["account", role]` with no tenant in the key, but
`/api/account/me` returns the **outlet membership** row. Add the slugs to
the key. Not the reported bug; it is the same class and one line.

### P6 — Fix the CSP collector's body parsing (cleanup)

`backend/server.js`'s `/api/csp-report` logs `undefined on undefined`.
Handle the `application/reports+json` array shape in addition to the
legacy `{"csp-report": {...}}` shape, so the collector records something
useful instead of noise. Lowest priority; do last.

---

## 4. Verification

**Build with pnpm, not npm.** An `npm install` in this repo produces a
silently wrong PWA build: workbox's glob for the precache manifest fails
(`brace_expansion_1.expand is not a function`) and the manifest comes out with
5 entries instead of the real set — a warning, not an error, so the build
"succeeds". `pnpm install` resolves it correctly. CI already uses pnpm.

1. `cd frontend && npx tsc --noEmit && npx vite build` — clean.
2. Inspect the built `dist/sw.js`: must contain `skipWaiting` and
   `clientsClaim`; manifest entry count must be below 128 and must not list
   admin/platform chunks.
3. Deploy via the existing `.github/workflows/deploy.yml` path.
4. Against the live site, with the browser tools:
   - `POST /api/csp-report` count on a `/explore` load == 0.
   - The served bundle hash changed.
5. Device check by the user (the only way to prove R1, since it needs a
   phone that already has the old SW installed): open the app, reload once,
   confirm the new build is running and that opening outlet B after outlet A
   shows B's name, points, and picks.

## 5. Acceptance criteria

- AC1. A second load after deploy runs the new bundle on a device that had
  the old service worker installed.
- AC2. Zero CSP violation reports on a normal page load.
- AC3. Precache manifest excludes admin/platform chunks.
- AC4. Cold dashboard load issues `/api/tenant` and `/api/customer-auth/enter-tenant`
  concurrently, not serially.
- AC5. Outlet A → outlet B shows B's data; A → B → A shows A's. No stale
  numbers under either header.

# Production deploy readiness + scalability hardening

**Date:** 2026-07-19
**Status:** Approved design, ready for implementation plan
**Scope:** The concrete, near-term-sized changes needed before/at first production deploy — hosting topology, rate limiting, connection handling, minimal monitoring, and proper PWA installability. Does NOT cover the POS/inventory-merge extensibility question (answered separately, as analysis, not a build — see the chat response this spec was written alongside). Does NOT introduce speculative infrastructure (Redis, message queues, microservices) sized for scale this app doesn't have yet.

**Vendor choices (locked):** backend on **Render**, frontend on **Cloudflare Pages** (not Vercel). Backend still a persistent Node host, frontend still a static host — the split the design assumes; the specific vendors don't change any of it.

## Context

CLAUDE.md's "What's left" says "Deploy (Vercel + Atlas)" — but the app was never built serverless-first. It's a normal persistent Express server (`app.listen(PORT)`, `mongoose.connect()` once at startup, `config/db.js`). Auditing the codebase for this spec found:

- **No in-memory cross-request state anywhere in the backend.** The one thing CLAUDE.md calls a "singleton" (`platformConfigService`) is DB-backed (`PlatformConfig.findOneAndUpdate({singleton: true}, ...)`), not an in-process object — every server instance reads/writes the same document. This is a genuinely good sign: the app can already run as multiple instances behind a load balancer with zero code changes, if traffic ever demands it later.
- **Zero rate limiting anywhere.** `/api/customer-auth/register`, `/api/customer-auth/login`, `/api/admin-auth/login`, `/api/platform/login`, and the forgot-password endpoints are all open to unthrottled brute-force/abuse.
- **`config/db.js` connects once at startup with default Mongoose pool settings** — correct and sufficient for a persistent single-instance server (which is what's being deployed — see the locked hosting decision below), but not something Vercel Functions could use as-is (serverless would need per-invocation global-connection-caching, which this app doesn't have and isn't getting, since it's not going on Vercel Functions).
- **No health-check endpoint** beyond the existing `GET /` (already returns `{success:true, message: ...}` — reusable as-is).
- **No error monitoring/log aggregation** — everything is `console.log`/`console.error`, fine in dev, invisible once actually deployed unless the hosting platform's own log viewer is watched manually.

## Decisions locked during brainstorming

1. **Hosting topology: split.** Backend deploys to a persistent Node host (**Render**, locked per the vendor note above); frontend's Vite build deploys to **Cloudflare Pages** (a static host). Zero backend code changes needed for "how the server runs" — it already runs the way a persistent Node host expects. Explicitly rejected: adapting the backend to serverless functions (Vercel Functions or equivalent) — real rework (no more `app.listen()`, global-cached Mongoose connections, execution-time-limit awareness) for no benefit this app needs right now.
2. **Recommended host: Render**, over Railway or Fly.io, for this specific situation — a real free tier (useful for a staging deploy before committing spend), predictable fixed pricing (easier to budget than Fly's pay-per-second or Railway's usage-based billing), and Node.js auto-detect deploy (matches "deploying soon, keep it simple"). Railway and Fly.io remain fine alternatives if preferred; the app doesn't structurally favor one over the others — this is a pick, not a hard requirement. Whichever is chosen, pick a region close to Nepal (Singapore is commonly available across all three) and put the MongoDB Atlas cluster in the same or an adjacent region, to keep DB round-trip latency low — most of this app's request time is DB round trips, and cross-continent placement would show up directly as slower page loads.
3. **Rate limiting via `express-rate-limit`** (the standard, actively maintained choice), applied only to the genuinely abuse-prone unauthenticated endpoints: register, login (all three: customer/admin/platform), forgot-password, resend-verification. Proposed starting thresholds (adjustable after review, not load-bearing on anything else): 20 requests / 15 min / IP for login attempts, 10 requests / hour / IP for register and forgot-password. **In-memory store, on purpose** — the default `express-rate-limit` MemoryStore is correct for a single-instance deploy (which is what's launching); a shared store (Redis) is only needed once there's more than one backend instance, which isn't happening yet per decision 1's YAGNI framing. Noted as a follow-up trigger, not built now.
4. **No change to `config/db.js`'s connection pooling.** Mongoose's default `maxPoolSize` (100) is already appropriate for a single persistent-server instance under realistic near-term concurrency — the earlier serverless connection-exhaustion risk this spec's context section describes doesn't apply once the app isn't running as short-lived functions. Revisit only if/when decision 1 ever changes.
5. **Health check: reuse the existing `GET /`** — already returns `{success: true, message: ...}` with a 200, which is exactly what Render/Railway/Fly's health-check config expects. No new endpoint.
6. **Error monitoring is a fast-follow, not launch-blocking.** `console.error` already exists on every controller's catch block and is visible in whichever host's log viewer is chosen — sufficient to launch with. Recommended fast-follow (not in this spec's implementation scope): `@sentry/node`, a few lines in `server.js`, free tier is enough at this traffic level. Left out of this spec's code changes so the spec stays focused on what's actually blocking a safe launch.
7. **MongoDB Atlas tier: start on the free/shared M0 tier**, upgrade only when actually approaching its limits (512MB storage, 500 connections) — not a decision that needs code, just an operational note for the deploy checklist below.

## Explicitly out of scope

- Redis / shared rate-limit store (see decision 3 — YAGNI until multi-instance).
- Message queues, background job workers, microservices split — nothing in this app currently needs async job processing (no cron exists or is needed anywhere per CLAUDE.md's own repeated statement across points expiry, subscription expiry, and campaigns).
- CDN/edge caching for public read endpoints (`/api/tenant`, `/api/menu`) — premature at this traffic level; MongoDB read latency isn't the bottleneck yet.
- Sentry/error-monitoring code (decision 6 — flagged as fast-follow, not built here).
- Any change related to the POS/inventory-merge idea — answered separately as analysis, not scoped as a build.

## PWA (proper installability)

The app is already an SPA with `vite-plugin-pwa` wired in — but the generated manifest is stale (`name: "Cafe Loyalty"`, black `#000000` colors, `start_url: "/dashboard"` which is not a real route in this multi-tenant app) and there are no real app icons (`pwa-192x192.png` is a 656KB photo, no 512, no maskable). So "add a PWA" is really "fix the misconfigured PWA layer already present" — no framework change, no architecture change, React Router stays.

Locked decisions:
1. **One global "Stampd" app, not one-app-per-cafe.** `start_url: "/explore"`, `scope: "/"` — a single installed icon that opens to the customer's list of every place they've joined. This is what a single static `vite-plugin-pwa` manifest naturally supports; per-outlet installable apps would need a dynamically-served per-tenant manifest (per-tenant name/icon/color/start_url), real extra engineering that fights the tooling, and is explicitly out of scope.
2. **Installable + app shell + fast relaunch, online for loyalty actions.** Home-screen install, standalone display (no browser chrome), cached app shell for fast launch. Earning/redeeming still requires connectivity — balances and claims are server-side. NO offline loyalty operations (that's the local-first POS-level work, deliberately deferred). The service worker precaches the built static shell (vite-plugin-pwa's default `generateSW`/Workbox precache, already active); API calls are never cached (they must always hit the server), so nothing new is needed to *prevent* stale loyalty data — the default already only precaches build assets, not `/api` responses.

Implementation:
- **Manifest** (in `vite.config.ts`'s `VitePWA({manifest})`): `name: "Stampd"`, `short_name: "Stampd"`, `theme_color` + `background_color` set to the brand cream/ink (not black), `display: "standalone"`, `start_url: "/explore"`, `scope: "/"`, and a real `icons` array (192 any, 512 any, 512 maskable).
- **Icons**: generated from the existing Stampd coin logo (the same geometry already inlined as the favicon SVG in `index.html`) via a scripted `sharp` rasterization pass — no rasterizer is installed, and `sharp` is the standard, verifiable way. Output real PNGs into `public/`; delete the stale 656KB `pwa-192x192.png` photo. `sharp` added as a **devDependency** (build-time asset tool, never shipped/imported at runtime).
- **`index.html` head**: add `theme-color` meta + iOS install metas (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`) — iOS ignores the manifest for some of this and needs the metas. Fix the `<body>`'s `bg-[#121212]` (black — a holdover) to the brand cream, so the first paint before React mounts isn't a black flash on the installed app's splash-to-content transition.
- **SPA fallback**: `frontend/wrangler.jsonc`'s `assets.not_found_handling: "single-page-application"` — so client-side-routed deep links (e.g. a scanned `/coffesarowar/durbarmarg/claim?token=…`) resolve to the SPA shell instead of a 404. This is the mechanism for Cloudflare's current Workers-Static-Assets deploy path (the dashboard's "Connect to Git" wizard now provisions new projects onto Workers rather than classic Pages, even though the product is still called "Pages" in places). **Deliberately not** a `public/_redirects` file — that's classic Pages' equivalent mechanism, and shipping both at once caused a Cloudflare-API-rejected redirect loop (`/*` colliding with the platform's own asset-serving fallback) on first deploy.

## Split-hosting API base URL

`lib/api.ts`'s `apiRequest` **already** reads `VITE_API_BASE_URL` (falling back to relative `""` for the dev proxy) — so the main request path is already production-ready: set `VITE_API_BASE_URL` to the Render backend's URL at Cloudflare Pages build time and every `apiRequest` call targets the backend. The only gap: the handful of **raw-`fetch` file-download call sites** (the report/menu `.xlsx` downloads, which use `fetch` directly to read a blob rather than `apiRequest`) hardcode a relative `/api/...` path and would hit the Cloudflare origin instead of Render. Fix: prefix those with the same `VITE_API_BASE_URL`. Export a tiny `apiUrl(path)` helper from `lib/api.ts` and use it at those sites, so the base-URL logic lives in exactly one place.

## Data model

**No schema changes.** This spec touches request-handling middleware, PWA config/assets, and deploy configuration only.

## Backend

### `backend/middleware/rateLimitMiddleware.js` (new)

Thin wrapper around `express-rate-limit`, exporting two pre-configured limiters per decision 3:
- `authLimiter` — 20 requests / 15 min / IP, keyed on IP (`express-rate-limit`'s default `ipKeyGenerator`, IPv6-safe).
- `registrationLimiter` — 10 requests / hour / IP.

Both respond `429` with a `{success: false, message: "..."}` body matching this app's existing error-response shape (not `express-rate-limit`'s default plain-text), so the frontend's existing `apiRequest` error handling (which expects JSON) doesn't break on a throttled request.

### Route wiring

Applied at the route level (not globally — a global limiter would also throttle legitimate high-frequency traffic like the claim page's status poll, which is unauthenticated but not abuse-prone the same way):
- `backend/routes/customerAccountRoutes.js`: `registrationLimiter` on `POST /register`, `POST /resend-verification`, `POST /forgot-password`; `authLimiter` on `POST /login` (google/verify-email/reset-password are token- or provider-gated already, lower abuse surface, left unthrottled). Forgot-password sits with the registration-tier limiter, not the login-tier one — legitimately triggered rarely, so the lower 10/hour threshold fits better than login's 20/15min (which has to tolerate normal typo retries).
- `backend/routes/adminAuthRoutes.js`: `authLimiter` on `POST /login`; `registrationLimiter` on `POST /forgot-password`, `POST /resend-verification`.
- `backend/routes/platformRoutes.js`: `authLimiter` on `POST /login`.

### `backend/package.json`

Add `express-rate-limit` (actively maintained, ~zero-dependency, the de facto standard for this — not introducing a heavier framework for a narrow need).

## Deploy checklist (operational, not code)

Ordered roughly by dependency:

1. Create the MongoDB Atlas cluster (M0 tier per decision 7), a region near the chosen host, a real DB user with a strong generated password (not the current `.env` placeholder).
2. Create the Render (or chosen host) service for `backend/`, set env vars: `MONGODB_URI` (from step 1), `JWT_SECRET`/`JWT_GLOBAL_SECRET` (freshly generated, not the dev value), `APP_BASE_URL`/`FRONTEND_ORIGINS` (the real frontend domain, once known), `SMTP_*` (see step 4), `GOOGLE_CLIENT_ID`, `NODE_ENV=production` (this already fatals the server at boot if `JWT_SECRET` is missing in production — confirms the env vars before anything else can go wrong).
3. Deploy `frontend/`'s Vite build to Cloudflare Pages; set the `VITE_API_BASE_URL` build env var to the Render backend's URL; note the resulting frontend domain (`*.pages.dev` or the custom domain) and go back to step 2 to set `APP_BASE_URL`/`FRONTEND_ORIGINS` correctly (circular dependency between the two deploys — expected, do it in this order).
4. Replace the personal Gmail SMTP credentials with a transactional email provider (SendGrid/Postmark/SES/Resend) — a personal Gmail account has daily send limits and worse deliverability for real customer-facing volume; this app already abstracts email through `emailService.sendEmail`, so this is a config change, not a code change.
5. Update the Google Cloud Console OAuth client's authorized JavaScript origins/redirect URIs from `localhost` to the real production frontend domain.
6. Point DNS at the chosen platforms; confirm HTTPS (both Render and Cloudflare Pages provision this automatically — no manual cert work, unlike the LAN-testing mkcert note in CLAUDE.md, which is specifically a *local* on-phone-testing concern and doesn't apply here).
7. Set the health-check path in the host's dashboard to `/` (per decision 5).
8. Smoke-test the full loop against production (register a real company, add an outlet, scan a real QR from a phone) before calling it launched.

## Testing / verification

1. **Backend**, self-contained via `tests/helpers/bootServer.js`: hit `authLimiter`-protected and `registrationLimiter`-protected endpoints past their threshold within the test's run → confirm the N+1th request gets `429` with the expected JSON shape, and that a request from a *different* IP (or after the window, if the test can control time) is unaffected — proves the limiter is IP-scoped, not global. Confirm an untouched endpoint (e.g. `GET /api/tenant`) is never throttled.
2. Confirm the existing full test suite still passes with the limiters wired in — none of the existing suites should trip a threshold under normal test traffic (if any do, that's a sign the threshold is too tight for legitimate rapid testing/usage and needs raising, not that the test is wrong).
3. Manual: `curl` the deployed `/` health path post-deploy, confirm `200`.

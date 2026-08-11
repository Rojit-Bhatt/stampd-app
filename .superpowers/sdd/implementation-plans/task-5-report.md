# Task 5 Report — Cache Rendered Pages or Fragments

Commit: `88eba93` on `perf/perf-tasks` (local, not pushed).

## Objective

Cache server output that is identical across users and changes infrequently, regenerate on content change, keep keys tenant- and locale-aware, and verify large speedups on warm reads.

## Design Decision

The Stampd frontend is a pure client-side SPA: its "pages" are composed of JSON fetched from the API. There is no server rendering to cache, so the page/fragment-cache pattern was applied at the API layer — cache the shared JSON responses that power those pages.

## Implementation

`backend/utils/responseCache.js` provides two exports:

- `cacheMiddleware({ kind, ttlMs, tenantKey, localeKey })` — Express middleware. On a GET/HEAD miss it runs the handler and intercepts `res.json` to store the (uncompressed) body with an expiry; on a hit it returns the stored body directly. `Cache-Control: public, max-age=<ttl seconds>` is set on both paths so a CDN may front the API safely.
- `clearCache({ tenant, kind })` — purges matching keys; both-empty clears everything.

Cache keys always include three segments — `kind`, `tenant` (the outlet's `req.organizationId` from `resolveTenant`, or `"global"` for plans), and `locale` (`Accept-Language`) — so output can never leak across tenants or languages.

Bodies are cached as plain JS objects (uncompressed), and the middleware is placed before `compression()` in the route chain, so every response gets exactly one compression pass — the double-compression invariant from Task 1 holds.

## Cached Endpoints and Purge Coverage

| Endpoint | Kind / TTL | Purged by |
|---|---|---|
| `GET /api/menu` (public menu) | `publicMenu` / 5 min | Menu CRUD (menuController), tenant settings (menuEnabled), platform company/outlet edits |
| `GET /api/tenant` (public tenant) | `publicTenant` / 30 min | Tenant settings, event CRUD, platform company/outlet edits |
| `GET /api/platform/plans/public` | `publicPlans` / 5 min (global key) | Plan CRUD (post/patch/delete) |

Each mutation controller calls `clearCache` with the affected tenant(s) after a successful write. Platform-level edits (company defaults, outlet suspension/rename) purge all of that company's outlet keys.

## Verification

`backend/tests/response-cache.js` — 24/24 PASS:

1. Cold vs warm: cold public-menu read works and carries `Cache-Control: public, max-age=300`; the second read is served from cache in <5ms with an identical body and the same header.
2. Mutation purge: a menu item PATCH is reflected in the very next public read (fresh body), and the key re-warms afterwards.
3. Tenant isolation: an item created by the patan outlet admin appears in patan's public menu and never in durbarmarg's.
4. Locale keys: a non-default `Accept-Language` read doesn't disturb the default-locale cache.
5. Plans: `/api/platform/plans/public` warm read <5ms with the correct header.

## Findings During Implementation

- **Bug caught by tests**: the initial cache key used `req.tenant`, which `resolveTenant` never sets — keys fell back to `"global"` and all tenants shared one entry. Fixed to derive from `req.organizationId` (the codebase's canonical tenant id); the isolation test would have shipped stale cross-tenant menus without it.
- **Stale-output bugs caught in unrelated suites**: the newly cached `/api/tenant` endpoint surfaced two latent staleness paths — a company `programDefaults` patch (platformController) and event CRUD (eventController) were not purging. Both got purge calls; `program-config` went from failing to all-PASS.

## Regression Status

Backend `npm test`: green except three pre-existing failure suites (auth-google-and-profile: 2, messaging-triggers: 2, company-reports-range: 4) — identical to baseline. Frontend `pnpm lint` and `pnpm build`: green.

## Notes

The cache is process-local (module-scoped Map), so each replica caches independently; keys evict on TTL or explicit purge. Personalized output (balances, notifications, admin endpoints) is deliberately excluded — only truly shared reads are cached.

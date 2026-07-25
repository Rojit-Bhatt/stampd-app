# Tier distribution analytics (Phase 2 of the loyalty growth suite)

**Date:** 2026-07-25
**Status:** Approved design, ready for implementation plan
**Scope:** Phase 2 of `docs/superpowers/specs/2026-07-22-loyalty-growth-suite-roadmap-design.md` — surfacing the Tier System (Phase 1, shipped) as an actual analytics view, at both outlet and platform level, plus one Excel export column. Does NOT include campaign performance metrics (no campaigns exist yet — Phase 4) or any new tier-computation logic (`tierService.resolveTier` is reused exactly as-is).

## Context

Phase 1 shipped `tierService.resolveTier(organizationId, customerId, {org, earns})` and already threads a `tier` field through `getCustomerDetailRows` (outlet admin's customer list) and `/api/points/balance` — but nothing aggregates or visualizes it. An outlet admin currently has no way to see "how many of my customers are Gold" without manually counting rows in the customer list; the platform admin has no cross-tenant view at all.

## Decisions locked during brainstorming

1. **Both outlet-level and platform-level ship in this phase**, not just outlet-level — the platform admin needs visibility into tier adoption across the whole SaaS as soon as outlets start configuring it.
2. **Outlet-level lives on `AdminOverview.tsx`** (the outlet dashboard), as a new panel alongside the existing `pointsVelocity`/`pointsActivity` charts — this is the page an outlet admin already checks daily, not buried in the separate Reports page.
3. **Rendered as a Recharts bar chart** (one bar per label — Bronze/Silver/Gold/Platinum — plus "Untiered"), matching the existing `pointsActivity` bar chart's visual language on the same page, not a plain stat-row.
4. **The customer-list Excel export (`buildCustomersWorkbook`) gets a `Tier` column** — trivial addition since `tier` is already on every row `reportService.js` already builds workbooks from.
5. **Platform-level scan skips outlets with no tier thresholds configured at all**, computing each qualifying outlet's `Organization` document and transaction set once and reusing them across that outlet's customers (the same `{org, earns}` reuse pattern Phase 1's final review introduced into `resolveTier`) — avoids O(customers × redundant queries) at platform scale. Never exposes which tenant a customer belongs to; only aggregate counts, matching every other metric `platformAnalyticsService.js` already returns.

## Explicitly out of scope

- Any change to `tierService.resolveTier`'s logic or signature — reused exactly as Phase 1 left it.
- Campaign performance metrics — no `Broadcast`/campaign model exists yet (Phase 4).
- Historical tier-distribution trend (week-over-week change) — this phase is a point-in-time snapshot only, matching how `companiesTotal`/`outletsTotal`/`customersTotal` are already point-in-time (no trend badge) in `platformAnalyticsService.js`.
- Per-outlet breakdown on the platform page (e.g. "which specific outlets have the most Gold customers") — global tally only, consistent with every other platform metric never naming a specific tenant.

## Data model

No schema changes. Pure read-side aggregation over existing `Organization.tierThresholds` + `tierService.resolveTier`.

## Backend

### `backend/services/reportService.js` (outlet-level)

New export `getTierDistribution(organizationId)`:
- Calls the existing `getCustomerDetailRows(organizationId)` (already computes `tier` per row via Phase 1).
- Reduces the returned array into `{ Bronze: n, Silver: n, Gold: n, Platinum: n, untiered: n }` (`untiered` counts rows where `tier === null`).
- Returns `{ success: true, data: { Bronze, Silver, Gold, Platinum, untiered } }`.

New route: `GET /api/admin/tier-distribution` (`isBusinessAdmin`-gated, alongside the existing `/dashboard-stats` route in `adminRoutes.js`) → thin controller in `reportController.js` calling the above.

### `backend/services/reportService.js` — `buildCustomersWorkbook`

Add a `Tier` column (header + per-row value, `row.tier || "—"` for untiered) alongside the existing columns. One-line addition to the existing column-definition array and row-mapping — no structural change to the workbook-building function.

### `backend/services/platformAnalyticsService.js` (platform-level)

New function `getTierDistribution()` (distinct name is fine — different module, no import collision), added into `getPlatformAnalytics()`'s returned object as `tierDistribution: { Bronze, Silver, Gold, Platinum, untiered }`:
- `Organization.find({})` — all outlets (this service already scans cross-tenant on purpose).
- Filter in JS to outlets where at least one label in `tierThresholds` has both `minVisits` and `minSpend` non-null (skip the rest — no ledger query needed for an outlet with nothing configured).
- For each qualifying outlet: `User.find({role: "customer", organizationId})` and `PointsTransaction.find({organizationId, type: "earn"})` once each, group the earns by `userId` in JS, then call `resolveTier(org._id, customer._id, {org, earns: earnsByCustomer[customer._id] || []})` per customer — reusing the already-fetched `org` and that customer's slice of already-fetched earns, never a fresh query per customer.
- Tally into the global `{Bronze, Silver, Gold, Platinum, untiered}` object across all qualifying outlets (customers of non-qualifying outlets are never queried at all, and are NOT counted as "untiered" — they're simply excluded from this metric entirely, since an outlet with tiers never configured isn't meaningfully "0 customers with no tier", it's "not participating in tiers at all". `untiered` only counts customers *at a qualifying outlet* who don't meet any configured threshold).

### `backend/controllers/platformController.js` / `reportController.js`

Thin — parse request, call service, format response. No new business logic in either controller.

## Frontend

### `AdminOverview.tsx`

New panel, same `Panel`/card shell as the existing charts: fetches `GET /api/admin/tier-distribution` via a new `useQuery` hook (matching the existing `useDashboardStats`-style hook pattern), renders a Recharts `BarChart` with one `Bar` per label (Bronze/Silver/Gold/Platinum/Untiered), styled with the same CSS-var-driven colors already used (`var(--primary)` etc. — reuse, don't invent a new palette per label; a single-color bar chart distinguished by X-axis category label is enough, matching `pointsActivity`'s existing single-series style).

### `PlatformAnalytics.tsx`

Fourth section, added after the existing points-velocity chart, same card/heading/Recharts pattern, reading `tierDistribution` off the existing `getPlatformAnalytics()` query response (already fetched on this page — no new network call).

## Testing

New `backend/tests/tier-distribution.js` (added to `package.json`'s test chain):
- Outlet-level: seed customers across multiple tiers (reusing thresholds/earn patterns from `tests/tier-system.js`), confirm `getTierDistribution` tallies correctly, confirm an untiered customer counts under `untiered`.
- Platform-level: one outlet with tiers configured, one sibling outlet with none — confirm the sibling's customers are excluded entirely (not counted as untiered), confirm the configured outlet's customers tally correctly, confirm no response field ever names a specific tenant/outlet.
- Excel export: `buildCustomersWorkbook`'s output includes a `Tier` column with the right values (reading the generated workbook back, matching how other Excel-export tests in this repo already verify workbook contents).

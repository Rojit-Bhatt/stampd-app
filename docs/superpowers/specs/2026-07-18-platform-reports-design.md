# Platform-wide reporting (live totals + downloadable company report)

**Date:** 2026-07-18
**Status:** Approved design, ready for implementation plan
**Scope:** Extends the existing `/platform/analytics` page. Two independent additions: (1) new all-time top-line tiles, (2) a new date-ranged, per-company downloadable Excel report. No changes to per-outlet or per-company (company-owner console) reporting, which stay as they are.

## Context

The platform console already has an Analytics page (`platformAnalyticsService.getPlatformAnalytics`, `PlatformAnalytics.tsx`) showing weekly-trend tiles (new customers, points issued, revenue, redemptions) and a 14-day points-velocity chart. During real-world manual testing (no seed data, platform admin registering companies/outlets by hand), the platform admin asked for numbers that don't exist today:

- How many companies are on the platform, total.
- How many outlets, total.
- How many customers are using the platform, total.
- A downloadable report, filterable to a specific date range.

Investigating turned up a real bug in the existing surface: `getPlatformAnalytics`'s `businessesTotal`/`businessesActive` fields actually count `Organization` (outlet) documents, not `Company` documents — a naming holdover from before the company/outlet restructure. There has never been a genuine "total companies" count anywhere in the platform console.

## Decisions locked during brainstorming

1. **Surface: extend the existing Analytics page, no new nav item.** A new top row of tiles sits above the existing weekly-trend section — "as of right now" totals above "how it's moved this week" trends. `PlatformAnalytics.tsx` stays the one platform-reporting page.
2. **New live tiles, all-time point-in-time counts, no trend arrows:** Total Companies, Total Outlets, Total Customers. These are snapshots, not flows, so (matching the existing `pointsOutstanding` precedent in the outlet-level dashboard) they deliberately carry no week-over-week badge.
3. **"Total Customers" = every distinct `CustomerAccount` that has ever registered, platform-wide, all-time.** Not an "active in the last N days" metric — that's explicitly out of scope (see below). This is the global identity count, not a sum of per-outlet `User` memberships, which would double-count anyone who belongs to more than one outlet (the isolation-test customer `bikash` is exactly this case).
4. **Fixes the existing mislabeling as part of this work:** `businessesTotal`/`businessesActive` (outlet counts) get correctly renamed to outlet-scoped fields; `companiesTotal` is new and genuinely counts `Company` documents.
5. **The downloadable report is a NEW, separate feature — a per-company breakdown for a date range, not an export of the live tiles above.** One `.xlsx`, one row per company, for whatever `[startDate, endDate]` the admin picks:

   `Company | Status | Outlets | New Customers | Points Issued | Points Redeemed | Revenue | Redemptions`

6. **"New Customers" in the report mirrors the existing outlet-level `getSummaryStats` definition exactly** — new `User` (role `customer`) rows created within the range, summed across that company's outlets. Not "new to the platform ever" (a different, harder metric that would require checking each `CustomerAccount`'s very first membership anywhere) — this keeps the number meaning the same thing it already means everywhere else in the app, one level rolled up.
7. **Points Issued / Points Redeemed / Revenue / Redemptions are the same flow metrics `companyReportService.getCompanyRollup` already computes for one company (all-time), made date-ranged and iterated over every company** instead of one. Deliberately no "points outstanding" or "points expired" column — those are balance/snapshot concepts, and `companyReportService`'s own header comment already establishes why this app never rolls up balances across outlets ("points are per-outlet and never pool, so a company-wide 'points balance' would be adding up numbers that can't be spent together"); the same reasoning extends to a cross-company report.
8. **Date-range UX matches the existing outlet-level Summary report exactly:** two plain `<input type="date">` fields, no presets, same "Export" button placement and Blob-download mechanism (`apiRequest` always calls `response.json()`, which corrupts a binary `.xlsx` body — the existing outlet-level reports already work around this with a raw `fetch`).
9. **No on-screen preview table for the date-ranged report.** The Companies list page already shows live (all-time) per-company stats on screen; a second, date-ranged table would duplicate that surface. The date pickers plus "Export" button are the whole UI for this feature — pick a range, download.
10. **Access gate: `isPlatformAdmin` (owner or support), matching the existing Analytics page.** The report is an export of company-level numbers that are, in aggregate, already visible on-screen to anyone who can view Analytics — it doesn't cross a new authorization boundary, so it doesn't need the stricter `isPlatformOwner` gate used for company registration/suspension/team management.

## Explicitly out of scope

- "Active customers" (last-30-days) tile — a real, different metric, not requested by the locked design; can be a follow-up if wanted later.
- Any UI for the per-company breakdown other than the download (no on-screen table, no chart).
- Points Expired / Points Outstanding columns in the report.
- Changing anything about the outlet-level (`/api/admin/reports/*`) or company-owner-level (`/api/company/reports`) reporting surfaces — those already exist and are untouched.
- PDF export, scheduled/emailed reports, charts inside the Excel file — plain data rows only, matching the existing Excel-report convention in this codebase.

## Data model

**No schema changes.** Every field needed already exists:
- `Company` documents themselves, for `companiesTotal` and the report's `Company`/`Status` columns.
- `Organization.companyId` + `Organization.status`, for `outletsTotal` and the report's `Outlets` column (non-archived count, matching `getCompanyRollup`'s existing `outletCount` filter).
- `CustomerAccount` documents, for `customersTotal` (a plain `countDocuments({})` — this is the one platform-wide surface where counting across the whole `CustomerAccount` collection is correct, since it's an aggregate count, never a customer-identifying join back to a specific tenant).
- `User` (role `customer`, `createdAt`), for the report's `New Customers` column — same field the outlet-level `getSummaryStats.newCustomers` already reads.
- `PointsTransaction` (`type`, `pointsCenti`, `billAmount`, `createdAt`, `organizationId`), for `Points Issued`/`Points Redeemed`/`Revenue`/`Redemptions` — same fields `getCompanyRollup` and `getSummaryStats` already read, just date-filtered and summed per company instead of all-time per one company.

## Backend

### `backend/services/platformAnalyticsService.js`

- `getPlatformAnalytics()` (existing function, extended): add `companiesTotal` (`Company.countDocuments({})`) and rename the outlet-counting fields to `outletsTotal`/`outletsActive` (same queries as today's `businessesTotal`/`businessesActive`, just correctly named). Add `customersTotal` (`CustomerAccount.countDocuments({})`, a new import). All three are plain counts, no date range, no trend.
- `getPlatformCompanyReportRows({ startDate, endDate })` (new): for every `Company`, load its outlets, then — same per-outlet-then-sum-in-JS approach `getCompanyRollup` already uses (the mock DB has no aggregation pipeline) — compute within `[startDate, endDate]`:
  - `newCustomers`: `User.countDocuments({ role: "customer", organizationId: outlet._id, createdAt: range })`, summed across the company's outlets.
  - `pointsIssuedCenti` / `pointsRedeemedCenti` / `revenue` / `redemptionCount`: from `PointsTransaction.find({ organizationId: outlet._id, createdAt: range })`, split by `type`, same arithmetic `getCompanyRollup` already does for its all-time totals.
  - `outletCount`: non-archived outlet count for that company (matching `getCompanyRollup`).
  - Converts centipoints to points once, on the way out (`toPoints`), same rule as everywhere else in the backend.
  - Returns an array, one entry per company, sorted by revenue descending (matching `getCompanyRollup`'s existing per-outlet sort).
  - Missing/invalid `startDate`/`endDate` default to the last 30 days, computed server-side. `reportService.js`'s existing `resolveDateRange` already implements exactly this and is currently module-private (not in its `module.exports`) — add it to that file's exports and import it here rather than reimplementing the same default-window logic a second time.
- `buildPlatformCompanyReportWorkbook(rows, { startDate, endDate })` (new): builds the `.xlsx` via ExcelJS (never the banned `xlsx` package), one row per company, the 8 columns from decision 5, plus the date range used written into the sheet (matching `buildSummaryWorkbook`'s existing convention of recording the range it covers).

### Routes / controller

- `backend/routes/platformRoutes.js`: `router.get("/analytics/companies-report/download", verifyToken, isPlatformAdmin, getCompaniesReportDownload);` — mounted under the same `/api/platform` prefix as the existing `/analytics` route, alongside it.
- `backend/controllers/platformController.js`: `getCompaniesReportDownload` — reads `startDate`/`endDate` query params, calls `getPlatformCompanyReportRows`, streams the workbook back with `Content-Disposition: attachment; filename="companies-report.xlsx"` (identical response-header pattern to `reportController`'s existing summary/customers downloads).
- `getAnalytics` controller (existing): no signature change, just returns the three new fields from the extended `getPlatformAnalytics()`.

## Frontend

### `frontend/src/routes/platform/PlatformAnalytics.tsx`

- New top row of 3 tiles (Total Companies, Total Outlets, Total Customers) above the existing weekly-trend tile row, same visual card style already used on this page (and the same style `AdminOverview.tsx` uses for the outlet console — no new visual pattern).
- New "Company report" section below the existing points-velocity chart: two `<input type="date">` fields (start/end, defaulting to the last 30 days, computed client-side the same way the existing outlet-level `AdminReportsSummary.tsx` does — so the default window's meaning is consistent everywhere in the app) and an "Export" button.
- "Export" hits `GET /api/platform/analytics/companies-report/download?startDate=&endDate=` via a raw `fetch` + Blob download (the same pattern `AdminReportsSummary.tsx` already established, reused verbatim — not `apiRequest`, which would corrupt the binary body).

## Testing / verification

Extends `backend/tests/platform-analytics.js` (self-contained via `tests/helpers/bootServer.js`, already the pattern this file uses) rather than a new suite, since it's the same domain:

1. `GET /api/platform/analytics` now returns `companiesTotal`, `outletsTotal`, `customersTotal`, all matching a hand-counted expectation against the seeded/created fixtures in the test — and specifically **not equal** to each other (proving the mislabeling bug is actually fixed, not just renamed).
2. Register two companies with distinct outlet/customer footprints. `getPlatformCompanyReportRows` for a range covering "now" includes both, with each company's numbers isolated from the other's (company A's revenue must not leak into company B's row) — the same cross-tenant isolation invariant every other report in this codebase is tested against.
3. A range entirely in the past (before either company had any activity) → both companies still appear as rows (a company with zero activity in range is not a company report doesn't know about), all their flow columns read 0.
4. `GET /api/platform/analytics/companies-report/download` → `200`, parses back via ExcelJS into a sheet with the 8 expected column headers and the right row per company.
5. Access gate: an outlet `business_admin` token (not a platform admin) hits both new endpoints → `403`.
6. Frontend: `npx tsc --noEmit` clean. Browser check: open Analytics, confirm the 3 new tiles render with real (non-fabricated) numbers, change the report's date range, download, confirm the file opens with matching per-company numbers for that range.

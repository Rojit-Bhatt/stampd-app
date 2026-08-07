# Group E — Reporting / dashboard bugs

## Problems
1. Company Reports page (`CompanyReports.tsx` + `companyReportService.js`) shows each outlet's **all-time total** customer count in a table meant to reflect the selected date range, and the same for the company-wide "Customers" tile.
2. Outlet admin dashboard (`getDashboardStats` in `reportService.js`) shows "New customers / Points issued / Revenue" over a trailing 7-day window; the admin wants **today**.
3. Customer tier labels reportedly look wrong for old customers after the admin configures tier thresholds — root cause not yet confirmed (see Investigation below).

## Design

### 1. Company Reports date-range customer counts
- `companyReportService.getCompanyRollup`: change per-outlet `customersCount` from `User.find({organizationId, role:"customer"}).length` (all-time) to counting only memberships created within `[start, end]` — same pattern `reportService.getSummaryStats` already uses (`User.countDocuments({role:"customer", organizationId, createdAt: range})`).
- Top `totals.customersCount` (deduped distinct `customerAccountId`, cross-outlet): keep the same dedup logic but only include customers whose per-outlet membership `createdAt` falls in range.
- Frontend (`CompanyReports.tsx`): no changes needed — it just renders whatever the backend now returns; tile/column labels already say "Customers" without an "all-time" qualifier so behavior change is invisible at the label level.

### 2. Outlet dashboard "today" window
- `reportService.getDashboardStats`: replace `currentStart = now - WEEK_MS` / `previousStart = now - 2*WEEK_MS` with:
  - `currentStart` = start of today (local `PLATFORM_TIMEZONE`, matching the campaign-day convention already used elsewhere in the codebase via `Intl`)
  - `previousStart`/`previousEnd` = start/end of yesterday, same timezone
- `newCustomers`, `pointsIssued`, `revenue` KPI tiles use this new window; trend label changes from "week-over-week" to "vs yesterday" semantics (same `weekOverWeekTrend` helper, just fed day windows — may want to rename it, but keep the function's number-in/percent-out contract).
- `pointsVelocity` (14-day) and `pointsActivity` (8-week) charts are unaffected — they already show their own explicit windows.
- Frontend (`AdminOverview.tsx`): update the "· 7D" tile subtitle to "· Today" (or equivalent) to match the new window — this is a real UI label bug once the backend window changes, not present in original bug list but required for internal consistency.

### 3. Tier staleness — investigate first
`tierService.resolveTier` already recomputes fresh from the ledger on every call (confirmed: no stored/cached tier value at any of its 4 call sites — `broadcastService`, `pointsService`, `platformAnalyticsService`, `reportService`). Before writing any fix, use systematic-debugging during implementation to find the actual gap — check in order:
1. `reportService.getCustomerDetailRows` (used by the admin Customers list/report) for any cached or pre-computed tier field.
2. Frontend React Query cache: does saving `tierThresholds` in `PointsProgram.tsx` invalidate whatever query the customer list uses, or does it require a manual page reload?
3. If truly no bug is found (thresholds change and tiers are correct immediately for all customers on next load), document that finding and close this item with no code change — do not invent a fix for a bug that isn't there.

## Testing
- Backend: extend `companyReportService`/`reportService` test coverage for the new date-filtered customer counts and today-window dashboard stats.
- Manual: verify in browser (mobile + desktop) that the dashboard tile subtitle and numbers match "today" after a fresh earn.

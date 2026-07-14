# Epic D2 — Excel Business Reports

**Date:** 2026-07-14
**Status:** Approved design, ready for implementation plan
**Scope:** Second of four specs decomposed from the original "Epic D" (customer drill-in [D1, merged], Excel report, contact/maps config [D3], featured-items/events cards [D4]). This spec covers only the downloadable business reports. D3 and D4 are separate, independent specs.

## Context

Multi-tenant loyalty SaaS ("Stampd"). The admin console has an Overview page with live (all-time) stats and a Customers screen with a per-customer list — but no way to export anything, or to see numbers scoped to a specific date range. The ask: downloadable Excel reports.

## Decisions locked during brainstorming

1. **Two independent reports, not one combined file:** a **Summary** report (aggregate totals, date-range scoped) and a **Customers** report (per-customer list, lifetime totals, unfiltered) — each its own `.xlsx` download, not two sheets in one file. Sharing customer data with an accountant shouldn't require also sharing the aggregate stats, and vice versa.
2. **Nav placement:** this codebase's admin sidebar (`AdminLayout.tsx`) is a flat list — no existing sub-menu/nested-nav pattern anywhere. Rather than introduce a new nested-nav UI just for this feature, the two reports become two more flat entries in the existing `NAV` array (same pattern as every other section), functionally achieving "Reports with sub-sections" without a new UI pattern.
3. **Date-range filtering applies only to the Summary report.** The Customers report stays a full, unfiltered, lifetime-totals list (matching D1) — "customers who exist" isn't a date-range concept the way "how did we do last month" is. Filtering customers by date-of-activity would be a different, narrower feature, not requested here.
4. **Summary metrics, default range = last 30 days:** new customers registered, stamps issued, vouchers earned, vouchers redeemed, total revenue — all scoped to the selected `[startDate, endDate]`. Defaulting to the last 30 days gives a useful report with zero admin input; they can widen or narrow it.
5. **Summary sub-section shows on-screen stat cards** (matching `AdminOverview.tsx`'s existing visual style) driven by the same date range, in addition to the download button — the admin sees what they're about to download before downloading it.
6. **Customers report columns:** Name, Email, Phone, Address, Customer #, Current Stamps, Lifetime Vouchers, Total Spent, Last Visit — exactly the fields already computed for D1's `getCustomersList`, just formatted for export instead of JSON. No new per-customer computation.

## Data Model

**No schema changes.** Every field these reports need already exists: `User.createdAt` (for "new customers in range"), `StampClaimEvent.createdAt`/`billAmount` (for stamps-issued and revenue), `Voucher.earnedAt`/`redeemedAt`/`isValid` (for earned/redeemed counts), and everything D1 already computes per customer (phone, address, lifetime vouchers, total spent, last visit).

## Backend

### `backend/services/reportService.js` (new)

- `getSummaryStats(organizationId, { startDate, endDate })`:
  - `newCustomers`: `User.countDocuments({ role: "customer", organizationId, createdAt: { $gte: startDate, $lte: endDate } })`.
  - `stampsIssued`: `StampClaimEvent.countDocuments({ organizationId, createdAt: { $gte: startDate, $lte: endDate } })`.
  - `vouchersEarned`: `Voucher.countDocuments({ organizationId, earnedAt: { $gte: startDate, $lte: endDate } })`.
  - `vouchersRedeemed`: `Voucher.countDocuments({ organizationId, isValid: false, redeemedAt: { $gte: startDate, $lte: endDate } })`.
  - `totalRevenue`: sum of `billAmount` across `StampClaimEvent`s in range (nulls contribute 0 — same pattern as D1's `totalSpent`).
  - Returns `{ newCustomers, stampsIssued, vouchersEarned, vouchersRedeemed, totalRevenue, startDate, endDate }`.
  - Missing `startDate`/`endDate` default to **the last 30 days** (computed server-side, so the on-screen preview and the download always agree on what "default" means).
- `buildSummaryWorkbook(stats)`: builds an `.xlsx` (via the `xlsx` dependency already installed in Epic C1) with the same five metrics as rows, plus the date range used, as a `Buffer`.
- `buildCustomersWorkbook(organizationId)`: reuses the exact per-customer computation from `stampController.getCustomersList` (phone, address, lifetimeVoucherCount, totalSpent, scanHistory's most recent entry as "last visit") and writes one row per customer with the 9 columns from decision 6, as a `Buffer`.

### Routes/controller (`backend/routes/adminRoutes.js`, `backend/controllers/reportController.js`, new)

- `GET /api/admin/reports/summary?startDate=&endDate=` (`verifyToken`, `isBusinessAdmin`) → JSON `{ success: true, ...stats }`.
- `GET /api/admin/reports/summary/download?startDate=&endDate=` → same computation, streamed as `.xlsx` (`Content-Disposition: attachment; filename="summary-report.xlsx"`).
- `GET /api/admin/reports/customers/download` (no date params — always the full lifetime list) → `.xlsx` (`Content-Disposition: attachment; filename="customers-report.xlsx"`).

Date parameters arrive as ISO date strings (`YYYY-MM-DD`) from the frontend's `<input type="date">`; the service parses them into `Date` objects, defaulting to the last-30-days window when absent or invalid.

## Frontend

### `frontend/src/components/admin/AdminLayout.tsx`

`NAV` array gains two entries (after `menu`, matching the existing flat-list pattern exactly):

```tsx
  { to: "reports/summary", label: "Summary report", Icon: FileSpreadsheet },
  { to: "reports/customers", label: "Customer report", Icon: FileSpreadsheet },
```

### `frontend/src/routes/admin/AdminReportsSummary.tsx` (new)

- Two `<input type="date">` fields (start/end), defaulting to the last-30-days window computed the same way the backend defaults (so the initial on-screen numbers match what a no-params download would produce).
- On date change, re-fetches `GET /api/admin/reports/summary` with the selected range and re-renders the stat cards (same visual pattern as `AdminOverview.tsx`'s stat grid: `newCustomers`, `stampsIssued`, `vouchersEarned`, `vouchersRedeemed`, `totalRevenue`).
- "Download Excel" button hits `GET /api/admin/reports/summary/download` with the same current date range (via a raw `fetch` + Blob download, the same pattern established in Epic C1's template download — `apiRequest` always calls `response.json()`, which would corrupt a binary `.xlsx` body).

### `frontend/src/routes/admin/AdminReportsCustomers.tsx` (new)

- No table duplication (the full customer list already exists on the Customers screen) — just a short description ("Download every customer's contact info, stamp progress, and lifetime totals as an Excel file.") and a "Download Excel" button hitting `GET /api/admin/reports/customers/download`, same Blob-download pattern.

## Testing / Verification

1. **Backend**, self-contained via `tests/helpers/bootServer.js`:
   - Generate + claim a stamp with a known `billAmount` right now. Query `GET /api/admin/reports/summary` with a range covering today → the claim is counted and its amount included in revenue. Query the same endpoint with a range entirely in the future (e.g. tomorrow through tomorrow+1) → the claim is excluded (all counts 0, revenue 0). This proves both inclusion and exclusion without needing to fabricate historical timestamps through the HTTP-only claim flow.
   - `GET /api/admin/reports/summary` with an explicit range → counts match exactly what's inside that window, excluding anything outside it.
   - `GET /api/admin/reports/summary` with no params → defaults to the last-30-days window and returns non-error results.
   - `GET /api/admin/reports/summary/download` → `200`, parses back via `xlsx.read` into a sheet containing the same five metrics.
   - `GET /api/admin/reports/customers/download` → `200`, parses back with the 9 expected column headers and the right row count/values for known seeded/created customers.
   - Tenant isolation: a second tenant's reports don't include the first tenant's activity.
2. **Frontend:** `npx tsc --noEmit` clean.
3. **Browser**, tenant `coffesarowar`: open Summary report, confirm stat cards render and change when the date range changes, download the file and confirm it opens with matching numbers. Open Customers report, download, confirm the file has the 9 columns and one row per customer with correct values.

## Out of scope

D3 (contact/maps config) and D4 (featured items/events) are unaffected. No PDF export, no scheduled/emailed reports, no charts/graphs inside the Excel file — plain data rows only, matching this codebase's "functional wiring, no visual redesign" direction for the remaining epics.

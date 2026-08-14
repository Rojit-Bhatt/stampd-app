# Plan — Platform Customers page (B2)

Branch: `feat/platform-customers` (from main)

## 1. Backend service — `backend/services/platformCustomersService.js`
- `getPlatformCustomers({ search })`: `CustomerAccount.find()` (no filter, demo scale), then for each account find the `User` membership(s) via `customerAccountId`. For the row, take the membership's company/outlet names (join `Organization` via `companyId`, then `Company` via its id — memoize by id to avoid N^2), and the membership's `PointsBalance` for points/tier/redemptionCount.
- Defensive cap: 1,000 rows; set `truncated: true` if more exist.
- Return flat rows: id, name, email, phone, emailVerified, companyName, companySlug, outletName, outletSlug, points, tier, redemptionCount, joinedAt, lastActivityAt.

## 2. Excel workbook builder — extend `backend/services/platformAnalyticsService.js`
- New `buildPlatformCustomersWorkbook({ rows })` following `buildPlatformCompanyReportWorkbook` exactly (sheet name = "Customers", header row on row 1): Customer, Email, Phone, Company, Outlet, Points, Tier, Redemptions, Joined, Verified. `Verified` as Yes/No text so it sorts in Excel.

## 3. Controller — add to `backend/controllers/platformController.js`
- `getPlatformCustomers` → JSON.
- `downloadCustomersReport` → xlsx, filename `customers-report.xlsx`.
- Both wrapped in try/next(error) like the existing handlers.

## 4. Routes — `backend/routes/platformRoutes.js`
- `router.get("/customers", verifyToken, isPlatformAdmin, getPlatformCustomers)`
- `router.get("/customers/report/download", verifyToken, isPlatformAdmin, downloadCustomersReport)` — placed BEFORE generic param routes if any (none clash here).

## 5. Frontend page — `frontend/src/routes/platform/PlatformCustomers.tsx`
- Page header ("Customers" / description).
- Local state: `search` (debounced via controlled input + `useMemo` filter), `sortKey`, `sortDir`, `order` (cycling asc → desc → original, same component-level code as AdminCustomers/Redeem: click header → if same key cycle dir, third state restores original array order).
- Table using CSS variables; sticky-none needed (no horizontal overflow at desktop; check mobile and add ScrollableTable if >6 columns overflow — 8 columns, use `overflow-x-auto` wrapper at md).
- Columns: Customer, Email, Phone, Company, Outlet, Points, Redemptions, Tier, Joined, Verified (badge).
- Export button → `apiUrl("/api/platform/customers/report/download")` with `role: platform` + search as query param.
- Loading skeleton + empty state ("No customers match…" when filtered).

## 6. App route + nav
- `frontend/src/App.tsx`: `<Route path="customers" element={<PlatformCustomers />} />` under `/platform`.
- `frontend/src/components/platform/PlatformLayout.tsx`: new SECTIONS entry `customers` with tab "All customers" → `/platform/customers`.

## 7. Verify
- Lint passes. Restart backend, curl `/api/platform/customers` unauthenticated (expect 401), then login as platform admin and fetch via browser.
- Browser: login admin@stampd.co/password at /platform/login → check table content, search "asha", sort Points, export xlsx (verify file via downloads dir).

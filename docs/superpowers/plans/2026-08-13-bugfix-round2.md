# Plan — Bug-fix Round 2

Two branches; PRs merged into main at the end (squash, delete branch). Verification in the sandbox browser at localhost:3000.

## Branch 1: `fix/table-sort-whatsapp`

### Step 1 — Restore ScrollableTable wrapper on AdminCustomers (B4)
- [ ] `git checkout -b fix/table-sort-whatsapp main`
- [ ] Edit `frontend/src/routes/admin/AdminCustomers.tsx`: import `ScrollableTable, STICKY_FIRST_CELL` from `../../components/shared/ScrollableTable`; wrap the customers table (the `shadow-ambient` card containing the header grid + rows) in `<ScrollableTable minContentWidth="760px">`; add `STICKY_FIRST_CELL` to the header `<span>Customer</span>` and to the body row's first `<span>` (the avatar+name cell); add `pr-5` padding-right on the last row cell (matches PR24 style).
- [ ] Lint passes.

### Step 2 — Harden sortable headers (B1)
- [ ] Verify `cycleSort` logic: default state is already-desc on Last visit; clicking Points gives asc first. Cycle is asc→desc→default. This matches PR26 intent; no logic change needed unless dev testing shows a bug.
- [ ] Dev-test: seed demo data with varied points/redemption/last-activity values via backend seed (edit demoSeed or inject rows into `adminLeaderboard`/customers response) so order changes are visible; click each header in the browser and confirm rows reorder and icons change.
- [ ] If order change invisible due to identical values in demo data, improve demo seed variety instead of changing sort code.

### Step 3 — WhatsApp pre-filled message via api.whatsapp.com (B3)
- [ ] `frontend/src/routes/platform/landing/SectionPricing.tsx`: change `planContactHref` to return `https://api.whatsapp.com/send?phone=${toWaNumber(phone)}&text=${encodeURIComponent(planMessage(...))}`.
- [ ] `frontend/src/routes/platform/landing/WhatsAppFloat.tsx`: change `href` to `https://api.whatsapp.com/send?phone=${number}` (no text param needed for the float).
- [ ] Lint passes.

### Step 4 — Verify Branch 1 in browser
- [ ] Customers page at narrow viewport: horizontal scroll works, no distortion, first column pinned.
- [ ] Header sort clicks reorder rows with arrows updating.
- [ ] Pricing page with phone seeded: hover pricing CTAs show `api.whatsapp.com/send` href with encoded text; float button same scheme.

### Step 5 — Commit, push, PR

## Branch 2: `feat/platform-customers`

### Step 6 — Backend: platform customers endpoint
- [ ] `backend/services/platformCustomersService.js` (new): `getPlatformCustomers()` — aggregate all CustomerAccount docs (or per-company membership rows if accounts are per-company): name, email, phone, points, tier, company name, outlet name, joined date, verified status, last activity. Handle accounts existing across multiple companies (dedupe by accountId, list memberships).
- [ ] `backend/controllers/platformCustomersController.js`: GET `/api/platform/customers` (platform-auth only); optional GET `/api/platform/customers/download` Excel export (xlsx via exceljs, same pattern as reportController).
- [ ] Register routes in a `platformCustomersRoutes.js` mounted under `/api/platform`.
- [ ] Restart backend; smoke-test endpoint.

### Step 7 — Frontend: PlatformCustomers page
- [ ] New route `frontend/src/routes/platform/PlatformCustomers.tsx` mirroring the Companies page shell: page header, search input, sortable table (name/email/company/points/tier/registered), Excel export button.
- [ ] Lazy route in `App.tsx` at `/platform/customers`.
- [ ] Nav link in the platform console nav (next to Companies).
- [ ] Lint passes.

### Step 8 — Verify Branch 2 in browser
- [ ] Log in as platform admin, navigate to Customers, table renders with all accounts, search + sort work, export downloads xlsx.

### Step 9 — Commit, push, PR

## Final
- [ ] Merge both PRs to main (squash, delete branches), pull main, lint + backend smoke, browser spot-check, deliver summary.

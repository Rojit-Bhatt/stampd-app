# Epic D2 — Excel Business Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can view date-range-scoped summary stats and download two Excel reports — a Summary report and a full Customers report.

**Architecture:** A new `reportService.js` computes date-scoped aggregate stats and builds both `.xlsx` workbooks (reusing `xlsx`, already a dependency from Epic C1). The per-customer detail computation currently inlined in `stampController.getCustomersList` moves into `stampService.js` as a reusable function — both the JSON customer list and the new Customers report call the same computation, and this also fixes a pre-existing thin-controller violation exactly where this plan needs to touch it anyway.

**Tech Stack:** Node/Express, Mongoose (+ in-memory mock in dev), `xlsx`, React 19 + Vite + TS, TanStack Query.

## Global Constraints

- Every user/loyalty query includes `organizationId` — tenant isolation is the core invariant.
- Backend layering: `routes/ → controllers/ (thin) → services/ (logic) → models/`. No business logic in controllers.
- Date-range filtering applies **only** to the Summary report. The Customers report is always the full, unfiltered, lifetime-totals list.
- Summary metrics default to **the last 30 days** when no `startDate`/`endDate` are given — computed server-side so the on-screen preview and the download always agree.
- No new nested-nav UI — the two reports are two more flat entries in the existing `AdminLayout.tsx` `NAV` array, matching every other section.
- No new schema fields — every value these reports need already exists on `User`, `StampClaimEvent`, or `Voucher`.
- Commit with explicit file paths (`git add <path>`) — never `git add -A`.

---

### Task 1: Backend — report service, controller, routes

**Files:**
- Modify: `backend/services/stampService.js`
- Modify: `backend/controllers/stampController.js`
- Create: `backend/services/reportService.js`
- Create: `backend/controllers/reportController.js`
- Modify: `backend/routes/adminRoutes.js`
- Create: `backend/tests/business-reports.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `stampService.getCustomerDetailRows(organizationId): Promise<Array<{id, name, email, phone, address, customerNo, stampsEarned, lastStampedAt, validVoucherCount, lifetimeVoucherCount, totalSpent, scanHistory}>>` — the exact per-customer shape `getCustomersList` already returns, now reusable.
- Produces: `reportService.getSummaryStats(organizationId, { startDate, endDate }): Promise<{newCustomers, stampsIssued, vouchersEarned, vouchersRedeemed, totalRevenue, startDate, endDate}>`.
- Produces: `reportService.buildSummaryWorkbook(stats): Buffer`.
- Produces: `reportService.buildCustomersWorkbook(organizationId): Promise<Buffer>`.
- Produces routes: `GET /api/admin/reports/summary?startDate=&endDate=`, `GET /api/admin/reports/summary/download?startDate=&endDate=`, `GET /api/admin/reports/customers/download`.

- [ ] **Step 1: Extract the per-customer detail computation into stampService**

In `backend/services/stampService.js`, add near the bottom (before `module.exports`):

```js
const getCustomerDetailRows = async (organizationId) => {
  const customers = await User.find({ role: "customer", organizationId }).sort({ name: 1 });

  const rows = await Promise.all(
    customers.map(async (customer) => {
      const stampCard = await StampCard.findOne({ userId: customer._id, organizationId });
      const stampsEarned = stampCard ? stampCard.stampsEarned : 0;
      const lastStampedAt = stampCard ? stampCard.lastStampedAt : null;

      const validVoucherCount = (
        await Voucher.find({
          userId: customer._id,
          organizationId,
          isValid: true,
        })
      ).length;

      const lifetimeVoucherCount = await Voucher.countDocuments({
        userId: customer._id,
        organizationId,
      });

      const allEvents = await StampClaimEvent.find({ userId: customer._id, organizationId })
        .sort({ createdAt: -1 });

      const scanHistory = allEvents.slice(0, 10).map((event) => ({
        id: event._id.toString(),
        timestamp: event.createdAt,
      }));

      const totalSpent = allEvents.reduce((sum, event) => sum + (event.billAmount || 0), 0);

      const idStr = customer._id.toString();
      const suffix = idStr.substring(Math.max(0, idStr.length - 5)).toUpperCase();
      const formattedId = `NO. ${suffix.padStart(5, '0')}`;

      return {
        id: idStr,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        address: customer.address || "",
        customerNo: formattedId,
        stampsEarned,
        lastStampedAt,
        validVoucherCount,
        lifetimeVoucherCount,
        totalSpent,
        scanHistory,
      };
    })
  );

  return rows;
};
```

Add `Voucher` to the top-of-file requires if not already present (it already is, via the existing `const Voucher = require("../models/Voucher");`). Add `getCustomerDetailRows` to `module.exports`.

- [ ] **Step 2: Simplify getCustomersList to use the extracted function**

In `backend/controllers/stampController.js`, replace the entire `getCustomersList` function body:

```js
const getCustomersList = async (req, res, next) => {
  try {
    const organizationId = req.user.organizationId;
    const customers = await User.find({ role: "customer", organizationId }).sort({ name: 1 });

    const data = await Promise.all(
      customers.map(async (customer) => {
        const stampCard = await StampCard.findOne({ userId: customer._id, organizationId });
        const stampsEarned = stampCard ? stampCard.stampsEarned : 0;
        const lastStampedAt = stampCard ? stampCard.lastStampedAt : null;

        const validVoucherCount = (
          await Voucher.find({
            userId: customer._id,
            organizationId,
            isValid: true,
          })
        ).length;

        const lifetimeVoucherCount = await Voucher.countDocuments({
          userId: customer._id,
          organizationId,
        });

        const allEvents = await StampClaimEvent.find({ userId: customer._id, organizationId })
          .sort({ createdAt: -1 });

        const scanHistory = allEvents.slice(0, 10).map((event) => ({
          id: event._id.toString(),
          timestamp: event.createdAt,
        }));

        const totalSpent = allEvents.reduce((sum, event) => sum + (event.billAmount || 0), 0);

        const idStr = customer._id.toString();
        const suffix = idStr.substring(Math.max(0, idStr.length - 5)).toUpperCase();
        const formattedId = `NO. ${suffix.padStart(5, '0')}`;

        return {
          id: idStr,
          name: customer.name,
          email: customer.email,
          phone: customer.phone || "",
          address: customer.address || "",
          customerNo: formattedId,
          stampsEarned,
          lastStampedAt,
          validVoucherCount,
          lifetimeVoucherCount,
          totalSpent,
          scanHistory,
        };
      })
    );

    // Sort by last activity (most recent first)
    data.sort((a, b) => {
      const dateA = a.lastStampedAt ? new Date(a.lastStampedAt) : new Date(0);
      const dateB = b.lastStampedAt ? new Date(b.lastStampedAt) : new Date(0);
      return dateB - dateA;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
```

with:

```js
const getCustomersList = async (req, res, next) => {
  try {
    const data = await getCustomerDetailRows(req.user.organizationId);

    // Sort by last activity (most recent first)
    data.sort((a, b) => {
      const dateA = a.lastStampedAt ? new Date(a.lastStampedAt) : new Date(0);
      const dateB = b.lastStampedAt ? new Date(b.lastStampedAt) : new Date(0);
      return dateB - dateA;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
```

Update the top-of-file import: change `const { generateQRToken, claimStamp, getStampBalanceByUserId } = require("../services/stampService");` to `const { generateQRToken, claimStamp, getStampBalanceByUserId, getCustomerDetailRows } = require("../services/stampService");`.

- [ ] **Step 3: Write the failing test**

Create `backend/tests/business-reports.js`:

```js
/**
 * Excel business reports suite (Epic D2).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Drives a claim with a bill amount, then confirms the
 * summary stats are correctly scoped to a date range (inclusion via a range
 * covering today, exclusion via a range entirely in the future), and that
 * both report downloads parse back with the right shape.
 *
 * Run directly: `node tests/business-reports.js`
 */

const XLSX = require("xlsx");
const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5017 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) headers["X-Tenant-Slug"] = slug;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const email = `d2_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "D2 Tester", email, password: "password", phone: "+9779813334444", address: "45 Report Rd" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Tenant-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    const gen = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 400 } });
    const claim = await api("/api/stamps/claim", { method: "POST", token: customerToken, body: { token: gen.body.data.token } });
    check("claim with bill amount succeeds", claim.status === 200);

    const today = new Date();
    const todayStart = isoDate(today);
    const todayEnd = isoDate(new Date(today.getTime() + 24 * 60 * 60 * 1000));

    // Inclusive range: covers today, so the claim above must be counted.
    const included = await api(
      `/api/admin/reports/summary?startDate=${todayStart}&endDate=${todayEnd}`,
      { token: adminToken },
    );
    check("inclusive range -> 200", included.status === 200);
    check("inclusive range counts the new customer", included.body.newCustomers >= 1);
    check("inclusive range counts the stamp claim", included.body.stampsIssued >= 1);
    check("inclusive range includes the revenue", included.body.totalRevenue >= 400);

    // Exclusive range: entirely in the future, must exclude everything.
    const future = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);
    const futureStart = isoDate(future);
    const futureEnd = isoDate(new Date(future.getTime() + 24 * 60 * 60 * 1000));
    const excluded = await api(
      `/api/admin/reports/summary?startDate=${futureStart}&endDate=${futureEnd}`,
      { token: adminToken },
    );
    check("exclusive (future) range -> 200", excluded.status === 200);
    check("exclusive range shows 0 new customers", excluded.body.newCustomers === 0);
    check("exclusive range shows 0 stamps issued", excluded.body.stampsIssued === 0);
    check("exclusive range shows 0 revenue", excluded.body.totalRevenue === 0);

    // No params -> defaults to last 30 days, must not error and must include today's activity.
    const defaulted = await api("/api/admin/reports/summary", { token: adminToken });
    check("default range -> 200", defaulted.status === 200);
    check("default range includes today's claim", defaulted.body.stampsIssued >= 1);

    // Summary download parses back with the right values.
    const summaryDownload = await fetch(
      `${baseUrl}/api/admin/reports/summary/download?startDate=${todayStart}&endDate=${todayEnd}`,
      { headers: { Authorization: `Bearer ${adminToken}`, "X-Tenant-Slug": SLUG } },
    );
    check("summary download -> 200", summaryDownload.status === 200);
    const summaryBuf = Buffer.from(await summaryDownload.arrayBuffer());
    const summaryWb = XLSX.read(summaryBuf, { type: "buffer" });
    const summaryRows = XLSX.utils.sheet_to_json(summaryWb.Sheets[summaryWb.SheetNames[0]], { header: 1 });
    const summaryFlat = summaryRows.flat().join(" ");
    check("summary workbook mentions stamps issued", summaryFlat.toLowerCase().includes("stamps issued"));

    // Customers download parses back with the right columns and the new customer's row.
    const customersDownload = await fetch(`${baseUrl}/api/admin/reports/customers/download`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Tenant-Slug": SLUG },
    });
    check("customers download -> 200", customersDownload.status === 200);
    const customersBuf = Buffer.from(await customersDownload.arrayBuffer());
    const customersWb = XLSX.read(customersBuf, { type: "buffer" });
    const customersRows = XLSX.utils.sheet_to_json(customersWb.Sheets[customersWb.SheetNames[0]]);
    const myRow = customersRows.find((r) => r.Email === email);
    check("customers workbook has a row for the new customer", Boolean(myRow));
    check("customers row has correct phone", myRow?.Phone === "+9779813334444");
    check("customers row has correct total spent", myRow?.["Total Spent"] === 400);

    // Tenant isolation.
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const runSuffix = Date.now();
    const secondSlug = `brewhaven-${runSuffix}`;
    const secondAdminEmail = `boss+${runSuffix}@brewhaven.test`;
    await api("/api/platform/businesses", {
      method: "POST",
      slug: undefined,
      token: platformToken,
      body: {
        name: "Brew Haven",
        slug: secondSlug,
        adminName: "Haven Boss",
        adminEmail: secondAdminEmail,
        adminPassword: "password",
      },
    });
    const secondLogin = await api("/api/auth/login", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, password: "password" } });
    const secondSummary = await api(
      `/api/admin/reports/summary?startDate=${todayStart}&endDate=${todayEnd}`,
      { slug: secondSlug, token: secondLogin.body.token },
    );
    check("second tenant's summary shows 0 (unaffected by coffesarowar's activity)", secondSummary.body.stampsIssued === 0);
  } finally {
    stop();
  }

  if (failures) { console.error(`business-reports: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("business-reports: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run: `cd backend && node tests/business-reports.js`
Expected: FAIL — `/api/admin/reports/*` routes don't exist yet (404s).

- [ ] **Step 4: Implement reportService**

Create `backend/services/reportService.js`:

```js
const XLSX = require("xlsx");
const User = require("../models/User");
const Voucher = require("../models/Voucher");
const StampClaimEvent = require("../models/StampClaimEvent");
const { getCustomerDetailRows } = require("./stampService");

const DAY_MS = 24 * 60 * 60 * 1000;

// Parses "YYYY-MM-DD" query params into a [start, end] Date range, defaulting
// to the last 30 days when either is missing or invalid.
const resolveDateRange = (startDateParam, endDateParam) => {
  const now = new Date();
  let start = startDateParam ? new Date(startDateParam) : null;
  let end = endDateParam ? new Date(endDateParam) : null;

  if (!start || Number.isNaN(start.getTime())) {
    start = new Date(now.getTime() - 30 * DAY_MS);
  }
  if (!end || Number.isNaN(end.getTime())) {
    end = now;
  } else {
    // Treat the end date as inclusive of its whole day.
    end = new Date(end.getTime() + DAY_MS - 1);
  }

  return { start, end };
};

const getSummaryStats = async (organizationId, { startDate, endDate } = {}) => {
  const { start, end } = resolveDateRange(startDate, endDate);
  const range = { $gte: start, $lte: end };

  const newCustomers = await User.countDocuments({
    role: "customer",
    organizationId,
    createdAt: range,
  });

  const stampsIssued = await StampClaimEvent.countDocuments({
    organizationId,
    createdAt: range,
  });

  const vouchersEarned = await Voucher.countDocuments({
    organizationId,
    earnedAt: range,
  });

  const vouchersRedeemed = await Voucher.countDocuments({
    organizationId,
    isValid: false,
    redeemedAt: range,
  });

  const eventsInRange = await StampClaimEvent.find({ organizationId, createdAt: range });
  const totalRevenue = eventsInRange.reduce((sum, e) => sum + (e.billAmount || 0), 0);

  return {
    newCustomers,
    stampsIssued,
    vouchersEarned,
    vouchersRedeemed,
    totalRevenue,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
};

const buildSummaryWorkbook = (stats) => {
  const aoa = [
    ["Metric", "Value"],
    ["Date range", `${stats.startDate} to ${stats.endDate}`],
    ["New customers", stats.newCustomers],
    ["Stamps issued", stats.stampsIssued],
    ["Vouchers earned", stats.vouchersEarned],
    ["Vouchers redeemed", stats.vouchersRedeemed],
    ["Total revenue", stats.totalRevenue],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Summary");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

const buildCustomersWorkbook = async (organizationId) => {
  const rows = await getCustomerDetailRows(organizationId);

  const aoa = [
    ["Name", "Email", "Phone", "Address", "Customer #", "Current Stamps", "Lifetime Vouchers", "Total Spent", "Last Visit"],
    ...rows.map((r) => [
      r.name,
      r.email,
      r.phone,
      r.address,
      r.customerNo,
      r.stampsEarned,
      r.lifetimeVoucherCount,
      r.totalSpent,
      r.lastStampedAt ? new Date(r.lastStampedAt).toISOString().slice(0, 10) : "",
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Customers");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

module.exports = {
  getSummaryStats,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
};
```

- [ ] **Step 5: Implement the controller**

Create `backend/controllers/reportController.js`:

```js
const { getSummaryStats, buildSummaryWorkbook, buildCustomersWorkbook } = require("../services/reportService");

const getSummary = async (req, res, next) => {
  try {
    const stats = await getSummaryStats(req.user.organizationId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
};

const downloadSummary = async (req, res, next) => {
  try {
    const stats = await getSummaryStats(req.user.organizationId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    const buffer = buildSummaryWorkbook(stats);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"summary-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const downloadCustomers = async (req, res, next) => {
  try {
    const buffer = await buildCustomersWorkbook(req.user.organizationId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"customers-report.xlsx\"");
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
  downloadSummary,
  downloadCustomers,
};
```

- [ ] **Step 6: Wire the routes**

In `backend/routes/adminRoutes.js`, add the import:

```js
const { getSummary, downloadSummary, downloadCustomers } = require("../controllers/reportController");
```

Add the three routes (near the other `/reports`-adjacent or at the end, before `module.exports`):

```js
router.get("/reports/summary", verifyToken, isBusinessAdmin, getSummary);
router.get("/reports/summary/download", verifyToken, isBusinessAdmin, downloadSummary);
router.get("/reports/customers/download", verifyToken, isBusinessAdmin, downloadCustomers);
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && node tests/business-reports.js`
Expected: `business-reports: all PASS`.

- [ ] **Step 8: Add to the test suite**

In `backend/package.json`, append to the `test` script:

```
"test": "node tests/integration-qa.js && node tests/run-voucher-test.js && node tests/multi-tenant-isolation.js && node tests/auth-email-flow.js && node tests/min-bill-amount.js && node tests/menu-import.js && node tests/customer-detail.js && node tests/business-reports.js",
```

Run: `cd backend && npm test`
Expected: all eight suites pass, exit 0.

- [ ] **Step 9: Commit**

```bash
git add backend/services/stampService.js backend/controllers/stampController.js backend/services/reportService.js backend/controllers/reportController.js backend/routes/adminRoutes.js backend/tests/business-reports.js backend/package.json
git commit -m "feat(reports): summary + customers Excel reports with date-range scoping"
```

---

### Task 2: Frontend — reports nav + screens

**Files:**
- Modify: `frontend/src/components/admin/AdminLayout.tsx`
- Create: `frontend/src/routes/admin/AdminReportsSummary.tsx`
- Create: `frontend/src/routes/admin/AdminReportsCustomers.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/reports/summary?startDate=&endDate=`, `GET /api/admin/reports/summary/download?startDate=&endDate=`, `GET /api/admin/reports/customers/download` (Task 1).
- Consumes: `getTenantSlug` from `../../lib/api` (already used for the Blob-download pattern established in Epic C1's `MenuManagement.tsx`).

- [ ] **Step 1: Add the nav entries**

In `frontend/src/components/admin/AdminLayout.tsx`, add `FileSpreadsheet` to the lucide-react import: change `import { LayoutDashboard, QrCode, TicketCheck, Users, Stamp, Palette, UtensilsCrossed, LogOut } from "lucide-react";` to `import { LayoutDashboard, QrCode, TicketCheck, Users, Stamp, Palette, UtensilsCrossed, FileSpreadsheet, LogOut } from "lucide-react";`.

Add two entries to `NAV`, after the `menu` entry:

```tsx
const NAV = [
  { to: "", end: true, label: "Overview", Icon: LayoutDashboard },
  { to: "generate", label: "Generate stamp", Icon: QrCode },
  { to: "redeem", label: "Redeem voucher", Icon: TicketCheck },
  { to: "customers", label: "Customers", Icon: Users },
  { to: "program", label: "Stamp program", Icon: Stamp },
  { to: "branding", label: "Branding", Icon: Palette },
  { to: "menu", label: "Menu", Icon: UtensilsCrossed },
  { to: "reports/summary", label: "Summary report", Icon: FileSpreadsheet },
  { to: "reports/customers", label: "Customer report", Icon: FileSpreadsheet },
];
```

- [ ] **Step 2: Create the Summary report screen**

Create `frontend/src/routes/admin/AdminReportsSummary.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { apiRequest, getTenantSlug } from "../../lib/api";

interface SummaryStats {
  newCustomers: number;
  stampsIssued: number;
  vouchersEarned: number;
  vouchersRedeemed: number;
  totalRevenue: number;
  startDate: string;
  endDate: string;
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function AdminReportsSummary() {
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);

  const { data: stats, isLoading } = useQuery<SummaryStats>({
    queryKey: ["adminReportsSummary", startDate, endDate],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean } & SummaryStats>(
        `/api/admin/reports/summary?startDate=${startDate}&endDate=${endDate}`,
        { role: "admin" },
      );
      return res;
    },
  });

  const download = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const slug = getTenantSlug();
    const res = await fetch(
      `/api/admin/reports/summary/download?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${token}`, ...(slug ? { "X-Tenant-Slug": slug } : {}) } },
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "summary-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: "New customers", val: stats?.newCustomers ?? "—" },
    { label: "Stamps issued", val: stats?.stampsIssued ?? "—" },
    { label: "Vouchers earned", val: stats?.vouchersEarned ?? "—" },
    { label: "Vouchers redeemed", val: stats?.vouchersRedeemed ?? "—" },
    { label: "Total revenue", val: stats?.totalRevenue ?? "—" },
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Summary report</h1>
      <p className="mb-6 text-[var(--muted)]">Business activity for the selected date range.</p>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
        </label>
        <button
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-[12px] px-5 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          <Download className="h-4 w-4" /> Download Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-2 text-[13px] text-[var(--muted)]">{c.label}</div>
            <div className="font-display text-[26px] font-extrabold leading-none">
              {isLoading ? "…" : c.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the Customers report screen**

Create `frontend/src/routes/admin/AdminReportsCustomers.tsx`:

```tsx
import { Download } from "lucide-react";
import { getTenantSlug } from "../../lib/api";

export default function AdminReportsCustomers() {
  const download = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const slug = getTenantSlug();
    const res = await fetch("/api/admin/reports/customers/download", {
      headers: { Authorization: `Bearer ${token}`, ...(slug ? { "X-Tenant-Slug": slug } : {}) },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[560px]">
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Customer report</h1>
      <p className="mb-6 text-[var(--muted)]">
        Download every customer's contact info, stamp progress, and lifetime totals as an Excel file.
      </p>
      <button
        onClick={download}
        className="inline-flex items-center gap-1.5 rounded-[12px] px-5 py-3 text-sm font-bold text-white"
        style={{ background: "var(--brand)" }}
      >
        <Download className="h-4 w-4" /> Download Excel
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire the routes**

In `frontend/src/App.tsx`, add the lazy imports alongside the other admin route imports:

```tsx
const AdminReportsSummary = lazy(() => import('./routes/admin/AdminReportsSummary'));
const AdminReportsCustomers = lazy(() => import('./routes/admin/AdminReportsCustomers'));
```

Add the two routes inside the existing `<AdminGuard><AdminLayout /></AdminGuard>`-wrapped `<Route path="admin" ...>` block, alongside `menu`:

```tsx
<Route path="reports/summary" element={<AdminReportsSummary />} />
<Route path="reports/customers" element={<AdminReportsCustomers />} />
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Verify in the browser**

Start the backend (`cd backend && MONGODB_URI= node server.js`) and the frontend (`cd frontend && npm run dev`). Log in to `/coffesarowar/admin/login` as `barista@mansarowar.cafe` / `password`:
- "Summary report" and "Customer report" appear in the sidebar nav.
- Summary report: stat cards render with real numbers; changing either date input re-fetches and updates the cards; "Download Excel" produces a `summary-report.xlsx` file.
- Customer report: "Download Excel" produces a `customers-report.xlsx` file with one row per customer.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/AdminLayout.tsx frontend/src/routes/admin/AdminReportsSummary.tsx frontend/src/routes/admin/AdminReportsCustomers.tsx frontend/src/App.tsx
git commit -m "feat(admin-fe): summary + customer report screens with Excel download"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suite green**

Run: `cd backend && npm test`
Expected: all eight suites PASS, exit 0.

- [ ] **Step 2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end browser walkthrough**

With `npm run dev` running, on tenant `coffesarowar`: generate + claim a couple of stamps with distinct bill amounts, then confirm the Summary report's stat cards reflect that activity within the default 30-day window, download both reports, and open each downloaded file to confirm the numbers/rows match what's shown on screen and in the Customers screen.

- [ ] **Step 4: Commit any final fixes, then finish**

```bash
git add -A
git commit -m "chore(reports): verification pass fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** two separate reports/downloads (Task 1 Steps 4-6, Task 2 Steps 2-3), flat nav entries not nested (Task 2 Step 1), date-range scoping only on Summary (Task 1's `getSummaryStats`, `getCustomerDetailRows` takes no date params), default last-30-days (`resolveDateRange`), on-screen stat cards + download (Task 2 Step 2), 9 customer columns (Task 1's `buildCustomersWorkbook` aoa header row), tenant isolation tested (Task 1's test). No gaps against the spec.
- **Fixed a real pre-existing issue while touching this code:** `getCustomersList`'s business logic lived directly in the controller (violating the stated "no business logic in controllers" constraint from every prior plan) — Task 1 Step 1-2 extracts it into `stampService.getCustomerDetailRows`, which both the existing endpoint and the new Customers report now share. This was necessary for D2's own reuse requirement, not an unrelated refactor.
- **Type consistency:** `SummaryStats` (Task 2's frontend interface) matches `getSummaryStats`'s return shape (Task 1) field-for-field. `buildCustomersWorkbook`'s header row order (Task 1 Step 4) matches the spec's decision 6 column order exactly, and the test's `myRow?.["Total Spent"]` assertion (Task 1 Step 3) matches that exact header string.
- **Resolved the spec's one open test-design question concretely:** date-range inclusion/exclusion is tested via a today-covering range vs. a future-only range, not by fabricating historical timestamps through the HTTP-only claim flow (Task 1 Step 3).

# Tier Distribution Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the Tier System (Phase 1) as an actual analytics view — a tier-count breakdown at both outlet level (`AdminOverview.tsx`) and platform level (`PlatformAnalytics.tsx`), plus a `Tier` column on the customer Excel export.

**Architecture:** Two new read-only aggregation functions (`reportService.getTierDistributionStats` for one outlet, `platformAnalyticsService`'s cross-tenant tally for the whole platform) reuse Phase 1's `tierService.resolveTier` exactly as-is — no changes to tier-computation logic. Both are pure reads over existing data; no schema changes.

**Tech Stack:** Node/Express backend (mock-Mongoose in dev/test), React 19 + TS + Recharts frontend, plain-`node` integration tests booted against the real server.

## Global Constraints

- Mock DB query support is **top-level equality, `$or`, `$lte`, `$gte` only** — no other operators.
- **No `findById`** — use `findOne({ _id })`.
- `tierService.resolveTier(organizationId, customerId, { org, earns } = {})` is reused exactly as Phase 1 left it — no signature or logic changes.
- `TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"]` is exported from `backend/config/platform.js` — the fixed label set, reused for tallying (order doesn't matter for a count tally).
- Platform-level analytics never expose which specific tenant a customer belongs to — aggregate counts only, matching every existing metric in `platformAnalyticsService.js`.
- New backend test suites must be **added to `backend/package.json`'s `test` chain** or they never run.
- Business logic lives in `services/`; controllers stay thin (parse request → call service → format response).
- No code comments except where a genuinely non-obvious constraint or invariant needs explaining.

---

## Task 1: Outlet-level tier distribution (backend)

**Files:**
- Modify: `backend/services/reportService.js`
- Modify: `backend/controllers/reportController.js`
- Modify: `backend/routes/adminRoutes.js`
- Create: `backend/tests/tier-distribution.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `getCustomerDetailRows(organizationId)` (existing, from `pointsService.js`, already returns `tier: string|null` per row per Phase 1); `TIER_LABELS` from `backend/config/platform.js`.
- Produces: `reportService.getTierDistributionStats(organizationId) => Promise<{Bronze: number, Silver: number, Gold: number, Platinum: number, untiered: number}>`. `GET /api/admin/tier-distribution` → `{success: true, Bronze, Silver, Gold, Platinum, untiered}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/tier-distribution.js`:

```js
/**
 * Tier distribution analytics suite (outlet-level).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Configures tier thresholds on durbarmarg, drives two
 * customers to different tiers plus one untiered customer, and confirms
 * the distribution tallies correctly.
 *
 * Run directly: `node tests/tier-distribution.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5031 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { tierThresholds: { Bronze: { minVisits: 1, minSpend: 100 }, Silver: { minVisits: 2, minSpend: 700 } } },
    });

    // Customer A: two earns (800 total) -> Silver.
    const emailA = `dist_a_${Date.now()}@test.co`;
    await api("/api/auth/register", { method: "POST", body: { name: "Dist A", email: emailA, password: "password123", phone: "9811111111" } });
    const mintA = await api("/__test__/mint-token", { method: "POST", body: { email: emailA, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mintA.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const loginA = await api("/api/auth/login", { method: "POST", body: { email: emailA, password: "password123" } });
    const tokenA = loginA.body.token;
    const genA1 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 500 } });
    await api("/api/points/claim", { method: "POST", token: tokenA, body: { token: genA1.body.data.token } });
    const genA2 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 300 } });
    await api("/api/points/claim", { method: "POST", token: tokenA, body: { token: genA2.body.data.token } });

    // Customer B: one earn (500) -> Bronze.
    const emailB = `dist_b_${Date.now()}@test.co`;
    await api("/api/auth/register", { method: "POST", body: { name: "Dist B", email: emailB, password: "password123", phone: "9811111112" } });
    const mintB = await api("/__test__/mint-token", { method: "POST", body: { email: emailB, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mintB.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const loginB = await api("/api/auth/login", { method: "POST", body: { email: emailB, password: "password123" } });
    const tokenB = loginB.body.token;
    const genB1 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 500 } });
    await api("/api/points/claim", { method: "POST", token: tokenB, body: { token: genB1.body.data.token } });

    // Customer C: no earns at all -> untiered.
    const emailC = `dist_c_${Date.now()}@test.co`;
    await api("/api/auth/register", { method: "POST", body: { name: "Dist C", email: emailC, password: "password123", phone: "9811111113" } });
    const mintC = await api("/__test__/mint-token", { method: "POST", body: { email: emailC, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mintC.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const tokenC = (await api("/api/auth/login", { method: "POST", body: { email: emailC, password: "password123" } })).body.token;
    // C earns nothing but still needs at least one earn to appear in the
    // customer list at all (getCustomerDetailRows returns every customer
    // now, per the production-readiness fix — so C is visible with 0
    // earns and correctly falls under "untiered").

    const dist = await api("/api/admin/tier-distribution", { token: adminToken });
    check("tier-distribution -> 200", dist.status === 200);
    check("Bronze count includes customer B", dist.body.Bronze === 1);
    check("Silver count includes customer A", dist.body.Silver === 1);
    check("Gold count is 0", dist.body.Gold === 0);
    check("Platinum count is 0", dist.body.Platinum === 0);
    check("untiered count includes customer C (and any pre-existing zero-earn seeded customers)", dist.body.untiered >= 1);
  } finally {
    stop();
  }

  if (failures) { console.error(`tier-distribution: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("tier-distribution: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 2: Wire the new suite into `backend/package.json`**

Append ` && node tests/tier-distribution.js` to the end of the `"test"` script string in `backend/package.json` (currently ends with `... && node tests/tier-system.js`).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/tier-distribution.js`
Expected: FAIL on the `dist.status === 200` check onward — `/api/admin/tier-distribution` doesn't exist yet (404), so `dist.body` is `null` and every subsequent check throws or fails.

- [ ] **Step 4: Add `getTierDistributionStats` to `backend/services/reportService.js`**

Add this import at the top of the file, alongside the existing requires:

```js
const { TIER_LABELS } = require("../config/platform");
```

Add this function (near `getDashboardStats`, before `buildSummaryWorkbook`):

```js
const getTierDistributionStats = async (organizationId) => {
  const rows = await getCustomerDetailRows(organizationId);
  const counts = { untiered: 0 };
  for (const label of TIER_LABELS) counts[label] = 0;

  for (const row of rows) {
    if (row.tier && Object.prototype.hasOwnProperty.call(counts, row.tier)) {
      counts[row.tier] += 1;
    } else {
      counts.untiered += 1;
    }
  }

  return counts;
};
```

Add `getTierDistributionStats` to the `module.exports` object (alongside `getDashboardStats`).

- [ ] **Step 5: Add the controller function to `backend/controllers/reportController.js`**

Add `getTierDistributionStats` to the existing destructured import at the top:

```js
const {
  getSummaryStats,
  getDashboardStats,
  getTierDistributionStats,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
  buildTransactionsWorkbook,
} = require("../services/reportService");
```

Add a new controller function (matching the `getDashboard` pattern exactly):

```js
const getTierDistribution = async (req, res, next) => {
  try {
    const stats = await getTierDistributionStats(req.user.organizationId);
    res.status(200).json({ success: true, ...stats });
  } catch (error) {
    next(error);
  }
};
```

Add `getTierDistribution` to the `module.exports` object.

- [ ] **Step 6: Wire the route in `backend/routes/adminRoutes.js`**

Add `getTierDistribution` to the existing destructured import from `../controllers/reportController`:

```js
const {
  getDashboard,
  getSummary,
  getTierDistribution,
  downloadSummary,
  downloadCustomers,
  downloadTransactions,
} = require("../controllers/reportController");
```

Add the route, alongside the existing `/dashboard-stats` line:

```js
router.get("/tier-distribution", verifyToken, isBusinessAdmin, getTierDistribution);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/tier-distribution.js`
Expected: all checks pass, `tier-distribution: all PASS`.

- [ ] **Step 8: Run related suites to confirm no regressions**

Run: `cd backend && MONGODB_URI="" node tests/customer-detail.js` and `cd backend && MONGODB_URI="" node tests/business-reports.js` (both exercise `reportService.js`/`getCustomerDetailRows`).
Expected: both pass unchanged.

- [ ] **Step 9: Commit**

```bash
git add backend/services/reportService.js backend/controllers/reportController.js backend/routes/adminRoutes.js backend/tests/tier-distribution.js backend/package.json
git commit -m "feat: add outlet-level tier distribution endpoint"
```

---

## Task 2: Tier column on the customer Excel export

**Files:**
- Modify: `backend/services/reportService.js`
- Modify: `backend/tests/tier-distribution.js`

**Interfaces:**
- Consumes: `getCustomerDetailRows`'s existing `tier` field per row.
- Produces: no new exported function — `buildCustomersWorkbook`'s output gains a `Tier` column.

- [ ] **Step 1: Write the failing test — extend `backend/tests/tier-distribution.js`**

Add this near the top of the file, alongside other requires:

```js
const ExcelJS = require("exceljs");

async function readSheetAsObjects(buffer, sheetIndex = 0) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[sheetIndex];
  const rows = [];
  sheet.eachRow((row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => values.push(cell.value));
    rows.push(values);
  });
  const header = rows[0] || [];
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}
```

Add this after the existing `dist.body.untiered` check, still inside the `try` block. Downloads return a binary `.xlsx` buffer, not JSON, so this uses a raw `fetch` directly instead of the `api()` helper (matching `business-reports.js`'s existing convention for the same reason):

```js
    const customersDownloadRaw = await fetch(`${baseUrl}/api/admin/reports/customers/download`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG },
    });
    check("customers download -> 200", customersDownloadRaw.status === 200);
    const customersBuf = Buffer.from(await customersDownloadRaw.arrayBuffer());
    const customersRows = await readSheetAsObjects(customersBuf);
    const rowA = customersRows.find((r) => r.Email === emailA);
    const rowC = customersRows.find((r) => r.Email === emailC);
    check("customers workbook has a Tier column with the right value for a Silver customer", rowA?.Tier === "Silver");
    check("customers workbook shows an em-dash for an untiered customer", rowC?.Tier === "—");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/tier-distribution.js`
Expected: FAIL on both new `Tier` checks — the column doesn't exist yet, so `rowA?.Tier`/`rowC?.Tier` are both `undefined`.

- [ ] **Step 3: Add the `Tier` column to `buildCustomersWorkbook`**

In `backend/services/reportService.js`, modify `buildCustomersWorkbook`:

```js
const buildCustomersWorkbook = async (organizationId) => {
  const rows = await getCustomerDetailRows(organizationId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customers");
  sheet.addRow([
    "Name", "Email", "Phone", "Address", "Customer #",
    "Points Balance", "Lifetime Points", "Redemptions", "Total Spent", "Last Activity", "Tier"
  ]);
  for (const r of rows) {
    sheet.addRow([
      r.name,
      r.email,
      r.phone,
      r.address,
      r.customerNo,
      r.pointsBalance,
      r.lifetimePoints,
      r.redemptionCount,
      r.totalSpent,
      r.lastActivityAt ? new Date(r.lastActivityAt).toISOString().slice(0, 10) : "",
      r.tier || "—"
    ]);
  }
  return workbook.xlsx.writeBuffer();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/tier-distribution.js`
Expected: all checks pass, including both new `Tier` column checks.

- [ ] **Step 5: Run `business-reports.js` to confirm no regressions**

Run: `cd backend && MONGODB_URI="" node tests/business-reports.js`
Expected: passes unchanged — it reads other columns by name (`Email`, `Phone`, `Total Spent`), which are unaffected by an appended column.

- [ ] **Step 6: Commit**

```bash
git add backend/services/reportService.js backend/tests/tier-distribution.js
git commit -m "feat: add Tier column to customer Excel export"
```

---

## Task 3: Platform-level tier distribution (backend)

**Files:**
- Modify: `backend/services/platformAnalyticsService.js`
- Modify: `backend/tests/tier-distribution.js`

**Interfaces:**
- Consumes: `tierService.resolveTier(organizationId, customerId, {org, earns})`; `TIER_LABELS` from `config/platform.js`.
- Produces: `platformAnalyticsService.getPlatformTierDistribution() => Promise<{Bronze, Silver, Gold, Platinum, untiered}>`, and `getPlatformAnalytics()`'s returned object gains a `tierDistribution` field of that same shape.

- [ ] **Step 1: Write the failing test — extend `backend/tests/tier-distribution.js`**

Add this near the top, alongside other requires:

```js
const { makeSiblingOutlet } = require("./helpers/makeOutlet");
```

Add this after the Excel-export checks, still inside the `try` block:

```js
    // Platform-level: a sibling outlet with NO tier thresholds configured
    // must be entirely excluded (not counted as untiered).
    const sibling = await makeSiblingOutlet(baseUrl, { label: `dist${Date.now()}` });
    const siblingEmail = `dist_sib_${Date.now()}@test.co`;
    await api("/api/auth/register", { method: "POST", slug: sibling.outletSlug, body: { name: "Dist Sib", email: siblingEmail, password: "password123", phone: "9811111114" } });
    const mintSib = await api("/__test__/mint-token", { method: "POST", body: { email: siblingEmail, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mintSib.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": sibling.outletSlug } });

    const platformLogin = await api("/api/platform/login", { method: "POST", slug: null, body: { email: "admin@stampd.co", password: "password" } });
    const platformToken = platformLogin.body.token;
    const platformAnalytics = await fetch(`${baseUrl}/api/platform/analytics`, { headers: { Authorization: `Bearer ${platformToken}` } }).then((r) => r.json());

    check("platform analytics includes tierDistribution", Boolean(platformAnalytics.tierDistribution));
    check("platform tierDistribution counts durbarmarg's Bronze customer", platformAnalytics.tierDistribution?.Bronze >= 1);
    check("platform tierDistribution counts durbarmarg's Silver customer", platformAnalytics.tierDistribution?.Silver >= 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/tier-distribution.js`
Expected: FAIL on all three new `tierDistribution` checks — the field doesn't exist yet on the platform analytics response.

- [ ] **Step 3: Add `getPlatformTierDistribution` to `backend/services/platformAnalyticsService.js`**

Add these imports at the top of the file, alongside the existing requires:

```js
const { TIER_LABELS } = require("../config/platform");
const { resolveTier } = require("./tierService");
```

Add this function (before `getPlatformAnalytics`):

```js
// Only scans outlets that have at least one tier label actually configured
// — most outlets won't, and skipping them avoids a ledger query per
// customer at outlets with nothing to compute. Reuses each qualifying
// outlet's already-fetched org/earns across all its customers (same
// {org, earns} reuse tierService.resolveTier already supports), never a
// fresh query per customer.
const getPlatformTierDistribution = async () => {
  const orgs = await Organization.find({});
  const counts = { untiered: 0 };
  for (const label of TIER_LABELS) counts[label] = 0;

  for (const org of orgs) {
    const configured = TIER_LABELS.some((label) => {
      const t = org.tierThresholds && org.tierThresholds[label];
      return t && t.minVisits !== null && t.minVisits !== undefined && t.minSpend !== null && t.minSpend !== undefined;
    });
    if (!configured) continue;

    const customers = await User.find({ role: "customer", organizationId: org._id });
    const earns = await PointsTransaction.find({ organizationId: org._id, type: "earn" });
    const earnsByCustomer = new Map();
    for (const t of earns) {
      const key = t.userId.toString();
      if (!earnsByCustomer.has(key)) earnsByCustomer.set(key, []);
      earnsByCustomer.get(key).push(t);
    }

    for (const customer of customers) {
      const customerEarns = earnsByCustomer.get(customer._id.toString()) || [];
      const tier = await resolveTier(org._id, customer._id, { org, earns: customerEarns });
      if (tier && Object.prototype.hasOwnProperty.call(counts, tier)) {
        counts[tier] += 1;
      } else {
        counts.untiered += 1;
      }
    }
  }

  return counts;
};
```

Modify `getPlatformAnalytics()` to call this and include it in the return. Add this line right before the function's final `return {` statement:

```js
  const tierDistribution = await getPlatformTierDistribution();
```

Add `tierDistribution` as a new key in the returned object literal, right after `pointsVelocity`:

```js
    pointsVelocity,
    tierDistribution
  };
```

Add `getPlatformTierDistribution` to the `module.exports` object (alongside `getPlatformAnalytics`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/tier-distribution.js`
Expected: all checks pass, including the three new platform-level checks.

- [ ] **Step 5: Run `platform-analytics.js` to confirm no regressions**

Run: `cd backend && MONGODB_URI="" node tests/platform-analytics.js`
Expected: passes unchanged — it doesn't assert on the total shape of the response strictly enough to break from an added field (confirm this by reading the test if it fails; an additive field should never break an existing assertion unless that test does an exact deep-equality check, which is not this codebase's style).

- [ ] **Step 6: Commit**

```bash
git add backend/services/platformAnalyticsService.js backend/tests/tier-distribution.js
git commit -m "feat: add platform-level tier distribution to cross-tenant analytics"
```

---

## Task 4: Outlet dashboard panel (frontend)

**Files:**
- Modify: `frontend/src/routes/admin/AdminOverview.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/tier-distribution` → `{success, Bronze, Silver, Gold, Platinum, untiered}` (Task 1).

- [ ] **Step 1: Add a `TierDistribution` type and a second `useQuery` to `AdminOverview.tsx`**

Read the file first to find the exact location of the existing `DashboardStats` interface and the existing `useQuery` call for `dashboardStats` (both referenced in this plan's reconnaissance). Add a new interface alongside `DashboardStats`:

```tsx
interface TierDistribution {
  Bronze: number;
  Silver: number;
  Gold: number;
  Platinum: number;
  untiered: number;
}
```

Add a second `useQuery` call right after the existing `dashboardStats` query, reusing the same `orgId` this file's existing query already uses:

```tsx
const { data: tierDistribution } = useQuery<TierDistribution>({
  queryKey: ["adminTierDistribution", orgId],
  queryFn: async () => {
    const res = await apiRequest<{ success: boolean } & TierDistribution>("/api/admin/tier-distribution", {
      role: "admin",
    });
    return res;
  },
});
```

- [ ] **Step 2: Add the bar-chart panel**

Add a new full-width section after the existing 2-column chart grid (the `<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">` block containing the points-velocity and points-activity panels), using the same `Panel` component already defined in this file:

```tsx
<Panel title="Tier distribution" subtitle="How many customers fall into each tier right now.">
  <ResponsiveContainer width="100%" height={220}>
    <BarChart
      data={
        tierDistribution
          ? [
              { label: "Bronze", count: tierDistribution.Bronze },
              { label: "Silver", count: tierDistribution.Silver },
              { label: "Gold", count: tierDistribution.Gold },
              { label: "Platinum", count: tierDistribution.Platinum },
              { label: "Untiered", count: tierDistribution.untiered },
            ]
          : []
      }
      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
    >
      <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
      <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
      <Tooltip
        contentStyle={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 12,
        }}
      />
      <Bar dataKey="count" name="Customers" fill="var(--primary)" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</Panel>
```

- [ ] **Step 3: Manual verification**

Run: `MONGODB_URI="" npm run dev -w backend` (per this repo's known gap: `backend/.env` may carry a real `MONGODB_URI`, so force the mock DB explicitly) and `npm run dev -w frontend` in a separate terminal (or `npm run dev` from repo root for both). Sign in as `durbarmarg@coffesarowar.com` / `password`, configure tier thresholds via the Points Program settings page (from Phase 1), confirm the new "Tier distribution" panel renders on the outlet dashboard with correct bar heights.

- [ ] **Step 4: Run `npm run lint`**

Run: `npm run lint` from repo root.
Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/admin/AdminOverview.tsx
git commit -m "feat: add tier distribution panel to outlet dashboard"
```

---

## Task 5: Platform analytics section (frontend)

**Files:**
- Modify: `frontend/src/routes/platform/PlatformAnalytics.tsx`

**Interfaces:**
- Consumes: `GET /api/platform/analytics` → now includes `tierDistribution` (Task 3), read off the same already-fetched query this page already has.

- [ ] **Step 1: Add `tierDistribution` to `PlatformAnalyticsData` and import `BarChart`/`Bar`**

Modify the recharts import line:

```tsx
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
```

Add to the `PlatformAnalyticsData` interface:

```tsx
interface TierDistribution {
  Bronze: number;
  Silver: number;
  Gold: number;
  Platinum: number;
  untiered: number;
}

interface PlatformAnalyticsData {
  companiesTotal: number;
  outletsTotal: number;
  outletsActive: number;
  customersTotal: number;
  newCustomers: DashboardMetric;
  pointsIssued: DashboardMetric;
  revenue: DashboardMetric;
  redemptions: DashboardMetric;
  pointsVelocity: { date: string; points: number }[];
  tierDistribution: TierDistribution;
}
```

- [ ] **Step 2: Add the 4th section**

Add a new full-width card section after the existing "Points velocity" card (the last `<div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">` block), before the component's closing `</div>`:

```tsx
<div className="mt-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
  <h3 className="mb-1 font-display text-lg font-bold text-[var(--ink)]">Tier distribution</h3>
  <p className="mb-4 text-[13px] text-[var(--muted)]">How many customers fall into each tier, across every business.</p>
  {isLoading || !stats ? (
    <Skeleton className="h-[220px] w-full rounded-xl" />
  ) : (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={[
          { label: "Bronze", count: stats.tierDistribution.Bronze },
          { label: "Silver", count: stats.tierDistribution.Silver },
          { label: "Gold", count: stats.tierDistribution.Gold },
          { label: "Platinum", count: stats.tierDistribution.Platinum },
          { label: "Untiered", count: stats.tierDistribution.untiered },
        ]}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--soft)" />
        <YAxis tick={{ fontSize: 12 }} stroke="var(--soft)" allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )}
</div>
```

- [ ] **Step 3: Manual verification**

Sign in as `admin@stampd.co` / `password`, navigate to the platform Analytics page, confirm the new "Tier distribution" section renders with correct counts (cross-checking against whatever outlets have tiers configured from Task 4's manual test).

- [ ] **Step 4: Run `npm run lint`**

Run: `npm run lint` from repo root.
Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/PlatformAnalytics.tsx
git commit -m "feat: add tier distribution section to platform analytics"
```

---

## Explicitly out of scope for this plan

- Any change to `tierService.resolveTier`'s logic or signature.
- Campaign performance metrics (no campaign model exists yet — Phase 4).
- Week-over-week trend on tier distribution (point-in-time snapshot only, matching `companiesTotal`/`outletsTotal`/`customersTotal`).
- Per-outlet breakdown on the platform-level view (global tally only).

# Reporting & Dashboard Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three reporting/dashboard bugs in the Stampd loyalty SaaS: (1) the company owner's cross-outlet Reports page shows all-time customer totals instead of new-customers-in-range, (2) the outlet admin dashboard's KPI tiles use a trailing-7-day window instead of "today", (3) tier resolution requires meeting a visits AND a spend threshold when the admin's intent (per explicit ask) is either/or.

**Architecture:** All three are small, independent backend service changes with matching frontend label tweaks. No new files, no new architecture — each task edits an existing service function and its covering test.

**Tech Stack:** Express/Node backend (mock-DB test suite, `node tests/*.js`), React/TanStack Query frontend.

## Global Constraints
- Backend query matching only supports top-level equality, `$or`, `$lte`, `$gte` (in-memory mock DB) — no other Mongo operators.
- Centipoints/points conversions only happen once, at the API boundary, via `toPoints()` — never re-derive money math ad hoc.
- Every new/changed backend behavior needs a covering test added to `backend/tests/`, and any new test file must be added to `backend/package.json`'s `test` script chain or it never runs.
- Follow existing code style and comments-explain-why conventions already present in the touched files.

---

### Task 1: Company Reports — date-filtered customer counts

**Files:**
- Modify: `backend/services/companyReportService.js:27-106` (`getCompanyRollup`)
- Modify: `backend/tests/company-reports-range.js` (existing test currently asserts the OLD "never range-filtered" behavior — must be updated, not left failing)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — independent.

**Context:** `getCompanyRollup(companyId, {startDate, endDate})` currently counts each outlet's `customersCount` as `User.find({organizationId, role:"customer"}).length` — every membership ever created, ignoring the date range entirely (see the comment block at `companyReportService.js:96-101` explaining this was deliberate). The fix makes it date-filtered, matching how `reportService.getSummaryStats` already counts "new customers": `User.countDocuments({role:"customer", organizationId, createdAt: range})`.

- [x] **Step 1: Update the existing test's expectations to the new (range-filtered) behavior**

Open `backend/tests/company-reports-range.js`. Find this block near the end (currently asserts customer counts are IDENTICAL regardless of range):

```javascript
    console.log("\n== Customer counts are never range-filtered ==");
    check(
      "durbarmarg's customer count is identical whether the earn is in-range or not",
      durbarmarg(excluding.body)?.customersCount === durbarmarg(including.body)?.customersCount &&
        durbarmarg(excluding.body)?.customersCount === baselineCustomers,
      {
        baselineCustomers,
        excluding: durbarmarg(excluding.body)?.customersCount,
        including: durbarmarg(including.body)?.customersCount,
      },
    );
```

Replace it with (the test already registers a new customer, "Range Tester", between the `before` and `excluding`/`including` calls — that registration's `createdAt` is "today", so it must NOT appear in the yesterday-cutoff range but MUST appear once the range widens to include today):

```javascript
    console.log("\n== Customer counts ARE range-filtered (new customers in range) ==");
    check(
      "a range ending yesterday excludes the customer registered today",
      durbarmarg(excluding.body)?.customersCount === baselineCustomers,
      { baselineCustomers, excluding: durbarmarg(excluding.body)?.customersCount },
    );
    check(
      "widening the range to include today adds exactly the 1 new customer",
      durbarmarg(including.body)?.customersCount === baselineCustomers + 1,
      { baselineCustomers, including: durbarmarg(including.body)?.customersCount },
    );
    check(
      "the company total customer count moved by the same +1",
      including.body.totals.customersCount === before.body.totals.customersCount + 1,
      { before: before.body.totals.customersCount, after: including.body.totals.customersCount },
    );
```

- [x] **Step 2: Run the test to verify it now fails against the OLD code**

Run: `cd backend && node tests/company-reports-range.js`
Expected: FAIL on the two new "range-filtered" checks (current code still returns the all-time count, so `excluding` and `including` will be equal to each other, not differing by 1).

- [x] **Step 3: Make `customersCount` date-filtered in `companyReportService.js`**

Open `backend/services/companyReportService.js`. Replace this block:

```javascript
  const perOutlet = await Promise.all(
    outlets.map(async (outlet) => {
      const customers = await User.find({ organizationId: outlet._id, role: "customer" });
      customers.forEach((c) => {
        distinctCustomerAccountIds.add(
          c.customerAccountId ? c.customerAccountId.toString() : c._id.toString()
        );
      });
```

with:

```javascript
  const perOutlet = await Promise.all(
    outlets.map(async (outlet) => {
      const customers = await User.find({
        organizationId: outlet._id,
        role: "customer",
        createdAt: { $gte: start, $lte: end }
      });
      customers.forEach((c) => {
        distinctCustomerAccountIds.add(
          c.customerAccountId ? c.customerAccountId.toString() : c._id.toString()
        );
      });
```

Then find and update the comment above `customersCount: distinctCustomerAccountIds.size` (currently explains why counts are NOT range-filtered — this is now stale and must be corrected):

```javascript
    totals: {
      ...present(totals),
      // Customer counts are a snapshot of who exists today, not a flow, so
      // they're never filtered by the date range — a customer who joined
      // outside the selected window is still a real customer of this outlet.
      // Distinct CustomerAccounts, not summed per-outlet User rows — a
      // customer loyal to two outlets of this company must count once, the
      // same reasoning platformAnalyticsService uses for its platform-wide total.
      customersCount: distinctCustomerAccountIds.size,
      outletCount: perOutlet.filter((o) => o.status !== "archived").length
    },
```

Replace the stale comment with:

```javascript
    totals: {
      ...present(totals),
      // New customers within the selected range, deduped by distinct
      // CustomerAccount — a customer loyal to two outlets of this company
      // must count once, the same reasoning platformAnalyticsService uses
      // for its platform-wide total. Matches reportService.getSummaryStats'
      // "new customers" semantics rather than an all-time snapshot.
      customersCount: distinctCustomerAccountIds.size,
      outletCount: perOutlet.filter((o) => o.status !== "archived").length
    },
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd backend && node tests/company-reports-range.js`
Expected: `company-reports-range: all PASS`, exit code 0.

- [x] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && npm test 2>&1 | tail -30`
Expected: all suites pass, no new failures.

- [x] **Step 6: Commit**

```bash
git add backend/services/companyReportService.js backend/tests/company-reports-range.js
git commit -m "$(cat <<'EOF'
fix: date-filter company reports customer counts

Company Reports previously showed all-time customer totals for every
date range selected. Now counts new customers within the selected
range, matching reportService.getSummaryStats' "new customers"
semantics (both per-outlet and the deduped company total).
EOF
)"
```

---

### Task 2: Outlet dashboard — "today" window instead of trailing 7 days

**Files:**
- Modify: `backend/services/reportService.js:96-197` (add a local-timezone day-boundary helper, change `getDashboardStats`'s window)
- Modify: `frontend/src/routes/admin/AdminOverview.tsx:210-213` (tile label text)
- Test: `backend/tests/business-reports.js` (already covers `dashboard-stats` — verify it still passes; add one boundary check)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — independent.

**Context:** `getDashboardStats` currently uses `currentStart = now - WEEK_MS` / `previousStart = now - 2*WEEK_MS` for the `newCustomers`/`pointsIssued`/`revenue` KPI tiles (`reportService.js:109-136`). The fix changes this to "today" (midnight-to-now) vs "yesterday" (midnight-to-midnight), computed in `PLATFORM_TIMEZONE` — matching the day-boundary convention `campaignService.js`'s `localDayOfWeek` already establishes for this codebase (Nepal is UTC+5:45; computing day boundaries in UTC would be visibly wrong to a Nepali business). `pointsVelocity` (14-day) and `pointsActivity` (8-week) are untouched — they already show their own explicit windows and aren't part of this bug.

- [x] **Step 1: Add a local-day-boundary helper to `reportService.js`**

Open `backend/services/reportService.js`. Near the top, find:

```javascript
const dayKey = (date) => new Date(date).toISOString().slice(0, 10);
```

Add a new helper directly after it (needs `PLATFORM_TIMEZONE` — add the import too if `reportService.js` doesn't already have it; check the top of the file for existing `require("../config/platform")` and merge into the existing destructure if present, otherwise add a new require line):

```javascript
const { PLATFORM_TIMEZONE } = require("../config/platform");

// Midnight, in PLATFORM_TIMEZONE, of the day `date` falls on — as a real UTC
// instant usable in a Mongo-style {$gte, $lte} range. Not `date.getHours()`
// tricks: the server runs in UTC in production, and Nepal is UTC+5:45, so a
// naive UTC midnight would cut "today" off 5h45m early for a Nepali business
// (the same reasoning campaignService.localDayOfWeek already documents for
// campaign day-of-week checks).
const startOfLocalDay = (date, timeZone = PLATFORM_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

  // The instant `date` reads as this wall-clock time in `timeZone`. The gap
  // between that wall-clock reading (misinterpreted as UTC) and the real UTC
  // instant IS the timezone offset at this moment (handles DST correctly
  // since it's derived from the real instant, not a fixed +5:45 constant).
  const wallClockAsUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  const offsetMs = wallClockAsUtc - date.getTime();

  const localMidnightAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0);
  return new Date(localMidnightAsUtc - offsetMs);
};
```

- [x] **Step 2: Replace the 7-day window in `getDashboardStats`**

Find:

```javascript
const getDashboardStats = async (organizationId) => {
  const now = new Date();
  const currentStart = new Date(now.getTime() - WEEK_MS);
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS);
  const currentRange = { $gte: currentStart, $lte: now };
  const previousRange = { $gte: previousStart, $lte: currentStart };
```

Replace with:

```javascript
const getDashboardStats = async (organizationId) => {
  const now = new Date();
  const currentStart = startOfLocalDay(now);
  const previousStart = new Date(currentStart.getTime() - DAY_MS);
  const currentRange = { $gte: currentStart, $lte: now };
  const previousRange = { $gte: previousStart, $lte: currentStart };
```

(`DAY_MS` already exists in this file — used by the `pointsVelocity` block a few lines down. If it's defined below this point in the file, move its `const DAY_MS = 24 * 60 * 60 * 1000;` declaration above `getDashboardStats` so it's in scope here too.)

Everything else in `getDashboardStats` (the `newCustomers`/`pointsIssued`/`revenue` calculation, `pointsVelocity`, `pointsActivity`) is unchanged — they already consume `currentRange`/`previousRange` by reference.

- [x] **Step 3: Update the response comment for accuracy**

Find the doc comment directly above the function:

```javascript
// Backs the Admin Dashboard's 4 KPI tiles + 2 charts. Every number here is
// real — no fabricated trend/activity data. The mock DB has no aggregation
// pipeline, so day/week bucketing is plain find() + JS loops.
```

Replace with:

```javascript
// Backs the Admin Dashboard's 4 KPI tiles + 2 charts. newCustomers/
// pointsIssued/revenue cover TODAY (midnight-to-now in PLATFORM_TIMEZONE)
// vs YESTERDAY for the trend badge — not a rolling week. Every number here
// is real — no fabricated trend/activity data. The mock DB has no
// aggregation pipeline, so day/week bucketing is plain find() + JS loops.
```

- [x] **Step 4: Run the existing dashboard test**

Run: `cd backend && node tests/business-reports.js`
Expected: PASS — this test's assertions (`dashboard.body?.newCustomers?.value >= 1` for a signup made "right now", `pointsIssued`/`revenue` for a bill made "right now") hold under a "today" window exactly as they did under a trailing-7-day window, since "right now" falls inside both.

- [x] **Step 5: Update the frontend tile labels**

Open `frontend/src/routes/admin/AdminOverview.tsx`. Find:

```typescript
  const flowKpis: { label: string; metric?: DashboardMetric; format?: (v: number) => string }[] = [
    { label: "New customers · 7d", metric: dashboardStats?.newCustomers },
    { label: "Points issued · 7d", metric: dashboardStats?.pointsIssued, format: formatPoints },
    { label: "Revenue · 7d", metric: dashboardStats?.revenue, format: (v) => `Rs ${v.toLocaleString("en-IN")}` },
```

Replace with:

```typescript
  const flowKpis: { label: string; metric?: DashboardMetric; format?: (v: number) => string }[] = [
    { label: "New customers · today", metric: dashboardStats?.newCustomers },
    { label: "Points issued · today", metric: dashboardStats?.pointsIssued, format: formatPoints },
    { label: "Revenue · today", metric: dashboardStats?.revenue, format: (v) => `Rs ${v.toLocaleString("en-IN")}` },
```

- [x] **Step 6: Run the full backend suite to check for regressions**

Run: `cd backend && npm test 2>&1 | tail -30`
Expected: all suites pass.

- [x] **Step 7: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [x] **Step 8: Commit**

```bash
git add backend/services/reportService.js frontend/src/routes/admin/AdminOverview.tsx
git commit -m "$(cat <<'EOF'
fix: outlet dashboard KPIs use today's window, not trailing 7 days

New customers / points issued / revenue tiles now cover midnight-to-now
in PLATFORM_TIMEZONE (trend vs yesterday), matching what the admin
expects to see as "today's numbers." Points velocity (14d) and points
activity (8wk) charts are unchanged.
EOF
)"
```

---

### Task 3: Tier resolution — either/or, not both

**Files:**
- Modify: `backend/services/tierService.js:33-42` (`resolveTier`)
- Modify: `backend/tests/tier-system.js` (add a case that distinguishes AND from OR semantics)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — independent.

**Context:** Investigated the reported "old customers' tiers look wrong" bug. `resolveTier` already recomputes fresh from the ledger on every call (confirmed: no stored/cached tier anywhere in its 4 call sites). The actual defect: `resolveTier` requires a customer to meet BOTH `minVisits` AND `minSpend` to qualify for a tier (`tierService.js:39`: `if (visits >= minVisits && spend >= minSpend) return label;`). The reported requirement is explicit: tier should update "as per either Spent rate or Visit rate" — i.e. OR semantics, not AND. A customer with many visits but modest average spend (or vice versa) currently never tiers up even though they satisfy one of the two configured criteria.

- [x] **Step 1: Add a test case proving AND vs OR matters**

Open `backend/tests/tier-system.js`. Find Test 3 (`"two earns (800 total) meets Silver (2 visits, 700 spend)"`, the customer now has 2 visits / 800 total spend from Tests 2-3) — right after that check block, add a new case using a threshold where this same customer (still 2 visits, 800 spend) meets only the SPEND side of Silver, not the (now-raised) visits side:

```javascript
    // Test 3b: meeting only the spend criterion (not visits) still qualifies
    // under either/or semantics — the admin's explicit requirement. Same
    // customer as Test 3: 2 visits, 800 total spend.
    await api("/__test__/set-tier-thresholds", {
      method: "POST",
      slug: null,
      body: {
        organizationId,
        tierThresholds: {
          Bronze: { minVisits: 1, minSpend: 100 },
          Silver: { minVisits: 5, minSpend: 700 },
          Gold: { minVisits: null, minSpend: null },
          Platinum: { minVisits: null, minSpend: null }
        }
      }
    });
    const tier3b = await api("/__test__/resolve-tier", {
      method: "POST",
      slug: null,
      body: { organizationId, userId }
    });
    check(
      "800 spend across 2 visits meets Silver on spend alone, despite Silver requiring 5 visits",
      tier3b.body.tier === "Silver",
    );
```

`organizationId` and `userId` are already in scope from earlier in `main()` (established before Test 1). Insert this block immediately after Test 3's `check(...)` call and before the "Configure Gold threshold" block that follows.

- [x] **Step 2: Run the test to verify the new case fails against the OLD code**

Run: `cd backend && node tests/tier-system.js`
Expected: FAIL on the new check — old AND logic requires 5 visits AND 700 spend; this customer has 2 visits and 800 spend, so it currently resolves to Bronze (or whatever lower tier both conditions are met for) instead of Silver.

- [x] **Step 3: Change `resolveTier` to either/or**

Open `backend/services/tierService.js`. Find:

```javascript
  for (const label of LABELS_HIGH_TO_LOW) {
    const threshold = resolvedOrg.tierThresholds[label];
    if (!threshold) continue;
    const { minVisits, minSpend } = threshold;
    if (minVisits === null || minVisits === undefined) continue;
    if (minSpend === null || minSpend === undefined) continue;
    if (visits >= minVisits && spend >= minSpend) {
      return label;
    }
  }
```

Replace with:

```javascript
  for (const label of LABELS_HIGH_TO_LOW) {
    const threshold = resolvedOrg.tierThresholds[label];
    if (!threshold) continue;
    const { minVisits, minSpend } = threshold;
    const hasVisits = minVisits !== null && minVisits !== undefined;
    const hasSpend = minSpend !== null && minSpend !== undefined;
    if (!hasVisits && !hasSpend) continue;
    // Either criterion qualifies, not both — a customer who visits often but
    // spends modestly (or vice versa) still earns tier credit for the one
    // habit they actually have. A threshold with only one side configured
    // (the other left null) is judged solely on the side that's set.
    const meetsVisits = hasVisits && visits >= minVisits;
    const meetsSpend = hasSpend && spend >= minSpend;
    if (meetsVisits || meetsSpend) {
      return label;
    }
  }
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd backend && node tests/tier-system.js`
Expected: all PASS, including the new Test 2b case, and all pre-existing cases (Test 1, 2, 3, 4, 5) still pass — each of those was already constructed to meet both criteria simultaneously, so OR semantics doesn't change their outcome.

- [x] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && npm test 2>&1 | tail -30`
Expected: all suites pass — `platformAnalyticsService.js`, `broadcastService.js`, `reportService.js`, and `pointsService.js` all call `resolveTier` and none of their existing tests construct a customer meeting only one criterion, so none should flip outcome.

- [x] **Step 6: Commit**

```bash
git add backend/services/tierService.js backend/tests/tier-system.js
git commit -m "$(cat <<'EOF'
fix: tier resolution uses either/or, not both, of visits/spend

resolveTier required a customer to meet BOTH minVisits AND minSpend to
qualify for a tier. The admin's requirement is either/or: a customer
who visits often but spends modestly (or the reverse) should still earn
tier credit for the criterion they actually meet. A threshold with only
one side configured is judged solely on that side.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all three spec items covered — company reports date filtering (Task 1), dashboard today-window (Task 2), tier investigation-and-fix (Task 3, resolved to a concrete either/or bug rather than a caching issue — investigated live in the running app and in every `resolveTier` call site before concluding).
- **Type consistency:** `startOfLocalDay(date, timeZone)` returns a `Date`, used directly in `{$gte, $lte}` ranges exactly as `currentStart`/`previousStart` were used before — no signature mismatch introduced.
- **No placeholders:** every step has literal code to write, not a description.

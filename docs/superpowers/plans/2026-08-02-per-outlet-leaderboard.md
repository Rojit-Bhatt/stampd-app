# Per-Outlet Customer Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-outlet customer leaderboard — ranked by points earned within a rolling All Time / This Month (30d) / This Week (7d) window, derived from `PointsTransaction`, never `PointsBalance` — with an admin-facing view (full names) added to `AdminCustomers.tsx` and a customer-facing view (own name full, everyone else "First L.") added to `CustomerHistory.tsx`.

**Architecture:** One shared `backend/services/leaderboardService.js` computes ranked rows (always full names) scoped to one `organizationId`. Two new routes wrap it: `GET /api/admin/leaderboard` (admin, full names, controller in `reportController.js`) and `GET /api/points/leaderboard` (customer, redacted names + `isSelf`, controller in `pointsController.js`). All redaction happens server-side. No schema changes.

**Tech Stack:** Node/Express + mongoose (in-memory mock DB in dev/test), React 19 + Vite + TS, TanStack Query, `node tests/*.js` suites.

**Spec:** `docs/superpowers/specs/2026-08-02-per-outlet-leaderboard-design.md`

## Global Constraints

- **Every loyalty query filters on `organizationId`.** No exceptions.
- **Mock DB limits:** top-level equality, `$or`, `$lte`, `$gte` only. No aggregation pipeline — grouping/ranking happens in JS after `find()`. No `findById` (use `findOne({ _id })`).
- **New test suite MUST be added to the `test` chain in `backend/package.json`** or it never runs.
- **Windows are rolling, not calendar-aligned**: `week` = trailing 7 days, `month` = trailing 30 days, both computed as `Date.now() - N * DAY_MS`. This matches `reportService.js`'s `getDashboardStats` and `tierService.js`'s trailing-365-day precedent — see the spec's "Window semantics" section for the full reasoning. Do not reach for `utils/dateRange.js`'s `resolveDateRange` (calendar/explicit-range machinery) here.
- **Ranked by summed `earn`-type `PointsTransaction.pointsCenti`, never `PointsBalance`.** `redeem` and `expire` rows never affect rank.
- **Privacy redaction (customer view only) happens entirely in the backend controller**, never in the frontend. `formatDisplayName` lives in `leaderboardService.js` and is applied by `pointsController.js`, never by `reportController.js`.
- **`durbarmarg` (`coffesarowar` company) has `earnPercent: 100` and no active campaign** — a bill of `N` earns exactly `N` points there, which is why every existing points test uses round bill amounts as expected point totals. Use `durbarmarg` for this suite too, same as `tests/points-redeem.js`/`tests/customer-detail.js`/`tests/tier-system.js`.
- Run `npm run lint` (`tsc --noEmit`) from the repo root before each frontend commit.

---

## Task 1: `leaderboardService.js` — ranking core, no window filter yet

**Files:**
- Create: `backend/services/leaderboardService.js`
- Create: `backend/tests/leaderboard.js`

**Interfaces:**
- Consumes: `PointsTransaction`, `User` models
- Produces: `getLeaderboard(organizationId, { window, limit }) -> [{ userId, name, pointsEarned, rank }]`; `formatDisplayName(fullName) -> string`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/leaderboard.js`:

```js
/**
 * Per-outlet customer leaderboard suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Drives real earns (and one redeem) through durbarmarg,
 * which has earnPercent: 100 and no active campaign — a bill of N earns
 * exactly N points, matching the round numbers every other points suite in
 * this repo already relies on (see tests/points-redeem.js).
 *
 * Run directly: `node tests/leaderboard.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5062 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const registerAndVerify = async (name, email) => {
    await api("/api/auth/register", {
      method: "POST",
      body: { name, email, password: "password", phone: `+97798${Math.floor(Math.random() * 100000000)}` },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const login = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    return { token: login.body.token, userId: login.body.user.id };
  };

  const earn = async (adminToken, customerToken, billAmount) => {
    const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount } });
    return api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
  };

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;
    const stamp = Date.now();

    const low = await registerAndVerify("Low Earner", `lb_low_${stamp}@test.co`);
    const mid = await registerAndVerify("Mid Earner", `lb_mid_${stamp}@test.co`);
    const top = await registerAndVerify("Top Earner", `lb_top_${stamp}@test.co`);

    await earn(adminToken, low.token, 300);
    await earn(adminToken, mid.token, 500);
    await earn(adminToken, top.token, 700);

    console.log("\n== Ranking ==");
    const board = await api("/api/admin/leaderboard", { token: adminToken });
    check("leaderboard resolves", board.status === 200, board.body);
    const rows = board.body?.data?.rows || [];
    const ids = rows.map((r) => r.userId);
    check(
      "ranked highest-to-lowest by summed earn points",
      ids.indexOf(top.userId) < ids.indexOf(mid.userId) && ids.indexOf(mid.userId) < ids.indexOf(low.userId),
      rows,
    );
    const topRow = rows.find((r) => r.userId === top.userId);
    check("points earned is the summed points, not centi", topRow?.pointsEarned === 700, topRow);
    check("rank is 1-indexed", rows[0]?.rank === 1, rows[0]);

    console.log("\n== Redeem never changes rank ==");
    const catalog = await api("/api/points/catalog", { token: top.token });
    const coffee = (catalog.body?.data || []).find((i) => i.name === "House Coffee");
    const redeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });
    const redeemed = await api("/api/points/redeem", {
      method: "POST", token: top.token, body: { token: redeemQr.body.data.token, itemId: coffee.id },
    });
    check("the redemption itself succeeds", redeemed.status === 200, redeemed.body);

    const boardAfterRedeem = await api("/api/admin/leaderboard", { token: adminToken });
    const topRowAfter = (boardAfterRedeem.body?.data?.rows || []).find((r) => r.userId === top.userId);
    check(
      "top earner's leaderboard points are unchanged by redeeming — this is earned, not balance",
      topRowAfter?.pointsEarned === 700,
      topRowAfter,
    );
    check("top earner still ranks first after redeeming", topRowAfter?.rank === 1, topRowAfter);

    console.log("\n== A customer with no earns is absent, not a zero row ==");
    const idle = await registerAndVerify("Idle Customer", `lb_idle_${stamp}@test.co`);
    const boardWithIdle = await api("/api/admin/leaderboard", { token: adminToken });
    check(
      "an idle customer never appears (no zero-point placeholder rows)",
      !(boardWithIdle.body?.data?.rows || []).some((r) => r.userId === idle.userId),
      boardWithIdle.body,
    );
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll leaderboard checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node backend/tests/leaderboard.js
```

Expected: fails fast with a 404 on `GET /api/admin/leaderboard` (route doesn't exist yet) — `board.status === 200` check fails, and everything downstream that reads `board.body?.data?.rows` fails too since the route 404s.

- [ ] **Step 3: Write `leaderboardService.js`**

Create `backend/services/leaderboardService.js`:

```js
const PointsTransaction = require("../models/PointsTransaction");
const User = require("../models/User");
const { toPoints } = require("../utils/pointsMath");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Ranked by points EARNED, never PointsBalance — a customer who redeemed
// everything they earned must not rank lower for having spent it. Always
// returns full names; the customer-facing route redacts one layer up
// (pointsController.js), never here, since this function is shared by both
// the admin and customer routes.
const getLeaderboard = async (organizationId, { window = "all", limit = 10 } = {}) => {
  if (!organizationId) {
    throw createHttpError("A business context is required.", 400);
  }

  const query = { organizationId, type: "earn" };
  const earns = await PointsTransaction.find(query);

  const totalsByUser = new Map();
  for (const txn of earns) {
    const key = txn.userId.toString();
    totalsByUser.set(key, (totalsByUser.get(key) || 0) + txn.pointsCenti);
  }

  if (totalsByUser.size === 0) return [];

  const userIds = [...totalsByUser.keys()];
  const users = await Promise.all(userIds.map((id) => User.findOne({ _id: id, organizationId })));
  const customerById = new Map(
    users.filter((u) => u && u.role === "customer").map((u) => [u._id.toString(), u])
  );

  return userIds
    .filter((id) => customerById.has(id))
    .map((id) => ({
      userId: id,
      name: customerById.get(id).name,
      pointsEarned: toPoints(totalsByUser.get(id))
    }))
    .sort((a, b) => (b.pointsEarned !== a.pointsEarned ? b.pointsEarned - a.pointsEarned : a.name.localeCompare(b.name)))
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
};

// "Bikash Thapa" -> "Bikash T." A mononym ("Cher") has no last name to
// initial, so it's returned as-is rather than fabricating one.
const formatDisplayName = (fullName) => {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

module.exports = { getLeaderboard, formatDisplayName };
```

Note: the `window` param is accepted but not yet applied to the query — that's Task 2. This step only has to get ranking, redeem-independence, and the no-placeholder-rows behavior working, which is everything Task 1's test asserts.

- [ ] **Step 4: Wire the admin route (minimal, no window filter)**

In `backend/controllers/reportController.js`, add the import and controller:

```js
const {
  getSummaryStats,
  getDashboardStats,
  getTierDistributionStats,
  buildSummaryWorkbook,
  buildCustomersWorkbook,
  buildTransactionsWorkbook,
} = require("../services/reportService");
const { getLeaderboard: getLeaderboardRows } = require("../services/leaderboardService");
```

and, after `getTierDistribution`:

```js
const getLeaderboard = async (req, res, next) => {
  try {
    const window = req.query.window || "all";
    const rows = await getLeaderboardRows(req.user.organizationId, { window });
    res.status(200).json({ success: true, data: { window, rows } });
  } catch (error) {
    next(error);
  }
};
```

Add `getLeaderboard` to the `module.exports` object at the bottom.

In `backend/routes/adminRoutes.js`, add `getLeaderboard` to the existing `reportController` destructure import:

```js
const {
  getDashboard,
  getSummary,
  getTierDistribution,
  downloadSummary,
  downloadCustomers,
  downloadTransactions,
  getLeaderboard
} = require("../controllers/reportController");
```

and, after the `tier-distribution` route:

```js
router.get("/leaderboard", verifyToken, isBusinessAdmin, getLeaderboard);
```

- [ ] **Step 5: Run the test again**

```bash
node backend/tests/leaderboard.js
```

Expected: all checks in this task pass — ranking order, redeem-independence, and idle-customer-absence.

- [ ] **Step 6: Commit**

```bash
git add backend/services/leaderboardService.js backend/controllers/reportController.js backend/routes/adminRoutes.js backend/tests/leaderboard.js
git commit -m "feat: add leaderboardService and admin leaderboard endpoint"
```

---

## Task 2: Rolling window filter (`all` / `month` / `week`)

**Files:**
- Modify: `backend/services/leaderboardService.js`
- Modify: `backend/tests/leaderboard.js`

**Interfaces:**
- Consumes: nothing new
- Produces: `getLeaderboard(organizationId, { window: "all" | "month" | "week" })` now actually filters; throws 400 on any other `window` value

- [ ] **Step 1: Add the failing assertions**

In `backend/tests/leaderboard.js`, after the "idle customer" block and before the closing `finally`, add. Note `create-dated-transaction` takes an `email` and `organizationId` (not a token), so `organizationId` is resolved first via the existing `/__test__/get-organization` hook:

```js
    console.log("\n== Rolling windows ==");
    const orgResp = await api("/__test__/get-organization", {
      method: "POST",
      slug: null,
      body: { companySlug: COMPANY, outletSlug: SLUG },
    });
    const organizationId = orgResp.body.organizationId;

    const recentEmail = `lb_recent_${stamp}@test.co`;
    const recent = await registerAndVerify("Recent Earner", recentEmail);
    await earn(adminToken, recent.token, 200);

    const monthOldEmail = `lb_monthold_${stamp}@test.co`;
    const monthOld = await registerAndVerify("Month Old Earner", monthOldEmail);
    await api("/__test__/create-dated-transaction", {
      method: "POST",
      slug: null,
      body: { email: monthOldEmail, organizationId, createdAtDaysAgo: 10 },
    });

    const veryOldEmail = `lb_veryold_${stamp}@test.co`;
    const veryOld = await registerAndVerify("Very Old Earner", veryOldEmail);
    await api("/__test__/create-dated-transaction", {
      method: "POST",
      slug: null,
      body: { email: veryOldEmail, organizationId, createdAtDaysAgo: 40 },
    });

    const weekBoard = await api("/api/admin/leaderboard?window=week", { token: adminToken });
    const weekIds = (weekBoard.body?.data?.rows || []).map((r) => r.userId);
    check("window=week includes a just-now earn", weekIds.includes(recent.userId), weekBoard.body);
    check("window=week excludes a 10-day-old earn", !weekIds.includes(monthOld.userId), weekBoard.body);
    check("window=week excludes a 40-day-old earn", !weekIds.includes(veryOld.userId), weekBoard.body);
    check("window echoes back in the response", weekBoard.body?.data?.window === "week", weekBoard.body);

    const monthBoard = await api("/api/admin/leaderboard?window=month", { token: adminToken });
    const monthIds = (monthBoard.body?.data?.rows || []).map((r) => r.userId);
    check("window=month includes a just-now earn", monthIds.includes(recent.userId), monthBoard.body);
    check("window=month includes a 10-day-old earn", monthIds.includes(monthOld.userId), monthBoard.body);
    check("window=month excludes a 40-day-old earn", !monthIds.includes(veryOld.userId), monthBoard.body);

    const allBoard = await api("/api/admin/leaderboard?window=all", { token: adminToken });
    const allIds = (allBoard.body?.data?.rows || []).map((r) => r.userId);
    check("window=all includes everything, including the 40-day-old earn", allIds.includes(veryOld.userId), allBoard.body);

    console.log("\n== Invalid window ==");
    const badWindow = await api("/api/admin/leaderboard?window=nonsense", { token: adminToken });
    check("an unknown window value 400s", badWindow.status === 400, badWindow.body);
```

(Delete the earlier malformed snippet from this step's first attempt — only the second, corrected block belongs in the file.)

- [ ] **Step 2: Run it to verify the new checks fail**

```bash
node backend/tests/leaderboard.js
```

Expected: the window-scoped checks fail (all three window queries currently return the same unfiltered result, so `window=week` still includes the 40-day-old earn), and `badWindow.status === 400` fails (currently 200, since the service silently ignores the query param).

- [ ] **Step 3: Implement the window filter**

In `backend/services/leaderboardService.js`, add the window constants near the top and use them in `getLeaderboard`:

```js
const DAY_MS = 24 * 60 * 60 * 1000;

// Trailing rolling windows, not calendar-aligned — matches getDashboardStats'
// and tierService's existing "how recently" precedent rather than inventing
// PLATFORM_TIMEZONE-aware calendar month/week math. See the design spec's
// "Window semantics" section for the full reasoning.
const WINDOW_MS = {
  all: null,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS
};
```

and change the top of `getLeaderboard` to:

```js
const getLeaderboard = async (organizationId, { window = "all", limit = 10 } = {}) => {
  if (!organizationId) {
    throw createHttpError("A business context is required.", 400);
  }
  if (!(window in WINDOW_MS)) {
    throw createHttpError("Unknown leaderboard window.", 400);
  }

  const query = { organizationId, type: "earn" };
  const windowMs = WINDOW_MS[window];
  if (windowMs !== null) {
    query.createdAt = { $gte: new Date(Date.now() - windowMs) };
  }

  const earns = await PointsTransaction.find(query);
```

(the rest of the function is unchanged).

- [ ] **Step 4: Run it again**

```bash
node backend/tests/leaderboard.js
```

Expected: all checks pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/leaderboardService.js backend/tests/leaderboard.js
git commit -m "feat: filter leaderboard by rolling all/month/week window"
```

---

## Task 3: Cross-tenant isolation test

**Files:**
- Modify: `backend/tests/leaderboard.js`

- [ ] **Step 1: Add the failing assertion**

Add, after the "Invalid window" block:

```js
    console.log("\n== Cross-outlet isolation ==");
    const sibling = await makeSiblingOutlet(baseUrl, { label: `lb${stamp}` });
    const siblingApi = (path, opts = {}) => api(path, { ...opts, slug: sibling.outletSlug });

    await siblingApi("/api/auth/register", {
      method: "POST",
      body: { name: "Sibling Top Earner", email: `lb_sibling_${stamp}@test.co`, password: "password", phone: `+97798${Math.floor(Math.random() * 100000000)}` },
    });
    const siblingMint = await siblingApi("/__test__/mint-token", { method: "POST", body: { email: `lb_sibling_${stamp}@test.co`, type: "email_verify" } });
    await siblingApi(`/api/auth/verify-email?token=${siblingMint.body.token}`);
    const siblingLogin = await siblingApi("/api/auth/login", { method: "POST", body: { email: `lb_sibling_${stamp}@test.co`, password: "password" } });
    const siblingCustomerToken = siblingLogin.body.token;
    const siblingUserId = siblingLogin.body.user.id;

    const siblingQr = await siblingApi("/api/admin/generate-qr", { method: "POST", token: sibling.adminToken, body: { billAmount: 900 } });
    await siblingApi("/api/points/claim", { method: "POST", token: siblingCustomerToken, body: { token: siblingQr.body.data.token } });

    const durbarmargBoardAfterSibling = await api("/api/admin/leaderboard", { token: adminToken });
    check(
      "a sibling outlet's top earner never appears on this outlet's leaderboard",
      !(durbarmargBoardAfterSibling.body?.data?.rows || []).some((r) => r.userId === siblingUserId),
      durbarmargBoardAfterSibling.body,
    );

    const siblingBoard = await siblingApi("/api/admin/leaderboard", { token: sibling.adminToken });
    check(
      "this outlet's own top earner never appears on the sibling's leaderboard",
      !(siblingBoard.body?.data?.rows || []).some((r) => r.userId === top.userId),
      siblingBoard.body,
    );
```

- [ ] **Step 2: Run it to verify it fails for the right reason**

```bash
node backend/tests/leaderboard.js
```

Expected: this should already pass, since `getLeaderboard` has always been organizationId-scoped from Task 1 — there is no code path for it to fail. Confirm both new checks read `PASS`, proving isolation was correct by construction rather than assuming it. If either check somehow fails, that's a real bug (a query missing `organizationId`), not a step to work around.

- [ ] **Step 3: No implementation change needed. Commit the test-only addition.**

```bash
git add backend/tests/leaderboard.js
git commit -m "test: assert cross-outlet isolation on the leaderboard"
```

---

## Task 4: Customer-facing route with name redaction

**Files:**
- Modify: `backend/controllers/pointsController.js`
- Modify: `backend/routes/pointsRoutes.js`
- Modify: `backend/tests/leaderboard.js`

**Interfaces:**
- Consumes: `leaderboardService.getLeaderboard`, `leaderboardService.formatDisplayName`
- Produces: `GET /api/points/leaderboard?window=` → `{ success, data: { window, rows: [{ rank, userId, name, pointsEarned, isSelf }] } }`

- [ ] **Step 1: Write the failing test**

Add, after the isolation block:

```js
    console.log("\n== Customer-facing redaction ==");
    const custBoard = await api("/api/points/leaderboard", { token: mid.token });
    check("the customer route resolves", custBoard.status === 200, custBoard.body);
    const custRows = custBoard.body?.data?.rows || [];
    const midRow = custRows.find((r) => r.userId === mid.userId);
    const topRow2 = custRows.find((r) => r.userId === top.userId);
    check("the caller's own row keeps their full name", midRow?.name === "Mid Earner", midRow);
    check("the caller's own row is flagged isSelf", midRow?.isSelf === true, midRow);
    check("another customer's row is redacted to first name + last initial", topRow2?.name === "Top E.", topRow2);
    check("another customer's row is not flagged isSelf", topRow2?.isSelf === false, topRow2);

    // Flip the caller: from top's own perspective, top is full and mid is
    // redacted — proves the redaction is per-caller, not baked into the row.
    const topPerspective = await api("/api/points/leaderboard", { token: top.token });
    const topOwnRow = (topPerspective.body?.data?.rows || []).find((r) => r.userId === top.userId);
    const midFromTop = (topPerspective.body?.data?.rows || []).find((r) => r.userId === mid.userId);
    check("from top's own request, top's row is full name", topOwnRow?.name === "Top Earner", topOwnRow);
    check("from top's own request, mid's row is redacted", midFromTop?.name === "Mid E.", midFromTop);

    console.log("\n== Mononym formatting ==");
    const monoEmail = `lb_mono_${stamp}@test.co`;
    const mono = await registerAndVerify("Cher", monoEmail);
    await earn(adminToken, mono.token, 150);
    const boardWithMono = await api("/api/points/leaderboard", { token: mid.token });
    const monoRow = (boardWithMono.body?.data?.rows || []).find((r) => r.userId === mono.userId);
    check("a mononym is left as-is, no fabricated initial or trailing space", monoRow?.name === "Cher", monoRow);

    const badWindowCustomer = await api("/api/points/leaderboard?window=nonsense", { token: mid.token });
    check("an unknown window 400s on the customer route too", badWindowCustomer.status === 400, badWindowCustomer.body);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node backend/tests/leaderboard.js
```

Expected: fails on `custBoard.status === 200` — `GET /api/points/leaderboard` doesn't exist yet (404).

- [ ] **Step 3: Add the controller**

In `backend/controllers/pointsController.js`, add to the existing `require("../services/pointsService")` block's neighboring imports:

```js
const { getLeaderboard: getLeaderboardRows, formatDisplayName } = require("../services/leaderboardService");
```

and, after `getHistory`:

```js
// Ranked by points earned, scoped to this outlet. Every row except the
// caller's own is redacted to first name + last initial — a customer did
// not sign up to have their full name shown to other customers. See
// leaderboardService.formatDisplayName and the design spec's "Where privacy
// formatting happens" section.
const getLeaderboard = async (req, res, next) => {
  try {
    const window = req.query.window || "all";
    const rows = await getLeaderboardRows(req.user.organizationId, { window });
    const formatted = rows.map((row) => {
      const isSelf = row.userId === req.user.id;
      return { ...row, name: isSelf ? row.name : formatDisplayName(row.name), isSelf };
    });
    res.status(200).json({ success: true, data: { window, rows: formatted } });
  } catch (error) {
    next(error);
  }
};
```

Add `getLeaderboard` to `module.exports`.

- [ ] **Step 4: Wire the route**

In `backend/routes/pointsRoutes.js`:

```js
const {
  claimCustomerPoints,
  redeemCustomerPoints,
  getCatalog,
  getCampaigns,
  getBalance,
  getHistory,
  getLeaderboard
} = require("../controllers/pointsController");
```

and, after the `history` route:

```js
router.get("/leaderboard", verifyToken, getLeaderboard);
```

- [ ] **Step 5: Run it again**

```bash
node backend/tests/leaderboard.js
```

Expected: all checks pass.

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/pointsController.js backend/routes/pointsRoutes.js backend/tests/leaderboard.js
git commit -m "feat: add customer-facing leaderboard endpoint with name redaction"
```

---

## Task 5: Register the suite in the test chain, run the full backend suite

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add to the test chain**

In `backend/package.json`, find the `"test"` script (a long `&&`-chained list of `node tests/*.js` calls) and append ` && node tests/leaderboard.js` at the end, after the existing final entry (`node tests/places-tool.js`).

- [ ] **Step 2: Run the full backend suite**

```bash
cd backend && npm test
```

Expected: every suite passes, including the new `leaderboard.js`, with 0 failures overall.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json
git commit -m "test: add leaderboard suite to the backend test chain"
```

---

## Task 6: Frontend — `useLeaderboard` hook

**Files:**
- Modify: `frontend/src/hooks/usePoints.ts`

**Interfaces:**
- Consumes: `GET /api/points/leaderboard?window=`
- Produces: `LeaderboardWindow`, `LeaderboardRow`, `useLeaderboard(window)`

- [ ] **Step 1: Add the hook**

In `frontend/src/hooks/usePoints.ts`, add near the other interfaces (after `PointsTransaction`):

```ts
export type LeaderboardWindow = "all" | "month" | "week";

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  pointsEarned: number;
  isSelf: boolean;
}
```

and, after `usePointsHistory`:

```ts
// Ranked by points earned, this outlet only. `isSelf` marks the caller's own
// row — the backend has already redacted every other row's name to first
// name + last initial, so the frontend never has to reason about privacy
// itself.
export function useLeaderboard(window: LeaderboardWindow) {
  const { companySlug, outletSlug } = useTenant();
  return useQuery<LeaderboardRow[]>({
    queryKey: ["leaderboard", companySlug, outletSlug, window],
    queryFn: async () => {
      const response = await apiRequest<{ success: boolean; data: { rows: LeaderboardRow[] } }>(
        `/api/points/leaderboard?window=${window}`,
      );
      return response.data.rows || [];
    },
    staleTime: 1000 * 30,
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run lint
```

Expected: clean (the hook isn't consumed anywhere yet, but it type-checks on its own).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/usePoints.ts
git commit -m "feat: add useLeaderboard hook"
```

---

## Task 7: Frontend — customer-facing section on `CustomerHistory.tsx`

**Files:**
- Modify: `frontend/src/routes/CustomerHistory.tsx`

- [ ] **Step 1: Add the imports and window state**

At the top of `frontend/src/routes/CustomerHistory.tsx`, add to the existing imports:

```tsx
import { Coins, Gift, Hourglass, Trophy } from "lucide-react";
```

```tsx
import { useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "../components/ui/segmented-control";
import {
  usePointsBalance,
  usePointsHistory,
  useLeaderboard,
  formatPoints,
  type PointsTransaction,
  type LeaderboardWindow,
} from "../hooks/usePoints";
```

(merge the `useState` import with any existing `react` import at the top of the file if one already exists — check before adding a duplicate).

Inside the component, after the existing `const { data: history = [], isLoading } = usePointsHistory();` line:

```tsx
  const [window, setWindow] = useState<LeaderboardWindow>("all");
  const { data: leaderboard = [], isLoading: leaderboardLoading } = useLeaderboard(window);
```

- [ ] **Step 2: Add the section markup**

After the closing `</ul>` + append/expiry-note block (i.e. after the whole `history.length === 0 ? ... : (...)` conditional block, still inside the outer `<div className="mx-auto w-full max-w-2xl px-5 py-6">`), add:

```tsx
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--ink)]">
            <Trophy className="h-4 w-4 text-[var(--soft)]" />
            Top earners
          </h2>
          <SegmentedControl value={window} onValueChange={(v) => setWindow(v as LeaderboardWindow)} aria-label="Leaderboard window">
            <SegmentedControlItem value="all">All time</SegmentedControlItem>
            <SegmentedControlItem value="month">This month</SegmentedControlItem>
            <SegmentedControlItem value="week">This week</SegmentedControlItem>
          </SegmentedControl>
        </div>

        {leaderboardLoading ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-6 text-center text-sm text-[var(--muted)]">
            Loading…
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-center shadow-ambient">
            <p className="text-sm text-[var(--muted)]">No one's earned points here yet this window.</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 shadow-ambient">
            {leaderboard.map((row) => (
              <li
                key={row.userId}
                className="flex items-center gap-3 border-b border-[var(--line)] py-3.5 last:border-0"
                style={row.isSelf ? { background: "var(--primary-soft)", marginInline: "-1.25rem", paddingInline: "1.25rem" } : undefined}
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--muted)]">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink)]">
                  {row.name}
                  {row.isSelf ? " (you)" : ""}
                </span>
                <span className="font-numeral text-base text-[var(--primary-deep)]">
                  {formatPoints(row.pointsEarned)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 4: Verify in the browser**

Start the backend with the mock DB (`MONGODB_URI="" npm run dev -w backend`) and the frontend, sign in as a seeded customer with existing earn history (e.g. `asha@example.com` / `password` at a `coffesarowar` outlet she's a member of), open the points/history page, confirm the "Top earners" section renders below the ledger, switching between All time / This month / This week changes the list, and the signed-in customer's own row (if present) shows their full name with "(you)" while other rows show "First L.".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/CustomerHistory.tsx
git commit -m "feat: add leaderboard section to the customer points page"
```

---

## Task 8: Frontend — admin section on `AdminCustomers.tsx`

**Files:**
- Modify: `frontend/src/routes/admin/AdminCustomers.tsx`

- [ ] **Step 1: Add imports and state**

In `frontend/src/routes/admin/AdminCustomers.tsx`, add to the imports:

```tsx
import { Trophy } from "lucide-react";
import { SegmentedControl, SegmentedControlItem } from "../../components/ui/segmented-control";
```

and a type + local interface near the top, after the existing `AdminCustomer` interface:

```tsx
type LeaderboardWindow = "all" | "month" | "week";

interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  pointsEarned: number;
}
```

Inside the component, after the existing `customers` query:

```tsx
  const [leaderboardWindow, setLeaderboardWindow] = useState<LeaderboardWindow>("all");
  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery<LeaderboardRow[]>({
    queryKey: ["adminLeaderboard", orgId, leaderboardWindow],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: { rows: LeaderboardRow[] } }>(
        `/api/admin/leaderboard?window=${leaderboardWindow}`,
        { role: "admin" },
      );
      return res.data.rows || [];
    },
  });
```

- [ ] **Step 2: Add the section markup**

After the closing `</div>` of the existing customer-table card (the `shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]` block), add:

```tsx
      <div className="mt-6 shadow-ambient overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-[var(--ink)]">
            <Trophy className="h-4 w-4 text-[var(--soft)]" />
            Top Customer Leaderboard
          </h2>
          <SegmentedControl
            value={leaderboardWindow}
            onValueChange={(v) => setLeaderboardWindow(v as LeaderboardWindow)}
            aria-label="Leaderboard window"
          >
            <SegmentedControlItem value="all">All time</SegmentedControlItem>
            <SegmentedControlItem value="month">This month</SegmentedControlItem>
            <SegmentedControlItem value="week">This week</SegmentedControlItem>
          </SegmentedControl>
        </div>

        {leaderboardLoading ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">Loading…</div>
        ) : leaderboard.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">No one's earned points yet in this window.</div>
        ) : (
          leaderboard.map((row) => (
            <div
              key={row.userId}
              className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3 last:border-b-0"
            >
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-bold text-[var(--muted)]">
                {row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--ink)]">{row.name}</span>
              <span className="text-sm font-semibold text-[var(--ink)]">{row.pointsEarned}</span>
            </div>
          ))
        )}
      </div>
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 4: Verify in the browser**

Sign in as `durbarmarg@coffesarowar.com` / `password`, open the Customers page, confirm the "Top Customer Leaderboard" card renders below the table, and switching the segmented control between All time / This month / This week updates the list.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/admin/AdminCustomers.tsx
git commit -m "feat: add leaderboard section to AdminCustomers"
```

---

## Task 9: Full verification pass

- [ ] **Step 1: Run the entire backend suite**

```bash
cd backend && npm test
```

Expected: every suite passes, `leaderboard.js` included, 0 failures.

- [ ] **Step 2: Typecheck the frontend**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: End-to-end walkthrough in the browser**

1. As `durbarmarg@coffesarowar.com`, open Customers, confirm the leaderboard card shows real seeded customers ranked by points earned, and the window toggle changes the list.
2. As a seeded customer (`bikash@example.com`, who spans multiple outlets — good for confirming outlet-scoping), open the points/history page at one of their outlets, confirm the leaderboard section renders, their own row (if present) shows their full name with "(you)", and other rows show "First L.".
3. Switch outlets (a different one `bikash` belongs to) and confirm that outlet's leaderboard is a completely independent list — no bleed-through of names or ranks from the first outlet.

- [ ] **Step 4: Commit any straggling fixes**

```bash
git status --short
```

Expected: clean, or only intentional changes.

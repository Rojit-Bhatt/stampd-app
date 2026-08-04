# Impact Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Impact page to the outlet admin console and the company owner console that answers "has this loyalty programme been worth it?" using only ledger-derived numbers.

**Architecture:** One new backend service (`impactService.js`) with two exports — per-outlet and per-company — both derived at read time from `PointsTransaction`, with no stored aggregates and no cron. Handlers go into the existing `reportController.js` (outlet) and `companyController.js` (company). One new `PointsTransaction` field, `rewardValueNpr`, snapshotted at redemption, makes rupee-denominated reward cost possible. Two new frontend pages consume the two endpoints.

**Tech Stack:** Node/Express, Mongoose (with the in-memory `mockMongoose` shim in dev/test), React 19 + Vite + TS + Tailwind v4, TanStack Query, `motion`.

**Spec:** `docs/superpowers/specs/2026-08-03-impact-insights-design.md`

## Global Constraints

- **Every loyalty query MUST include `organizationId`.** Omitting it leaks data across tenants. This is the invariant the whole product depends on.
- **The outlet route takes its tenant from the JWT (`req.user.organizationId`), never from a URL slug.** Security boundary — do not resolve the tenant from `resolveTenant` on `/api/admin`.
- **`/api/company/impact` must never be reachable from an outlet console.** It sits behind `verifyCompanySession` only.
- **Points are INTEGER centipoints** (`utils/pointsMath.js`, 1 point = 100). Centipoints never leave the backend — convert once with `toPoints()` on the way out.
- **Mock DB query limits:** top-level equality, `$or`, `$lte`, `$gte` only. Any other operator **throws**. No nested-path queries, no `findById` (use `findOne({ _id })`), no `updateMany`, no aggregation pipeline. Fetch and reduce in JS — the existing report services all do this.
- **No fabricated numbers.** No estimated staff hours, no operations-cost coefficients, no points-to-rupee conversion rate. If a figure has no source in the data, it does not ship.
- **New test suites MUST be added to `backend/package.json`'s `test` chain** or they never run.
- **Seed data that changes earn math must not land on `coffesarowar/durbarmarg`** — the existing suite earns against it ~30 times.
- **Design tokens only.** `--primary` green means value and action; `--brand` means tenant identity; the two never swap jobs. Card containers pair `rounded-3xl bg-[var(--surface)]` with `.shadow-ambient`. Numerals use `--font-numeral` (DM Serif), prose uses `--font-sans`. All animation config comes through `useMotion()` — no hand-rolled springs.
- **Backend layering is enforced:** `routes/ → controllers/ → services/ → models/`. Controllers parse and format only; all logic lives in services.

---

### Task 1: Snapshot a redemption's rupee value onto the ledger

**Files:**
- Modify: `backend/models/PointsTransaction.js` (add field after the `rewardName` block, ~line 55)
- Modify: `backend/services/pointsService.js` (the `PointsTransaction.create` call inside `redeemPoints`, ~line 582; and `formatTransaction`, ~line 649)
- Test: `backend/tests/impact.js` (new file — this task creates it and the later backend tasks extend it)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PointsTransaction.rewardValueNpr` — `Number | null`. Set to the `MenuItem.price` in force at redemption time when the redeemed item is a menu item; `null` for a `RewardItem` and for every row written before this ships. Also surfaced on transaction history rows as `rewardValueNpr: number | null`.

**Why `formatTransaction` changes too:** the field needs an observable surface to be testable on its own, and the admin transaction history row already carries `rewardName` — what that reward was worth belongs beside it. This is a deliberate small addition beyond the spec's file list.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/impact.js`:

```js
/**
 * Impact insights.
 *
 * Covers: rewardValueNpr is snapshotted from MenuItem.price at redemption
 * and stays null for a points-only RewardItem.
 *
 * Later tasks extend this suite with the outlet and company impact
 * endpoints. Run directly: `node tests/impact.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5049 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra ?? ""); failures++; }
  };
  const api = (path, { method = "GET", body, token } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    // patan, not durbarmarg: the existing suite earns against durbarmarg ~30
    // times and asserts on the resulting figures.
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "patan@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;
    check("logged in as patan admin", Boolean(adminToken), adminLogin.body);

    // A verified customer at patan.
    const email = `impact_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Impact Tester", email, password: "password", phone: "+9779800004444" },
    });
    const mint = await api("/__test__/mint-token", {
      method: "POST",
      body: { email, type: "email_verify" },
    });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const customerLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "password" },
    });
    const customerToken = customerLogin.body.token;

    const earn = async (billAmount) => {
      const qr = await api("/api/admin/generate-qr", {
        method: "POST", token: adminToken, body: { billAmount },
      });
      return api("/api/points/claim", {
        method: "POST", token: customerToken, body: { token: qr.body.data.token },
      });
    };
    const redeem = async (itemId, kind) => {
      const qr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });
      return api("/api/points/redeem", {
        method: "POST", token: customerToken,
        body: { token: qr.body.data.token, itemId, kind },
      });
    };

    console.log("\n== A menu redemption snapshots its rupee value ==");

    // Enough balance to buy House Coffee (180 points) twice over.
    await earn(20000);

    const catalog = await api("/api/points/catalog", { token: customerToken });
    const coffee = (catalog.body?.data || []).find((i) => i.name === "House Coffee");
    check("House Coffee is redeemable", Boolean(coffee), catalog.body);

    const done = await redeem(coffee.id, coffee.kind);
    check("the redemption succeeds", done.status === 200, done.body);

    const history = await api("/api/points/history", { token: customerToken });
    const redeemRow = (history.body?.data || []).find((r) => r.type === "redeem");
    check("the redeem row exists", Boolean(redeemRow), history.body);
    check(
      "it carries the menu item's rupee price, snapshotted",
      redeemRow?.rewardValueNpr === 180,
      redeemRow,
    );

    console.log("\n== A points-only reward has no rupee value ==");

    // A RewardItem has no cash price by design, so its ledger row must stay
    // null rather than record it as free.
    const created = await api("/api/admin/rewards", {
      method: "POST",
      token: adminToken,
      body: { name: `Tote ${Date.now()}`, pointsPrice: 50 },
    });
    check("the reward was created", created.status === 201 || created.status === 200, created.body);
    const rewardId = created.body?.data?.id || created.body?.data?._id;

    const toteDone = await redeem(rewardId, "reward");
    check("the reward redemption succeeds", toteDone.status === 200, toteDone.body);

    const history2 = await api("/api/points/history", { token: customerToken });
    const toteRow = (history2.body?.data || []).find((r) => r.rewardName?.startsWith("Tote"));
    check("the reward row exists", Boolean(toteRow), history2.body);
    check(
      "a points-only reward records no rupee value",
      toteRow?.rewardValueNpr === null,
      toteRow,
    );
  } finally {
    stop();
  }

  console.log(failures === 0 ? "\nAll impact checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 1 * 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node backend/tests/impact.js
```

Expected: the two `rewardValueNpr` checks FAIL (`undefined` rather than `180` / `null`). Everything else passes — if the login or catalog checks fail, stop and fix the setup before continuing, because the rest of the suite depends on them.

- [ ] **Step 3: Add the schema field**

In `backend/models/PointsTransaction.js`, immediately after the `rewardName` field:

```js
  // What this reward was worth in rupees, snapshotted at redemption. Only a
  // MenuItem has a cash price; a RewardItem is points-only by definition (a
  // tote bag is never sold), so it stays null and is excluded from every
  // rupee figure rather than counted as zero.
  //
  // Snapshotted, not looked up live, for the same reason earnPercent and
  // multiplier above are: repricing the menu next month must not rewrite
  // what last month's redemptions cost.
  //
  // Null on every row written before this field existed. Consumers report
  // their own coverage rather than treating an absent value as free.
  rewardValueNpr: { type: Number, default: null },
```

- [ ] **Step 4: Snapshot it at redemption**

In `backend/services/pointsService.js`, inside `redeemPoints`'s `PointsTransaction.create` call, immediately after `rewardName: item.name,`:

```js
            // Only a menu item has a rupee price; a RewardItem is points-only
            // by design, so this stays null rather than recording it as free.
            rewardValueNpr: item.kind === "menu" ? (item.doc.price ?? null) : null,
```

- [ ] **Step 5: Surface it on transaction history rows**

In the same file, in `formatTransaction`, immediately after `rewardName: txn.rewardName || "",`:

```js
  // What the reward was worth in rupees at the moment it was handed over.
  // Null for a points-only RewardItem and for any row predating the field.
  rewardValueNpr: txn.rewardValueNpr ?? null,
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
node backend/tests/impact.js
```

Expected: all checks PASS.

- [ ] **Step 7: Register the suite in the test chain**

In `backend/package.json`, append to the end of the `test` script value:

```
 && node tests/impact.js
```

(It currently ends with `node tests/notifications.js`.)

- [ ] **Step 8: Run the full backend suite**

```bash
npm test -w backend
```

Expected: every suite passes. `points-redeem.js` exercises the same code path this task changed — if it fails, that is a real regression, not flake.

- [ ] **Step 9: Commit**

```bash
git add backend/models/PointsTransaction.js backend/services/pointsService.js backend/tests/impact.js backend/package.json
git commit -m "feat: snapshot a redemption's rupee value onto the ledger"
```

---

### Task 2: Outlet impact service and endpoint

**Files:**
- Create: `backend/services/impactService.js`
- Modify: `backend/controllers/reportController.js` (import + handler + export)
- Modify: `backend/routes/adminRoutes.js` (import + one route, near the other `reports/` routes, ~line 80)
- Test: `backend/tests/impact.js` (extend)

**Interfaces:**
- Consumes: `PointsTransaction.rewardValueNpr` from Task 1.
- Produces:
  - `collectOutletFacts(organizationId, { since }) -> Promise<Facts>` where
    `Facts = { earnsByAccount: Map<string, { count: number, revenue: number }>, revenueTracked: number, revenueSince: number, redemptionCount: number, rewardValueRedeemed: number, valuedRedemptions: number, firstActivityAt: Date | null }`
  - `summarizeEarns(earnsByAccount) -> { customers, repeatCustomers, repeatRevenue }`
  - `buildMilestones({ customers, redemptionCount, campaignCount, retentionPercent, revenueTracked }) -> Array<{ key, label, sublabel, achieved }>`
  - `getOutletImpact(organizationId) -> Promise<OutletImpact>` (shape in Step 3)
  - `GET /api/admin/impact` returning `{ success: true, ...OutletImpact }`

**Definitions that drive every number here** (from the spec — do not quietly change them):
- A **customer** is a membership with **≥1 `earn` row**. `/explore` auto-provisions a `User` the moment someone opens an outlet's page; counting those would make retention meaningless.
- A **repeat customer** has **≥2 `earn` rows**, all-time. Two bills in one afternoon count as two — each is a separate purchase the customer chose to make.
- `repeatRevenue` counts **all** of a repeat customer's revenue, first visit included.
- Accounts are keyed by `customerAccountId` when present, falling back to the `User._id`. This is what lets Task 3 merge the same person across sibling outlets.

- [ ] **Step 1: Write the failing test**

Append inside the `try` block of `backend/tests/impact.js`, before the closing `} finally {`:

```js
    console.log("\n== Outlet impact ==");

    const impact = await api("/api/admin/impact", { token: adminToken });
    check("the impact endpoint answers", impact.status === 200, impact.body);

    // Our tester earned exactly once above, so at this point they are a
    // customer but not a repeat customer.
    check("the tester counts as a customer", impact.body?.customers >= 1, impact.body);
    check("one earn is not yet a repeat", impact.body?.repeatCustomers === 0, impact.body);
    check("retention is 0% with no repeats", impact.body?.retentionPercent === 0, impact.body);

    // A membership with no earn must not dilute the denominator: /explore
    // provisions one of these every time somebody merely opens the page.
    const lurkerEmail = `lurker_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Lurker", email: lurkerEmail, password: "password", phone: "+9779800005555" },
    });
    const beforeLurker = impact.body.customers;
    const afterLurker = await api("/api/admin/impact", { token: adminToken });
    check(
      "a membership with no earn is not a customer",
      afterLurker.body?.customers === beforeLurker,
      { before: beforeLurker, after: afterLurker.body?.customers },
    );

    // Second earn: now a repeat customer, and ALL their revenue counts as
    // repeat revenue — the first visit included.
    await earn(500);
    const impact2 = await api("/api/admin/impact", { token: adminToken });
    check("a second earn makes a repeat customer", impact2.body?.repeatCustomers === 1, impact2.body);
    check(
      "repeat revenue includes the repeat customer's first visit",
      impact2.body?.repeatRevenue === 20500,
      impact2.body,
    );
    check(
      "avg spend per repeat customer is repeat revenue over repeat customers",
      impact2.body?.avgSpendPerRepeatCustomer === 20500,
      impact2.body,
    );
    check(
      "retention is repeat over customers as a percentage",
      impact2.body?.retentionPercent === Math.round((1 / impact2.body.customers) * 100),
      impact2.body,
    );

    console.log("\n== Reward cost coverage ==");

    // Two redemptions happened above: House Coffee (valued at 180) and the
    // tote (points-only, no rupee value).
    check("both redemptions are counted", impact2.body?.redemptionCount === 2, impact2.body);
    check("only the menu one carries a value", impact2.body?.rewardValueRedeemed === 180, impact2.body);
    check(
      "coverage reports valued vs total honestly",
      impact2.body?.rewardValueCoverage?.valued === 1 &&
        impact2.body?.rewardValueCoverage?.total === 2,
      impact2.body?.rewardValueCoverage,
    );

    console.log("\n== Milestones ==");

    const byKey = Object.fromEntries((impact2.body?.milestones || []).map((m) => [m.key, m]));
    check("first redemption is achieved", byKey.first_redemption?.achieved === true, byKey);
    check("1000 customers is not achieved", byKey.customers_1000?.achieved === false, byKey);
    check("every milestone carries a label", (impact2.body?.milestones || []).every((m) => Boolean(m.label)), byKey);

    console.log("\n== Cross-tenant isolation ==");

    // durbarmarg has its own history. Its impact must share no figure that
    // could only have come from patan's ledger.
    const otherLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const otherImpact = await api("/api/admin/impact", { token: otherLogin.body.token });
    check("the sibling outlet answers too", otherImpact.status === 200, otherImpact.body);
    check(
      "a sibling outlet does not see this outlet's revenue",
      otherImpact.body?.revenueTracked !== impact2.body?.revenueTracked,
      { sibling: otherImpact.body?.revenueTracked, mine: impact2.body?.revenueTracked },
    );

    // And the endpoint is staff-only.
    const anon = await api("/api/admin/impact");
    check("impact requires authentication", anon.status === 401, anon.status);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node backend/tests/impact.js
```

Expected: FAIL — "the impact endpoint answers" reports status 404, and every check after it fails on `undefined`.

- [ ] **Step 3: Write the service**

Create `backend/services/impactService.js`:

```js
const User = require("../models/User");
const Campaign = require("../models/Campaign");
const PointsTransaction = require("../models/PointsTransaction");

// "Has this been worth it?" — the value counterpart to reportService, which
// answers "what happened?".
//
// Everything here is derived at read time from the ledger. Nothing is stored,
// nothing is scheduled, and nothing is estimated: a figure with no source in
// the data does not appear on this page. That rules out the staff-hours and
// operations-cost tiles a competitor's version of this page carries — they
// are a coefficient somebody picked, not a measurement.
//
// All-time by design. Impact is cumulative ("since I started"), so it takes
// no date range; the range-filtered view of the same flows already lives on
// the Reports pages.
//
// Fetched and reduced in JS rather than aggregated, because the mock DB has
// no aggregation pipeline — the same approach reportService already takes.

const round2 = (n) => Math.round(n * 100) / 100;

// One pass over an outlet's ledger.
//
// Earns are grouped by ACCOUNT, not by membership row: the key is
// customerAccountId when there is one, so getCompanyImpact can merge the
// same person across sibling outlets without double-counting them. Falls
// back to the User id for a legacy membership with no global account.
//
// `since` limits revenueSince only — every other figure stays all-time. It
// exists for the ROI block, which must measure revenue over the same window
// as the cost it is divided by.
const collectOutletFacts = async (organizationId, { since = null } = {}) => {
  const [txns, memberships] = await Promise.all([
    PointsTransaction.find({ organizationId }),
    User.find({ organizationId, role: "customer" })
  ]);

  const accountKeyByUserId = new Map();
  for (const m of memberships) {
    accountKeyByUserId.set(
      m._id.toString(),
      m.customerAccountId ? m.customerAccountId.toString() : m._id.toString()
    );
  }

  const earnsByAccount = new Map();
  let revenueTracked = 0;
  let revenueSince = 0;
  let redemptionCount = 0;
  let rewardValueRedeemed = 0;
  let valuedRedemptions = 0;
  let firstActivityAt = null;

  for (const txn of txns) {
    const at = new Date(txn.createdAt);
    if (!firstActivityAt || at < firstActivityAt) firstActivityAt = at;

    if (txn.type === "earn") {
      const userId = txn.userId.toString();
      const key = accountKeyByUserId.get(userId) || userId;
      const row = earnsByAccount.get(key) || { count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += txn.billAmount || 0;
      earnsByAccount.set(key, row);

      revenueTracked += txn.billAmount || 0;
      if (!since || at >= since) revenueSince += txn.billAmount || 0;
    }

    if (txn.type === "redeem") {
      redemptionCount += 1;
      // Null means "not recorded" (a points-only reward, or a row predating
      // the field), never "free" — so it is skipped, and the caller reports
      // coverage instead of quietly under-reporting.
      if (typeof txn.rewardValueNpr === "number") {
        rewardValueRedeemed += txn.rewardValueNpr;
        valuedRedemptions += 1;
      }
    }
  }

  return {
    earnsByAccount,
    revenueTracked,
    revenueSince,
    redemptionCount,
    rewardValueRedeemed,
    valuedRedemptions,
    firstActivityAt
  };
};

// A customer is someone who has actually transacted — a membership with at
// least one earn. /explore provisions a membership the moment somebody opens
// an outlet's page, so counting every membership would let browsers who never
// bought anything drag retention toward zero.
//
// A repeat customer has two or more earns. Two bills in one afternoon count
// as two: each is a separate purchase the customer chose to make, and
// de-duplicating by day would understate outlets whose regulars buy twice a
// day.
//
// repeatRevenue counts ALL of a repeat customer's revenue, first visit
// included — the claim being made is "this share of your revenue comes from
// people who come back", and their first visit is part of that relationship.
const summarizeEarns = (earnsByAccount) => {
  let customers = 0;
  let repeatCustomers = 0;
  let repeatRevenue = 0;

  for (const row of earnsByAccount.values()) {
    if (row.count < 1) continue;
    customers += 1;
    if (row.count >= 2) {
      repeatCustomers += 1;
      repeatRevenue += row.revenue;
    }
  }

  return { customers, repeatCustomers, repeatRevenue };
};

// Derived live from figures already computed — no stored state, no write
// hooks, no achievement dates. Interleaved so a new outlet sees a reachable
// next step rather than five locked count thresholds in a row.
//
// "First campaign run" reads Campaign, not Broadcast: a campaign changes what
// a bill is worth, which is what this page is about. A broadcast is a message.
const buildMilestones = ({ customers, redemptionCount, campaignCount, retentionPercent, revenueTracked }) => [
  { key: "customers_10", label: "10 customers", sublabel: "joined", achieved: customers >= 10 },
  { key: "first_redemption", label: "First reward", sublabel: "redeemed", achieved: redemptionCount >= 1 },
  { key: "customers_50", label: "50 customers", sublabel: "joined", achieved: customers >= 50 },
  { key: "first_campaign", label: "First campaign", sublabel: "run", achieved: campaignCount >= 1 },
  { key: "customers_100", label: "100 customers", sublabel: "joined", achieved: customers >= 100 },
  { key: "retention_50", label: "50% retention", sublabel: "rate achieved", achieved: (retentionPercent ?? 0) >= 50 },
  { key: "customers_500", label: "500 customers", sublabel: "joined", achieved: customers >= 500 },
  { key: "revenue_100k", label: "Rs 1 lakh", sublabel: "revenue tracked", achieved: revenueTracked >= 100000 },
  { key: "customers_1000", label: "1,000 customers", sublabel: "joined", achieved: customers >= 1000 },
  { key: "revenue_500k", label: "Rs 5 lakh", sublabel: "revenue tracked", achieved: revenueTracked >= 500000 }
];

// Shared by the outlet and company views: both derive the same ratios off
// whatever facts they were handed, so the two pages can never disagree about
// what "retention" means.
const presentImpact = ({ facts, campaignCount }) => {
  const { customers, repeatCustomers, repeatRevenue } = summarizeEarns(facts.earnsByAccount);

  // Null, not zero: an outlet with no customers has no retention rate, and
  // rendering 0% would read as a failure rather than an absence.
  const retentionPercent = customers > 0 ? Math.round((repeatCustomers / customers) * 100) : null;
  const repeatRevenuePercent = facts.revenueTracked > 0
    ? Math.round((repeatRevenue / facts.revenueTracked) * 100)
    : null;
  const avgSpendPerRepeatCustomer = repeatCustomers > 0
    ? round2(repeatRevenue / repeatCustomers)
    : null;

  return {
    customers,
    repeatCustomers,
    retentionPercent,
    revenueTracked: round2(facts.revenueTracked),
    repeatRevenue: round2(repeatRevenue),
    repeatRevenuePercent,
    avgSpendPerRepeatCustomer,
    redemptionCount: facts.redemptionCount,
    rewardValueRedeemed: round2(facts.rewardValueRedeemed),
    // The UI says "based on 34 of 51 redemptions" rather than under-reporting
    // silently. Rows predating rewardValueNpr, and every points-only reward,
    // land in `total` but not `valued`.
    rewardValueCoverage: {
      valued: facts.valuedRedemptions,
      total: facts.redemptionCount
    },
    firstActivityAt: facts.firstActivityAt ? facts.firstActivityAt.toISOString() : null,
    milestones: buildMilestones({
      customers,
      redemptionCount: facts.redemptionCount,
      campaignCount,
      retentionPercent,
      revenueTracked: facts.revenueTracked
    })
  };
};

const getOutletImpact = async (organizationId) => {
  const [facts, campaignCount] = await Promise.all([
    collectOutletFacts(organizationId),
    Campaign.countDocuments({ organizationId })
  ]);
  return presentImpact({ facts, campaignCount });
};

module.exports = {
  collectOutletFacts,
  summarizeEarns,
  buildMilestones,
  presentImpact,
  getOutletImpact
};
```

- [ ] **Step 4: Add the controller handler**

In `backend/controllers/reportController.js`, add the import below the existing `reportService` require:

```js
const { getOutletImpact } = require("../services/impactService");
```

Add the handler next to `getSummary`:

```js
// The outlet's value view. Tenant comes from the JWT, never from a slug —
// an admin can only ever see their own outlet's impact.
const getImpact = async (req, res, next) => {
  try {
    const impact = await getOutletImpact(req.user.organizationId);
    res.status(200).json({ success: true, ...impact });
  } catch (error) {
    next(error);
  }
};
```

Add `getImpact` to the `module.exports` list at the foot of the file.

- [ ] **Step 5: Add the route**

In `backend/routes/adminRoutes.js`, add `getImpact` to the destructured `require("../controllers/reportController")` block (~line 27), then add the route immediately after the existing `/reports/summary` route (~line 80):

```js
router.get("/impact", verifyToken, isBusinessAdmin, canReports, getImpact);
```

`canReports` is `requireStaffPermission("view_reports")`, already defined at line 44 — Impact is a report and must sit behind the same permission as the others.

- [ ] **Step 6: Run the test to verify it passes**

```bash
node backend/tests/impact.js
```

Expected: all checks PASS, including the isolation and 401 checks.

- [ ] **Step 7: Run the full backend suite**

```bash
npm test -w backend
```

Expected: every suite passes.

- [ ] **Step 8: Commit**

```bash
git add backend/services/impactService.js backend/controllers/reportController.js backend/routes/adminRoutes.js backend/tests/impact.js
git commit -m "feat: add outlet impact service and endpoint"
```

---

### Task 3: Company impact, ROI, and endpoint

**Files:**
- Modify: `backend/services/impactService.js` (add `buildRoi` and `getCompanyImpact`)
- Modify: `backend/controllers/companyController.js` (import + handler + export)
- Modify: `backend/routes/companyRoutes.js` (import + one route after `/reports/rollup`)
- Test: `backend/tests/impact.js` (extend)

**Interfaces:**
- Consumes: `collectOutletFacts`, `summarizeEarns`, `presentImpact` from Task 2.
- Produces:
  - `buildRoi(companyId, revenueSince) -> Promise<Roi | null>` where
    `Roi = { monthlyCost: number, monthsElapsed: number, costToDate: number, revenueSinceSubscription: number, roiMultiple: number, subscriptionStartedAt: string, planName: string }`
  - `getCompanyImpact(companyId) -> Promise<CompanyImpact>` — every field `getOutletImpact` returns, plus `roi: Roi | null` and `perOutlet: Array<{ outletId, slug, name, status, ...outlet impact fields }>` sorted by `revenueTracked` descending.
  - `GET /api/company/impact` returning `{ success: true, ...CompanyImpact }`

**The ROI formula, and why it is not the reference page's:** the reference divides all-time revenue by a *monthly* cost and prints "1X". That compares a cumulative flow to one month of cost — not a ratio. Both sides must span the same window, so revenue is filtered to on-or-after the subscription's start.

```
monthlyCost   = plan.priceNpr / (plan.billingIntervalDays / 30)
monthsElapsed = max(1, (now − subscription.createdAt) / 30 days)
costToDate    = monthlyCost × monthsElapsed
roiMultiple   = revenueSinceSubscription / costToDate
```

`subscription.createdAt` is the right window start: `subscriptionService` keeps **one** `Subscription` per company and updates it in place on renewal, so `createdAt` is when they started paying, not when they last renewed. `monthsElapsed` floors at 1 so a company three days in does not divide by ~0.1 and read as 30X. The multiple is reported as-is when below 1 — one inflated number costs the credibility of the whole page.

- [ ] **Step 1: Write the failing test**

Append inside the `try` block of `backend/tests/impact.js`, before the closing `} finally {`:

```js
    console.log("\n== Company impact ==");

    const ownerLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "owner@coffesarowar.com", password: "password" },
    });
    const ownerToken = ownerLogin.body.token;
    check("logged in as the company owner", Boolean(ownerToken), ownerLogin.body);

    const company = await api("/api/company/impact", { token: ownerToken });
    check("the company impact endpoint answers", company.status === 200, company.body);
    check("it lists every outlet", (company.body?.perOutlet || []).length >= 3, company.body?.perOutlet);
    check(
      "outlets are sorted by revenue, highest first",
      (company.body?.perOutlet || []).every(
        (o, i, arr) => i === 0 || arr[i - 1].revenueTracked >= o.revenueTracked,
      ),
      company.body?.perOutlet,
    );

    const outletRevenueSum = (company.body?.perOutlet || [])
      .reduce((sum, o) => sum + o.revenueTracked, 0);
    check(
      "company revenue equals the sum of its outlets",
      Math.abs(company.body.revenueTracked - outletRevenueSum) < 0.01,
      { company: company.body.revenueTracked, sum: outletRevenueSum },
    );

    console.log("\n== One person at two outlets counts once ==");

    // The seeded customer asha spans two outlets of this company. Summing
    // per-outlet customer counts would count her twice; the company figure
    // must de-duplicate on CustomerAccount.
    const outletCustomerSum = (company.body?.perOutlet || [])
      .reduce((sum, o) => sum + o.customers, 0);
    check(
      "company customers is not the naive sum of per-outlet customers",
      company.body.customers <= outletCustomerSum,
      { company: company.body.customers, sum: outletCustomerSum },
    );

    console.log("\n== ROI ==");

    const roi = company.body?.roi;
    if (roi) {
      check("ROI reports a monthly cost", typeof roi.monthlyCost === "number", roi);
      check("months elapsed never drops below 1", roi.monthsElapsed >= 1, roi);
      check(
        "cost to date is the monthly cost over the elapsed months",
        Math.abs(roi.costToDate - roi.monthlyCost * roi.monthsElapsed) < 0.01,
        roi,
      );
      check(
        "the multiple is revenue over cost, not floored at 1",
        roi.costToDate === 0 ||
          Math.abs(roi.roiMultiple - roi.revenueSinceSubscription / roi.costToDate) < 0.01,
        roi,
      );
      check(
        "revenue since subscription never exceeds all-time revenue",
        roi.revenueSinceSubscription <= company.body.revenueTracked + 0.01,
        { since: roi.revenueSinceSubscription, all: company.body.revenueTracked },
      );
    } else {
      check("a company with no subscription hides the ROI block", roi === null, company.body);
    }

    console.log("\n== Company impact stays company-private ==");

    // An outlet admin's tenant JWT must not open the company console's door.
    const leak = await api("/api/company/impact", { token: adminToken });
    check("an outlet admin token is rejected", leak.status === 401 || leak.status === 403, leak.status);

    const anonCompany = await api("/api/company/impact");
    check("company impact requires authentication", anonCompany.status === 401, anonCompany.status);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node backend/tests/impact.js
```

Expected: FAIL — "the company impact endpoint answers" reports 404, and the checks after it fail on `undefined`.

- [ ] **Step 3: Extend the service**

In `backend/services/impactService.js`, add these requires at the top:

```js
const Organization = require("../models/Organization");
const Subscription = require("../models/Subscription");
const SubscriptionPlan = require("../models/SubscriptionPlan");
```

Add before `module.exports`:

```js
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

// Does the subscription pay for itself?
//
// NOT all-time revenue over a monthly price — that compares a cumulative
// flow to one month of cost and is not a ratio at all. Both sides span the
// same window: revenue earned on or after the subscription started, over the
// cost incurred since the subscription started.
//
// subscription.createdAt is the right start. subscriptionService keeps ONE
// Subscription document per company and updates it in place on renewal, so
// createdAt is when they began paying, not when they last renewed.
//
// Returns null when there is no subscription or no plan attached — a
// platform-onboarded company has nothing to compare against, and the block
// is hidden rather than shown empty.
const buildRoi = async (companyId, revenueSinceSubscription) => {
  const subscription = await Subscription.findOne({ companyId });
  if (!subscription || !subscription.planId) return null;

  const plan = await SubscriptionPlan.findOne({ _id: subscription.planId });
  if (!plan) return null;

  const intervalDays = plan.billingIntervalDays || 365;
  const monthlyCost = round2(plan.priceNpr / (intervalDays / 30));

  // Floored at 1: a company three days into its first month would otherwise
  // divide by ~0.1 and read as 30X.
  const elapsedMs = Date.now() - new Date(subscription.createdAt).getTime();
  const monthsElapsed = Math.max(1, round2(elapsedMs / MONTH_MS));
  const costToDate = round2(monthlyCost * monthsElapsed);

  return {
    planName: plan.name,
    subscriptionStartedAt: new Date(subscription.createdAt).toISOString(),
    monthlyCost,
    monthsElapsed,
    costToDate,
    revenueSinceSubscription: round2(revenueSinceSubscription),
    // Reported as-is, including below 1. An owner who catches one inflated
    // number stops trusting the whole page.
    roiMultiple: costToDate > 0 ? round2(revenueSinceSubscription / costToDate) : null
  };
};

// The company owner's cross-outlet value view.
//
// Deliberately company-private: reachable only through /api/company
// (verifyCompanySession), never through /api/admin — an outlet's console must
// never see its siblings' numbers. Same boundary companyReportService holds.
//
// Retention at company level merges each person's earns across the company's
// outlets before counting, because collectOutletFacts keys them by
// CustomerAccount. That is deliberate and it is stricter than summing: one
// earn at each of two outlets is NOT a repeat customer — they have not come
// back anywhere. Each outlet still reads them as single-visit in perOutlet.
const getCompanyImpact = async (companyId) => {
  const outlets = await Organization.find({ companyId });

  // Fetched first: the ROI window has to be known before the ledger pass, so
  // each outlet can accumulate revenue-since alongside revenue-all-time.
  const subscription = await Subscription.findOne({ companyId });
  const since = subscription ? new Date(subscription.createdAt) : null;

  const parts = await Promise.all(
    outlets.map(async (outlet) => {
      const [facts, campaignCount] = await Promise.all([
        collectOutletFacts(outlet._id, { since }),
        Campaign.countDocuments({ organizationId: outlet._id })
      ]);
      return { outlet, facts, campaignCount };
    })
  );

  const merged = {
    earnsByAccount: new Map(),
    revenueTracked: 0,
    revenueSince: 0,
    redemptionCount: 0,
    rewardValueRedeemed: 0,
    valuedRedemptions: 0,
    firstActivityAt: null
  };
  let campaignCount = 0;

  for (const { facts, campaignCount: outletCampaigns } of parts) {
    for (const [key, row] of facts.earnsByAccount) {
      const existing = merged.earnsByAccount.get(key) || { count: 0, revenue: 0 };
      existing.count += row.count;
      existing.revenue += row.revenue;
      merged.earnsByAccount.set(key, existing);
    }
    merged.revenueTracked += facts.revenueTracked;
    merged.revenueSince += facts.revenueSince;
    merged.redemptionCount += facts.redemptionCount;
    merged.rewardValueRedeemed += facts.rewardValueRedeemed;
    merged.valuedRedemptions += facts.valuedRedemptions;
    if (facts.firstActivityAt && (!merged.firstActivityAt || facts.firstActivityAt < merged.firstActivityAt)) {
      merged.firstActivityAt = facts.firstActivityAt;
    }
    campaignCount += outletCampaigns;
  }

  const perOutlet = parts
    .map(({ outlet, facts, campaignCount: outletCampaigns }) => ({
      outletId: outlet._id.toString(),
      slug: outlet.slug,
      name: outlet.name,
      status: outlet.status,
      ...presentImpact({ facts, campaignCount: outletCampaigns })
    }))
    .sort((a, b) => b.revenueTracked - a.revenueTracked);

  return {
    ...presentImpact({ facts: merged, campaignCount }),
    outletCount: outlets.filter((o) => o.status !== "archived").length,
    roi: await buildRoi(companyId, merged.revenueSince),
    perOutlet
  };
};
```

Update `module.exports` to add `buildRoi` and `getCompanyImpact`.

- [ ] **Step 4: Add the controller handler**

In `backend/controllers/companyController.js`, add the import beside the existing `companyReportService` require:

```js
const { getCompanyImpact } = require("../services/impactService");
```

Add the handler next to `getRollup`:

```js
// The company's value view, across every outlet. Company-private: an outlet
// console has no route to this, by design.
const getImpact = async (req, res, next) => {
  try {
    const impact = await getCompanyImpact(req.companyId);
    res.status(200).json({ success: true, ...impact });
  } catch (error) {
    next(error);
  }
};
```

Add `getImpact` to `module.exports`.

- [ ] **Step 5: Add the route**

In `backend/routes/companyRoutes.js`, add `getImpact` to the destructured controller import, then after the `/reports/rollup` route:

```js
router.get("/impact", getImpact);
```

`router.use(verifyCompanySession)` at line 20 already guards everything below it — do not add a second guard.

- [ ] **Step 6: Run the test to verify it passes**

```bash
node backend/tests/impact.js
```

Expected: all checks PASS, including the company-private checks.

- [ ] **Step 7: Run the full backend suite**

```bash
npm test -w backend
```

Expected: every suite passes. `company-reports-range.js` and `multi-tenant-isolation.js` are the ones to watch.

- [ ] **Step 8: Commit**

```bash
git add backend/services/impactService.js backend/controllers/companyController.js backend/routes/companyRoutes.js backend/tests/impact.js
git commit -m "feat: add company impact rollup with subscription ROI"
```

---

### Task 4: Outlet Impact page

**Files:**
- Create: `frontend/src/routes/admin/AdminImpact.tsx`
- Modify: `frontend/src/App.tsx` (lazy import beside `AdminReportsCustomers` ~line 74; route beside `reports/customers` ~line 216)
- Modify: `frontend/src/components/admin/AdminLayout.tsx` (one entry in the `Reports` group's `children`, ~line 63)

**Interfaces:**
- Consumes: `GET /api/admin/impact` from Task 2.
- Produces: default-exported `AdminImpact` component at route `reports/impact` inside the admin tenant subtree.

- [ ] **Step 1: Write the page**

Create `frontend/src/routes/admin/AdminImpact.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Users, Repeat, Gift, TrendingUp } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { formatNpr } from "../../lib/subscription";
import { useMotion } from "../../lib/motion";
import { Skeleton } from "../../components/ui/skeleton";

export interface Milestone {
  key: string;
  label: string;
  sublabel: string;
  achieved: boolean;
}

export interface Impact {
  customers: number;
  repeatCustomers: number;
  retentionPercent: number | null;
  revenueTracked: number;
  repeatRevenue: number;
  repeatRevenuePercent: number | null;
  avgSpendPerRepeatCustomer: number | null;
  redemptionCount: number;
  rewardValueRedeemed: number;
  rewardValueCoverage: { valued: number; total: number };
  firstActivityAt: string | null;
  milestones: Milestone[];
}

const DISCOUNT_RATES = [5, 10, 15, 20];

const since = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

// The value view: has this programme been worth running? Every figure comes
// from the ledger — there are deliberately no "estimated staff hours saved"
// or "operations cost avoided" tiles, because no data behind them exists.
export default function AdminImpact() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  const [rate, setRate] = useState(10);
  const { transition } = useMotion();

  const { data, isLoading } = useQuery<{ success: boolean } & Impact>({
    queryKey: ["adminImpact", orgId],
    queryFn: () => apiRequest(`/api/admin/impact`, { role: "admin" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  // Nothing has happened yet. A 0% hero would read as a failure rather than
  // an absence, so the whole page collapses to one explanatory card.
  if (!data || data.customers === 0) {
    return (
      <div>
        <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
        <p className="mb-6 text-[var(--muted)]">What your loyalty programme is doing for the business.</p>
        <div className="rounded-3xl bg-[var(--surface)] p-8 shadow-ambient">
          <p className="text-[var(--ink)]">No visits yet.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Once customers start earning, this page will show how many come back, how much of your
            revenue they bring, and what your rewards actually cost.
          </p>
        </div>
      </div>
    );
  }

  const startedOn = since(data.firstActivityAt);
  const coverage = data.rewardValueCoverage;
  const hasRewardValue = coverage.valued > 0;
  const wouldHaveCost = Math.round(data.revenueTracked * (rate / 100));

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
      <p className="mb-6 text-[var(--muted)]">
        What your loyalty programme is doing for the business
        {startedOn ? ` — since ${startedOn}` : ""}.
      </p>

      {/* Retention hero. --primary green: this is value, not tenant identity. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition("cardEnter")}
        className="mb-4 rounded-3xl bg-[var(--primary-soft)] p-8 shadow-ambient"
      >
        <p className="text-sm font-semibold text-[var(--primary-deep)]">Customers who came back</p>
        <p className="font-numeral text-[72px] leading-none text-[var(--primary-deep)]">
          {data.retentionPercent ?? "—"}
          <span className="text-[32px]">%</span>
        </p>
        <p className="mt-3 text-[var(--primary-deep)]">
          {data.repeatCustomers} of {data.customers}{" "}
          {data.customers === 1 ? "customer" : "customers"} came back for another visit
        </p>
        {data.customers < 5 && (
          <p className="mt-1 text-sm text-[var(--primary-deep)] opacity-70">
            Still early — this will settle as more people visit.
          </p>
        )}
      </motion.div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Customers", val: String(data.customers), Icon: Users },
          { label: "Repeat customers", val: String(data.repeatCustomers), Icon: Repeat },
          { label: "Revenue tracked", val: formatNpr(data.revenueTracked), Icon: TrendingUp },
          { label: "Rewards redeemed", val: String(data.redemptionCount), Icon: Gift },
        ].map(({ label, val, Icon }) => (
          <div key={label} className="rounded-3xl bg-[var(--surface)] p-5 shadow-ambient">
            <Icon className="mb-3 h-5 w-5 text-[var(--soft)]" />
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="font-numeral text-[28px] text-[var(--ink)]">{val}</p>
          </div>
        ))}
      </div>

      {/* Repeat revenue */}
      <div className="mb-4 rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          Repeat revenue
        </p>
        <dl className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-[var(--ink)]">Revenue from repeat customers</dt>
            <dd className="font-numeral text-[22px] text-[var(--primary)]">
              {formatNpr(data.repeatRevenue)}
            </dd>
          </div>
          {data.repeatRevenuePercent !== null && (
            <p className="text-sm text-[var(--muted)]">
              {data.repeatRevenuePercent}% of all revenue tracked
            </p>
          )}
          {data.avgSpendPerRepeatCustomer !== null && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[var(--ink)]">Avg spend per repeat customer</dt>
              <dd className="font-numeral text-[22px] text-[var(--ink)]">
                {formatNpr(data.avgSpendPerRepeatCustomer)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Reward cost control */}
      <div className="mb-4 rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          Reward cost control
        </p>
        {!hasRewardValue ? (
          <p className="text-sm text-[var(--muted)]">
            This fills in as menu items get redeemed — that's where a rupee value comes from.
            Points-only rewards don't carry one.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[var(--ink)]">Rewards actually given away</span>
              <span className="font-numeral text-[22px] text-[var(--ink)]">
                {formatNpr(data.rewardValueRedeemed)}
              </span>
            </div>
            {coverage.valued < coverage.total && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                Based on {coverage.valued} of {coverage.total} redemptions — the rest were
                points-only rewards with no rupee price.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
              <span className="text-sm text-[var(--muted)]">Compare: a flat discount instead</span>
              <div className="flex gap-1">
                {DISCOUNT_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRate(r)}
                    className={`rounded-lg px-3 py-1 text-sm stamp-interactive ${
                      r === rate
                        ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-deep)]"
                        : "text-[var(--soft)]"
                    }`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-[var(--ink)]">A flat {rate}% on all sales would have cost</span>
              <span className="font-numeral text-[22px] text-[var(--ink)]">
                {formatNpr(wouldHaveCost)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <span className="text-[var(--ink)]">With rewards, you gave away</span>
              <span className="font-numeral text-[22px] text-[var(--primary)]">
                {formatNpr(data.rewardValueRedeemed)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Milestones */}
      <div className="rounded-3xl bg-[var(--surface-2)] p-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          Milestones
        </p>
        <div className="flex gap-6 overflow-x-auto pb-2">
          {data.milestones.map((m) => (
            <div key={m.key} className="min-w-[110px] shrink-0 text-center">
              <span
                className={`mx-auto mb-2 block h-3 w-3 rounded-full ${
                  m.achieved ? "bg-[var(--primary)]" : "border border-[var(--line)] bg-transparent"
                }`}
              />
              <p
                className={`text-sm ${
                  m.achieved ? "font-semibold text-[var(--ink)]" : "text-[var(--soft)]"
                }`}
              >
                {m.label}
              </p>
              <p className="text-xs text-[var(--soft)]">{m.sublabel}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `useMotion`'s actual API before relying on it**

```bash
grep -n "export function useMotion\|export const useMotion" -A 20 frontend/src/lib/motion.ts
```

The page above calls `transition("cardEnter")`. If `useMotion()` exposes a different shape (e.g. it returns the spring objects directly), adapt the two call sites in `AdminImpact.tsx` to whatever it actually returns. **Do not** import `SPRINGS` directly or hand-roll a transition — the whole point of the hook is that reduced motion cannot be bypassed.

- [ ] **Step 3: Wire the route**

In `frontend/src/App.tsx`, beside the other admin report imports:

```tsx
const AdminImpact = lazy(() => import('./routes/admin/AdminImpact'));
```

And beside the other report routes:

```tsx
<Route path="reports/impact" element={<AdminImpact />} />
```

- [ ] **Step 4: Wire the nav**

In `frontend/src/components/admin/AdminLayout.tsx`, add to the `Reports` group's `children`, after `reports/customers`:

```tsx
      { to: "reports/impact", label: "Impact" },
```

- [ ] **Step 5: Typecheck**

```bash
npm run lint
```

Expected: no errors. (`npm run lint` is `tsc --noEmit` on the frontend.)

- [ ] **Step 6: Verify in the browser**

Start the backend against the mock DB and the frontend:

```bash
MONGODB_URI="" npm run dev
```

Then use the preview tools: sign in at `/admin-login` as `durbarmarg@coffesarowar.com` / `password`, navigate to Reports → Impact, and confirm the retention hero, the four tiles, repeat revenue, the discount toggle, and the milestone rail all render with real seeded numbers. Check the console for errors and resize to mobile width to confirm the milestone rail scrolls rather than overflowing the page.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/admin/AdminImpact.tsx frontend/src/App.tsx frontend/src/components/admin/AdminLayout.tsx
git commit -m "feat: add outlet Impact page to the admin console"
```

---

### Task 5: Company Impact page

**Files:**
- Create: `frontend/src/routes/company/CompanyImpact.tsx`
- Modify: `frontend/src/App.tsx` (lazy import beside `CompanyReports` ~line 58; route inside the company subtree)
- Modify: `frontend/src/components/company/CompanyLayout.tsx` (one `NAV` entry between Reports and Subscription)

**Interfaces:**
- Consumes: `GET /api/company/impact` from Task 3; the `Impact` and `Milestone` types exported by `AdminImpact.tsx` in Task 4.
- Produces: default-exported `CompanyImpact` component at route `/company/impact`.

- [ ] **Step 1: Write the page**

Create `frontend/src/routes/company/CompanyImpact.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/api";
import { formatNpr } from "../../lib/subscription";
import { Skeleton } from "../../components/ui/skeleton";
import type { Impact } from "../admin/AdminImpact";

interface OutletImpactRow extends Impact {
  outletId: string;
  slug: string;
  name: string;
  status: string;
}

interface Roi {
  planName: string;
  subscriptionStartedAt: string;
  monthlyCost: number;
  monthsElapsed: number;
  costToDate: number;
  revenueSinceSubscription: number;
  roiMultiple: number | null;
}

interface CompanyImpactData extends Impact {
  outletCount: number;
  roi: Roi | null;
  perOutlet: OutletImpactRow[];
}

// The company owner's value view across every outlet. Company-private: this
// reads from /api/company, so no single outlet's console can reach it.
//
// The ROI block lives here and only here — the subscription is a
// company-level fact, and exposing it to an outlet console would break the
// isolation boundary for nothing.
export default function CompanyImpact() {
  const { data, isLoading } = useQuery<{ success: boolean } & CompanyImpactData>({
    queryKey: ["companyImpact"],
    queryFn: () => apiRequest(`/api/company/impact`, { role: "company" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full rounded-3xl" />
      </div>
    );
  }

  if (!data || data.customers === 0) {
    return (
      <div>
        <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
        <p className="mb-6 text-[var(--muted)]">What loyalty is doing across your outlets.</p>
        <div className="rounded-3xl bg-[var(--surface)] p-8 shadow-ambient">
          <p className="text-[var(--ink)]">No visits yet.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            This fills in once your outlets start stamping customers.
          </p>
        </div>
      </div>
    );
  }

  const { roi } = data;

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold text-[var(--ink)]">Impact</h1>
      <p className="mb-6 text-[var(--muted)]">
        What loyalty is doing across your {data.outletCount}{" "}
        {data.outletCount === 1 ? "outlet" : "outlets"}.
      </p>

      <div className="mb-4 rounded-3xl bg-[var(--primary-soft)] p-8 shadow-ambient">
        <p className="text-sm font-semibold text-[var(--primary-deep)]">Customers who came back</p>
        <p className="font-numeral text-[72px] leading-none text-[var(--primary-deep)]">
          {data.retentionPercent ?? "—"}
          <span className="text-[32px]">%</span>
        </p>
        <p className="mt-3 text-[var(--primary-deep)]">
          {data.repeatCustomers} of {data.customers} customers came back
        </p>
        <p className="mt-1 text-sm text-[var(--primary-deep)] opacity-70">
          Counted per person, not per outlet — one customer at two of your outlets is one customer.
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Revenue tracked", val: formatNpr(data.revenueTracked) },
          { label: "From repeat customers", val: formatNpr(data.repeatRevenue) },
          { label: "Rewards redeemed", val: String(data.redemptionCount) },
        ].map(({ label, val }) => (
          <div key={label} className="rounded-3xl bg-[var(--surface)] p-5 shadow-ambient">
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="font-numeral text-[28px] text-[var(--ink)]">{val}</p>
          </div>
        ))}
      </div>

      {roi && (
        <div className="mb-4 rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
            Return on investment
          </p>
          <dl className="space-y-2">
            {[
              { k: `Revenue tracked since you subscribed`, v: formatNpr(roi.revenueSinceSubscription) },
              { k: `${roi.planName} — monthly cost`, v: formatNpr(roi.monthlyCost) },
              { k: `Paid so far (${roi.monthsElapsed} months)`, v: formatNpr(roi.costToDate) },
            ].map(({ k, v }) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <dt className="text-[var(--ink)]">{k}</dt>
                <dd className="font-numeral text-[20px] text-[var(--ink)]">{v}</dd>
              </div>
            ))}
          </dl>
          {roi.roiMultiple !== null && (
            <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-[var(--line)] pt-4">
              <span className="text-[var(--ink)]">Return on what you've paid</span>
              <span className="font-numeral text-[28px] text-[var(--primary)]">
                {roi.roiMultiple}×
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-3xl bg-[var(--surface)] p-6 shadow-ambient">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--soft)]">
          By outlet
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[var(--soft)]">
              <tr>
                <th className="pb-2 font-medium">Outlet</th>
                <th className="pb-2 text-right font-medium">Customers</th>
                <th className="pb-2 text-right font-medium">Came back</th>
                <th className="pb-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.perOutlet.map((o) => (
                <tr key={o.outletId} className="border-t border-[var(--line)]">
                  <td className="py-3 text-[var(--ink)]">{o.name}</td>
                  <td className="py-3 text-right font-numeral text-[var(--ink)]">{o.customers}</td>
                  <td className="py-3 text-right font-numeral text-[var(--ink)]">
                    {o.retentionPercent === null ? "—" : `${o.retentionPercent}%`}
                  </td>
                  <td className="py-3 text-right font-numeral text-[var(--ink)]">
                    {formatNpr(o.revenueTracked)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `frontend/src/App.tsx`, beside the other company imports:

```tsx
const CompanyImpact = lazy(() => import('./routes/company/CompanyImpact'));
```

And inside the company route subtree, beside `<Route path="reports" …>`:

```tsx
<Route path="impact" element={<CompanyImpact />} />
```

- [ ] **Step 3: Wire the nav**

In `frontend/src/components/company/CompanyLayout.tsx`, add `Sparkles` (or another unused `lucide-react` icon already imported in the file's style) to the icon imports, then insert into `NAV` between Reports and Subscription:

```tsx
  { to: "impact", label: "Impact", Icon: Sparkles },
```

- [ ] **Step 4: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Verify in the browser**

With the dev servers running (`MONGODB_URI="" npm run dev`), sign in at `/admin-login` as `owner@coffesarowar.com` / `password` — a company owner lands at `/company`. Open Impact and confirm: the retention hero, the three tiles, the ROI block (coffesarowar has a seeded subscription), and the by-outlet table with three rows sorted by revenue. Confirm the table scrolls horizontally at mobile width rather than pushing the page sideways. Check the console for errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/company/CompanyImpact.tsx frontend/src/App.tsx frontend/src/components/company/CompanyLayout.tsx
git commit -m "feat: add company Impact page with subscription ROI"
```

---

### Task 6: Document the feature in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (new subsection after "Platform-wide analytics")

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: Add the section**

After the "Platform-wide analytics" section in `CLAUDE.md`:

```markdown
## Impact insights

`impactService.js` answers "has this been worth it?" — the value counterpart to `reportService`'s "what happened?". Two exports: `getOutletImpact(organizationId)` (`GET /api/admin/impact`, behind `view_reports`) and `getCompanyImpact(companyId)` (`GET /api/company/impact`, company-private like `getCompanyRollup`).

**All-time, no date range.** Impact is cumulative by definition; the range-filtered view of the same flows already lives on the Reports pages.

**A "customer" is a membership with ≥1 `earn` row; a "repeat customer" has ≥2.** `/explore` auto-provisions a `User` the moment someone opens an outlet's page, so counting every membership would let browsers who never bought anything drag retention toward zero. `repeatRevenue` counts all of a repeat customer's revenue, first visit included.

Earns are keyed by `customerAccountId`, not by membership row, which is what lets `getCompanyImpact` merge one person across sibling outlets. That makes company-level retention *stricter* than a sum: one earn at each of two outlets is not a repeat customer, because they haven't come back anywhere.

**`PointsTransaction.rewardValueNpr`** is snapshotted at redemption from `MenuItem.price`, and is `null` for a `RewardItem` (points-only by design) and for every row predating the field. Null means "not recorded", never "free" — it's skipped from rupee sums, and the response carries `rewardValueCoverage: {valued, total}` so the UI can say "based on 34 of 51 redemptions" instead of under-reporting.

**ROI is company-only and windowed.** `roiMultiple = revenueSince(subscription.createdAt) / (monthlyCost × monthsElapsed)`. Both sides must span the same window — dividing all-time revenue by a *monthly* price is not a ratio. `subscription.createdAt` is the right start because `subscriptionService` keeps one `Subscription` per company and updates it in place on renewal. `monthsElapsed` floors at 1 so a three-day-old subscription doesn't read as 30X, and a multiple below 1 is reported as-is.

**Nothing on this page is estimated.** The competitor page this was modelled on carries "operations cost avoided" and "staff hours saved" tiles built from invented coefficients; those are deliberately absent, same rule as `/explore` never showing a fabricated rating. Points outstanding is reported in points and never converted to rupees — there is no honest rate.

Milestones are derived live on every read. No stored state, no write hooks, no cron.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document impact insights in CLAUDE.md"
```

---

## Self-review notes

Spec coverage checked section by section:

| Spec section | Task |
|---|---|
| Purpose / non-goals | enforced by Global Constraints + Task 6 |
| Time window (all-time, `firstActivityAt`) | Task 2 Step 3, Task 4 Step 1 |
| Schema change (`rewardValueNpr`, coverage) | Task 1 |
| Service (two exports, layering) | Tasks 2, 3 |
| Who counts as a customer | Task 2 Step 3, tested Task 2 Step 1 |
| Outlet metrics table | Task 2 Step 3 |
| Dropped "total rewards issued (value)" | absent by construction; recorded in Task 6 |
| Flat-discount comparison | Task 4 Step 1 (client-side, suppressed at zero coverage) |
| Milestones | Task 2 Step 3 |
| Company metrics + distinct accounts | Task 3 Step 3 |
| ROI | Task 3 Step 3 |
| API table | Task 2 Step 5, Task 3 Step 5 |
| Frontend pages, nav, visual, empty states | Tasks 4, 5 |
| All 12 test cases | Tasks 1–3 test steps |
| File list | matches, plus `formatTransaction` (justified in Task 1) |

**Deviation from the spec, deliberate:** Task 1 also adds `rewardValueNpr` to `formatTransaction`. The spec's file list doesn't include it. It's there because the field otherwise has no observable surface to test on its own, and a history row that already shows `rewardName` is the natural place for what that reward was worth.

**Known soft spot:** Task 4 Step 2 asks the implementer to check `useMotion()`'s real signature before trusting `transition("cardEnter")`. The hook's exact return shape wasn't read while writing this plan — only `lib/motion.ts`'s springs table was. Verify before assuming.

# Tier System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every outlet a fixed-label (Bronze/Silver/Gold/Platinum) customer tier, computed live from each customer's trailing-12-month visit count and spend at that outlet — surfaced to the customer, to outlet-admin's customer list, and configurable per outlet in admin settings.

**Architecture:** A tier is derived, never stored — one new `services/tierService.js` function (`resolveTier`) queries the existing `PointsTransaction` ledger and compares against outlet-configured thresholds on `Organization.tierThresholds`. No changes to `PointsBalance`, `pointsService`'s atomic earn/redeem write paths, or any migration — this is a pure read-side addition.

**Tech Stack:** Node/Express backend (mock-Mongoose in dev/test), React 19 + TS frontend, plain-`node` integration tests booted against the real server (no test framework).

## Global Constraints

- Mock DB query support is **top-level equality, `$or`, `$lte`, `$gte` only** — any other operator throws. All new queries in this plan use only those.
- **No `findById`** anywhere — use `findOne({ _id })`.
- Tiers are **outlet-scoped, never inherited** from company or platform — no `resolveProgram`-style inheritance chain for `tierThresholds`.
- Tier **labels are fixed** (`config/platform.js` `TIER_LABELS`); only the numeric thresholds per label are admin-configurable.
- Business logic lives in `services/`; controllers stay thin (parse request → call service → format response) per this repo's layering rule.
- New backend test suites must be **added to `backend/package.json`'s `test` chain** or they never run.
- No code comments except where a genuinely non-obvious constraint or invariant needs explaining — match this codebase's existing comment density, don't over-comment.

---

## Task 1: Tier config, schema, and core `resolveTier` logic

**Files:**
- Modify: `backend/config/platform.js` (add `TIER_LABELS` constant + export)
- Modify: `backend/models/Organization.js` (add `tierThresholds` field)
- Create: `backend/services/tierService.js`
- Create: `backend/tests/tier-system.js`
- Modify: `backend/package.json` (wire the new test into the `test` script)

**Interfaces:**
- Produces: `tierService.resolveTier(organizationId, customerId) => Promise<string|null>` — returns one of `TIER_LABELS` or `null` if unconfigured/unmatched. Later tasks import this.
- Produces: `config/platform.js` exports `TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"]` (lowest to highest).
- Produces: `Organization.tierThresholds.{Bronze,Silver,Gold,Platinum}.{minVisits,minSpend}`, each `Number|null`, default `null` (unconfigured).

- [ ] **Step 1: Add `TIER_LABELS` to `backend/config/platform.js`**

Insert after line 46 (`const CAMPAIGN_STACKING = "max";`), before the `RESERVED_SLUGS` block:

```js
// Fixed tier labels a customer can be placed into at an outlet, ordered
// lowest to highest. Admins configure the numeric thresholds per label
// (Organization.tierThresholds); the label set itself is platform-fixed.
const TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"];
```

Update the `module.exports` block (lines 64-72) to include it:

```js
module.exports = {
  PLATFORM_NAME,
  PLATFORM_TIMEZONE,
  CAMPAIGN_STACKING,
  DEFAULT_PROGRAM,
  BUSINESS_CATEGORIES,
  TIER_LABELS,
  RESERVED_SLUGS,
  isReservedSlug
};
```

- [ ] **Step 2: Add `tierThresholds` to `backend/models/Organization.js`**

Insert after line 47 (the `program` block's closing `},`) and before line 49 (`contact: {`):

```js
  // Fixed-label tier configuration for this outlet (see config/platform.js
  // TIER_LABELS). Every field defaults to null meaning "not configured" —
  // resolveTier in services/tierService.js skips any label with a null
  // threshold. Outlet-scoped only, no inheritance: two outlets of the same
  // company configure tiers independently, matching points never pooling
  // across outlets.
  tierThresholds: {
    Bronze: {
      minVisits: { type: Number, min: 0, default: null },
      minSpend: { type: Number, min: 0, default: null }
    },
    Silver: {
      minVisits: { type: Number, min: 0, default: null },
      minSpend: { type: Number, min: 0, default: null }
    },
    Gold: {
      minVisits: { type: Number, min: 0, default: null },
      minSpend: { type: Number, min: 0, default: null }
    },
    Platinum: {
      minVisits: { type: Number, min: 0, default: null },
      minSpend: { type: Number, min: 0, default: null }
    }
  },
```

- [ ] **Step 3: Write the failing test**

Create `backend/tests/tier-system.js`:

```js
/**
 * Tier system suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Configures tier thresholds on durbarmarg, drives a
 * customer through several earns, and confirms resolveTier picks the
 * right label.
 *
 * Run directly: `node tests/tier-system.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5030 });
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

    const email = `tier_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Tier Tester", email, password: "password", phone: "+9779811112222", address: "1 Test Lane" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    check("resolveTier with no thresholds configured yields no tier surfaced", true);
    // (Placeholder assertion until Task 2 wires resolveTier into a response —
    // Task 2 replaces this with a real /api/points/balance assertion.)
  } finally {
    stop();
  }

  if (failures) { console.error(`tier-system: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("tier-system: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 4: Wire the new suite into `backend/package.json`**

In `backend/package.json`, find the `"test"` script (a single `&&`-chained string ending in `... && node tests/rate-limiting.js`). Append ` && node tests/tier-system.js` to the end of that string.

- [ ] **Step 5: Run it to confirm the harness works**

Run: `cd backend && npm test 2>&1 | tail -30`
Expected: every prior suite still passes, and `tier-system: all PASS` appears (the placeholder assertion always passes — this step just proves the new file boots and runs inside the chain).

- [ ] **Step 6: Create `backend/services/tierService.js`**

```js
const Organization = require("../models/Organization");
const PointsTransaction = require("../models/PointsTransaction");
const { TIER_LABELS } = require("../config/platform");

const TRAILING_WINDOW_DAYS = 365;

// Highest-to-lowest, so a customer meeting Platinum's bar returns Platinum,
// not the first (lowest) label that also happens to match.
const LABELS_HIGH_TO_LOW = [...TIER_LABELS].reverse();

// A tier is always derived from the ledger, never stored — same reasoning
// as PointsBalance: a stored value could drift from the transactions behind
// it. Computed fresh on every call.
const resolveTier = async (organizationId, customerId) => {
  const org = await Organization.findOne({ _id: organizationId });
  if (!org || !org.tierThresholds) {
    return null;
  }

  const since = new Date(Date.now() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const earns = await PointsTransaction.find({
    organizationId,
    userId: customerId,
    type: "earn",
    createdAt: { $gte: since }
  });

  const visits = earns.length;
  const spend = earns.reduce((sum, t) => sum + (t.billAmount || 0), 0);

  for (const label of LABELS_HIGH_TO_LOW) {
    const threshold = org.tierThresholds[label];
    if (!threshold) continue;
    const { minVisits, minSpend } = threshold;
    if (minVisits === null || minVisits === undefined) continue;
    if (minSpend === null || minSpend === undefined) continue;
    if (visits >= minVisits && spend >= minSpend) {
      return label;
    }
  }

  return null;
};

module.exports = { resolveTier, TRAILING_WINDOW_DAYS };
```

- [ ] **Step 7: Replace the placeholder test with real `resolveTier` assertions**

Replace the `check("resolveTier with no thresholds configured yields no tier surfaced", true);` line in `backend/tests/tier-system.js` with:

```js
    const { resolveTier } = require("../services/tierService");
    const Organization = require("../models/Organization");
    const Company = require("../models/Company");

    const company = await Company.findOne({ slug: COMPANY });
    const org = await Organization.findOne({ companyId: company._id, slug: SLUG });

    const tierBeforeConfig = await resolveTier(org._id, customerLogin.body.user.id);
    check("no tier when thresholds unconfigured", tierBeforeConfig === null);

    org.tierThresholds.Bronze = { minVisits: 1, minSpend: 100 };
    org.tierThresholds.Silver = { minVisits: 2, minSpend: 700 };
    await org.save();

    const gen1 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 500 } });
    await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: gen1.body.data.token } });

    const tierAfterOneEarn = await resolveTier(org._id, customerLogin.body.user.id);
    check("one 500 earn meets Bronze (1 visit, 100 spend)", tierAfterOneEarn === "Bronze");

    const gen2 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 300 } });
    await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: gen2.body.data.token } });

    const tierAfterTwoEarns = await resolveTier(org._id, customerLogin.body.user.id);
    check("two earns (800 total) meets Silver (2 visits, 700 spend)", tierAfterTwoEarns === "Silver");

    // Rolling-window exclusion: a threshold that only a 3rd (old) visit could
    // satisfy must NOT be met if the window correctly ignores it.
    org.tierThresholds.Gold = { minVisits: 3, minSpend: 900 };
    await org.save();
    const PointsTransaction = require("../models/PointsTransaction");
    await PointsTransaction.create({
      organizationId: org._id,
      userId: customerLogin.body.user.id,
      type: "earn",
      pointsCenti: 100000,
      billAmount: 1000,
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });
    const tierIgnoringOldEarn = await resolveTier(org._id, customerLogin.body.user.id);
    check(
      "a 400-day-old earn outside the trailing 12-month window doesn't count toward tier (stays Silver, not Gold)",
      tierIgnoringOldEarn === "Silver"
    );

    // Exact-boundary inclusion: 2 visits / 800 spend meeting a 2/800 threshold
    // must count as met (>=, not strictly >).
    org.tierThresholds.Platinum = { minVisits: 2, minSpend: 800 };
    await org.save();
    const tierAtExactThreshold = await resolveTier(org._id, customerLogin.body.user.id);
    check("meeting a threshold exactly (2 visits, 800 spend) counts as met", tierAtExactThreshold === "Platinum");

    // Reset Gold/Platinum back to unconfigured so later tasks' assertions
    // (which expect this customer to resolve to "Silver") still hold — only
    // Bronze/Silver stay configured for the rest of this test file.
    org.tierThresholds.Gold = { minVisits: null, minSpend: null };
    org.tierThresholds.Platinum = { minVisits: null, minSpend: null };
    await org.save();
```

`customerLogin.body.user.id` is confirmed correct — `backend/services/authService.js:70-88`'s `formatAuthPayload` returns `{ success, token, user: { id: user._id.toString(), ... } }`, so the login response's tenant-scoped `User._id` is at `body.user.id`.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && node tests/tier-system.js`
Expected: `PASS no tier when thresholds unconfigured`, `PASS one 500 earn meets Bronze (1 visit, 100 spend)`, `PASS two earns (800 total) meets Silver (2 visits, 700 spend)`, then `tier-system: all PASS`.

- [ ] **Step 9: Run the full suite to confirm no regressions**

Run: `cd backend && npm test 2>&1 | tail -40`
Expected: all suites pass, including `tier-system: all PASS`.

- [ ] **Step 10: Commit**

```bash
git add backend/config/platform.js backend/models/Organization.js backend/services/tierService.js backend/tests/tier-system.js backend/package.json
git commit -m "feat: add tier config schema and resolveTier service"
```

---

## Task 2: Surface tier on customer balance and admin customer list

**Files:**
- Modify: `backend/services/pointsService.js:586-612` (`getPointsBalanceByUserId`)
- Modify: `backend/services/pointsService.js:671-721` (`getCustomerDetailRows`)
- Modify: `backend/tests/tier-system.js` (extend)

**Interfaces:**
- Consumes: `tierService.resolveTier(organizationId, customerId) => Promise<string|null>` from Task 1.
- Produces: `GET /api/points/balance` response gains `data.tier: string|null`.
- Produces: `GET /api/admin/customers` each row gains `tier: string|null`.

- [ ] **Step 1: Write the failing test — extend `backend/tests/tier-system.js`**

Add after the three `check` calls from Task 1 (still inside the `try` block, before `finally`):

```js
    const balanceResp = await api("/api/points/balance", { token: customerToken });
    check("balance response surfaces tier", balanceResp.body.data.tier === "Silver");

    const listResp = await api("/api/admin/customers", { token: adminToken });
    const me = (listResp.body?.data || []).find((c) => c.email === email);
    check("admin customer list surfaces tier", me?.tier === "Silver");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node tests/tier-system.js`
Expected: FAIL on both new checks — `balanceResp.body.data.tier` and `me?.tier` are both `undefined` (`undefined === "Silver"` is false).

- [ ] **Step 3: Wire `resolveTier` into `getPointsBalanceByUserId`**

In `backend/services/pointsService.js`, add near the top of the file (with the other `require`s):

```js
const { resolveTier } = require("./tierService");
```

Modify the function at lines 586-612 — add the `resolveTier` call and the `tier` field to the returned object:

```js
const getPointsBalanceByUserId = async (userId, organizationId) => {
  if (!userId) {
    throw createHttpError("Authenticated user context is required.", 401);
  }

  const org = await loadOrganizationOrThrow(organizationId);
  const program = await loadProgram(org);

  const balance = await PointsBalance.findOne({ userId, organizationId });
  const now = new Date();
  const { multiplier, campaign } = await resolveActiveMultiplier(organizationId, now);
  const tier = await resolveTier(organizationId, userId);

  return {
    success: true,
    data: {
      balance: toPoints(effectiveBalanceCenti(balance, now)),
      lastActivityAt: balance ? balance.lastActivityAt : null,
      expiresAt: expiresAtFor(balance),
      earnPercent: program.earnPercent,
      pointsExpiryDays: program.pointsExpiryDays,
      multiplier,
      activeCampaign: campaign ? { name: campaign.name, multiplier: campaign.multiplier } : null,
      tier
    }
  };
};
```

- [ ] **Step 4: Wire `resolveTier` into `getCustomerDetailRows`**

Modify the function at lines 671-721 — add a `tier` field inside the `customers.map(...)` callback's returned object, right after `lifetimePoints`:

```js
  const rows = await Promise.all(
    customers.map(async (customer) => {
      const balance = await PointsBalance.findOne({ userId: customer._id, organizationId });
      const allTxns = await PointsTransaction.find({ userId: customer._id, organizationId })
        .sort({ createdAt: -1 });

      const earns = allTxns.filter((t) => t.type === "earn");
      const redeems = allTxns.filter((t) => t.type === "redeem");

      const totalSpent = earns.reduce((sum, t) => sum + (t.billAmount || 0), 0);
      const lifetimePointsCenti = earns.reduce((sum, t) => sum + t.pointsCenti, 0);
      const tier = await resolveTier(organizationId, customer._id);

      const idStr = customer._id.toString();
      const suffix = idStr.substring(Math.max(0, idStr.length - 5)).toUpperCase();
      const formattedId = `NO. ${suffix.padStart(5, "0")}`;

      const account = customer.customerAccountId;
      const customerAccountIdStr = account ? (account._id ? account._id.toString() : account.toString()) : null;
      const avatarVersion = account && account.avatarVersion ? account.avatarVersion : 0;

      return {
        id: idStr,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        address: customer.address || "",
        customerNo: formattedId,
        customerAccountId: customerAccountIdStr,
        avatarVersion: avatarVersion,
        pointsBalance: toPoints(effectiveBalanceCenti(balance, now)),
        lifetimePoints: toPoints(lifetimePointsCenti),
        tier,
        lastActivityAt: balance ? balance.lastActivityAt : null,
        redemptionCount: redeems.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        history: allTxns.slice(0, 10).map(formatTransaction)
      };
    })
  );
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && node tests/tier-system.js`
Expected: all checks pass including `balance response surfaces tier` and `admin customer list surfaces tier`.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `cd backend && npm test 2>&1 | tail -40`
Expected: every suite passes, notably `tests/customer-detail.js` (which asserts on other fields of the same `getCustomerDetailRows` row shape and must not break from the added `tier` field) and `tests/points-earn.js`/`tests/points-redeem.js` (which exercise `getPointsBalanceByUserId`'s response shape).

- [ ] **Step 7: Commit**

```bash
git add backend/services/pointsService.js backend/tests/tier-system.js
git commit -m "feat: surface tier on points balance and admin customer list"
```

---

## Task 3: Admin settings — configure tier thresholds, with per-outlet isolation test

**Files:**
- Modify: `backend/controllers/tenantController.js:47-94` (`getMySettings`)
- Modify: `backend/controllers/tenantController.js:96-162` (`updateMySettings`)
- Modify: `backend/tests/tier-system.js` (extend)

**Interfaces:**
- Consumes: `Organization.tierThresholds` schema from Task 1; `makeSiblingOutlet` from `backend/tests/helpers/makeOutlet.js` (existing helper, signature: `makeSiblingOutlet(baseUrl, { label, category, verify }) => Promise<{ outletSlug, outletId, adminEmail, adminToken, ownerToken }>`).
- Produces: `GET /api/admin/settings` response gains `settings.tierThresholds`. `PATCH /api/admin/settings` accepts and persists `tierThresholds` in the request body, returns it in the response the same way.

- [ ] **Step 1: Write the failing test — extend `backend/tests/tier-system.js`**

Add after the two `check` calls from Task 2:

```js
    const { makeSiblingOutlet } = require("./helpers/makeOutlet");

    const getSettingsResp = await api("/api/admin/settings", { token: adminToken });
    check(
      "GET settings surfaces tierThresholds",
      getSettingsResp.body.settings.tierThresholds?.Silver?.minVisits === 2
    );

    const patchResp = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { tierThresholds: { Gold: { minVisits: 5, minSpend: 2000 } } },
    });
    check(
      "PATCH settings persists a new Gold threshold",
      patchResp.body.settings.tierThresholds?.Gold?.minVisits === 5
    );
    check(
      "PATCH settings leaves Silver untouched",
      patchResp.body.settings.tierThresholds?.Silver?.minVisits === 2
    );

    const sibling = await makeSiblingOutlet(baseUrl, { label: `tier${Date.now()}` });
    const siblingSettings = await api("/api/admin/settings", { slug: sibling.outletSlug, token: sibling.adminToken });
    check(
      "a sibling outlet's tierThresholds start unconfigured (null), isolated from durbarmarg's",
      siblingSettings.body.settings.tierThresholds?.Gold?.minVisits === null
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node tests/tier-system.js`
Expected: FAIL on all three new checks — `tierThresholds` is `undefined` on both GET and PATCH responses (the field doesn't exist in either yet).

- [ ] **Step 3: Add `tierThresholds` to `getMySettings`**

In `backend/controllers/tenantController.js`, modify the `res.status(200).json(...)` block inside `getMySettings` (currently lines ~70-89) to include `tierThresholds` alongside `program`:

```js
    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        category: organization.category,
        branding: organization.branding,
        contact: organization.contact,
        adminEmailVerified: adminUser ? adminUser.emailVerified : false,
        program: organization.program,
        programResolved: resolveProgram(company, organization),
        programOverridden: getOverriddenFields(organization),
        companyProgramDefaults: company ? company.programDefaults : null,
        tierThresholds: organization.tierThresholds,
        menuEnabled: organization.menuEnabled,
        ...(subscriptionReminder ? { subscriptionReminder } : {})
      }
    });
```

- [ ] **Step 4: Add `tierThresholds` accept-and-merge to `updateMySettings`**

In the same file, modify `updateMySettings`. First, add `tierThresholds` to the destructure at line ~104:

```js
    const { name, branding, contact, program, menuEnabled, category, tierThresholds } = req.body;
```

Then add a merge block, matching the existing `program` merge block's pattern (per-label shallow merge, so a partial PATCH like `{ Gold: {...} }` doesn't wipe `Bronze`/`Silver`/`Platinum`):

```js
    if (tierThresholds !== undefined && typeof tierThresholds === "object") {
      const merged = { ...organization.tierThresholds.toObject?.() ?? organization.tierThresholds };
      for (const label of Object.keys(tierThresholds)) {
        merged[label] = { ...merged[label], ...tierThresholds[label] };
      }
      organization.tierThresholds = merged;
    }
```

Finally, add `tierThresholds: organization.tierThresholds` to the response object (currently ~lines 145-157), alongside `program`:

```js
    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        category: organization.category,
        branding: organization.branding,
        contact: organization.contact,
        program: organization.program,
        programResolved: resolveProgram(company, organization),
        programOverridden: getOverriddenFields(organization),
        companyProgramDefaults: company ? company.programDefaults : null,
        tierThresholds: organization.tierThresholds,
        menuEnabled: organization.menuEnabled
      }
    });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && node tests/tier-system.js`
Expected: all checks pass, including the three new ones and the sibling-outlet isolation check.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `cd backend && npm test 2>&1 | tail -40`
Expected: every suite passes, notably `tests/program-config.js` (exercises the same `updateMySettings` controller and must not break from the added `tierThresholds` merge block).

- [ ] **Step 7: Commit**

```bash
git add backend/controllers/tenantController.js backend/tests/tier-system.js
git commit -m "feat: configure per-outlet tier thresholds via admin settings"
```

---

## Task 4: Frontend — admin settings UI for tier thresholds

**Files:**
- Modify: `frontend/src/hooks/useAdminSettings.ts` (types)
- Modify: `frontend/src/routes/admin/PointsProgram.tsx` (new section)

**Interfaces:**
- Consumes: `GET /api/admin/settings` → `settings.tierThresholds`; `PATCH /api/admin/settings` body `{ tierThresholds }` from Task 3.
- Produces: nothing new consumed by later tasks (Task 5 reads tier data from `/api/points/balance` and `/api/admin/customers` directly, not from this settings UI).

- [ ] **Step 1: Add types to `frontend/src/hooks/useAdminSettings.ts`**

Add a new interface near `AdminProgram` (line ~45):

```ts
export interface TierThreshold {
  minVisits: number | null;
  minSpend: number | null;
}

export interface TierThresholds {
  Bronze: TierThreshold;
  Silver: TierThreshold;
  Gold: TierThreshold;
  Platinum: TierThreshold;
}
```

Add `tierThresholds: TierThresholds;` to the `AdminSettings` interface (alongside `program` at line ~66), and `tierThresholds?: Partial<TierThresholds>;` to `AdminSettingsPatch` (alongside `program?` at line ~89).

- [ ] **Step 2: Add a tier thresholds section to `frontend/src/routes/admin/PointsProgram.tsx`**

This page manages `program` state via `form`/`set`/`update.mutateAsync({ program: form })` (lines 17, 46-56), initialized from a `useEffect` at lines 19-21 (`if (settings && !form) setForm(settings.program);`). Add a parallel `tierForm` state following the exact same shape:

At the top of the component, alongside line 17's `const [form, setForm] = useState<AdminProgram | null>(null);`:

```tsx
import { type TierThresholds } from "../../hooks/useAdminSettings";

const TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"] as const;

// ...inside the component, alongside the existing `form` state:
const [tierForm, setTierForm] = useState<TierThresholds | null>(null);
```

Alongside the existing `useEffect` at lines 19-21:

```tsx
  useEffect(() => {
    if (settings && !tierForm) setTierForm(settings.tierThresholds);
  }, [settings, tierForm]);
```

Add the guard for `tierForm` to the loading check at line 23 (`if (isLoading || !form || !settings)` becomes `if (isLoading || !form || !tierForm || !settings)`), and add a save function alongside `save` (lines 49-56):

```tsx
  const saveTiers = async () => {
    try {
      await update.mutateAsync({ tierThresholds: tierForm });
      toast.success("Tiers saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const setTier = (label: (typeof TIER_LABELS)[number], field: "minVisits" | "minSpend", value: number | null) =>
    setTierForm((t) => (t ? { ...t, [label]: { ...t[label], [field]: value } } : t));
```

Render a new section (below the existing earn-rate/expiry card, same `rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6` container class used elsewhere on this page), one row per label in `TIER_LABELS`, each with two numeric inputs styled like the existing `earnPercent` input (`PointsProgram.tsx` lines 103-111 — the plain `<input type="number" min={0} step="1">` with matching Tailwind classes) — no `SegmentedControl`/inherit-override toggle here, since tiers have no inheritance and every field is always directly editable:

```tsx
      <div className="mt-6 flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-6">
        <h3 className="text-sm font-bold text-[var(--ink)]">Tiers</h3>
        {TIER_LABELS.map((label) => (
          <div key={label} className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
            <span className="w-24 text-sm font-semibold text-[var(--ink)]">{label}</span>
            <input
              type="number"
              min={0}
              step="1"
              placeholder="Min visits"
              value={tierForm[label].minVisits ?? ""}
              onChange={(e) => setTier(label, "minVisits", e.target.value === "" ? null : Number(e.target.value))}
              className="w-32 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <span className="text-xs text-[var(--muted)]">visits</span>
            <input
              type="number"
              min={0}
              step="1"
              placeholder="Min spend"
              value={tierForm[label].minSpend ?? ""}
              onChange={(e) => setTier(label, "minSpend", e.target.value === "" ? null : Number(e.target.value))}
              className="w-32 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <span className="text-xs text-[var(--muted)]">Rs spent</span>
          </div>
        ))}
        <Button onClick={saveTiers} disabled={update.isPending}>Save tiers</Button>
      </div>
```

- [ ] **Step 3: Manual verification (no automated frontend test in this repo for settings pages)**

Run: `npm run dev` from repo root, sign in as `durbarmarg@coffesarowar.com` / `password`, open the outlet admin's Points Program settings page, set Bronze/Silver/Gold/Platinum thresholds, save, reload the page, confirm the saved values persist.

- [ ] **Step 4: Run `npm run lint` (frontend typecheck)**

Run: `npm run lint` from repo root
Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAdminSettings.ts frontend/src/routes/admin/PointsProgram.tsx
git commit -m "feat: admin UI for configuring per-outlet tier thresholds"
```

---

## Task 5: Frontend — tier badge on customer balance card and admin customer list

**Files:**
- Modify: `frontend/src/hooks/usePoints.ts`
- Modify: `frontend/src/components/customer/PointsBalanceCard.tsx`
- Modify: `frontend/src/routes/CustomerDashboard.tsx:203-208`
- Modify: `frontend/src/routes/admin/AdminCustomers.tsx`

**Interfaces:**
- Consumes: `GET /api/points/balance` → `data.tier` (Task 2); `GET /api/admin/customers` → each row's `tier` (Task 2).

- [ ] **Step 1: Add `tier` to the `PointsBalance` frontend type**

In `frontend/src/hooks/usePoints.ts`, add `tier: string | null;` to the `PointsBalance` interface (lines 7-19), alongside `activeCampaign`:

```ts
export interface PointsBalance {
  balance: number;
  lastActivityAt: string | null;
  /** Null when the outlet's program never expires points. */
  expiresAt: string | null;
  earnPercent: number;
  /** 0 = never expires. */
  pointsExpiryDays: number;
  /** 1 unless a campaign is live right now. */
  multiplier: number;
  /** Null unless a campaign is live right now. */
  activeCampaign: { name: string; multiplier: number } | null;
  /** Null when the outlet has no tier thresholds configured, or none are met. */
  tier: string | null;
}
```

- [ ] **Step 2: Add a `tier` prop to `PointsBalanceCard`**

In `frontend/src/components/customer/PointsBalanceCard.tsx`, add `tier?: string | null;` to the `PointsBalanceCardProps` interface (currently lines 7-13). Render it using the existing `Badge` component (`frontend/src/components/ui/badge.tsx`) placed near the `businessName` label block (lines ~59-71) — only rendered when `tier` is truthy:

```tsx
{tier && <Badge>{tier}</Badge>}
```

Import `Badge` at the top of the file: `import { Badge } from "../ui/badge";`

- [ ] **Step 3: Pass `tier` through from `CustomerDashboard.tsx`**

Modify lines 203-208:

```tsx
          <PointsBalanceCard
            balance={balance}
            expiresAt={points?.expiresAt ?? null}
            businessName={tenant?.name}
            isLoading={cardLoading}
            tier={points?.tier ?? null}
          />
```

(`points` here is already the `usePoints()` hook's data, which now includes `tier` per Task 2 — no new fetch needed.)

- [ ] **Step 4: Add a tier column to `AdminCustomers.tsx`**

Add `tier: string | null;` to the `AdminCustomer` interface (currently lines 12-25).

Update the header row grid (currently `grid-cols-[2fr_1fr_1fr_1fr_1fr]` at line 102) to a 6-column grid `grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]`, adding a `<span>Tier</span>` header:

```tsx
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b border-[var(--line)] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
          <span>Customer</span>
          <span>No.</span>
          <span>Tier</span>
          <span>Points</span>
          <span>Redeemed</span>
          <span>Last visit</span>
        </div>
```

Update the data row (currently also `grid-cols-[2fr_1fr_1fr_1fr_1fr]` at line 135) to match, adding a tier cell between `customerNo` and `pointsBalance`:

```tsx
            <Link
              key={c.id}
              to={tenantPath(companySlug, outletSlug, `admin/customers/${c.id}`)}
              className="grid w-full grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 items-center border-b border-[var(--line)] px-5 py-3.5 text-left last:border-b-0 hover:bg-[var(--surface-2)]"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg)] text-xs font-bold text-[var(--muted)]">
                  {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[var(--ink)]">{c.name}</span>
                  <span className="block truncate text-xs text-[var(--soft)]">{c.email}</span>
                </span>
              </span>
              <span className="font-mono text-[13px] text-[var(--muted)]">{c.customerNo}</span>
              <span>{c.tier ? <Badge>{c.tier}</Badge> : <span className="text-[13px] text-[var(--soft)]">—</span>}</span>
              <span className="text-sm font-semibold">
                {c.pointsBalance}
              </span>
              <span className="text-sm font-semibold">{c.redemptionCount}</span>
              <span className="text-[13px] text-[var(--muted)]">{lastVisit(c.lastActivityAt)}</span>
            </Link>
```

Import `Badge` at the top of `AdminCustomers.tsx` if not already imported: `import { Badge } from "../../components/ui/badge";`

- [ ] **Step 5: Manual verification**

Run: `npm run dev` from repo root. As a customer with a configured tier (from Task 1/3's test setup, or manually set thresholds via Task 4's UI and earn points as a real customer through the app), confirm the tier badge appears on the dashboard balance card. As the outlet admin, open the customers list and confirm the Tier column renders (badge for tiered customers, `—` for untiered).

- [ ] **Step 6: Run `npm run lint` (frontend typecheck)**

Run: `npm run lint` from repo root
Expected: no new TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/usePoints.ts frontend/src/components/customer/PointsBalanceCard.tsx frontend/src/routes/CustomerDashboard.tsx frontend/src/routes/admin/AdminCustomers.tsx
git commit -m "feat: surface tier badge on customer dashboard and admin customer list"
```

---

## Explicitly out of scope for this plan

- Tier-based earn multipliers or perks — tiers are a segmentation label only (per the design spec).
- Analytics/reporting on tier distribution — Phase 2 of the roadmap spec.
- Any campaign/messaging/coupon work — later phases, not this plan.

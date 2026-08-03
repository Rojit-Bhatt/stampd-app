# Outlet Roles & Staff PIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role dimension under `outlet_admin` (`manager` / `staff` / `null`=primary) that gates the outlet console's management routes, and a per-outlet 4-digit staff PIN that identifies which staff member is acting at a shared counter device and stamps that identity onto the points ledger.

**Architecture:** One new field on `AdminAccount` (`staffRole`), one on `User` (`staffPinHash`), two on `PointsTransaction` / `DynamicQRToken` / `PendingClaim` (`performedByUserId`, `performedByName`). One new middleware `requireStaffPermission(action)` layered *after* the existing `isBusinessAdmin` on gated routes, one new rate limiter, one new service (`staffService`) + controller + six routes. The loyalty core is not modified — attribution rides the artifacts that already bridge generate→claim (`DynamicQRToken`, `PendingClaim`), both of which already carry `generatedBy`.

**Tech Stack:** Express, mongoose (in-memory mock DB in dev/test), `bcryptjs`, `express-rate-limit` (backend); React 19 + Vite + TS + Tailwind v4, TanStack Query, `motion` (frontend). Backend tests are plain `node tests/*.js` scripts.

**Spec:** `docs/superpowers/specs/2026-08-02-outlet-roles-and-staff-pin-design.md`

## Global Constraints

- **`isBusinessAdmin` is never weakened.** Every new check is an *additional* middleware mounted after it. Do not edit `requireRole` or `isBusinessAdmin`.
- **Do not touch** `DynamicQRToken.purpose`, the `consumeDynamicQrToken` single-use guard, the mandatory-bill check, or the atomic `findOneAndUpdate({balanceCenti: {$gte: price}})` redeem guard.
- **Every new query MUST carry `organizationId`, taken from `req.user.organizationId` (the JWT), never from the URL or body.** The only exception is `AdminAccount.findOne({_id: user.adminAccountId})`, whose id comes off a `User` row already fetched by the JWT's own `userId`.
- **Mock DB limits:** query matching is top-level equality, `$or`, `$lte`, `$gte` **only** — anything else *throws*. No `$in`/`$ne`/`$exists`, no nested-path queries, no `findById` (use `findOne({_id})`), no aggregation, no `updateMany`. Express "has a PIN" / "is primary" as a **JS filter after fetching**.
- **Backend layering:** `routes/ → controllers/ → services/ → models/`. Controllers parse, call a service, format. All logic in `services/`.
- **New test suites MUST be added to the `test` chain in `backend/package.json`** or they never run.
- **No new npm dependencies.** `bcryptjs` and `express-rate-limit` are installed.
- **`SALT_ROUNDS = 10`** — the constant `companyService.js` and `adminAuthService.js` already use. Reuse it, don't invent one.
- **Ports 5058 and 5059** are free; every other 50xx is taken by an existing suite.
- **Frontend has no test runner.** Verification for frontend tasks is `npm run lint` (`tsc --noEmit`) from the repo root.
- Run backend commands from `backend/`; run `npm run lint` from the repo root.
- Commit after each task.

---

### Task 1: `staffRole` on AdminAccount, resolved in `verifyToken`

**Files:**
- Modify: `backend/models/AdminAccount.js` (add `staffRole`, widen the org index)
- Modify: `backend/middleware/authMiddleware.js` (resolve `req.user.staffRole`, export `requireStaffPermission`)
- Create: `backend/tests/outlet-staff-roles.js`
- Modify: `backend/package.json` (add the suite to the `test` chain)

**Interfaces:**
- Produces: `req.user.staffRole: "manager" | "staff" | null`
- Produces: `requireStaffPermission(action) -> RequestHandler`, where `action ∈ {"manage_settings","manage_catalog","manage_marketing","view_reports","manage_staff"}`
- Produces: `403 { success:false, message:"Forbidden: this action isn't available for your role.", code:"STAFF_ROLE_FORBIDDEN" }`

- [ ] **Step 1: Write the failing test**

There is no way to create a `staff` account yet (that's Task 5), so this suite seeds one by hand through the test hook layer — except there is no hook for it either. Instead, drive it the way the product will: this first suite asserts only the **no-migration promise** and the middleware's own behaviour via a temporary direct-mount check. Concretely, assert that an existing outlet admin (`staffRole` unset) still passes everything.

Create `backend/tests/outlet-staff-roles.js`:

```js
/**
 * Outlet staff roles suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * The负 cases are the point of this suite. Grows across the plan's tasks:
 * Task 1 pins the no-migration promise (an admin created before staffRole
 * existed keeps full access), Task 2 adds the per-route 403 matrix, Task 5
 * adds the /api/admin/staff surface.
 *
 * Run directly: `node tests/outlet-staff-roles.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5058 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  try {
    // --- the no-migration promise ---------------------------------
    // An outlet admin provisioned the normal way has no staffRole at all.
    // It must keep full access to every gated surface, with no backfill.
    const outlet = await makeSiblingOutlet(baseUrl, { label: `sr${Date.now()}` });
    const t = outlet.adminToken;

    const settings = await api("/api/admin/settings", { token: t });
    check("existing admin reads settings", settings.status === 200, settings);
    check(
      "settings reports staffRole null for a pre-roles admin",
      settings.body?.settings?.staffRole === null,
      settings.body?.settings,
    );
    check(
      "settings reports staffPinRequired false for a fresh outlet",
      settings.body?.settings?.staffPinRequired === false,
      settings.body?.settings,
    );

    const patched = await api("/api/admin/settings", {
      method: "PATCH", token: t, body: { name: "Renamed By Primary" },
    });
    check("existing admin still writes settings", patched.status === 200, patched);

    const report = await api("/api/admin/reports/summary", { token: t });
    check("existing admin still reads reports", report.status === 200, report);

    const reward = await api("/api/admin/rewards", {
      method: "POST", token: t, body: { name: "Free Coffee", pointsPrice: 10 },
    });
    check("existing admin still creates rewards", reward.status === 201 || reward.status === 200, reward);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll outlet-staff-role checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Add to the `test` chain in `backend/package.json`, at the end, before the closing quote:

```
&& node tests/outlet-staff-roles.js
```

Run `node tests/outlet-staff-roles.js`. The two `staffRole` / `staffPinRequired` checks fail (fields don't exist yet); the rest pass.

- [ ] **Step 2: Add the field and widen the index**

In `backend/models/AdminAccount.js`, after the `kind` field:

```js
  // Only meaningful when kind === "outlet_admin". null/unset means FULL
  // access, including managing other staff — deliberate, so every outlet
  // admin that existed before this field keeps working with no migration.
  // Exactly the convention User.platformRole already uses one layer up.
  //
  //   null      -> the outlet's primary admin. Everything.
  //   "manager" -> everything except managing other staff.
  //   "staff"   -> the counter only: generate an earn QR, generate a redeem QR.
  //
  // The enum lists only the two ASSIGNABLE values. null is reachable as a
  // default but is never something a client can set: an outlet has exactly
  // one primary admin, created with the outlet.
  staffRole: { type: String, enum: ["manager", "staff"], default: null },
```

Replace the existing unique `organizationId` index with:

```js
// One PRIMARY admin per outlet. This used to be "one admin account per
// outlet" full stop; sub-admins end that, but the intent behind it — one
// unambiguous primary, so "the outlet's admin" is a well-defined lookup —
// survives, expressed more precisely. Managers and staff (staffRole set) are
// unconstrained.
//
// Indexes are not enforced by the mock DB, so this is ALSO asserted in the
// service: staffService.createStaff always writes a non-null staffRole, and
// no code path assigns null.
AdminAccountSchema.index(
  { organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organizationId: { $type: "objectId" },
      staffRole: null
    }
  }
);
```

- [ ] **Step 3: Resolve the role in `verifyToken` and add the guard**

In `backend/middleware/authMiddleware.js`, add `const AdminAccount = require("../models/AdminAccount");` to the requires.

Inside `verifyToken`, after the suspended-tenant block and before `req.user = {...}`:

```js
    // Only meaningful for role === "business_admin". Read fresh from the DB
    // on every request rather than trusting the JWT — same reasoning as
    // platformRole below: a demotion must take effect immediately, not ride
    // out the rest of JWT_EXPIRES_IN.
    //
    // A business_admin row with no adminAccountId resolves to null, i.e. full
    // access. That is the no-migration promise, not an oversight.
    let staffRole = null;
    if (user.role === "business_admin" && user.adminAccountId) {
      const adminAccount = await AdminAccount.findOne({ _id: user.adminAccountId });
      staffRole = adminAccount ? (adminAccount.staffRole || null) : null;
    }
```

Add to the `req.user` object literal:

```js
      // "manager" | "staff" | null. null means the outlet's primary admin
      // (or any account predating this field) — full access.
      staffRole,
```

Then, after `isPlatformOwner`:

```js
// The outlet-console counterpart to isPlatformOwner: a second, ADDITIONAL
// gate mounted after isBusinessAdmin, never instead of it. isBusinessAdmin
// still decides whether you are this outlet's staff at all; this decides
// which parts of the console that entitles you to.
//
// Actions are coarse on purpose — one per console AREA, not per route — so
// a new route in an existing area cannot land ungated behind a
// plausible-looking new action name.
const STAFF_ACTIONS = [
  "manage_settings",   // PATCH /settings: branding, contact, points program, tiers
  "manage_catalog",    // menu + rewards + images
  "manage_marketing",  // campaigns + events + broadcasts
  "view_reports",      // dashboard, reports, downloads, ledger, customer roster
  "manage_staff"       // the sub-admin surface itself
];

const staffRoleAllows = (staffRole, action) => {
  if (!staffRole) return true;                    // primary admin / pre-roles
  if (staffRole === "manager") return action !== "manage_staff";
  return false;                                   // "staff": the counter only
};

const requireStaffPermission = (action) => {
  if (!STAFF_ACTIONS.includes(action)) {
    throw new Error(`Unknown staff permission action: ${action}`);
  }
  return (req, res, next) => {
    if (!req.user || !staffRoleAllows(req.user.staffRole, action)) {
      // One message for all five actions. Naming the action back would tell a
      // restricted account the shape of the model it's being kept out of, and
      // buys a legitimate user nothing they can act on.
      return res.status(403).json({
        success: false,
        message: "Forbidden: this action isn't available for your role.",
        code: "STAFF_ROLE_FORBIDDEN"
      });
    }
    next();
  };
};
```

Export `requireStaffPermission` and `staffRoleAllows` (the latter for `staffService` to reuse).

- [ ] **Step 4: Expose `staffRole` + `staffPinRequired` on GET /settings**

`backend/services/staffService.js` doesn't exist yet, so put the predicate inline for now and move it in Task 4. In `backend/controllers/tenantController.js`'s `getMySettings`, add to the `settings` object:

```js
        // The acting admin's own role, so the console can hide what the
        // server would refuse anyway. null = primary admin, full access.
        staffRole: req.user.staffRole,
        // Whether the two counter routes demand a PIN here. True iff at
        // least one membership at this outlet has one set — see the design
        // doc, §2.2: setting the first PIN is the switch that turns the
        // feature on for the whole outlet.
        staffPinRequired: await outletRequiresPin(organization._id),
```

For this task, define `outletRequiresPin` at the top of the controller as a stub that always returns `false` (the field doesn't exist yet); Task 4 replaces it with the `staffService` import.

- [ ] **Step 5: Verify**

```bash
cd backend && node tests/outlet-staff-roles.js
```

All checks pass. Then `npm test` from `backend/` — nothing else may regress. Then `npm run lint` from the repo root.

- [ ] **Step 6: Commit** — `feat: add staffRole to AdminAccount and a staff permission guard`

---

### Task 2: Gate the management routes

**Files:**
- Modify: `backend/routes/adminRoutes.js` (add `requireStaffPermission` to 25 routes)
- Modify: `backend/tests/outlet-staff-roles.js` (the 403 matrix — needs a `staff` account, so this task adds a test-only hook)
- Modify: `backend/routes/testHookRoutes.js` (add `set-staff-role`)

**Interfaces:**
- Consumes: `requireStaffPermission` from `backend/middleware/authMiddleware.js`
- Produces: `POST /__test__/set-staff-role { email, staffRole }` (DEV/TEST ONLY)

- [ ] **Step 1: Add the test hook**

Task 5 builds the real invite endpoint, but the 403 matrix must be provable *now*, before any of the staff surface exists — otherwise the gates go in untested and the plan's whole ordering argument collapses. Follow the existing hook style in `backend/routes/testHookRoutes.js` (see `mint-admin-token`):

```js
// DEV/TEST ONLY. Set an existing AdminAccount's staffRole directly, so a
// suite can exercise the permission matrix without first standing up the
// whole invite flow. The real path is POST /api/admin/staff.
router.post("/set-staff-role", async (req, res, next) => {
  try {
    const { email, staffRole } = req.body;
    const account = await AdminAccount.findOne({ email: String(email || "").toLowerCase() });
    if (!account) return res.status(404).json({ success: false });
    account.staffRole = staffRole || null;
    await account.save();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
```

Check how `testHookRoutes.js` is mounted/guarded in `server.js` and match it — do not loosen whatever gate it already has.

- [ ] **Step 2: Write the failing test**

Append to `backend/tests/outlet-staff-roles.js`, before the `finally`:

```js
    // --- the 403 matrix -------------------------------------------
    // Two more sibling outlets, each demoted to a role, so the matrix is
    // asserted against real tokens rather than a unit-tested predicate.
    const staffOutlet = await makeSiblingOutlet(baseUrl, { label: `st${Date.now()}` });
    await api("/__test__/set-staff-role", {
      method: "POST", body: { email: staffOutlet.adminEmail, staffRole: "staff" },
    });
    const staffT = staffOutlet.adminToken;

    const mgrOutlet = await makeSiblingOutlet(baseUrl, { label: `mg${Date.now()}` });
    await api("/__test__/set-staff-role", {
      method: "POST", body: { email: mgrOutlet.adminEmail, staffRole: "manager" },
    });
    const mgrT = mgrOutlet.adminToken;

    // The token is re-verified against the DB on every request, so the
    // demotion applies to the ALREADY-ISSUED token with no re-login. Assert
    // that directly — it's the reason staffRole is resolved in verifyToken
    // rather than baked into the JWT.
    const staffSettings = await api("/api/admin/settings", { token: staffT });
    check(
      "a demotion applies to an already-issued token",
      staffSettings.body?.settings?.staffRole === "staff",
      staffSettings.body?.settings,
    );

    // GET /settings must stay OPEN for staff: AdminGuard revalidates against
    // it, and a 403 here would log the account out in a loop.
    check("staff can still READ settings", staffSettings.status === 200, staffSettings);

    const blocked = [
      ["manage_settings", "PATCH", "/api/admin/settings", { name: "Nope" }],
      ["view_reports",    "GET",   "/api/admin/reports/customers/download"],
      ["view_reports",    "GET",   "/api/admin/reports/summary"],
      ["view_reports",    "GET",   "/api/admin/dashboard-stats"],
      ["view_reports",    "GET",   "/api/admin/transactions"],
      ["view_reports",    "GET",   "/api/admin/customers"],
      ["manage_catalog",  "POST",  "/api/admin/rewards", { name: "X", pointsPrice: 1 }],
      ["manage_catalog",  "POST",  "/api/admin/menu", { name: "X", price: 1 }],
      ["manage_marketing","POST",  "/api/admin/campaigns", { name: "X", multiplier: 2 }],
      ["manage_marketing","POST",  "/api/admin/events", { title: "X" }],
      ["manage_marketing","GET",   "/api/admin/broadcasts"],
    ];

    for (const [action, method, path, body] of blocked) {
      const r = await api(path, { method, token: staffT, body });
      check(
        `staff is 403 on ${method} ${path} (${action})`,
        r.status === 403 && r.body?.code === "STAFF_ROLE_FORBIDDEN",
        r,
      );
    }

    // A manager passes every one of those.
    for (const [, method, path, body] of blocked) {
      const r = await api(path, { method, token: mgrT, body });
      check(`manager is NOT 403 on ${method} ${path}`, r.status !== 403, r);
    }

    // Reads the counter genuinely needs stay open for staff. Campaigns
    // especially: GenerateQr.tsx reads it to show the live multiplier BEFORE
    // staff quote a number, so gating it would make them quote the wrong one.
    for (const path of ["/api/admin/campaigns", "/api/admin/menu", "/api/admin/rewards", "/api/admin/events"]) {
      const r = await api(path, { token: staffT });
      check(`staff can still read ${path}`, r.status === 200, r);
    }

    // And the counter itself is untouched by the role.
    const staffQr = await api("/api/admin/generate-qr", {
      method: "POST", token: staffT, body: { billAmount: 500 },
    });
    check("staff can still generate an earn QR", staffQr.status === 200, staffQr);
    const staffRedeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: staffT });
    check("staff can still generate a redeem QR", staffRedeemQr.status === 200, staffRedeemQr);
```

Run it — every `403` check fails, because nothing is gated yet.

- [ ] **Step 3: Gate the routes**

In `backend/routes/adminRoutes.js`, import `requireStaffPermission` alongside the existing guards, and add it as the third middleware on exactly these routes. **The reads not listed here stay open — that is deliberate, not an omission.**

```js
const { verifyToken, isBusinessAdmin, requireStaffPermission } = require("../middleware/authMiddleware");

// Shorthand so the route table stays readable at a glance.
const canSettings  = requireStaffPermission("manage_settings");
const canCatalog   = requireStaffPermission("manage_catalog");
const canMarketing = requireStaffPermission("manage_marketing");
const canReports   = requireStaffPermission("view_reports");
```

| route | guard |
|---|---|
| `PATCH /settings` | `canSettings` |
| `GET /transactions` | `canReports` |
| `GET /customers` | `canReports` |
| `GET /dashboard-stats` | `canReports` |
| `GET /tier-distribution` | `canReports` |
| `GET /reports/summary` | `canReports` |
| `GET /reports/summary/download` | `canReports` |
| `GET /reports/customers/download` | `canReports` |
| `GET /reports/transactions/download` | `canReports` |
| `POST /menu` | `canCatalog` |
| `POST /menu/import/preview` | `canCatalog` |
| `POST /menu/import/confirm` | `canCatalog` |
| `PATCH /menu/:id` | `canCatalog` |
| `DELETE /menu/:id` | `canCatalog` |
| `POST /rewards` | `canCatalog` |
| `PATCH /rewards/:id` | `canCatalog` |
| `DELETE /rewards/:id` | `canCatalog` |
| `POST /images` | `canCatalog` |
| `DELETE /images/:id` | `canCatalog` |
| `POST /campaigns` | `canMarketing` |
| `PATCH /campaigns/:id` | `canMarketing` |
| `DELETE /campaigns/:id` | `canMarketing` |
| `POST /events` | `canMarketing` |
| `PATCH /events/:id` | `canMarketing` |
| `DELETE /events/:id` | `canMarketing` |
| `GET /broadcasts` | `canMarketing` |
| `GET /broadcasts/:id` | `canMarketing` |
| `POST /broadcasts` | `canMarketing` |
| `PATCH /broadcasts/:id` | `canMarketing` |
| `DELETE /broadcasts/:id` | `canMarketing` |

For `POST /menu/import/preview` and `POST /images`, the guard goes **before** the multer middleware (`uploadMenuFile`, `uploadImageFile`) — reject on role before buffering a file into memory.

Add a comment above the block explaining what is deliberately left open (`GET /settings`, the four catalog reads, `/menu/template`, and the two counter routes), citing the design doc.

- [ ] **Step 4: Verify**

`node tests/outlet-staff-roles.js` passes. Then `npm test` from `backend/` — **especially** `multi-tenant-isolation.js` and `unified-admin-login.js`, whose admins all have `staffRole` null and must be unaffected. Then `npm run lint` from the repo root.

- [ ] **Step 5: Commit** — `feat: gate outlet management routes behind staff roles`

---

### Task 3: `staffPinHash` and the ledger attribution columns

**Files:**
- Modify: `backend/models/User.js` (add `staffPinHash`)
- Modify: `backend/models/PointsTransaction.js` (add `performedByUserId`, `performedByName`)
- Modify: `backend/models/DynamicQRToken.js` (same two)
- Modify: `backend/models/PendingClaim.js` (same two)

Schema-only task; no test of its own (Task 6 asserts the columns end-to-end). Each field is nullable with a comment explaining that an absent attribution is a real state, not a defect.

`User.staffPinHash`:

```js
  // bcrypt hash of a 4-digit counter PIN, or null. Lives on the outlet-scoped
  // MEMBERSHIP, not on the global AdminAccount: a PIN is a counter credential
  // for one till, not an identity, and this row is also what
  // PointsTransaction.performedByUserId points at — so verifying a PIN and
  // resolving an attribution are one lookup instead of two.
  //
  // Hashing doesn't make four digits strong; it makes a database read
  // insufficient to impersonate someone at the counter, which is the threat.
  staffPinHash: { type: String, default: null },
```

`PointsTransaction`, after `token`:

```js
  // Which staff member was at the counter. Null for every row written before
  // this existed and for every outlet that hasn't turned PINs on — an absent
  // attribution is a real state, not a defect. Never set on `expire` rows:
  // no one initiates those.
  performedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Denormalized for the same reason rewardName and campaignName above are:
  // the membership can be deleted, and the ledger has to keep saying who did
  // this after the row it names is gone.
  performedByName: { type: String, default: "" },
```

`DynamicQRToken` and `PendingClaim` get the same pair, with a comment noting they carry it *forward* — the attribution is decided at the counter but written at the ledger, minutes apart on the earn path, and these two already bridge that gap for `generatedBy`.

- [ ] **Verify:** `cd backend && npm test` (nothing should change) and `npm run lint`.
- [ ] **Commit** — `feat: add staff PIN and ledger attribution columns`

---

### Task 4: `staffService` — PIN verify, the requirement predicate, and the limiter

**Files:**
- Create: `backend/services/staffService.js`
- Modify: `backend/middleware/rateLimitMiddleware.js` (add `pinLimiter`)
- Modify: `backend/controllers/tenantController.js` (real `staffPinRequired`)
- Create: `backend/controllers/staffController.js` (verify-pin only for now)
- Modify: `backend/routes/adminRoutes.js` (mount `POST /verify-pin`)
- Create: `backend/tests/staff-pin.js`
- Modify: `backend/package.json` (add the suite)

**Interfaces:**
- `staffService.outletRequiresPin(organizationId) -> Promise<boolean>`
- `staffService.verifyPin({organizationId, pin}) -> Promise<{userId, name, staffRole} | null>`
- `staffService.assertPinFormat(pin)` — throws 400 `INVALID_PIN_FORMAT`
- `POST /api/admin/verify-pin` → `200 {success, staff:{userId,name,staffRole}}` · `400 INVALID_PIN_FORMAT` · `401 PIN_REJECTED` · `429`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/staff-pin.js` on **port 5059**. It needs PINs set before Task 5's endpoints exist, so add a `POST /__test__/set-staff-pin { email, pin }` hook (same style as Task 2's) that hashes with bcrypt and writes `staffPinHash` on that account's membership.

Cover, in this order (the limiter check **must be last** — it poisons the shared per-IP bucket for the rest of the process):

```js
    // 1. A fresh outlet requires no PIN, and the counter is unchanged.
    // 2. Setting a PIN flips staffPinRequired to true on GET /settings.
    // 3. The correct PIN verifies and returns {userId, name, staffRole}.
    // 4. A wrong PIN -> 401 PIN_REJECTED.
    // 5. A malformed PIN ("12", "abcd", "") -> 400 INVALID_PIN_FORMAT.
    // 6. CROSS-OUTLET: the SAME pin string set at outlet A and outlet B.
    //    Verifying at A returns A's member; verifying at B returns B's.
    //    Neither ever returns the other's userId. This is the isolation
    //    assertion — in a 10,000-value space across a multi-tenant platform,
    //    identical PINs at two outlets are routine, not contrived.
    // 7. A pin-less POST /api/admin/generate-qr hammered 25 times is NEVER
    //    throttled — the assertion that keeps every existing points suite
    //    from becoming flaky when pinLimiter lands on that route.
    // 8. LAST: 21 wrong-PIN verify attempts -> the 21st is 429 with
    //    {success:false, message} (the app's JSON error shape, not
    //    express-rate-limit's plain-text default).
```

For (6), the two outlets must be real siblings via `makeSiblingOutlet`, and the check must compare the returned `userId` values, not just the status codes.

Add `&& node tests/staff-pin.js` to the `test` chain.

- [ ] **Step 2: `pinLimiter`**

In `backend/middleware/rateLimitMiddleware.js`, after `uploadLimiter`, add the limiter exactly as specced (§2.5) — 20/minute, its own bucket, `jsonHandler`, and the **load-bearing `skip`**:

```js
  skip: (req) => typeof req.body?.pin !== "string",
```

The comment must say why `skip` is not an optimisation: without it, every existing suite that generates QR codes in a loop starts tripping a limiter it doesn't know exists. Add `pinLimiter` to `module.exports`.

- [ ] **Step 3: `staffService`**

```js
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AdminAccount = require("../models/AdminAccount");

const SALT_ROUNDS = 10;
const PIN_PATTERN = /^\d{4}$/;

// Every staff query in this file starts here. The organizationId is always
// the caller's own, from the JWT — which is what makes cross-outlet leakage
// structurally impossible rather than a filter someone has to remember.
// Top-level equality only, so it is mock-DB safe.
const outletMemberships = (organizationId) =>
  User.find({ organizationId, role: "business_admin" });

// The mock DB has no $ne/$exists, so "has a PIN" is a JS filter after the
// fetch, not a query term.
const withPin = (rows) => rows.filter((u) => Boolean(u.staffPinHash));
```

- `outletRequiresPin(organizationId)` → `withPin(await outletMemberships(id)).length > 0`
- `assertPinFormat(pin)` → throws 400 `INVALID_PIN_FORMAT` unless `PIN_PATTERN.test(pin)`
- `verifyPin({organizationId, pin})` → format-check, then `bcrypt.compare` against each `withPin` row until one matches; load that row's `AdminAccount` for `staffRole`; return `{userId, name, staffRole}` or `null`.
- `assertPinAvailable({organizationId, pin, exceptUserId})` → 409 `PIN_TAKEN` if any *other* membership's hash matches. No index can express this (the values are hashed), so it's a service check — the same posture `companyService.assertEmailAvailable` takes.
- `hashPin(pin)` → `bcrypt.hash(pin, SALT_ROUNDS)`

Use `companyService.createHttpError` rather than a local copy.

- [ ] **Step 4: Controller + route**

`staffController.verifyPinController` reads `req.body.pin` and `req.user.organizationId` — **never an org from the body; there is no parameter for one.** Null result → `401 PIN_REJECTED` with a message that does not distinguish "no match" from "PINs aren't set up here" (same posture as `adminLogin`'s single message).

Mount, in `adminRoutes.js`:

```js
// Deliberately NOT behind requireStaffPermission: a "staff" account calling
// this is the entire point. Rate-limited instead.
router.post("/verify-pin", verifyToken, isBusinessAdmin, pinLimiter, verifyPinController);
```

Replace the Task 1 `outletRequiresPin` stub in `tenantController.js` with the real import.

- [ ] **Step 5: Verify** — `node tests/staff-pin.js`, then `npm test`, then `npm run lint`.
- [ ] **Step 6: Commit** — `feat: verify a staff PIN against the acting outlet only`

---

### Task 5: The staff management surface

**Files:**
- Modify: `backend/services/staffService.js` (list/create/updateRole/delete/setPin)
- Modify: `backend/controllers/staffController.js`
- Modify: `backend/routes/adminRoutes.js` (five routes)
- Modify: `backend/services/companyService.js` (`enterOutlet` + `listOutlets` pick the primary)
- Modify: `backend/tests/outlet-staff-roles.js`

**Interfaces:** the five routes and their bodies/codes exactly as specced (§2.6).

- [ ] **Step 1: Write the failing test**

Append to `outlet-staff-roles.js`. Assert, at minimum:

- `manager` is **403 `STAFF_ROLE_FORBIDDEN`** on all five `/api/admin/staff` routes.
- `POST /api/admin/staff` before the caller has a PIN → **400 `SET_YOUR_PIN_FIRST`**. This is the lockout guard; without it the first invite could turn PINs on at an outlet whose only admin has none.
- After `PATCH /api/admin/staff/me/pin`, the invite succeeds (201) and the new row appears in `GET /api/admin/staff` with `hasPin: true`, `emailVerified: false`.
- The invitee **cannot sign in until verified** — `POST /api/admin-auth/login` → 403 `EMAIL_NOT_VERIFIED`; after `verifyAdmin(api, email)` it succeeds. This is the assertion that the invite genuinely reuses the existing flow rather than forking it.
- Duplicate PIN at the same outlet → **409 `PIN_TAKEN`**; the same PIN at a *different* outlet → fine.
- `PATCH`/`DELETE` with an `:id` belonging to **another outlet's** staff → **404**, not 403 and not a leak. Use the sibling outlet's real membership id.
- `CANNOT_EDIT_SELF` on `PATCH /api/admin/staff/:ownId`.
- `CANNOT_MODIFY_PRIMARY` on `PATCH`/`DELETE` targeting the primary.
- `staffRole: null` in the `PATCH` body → **400 `INVALID_STAFF_ROLE`** (no self-promotion path).
- Self PIN change with a wrong `currentPin` → **401 `PIN_REJECTED`**.
- The response never contains `staffPinHash` in any shape — assert on the raw JSON string.

- [ ] **Step 2: Implement the service**

`createStaff` runs its guards in the specced order (§2.6) and reuses, without forking: `companyService.assertEmailAvailable`, `bcrypt` at `SALT_ROUNDS`, the `AdminAccount` + `User` two-row pattern from `companyService.createOutlet`, and `companyService.sendAdminVerifyEmail`. `companyId` is read from the **organization**, never from the request.

`updateStaffRole` / `deleteStaff` / `setStaffPin` each fetch their target in a **single** query — `User.findOne({_id: id, organizationId, role: "business_admin"})` — never fetched-then-checked. An id from another outlet matches nothing and 404s, the same posture menu import already takes with a tampered `existingId`.

`setStaffPin` resolves `:id === "me"` to `req.user.id` **before** the lookup, and applies the compound gate: `manage_staff` (via the exported `staffRoleAllows`) *or* self; self with an existing PIN requires a matching `currentPin`.

`isPrimary` is `adminAccount.staffRole === null`, computed in JS after fetching (no `$exists` in the mock DB).

- [ ] **Step 3: Fix the two single-admin assumptions**

`companyService.enterOutlet` currently does `User.findOne({organizationId, role: "business_admin"})` — ambiguous once a second membership exists, and a company owner entering their own outlet must land with **full** access. Fetch all candidates, resolve each one's `AdminAccount`, pick the `staffRole === null` row, fall back to the first. Same fix for `listOutlets`'s `AdminAccount.findOne({organizationId})`, which feeds the owner console's "admin" column and must show the actual admin, not a barista.

Add a test to `outlet-staff-roles.js`: after inviting staff at an outlet, the company owner's `enter-outlet` still returns a token whose `GET /api/admin/settings` reports `staffRole: null`.

- [ ] **Step 4: Mount the routes**

```js
const canStaff = requireStaffPermission("manage_staff");

router.get("/staff", verifyToken, isBusinessAdmin, canStaff, staffController.list);
router.post("/staff", verifyToken, isBusinessAdmin, canStaff, staffController.create);
router.patch("/staff/:id", verifyToken, isBusinessAdmin, canStaff, staffController.updateRole);
router.delete("/staff/:id", verifyToken, isBusinessAdmin, canStaff, staffController.remove);
// The one compound gate: manage_staff OR self. A manager cannot manage_staff,
// so without the self path it could never set a PIN and would be locked out
// of the counter the moment the outlet turns PINs on. Enforced in the
// service, which is why canStaff is absent here.
router.patch("/staff/:id/pin", verifyToken, isBusinessAdmin, pinLimiter, staffController.setPin);
```

- [ ] **Step 5: Verify** — `node tests/outlet-staff-roles.js`, `npm test`, `npm run lint`.
- [ ] **Step 6: Commit** — `feat: invite and manage outlet sub-admins`

---

### Task 6: Stamp the attribution onto the ledger

**Files:**
- Modify: `backend/services/pointsService.js`
- Modify: `backend/services/pendingClaimService.js`
- Modify: `backend/controllers/pointsController.js`
- Modify: `backend/routes/adminRoutes.js` (`pinLimiter` on the two counter routes)
- Modify: `backend/tests/staff-pin.js`

- [ ] **Step 1: Write the failing test**

In `staff-pin.js`, before the limiter check:

- At a PIN-less outlet, a full earn (generate → claim) lands a transaction with `performedByUserId: null`. Read it back through `GET /api/admin/transactions` (the primary admin can; a `staff` account cannot).
- At a PIN outlet: `generate-qr` **without** a pin → **403 `STAFF_PIN_REQUIRED`**; with a **wrong** pin → **401 `PIN_REJECTED`**; with the right pin → 200, and after the customer claims, the ledger row carries that member's `performedByUserId` and `performedByName`.
- The same for the redeem side, attributed at `generate-redeem-qr` (the only staff-side moment — the customer confirms the redemption on their own phone).
- `generate-qr` with a **`staffUserId` but no `pin`** is still 403: the routes take a raw PIN and never a client-supplied identity, because an identity the client hands forward is not a verified identity.

- [ ] **Step 2: Thread it through**

`generateQRToken` / `generateRedeemToken` take an options object `{performedByUserId, performedByName}` and write it onto the `DynamicQRToken`. Do **not** change their existing positional parameters' meaning.

`pendingClaimService.convertTokenToPendingClaim` copies both fields from `consumedToken` onto the `PendingClaim`, exactly alongside the existing `generatedBy: consumedToken.generatedBy`.

`awardPointsInTransaction` takes both as optional parameters defaulting to `null` / `""`, and writes them onto the `PointsTransaction`. Both call sites pass them: `claimPoints` from `existingToken`, `pendingClaimService.fulfil` from `claim`.

`redeemPoints` **captures** the return value of `consumeDynamicQrToken` (which it currently discards) and passes both fields onto the redeem ledger row. Do not otherwise alter that call or the atomic guard beneath it.

- [ ] **Step 3: Enforce at the controller**

In `pointsController`'s two generate handlers: if `staffService.outletRequiresPin(req.user.organizationId)`, then a missing `pin` → 403 `STAFF_PIN_REQUIRED`, a failed `verifyPin` → 401 `PIN_REJECTED`, a match → pass `{performedByUserId, performedByName}` into the service. If the outlet doesn't require one, the `pin` is ignored entirely and behaviour is unchanged.

Add `pinLimiter` to both counter routes in `adminRoutes.js`. Its `skip` means pin-less requests are never counted, so nothing existing changes.

- [ ] **Step 4: Verify** — `node tests/staff-pin.js`, then the **full** `npm test`. `points-earn.js`, `points-redeem.js`, `integration-qa.js` and `multi-tenant-isolation.js` all generate QR codes in loops and must be untouched. Then `npm run lint`.
- [ ] **Step 5: Commit** — `feat: stamp the acting staff member onto the points ledger`

---

### Task 7: Frontend — types, PIN gate, counter wiring

**Files:**
- Modify: `frontend/src/hooks/useAdminSettings.ts` (`staffRole`, `staffPinRequired`)
- Create: `frontend/src/hooks/useStaff.ts`
- Create: `frontend/src/components/admin/StaffPinGate.tsx`
- Modify: `frontend/src/routes/admin/GenerateQr.tsx`
- Modify: `frontend/src/routes/admin/RedeemPoints.tsx`

- [ ] **Step 1: Types**

Add to `AdminSettings`:

```ts
  /** The acting admin's role. null = the outlet's primary admin, full access. */
  staffRole: "manager" | "staff" | null;
  /** True once anyone at this outlet has a PIN — see the design doc, §2.2. */
  staffPinRequired: boolean;
```

Add `useStaff()` / `useInviteStaff()` / `useUpdateStaffRole()` / `useSetStaffPin()` / `useRemoveStaff()` in `useStaff.ts`, following the `useAdminSettings.ts` shape (TanStack Query, `apiRequest` with `role: "admin"`, query key including the org id).

- [ ] **Step 2: `StaffPinGate.tsx`**

A render-prop / children component: when `!staffPinRequired`, renders children immediately and passes `pin: null`. Otherwise it renders a PIN pad until `POST /api/admin/verify-pin` succeeds, then renders children plus a slim identity bar (`Asha · staff`) with a **Switch user** action.

- **The PIN lives in React state only, for the life of the tab.** Never localStorage, never sessionStorage, never a cookie. It is re-sent with every generate call so the server re-verifies every action; the client is never trusted to remember *that* it verified, only *what* was typed.
- A 401 `PIN_REJECTED` from a *generate* call (the PIN was reset mid-shift) drops the gate back to the pad with a toast, rather than leaving a bare error on a screen that looks unlocked.
- 3×4 numeric grid, large targets (this is a phone or tablet at a counter), plus a hidden `inputMode="numeric"` field so a hardware keypad works. Four filled dots, auto-submit on the fourth digit, shake-and-clear on rejection — through `useMotion()`, which resolves reduced motion for you. Digits masked; no reveal toggle.
- Use the existing `Button` / `Input` primitives and the `--surface` / `rounded-3xl` / `.shadow-ambient` card convention. Toast copy stays light and chill.

- [ ] **Step 3: Wire the two counter pages**

Wrap each page's body in `<StaffPinGate>` and include the supplied `pin` in the `generate` request body. When no PIN is required, neither page changes at all.

- [ ] **Step 4: Verify** — `npm run lint` from the repo root, clean.
- [ ] **Step 5: Commit** — `feat: require a staff PIN at the counter when the outlet uses them`

---

### Task 8: Frontend — the Sub-Admin tab and role-aware nav

**Files:**
- Create: `frontend/src/components/admin/SubAdminSettingsTab.tsx`
- Modify: `frontend/src/routes/admin/AdminSettings.tsx`
- Modify: `frontend/src/components/admin/AdminLayout.tsx`

- [ ] **Step 1: The tab**

Add a third tab through the **existing** `SettingsTabs` shell in `AdminSettings.tsx` — whose own doc comment already anticipates this exact addition ("a later settings surface (PIN, sub-admin roles) can add a tab without touching this file"). **Do not build a new tab shell.** Render it only when `settings.staffRole === null`.

```tsx
        tabs={[
          { value: "account", label: "Account", content: <AccountSettingsForm role="admin" /> },
          { value: "customer-info", label: "Customer Info", content: <CustomerInfoSettingsTab /> },
          ...(settings?.staffRole === null
            ? [{ value: "sub-admin", label: "Sub-Admin", content: <SubAdminSettingsTab /> }]
            : []),
        ]}
```

The tab shows the staff list (name, email, role badge, PIN state, an "unverified" badge), an **Invite** dialog (name / email / role / password / PIN), and per row a PIN reset and a remove action. The primary admin's row is marked and carries no role or remove control. Destructive actions go through the existing `alert-dialog` primitive.

Above the list, once and plainly: *"Once anyone here has a PIN, everyone needs one to use the earn and redeem screens."* The switch in §2.2 must not be something an admin discovers by having their till stop working.

- [ ] **Step 2: Role-aware nav**

In `AdminLayout.tsx`, for `settings?.staffRole === "staff"`, render only the two pinned counter actions and the account menu — the Overview, Transactions, Customers, Reports group and the whole Manage section are dropped, because every route behind them 403s. Redirect a `staff` account landing on the console index to `generate`, which would otherwise be a page of failed queries.

The frontend gate is convenience, not security: the server refuses regardless, and Tasks 2 and 5 assert that.

- [ ] **Step 3: Verify** — `npm run lint` from the repo root, clean.
- [ ] **Step 4: Commit** — `feat: add a Sub-Admin settings tab and role-aware console nav`

---

### Task 9: Final verification

- [ ] `cd backend && npm test` — full chain, **0 failures**. `multi-tenant-isolation.js` and `unified-admin-login.js` get particular attention: neither may be modified to accommodate this work.
- [ ] `npm run lint` from the repo root — clean.
- [ ] Confirm `tests/outlet-staff-roles.js` and `tests/staff-pin.js` are both in the `test` chain in `backend/package.json`.
- [ ] Re-read the design doc's §4 isolation table against the shipped code: every new query org-scoped from the JWT, every `:id` route fetched in a single `{_id, organizationId, role}` query.
- [ ] Commit any stragglers.

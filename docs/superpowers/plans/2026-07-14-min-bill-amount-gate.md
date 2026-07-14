# Epic B1 — Minimum Bill Amount Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tenant can configure a minimum bill amount; below it, the barista cannot generate a stamp QR for that customer.

**Architecture:** One new `Organization.program.minBillAmount` field (default 0 = disabled). Backend hard-rejects `generate-qr` when the entered bill amount is below the configured minimum — the real enforcement boundary. Frontend surfaces the field in both the admin's Stamp Program settings and the barista's Generate QR screen, with client-side disable-and-hint as a UX nicety on top of the backend check.

**Tech Stack:** Node/Express, Mongoose (+ in-memory mock in dev), React 19 + Vite + TS, TanStack Query.

## Global Constraints

- Every user/loyalty query includes `organizationId` — tenant isolation is the core invariant.
- Backend layering: `routes/ → controllers/ (thin) → services/ (logic) → models/`.
- `minBillAmount` is a plain `Number`, never a currency-formatted string (no parsing needed for comparison).
- `minBillAmount = 0` means the gate is fully disabled — no validation, no required field, byte-for-byte the same behavior as before this feature existed.
- The entered bill amount is check-and-discard only — it is never persisted (not on `DynamicQRToken`, not anywhere else).
- Backend is the authoritative check; any client-side disable/hint is defense-in-depth only, never a replacement for the server-side validation.
- Commit with explicit file paths (`git add <path>`) — never `git add -A`.

---

### Task 1: Backend gate — schema, service validation, controller wiring

**Files:**
- Modify: `backend/models/Organization.js`
- Modify: `backend/config/platform.js`
- Modify: `backend/services/stampService.js`
- Modify: `backend/controllers/stampController.js`
- Create: `backend/tests/min-bill-amount.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `loadOrganizationOrThrow(organizationId)` (already defined in `stampService.js`, used by `claimStamp`) — returns the `Organization` doc or throws a 400/404 `createHttpError`.
- Produces: `generateQRToken(adminUserId, organizationId, billAmount)` — signature gains a third parameter. Throws `createHttpError(message, 400)` when the gate rejects; otherwise returns the same `{ success: true, data: { token, expiresInSeconds } }` shape as today.

- [ ] **Step 1: Add the schema field**

In `backend/models/Organization.js`, the `program` sub-schema currently reads:

```js
  program: {
    stampsRequired: { type: Number, min: 1, default: DEFAULT_PROGRAM.stampsRequired },
    rewardTitle: { type: String, default: DEFAULT_PROGRAM.rewardTitle },
    rewardDescription: { type: String, default: DEFAULT_PROGRAM.rewardDescription },
    cooldownHours: { type: Number, min: 0, default: DEFAULT_PROGRAM.cooldownHours }
  },
```

Add a fifth field:

```js
  program: {
    stampsRequired: { type: Number, min: 1, default: DEFAULT_PROGRAM.stampsRequired },
    rewardTitle: { type: String, default: DEFAULT_PROGRAM.rewardTitle },
    rewardDescription: { type: String, default: DEFAULT_PROGRAM.rewardDescription },
    cooldownHours: { type: Number, min: 0, default: DEFAULT_PROGRAM.cooldownHours },
    // 0 = disabled. Barista must enter a bill amount >= this to generate a
    // stamp QR when it's set above 0. Plain number, never currency-formatted.
    minBillAmount: { type: Number, min: 0, default: DEFAULT_PROGRAM.minBillAmount }
  },
```

In `backend/config/platform.js`, `DEFAULT_PROGRAM` currently reads:

```js
const DEFAULT_PROGRAM = {
  stampsRequired: 5,
  rewardTitle: "Free Coffee",
  rewardDescription: "Collect stamps on every visit and unlock a free coffee.",
  cooldownHours: 18
};
```

Add the new default:

```js
const DEFAULT_PROGRAM = {
  stampsRequired: 5,
  rewardTitle: "Free Coffee",
  rewardDescription: "Collect stamps on every visit and unlock a free coffee.",
  cooldownHours: 18,
  minBillAmount: 0
};
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/min-bill-amount.js`:

```js
/**
 * Minimum bill amount gate suite (Epic B1).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Drives generate-qr with and without a configured
 * minimum, and confirms a second tenant is unaffected by the first's setting.
 *
 * Run directly: `node tests/min-bill-amount.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5014 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json", "X-Tenant-Slug": slug };
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

    const customerLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "customer@mansarowar.cafe", password: "password" },
    });
    const customerToken = customerLogin.body.token;

    // 1. Default (minBillAmount: 0) — generate-qr with no billAmount at all
    //    succeeds exactly as before this feature existed.
    const gen0 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken });
    check("gate disabled: generate-qr with no billAmount -> 201", gen0.status === 201);
    check("gate disabled: token present", Boolean(gen0.body?.data?.token));

    // 2. Enable the gate.
    const setMin = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { program: { minBillAmount: 500 } },
    });
    check("admin sets minBillAmount to 500", setMin.status === 200 && setMin.body.settings.program.minBillAmount === 500);

    // 3. Below minimum -> 400, no token.
    const genLow = await api("/api/admin/generate-qr", {
      method: "POST",
      token: adminToken,
      body: { billAmount: 300 },
    });
    check("below minimum -> 400", genLow.status === 400);
    check("below minimum: no token in response", !genLow.body?.data?.token);

    // 4. Missing billAmount entirely -> 400.
    const genMissing = await api("/api/admin/generate-qr", { method: "POST", token: adminToken });
    check("missing billAmount when gate enabled -> 400", genMissing.status === 400);

    // 5. At minimum -> 201, and the token is genuinely claimable.
    const genOk = await api("/api/admin/generate-qr", {
      method: "POST",
      token: adminToken,
      body: { billAmount: 500 },
    });
    check("at minimum -> 201", genOk.status === 201);
    const claim = await api("/api/stamps/claim", {
      method: "POST",
      token: customerToken,
      body: { token: genOk.body?.data?.token },
    });
    check("token from valid generate-qr is claimable", claim.status === 200);

    // 6. Tenant isolation: a 2nd tenant's generate-qr is unaffected by
    //    coffesarowar's minBillAmount.
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const secondSlug = `brewhaven-${Date.now()}`;
    await api("/api/platform/businesses", {
      method: "POST",
      slug: undefined,
      token: platformToken,
      body: {
        name: "Brew Haven",
        slug: secondSlug,
        adminName: "Haven Boss",
        adminEmail: `boss+${Date.now()}@brewhaven.test`,
        adminPassword: "password",
      },
    });
    const secondLogin = await api("/api/auth/login", {
      method: "POST",
      slug: secondSlug,
      body: { email: `boss+${Date.now()}@brewhaven.test`, password: "password" },
    });
    // Registration used a timestamp in the email; re-derive the same login
    // isn't guaranteed to match if clocks tick between calls, so fetch the
    // business's own settings via its admin login token instead of assuming
    // the email matched. To keep this deterministic, log in with the exact
    // email captured at onboarding time:
    check("second tenant onboarded", secondLogin.status === 200 || secondLogin.status === 401);
  } finally {
    stop();
  }

  if (failures) { console.error(`min-bill-amount: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("min-bill-amount: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run: `cd backend && node tests/min-bill-amount.js`
Expected: FAIL — `generateQRToken` doesn't accept/validate `billAmount` yet, so cases 3 and 4 wrongly return 201 instead of 400.

**Note before Step 3:** the tenant-isolation block above has a timing bug (re-deriving the email with a fresh `Date.now()`). Fix it now as part of writing the test — capture the email once:

Replace the entire "6. Tenant isolation" block with:

```js
    // 6. Tenant isolation: a 2nd tenant's generate-qr is unaffected by
    //    coffesarowar's minBillAmount.
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
    const secondLogin = await api("/api/auth/login", {
      method: "POST",
      slug: secondSlug,
      body: { email: secondAdminEmail, password: "password" },
    });
    check("second tenant admin logs in", secondLogin.status === 200);
    const secondGen = await api("/api/admin/generate-qr", {
      method: "POST",
      slug: secondSlug,
      token: secondLogin.body.token,
    });
    check("second tenant's generate-qr unaffected by coffesarowar's minBillAmount", secondGen.status === 201);
```

Use this corrected version in the file created in Step 2 (i.e., write the corrected block directly — don't write the buggy version and then patch it).

- [ ] **Step 3: Implement the gate**

In `backend/services/stampService.js`, replace `generateQRToken`:

```js
const generateQRToken = async (adminUserId, organizationId) => {
  if (!adminUserId) {
    throw createHttpError("Admin user context is required.", 401);
  }

  if (!organizationId) {
    throw createHttpError("A business context is required.", 400);
  }

  const token = uuidv4();

  await DynamicQRToken.create({
    token,
    generatedBy: adminUserId,
    organizationId
  });

  return {
    success: true,
    data: {
      token,
      expiresInSeconds: TOKEN_TTL_SECONDS
    }
  };
};
```

with:

```js
const generateQRToken = async (adminUserId, organizationId, billAmount) => {
  if (!adminUserId) {
    throw createHttpError("Admin user context is required.", 401);
  }

  const org = await loadOrganizationOrThrow(organizationId);
  const minBillAmount = org.program.minBillAmount || 0;

  if (minBillAmount > 0) {
    const amount = Number(billAmount);
    if (billAmount === undefined || billAmount === null || billAmount === "" || Number.isNaN(amount) || amount < 0) {
      throw createHttpError("Bill amount is required to generate a code.", 400);
    }
    if (amount < minBillAmount) {
      throw createHttpError(`Bill amount must be at least ${minBillAmount}.`, 400);
    }
  }

  const token = uuidv4();

  await DynamicQRToken.create({
    token,
    generatedBy: adminUserId,
    organizationId
  });

  return {
    success: true,
    data: {
      token,
      expiresInSeconds: TOKEN_TTL_SECONDS
    }
  };
};
```

(This reuses `loadOrganizationOrThrow`, already defined earlier in the same file and already used by `claimStamp` — it replaces the old bare `if (!organizationId)` check with the same 400 behavior plus a 404 if the org doesn't exist, and gives us `org.program` for free.)

In `backend/controllers/stampController.js`, change:

```js
const generateAdminQRToken = async (req, res, next) => {
  try {
    const result = await generateQRToken(req.user.id, req.user.organizationId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
```

to:

```js
const generateAdminQRToken = async (req, res, next) => {
  try {
    const result = await generateQRToken(req.user.id, req.user.organizationId, req.body.billAmount);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
```

No route change needed — `routes/adminRoutes.js` already has `router.post("/generate-qr", verifyToken, isBusinessAdmin, generateAdminQRToken);`.

No change needed to `updateMySettings` (`backend/controllers/tenantController.js`) — it already does `organization.program = { ...organization.program, ...program }`, so `minBillAmount` flows through the existing generic merge with zero extra code.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node tests/min-bill-amount.js`
Expected: `min-bill-amount: all PASS`.

- [ ] **Step 5: Add to the test suite**

In `backend/package.json`, change the `test` script:

```
"test": "node tests/integration-qa.js && node tests/run-voucher-test.js && node tests/multi-tenant-isolation.js && node tests/auth-email-flow.js && node tests/min-bill-amount.js",
```

Run: `cd backend && npm test`
Expected: all five suites pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/models/Organization.js backend/config/platform.js backend/services/stampService.js backend/controllers/stampController.js backend/tests/min-bill-amount.js backend/package.json
git commit -m "feat(stamps): add minimum bill amount gate to generate-qr"
```

---

### Task 2: Admin config field — Stamp Program settings

**Files:**
- Modify: `frontend/src/hooks/useAdminSettings.ts`
- Modify: `frontend/src/routes/admin/StampProgram.tsx`

**Interfaces:**
- Consumes: existing `useAdminSettings()` / `useUpdateAdminSettings()` hooks (query key `["adminSettings"]`, PATCH body `{ program: Partial<AdminProgram> }`) — unchanged mechanism, just a wider `AdminProgram` type.
- Produces: `AdminProgram.minBillAmount: number`, so `GenerateQr.tsx` (Task 3) can read `settings.program.minBillAmount`.

- [ ] **Step 1: Widen the type**

In `frontend/src/hooks/useAdminSettings.ts`, change:

```ts
export interface AdminProgram {
  stampsRequired: number;
  rewardTitle: string;
  rewardDescription: string;
  cooldownHours: number;
}
```

to:

```ts
export interface AdminProgram {
  stampsRequired: number;
  rewardTitle: string;
  rewardDescription: string;
  cooldownHours: number;
  minBillAmount: number;
}
```

- [ ] **Step 2: Add the field to the settings screen**

In `frontend/src/routes/admin/StampProgram.tsx`, insert a new block right after the existing cooldown block and before the Save button:

```tsx
        <div className="border-t border-[var(--line)] pt-5">
          <label className="mb-1.5 block text-sm font-bold">Cooldown between stamps</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              value={form.cooldownHours}
              onChange={(e) => set("cooldownHours", Number(e.target.value))}
              className="w-24 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">hours — stops double-stamping on one visit</span>
          </div>
        </div>

        <button
```

becomes:

```tsx
        <div className="border-t border-[var(--line)] pt-5">
          <label className="mb-1.5 block text-sm font-bold">Cooldown between stamps</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              value={form.cooldownHours}
              onChange={(e) => set("cooldownHours", Number(e.target.value))}
              className="w-24 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">hours — stops double-stamping on one visit</span>
          </div>
        </div>

        <div className="border-t border-[var(--line)] pt-5">
          <label className="mb-1.5 block text-sm font-bold">Minimum bill amount</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              value={form.minBillAmount}
              onChange={(e) => set("minBillAmount", Number(e.target.value))}
              className="w-24 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">0 = no minimum — any bill amount can generate a code</span>
          </div>
        </div>

        <button
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Verify in the browser**

Start the backend (`cd backend && MONGODB_URI= node server.js`) and the frontend (`cd frontend && npm run dev`). Log in to `/coffesarowar/admin/login` as `barista@mansarowar.cafe` / `password`, go to Stamp Program:
- "Minimum bill amount" field is visible, defaults to `0`.
- Set it to `500`, click Save — toast confirms, no errors.
- Reload the page — field still shows `500` (persisted).
- Set it back to `0`, Save, reload — confirms `0` (leaves the tenant in its default state for Task 3/4).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useAdminSettings.ts frontend/src/routes/admin/StampProgram.tsx
git commit -m "feat(admin-fe): add minimum bill amount field to Stamp Program settings"
```

---

### Task 3: Generate QR — conditional bill-amount field

**Files:**
- Modify: `frontend/src/routes/admin/GenerateQr.tsx`

**Interfaces:**
- Consumes: `useAdminSettings()` (Task 2) → `settings.program.minBillAmount: number`.
- Consumes: existing `apiRequest` wrapper; `POST /api/admin/generate-qr` now accepts an optional `billAmount` in the body (Task 1).

- [ ] **Step 1: Rewrite the component**

`GenerateQr.tsx` currently auto-generates on mount unconditionally. Replace the whole file:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { useAdminSettings } from "../../hooks/useAdminSettings";

// Barista generates a short-lived, single-use stamp QR. The customer scans it.
export default function GenerateQr() {
  const { data: settings } = useAdminSettings();
  const minBillAmount = settings?.program.minBillAmount ?? 0;
  const gateEnabled = minBillAmount > 0;

  const [token, setToken] = useState<string | null>(null);
  const [ttl, setTtl] = useState(0);
  const [loading, setLoading] = useState(false);
  const [billAmount, setBillAmount] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoGeneratedRef = useRef(false);

  const generate = useCallback(async (amount?: string) => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        data: { token: string; expiresInSeconds: number };
      }>("/api/admin/generate-qr", {
        method: "POST",
        role: "admin",
        body: amount ? { billAmount: Number(amount) } : undefined,
      });
      setToken(res.data.token);
      setTtl(res.data.expiresInSeconds);
    } catch (err) {
      toast.error((err as Error).message || "Failed to generate code.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-generate on load only when the gate is disabled — once settings
  // have loaded (settings is defined) and only once per mount.
  useEffect(() => {
    if (!settings || gateEnabled || autoGeneratedRef.current) return;
    autoGeneratedRef.current = true;
    generate();
  }, [settings, gateEnabled, generate]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ttl <= 0) return;
    timerRef.current = setInterval(() => setTtl((t) => Math.max(0, t - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, ttl > 0]);

  const expired = ttl <= 0;
  const parsedAmount = Number(billAmount);
  const amountValid = billAmount !== "" && !Number.isNaN(parsedAmount) && parsedAmount >= minBillAmount;
  const canGenerate = !gateEnabled || amountValid;

  return (
    <div className="mx-auto max-w-[460px] text-center">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Stamp code</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">Have the customer scan this to earn one stamp.</p>

      <div className="rounded-[26px] border border-[var(--line)] bg-[var(--surface)] p-8 shadow-sm">
        <label className="mb-4 block text-left">
          <span className="mb-1.5 block text-sm font-bold text-[var(--ink)]">Bill amount</span>
          <input
            type="number"
            min={0}
            value={billAmount}
            onChange={(e) => setBillAmount(e.target.value)}
            placeholder={gateEnabled ? `Minimum ${minBillAmount}` : "Optional"}
            className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
          />
          {gateEnabled && !amountValid && (
            <span className="mt-1 block text-xs font-semibold text-[var(--err)]">
              Minimum bill is {minBillAmount}
            </span>
          )}
        </label>

        <div className="mx-auto flex h-[230px] w-[230px] items-center justify-center rounded-[18px] border border-[var(--line)] bg-white p-4">
          {token && !expired ? (
            <QRCodeSVG value={token} size={198} level="M" fgColor="#241E1B" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[var(--soft)]">
              <span className="text-3xl">⏱</span>
              <span className="text-sm font-bold text-[var(--ink)]">
                {loading ? "Generating…" : gateEnabled ? "Enter a bill amount to generate" : "Code expired"}
              </span>
            </div>
          )}
        </div>

        {token && !expired && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <span
              className="flex h-13 w-13 items-center justify-center rounded-full border-4 font-display text-lg font-extrabold"
              style={{ width: 54, height: 54, borderColor: "var(--brand)", color: "var(--brand)" }}
            >
              {ttl}
            </span>
            <span className="text-left text-[13px] text-[var(--muted)]">
              seconds until
              <br />
              this code expires
            </span>
          </div>
        )}

        <button
          onClick={() => generate(gateEnabled ? billAmount : billAmount || undefined)}
          disabled={loading || !canGenerate}
          className="mt-6 w-full rounded-[14px] py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          Generate new code
        </button>
      </div>
      <p className="mt-4 text-[13px] text-[var(--soft)]">
        Short-lived codes stop customers from screenshotting and re-using them.
      </p>
    </div>
  );
}
```

Note the button's `onClick`: `generate(gateEnabled ? billAmount : billAmount || undefined)` — when the gate is enabled, `billAmount` is always a valid string at that point (the button is `disabled` otherwise, per `canGenerate`). When the gate is disabled, an empty string becomes `undefined` so `generate()`'s `body: amount ? {...} : undefined` correctly sends no body at all, matching Task 1's "no billAmount at all" case exactly.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify both states in the browser**

With backend + frontend running (from Task 2, Step 4) and `coffesarowar`'s `minBillAmount` back at `0`:
- Go to `/coffesarowar/admin/generate` — code auto-generates immediately, exactly as before. Bill-amount field is visible with placeholder "Optional"; typing a value doesn't disable/enable anything.

Then set `minBillAmount` to `500` via Stamp Program (Task 2's screen) and return to Generate QR:
- No auto-generate; QR area shows "Enter a bill amount to generate."
- Button is disabled; typing `300` shows "Minimum bill is 500" and button stays disabled.
- Typing `500` clears the hint and enables the button; clicking generates a real QR with the countdown.

Reset `minBillAmount` back to `0` via Stamp Program when done, so the tenant is left in its default state.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/admin/GenerateQr.tsx
git commit -m "feat(admin-fe): conditional bill-amount field on Generate QR"
```

---

### Task 4: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suite green**

Run: `cd backend && npm test`
Expected: all five suites (`integration-qa`, `run-voucher-test`, `multi-tenant-isolation`, `auth-email-flow`, `min-bill-amount`) PASS, exit 0.

- [ ] **Step 2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end browser walkthrough**

With `npm run dev` running (backend :5001, frontend :3000), on tenant `coffesarowar`:
1. Confirm `minBillAmount` is `0` (default state). Generate QR auto-generates; no friction.
2. Set `minBillAmount` to `500` in Stamp Program. Save.
3. Go to Generate QR: no auto-generate, button disabled until a valid amount is entered, hint text shows below the minimum, generating with a valid amount produces a real scannable code.
4. As a customer, scan/claim that code (via the existing customer scan flow) — confirm the stamp is credited normally; the gate doesn't affect the claim side at all.
5. Reset `minBillAmount` to `0` and confirm Generate QR returns to auto-generate behavior.

- [ ] **Step 4: Commit any final fixes, then finish**

```bash
git add -A
git commit -m "chore(min-bill-gate): verification pass fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** schema field + default (Task 1), backend hard-reject including missing/below/at-minimum cases (Task 1), check-and-discard/no persistence (Task 1 — no new model, no fields added to `DynamicQRToken`), admin config field (Task 2), always-visible-but-conditionally-required field with auto-generate suppression (Task 3), client-side disable+hint (Task 3), backend as authoritative check preserved (Task 1 unchanged regardless of frontend), tenant isolation (Task 1's test case 6), full walkthrough + regression (Task 4). No gaps against the spec's five sections.
- **Type consistency:** `AdminProgram.minBillAmount: number` (Task 2) is what `GenerateQr.tsx` reads as `settings?.program.minBillAmount` (Task 3) — same field name, same type, across both tasks.
- **Mock-DB safety:** no new query patterns introduced; `loadOrganizationOrThrow` and `updateMySettings`'s generic merge are both pre-existing, already-proven-safe code paths.
- **Corrected the isolation test's timing bug** during planning (Step 2 of Task 1) rather than leaving it for a reviewer to catch — the "capture email once" version is the one to actually write.

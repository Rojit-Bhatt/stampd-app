# Messaging Foundation (Email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the email half of Phase 3's messaging foundation — per-channel consent, a birthday field, an email-sending adapter, and two trigger mechanisms (real-time milestone, daily-cron birthday/inactivity) using three fixed canned templates.

**Architecture:** New `CustomerAccount.marketingConsent`/`birthdayMonth`/`birthdayDay` fields, a new `Organization.messagingTriggers` config block (same outlet-scoped, null-means-off pattern as Phase 1's `tierThresholds`), a new append-only `MessageLog` model for idempotency, and one new `backend/services/messagingService.js` housing the templates, the send function, the real-time milestone check, and the cron-driven daily check. No changes to `tierService`, `pointsService`'s atomic write, or any existing model's write semantics beyond adding new optional fields.

**Tech Stack:** Node/Express backend (mock-Mongoose in dev/test), `node-cron` (new dependency), React 19 + TS frontend, plain-`node` integration tests booted against the real server.

## Global Constraints

- Mock DB query support is **top-level equality, `$or`, `$lte`, `$gte` only** — no other operators. A field that can be `null` (like `PointsBalance.lastActivityAt` on a brand-new balance) must never be queried with `$lte`/`$gte` directly — fetch and filter in JS instead (this codebase's established pattern, e.g. `reportService.getDashboardStats`'s week-bucket filtering).
- **No `findById`** — use `findOne({ _id })`.
- **`bootServer` spawns the test server as a separate OS process** (`child_process.spawn`) with its own in-memory mock DB — a test script cannot `require()` backend modules and expect them to share state with the booted server. Anything a test needs that has no real HTTP endpoint (backdating a timestamp, invoking the cron handler synchronously, reading back a `MessageLog` row) must go through a `/__test__/*` test-hook route in `backend/routes/testHookRoutes.js` (already exists, mounted only when `USING_MOCK_DB`), not a direct `require()`.
- `messagingTriggers`/`tierThresholds` are outlet-scoped only, never inherited from company or platform.
- Every `sendEmail()` call is **fire-and-forget** (`.catch(err => console.error(...))`, never awaited) — a slow or failed email must never block or fail the request/transaction it's attached to. This applies to the milestone check's own dispatch from `claimPoints` too: fire-and-forget from the controller's perspective.
- New backend test suites must be **added to `backend/package.json`'s `test` chain** or they never run.
- Business logic lives in `services/`; controllers stay thin.
- No code comments except where a genuinely non-obvious constraint or invariant needs explaining.
- `PLATFORM_TIMEZONE` (`Asia/Kathmandu`, from `config/platform.js`) governs the daily cron's schedule and the birthday-date comparison — never UTC, same reasoning as campaign day-of-week judging.

---

## Task 1: Data model — consent, birthday, trigger config, MessageLog

**Files:**
- Modify: `backend/models/CustomerAccount.js`
- Modify: `backend/models/Organization.js`
- Create: `backend/models/MessageLog.js`
- Create: `backend/tests/messaging-triggers.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `CustomerAccount.marketingConsent.{email,sms,whatsapp,push}.{granted,updatedAt}`; `CustomerAccount.birthdayMonth`/`birthdayDay` (`Number|null`); `Organization.messagingTriggers.milestone.visitCount` (`Number|null`), `.inactivity.days` (`Number|null`), `.birthday.enabled` (`Boolean`); `MessageLog` model with `{organizationId, userId, triggerType, sentAt}`.

- [ ] **Step 1: Add consent + birthday fields to `backend/models/CustomerAccount.js`**

Insert after the `avatarVersion` field (before `createdAt`):

```js
  marketingConsent: {
    email: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    },
    sms: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    },
    whatsapp: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    },
    push: {
      granted: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null }
    }
  },
  birthdayMonth: { type: Number, min: 1, max: 12, default: null },
  birthdayDay: { type: Number, min: 1, max: 31, default: null },
```

- [ ] **Step 2: Add `messagingTriggers` to `backend/models/Organization.js`**

Insert as a sibling block immediately after the `tierThresholds` block closes (before `contact: {`):

```js
  messagingTriggers: {
    milestone: {
      visitCount: { type: Number, min: 1, default: null }
    },
    inactivity: {
      days: { type: Number, min: 1, default: null }
    },
    birthday: {
      enabled: { type: Boolean, default: false }
    }
  },
```

- [ ] **Step 3: Create `backend/models/MessageLog.js`**

```js
const mongoose = require("mongoose");

// One row per successful trigger send — append-only, never edited. This is
// what makes triggers idempotent: the birthday cron checks for an existing
// row this calendar year before sending, and the inactivity cron checks for
// one within the configured cooldown window before re-nudging.
const MessageLogSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  triggerType: { type: String, enum: ["milestone", "birthday", "inactivity"], required: true },
  sentAt: { type: Date, default: Date.now }
});

MessageLogSchema.index({ organizationId: 1, userId: 1, triggerType: 1, sentAt: -1 });

module.exports = mongoose.model("MessageLog", MessageLogSchema);
```

- [ ] **Step 4: Write the failing test**

Create `backend/tests/messaging-triggers.js`:

```js
/**
 * Messaging foundation (email) suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms new schema fields default correctly, then
 * grows across later tasks to cover consent, preferences, trigger config,
 * and the two trigger mechanisms.
 *
 * Run directly: `node tests/messaging-triggers.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5032 });
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

    const settings = await api("/api/admin/settings", { token: adminToken });
    check(
      "messagingTriggers defaults to off (milestone/inactivity null, birthday false)",
      settings.body.settings.messagingTriggers?.milestone?.visitCount === null &&
        settings.body.settings.messagingTriggers?.inactivity?.days === null &&
        settings.body.settings.messagingTriggers?.birthday?.enabled === false
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`messaging-triggers: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("messaging-triggers: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 5: Wire the new suite into `backend/package.json`**

Append ` && node tests/messaging-triggers.js` to the end of the `"test"` script string.

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: FAIL — `getMySettings` doesn't return `messagingTriggers` yet (Task 4 adds that), so `settings.body.settings.messagingTriggers` is `undefined`.

- [ ] **Step 7: Run to confirm schema changes alone don't break anything**

Run: `cd backend && MONGODB_URI="" node tests/customer-detail.js && MONGODB_URI="" node tests/tier-system.js`
Expected: both pass unchanged — new optional fields with safe defaults shouldn't affect any existing behavior. (The new test's one check is expected to still fail per Step 6 — that's fine, Task 4 makes it pass. This step is only confirming no regression elsewhere.)

- [ ] **Step 8: Commit**

```bash
git add backend/models/CustomerAccount.js backend/models/Organization.js backend/models/MessageLog.js backend/tests/messaging-triggers.js backend/package.json
git commit -m "feat: add consent, birthday, and trigger-config schema fields"
```

---

## Task 2: Consent captured at registration

**Files:**
- Modify: `backend/services/customerAccountService.js`
- Modify: `backend/controllers/customerAccountController.js`
- Modify: `frontend/src/components/customer/AuthView.tsx`
- Modify: `frontend/src/context/CustomerAuthContext.tsx`
- Modify: `backend/tests/messaging-triggers.js`

**Interfaces:**
- Consumes: `CustomerAccount.marketingConsent` (Task 1).
- Produces: `POST /api/customer-auth/register` accepts an additional optional `marketingEmailConsent: boolean` in its body.

- [ ] **Step 1: Write the failing test — extend `backend/tests/messaging-triggers.js`**

Add after the existing check, still inside the `try` block:

```js
    const emailOptedIn = `msg_optin_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Opted In", email: emailOptedIn, password: "password123", phone: "9811110001", marketingEmailConsent: true },
    });
    const optedInLogin = await api("/api/customer-auth/login", { method: "POST", body: { email: emailOptedIn, password: "password123" } });
    check("registering with marketingEmailConsent:true grants email consent", optedInLogin.body.account?.marketingConsent?.email?.granted === true);

    const emailOptedOut = `msg_optout_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Opted Out", email: emailOptedOut, password: "password123", phone: "9811110002" },
    });
    const optedOutLogin = await api("/api/customer-auth/login", { method: "POST", body: { email: emailOptedOut, password: "password123" } });
    check("registering without marketingEmailConsent leaves email consent false", optedOutLogin.body.account?.marketingConsent?.email?.granted === false);
```

(These two new registrations use `/api/customer-auth/register`/`login`, which are slug-less per this codebase's global-identity routes — the `api()` helper's `slug` default doesn't matter for these two calls since `X-Company-Slug`/`X-Outlet-Slug` headers are simply ignored by slug-less routes.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: FAIL on both new checks — `marketingConsent` isn't returned/set anywhere yet in the registration or login response.

**⚠️ Before Step 3**: confirm `optedInLogin.body.account` actually carries `marketingConsent` — check `backend/services/authService.js` or wherever `/api/customer-auth/login`'s response is formatted (likely the same `formatGlobalSessionPayload`/`formatAccountSummary` helpers `customerAccountService.js` uses) and add `marketingConsent: account.marketingConsent` to whichever formatter builds that `account` object if it isn't already exposing full account fields. If you find the login response is built by a different formatter than `formatAccountSummary`, extend that one too — the goal is that `account.marketingConsent` is present in both the register and login response shapes.

- [ ] **Step 3: Accept and store `marketingEmailConsent` in `registerAccount`**

In `backend/services/customerAccountService.js`, modify `registerAccount`:

```js
const registerAccount = async ({ name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent }) => {
  if (!name || !email || !password) {
    throw createHttpError("Name, email, and password are required.", 400);
  }
  if (!phone || !phone.trim()) {
    throw createHttpError("Phone number is required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const existing = await CustomerAccount.findOne({ email: normalizedEmail });
  if (existing) {
    throw createHttpError("Email is already registered.", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const account = await CustomerAccount.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone.trim(),
    emailVerified: false,
    marketingConsent: marketingEmailConsent
      ? { email: { granted: true, updatedAt: new Date() } }
      : undefined
  });

  await sendVerifyEmail(account);

  if (pendingClaimId) {
    try {
      const { linkPendingClaimToAccount } = require("./pendingClaimService");
      await linkPendingClaimToAccount({
        pendingClaimId,
        claimSecret,
        customerAccountId: account._id.toString()
      });
    } catch (_err) {
      // Swallow — see comment above.
    }
  }

  const sessionPayload = formatGlobalSessionPayload(account);
  return {
    ...sessionPayload,
    message: "Registered. Check your email to verify your account when you are ready.",
    accountId: account._id.toString()
  };
};
```

(`marketingConsent: undefined` in the `.create()` call lets the schema's own per-field defaults fill in — `sms`/`whatsapp`/`push` stay `{granted: false, updatedAt: null}` either way, only `email` differs based on the flag.)

- [ ] **Step 4: Pass the field through the controller**

In `backend/controllers/customerAccountController.js`, modify `register`:

```js
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent } = req.body;
    const result = await registerAccount({ name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
```

- [ ] **Step 5: Ensure `marketingConsent` is in the response shape**

Read `formatGlobalSessionPayload` and `formatAccountSummary` (both in `customerAccountService.js`) and whatever formats `/api/customer-auth/login`'s response. Add `marketingConsent: account.marketingConsent` to whichever of these builds the `account` object returned to the client, if it isn't already forwarding every field. Keep the change minimal — add the one field, don't restructure the formatter.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: all checks pass.

- [ ] **Step 7: Run regression suites**

Run: `cd backend && MONGODB_URI="" node tests/global-customer-identity.js && MONGODB_URI="" node tests/auth-google-and-profile.js`
Expected: both pass unchanged.

- [ ] **Step 8: Add the registration checkbox — frontend**

In `frontend/src/components/customer/AuthView.tsx`, add to `registerSchema` (after the `phone` field):

```ts
  emailOptIn: z.boolean().default(false),
```

Update the `useForm<RegisterFormValues>` call's `defaultValues`:

```ts
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", phone: "", emailOptIn: false },
  });
```

Add a checkbox between the Password `Field` and the `SubmitButton` (right before the existing `<SubmitButton loading={isSubmitting} label="Create account" />` line):

```tsx
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={registerForm.watch("emailOptIn")}
                  onChange={(e) => registerForm.setValue("emailOptIn", e.target.checked)}
                />
                Send me offers and updates by email
              </label>
```

Update `onRegisterSubmit` to pass the new field through:

```ts
  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    const toastId = toast.loading("Setting up your account…");
    try {
      const local = data.phone.replace(/\D/g, "").replace(/^0+/, "");
      await registerUser(data.name, data.email, data.password, `+977${local}`, data.emailOptIn);
      await ensureTenantSession(slug, tenant?.id ?? null);
      toast.success("Welcome! You can verify your email later before redeeming.", { id: toastId });
      navigate(tenantPath(companySlug, slug, "dashboard"));
    } catch (err) {
      toast.error((err as Error).message || "Couldn't create your account — try again.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };
```

- [ ] **Step 9: Plumb `emailOptIn` through `CustomerAuthContext.tsx`**

Modify the `registerUser` type signature (in the context interface):

```ts
  registerUser: (
    name: string,
    email: string,
    password: string,
    phone: string,
    marketingEmailConsent?: boolean,
    pendingClaimId?: string,
    claimSecret?: string,
  ) => Promise<void>;
```

Modify the implementation:

```ts
  const registerUser = async (
    name: string,
    email: string,
    password: string,
    phone: string,
    marketingEmailConsent?: boolean,
    pendingClaimId?: string,
    claimSecret?: string,
  ) => {
    const res = await apiRequest<{ success: boolean; token?: string; account?: GlobalAccount; message: string }>(
      "/api/customer-auth/register",
      { method: "POST", body: { name, email, password, phone, marketingEmailConsent, pendingClaimId, claimSecret } },
    );
    if (!res.success) {
      throw new Error(res.message || "Failed to register.");
    }
    if (res.token && res.account) {
      persistGlobal(res.token, res.account);
    }
  };
```

(Note the new `marketingEmailConsent` parameter is inserted before `pendingClaimId`/`claimSecret` — check every other call site of `registerUser` in the codebase, e.g. anywhere a pending-claim registration flow calls it with those two trailing args, and update those call sites' argument order to match. Grep for `registerUser(` across `frontend/src` to find them all.)

- [ ] **Step 10: Run `npm run lint`**

Run: `npm run lint` from repo root.
Expected: no new TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git add backend/services/customerAccountService.js backend/controllers/customerAccountController.js frontend/src/components/customer/AuthView.tsx frontend/src/context/CustomerAuthContext.tsx backend/tests/messaging-triggers.js
git commit -m "feat: capture email marketing consent at registration"
```

---

## Task 3: Profile preferences — consent toggle + birthday

**Files:**
- Modify: `backend/services/customerAccountService.js`
- Modify: `backend/controllers/customerAccountController.js`
- Modify: `backend/routes/customerAccountRoutes.js`
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx`
- Modify: `backend/tests/messaging-triggers.js`

**Interfaces:**
- Produces: `PATCH /api/customer-auth/preferences` (auth: `verifyGlobalSession`) accepting any of `{emailOptIn, birthdayMonth, birthdayDay}`, each independently optional — a call with only one field leaves the others untouched.

- [ ] **Step 1: Write the failing test — extend `backend/tests/messaging-triggers.js`**

Add after the registration-consent checks, still inside the `try` block:

```js
    const prefsToken = optedOutLogin.body.token;
    const setEmailOn = await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: prefsToken,
      slug: null,
      body: { emailOptIn: true },
    });
    check("PATCH preferences turns email consent on", setEmailOn.body.account?.marketingConsent?.email?.granted === true);

    const setBirthday = await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: prefsToken,
      slug: null,
      body: { birthdayMonth: 5, birthdayDay: 20 },
    });
    check("PATCH preferences sets birthday", setBirthday.body.account?.birthdayMonth === 5 && setBirthday.body.account?.birthdayDay === 20);
    check("PATCH preferences with only birthday leaves email consent untouched", setBirthday.body.account?.marketingConsent?.email?.granted === true);
```

(`slug: null` is used here because `/api/customer-auth/*` is a slug-less global-identity route, matching this codebase's existing convention for these endpoints — the `api()` helper's default `X-Company-Slug`/`X-Outlet-Slug` headers are simply ignored by a route that never reads them, but passing `null` keeps the test's intent explicit.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: FAIL — `/api/customer-auth/preferences` doesn't exist yet (404).

- [ ] **Step 3: Add `updatePreferences` to `backend/services/customerAccountService.js`**

```js
const updatePreferences = async ({ customerAccountId, emailOptIn, birthdayMonth, birthdayDay }) => {
  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (emailOptIn !== undefined) {
    account.marketingConsent.email = { granted: Boolean(emailOptIn), updatedAt: new Date() };
  }
  if (birthdayMonth !== undefined) {
    account.birthdayMonth = birthdayMonth === null ? null : Number(birthdayMonth);
  }
  if (birthdayDay !== undefined) {
    account.birthdayDay = birthdayDay === null ? null : Number(birthdayDay);
  }

  await account.save();
  return formatAccountPayload(account);
};
```

Add `updatePreferences` to this file's `module.exports`. Confirm `formatAccountPayload` already returns `account.marketingConsent`/`birthdayMonth`/`birthdayDay` (it forwards through `formatAccountSummary` — if that helper only returns a fixed field list like `{id, name, email, emailVerified, avatarVersion}`, add `marketingConsent`, `birthdayMonth`, `birthdayDay` to it too).

- [ ] **Step 4: Add the controller**

In `backend/controllers/customerAccountController.js`:

```js
const updatePreferencesController = async (req, res, next) => {
  try {
    const { emailOptIn, birthdayMonth, birthdayDay } = req.body;
    const result = await updatePreferences({
      customerAccountId: req.customerAccount.id,
      emailOptIn,
      birthdayMonth,
      birthdayDay
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

Add `updatePreferencesController` to this file's `module.exports`, and add `updatePreferences` to its import from `../services/customerAccountService`.

- [ ] **Step 5: Wire the route**

In `backend/routes/customerAccountRoutes.js`, add (alongside the existing `PATCH /profile` route, same `verifyGlobalSession` middleware):

```js
router.patch("/preferences", verifyGlobalSession, updatePreferencesController);
```

Add `updatePreferencesController` to this file's import from `../controllers/customerAccountController`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: all checks pass.

- [ ] **Step 7: Run regression suites**

Run: `cd backend && MONGODB_URI="" node tests/customer-profile.js`
Expected: passes unchanged (exercises the neighboring `/profile` endpoint, must not regress from the new route).

- [ ] **Step 8: Add the two new sections to `CustomerProfilePanel.tsx`**

Read the current file in full first (it's plain `useState`, no React Hook Form/Zod, per this plan's reconnaissance). Add two new pieces of state near the existing `name`/`savingName`:

```ts
  const [emailOptIn, setEmailOptIn] = useState(globalAccount?.marketingConsent?.email?.granted ?? false);
  const [savingEmailOptIn, setSavingEmailOptIn] = useState(false);
  const [birthdayMonth, setBirthdayMonth] = useState<number | "">(globalAccount?.birthdayMonth ?? "");
  const [birthdayDay, setBirthdayDay] = useState<number | "">(globalAccount?.birthdayDay ?? "");
  const [savingBirthday, setSavingBirthday] = useState(false);
```

(Check the exact shape of `globalAccount`/`GlobalAccount` type used elsewhere in this file — it needs `marketingConsent`/`birthdayMonth`/`birthdayDay` added to its TypeScript type definition, likely in `CustomerAuthContext.tsx` or wherever `GlobalAccount` is defined; add them there matching the backend's new fields.)

Add two save handlers, matching `saveName`'s exact pattern:

```ts
  const saveEmailOptIn = async (next: boolean) => {
    setEmailOptIn(next);
    setSavingEmailOptIn(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/preferences",
        { method: "PATCH", role: "customer-global", body: { emailOptIn: next } },
      );
      setGlobalAccountData(res.account);
      toast.success(next ? "You're opted in!" : "Opted out.");
    } catch (err) {
      setEmailOptIn(!next);
      toast.error((err as Error).message || "Couldn't update that — try again.");
    } finally {
      setSavingEmailOptIn(false);
    }
  };

  const saveBirthday = async () => {
    setSavingBirthday(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/preferences",
        {
          method: "PATCH",
          role: "customer-global",
          body: { birthdayMonth: birthdayMonth === "" ? null : birthdayMonth, birthdayDay: birthdayDay === "" ? null : birthdayDay },
        },
      );
      setGlobalAccountData(res.account);
      toast.success("Birthday saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update that — try again.");
    } finally {
      setSavingBirthday(false);
    }
  };
```

Add two new `<Card>` sections, inserted right after the existing `Profile` card closes (before the `Email verification` card):

```tsx
        <Card title="Email updates">
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={emailOptIn}
              disabled={savingEmailOptIn}
              onChange={(e) => saveEmailOptIn(e.target.checked)}
            />
            Send me offers and updates by email
          </label>
        </Card>

        <Card title="Birthday">
          <p className="mb-3 text-sm text-[var(--muted)]">Optional — we'll send you something nice on the day.</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={12}
              placeholder="Month"
              value={birthdayMonth}
              onChange={(e) => setBirthdayMonth(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-20 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              max={31}
              placeholder="Day"
              value={birthdayDay}
              onChange={(e) => setBirthdayDay(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-20 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <Button onClick={saveBirthday} disabled={savingBirthday}>
              {savingBirthday ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
```

(Confirm `Card` and `Button` are already imported in this file — they should be, since the existing sections already use `Card`.)

- [ ] **Step 9: Run `npm run lint`**

Run: `npm run lint` from repo root.
Expected: no new TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add backend/services/customerAccountService.js backend/controllers/customerAccountController.js backend/routes/customerAccountRoutes.js frontend/src/components/customer/CustomerProfilePanel.tsx backend/tests/messaging-triggers.js
git commit -m "feat: add profile preferences endpoint for email consent and birthday"
```

---

## Task 4: Admin settings for trigger config

**Files:**
- Modify: `backend/controllers/tenantController.js`
- Modify: `frontend/src/hooks/useAdminSettings.ts`
- Modify: `frontend/src/routes/admin/PointsProgram.tsx`
- Modify: `backend/tests/messaging-triggers.js`

**Interfaces:**
- Produces: `GET`/`PATCH /api/admin/settings` gain `messagingTriggers: {milestone: {visitCount}, inactivity: {days}, birthday: {enabled}}`.

- [ ] **Step 1: Write the failing test — extend `backend/tests/messaging-triggers.js`**

Add after the existing checks, still inside the `try` block:

```js
    const patchTriggers = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { messagingTriggers: { milestone: { visitCount: 3 }, inactivity: { days: 30 }, birthday: { enabled: true } } },
    });
    check("PATCH settings sets milestone visitCount", patchTriggers.body.settings.messagingTriggers?.milestone?.visitCount === 3);
    check("PATCH settings sets inactivity days", patchTriggers.body.settings.messagingTriggers?.inactivity?.days === 30);
    check("PATCH settings sets birthday enabled", patchTriggers.body.settings.messagingTriggers?.birthday?.enabled === true);
```

(This replaces the need to re-check the Task 1 default-values assertion — that one still runs first and should now correctly read `null`/`null`/`false` before this PATCH changes them within the same test run.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: FAIL on all three new checks — `updateMySettings` doesn't accept `messagingTriggers` yet.

- [ ] **Step 3: Add `messagingTriggers` to `getMySettings`**

In `backend/controllers/tenantController.js`, add `messagingTriggers: organization.messagingTriggers,` to `getMySettings`'s response object, alongside `tierThresholds`.

- [ ] **Step 4: Add `messagingTriggers` accept-and-merge to `updateMySettings`**

Add `messagingTriggers` to the existing destructure:

```js
    const { name, branding, contact, program, menuEnabled, category, tierThresholds, messagingTriggers } = req.body;
```

Add a merge block, after the `tierThresholds` merge block:

```js
    if (messagingTriggers !== undefined && messagingTriggers !== null && typeof messagingTriggers === "object") {
      const current = organization.messagingTriggers.toObject?.() ?? organization.messagingTriggers;
      organization.messagingTriggers = {
        milestone: { ...current.milestone, ...messagingTriggers.milestone },
        inactivity: { ...current.inactivity, ...messagingTriggers.inactivity },
        birthday: { ...current.birthday, ...messagingTriggers.birthday }
      };
    }
```

Add `messagingTriggers: organization.messagingTriggers,` to the response object, alongside `tierThresholds`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: all checks pass.

- [ ] **Step 6: Run regression suites**

Run: `cd backend && MONGODB_URI="" node tests/program-config.js && MONGODB_URI="" node tests/tier-system.js`
Expected: both pass unchanged.

- [ ] **Step 7: Commit backend**

```bash
git add backend/controllers/tenantController.js backend/tests/messaging-triggers.js
git commit -m "feat: configure per-outlet messaging trigger thresholds via admin settings"
```

- [ ] **Step 8: Add types to `frontend/src/hooks/useAdminSettings.ts`**

Add, immediately after the `TierThresholds` interface:

```ts
export interface MessagingTriggers {
  milestone: { visitCount: number | null };
  inactivity: { days: number | null };
  birthday: { enabled: boolean };
}
```

Add `messagingTriggers: MessagingTriggers;` to `AdminSettings`, right after `tierThresholds`. Add `messagingTriggers?: Partial<MessagingTriggers>;` to `AdminSettingsPatch`, right after `tierThresholds?`.

- [ ] **Step 9: Add a "Triggers" section to `frontend/src/routes/admin/PointsProgram.tsx`**

Read the current file in full first to confirm exact line numbers (an earlier phase's "Tiers" section is the pattern to mirror exactly). Add to the imports:

```ts
import {
  useAdminSettings,
  useUpdateAdminSettings,
  type AdminProgram,
  type TierThresholds,
  type MessagingTriggers,
} from "../../hooks/useAdminSettings";
```

Add state alongside `tierForm`:

```ts
  const [triggersForm, setTriggersForm] = useState<MessagingTriggers | null>(null);
```

Add a seed `useEffect` alongside the `tierForm` one:

```ts
  useEffect(() => {
    if (settings && !triggersForm) setTriggersForm(settings.messagingTriggers);
  }, [settings, triggersForm]);
```

Add `!triggersForm` to the loading guard (alongside `!tierForm`).

Add a save function and setters, alongside `saveTiers`/`setTier`:

```ts
  const saveTriggers = async () => {
    try {
      await update.mutateAsync({ messagingTriggers: triggersForm });
      toast.success("Triggers saved!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };
```

Add a new section, immediately after the Tiers section's closing `</div>` (before the component's root closing `</div>`):

```tsx
      <div className="mt-6 flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <h3 className="text-sm font-bold text-[var(--ink)]">Triggers</h3>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
          <span className="w-28 text-sm font-semibold text-[var(--ink)]">Milestone</span>
          <input
            type="number"
            min={1}
            step="1"
            placeholder="Visit count"
            value={triggersForm?.milestone.visitCount ?? ""}
            onChange={(e) =>
              setTriggersForm((t) =>
                t ? { ...t, milestone: { visitCount: e.target.value === "" ? null : Number(e.target.value) } } : t
              )
            }
            className="w-32 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <span className="text-xs text-[var(--muted)]">visits — empty means off</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4">
          <span className="w-28 text-sm font-semibold text-[var(--ink)]">Inactivity</span>
          <input
            type="number"
            min={1}
            step="1"
            placeholder="Days"
            value={triggersForm?.inactivity.days ?? ""}
            onChange={(e) =>
              setTriggersForm((t) =>
                t ? { ...t, inactivity: { days: e.target.value === "" ? null : Number(e.target.value) } } : t
              )
            }
            className="w-32 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <span className="text-xs text-[var(--muted)]">days since last visit — empty means off</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4">
          <span className="w-28 text-sm font-semibold text-[var(--ink)]">Birthday</span>
          <input
            type="checkbox"
            checked={triggersForm?.birthday.enabled ?? false}
            onChange={(e) =>
              setTriggersForm((t) => (t ? { ...t, birthday: { enabled: e.target.checked } } : t))
            }
          />
          <span className="text-xs text-[var(--muted)]">send a birthday email</span>
        </div>

        <Button onClick={saveTriggers} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save triggers"}
        </Button>
      </div>
```

- [ ] **Step 10: Run `npm run lint`**

Run: `npm run lint` from repo root.
Expected: no new TypeScript errors.

- [ ] **Step 11: Commit frontend**

```bash
git add frontend/src/hooks/useAdminSettings.ts frontend/src/routes/admin/PointsProgram.tsx
git commit -m "feat: admin UI for configuring per-outlet messaging triggers"
```

---

## Task 5: `messagingService.js` core — send + templates

**Files:**
- Create: `backend/services/messagingService.js`
- Modify: `backend/routes/testHookRoutes.js`
- Modify: `backend/tests/messaging-triggers.js`

**Interfaces:**
- Consumes: `emailService.sendEmail({to, subject, html})` (existing); `MessageLog` (Task 1).
- Produces: `messagingService.sendTrigger(type, {organization, customer, membership, context}) => Promise<{sent: boolean, reason?: string}>`. Later tasks (6, 7) call this.

**Important — read before writing tests in this task or the next two:** `bootServer` spawns the server as a **separate OS process**, so getting a customer with both a real `CustomerAccount` (owns `marketingConsent`/`birthdayMonth`/`birthdayDay`) and a working outlet membership (`User` with `customerAccountId` set, needed to actually earn points) requires the REAL flow this codebase uses for that: `POST /api/customer-auth/register` (global) → `POST /api/customer-auth/enter-tenant` (auto-provisions the membership and returns a tenant JWT + `user.id`, exactly like tenant login does). The tenant-scoped `POST /api/auth/register` does **not** set `customerAccountId` on the `User` it creates — a customer registered that way has no linked `CustomerAccount` at all, so consent/birthday fields would never apply to them. Every trigger-related test in Tasks 5-7 uses the register → enter-tenant flow, never `/api/auth/register`. Also confirmed: `claimPoints` is not gated on `emailVerified`, so none of these test customers need an email-verify step.

- [ ] **Step 1: Write the failing test — extend `backend/tests/messaging-triggers.js`**

Add near the top, alongside other requires:

```js
const MessageLog = require("../models/MessageLog");

async function getOrgId(baseUrl, companySlug, outletSlug) {
  const resp = await fetch(`${baseUrl}/__test__/get-organization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companySlug, outletSlug }),
  });
  const body = await resp.json();
  return body.organizationId;
}

// The real flow for a customer with BOTH a CustomerAccount (owns consent/
// birthday) and a working outlet membership (owns earn/redeem history) —
// see this task's note on why /api/auth/register is the wrong path.
async function provisionTenantCustomer(api, label, phoneSuffix, slug = SLUG) {
  const email = `${label}_${Date.now()}@test.co`;
  const reg = await api("/api/customer-auth/register", {
    method: "POST",
    slug: null,
    body: { name: label, email, password: "password123", phone: `98111100${phoneSuffix}` },
  });
  const globalToken = reg.body.token;
  const entered = await api("/api/customer-auth/enter-tenant", {
    method: "POST",
    token: globalToken,
    slug,
    body: {},
  });
  return { email, globalToken, tenantToken: entered.body.token, userId: entered.body.user.id };
}
```

Add after the Task 4 checks, still inside the `try` block:

```js
    const orgId = await getOrgId(baseUrl, COMPANY, SLUG);

    const consentedCustomer = await provisionTenantCustomer(api, "SendConsented", "10");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: consentedCustomer.globalToken, slug: null, body: { emailOptIn: true } });

    const sendTriggerResp = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: consentedCustomer.userId, type: "milestone", context: { visitCount: 3 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("test-hook send-trigger -> 200", sendTriggerResp.status === 200);
    check("sendTrigger sends when consent is granted", sendTriggerResp.body.sent === true);

    const noConsentCustomer = await provisionTenantCustomer(api, "SendNoConsent", "11");
    const sendTriggerNoConsent = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: noConsentCustomer.userId, type: "milestone", context: { visitCount: 3 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("sendTrigger refuses when consent is not granted", sendTriggerNoConsent.body.sent === false && sendTriggerNoConsent.body.reason === "no_consent");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: FAIL — `/__test__/send-trigger` doesn't exist yet (404).

- [ ] **Step 3: Create `backend/services/messagingService.js`**

```js
const { sendEmail } = require("./emailService");
const MessageLog = require("../models/MessageLog");

const renderTemplate = (type, { organization, customer, context }) => {
  if (type === "milestone") {
    return {
      subject: `You've visited ${organization.name} ${context.visitCount} times!`,
      html: `<p>Hi ${customer.name}, that's ${context.visitCount} visits to ${organization.name} — thanks for being a regular. See you again soon.</p>`
    };
  }
  if (type === "birthday") {
    return {
      subject: `Happy birthday from ${organization.name}!`,
      html: `<p>Hi ${customer.name}, happy birthday from all of us at ${organization.name}. Hope it's a good one — come by and treat yourself.</p>`
    };
  }
  if (type === "inactivity") {
    return {
      subject: `We miss you at ${organization.name}`,
      html: `<p>Hi ${customer.name}, it's been a while since your last visit to ${organization.name}. You've still got ${context.balance} points waiting — come say hi.</p>`
    };
  }
  throw new Error(`Unknown trigger type: ${type}`);
};

const sendTrigger = async (type, { organization, customer, membership, context = {} }) => {
  if (!customer.marketingConsent?.email?.granted) {
    return { sent: false, reason: "no_consent" };
  }

  const { subject, html } = renderTemplate(type, { organization, customer, context });

  sendEmail({ to: customer.email, subject, html })
    .catch((err) => console.error(`Failed to send ${type} trigger to ${customer.email}:`, err.message));

  await MessageLog.create({ organizationId: organization._id, userId: membership._id, triggerType: type });

  return { sent: true };
};

module.exports = { sendTrigger };
```

- [ ] **Step 4: Add the test-hook endpoint**

In `backend/routes/testHookRoutes.js`, add a sibling endpoint following the exact style already used by `/get-organization`, `/set-tier-thresholds`, and `/resolve-tier` — every existing test-hook that needs a specific tenant takes `organizationId` directly in the request body (already resolved by the test script via `/get-organization`), never from headers:

```js
router.post("/send-trigger", async (req, res, next) => {
  try {
    const { organizationId, userId, type, context } = req.body;
    const { sendTrigger } = require("../services/messagingService");

    const membership = await User.findOne({ _id: userId, organizationId });
    if (!membership) return res.status(404).json({ success: false, message: "Membership not found." });
    if (!membership.customerAccountId) return res.status(404).json({ success: false, message: "No linked CustomerAccount." });

    const customer = await CustomerAccount.findOne({ _id: membership.customerAccountId });
    if (!customer) return res.status(404).json({ success: false, message: "CustomerAccount not found." });

    const organization = await Organization.findOne({ _id: organizationId });
    if (!organization) return res.status(404).json({ success: false, message: "Organization not found." });

    const result = await sendTrigger(type, { organization, customer, membership, context });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
```

(`User`, `CustomerAccount`, and `Organization` are already required at the top of this file — reuse those existing imports, don't re-require them inside the handler.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: all checks pass.

- [ ] **Step 6: Run full regression**

Run: `cd backend && MONGODB_URI="" npm test 2>&1 | tail -20`
Expected: all suites pass (this codebase's `npm test` chain now fully passes end-to-end, per the production-readiness fixes already merged — confirm no new failures).

- [ ] **Step 7: Commit**

```bash
git add backend/services/messagingService.js backend/routes/testHookRoutes.js backend/tests/messaging-triggers.js
git commit -m "feat: add messagingService with consent-gated send and three canned templates"
```

---

## Task 6: Milestone trigger — real-time

**Files:**
- Modify: `backend/services/messagingService.js`
- Modify: `backend/services/pointsService.js`
- Modify: `backend/routes/testHookRoutes.js`
- Modify: `backend/tests/messaging-triggers.js`

**Interfaces:**
- Consumes: `messagingService.sendTrigger` (Task 5); `Organization.messagingTriggers.milestone.visitCount` (Task 1).
- Produces: `messagingService.checkMilestoneTrigger({organization, membership}) => Promise<void>` — called fire-and-forget from `pointsService.claimPoints`.

- [ ] **Step 1: Write the failing test — extend `backend/tests/messaging-triggers.js`**

Add near the top, alongside other requires:

```js
async function getMessageLogCount(baseUrl, organizationId, userId, triggerType) {
  const resp = await fetch(`${baseUrl}/__test__/message-log-count`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, userId, triggerType }),
  });
  const body = await resp.json();
  return body.count;
}
```

Add after the Task 5 checks, still inside the `try` block:

```js
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { messagingTriggers: { milestone: { visitCount: 3 } } } });

    const milestoneCustomer = await provisionTenantCustomer(api, "Milestone", "12");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: milestoneCustomer.globalToken, slug: null, body: { emailOptIn: true } });

    for (let i = 0; i < 3; i += 1) {
      const gen = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
      await api("/api/points/claim", { method: "POST", token: milestoneCustomer.tenantToken, body: { token: gen.body.data.token } });
    }
    const countAfterThree = await getMessageLogCount(baseUrl, orgId, milestoneCustomer.userId, "milestone");
    check("milestone trigger fires exactly once at the 3rd visit", countAfterThree === 1);

    const gen4 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: milestoneCustomer.tenantToken, body: { token: gen4.body.data.token } });
    const countAfterFour = await getMessageLogCount(baseUrl, orgId, milestoneCustomer.userId, "milestone");
    check("milestone trigger does not re-fire on the 4th visit", countAfterFour === 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: FAIL — no milestone check wired into `claimPoints` yet, and `/__test__/message-log-count` doesn't exist yet, so both new checks fail (likely erroring on the missing endpoint first — that's expected).

- [ ] **Step 3: Add `checkMilestoneTrigger` to `messagingService.js`**

Add these requires to the top of `backend/services/messagingService.js`:

```js
const PointsTransaction = require("../models/PointsTransaction");
const CustomerAccount = require("../models/CustomerAccount");
```

Add this function:

```js
const checkMilestoneTrigger = async ({ organization, membership }) => {
  const visitCount = organization.messagingTriggers?.milestone?.visitCount;
  if (visitCount === null || visitCount === undefined) return;

  const earns = await PointsTransaction.countDocuments({
    organizationId: organization._id,
    userId: membership._id,
    type: "earn"
  });
  if (earns !== visitCount) return;

  if (!membership.customerAccountId) return;
  const customer = await CustomerAccount.findOne({ _id: membership.customerAccountId });
  if (!customer) return;

  await sendTrigger("milestone", { organization, customer, membership, context: { visitCount } });
};
```

Add `checkMilestoneTrigger` to `module.exports`.

- [ ] **Step 4: Wire the fire-and-forget call into `claimPoints`**

In `backend/services/pointsService.js`, add near the top:

```js
const { checkMilestoneTrigger } = require("./messagingService");
```

Modify `claimPoints`'s try block — insert the check between `await session.withTransaction(...)` completing and the `return responsePayload;`:

```js
    let responsePayload;

    await session.withTransaction(async () => {
      const now = new Date();
      const existingToken = await consumeDynamicQrToken({ token, organizationId, session, purpose: "earn" });
      responsePayload = await awardPointsInTransaction({
        session, userId, organizationId, billAmount: existingToken.billAmount, org, now, token
      });
    });

    checkMilestoneTrigger({ organization: org, membership: claimer })
      .catch((err) => console.error("Milestone trigger check failed:", err.message));

    return responsePayload;
```

(`org` and `claimer` are already in scope earlier in `claimPoints` — `org` from `loadOrganizationOrThrow(organizationId)`, `claimer` from the `User.findOne({_id: userId, organizationId})` call near the top of the function. Read the current file first to confirm both variable names match exactly before editing.)

- [ ] **Step 5: Add the `/__test__/message-log-count` endpoint**

In `backend/routes/testHookRoutes.js`:

```js
router.post("/message-log-count", async (req, res, next) => {
  try {
    const { organizationId, userId, triggerType } = req.body;

    const count = await MessageLog.countDocuments({ organizationId, userId, triggerType });
    res.status(200).json({ success: true, count });
  } catch (error) {
    next(error);
  }
});
```

Add `const MessageLog = require("../models/MessageLog");` to this file's top-of-file requires (alongside the other model imports).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: all checks pass.

- [ ] **Step 7: Run points regression suites**

Run: `cd backend && MONGODB_URI="" node tests/points-earn.js && MONGODB_URI="" node tests/points-redeem.js && MONGODB_URI="" node tests/campaigns.js`
Expected: all pass unchanged — confirms the new fire-and-forget hook doesn't slow down or break the earn path itself.

- [ ] **Step 8: Commit**

```bash
git add backend/services/messagingService.js backend/services/pointsService.js backend/routes/testHookRoutes.js backend/tests/messaging-triggers.js
git commit -m "feat: fire milestone trigger in real time off the earn path"
```

---

## Task 7: Birthday + inactivity trigger — daily cron

**Files:**
- Modify: `backend/services/messagingService.js`
- Modify: `backend/server.js`
- Modify: `backend/routes/testHookRoutes.js`
- Modify: `backend/package.json`
- Modify: `backend/tests/messaging-triggers.js`

**Interfaces:**
- Produces: `messagingService.runDailyTriggers() => Promise<void>` — called both by the `node-cron` schedule in `server.js` and directly by tests via a test-hook endpoint.

- [ ] **Step 1: Add `node-cron` dependency**

Run: `cd backend && npm install node-cron`

- [ ] **Step 2: Write the failing test — extend `backend/tests/messaging-triggers.js`**

Add near the top, alongside other requires:

```js
const { makeSiblingOutlet } = require("./helpers/makeOutlet");
```

Add after the Task 6 checks, still inside the `try` block:

```js
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { messagingTriggers: { birthday: { enabled: true } } } });

    const today = new Date();
    const birthdayCustomer = await provisionTenantCustomer(api, "Birthday", "13");
    await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: birthdayCustomer.globalToken,
      slug: null,
      body: { emailOptIn: true, birthdayMonth: today.getMonth() + 1, birthdayDay: today.getDate() },
    });

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const birthdayCountAfterFirstRun = await getMessageLogCount(baseUrl, orgId, birthdayCustomer.userId, "birthday");
    check("birthday trigger fires on a matching real date", birthdayCountAfterFirstRun === 1);

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const birthdayCountAfterSecondRun = await getMessageLogCount(baseUrl, orgId, birthdayCustomer.userId, "birthday");
    check("birthday trigger does not re-fire the same day (idempotent)", birthdayCountAfterSecondRun === 1);

    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { messagingTriggers: { inactivity: { days: 10 } } } });

    const inactiveCustomer = await provisionTenantCustomer(api, "Inactive", "14");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: inactiveCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const genI = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 200 } });
    await api("/api/points/claim", { method: "POST", token: inactiveCustomer.tenantToken, body: { token: genI.body.data.token } });

    await fetch(`${baseUrl}/__test__/backdate-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: inactiveCustomer.userId, days: 15 }),
    });

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const inactivityCountAfterFirstRun = await getMessageLogCount(baseUrl, orgId, inactiveCustomer.userId, "inactivity");
    check("inactivity trigger fires once past the configured threshold", inactivityCountAfterFirstRun === 1);

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const inactivityCountAfterSecondRun = await getMessageLogCount(baseUrl, orgId, inactiveCustomer.userId, "inactivity");
    check("inactivity trigger does not re-fire within the cooldown window", inactivityCountAfterSecondRun === 1);

    // Per-outlet isolation: a sibling outlet with NEITHER trigger configured
    // must never fire, even for a customer whose birthday/inactivity would
    // otherwise match — reusing the sibling-outlet helper Phase 1 already
    // established for exactly this kind of check.
    const sibling = await makeSiblingOutlet(baseUrl, { label: `msg${Date.now()}` });
    const siblingOrgId = await getOrgId(baseUrl, COMPANY, sibling.outletSlug);
    const siblingCustomer = await provisionTenantCustomer(api, "SiblingBirthday", "15", sibling.outletSlug);
    await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: siblingCustomer.globalToken,
      slug: null,
      body: { emailOptIn: true, birthdayMonth: today.getMonth() + 1, birthdayDay: today.getDate() },
    });

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const siblingBirthdayCount = await getMessageLogCount(baseUrl, siblingOrgId, siblingCustomer.userId, "birthday");
    check("a sibling outlet with birthday trigger unconfigured never fires, even for a matching birthday", siblingBirthdayCount === 0);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: FAIL — `/__test__/run-daily-triggers` and `/__test__/backdate-balance` don't exist yet, and `runDailyTriggers` doesn't exist in `messagingService.js`.

- [ ] **Step 4: Add `runDailyTriggers` to `messagingService.js`**

Add these requires:

```js
const Organization = require("../models/Organization");
const User = require("../models/User");
const PointsBalance = require("../models/PointsBalance");
const { toPoints } = require("../utils/pointsMath");
const { PLATFORM_TIMEZONE } = require("../config/platform");
```

Add:

```js
const todayInPlatformTimezone = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLATFORM_TIMEZONE,
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());
  return {
    month: Number(parts.find((p) => p.type === "month").value),
    day: Number(parts.find((p) => p.type === "day").value)
  };
};

const runBirthdayTriggerForOrg = async (org, todayMonth, todayDay) => {
  const members = await User.find({ role: "customer", organizationId: org._id });
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  for (const member of members) {
    if (!member.customerAccountId) continue;
    const customer = await CustomerAccount.findOne({ _id: member.customerAccountId });
    if (!customer) continue;
    if (customer.birthdayMonth !== todayMonth || customer.birthdayDay !== todayDay) continue;

    const alreadySent = await MessageLog.findOne({
      organizationId: org._id,
      userId: member._id,
      triggerType: "birthday",
      sentAt: { $gte: yearStart }
    });
    if (alreadySent) continue;

    await sendTrigger("birthday", { organization: org, customer, membership: member, context: {} });
  }
};

const runInactivityTriggerForOrg = async (org, days) => {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cooldownStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const balances = await PointsBalance.find({ organizationId: org._id });
  const inactiveBalances = balances.filter(
    (b) => b.lastActivityAt && new Date(b.lastActivityAt).getTime() <= cutoff.getTime()
  );

  for (const balance of inactiveBalances) {
    const member = await User.findOne({ _id: balance.userId, organizationId: org._id });
    if (!member || !member.customerAccountId) continue;
    const customer = await CustomerAccount.findOne({ _id: member.customerAccountId });
    if (!customer) continue;

    const alreadySent = await MessageLog.findOne({
      organizationId: org._id,
      userId: member._id,
      triggerType: "inactivity",
      sentAt: { $gte: cooldownStart }
    });
    if (alreadySent) continue;

    await sendTrigger("inactivity", {
      organization: org,
      customer,
      membership: member,
      context: { balance: toPoints(balance.balanceCenti), days }
    });
  }
};

const runDailyTriggers = async () => {
  const { month: todayMonth, day: todayDay } = todayInPlatformTimezone();
  const orgs = await Organization.find({});

  for (const org of orgs) {
    if (org.messagingTriggers?.birthday?.enabled) {
      await runBirthdayTriggerForOrg(org, todayMonth, todayDay);
    }
    const inactivityDays = org.messagingTriggers?.inactivity?.days;
    if (inactivityDays !== null && inactivityDays !== undefined) {
      await runInactivityTriggerForOrg(org, inactivityDays);
    }
  }
};
```

Add `runDailyTriggers` to `module.exports`.

- [ ] **Step 5: Register the cron in `server.js`**

Add near the top:

```js
const cron = require("node-cron");
const { runDailyTriggers } = require("./services/messagingService");
```

Inside `startServer()`, after the demo-seeding block and before `app.listen(...)`:

```js
  cron.schedule("0 9 * * *", () => {
    runDailyTriggers().catch((err) => console.error("Daily triggers run failed:", err.message));
  }, { timezone: PLATFORM_TIMEZONE });
```

(Read the current file first to confirm `PLATFORM_TIMEZONE` is already imported in `server.js` — if not, add `const { PLATFORM_TIMEZONE } = require("./config/platform");` alongside the other top-of-file requires.)

- [ ] **Step 6: Add the remaining test-hook endpoints**

In `backend/routes/testHookRoutes.js`:

```js
router.post("/run-daily-triggers", async (req, res, next) => {
  try {
    const { runDailyTriggers } = require("../services/messagingService");
    await runDailyTriggers();
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/backdate-balance", async (req, res, next) => {
  try {
    const { organizationId, userId, days } = req.body;

    const balance = await PointsBalance.findOne({ userId, organizationId });
    if (!balance) return res.status(404).json({ success: false, message: "Test balance not found." });

    balance.lastActivityAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await balance.save();

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});
```

(`PointsBalance` is already required at the top of this file — reuse it.)

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js`
Expected: all checks pass, including the sibling-outlet isolation check.

- [ ] **Step 8: Run the full suite**

Run: `cd backend && MONGODB_URI="" npm test 2>&1 | tail -20`
Expected: every suite passes, including `messaging-triggers: all PASS` as the last one in the chain.

- [ ] **Step 9: Commit**

```bash
git add backend/services/messagingService.js backend/server.js backend/routes/testHookRoutes.js backend/package.json backend/tests/messaging-triggers.js
git commit -m "feat: add daily-cron birthday and inactivity triggers"
```

---

## Explicitly out of scope for this plan

- Web Push (Phase 3b — separate spec, separate PWA architecture change).
- SMS/WhatsApp sending (Phases 5/6, pending budget).
- Any campaign/`Broadcast` builder or custom message authoring (Phase 4).
- Analytics on trigger send counts (a natural Phase 2-style follow-up once `MessageLog` has real data, not built here).

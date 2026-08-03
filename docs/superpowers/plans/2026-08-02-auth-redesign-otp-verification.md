# Auth Redesign & OTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email-link verification with a 6-digit OTP for `AdminAccount` and `CustomerAccount`, and redesign the three public auth pages (`AdminLogin`, `GlobalCustomerLogin`, `GlobalCustomerRegister`) in the landing's dark visual language.

**Architecture:** Two `VerificationToken`-family models (`AdminVerificationToken`, `AccountVerificationToken`) gain `code`/`attempts` fields alongside their existing `tokenHash`, so the old link path and the new code path both work off one record. One shared frontend component (`VerifyCodeCard`) is reused in four places: a full-page card-stack swap on `AdminLogin`, and three inline swaps in existing "resend verification" spots on the customer side. `GlobalCustomerLogin`/`GlobalCustomerRegister` get a visual redesign only — customer login/register never gates on verification today, and that stays true.

**Tech Stack:** Express (backend); React 19 + TS + `motion` + React Hook Form + Zod (frontend). Backend tests are plain `node tests/*.js` scripts.

**Spec:** `docs/superpowers/specs/2026-08-02-auth-redesign-otp-verification-design.md`

## Global Constraints

- **Backend layering enforced:** `routes/ → controllers/ → services/`. Controllers parse/call/format only.
- **New backend test suites MUST be added to `backend/package.json`'s `test` chain** or they never run.
- **Password reset stays link-based, untouched.** Only `type: "email_verify"` records ever carry a `code`.
- **Customer login and registration do NOT gate on `emailVerified`** — confirmed against running code, and the product keeps this deferred-verification behavior. Only `AdminAccount` login gates on verification.
- **`autoFulfillForAccount`** (from `pendingClaimService`, customer-side only) must still fire after a successful customer OTP verification, exactly as it does after link verification.
- Landing dark tokens: `--lp-bg`, `--lp-panel`, `--lp-ink`, `--lp-muted`, `--lp-line`, `--lp-green`, `--lp-terra`, `--lp-cream`, defined under `.landing-dark` in `frontend/src/index.css`. Light-theme tokens (used by the three inline integrations, which stay on their existing light surfaces): `--bg`, `--surface`, `--ink`, `--muted`, `--soft`, `--line`, `--primary`(+`-deep`), `--err`.
- **All animation goes through `useMotion()`/`useReducedMotion()` from `frontend/src/lib/motion.ts`** — no component hand-rolls a spring outside that hook.
- Frontend has no test runner. Verification is `npm run lint` (`tsc --noEmit`) plus manual browser checks.
- Run backend commands from `backend/`; run `npm run lint` from the repo root.
- `MONGODB_URI="" npm run dev -w backend` (not plain `npm run dev`) for any local UI verification — `backend/.env` points at an unreachable Atlas cluster.

---

### Task 1: Backend OTP infrastructure (admin + customer)

**Files:**
- Modify: `backend/models/AdminVerificationToken.js`
- Modify: `backend/models/AccountVerificationToken.js`
- Modify: `backend/services/companyService.js` (`issueToken`, `sendAdminVerifyEmail`)
- Modify: `backend/services/adminAuthService.js` (add `verifyAdminOtp`, change `adminLogin`'s unverified branch)
- Modify: `backend/services/customerAccountService.js` (`issueToken`, `sendVerifyEmail`, add `verifyCustomerOtp`)
- Modify: `backend/controllers/adminAuthController.js` (add `verifyOtp`)
- Modify: `backend/controllers/customerAccountController.js` (add `verifyOtpController`)
- Modify: `backend/routes/adminAuthRoutes.js`
- Modify: `backend/routes/customerAccountRoutes.js`
- Modify: `backend/routes/testHookRoutes.js` (add `/get-otp-code`)
- Create: `backend/tests/auth-otp.js`
- Modify: `backend/package.json` (add `tests/auth-otp.js` to the `test` chain)

**Interfaces:**
- Produces:
  - `POST /api/admin-auth/verify-otp { email, code }` → `200` (same shape `verifyAdminEmail` returns) | `400 OTP_INCORRECT` | `400 OTP_EXPIRED` | `429 OTP_LOCKED`
  - `POST /api/customer-auth/verify-otp { email, code }` → `200` (same shape `verifyAccountEmail` returns, including `fulfilled`) | same error codes
  - `adminLogin` on an unverified account → `403 { code: "NEEDS_VERIFICATION" }` (was `EMAIL_NOT_VERIFIED`)
  - `POST /__test__/get-otp-code { email, kind: "admin" | "customer" }` → `200 { success: true, code, attempts }` | `404`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/auth-otp.js`:

```js
/**
 * OTP-based email verification for AdminAccount and CustomerAccount.
 *
 * The email-link path (VerificationToken records looked up by tokenHash)
 * stays untouched and is not re-tested here — this suite covers only what's
 * new: the `code`/`attempts` fields, the two verify-otp endpoints, the
 * brute-force lock, and admin login's new NEEDS_VERIFICATION code.
 *
 * Run directly: `node tests/auth-otp.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5047 });
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

  const getCode = async (email, kind) => {
    const res = await api("/__test__/get-otp-code", { method: "POST", body: { email, kind } });
    return res.body;
  };

  try {
    const stamp = Date.now();

    // === Admin side ============================================
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    const companySlug = `otp-co-${stamp}`;
    const ownerEmail = `owner-otp-${stamp}@test.com`;
    const registered = await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: {
        name: "OTP Test Co", slug: companySlug,
        ownerName: "Otp Owner", ownerEmail, ownerPassword: "password123",
      },
    });
    check("registered a fresh company -> 201", registered.status === 201);

    const firstCode = await getCode(ownerEmail, "admin");
    check("fresh admin account has a 6-digit code", /^\d{6}$/.test(firstCode?.code || ""));
    check("fresh admin account has zero attempts", firstCode?.attempts === 0);

    // Unverified admin login -> NEEDS_VERIFICATION, not the old code.
    const unverifiedLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: ownerEmail, password: "password123" },
    });
    check("unverified admin login -> 403", unverifiedLogin.status === 403);
    check("...with NEEDS_VERIFICATION", unverifiedLogin.body?.code === "NEEDS_VERIFICATION");

    // That login attempt must have minted a FRESH code, invalidating the one
    // captured above.
    const codeAfterLoginAttempt = await getCode(ownerEmail, "admin");
    check(
      "login attempt on unverified account issues a fresh code",
      codeAfterLoginAttempt?.code !== firstCode?.code
    );

    // Wrong code increments attempts without verifying.
    const wrong1 = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail, code: "000000" },
    });
    check("wrong admin code -> 400", wrong1.status === 400);
    check("...with OTP_INCORRECT", wrong1.body?.code === "OTP_INCORRECT");
    // A guessed code of exactly "000000" is (astronomically unlikely to be)
    // correct, but guard the assertion above against that flake anyway by
    // reading the real code fresh right before using it below.

    // Five wrong guesses burns the code.
    for (let i = 0; i < 4; i++) {
      await api("/api/admin-auth/verify-otp", { method: "POST", body: { email: ownerEmail, code: "111111" } });
    }
    const locked = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail, code: "222222" },
    });
    check("5th wrong admin code -> 429 OTP_LOCKED", locked.status === 429 && locked.body?.code === "OTP_LOCKED");

    const stillLocked = await getCode(ownerEmail, "admin");
    // Even the real code no longer verifies once burned.
    const tryRealAfterLock = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail, code: stillLocked.code },
    });
    check(
      "correct code rejected once burned by lockout",
      tryRealAfterLock.status === 400 && tryRealAfterLock.body?.code === "OTP_EXPIRED"
    );

    // A fresh admin (new email) verifies correctly with the real code.
    const ownerEmail2 = `owner-otp2-${stamp}@test.com`;
    await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: {
        name: "OTP Test Co 2", slug: `otp-co2-${stamp}`,
        ownerName: "Otp Owner 2", ownerEmail: ownerEmail2, ownerPassword: "password123",
      },
    });
    const realCode = await getCode(ownerEmail2, "admin");
    const verified = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail2, code: realCode.code },
    });
    check("correct admin code -> 200", verified.status === 200);

    const loginNow = await api("/api/admin-auth/login", {
      method: "POST", body: { email: ownerEmail2, password: "password123" },
    });
    check("verified admin can now log in", loginNow.status === 200);

    // === Customer side ==========================================
    const custEmail = `cust-otp-${stamp}@test.com`;
    const custRegister = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Otp Customer", email: custEmail, password: "password123", phone: "9800000000" },
    });
    check("customer register -> 201", custRegister.status === 201);
    check("fresh customer account is unverified", custRegister.body?.emailVerified === false);

    // Confirms the "keep deferred" decision: an unverified customer can
    // still log in exactly like a verified one, unlike admin.
    const custLogin = await api("/api/customer-auth/login", {
      method: "POST", body: { email: custEmail, password: "password123" },
    });
    check("unverified customer login still succeeds -> 200", custLogin.status === 200);

    const custCode = await getCode(custEmail, "customer");
    check("fresh customer account has a 6-digit code", /^\d{6}$/.test(custCode?.code || ""));

    const custWrong = await api("/api/customer-auth/verify-otp", {
      method: "POST", body: { email: custEmail, code: "999999" },
    });
    check("wrong customer code -> 400 OTP_INCORRECT", custWrong.status === 400 && custWrong.body?.code === "OTP_INCORRECT");

    const custVerified = await api("/api/customer-auth/verify-otp", {
      method: "POST", body: { email: custEmail, code: custCode.code },
    });
    check("correct customer code -> 200", custVerified.status === 200);
    check("response carries fulfilled (even if empty)", "fulfilled" in (custVerified.body || {}));

    // Old-style link path still works on a record that also carries a code —
    // proves the two paths coexist without interfering. Uses the existing
    // mint-global-token hook (raw tokenHash), against a THIRD fresh account.
    const custEmail3 = `cust-otp3-${stamp}@test.com`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Otp Customer 3", email: custEmail3, password: "password123", phone: "9800000001" },
    });
    const minted = await api("/__test__/mint-global-token", {
      method: "POST", body: { email: custEmail3, type: "email_verify" },
    });
    check("minted a link token for an account that also has a code", minted.status === 200);
    const linkVerify = await api(`/api/customer-auth/verify-email?token=${minted.body.token}`, { method: "GET" });
    check("old-style link verify still works", linkVerify.status === 200);

    if (failures === 0) console.log("\nAll auth-otp checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && node tests/auth-otp.js
```

Expected: FAIL on nearly every check — `/api/admin-auth/verify-otp`, `/api/customer-auth/verify-otp` and `/__test__/get-otp-code` all 404, `NEEDS_VERIFICATION` doesn't exist yet.

- [ ] **Step 3: Add `code`/`attempts` to both token models**

In `backend/models/AdminVerificationToken.js`, add two fields to the schema (after `type`):

```js
  code: { type: String, default: null },
  attempts: { type: Number, default: 0 },
```

so the schema reads:

```js
const AdminVerificationTokenSchema = new mongoose.Schema({
  adminAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "AdminAccount", required: true },
  type: { type: String, enum: ["email_verify", "password_reset"], required: true },
  code: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
```

Make the identical edit to `backend/models/AccountVerificationToken.js` (same two lines, after its `type` field).

- [ ] **Step 4: Change admin issuance and email copy**

In `backend/services/companyService.js`, replace the `issueToken` and `sendAdminVerifyEmail` functions:

```js
const OTP_TTL_MS = 10 * 60 * 1000;

const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const issueToken = async (adminAccountId, type) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const isVerify = type === "email_verify";
  const ttl = isVerify ? OTP_TTL_MS : RESET_TTL_MS;

  // Only one live email_verify code at a time — an older email's code must
  // never be a second valid answer once a newer one has been issued.
  if (isVerify) {
    await AdminVerificationToken.updateMany(
      { adminAccountId, type: "email_verify", usedAt: null },
      { $set: { usedAt: new Date() } }
    );
  }

  await AdminVerificationToken.create({
    adminAccountId,
    type,
    code: isVerify ? generateOtp() : null,
    attempts: 0,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
    usedAt: null
  });
  return raw;
};
```

The mock DB has no real `updateMany` per CLAUDE.md — check whether `AdminVerificationToken.updateMany` is available before relying on it:

```bash
grep -n "updateMany" backend/utils/mockMongoose.js
```

If that grep finds nothing, `updateMany` isn't implemented on the mock, and this step must use the find+save loop pattern CLAUDE.md documents instead:

```js
  if (isVerify) {
    const stale = await AdminVerificationToken.find({ adminAccountId, type: "email_verify", usedAt: null });
    for (const record of stale) {
      record.usedAt = new Date();
      await record.save();
    }
  }
```

Use whichever form the grep result calls for.

Replace `sendAdminVerifyEmail`:

```js
const sendAdminVerifyEmail = async (account) => {
  const raw = await issueToken(account._id, "email_verify");
  const record = await AdminVerificationToken.findOne({ tokenHash: hashToken(raw) });
  sendEmail({
    to: account.email,
    subject: "Your Stampd verification code",
    html: `<p>Your code is <strong>${record.code}</strong>. It expires in 10 minutes.</p>`
  }).catch((err) => console.error(`Failed to email verify-code to ${account.email}:`, err.message));
};
```

`buildAdminAuthLink` stays exactly as-is (the link path is unchanged) — do not remove it, `verifyAdminEmail`'s `GET .../verify-email?token=` path still reads it.

- [ ] **Step 5: Add `verifyAdminOtp` and change `adminLogin`'s unverified branch**

In `backend/services/adminAuthService.js`, add a new export next to the existing `verifyAdminEmail`. First find that function's exact shape:

```bash
grep -n "const verifyAdminEmail" -A 30 backend/services/adminAuthService.js
```

Add `verifyAdminOtp`, mirroring its post-verification tail exactly (mark the account verified, save, then whatever `verifyAdminEmail` does after that — copy it verbatim into the new function rather than guessing):

```js
const verifyAdminOtp = async ({ email, code }) => {
  if (!email || !code) {
    throw createHttpError("Email and code are required.", 400);
  }

  const account = await AdminAccount.findOne({ email: normalizeEmail(email) });
  if (!account) {
    throw createHttpError("This code is invalid or has expired.", 400, "OTP_EXPIRED");
  }

  const record = await AdminVerificationToken.findOne({
    adminAccountId: account._id,
    type: "email_verify",
    usedAt: null
  });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This code is invalid or has expired.", 400, "OTP_EXPIRED");
  }

  if (record.code !== code) {
    record.attempts += 1;
    if (record.attempts >= 5) {
      record.usedAt = new Date();
      await record.save();
      throw createHttpError("Too many wrong attempts. Request a new code.", 429, "OTP_LOCKED");
    }
    await record.save();
    throw createHttpError("That code is incorrect.", 400, "OTP_INCORRECT");
  }

  record.usedAt = new Date();
  await record.save();

  // Same post-verification tail as verifyAdminEmail — copy its body from
  // the point after it marks the account verified, verbatim.
  account.emailVerified = true;
  await account.save();

  return { success: true, message: "Email verified." };
};
```

The exact final `return` and any membership-sync call must match whatever `verifyAdminEmail` actually does after `account.save()` — read its full body with the grep above and copy that tail in place of the two lines shown, rather than trusting this sketch.

Change `adminLogin`'s unverified branch (currently around line 51-56, throwing `EMAIL_NOT_VERIFIED`):

```js
  if (!account.emailVerified) {
    await sendAdminVerifyEmail(account);
    throw createHttpError(
      "Verify your email before signing in — check your inbox for your code.",
      403,
      "NEEDS_VERIFICATION"
    );
  }
```

`sendAdminVerifyEmail` is already imported in this file (it's re-exported from `companyService` — check the destructured import at the top of `adminAuthService.js` and add `sendAdminVerifyEmail` to it if not already present).

Export `verifyAdminOtp` from `adminAuthService.js`'s `module.exports`.

- [ ] **Step 6: Mirror steps 4-5 for the customer side**

In `backend/services/customerAccountService.js`, apply the identical `issueToken`/email-copy change (using `AccountVerificationToken` instead of `AdminVerificationToken`, and the customer's own `hashToken`/`crypto` already in scope in this file):

```js
const OTP_TTL_MS = 10 * 60 * 1000;

const generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const issueToken = async (customerAccountId, type) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const isVerify = type === "email_verify";
  const ttl = isVerify ? OTP_TTL_MS : RESET_TTL_MS;

  if (isVerify) {
    const stale = await AccountVerificationToken.find({ customerAccountId, type: "email_verify", usedAt: null });
    for (const record of stale) {
      record.usedAt = new Date();
      await record.save();
    }
  }

  await AccountVerificationToken.create({
    customerAccountId,
    type,
    code: isVerify ? generateOtp() : null,
    attempts: 0,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
    usedAt: null
  });
  return raw;
};

const sendVerifyEmail = async (account) => {
  const raw = await issueToken(account._id, "email_verify");
  const record = await AccountVerificationToken.findOne({ tokenHash: hashToken(raw) });
  sendEmail({
    to: account.email,
    subject: "Your Stampd verification code",
    html: `<p>Your code is <strong>${record.code}</strong>. It expires in 10 minutes.</p>`
  }).catch((err) => console.error(`Failed to email verify-code to ${account.email}:`, err.message));
};
```

Add `verifyCustomerOtp`, next to the existing `verifyAccountEmail` — read that function's full body first:

```bash
grep -n "const verifyAccountEmail" -A 30 backend/services/customerAccountService.js
```

```js
const verifyCustomerOtp = async ({ email, code }) => {
  if (!email || !code) {
    throw createHttpError("Email and code are required.", 400);
  }

  const account = await CustomerAccount.findOne({ email: normalizeEmail(email) });
  if (!account) {
    throw createHttpError("This code is invalid or has expired.", 400, "OTP_EXPIRED");
  }

  const record = await AccountVerificationToken.findOne({
    customerAccountId: account._id,
    type: "email_verify",
    usedAt: null
  });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This code is invalid or has expired.", 400, "OTP_EXPIRED");
  }

  if (record.code !== code) {
    record.attempts += 1;
    if (record.attempts >= 5) {
      record.usedAt = new Date();
      await record.save();
      throw createHttpError("Too many wrong attempts. Request a new code.", 429, "OTP_LOCKED");
    }
    await record.save();
    throw createHttpError("That code is incorrect.", 400, "OTP_INCORRECT");
  }

  record.usedAt = new Date();
  await record.save();

  account.emailVerified = true;
  await account.save();

  await syncVerifiedToMemberships(account);

  const { autoFulfillForAccount } = require("./pendingClaimService");
  const fulfilled = await autoFulfillForAccount(account._id.toString());

  return { success: true, message: "Email verified.", fulfilled };
};
```

**Important:** `createHttpError` in `customerAccountService.js` currently takes only `(message, statusCode)` — no third `code` argument (check the top of the file). Change its signature to accept and attach an optional third `code` parameter, matching the pattern already used in `companyService.js`/`adminAuthService.js`:

```js
const createHttpError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};
```

Verify this doesn't break any existing `createHttpError(msg, status)` two-argument call in the file — it won't, since `code` simply stays `undefined` and the `if (code)` guard skips setting it, but confirm no caller passes a third positional argument today for a different purpose:

```bash
grep -n "createHttpError(" backend/services/customerAccountService.js
```

**Do NOT change `loginAccount`.** It does not check `emailVerified` today and must continue not to — this is the "keep deferred" decision from the spec. Do not add any verification gate to it.

Export `verifyCustomerOtp` from `customerAccountService.js`'s `module.exports`.

- [ ] **Step 7: Wire the controllers and routes**

In `backend/controllers/adminAuthController.js`, add:

```js
const {
  adminLogin,
  verifyAdminEmail,
  verifyAdminOtp,
  resendAdminVerification,
  forgotAdminPassword,
  resetAdminPassword
} = require("../services/adminAuthService");
```

and a new handler, then add it to `module.exports`:

```js
const verifyOtp = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const result = await verifyAdminOtp({ email, code });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

In `backend/routes/adminAuthRoutes.js`, import `authLimiter` (already imported) and add:

```js
router.post("/verify-otp", authLimiter, verifyOtp);
```

(add `verifyOtp` to the destructured `require` at the top of the file, next to `login`).

Mirror both edits in `backend/controllers/customerAccountController.js` (add `verifyOtpController`, wired to `verifyCustomerOtp`) and `backend/routes/customerAccountRoutes.js`:

```js
router.post("/verify-otp", authLimiter, verifyOtpController);
```

- [ ] **Step 8: Add the test-only OTP read-back hook**

In `backend/routes/testHookRoutes.js`, add near the other `/mint-*` hooks:

```js
// DEV/TEST ONLY. Reads back the current live email_verify code for an
// account, so a self-contained test can drive the OTP flow without reading
// email — mirrors /mint-token's role for the link-based flow, but reads
// instead of mints since the code is generated server-side automatically.
router.post("/get-otp-code", async (req, res, next) => {
  try {
    const { email, kind } = req.body;
    const normalizedEmail = String(email || "").toLowerCase();

    if (kind === "admin") {
      const account = await AdminAccount.findOne({ email: normalizedEmail });
      if (!account) return res.status(404).json({ success: false });
      const record = await AdminVerificationToken.findOne({
        adminAccountId: account._id,
        type: "email_verify",
        usedAt: null
      });
      if (!record) return res.status(404).json({ success: false });
      return res.json({ success: true, code: record.code, attempts: record.attempts });
    }

    if (kind === "customer") {
      const account = await CustomerAccount.findOne({ email: normalizedEmail });
      if (!account) return res.status(404).json({ success: false });
      const record = await AccountVerificationToken.findOne({
        customerAccountId: account._id,
        type: "email_verify",
        usedAt: null
      });
      if (!record) return res.status(404).json({ success: false });
      return res.json({ success: true, code: record.code, attempts: record.attempts });
    }

    res.status(400).json({ success: false, message: "kind must be \"admin\" or \"customer\"." });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 9: Add the suite to the test chain**

In `backend/package.json`, append ` && node tests/auth-otp.js` to the end of the `"test"` script string.

- [ ] **Step 10: Run the test to verify it passes**

```bash
cd backend && node tests/auth-otp.js
```

Expected: PASS on every check, ending with `All auth-otp checks passed.`

- [ ] **Step 11: Run the full backend chain**

```bash
npm test -w backend
```

Expected: every suite passes, including `tests/account-settings.js`, `tests/company-outlets.js`, and `tests/points-redeem.js` (all three assert `EMAIL_NOT_VERIFIED` — these must now be updated, since Step 5 renamed that code to `NEEDS_VERIFICATION`).

If any of those three fail: open each, change the asserted string from `"EMAIL_NOT_VERIFIED"` to `"NEEDS_VERIFICATION"` at the exact line the earlier `grep -rn "EMAIL_NOT_VERIFIED"` in this task's research found (`tests/points-redeem.js:199`, `tests/company-outlets.js:77`, `tests/account-settings.js:99`), and re-run.

- [ ] **Step 12: Commit**

```bash
git add backend/models/AdminVerificationToken.js backend/models/AccountVerificationToken.js backend/services/companyService.js backend/services/adminAuthService.js backend/services/customerAccountService.js backend/controllers/adminAuthController.js backend/controllers/customerAccountController.js backend/routes/adminAuthRoutes.js backend/routes/customerAccountRoutes.js backend/routes/testHookRoutes.js backend/tests/auth-otp.js backend/package.json backend/tests/points-redeem.js backend/tests/company-outlets.js backend/tests/account-settings.js
git commit -m "feat: replace email-link verification with 6-digit OTP"
```

---

### Task 2: Shared `VerifyCodeCard` component

**Files:**
- Create: `frontend/src/components/shared/auth/VerifyCodeCard.tsx`

**Interfaces:**
- Consumes: `useMotion` from `frontend/src/lib/motion.ts` (`spring(name)`, `pick(moving, still)`, `prefersReduced`).
- Produces: `VerifyCodeCard({ email, verify, resend, onVerified, size }: { email: string; verify: (code: string) => Promise<void>; resend: () => Promise<void>; onVerified: () => void; size: "full" | "inline" })`.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useMotion } from "../../../lib/motion";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 30;

export function VerifyCodeCard({
  email,
  verify,
  resend,
  onVerified,
  size,
}: {
  email: string;
  verify: (code: string) => Promise<void>;
  resend: () => Promise<void>;
  onVerified: () => void;
  size: "full" | "inline";
}) {
  const m = useMotion();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = async (code: string) => {
    if (code.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      await verify(code);
      onVerified();
    } catch (err) {
      const codeName = (err as Error & { code?: string }).code;
      if (codeName === "OTP_LOCKED") {
        setLocked(true);
      } else {
        setError((err as Error).message || "That code is incorrect.");
        setDigits("");
      }
    } finally {
      setVerifying(false);
    }
  };

  const onChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setDigits(clean);
    if (clean.length === CODE_LENGTH) void submit(clean);
  };

  const onResend = async () => {
    if (cooldown > 0) return;
    setLocked(false);
    setError(null);
    setDigits("");
    try {
      await resend();
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      // resend() callers already surface their own toast on failure.
    }
    inputRef.current?.focus();
  };

  const boxTone =
    size === "full"
      ? "border-[var(--lp-line)] bg-white/[0.04] text-[var(--lp-ink)]"
      : "border-[var(--line)] bg-[var(--bg)] text-[var(--ink)]";
  const mutedTone = size === "full" ? "text-[var(--lp-muted)]" : "text-[var(--muted)]";
  const boxSize = size === "full" ? "h-14 w-11 text-xl" : "h-10 w-8 text-base";

  return (
    <div className="relative">
      <p className={`text-sm ${mutedTone}`}>
        Enter the 6-digit code sent to <span className="font-medium">{email}</span>.
      </p>

      {locked ? (
        <div className="mt-4 flex flex-col items-start gap-2">
          <p className={`text-sm ${mutedTone}`}>Too many tries — request a new code.</p>
          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0}
            className="text-sm font-medium underline underline-offset-4 disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
          </button>
        </div>
      ) : (
        <>
          <motion.div
            className="relative mt-4 flex gap-2"
            animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
            transition={m.pick(m.spring("numberChange"), { duration: 0 })}
          >
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={`flex ${boxSize} items-center justify-center rounded-2xl border font-mono ${boxTone} ${
                  i === digits.length ? "border-[var(--lp-green)]" : ""
                }`}
              >
                {digits[i] || ""}
              </div>
            ))}
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={digits}
              onChange={(e) => onChange(e.target.value)}
              disabled={verifying}
              aria-label="6-digit verification code"
              className="absolute inset-0 h-full w-full cursor-default opacity-0"
            />
          </motion.div>

          {error && <p className="mt-2 text-xs font-medium text-[var(--err)]">{error}</p>}

          <p className={`mt-4 text-sm ${mutedTone}`}>
            Didn't get it?{" "}
            <button
              type="button"
              onClick={onResend}
              disabled={cooldown > 0}
              className="font-medium underline underline-offset-4 disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared/auth/VerifyCodeCard.tsx
git commit -m "feat: add shared VerifyCodeCard OTP entry component"
```

---

### Task 3: `AdminLogin.tsx` redesign + OTP integration

**Files:**
- Create: `frontend/src/components/shared/auth/AuthSplitShell.tsx`
- Modify: `frontend/src/routes/AdminLogin.tsx`

**Interfaces:**
- Consumes: `VerifyCodeCard` from Task 2; `apiRequest` from `frontend/src/lib/api`; `StampdLogo` from `frontend/src/components/shared/StampdLogo`; `useMotion` from `frontend/src/lib/motion`.
- Produces: `AuthSplitShell({ children }: { children: ReactNode })` — the reusable dark split layout, used again in Task 4.

- [ ] **Step 1: Write the shared split shell**

The 21st.dev "Modern Animated Sign In" reference is a paid component this plan cannot fetch verbatim; this rebuilds its described effect (ripple rings + orbiting glyphs behind a centered logo on a left panel, hidden below `lg`) from the free `motion` package, in the landing's dark tokens rather than its blue theme — the same approach already used for the landing carousel.

Create `frontend/src/components/shared/auth/AuthSplitShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useMotion } from "../../../lib/motion";
import { StampdLogo } from "../StampdLogo";

// Three loyalty-domain glyphs orbiting the logo, replacing what a generic
// tech-stack reference would show as HTML/CSS/JS icons. Hand-built inline
// SVGs matching StampdLogo's own style rather than a new icon dependency.
const GLYPHS = [
  // A point/coin mark.
  <circle key="coin" cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />,
  // A QR corner.
  <path
    key="qr"
    d="M4 4h6v6H4zM4 6.5h4M6.5 4v4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  />,
  // A receipt.
  <path
    key="receipt"
    d="M5 3h10v16l-2-1.5L11 19l-2-1.5L7 19l-2-1.5V3Z M7 7h6M7 10h6M7 13h4"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinejoin="round"
  />,
];

function OrbitingGlyph({ index, total, reduced }: { index: number; total: number; reduced: boolean }) {
  const angle = (index / total) * 360;
  const radius = 96;
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-[var(--lp-green)]"
      style={{
        transformOrigin: "center",
      }}
      animate={
        reduced
          ? { rotate: angle }
          : { rotate: [angle, angle + 360] }
      }
      transition={reduced ? { duration: 0 } : { duration: 18, repeat: Infinity, ease: "linear" }}
    >
      <div style={{ transform: `translateX(${radius}px)` }}>
        <svg viewBox="0 0 24 24" className="h-8 w-8" style={{ transform: `rotate(${-angle}deg)` }}>
          {GLYPHS[index % GLYPHS.length]}
        </svg>
      </div>
    </motion.div>
  );
}

export function AuthSplitShell({ children }: { children: ReactNode }) {
  const m = useMotion();

  return (
    <div className="landing-dark flex min-h-screen w-full bg-[var(--lp-bg)]">
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden lg:flex">
        {/* Ripple rings, low opacity, centered behind the logo. */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[var(--lp-green)]"
            style={{ width: 160, height: 160 }}
            animate={
              m.prefersReduced
                ? { opacity: 0.08 }
                : { scale: [1, 2.6], opacity: [0.24, 0] }
            }
            transition={
              m.prefersReduced
                ? { duration: 0 }
                : { duration: 4, repeat: Infinity, delay: i * 1.3, ease: "easeOut" }
            }
          />
        ))}

        <div className="relative flex h-56 w-56 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <OrbitingGlyph key={i} index={i} total={3} reduced={m.prefersReduced} />
          ))}
          <motion.div
            animate={m.prefersReduced ? {} : { rotate: [0, 6, -6, 0] }}
            transition={m.prefersReduced ? { duration: 0 } : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            <StampdLogo size={72} tile />
          </motion.div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `AdminLogin.tsx`**

Replace the file's return statement and the `EMAIL_NOT_VERIFIED` branch. Read the current full file first (`frontend/src/routes/AdminLogin.tsx`) since this replaces most of it — the `schema`, `FormValues`, `LoginResponse` type, and the successful-login branches of `onSubmit` (the `res.kind === "company_owner"` / outlet-admin blocks) stay exactly as they are today; only the imports, the unverified branch, and the JSX change.

Change the top imports to:

```tsx
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../lib/api";
import { tenantPath } from "../lib/tenantPath";
import { PLATFORM_NAME } from "../lib/platform";
import { AuthSplitShell } from "../components/shared/auth/AuthSplitShell";
import { VerifyCodeCard } from "../components/shared/auth/VerifyCodeCard";
```

(drop the `StampdLogo` import — `AuthSplitShell` renders it now.)

Replace the `unverifiedEmail`/`resending`/`resend` state block with:

```tsx
  // Set only on NEEDS_VERIFICATION — the one case where "try again" isn't
  // the fix. Holds the credentials so onVerified can complete the sign-in
  // the admin was already mid-way through, without retyping anything.
  const [pendingVerify, setPendingVerify] = useState<{ email: string; password: string } | null>(null);
```

Replace the `onSubmit` function's catch block:

```tsx
  const onSubmit = async (data: FormValues) => {
    const id = toast.loading("Signing you in…");
    try {
      const res = await apiRequest<LoginResponse>("/api/admin-auth/login", {
        method: "POST",
        body: { email: data.email, password: data.password },
      });

      localStorage.removeItem("company_session");
      localStorage.removeItem("company_account");
      localStorage.removeItem("company_info");
      localStorage.removeItem("admin_auth_token");
      localStorage.removeItem("admin_auth_user");

      if (res.kind === "company_owner") {
        localStorage.setItem("company_session", res.token);
        localStorage.setItem("company_account", JSON.stringify(res.account));
        localStorage.setItem("company_info", JSON.stringify(res.company));
        toast.success(`Welcome back, ${res.company.name}!`, { id });
        window.location.href = "/company";
        return;
      }

      localStorage.setItem("admin_auth_token", res.token);
      localStorage.setItem("admin_auth_user", JSON.stringify(res.user));
      toast.success(`Welcome back, ${res.outlet?.name}!`, { id });
      window.location.href = tenantPath(res.company.slug, res.outlet!.slug, "admin");
    } catch (err: any) {
      if (err.code === "NEEDS_VERIFICATION") {
        toast.dismiss(id);
        setPendingVerify({ email: data.email, password: data.password });
        return;
      }
      toast.error(err.message || "Couldn't sign you in — try again.", { id });
    }
  };

  const verifyOtp = async (code: string) => {
    await apiRequest("/api/admin-auth/verify-otp", {
      method: "POST",
      body: { email: pendingVerify!.email, code },
    });
  };

  const resendOtp = async () => {
    await apiRequest("/api/admin-auth/resend-verification", {
      method: "POST",
      body: { email: pendingVerify!.email },
    });
  };

  const onVerified = () => {
    toast.success("Email verified — signing you in…");
    const creds = pendingVerify!;
    setPendingVerify(null);
    onSubmit({ email: creds.email, password: creds.password });
  };
```

Replace the JSX `return` block:

```tsx
  return (
    <AuthSplitShell>
      {pendingVerify ? (
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--lp-ink)]">Check your email</h1>
          <p className="mt-1 text-sm text-[var(--lp-muted)]">One more step before you're in.</p>
          <div className="mt-6">
            <VerifyCodeCard
              size="full"
              email={pendingVerify.email}
              verify={verifyOtp}
              resend={resendOtp}
              onVerified={onVerified}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold text-[var(--lp-ink)]">Business sign in</h1>
            <p className="mt-1 text-sm text-[var(--lp-muted)]">
              For company owners and outlet staff alike.
            </p>
          </div>

          <div className="rounded-[20px] border border-[var(--lp-line)] bg-white/[0.04] p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="Email"
                autoComplete="username"
                {...register("email")}
                className="rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3.5 text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-green)] focus:outline-none"
              />
              {errors.email && <p className="pl-1 text-xs font-semibold text-[var(--lp-terra)]">{errors.email.message}</p>}
              <input
                type="password"
                placeholder="Password"
                autoComplete="current-password"
                {...register("password")}
                className="rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3.5 text-sm text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-green)] focus:outline-none"
              />
              {errors.password && <p className="pl-1 text-xs font-semibold text-[var(--lp-terra)]">{errors.password.message}</p>}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full rounded-[74px] bg-[var(--lp-cream)] py-4 text-[15px] font-bold text-[#14201C] transition-transform duration-200 hover:scale-105 disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                {isSubmitting ? "Signing you in…" : "Sign in"}
              </button>
            </form>

            <p className="mt-4 text-center text-[13px] text-[var(--lp-muted)]">
              <Link to="/admin-forgot-password" className="hover:text-[var(--lp-ink)]">Forgot password?</Link>
            </p>
          </div>

          <p className="mt-5 text-center text-[13px] text-[var(--lp-muted)]">
            Want to bring your business onto {PLATFORM_NAME}?{" "}
            <Link to="/" className="font-bold text-[var(--lp-green)] hover:underline">Get in touch</Link>
          </p>
        </>
      )}
    </AuthSplitShell>
  );
}
```

The `useEffect` that sets `document.title` stays unchanged.

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors. An unused-import error on `StampdLogo` means it wasn't removed from `AdminLogin.tsx`'s imports in Step 2.

- [ ] **Step 4: Verify in the browser**

Start the backend on the mock DB (`MONGODB_URI="" npm run dev -w backend`) and the frontend. Open `/admin-login`:

1. The page renders the dark split layout — orbiting glyphs and ripple rings on the left (desktop width), form on the right.
2. Register a new company via the platform console (or use an existing unverified seed account if one exists), then attempt to sign in with it.
3. On `NEEDS_VERIFICATION`, the form is replaced by the `VerifyCodeCard` in place — check the email the dev stub logged to the backend console for the real 6-digit code (`[email:stub]` log line).
4. Typing the correct 6 digits verifies and completes sign-in automatically, landing in the console.
5. Typing 5 wrong codes shows the locked state and a working "Send a new code" resend.
6. With `prefers-reduced-motion: reduce` in devtools, the left-panel ripple/orbit/logo animations go still but the page still renders correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared/auth/AuthSplitShell.tsx frontend/src/routes/AdminLogin.tsx
git commit -m "feat: redesign AdminLogin with OTP verification"
```

---

### Task 4: `GlobalCustomerLogin.tsx` + `GlobalCustomerRegister.tsx` visual redesign

**Files:**
- Modify: `frontend/src/routes/GlobalCustomerLogin.tsx`
- Modify: `frontend/src/routes/GlobalCustomerRegister.tsx`

**Interfaces:**
- Consumes: `AuthSplitShell` from Task 3.
- Produces: no new exports — visual-only change, no behavior change (per the "keep deferred" decision, neither page gets a `VerifyCodeCard`).

- [ ] **Step 1: Restyle `GlobalCustomerLogin.tsx`**

Change only the top-level wrapper and the visual classes — every piece of logic (`onSubmit`, `onGoogle`, the `useEffect` redirect, form validation) stays byte-for-byte identical. Replace the import of `StampdLogo` with `AuthSplitShell`:

```tsx
import { AuthSplitShell } from "../components/shared/auth/AuthSplitShell";
```

(remove the `StampdLogo` import).

Replace the returned JSX's outer wrapper — from:

```tsx
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <StampdLogo size={56} tile className="mb-4" />

        <h1 className="font-display text-[25px] font-bold text-[var(--ink)]">Welcome back</h1>
```

to:

```tsx
  return (
    <AuthSplitShell>
        <h1 className="font-display text-[25px] font-bold text-[var(--lp-ink)]">Welcome back</h1>
```

and its closing tags — from:

```tsx
        {showPhoneStep && <PhoneStepModal onDone={() => navigate("/explore")} />}
      </div>
    </div>
  );
}
```

to:

```tsx
        {showPhoneStep && <PhoneStepModal onDone={() => navigate("/explore")} />}
    </AuthSplitShell>
  );
}
```

Within the JSX body, recolor every `--ink`/`--muted`/`--soft`/`--line`/`--bg`/`--primary`/`--primary-deep` reference to its `--lp-*` counterpart (`--lp-ink`, `--lp-muted`, `--lp-muted` again for `--soft` — the landing palette has no separate soft tone, `--lp-line`, transparent/`white/[0.04]` for the field backgrounds instead of `--bg`, `--lp-green` for `--primary`/`--primary-deep`). The submit button becomes the `CtaPill` treatment matching `AdminLogin.tsx`'s Task 3 button:

```tsx
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-[74px] bg-[var(--lp-cream)] py-4 text-[15px] font-bold text-[#14201C] transition-transform duration-200 hover:scale-105 disabled:opacity-50 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            {isSubmitting ? "Please wait…" : "Sign in"}
          </button>
```

Each field's wrapper div (`border border-[var(--line)] bg-[var(--bg)] ... focus-within:border-[var(--primary)]`) becomes:

```tsx
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3.5 transition-colors focus-within:border-[var(--lp-green)]">
```

with the icon and input text colors changed from `text-[var(--soft)]`/`text-[var(--ink)]`/`placeholder:text-[var(--soft)]` to `text-[var(--lp-muted)]`/`text-[var(--lp-ink)]`/`placeholder:text-[var(--lp-muted)]`.

- [ ] **Step 2: Restyle `GlobalCustomerRegister.tsx`**

Apply the identical transformation. Replace the `Shell` helper component at the bottom of the file — from:

```tsx
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <StampdLogo size={56} tile className="mb-4" />
        {children}
      </div>
    </div>
  );
}
```

to:

```tsx
function Shell({ children }: { children: React.ReactNode }) {
  return <AuthSplitShell>{children}</AuthSplitShell>;
}
```

Remove the now-unused `StampdLogo` import and add:

```tsx
import { AuthSplitShell } from "../components/shared/auth/AuthSplitShell";
```

Recolor the `Field` and `Err` helper components and the main heading/paragraph/submit button the same way as Step 1 — `--ink`→`--lp-ink`, `--muted`→`--lp-muted`, `--soft`→`--lp-muted`, `--line`→`--lp-line`, `--bg`→`white/[0.04]`, `--primary`→`--lp-green`, `--primary-deep`→`--lp-green`. The submit button becomes the same `CtaPill`-style cream pill as Step 1.

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open `/customer-login` and `/customer-register`. Confirm both render the same dark split layout as `/admin-login`, all fields are legible (no dark-on-dark or light-on-light text), the Google sign-in button on the login page still renders and works, and submitting each form behaves exactly as before (login navigates to `/explore` on success; register navigates to `/explore` immediately, unverified, with the existing toast — no verify-card appears).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/GlobalCustomerLogin.tsx frontend/src/routes/GlobalCustomerRegister.tsx
git commit -m "feat: redesign customer login and register pages"
```

---

### Task 5: Inline `VerifyCodeCard` on the three existing customer resend spots

**Files:**
- Modify: `frontend/src/routes/CustomerDashboard.tsx`
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx`
- Modify: `frontend/src/routes/RedeemLanding.tsx`

**Interfaces:**
- Consumes: `VerifyCodeCard` from Task 2 (`size="inline"`).

- [ ] **Step 1: `CustomerDashboard.tsx`**

Read the file's current unverified-banner block in full first (`grep -n "unverified" -A 40 frontend/src/routes/CustomerDashboard.tsx`) to get its exact surrounding JSX and imports, since this replaces the banner's button and its `onClick` in place.

Add local state for whether the inline card is showing:

```tsx
  const [showVerify, setShowVerify] = useState(false);
```

(add `useState` to the existing `react` import if not already there, and add `VerifyCodeCard` and `apiRequest`'s existing import stays as-is since it's already imported).

Replace the banner's "Resend" button and its `onClick` with a toggle into the inline card:

```tsx
      {unverified && (
        <div
          className="mb-4 flex items-start gap-3 rounded-[var(--radius-btn)] px-4 py-3"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          <MailWarning className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div className="w-full text-sm">
            {showVerify ? (
              <VerifyCodeCard
                size="inline"
                email={account?.email || ""}
                verify={async (code) => {
                  await apiRequest("/api/customer-auth/verify-otp", {
                    method: "POST",
                    body: { email: account?.email, code },
                  });
                }}
                resend={async () => {
                  await apiRequest("/api/customer-auth/resend-verification", {
                    method: "POST",
                    body: { email: account?.email },
                  });
                }}
                onVerified={() => {
                  toast.success("Email verified!");
                  setShowVerify(false);
                  queryClient.invalidateQueries({ queryKey: ["account", "customer"] });
                }}
              />
            ) : (
              <>
                <span className="font-bold">
                  You're collecting points fine — verify your email before you spend them.
                </span>{" "}
                <button onClick={() => setShowVerify(true)} className="font-bold underline">
                  Verify now
                </button>
              </>
            )}
          </div>
        </div>
      )}
```

Check what query key `useAccount("customer")` actually uses before writing the `invalidateQueries` call — grep it:

```bash
grep -n "useAccount" -A 10 frontend/src/hooks/useAccount.ts 2>/dev/null || grep -rn "const useAccount" frontend/src/hooks/
```

Use the exact query key that hook builds (it may already include the role as a key segment, e.g. `["account", "customer"]` or something else — match it precisely, and import `useQueryClient` from `@tanstack/react-query` if `queryClient` isn't already in scope in this file).

- [ ] **Step 2: `CustomerProfilePanel.tsx`**

Add a `showVerify` state next to the existing `resending` state, and replace the "Email verification" card's body:

```tsx
      <Card title="Email verification">
        <div className="mb-3 text-[13px] text-[var(--muted)]">
          {globalAccount.emailVerified
            ? "Verified"
            : "Not verified — you can still earn points, but you'll need this to redeem them."}
        </div>
        {!globalAccount.emailVerified && (
          showVerify ? (
            <VerifyCodeCard
              size="inline"
              email={globalAccount.email}
              verify={async (code) => {
                await apiRequest("/api/customer-auth/verify-otp", {
                  method: "POST",
                  body: { email: globalAccount.email, code },
                });
              }}
              resend={resendVerification}
              onVerified={() => {
                toast.success("Email verified!");
                setShowVerify(false);
              }}
            />
          ) : (
            <Button variant="outline" onClick={() => setShowVerify(true)}>
              Verify email
            </Button>
          )
        )}
      </Card>
```

`resendVerification` already exists in this file and already does the right thing (posts to `resend-verification`) — reuse it as-is for the `resend` prop rather than duplicating it. Whatever re-fetches `globalAccount` after verification elsewhere in this component (check how it's currently kept in sync — likely a parent-level query this panel reads from) should also run on `onVerified`; if `globalAccount` comes from a hook this component calls directly, invalidate that hook's query key the same way Step 1 does.

- [ ] **Step 3: `RedeemLanding.tsx`**

Read the full "Verify your email first" block first (`grep -n "Verify your email first" -A 45 frontend/src/routes/RedeemLanding.tsx`). Replace the resend button with the inline card, keeping the surrounding `Shell`/card chrome:

```tsx
      <Shell title="Verify your email first" backTo={tenantPath(companySlug, outletSlug, "dashboard")}>
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-6 shadow-ambient">
          <span
            className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
          >
            <MailWarning className="h-5 w-5" />
          </span>
          <p className="text-sm text-[var(--muted)]">
            Your {formatPoints(balance)} points are safe — we just need to know this email is
            really yours before you spend them.
          </p>
          <div className="mt-5">
            <VerifyCodeCard
              size="inline"
              email={globalAccount.email}
              verify={async (code) => {
                await apiRequest("/api/customer-auth/verify-otp", {
                  method: "POST",
                  body: { email: globalAccount.email, code },
                });
              }}
              resend={async () => {
                await apiRequest("/api/customer-auth/resend-verification", {
                  method: "POST",
                  body: { email: globalAccount.email },
                });
              }}
              onVerified={() => {
                toast.success("Verified — you can redeem now.");
                window.location.reload();
              }}
            />
          </div>
        </div>
      </Shell>
```

Reloading on `onVerified` is deliberate here, not lazy: this page's own redeem-catalog data was fetched under the assumption of an unverified account, and a full reload is the simplest way to guarantee the redeem flow re-evaluates from a clean, verified state — check first whether this component already has a lighter-weight refetch path in scope (a `refetch()` from whatever query loaded `balance`/catalog); if one exists, prefer calling that plus dismissing this gate view over a full reload.

- [ ] **Step 4: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Using an unverified seeded/registered customer account (verified via the mock DB's dev email stub log for the code):

1. `CustomerDashboard.tsx`: the unverified banner's "Verify now" opens the inline card in place; entering the correct code (from the backend console's `[email:stub]` log) clears the banner without a page reload.
2. `CustomerProfilePanel.tsx` (customer settings): "Verify email" opens the inline card; correct code flips the card to "Verified".
3. Trigger the redeem gate (attempt to redeem as an unverified customer) on `RedeemLanding.tsx`: the inline card appears in the gate screen; correct code lets the redeem flow continue.

- [ ] **Step 6: Full verification**

```bash
npm test -w backend && npm run lint
```

Expected: full backend chain green, frontend typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/CustomerDashboard.tsx frontend/src/components/customer/CustomerProfilePanel.tsx frontend/src/routes/RedeemLanding.tsx
git commit -m "feat: verify email inline with OTP at the three existing resend spots"
```

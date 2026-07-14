# Epic A — Auth Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email-verification + forgot-password, a required phone field and optional address, and a wired Google sign-in to the tenant-scoped customer auth — no SMS anywhere.

**Architecture:** Email login stays the customer identifier (`{organizationId, email}` unchanged). New `VerificationToken` collection backs email-verify + password-reset. A provider-abstracted `emailService` console-logs links in dev and uses nodemailer in prod. Stamping is soft-gated on `emailVerified`. Google users are auto-verified and complete a phone step.

**Tech Stack:** Node/Express, Mongoose (+ in-memory mock in dev), React 19 + Vite + TS, TanStack Query, `@react-oauth/google`, `nodemailer`, `google-auth-library` (already present).

## Global Constraints

- Every loyalty/user query MUST include `organizationId` — tenant isolation is the core invariant.
- Backend layering: `routes/ → controllers/ (thin) → services/ (logic) → models/`. No business logic in controllers.
- Mock DB limits: no `findById` (use `findOne({ _id })`); query operators limited to equality, `$or`, `$lte`, `$gte`; `.populate()` only handles `userId`. Guard expiry in JS, not fancy operators.
- Public auth routes use `resolveTenant` (sets `req.organizationId`). Authed routes take tenant from JWT (`req.user.organizationId`).
- Dev must run with zero config: no SMTP, no Google client id → features degrade gracefully (console-stub email; hidden Google button).
- New deps (approved): backend `nodemailer`; frontend `@react-oauth/google`.
- Tests are plain `node tests/*.js` scripts, self-contained via `tests/helpers/bootServer.js`.

---

### Task 1: User schema — phone, address, emailVerified

**Files:**
- Modify: `backend/models/User.js`
- Modify: `backend/server.js` (seed: set `emailVerified: true`, give demo customer a phone)

**Interfaces:**
- Produces: `User` docs gain `phone: String`, `address: String`, `emailVerified: Boolean`.

- [ ] **Step 1: Add fields to the schema**

In `backend/models/User.js`, add inside the schema object (after `password`):

```js
  phone: {
    type: String,
    trim: true,
    default: "",
    // Required for customers only; enforced again in authService for the mock DB
    // (which does not run validators).
    required: function () {
      return this.role === "customer";
    }
  },
  address: { type: String, trim: true, default: "" },
  emailVerified: { type: Boolean, default: false },
```

- [ ] **Step 2: Mark seeded accounts verified + give the demo customer a phone**

In `backend/server.js` `seedDemoData()`, add `emailVerified: true` to each `User.create({...})` call (platform admin, business admin, demo customer). On the demo customer `User.create`, also add `phone: "+9779800000000"`.

- [ ] **Step 3: Sanity boot**

Run: `cd backend && MONGODB_URI= node -e "require('./server.js')" & sleep 2; curl -s localhost:5001/ ; kill %1`
Expected: health responds `200`; `[seed] Customer: customer@mansarowar.cafe` logged with no error.

- [ ] **Step 4: Commit**

```bash
git add backend/models/User.js backend/server.js
git commit -m "feat(auth): add phone/address/emailVerified to User schema + seed"
```

---

### Task 2: VerificationToken model

**Files:**
- Create: `backend/models/VerificationToken.js`

**Interfaces:**
- Produces: `VerificationToken` model with fields `{ organizationId, userId, type, tokenHash, expiresAt, usedAt }`.

- [ ] **Step 1: Write the model**

```js
const mongoose = require("mongoose");

// Backs email verification and password reset. Tenant-scoped. Looked up by
// tokenHash equality so the in-memory mock DB can serve it. Single-use via usedAt.
const VerificationTokenSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["email_verify", "password_reset"], required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("VerificationToken", VerificationTokenSchema);
```

- [ ] **Step 2: Commit**

```bash
git add backend/models/VerificationToken.js
git commit -m "feat(auth): add VerificationToken model"
```

---

### Task 3: emailService (console-stub + nodemailer) + link builder

**Files:**
- Create: `backend/services/emailService.js`
- Modify: `backend/package.json` (add `nodemailer`)

**Interfaces:**
- Produces:
  - `sendEmail({ to, subject, html }): Promise<{ ok: boolean, stubbed?: boolean }>`
  - `buildAuthLink({ slug, path, token }): string` where `path` is `"verify-email"` or `"reset-password"`.

- [ ] **Step 1: Install nodemailer**

Run: `cd backend && npm install nodemailer`
Expected: `nodemailer` appears in `backend/package.json` dependencies.

- [ ] **Step 2: Write the service**

```js
const nodemailer = require("nodemailer");

const APP_BASE_URL = () => process.env.APP_BASE_URL || "http://localhost:3000";

// Compose a tenant-scoped link, e.g. http://localhost:3000/coffesarowar/verify-email?token=...
const buildAuthLink = ({ slug, path, token }) =>
  `${APP_BASE_URL()}/${slug}/${path}?token=${encodeURIComponent(token)}`;

const smtpConfigured = () => Boolean(process.env.SMTP_HOST);

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });
  }
  return transporter;
};

// Single delivery interface. With no SMTP configured (dev), logs the message
// (including any link in the html) and returns stubbed:true so the whole flow
// is testable with zero infrastructure.
const sendEmail = async ({ to, subject, html }) => {
  if (!smtpConfigured()) {
    console.log(`[email:stub] to=${to} subject="${subject}"`);
    console.log(`[email:stub] body=${html}`);
    return { ok: true, stubbed: true };
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || "no-reply@stampd.co",
    to,
    subject,
    html
  });
  return { ok: true };
};

module.exports = { sendEmail, buildAuthLink };
```

- [ ] **Step 3: Verify the stub logs a link**

Run:
```bash
cd backend && node -e "const {sendEmail,buildAuthLink}=require('./services/emailService'); sendEmail({to:'a@b.co',subject:'x',html:buildAuthLink({slug:'coffesarowar',path:'verify-email',token:'T'})}).then(r=>console.log(r))"
```
Expected: prints `[email:stub]` lines containing `coffesarowar/verify-email?token=T` and `{ ok: true, stubbed: true }`.

- [ ] **Step 4: Commit**

```bash
git add backend/services/emailService.js backend/package.json backend/package-lock.json
git commit -m "feat(auth): add emailService with dev console-stub + nodemailer prod path"
```

---

### Task 4: authService — register (phone required) + verifyEmail + resendVerification

**Files:**
- Modify: `backend/services/authService.js`

**Interfaces:**
- Consumes: `sendEmail`, `buildAuthLink` (Task 3); `VerificationToken` (Task 2).
- Produces:
  - `registerUser({ name, email, password, phone, address, organizationId, slug })` — creates unverified customer, issues + sends verify token.
  - `verifyEmail({ token, organizationId })` → `{ success, message }`.
  - `resendVerification({ email, organizationId, slug })` → `{ success, message }` (always success).
  - Internal helpers: `issueToken(user, type, org)` (returns raw token, stores hash), `hashToken(raw)`.
  - `formatAuthPayload` now includes `emailVerified` in `user`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/auth-email-flow.js` with a first case (full file completed in Task 9; start it now):

```js
const assert = require("assert");
const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";
const H = { "Content-Type": "application/json", "X-Tenant-Slug": SLUG };

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5013 });
  let failures = 0;
  const check = (name, cond) => { if (cond) console.log(`PASS ${name}`); else { console.error(`FAIL ${name}`); failures++; } };

  try {
    const email = `verify_${Date.now()}@test.co`;
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "V", email, password: "password", phone: "+9779812345678" })
    });
    const regBody = await reg.json();
    check("register returns success", reg.status === 201 && regBody.success === true);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: H, body: JSON.stringify({ email, password: "password" })
    });
    const loginBody = await login.json();
    check("login ok, emailVerified false", login.status === 200 && loginBody.user.emailVerified === false);
  } finally {
    stop();
  }
  if (failures) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && node tests/auth-email-flow.js`
Expected: FAIL — register 400 (phone not handled yet) or `emailVerified` undefined.

- [ ] **Step 3: Implement register + verify + resend**

In `backend/services/authService.js`, add near the top:

```js
const crypto = require("crypto");
const VerificationToken = require("../models/VerificationToken");
const { sendEmail, buildAuthLink } = require("./emailService");

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const issueToken = async (user, type, organizationId) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const ttl = type === "email_verify" ? VERIFY_TTL_MS : RESET_TTL_MS;
  await VerificationToken.create({
    organizationId,
    userId: user._id,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttl),
    usedAt: null
  });
  return raw;
};

const sendVerifyEmail = async (user, organizationId, slug) => {
  const raw = await issueToken(user, "email_verify", organizationId);
  const link = buildAuthLink({ slug, path: "verify-email", token: raw });
  await sendEmail({
    to: user.email,
    subject: "Verify your email",
    html: `<p>Confirm your email to start collecting stamps:</p><p><a href="${link}">${link}</a></p>`
  });
};
```

Update `formatAuthPayload`'s returned `user` object to add `emailVerified: user.emailVerified`.

Replace `registerUser` with:

```js
const registerUser = async ({ name, email, password, phone, address, organizationId, slug }) => {
  if (!name || !email || !password) {
    throw createHttpError("Name, email, and password are required.", 400);
  }
  if (!phone || !phone.trim()) {
    throw createHttpError("Phone number is required.", 400);
  }
  if (!organizationId) {
    throw createHttpError("A business context is required to register.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await User.findOne({ organizationId, email: normalizedEmail });
  if (existingUser) {
    throw createHttpError("Email is already registered.", 409);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const createdUser = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone.trim(),
    address: (address || "").trim(),
    organizationId,
    role: "customer",
    emailVerified: false
  });

  await ensureUserStampCard(createdUser._id, organizationId);
  await sendVerifyEmail(createdUser, organizationId, slug);

  return { success: true, message: "Registered. Check your email to verify your account." };
};
```

Add:

```js
const verifyEmail = async ({ token, organizationId }) => {
  if (!token) throw createHttpError("Verification token is required.", 400);

  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: "email_verify",
    usedAt: null
  });
  if (!record || record.organizationId.toString() !== organizationId) {
    throw createHttpError("This verification link is invalid or has already been used.", 400);
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This verification link has expired.", 400);
  }

  const user = await User.findOne({ _id: record.userId, organizationId });
  if (!user) throw createHttpError("Account not found.", 404);

  user.emailVerified = true;
  await user.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Email verified. You can now collect stamps." };
};

const resendVerification = async ({ email, organizationId, slug }) => {
  if (email && organizationId) {
    const user = await User.findOne({ organizationId, email: normalizeEmail(email) });
    if (user && !user.emailVerified) {
      await sendVerifyEmail(user, organizationId, slug);
    }
  }
  // Never reveal whether the email exists.
  return { success: true, message: "If that account exists and is unverified, a new link was sent." };
};
```

Add `verifyEmail`, `resendVerification` to `module.exports`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node tests/auth-email-flow.js`
Expected: `PASS register returns success`, `PASS login ok, emailVerified false`.

- [ ] **Step 5: Commit**

```bash
git add backend/services/authService.js backend/tests/auth-email-flow.js
git commit -m "feat(auth): register with required phone + email verification issue/verify/resend"
```

---

### Task 5: authService — forgotPassword + resetPassword

**Files:**
- Modify: `backend/services/authService.js`

**Interfaces:**
- Consumes: `issueToken`, `hashToken`, `sendEmail`, `buildAuthLink` (Task 4).
- Produces:
  - `forgotPassword({ email, organizationId, slug })` → `{ success, message }` (always success).
  - `resetPassword({ token, password, organizationId })` → `{ success, message }`.

- [ ] **Step 1: Implement both**

```js
const forgotPassword = async ({ email, organizationId, slug }) => {
  if (email && organizationId) {
    const user = await User.findOne({ organizationId, email: normalizeEmail(email) });
    if (user) {
      const raw = await issueToken(user, "password_reset", organizationId);
      const link = buildAuthLink({ slug, path: "reset-password", token: raw });
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p>`
      });
    }
  }
  return { success: true, message: "If that account exists, a reset link was sent." };
};

const resetPassword = async ({ token, password, organizationId }) => {
  if (!token || !password) throw createHttpError("Token and new password are required.", 400);

  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    type: "password_reset",
    usedAt: null
  });
  if (!record || record.organizationId.toString() !== organizationId) {
    throw createHttpError("This reset link is invalid or has already been used.", 400);
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw createHttpError("This reset link has expired.", 400);
  }

  const user = await User.findOne({ _id: record.userId, organizationId });
  if (!user) throw createHttpError("Account not found.", 404);

  user.password = await bcrypt.hash(password, SALT_ROUNDS);
  await user.save();
  record.usedAt = new Date();
  await record.save();

  return { success: true, message: "Password updated. You can now log in." };
};
```

Add both to `module.exports`.

- [ ] **Step 2: Extend the test with a reset case**

In `backend/tests/auth-email-flow.js`, this is covered by the completed test in Task 9. For now run the existing suite to ensure no regression:

Run: `cd backend && node tests/auth-email-flow.js`
Expected: existing cases still PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/services/authService.js
git commit -m "feat(auth): forgot-password + reset-password by email token"
```

---

### Task 6: authService — Google needsPhone + completeProfile

**Files:**
- Modify: `backend/services/authService.js`

**Interfaces:**
- Produces:
  - `authenticateWithGoogle(...)` payload now includes `needsPhone: boolean` (true when the user has no `phone`).
  - `completeProfile({ userId, organizationId, phone, address })` → `formatAuthPayload`-shaped `{ success, token, user }`.

- [ ] **Step 1: Make Google users auto-verified + signal needsPhone**

In `authenticateWithGoogle`, on the new-user `User.create({...})`, add `emailVerified: true`. Change the two `return formatAuthPayload(user);` sites to attach `needsPhone`:

```js
const payloadOut = formatAuthPayload(user);
payloadOut.needsPhone = !user.phone;
return payloadOut;
```

(Apply to both the new-user branch and the existing-user branch.)

- [ ] **Step 2: Add completeProfile**

```js
const completeProfile = async ({ userId, organizationId, phone, address }) => {
  if (!phone || !phone.trim()) throw createHttpError("Phone number is required.", 400);
  const user = await User.findOne({ _id: userId, organizationId });
  if (!user) throw createHttpError("Account not found.", 404);
  user.phone = phone.trim();
  if (address !== undefined) user.address = (address || "").trim();
  await user.save();
  return formatAuthPayload(user);
};
```

Add `completeProfile` to `module.exports`.

- [ ] **Step 3: Commit**

```bash
git add backend/services/authService.js
git commit -m "feat(auth): google auto-verify + needsPhone flag + completeProfile"
```

---

### Task 7: Soft-gate stamping on emailVerified

**Files:**
- Modify: `backend/services/stampService.js`

**Interfaces:**
- Consumes: `User` model.
- Produces: `claimStamp` rejects unverified customers with 403 before consuming a token.

- [ ] **Step 1: Add the verification guard**

In `backend/services/stampService.js`, add `const User = require("../models/User");` to the requires. In `claimStamp`, right after the `role !== "customer"` check (line ~88), add:

```js
  const claimer = await User.findOne({ _id: userId, organizationId });
  if (!claimer) {
    throw createHttpError("Account not found.", 404);
  }
  if (claimer.emailVerified === false) {
    throw createHttpError("Please verify your email before collecting stamps.", 403);
  }
```

- [ ] **Step 2: Add a gate test case placeholder run**

Run: `cd backend && npm test`
Expected: existing integration/isolation suites still green (seeded demo customer is `emailVerified:true`, so its claims still pass).

- [ ] **Step 3: Commit**

```bash
git add backend/services/stampService.js
git commit -m "feat(auth): block stamp claims until customer email verified"
```

---

### Task 8: Controllers + routes for new endpoints

**Files:**
- Modify: `backend/controllers/authController.js`
- Modify: `backend/routes/authRoutes.js`

**Interfaces:**
- Consumes: all authService exports (Tasks 4–6); `verifyToken` middleware; `resolveTenant` middleware.
- Produces routes: `POST /register` (now w/ phone/address/slug), `GET /verify-email`, `POST /resend-verification`, `POST /forgot-password`, `POST /reset-password`, `POST /complete-profile` (authed).

- [ ] **Step 1: Update the controller**

Rewrite `backend/controllers/authController.js`:

```js
const {
  registerUser, loginUser, authenticateWithGoogle,
  verifyEmail, resendVerification, forgotPassword, resetPassword, completeProfile
} = require("../services/authService");

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, address } = req.body;
    const result = await registerUser({
      name, email, password, phone, address,
      organizationId: req.organizationId, slug: req.organization.slug
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser({ email, password, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

const googleAuth = async (req, res, next) => {
  try {
    const result = await authenticateWithGoogle({ idToken: req.body.idToken, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

const verifyEmailController = async (req, res, next) => {
  try {
    const result = await verifyEmail({ token: req.query.token, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

const resendVerificationController = async (req, res, next) => {
  try {
    const result = await resendVerification({ email: req.body.email, organizationId: req.organizationId, slug: req.organization.slug });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

const forgotPasswordController = async (req, res, next) => {
  try {
    const result = await forgotPassword({ email: req.body.email, organizationId: req.organizationId, slug: req.organization.slug });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

const resetPasswordController = async (req, res, next) => {
  try {
    const result = await resetPassword({ token: req.body.token, password: req.body.password, organizationId: req.organizationId });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

const completeProfileController = async (req, res, next) => {
  try {
    const result = await completeProfile({
      userId: req.user.id, organizationId: req.user.organizationId,
      phone: req.body.phone, address: req.body.address
    });
    res.status(200).json(result);
  } catch (error) { next(error); }
};

module.exports = {
  register, login, googleAuth,
  verifyEmail: verifyEmailController,
  resendVerification: resendVerificationController,
  forgotPassword: forgotPasswordController,
  resetPassword: resetPasswordController,
  completeProfile: completeProfileController
};
```

- [ ] **Step 2: Wire the routes**

Rewrite `backend/routes/authRoutes.js`:

```js
const express = require("express");
const {
  register, login, googleAuth,
  verifyEmail, resendVerification, forgotPassword, resetPassword, completeProfile
} = require("../controllers/authController");
const { resolveTenant } = require("../middleware/tenantMiddleware");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", resolveTenant, register);
router.post("/login", resolveTenant, login);
router.post("/google", resolveTenant, googleAuth);
router.get("/verify-email", resolveTenant, verifyEmail);
router.post("/resend-verification", resolveTenant, resendVerification);
router.post("/forgot-password", resolveTenant, forgotPassword);
router.post("/reset-password", resolveTenant, resetPassword);
router.post("/complete-profile", verifyToken, completeProfile);

module.exports = router;
```

- [ ] **Step 3: Smoke test the wiring**

Run: `cd backend && node tests/auth-email-flow.js`
Expected: register + login cases PASS (they hit the new controller path).

- [ ] **Step 4: Commit**

```bash
git add backend/controllers/authController.js backend/routes/authRoutes.js
git commit -m "feat(auth): controllers + routes for verify/resend/forgot/reset/complete-profile"
```

---

### Task 9: Complete the backend end-to-end test

**Files:**
- Modify: `backend/tests/auth-email-flow.js`
- Modify: `backend/package.json` (add to `test` script)

**Interfaces:**
- Consumes: all endpoints from Task 8; `VerificationToken` (to fetch a raw token, tests mint it via the service directly).

- [ ] **Step 1: Replace the test with the full suite**

The endpoints never expose the raw token, so the test drives verification by generating the token through the service and reading the console-stubbed link is not machine-readable. Instead, import the model + service directly in-process to mint a known token, then hit the HTTP endpoint. Replace `backend/tests/auth-email-flow.js`:

```js
const assert = require("assert");
const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";
const H = { "Content-Type": "application/json", "X-Tenant-Slug": SLUG };

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5013 });
  let failures = 0;
  const check = (name, cond) => { if (cond) console.log(`PASS ${name}`); else { console.error(`FAIL ${name}`); failures++; } };
  const post = (path, body, headers = H) =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });

  try {
    // 1. Register requires phone
    const noPhone = await post("/api/auth/register", { name: "N", email: `np_${Date.now()}@t.co`, password: "password" });
    check("register without phone -> 400", noPhone.status === 400);

    // 2. Register succeeds, login shows unverified
    const email = `v_${Date.now()}@t.co`;
    const reg = await post("/api/auth/register", { name: "V", email, password: "password", phone: "+9779812345678" });
    check("register -> 201", reg.status === 201);
    const login1 = await (await post("/api/auth/login", { email, password: "password" })).json();
    check("login emailVerified false", login1.user && login1.user.emailVerified === false);

    // 3. Unverified customer cannot claim a stamp
    const genAdmin = await (await post("/api/auth/login", { email: "barista@mansarowar.cafe", password: "password" })).json();
    // barista is business_admin; generate a QR
    const gen = await fetch(`${baseUrl}/api/admin/generate-qr`, { method: "POST", headers: { ...H, Authorization: `Bearer ${genAdmin.token}` } });
    const genBody = await gen.json();
    const claimUnverified = await fetch(`${baseUrl}/api/stamps/claim`, {
      method: "POST", headers: { ...H, Authorization: `Bearer ${login1.token}` },
      body: JSON.stringify({ token: genBody.data.token })
    });
    check("unverified claim -> 403", claimUnverified.status === 403);

    // 4. Verify email via a minted token (dev test-hook), then claim works
    const rawToken = await mint(baseUrl, email, "email_verify");
    const verify = await fetch(`${baseUrl}/api/auth/verify-email?token=${rawToken}`, { headers: H });
    check("verify-email -> 200", verify.status === 200);
    const login2 = await (await post("/api/auth/login", { email, password: "password" })).json();
    check("login emailVerified true after verify", login2.user.emailVerified === true);

    // 5. Used token rejected on reuse
    const verifyReuse = await fetch(`${baseUrl}/api/auth/verify-email?token=${rawToken}`, { headers: H });
    check("used token rejected on reuse", verifyReuse.status === 400);

    // 6. Forgot + reset password
    await post("/api/auth/forgot-password", { email });
    const rawReset = await mint(baseUrl, email, "password_reset");
    const reset = await post("/api/auth/reset-password", { token: rawReset, password: "newpass123" });
    check("reset-password -> 200", reset.status === 200);
    const loginOld = await post("/api/auth/login", { email, password: "password" });
    check("old password rejected", loginOld.status === 401);
    const loginNew = await post("/api/auth/login", { email, password: "newpass123" });
    check("new password accepted", loginNew.status === 200);
  } finally {
    stop();
  }
  if (failures) process.exitCode = 1;
  else console.log("auth-email-flow: all PASS");
}

// The server runs as a child process, so the test cannot reach its mock DB
// directly. A dev-only test hook (mounted only when MONGODB_URI is unset)
// mints a raw token for an email. It resolves the tenant from the X-Tenant-Slug
// header, so no org id needs to be passed.
async function mint(baseUrl, email, type) {
  const res = await fetch(`${baseUrl}/__test__/mint-token`, {
    method: "POST", headers: H, body: JSON.stringify({ email, type })
  });
  const body = await res.json();
  return body.token;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
```

> Note: because the server runs as a child process, the test cannot reach into its DB. Add a **dev-only** mint-token hook (Step 2) that returns a raw token for a given email — mounted only when `MONGODB_URI` is unset (i.e., mock DB / dev), never in production.

- [ ] **Step 2: Add a dev-only test hook**

Create `backend/routes/testHookRoutes.js`:

```js
const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const VerificationToken = require("../models/VerificationToken");
const { resolveTenant } = require("../middleware/tenantMiddleware");

const router = express.Router();

// DEV/TEST ONLY. Mints a raw verification/reset token for an email so
// self-contained tests can drive the flow without reading email. Never mounted
// in production (see server.js guard).
router.post("/mint-token", resolveTenant, async (req, res, next) => {
  try {
    const { email, type } = req.body;
    const user = await User.findOne({ organizationId: req.organizationId, email: String(email).toLowerCase() });
    if (!user) return res.status(404).json({ success: false });
    const raw = crypto.randomBytes(32).toString("hex");
    await VerificationToken.create({
      organizationId: req.organizationId, userId: user._id, type,
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 3600 * 1000), usedAt: null
    });
    res.json({ success: true, token: raw });
  } catch (e) { next(e); }
});

module.exports = router;
```

In `backend/server.js`, mount it only in dev (mock DB), before the error handler:

```js
if (!process.env.MONGODB_URI) {
  app.use("/__test__", require("./routes/testHookRoutes"));
}
```

- [ ] **Step 3: Add the suite to npm test**

In `backend/package.json`, change the `test` script to append the new suite:

```
"test": "node tests/integration-qa.js && node tests/run-voucher-test.js && node tests/multi-tenant-isolation.js && node tests/auth-email-flow.js",
```

- [ ] **Step 4: Run the full suite**

Run: `cd backend && node tests/auth-email-flow.js`
Expected: `auth-email-flow: all PASS`.

Run: `cd backend && npm test`
Expected: all suites green, exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/auth-email-flow.js backend/routes/testHookRoutes.js backend/server.js backend/package.json
git commit -m "test(auth): end-to-end email-verify + reset + gate + tenant-isolation suite"
```

---

### Task 10: Frontend auth context — emailVerified + register signature

**Files:**
- Modify: `frontend/src/context/CustomerAuthContext.tsx`

**Interfaces:**
- Produces:
  - `User` gains `emailVerified: boolean`.
  - `registerUser(name, email, password, phone, address?)` new signature.
  - New context methods: `loginWithGoogle(idToken): Promise<{ needsPhone: boolean }>`, `completeProfile(phone, address?): Promise<void>`, `refreshUser()` optional. Minimum: add `setSession(token, user)` used by Google + reset flows.

- [ ] **Step 1: Update the User type + register**

In `frontend/src/context/CustomerAuthContext.tsx`, extend the interface:

```ts
export interface User {
  id: string;
  name: string;
  role: "customer" | "business_admin" | "platform";
  emailVerified?: boolean;
}
```

Change `registerUser` signature + body:

```ts
  const registerUser = async (
    name: string, email: string, password: string, phone: string, address?: string
  ) => {
    setIsLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>("/api/auth/register", {
        method: "POST",
        body: { name, email, password, phone, address },
      });
      if (!res.success) throw new Error(res.message || "Failed to register.");
    } finally {
      setIsLoading(false);
    }
  };
```

- [ ] **Step 2: Add Google + completeProfile + session helpers**

Add inside the provider:

```ts
  const persist = (t: string, u: User) => {
    localStorage.setItem("customer_auth_token", t);
    localStorage.setItem("customer_auth_user", JSON.stringify(u));
    setToken(t); setUser(u);
  };

  const loginWithGoogle = async (idToken: string) => {
    const res = await apiRequest<{ success: boolean; token: string; user: User; needsPhone: boolean }>(
      "/api/auth/google", { method: "POST", body: { idToken } });
    if (!res.success || !res.token) throw new Error("Google sign-in failed.");
    persist(res.token, res.user);
    return { needsPhone: Boolean(res.needsPhone) };
  };

  const completeProfile = async (phone: string, address?: string) => {
    const res = await apiRequest<{ success: boolean; token: string; user: User }>(
      "/api/auth/complete-profile", { method: "POST", body: { phone, address } });
    if (!res.success) throw new Error("Could not save your details.");
    persist(res.token, res.user);
  };
```

Update the `login` method to use `persist(res.token, res.user)` instead of the inline localStorage/set calls. Add `loginWithGoogle`, `completeProfile` to the context type + provider value.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors only where `registerUser` old signature is still called (fixed in Task 12) — note them; no errors in this file.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/CustomerAuthContext.tsx
git commit -m "feat(auth-fe): emailVerified on user, phone in register, google + completeProfile"
```

---

### Task 11: Register screen — phone + address + resend

**Files:**
- Modify: `frontend/src/routes/CustomerRegister.tsx`

**Interfaces:**
- Consumes: `registerUser(name,email,password,phone,address?)` (Task 10).

- [ ] **Step 1: Add phone + address fields and success state**

In `frontend/src/routes/CustomerRegister.tsx`, add form state `phone` and `address`, and a `submitted` boolean. Phone input uses a fixed `+977` prefix chip and a 10-digit numeric local part; assemble `+977` + local (strip leading 0) on submit. On success set `submitted=true`.

```tsx
const [phone, setPhone] = useState("");     // local digits only
const [address, setAddress] = useState("");
const [submitted, setSubmitted] = useState(false);

const onSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const local = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (local.length < 7) { toast.error("Enter a valid phone number."); return; }
  try {
    await registerUser(name, email, password, `+977${local}`, address);
    setSubmitted(true);
  } catch (err) {
    toast.error((err as Error).message || "Failed to register.");
  }
};
```

Add the fields to the form (match existing input styling):

```tsx
<label className="block text-sm font-semibold">Phone</label>
<div className="flex items-center rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3">
  <span className="text-sm text-[var(--soft)]">+977</span>
  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric"
    placeholder="98XXXXXXXX" className="flex-1 bg-transparent px-2 py-3 text-sm focus:outline-none" required />
</div>

<label className="block text-sm font-semibold">Address <span className="text-[var(--soft)]">(optional)</span></label>
<textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2}
  className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none" />
```

- [ ] **Step 2: Add the "check your email" success panel**

When `submitted`, render instead of the form:

```tsx
if (submitted) {
  return (
    <div className="mx-auto max-w-sm p-6 text-center">
      <h2 className="font-display text-xl font-bold">Check your email</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        We sent a verification link to <b>{email}</b>. Open it to start collecting stamps.
      </p>
      <button
        onClick={async () => {
          await apiRequest("/api/auth/resend-verification", { method: "POST", body: { email } });
          toast.success("Verification email resent.");
        }}
        className="mt-4 text-sm font-bold" style={{ color: "var(--brand)" }}>
        Resend email
      </button>
      <div className="mt-4">
        <Link to={`/${slug}/login`} className="text-sm underline">Go to login</Link>
      </div>
    </div>
  );
}
```

Ensure `apiRequest`, `toast`, `Link`, and `slug` (from `useParams`) are imported/available.

- [ ] **Step 3: Typecheck + visual**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors in this file (register signature now matches Task 10).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/CustomerRegister.tsx
git commit -m "feat(auth-fe): registration collects phone + address, shows verify-email panel"
```

---

### Task 12: verify-email + forgot-password + reset-password screens

**Files:**
- Create: `frontend/src/routes/VerifyEmail.tsx`
- Create: `frontend/src/routes/ForgotPassword.tsx`
- Create: `frontend/src/routes/ResetPassword.tsx`
- Modify: `frontend/src/App.tsx` (routes under `/:slug`)

**Interfaces:**
- Consumes: `apiRequest`; `useParams`/`useSearchParams` from react-router-dom.

- [ ] **Step 1: VerifyEmail screen**

```tsx
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiRequest } from "../lib/api";

export default function VerifyEmail() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) { setState("error"); setMsg("Missing verification token."); return; }
    apiRequest<{ success: boolean; message: string }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => { setState("ok"); setMsg(r.message); })
      .catch((e) => { setState("error"); setMsg((e as Error).message || "Verification failed."); });
  }, [params]);

  return (
    <div className="mx-auto max-w-sm p-8 text-center">
      {state === "loading" && <p className="text-sm text-[var(--muted)]">Verifying…</p>}
      {state !== "loading" && (
        <>
          <h2 className="font-display text-xl font-bold">{state === "ok" ? "Email verified" : "Verification failed"}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{msg}</p>
          <Link to={`/${slug}/login`} className="mt-4 inline-block text-sm font-bold" style={{ color: "var(--brand)" }}>
            Continue to login
          </Link>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ForgotPassword screen**

```tsx
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../lib/api";

export default function ForgotPassword() {
  const { slug } = useParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email } });
    setSent(true);
  };

  return (
    <div className="mx-auto max-w-sm p-8">
      <h2 className="font-display text-xl font-bold">Reset your password</h2>
      {sent ? (
        <p className="mt-3 text-sm text-[var(--muted)]">If that account exists, a reset link was sent to {email}.</p>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none" />
          <button className="rounded-[12px] py-3 font-bold text-white" style={{ background: "var(--brand)" }}>
            Send reset link
          </button>
        </form>
      )}
      <Link to={`/${slug}/login`} className="mt-4 inline-block text-sm underline">Back to login</Link>
    </div>
  );
}
```

- [ ] **Step 3: ResetPassword screen**

```tsx
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { apiRequest } from "../lib/api";

export default function ResetPassword() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    const token = params.get("token");
    try {
      await apiRequest("/api/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success("Password updated. Please log in.");
      navigate(`/${slug}/login`);
    } catch (err) {
      toast.error((err as Error).message || "Reset failed.");
    }
  };

  return (
    <div className="mx-auto max-w-sm p-8">
      <h2 className="font-display text-xl font-bold">Choose a new password</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none" />
        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none" />
        <button className="rounded-[12px] py-3 font-bold text-white" style={{ background: "var(--brand)" }}>
          Update password
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Register routes**

In `frontend/src/App.tsx`, add lazy imports next to the other customer imports:

```tsx
const VerifyEmail = lazy(() => import('./routes/VerifyEmail'));
const ForgotPassword = lazy(() => import('./routes/ForgotPassword'));
const ResetPassword = lazy(() => import('./routes/ResetPassword'));
```

Add inside the `<Route path="/:slug" element={<TenantScope />}>` block, next to `login`/`register`:

```tsx
<Route path="verify-email" element={<VerifyEmail />} />
<Route path="forgot-password" element={<ForgotPassword />} />
<Route path="reset-password" element={<ResetPassword />} />
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/VerifyEmail.tsx frontend/src/routes/ForgotPassword.tsx frontend/src/routes/ResetPassword.tsx frontend/src/App.tsx
git commit -m "feat(auth-fe): verify-email, forgot-password, reset-password screens + routes"
```

---

### Task 13: Google sign-in button + post-Google phone step

**Files:**
- Modify: `frontend/package.json` (add `@react-oauth/google`)
- Modify: `frontend/src/App.tsx` (wrap customer subtree in `GoogleOAuthProvider`)
- Modify: `frontend/src/routes/CustomerLogin.tsx` (Google button + forgot link)
- Create: `frontend/src/components/customer/PhoneStepModal.tsx`

**Interfaces:**
- Consumes: `loginWithGoogle`, `completeProfile` (Task 10); `VITE_GOOGLE_CLIENT_ID` env.

- [ ] **Step 1: Install the package**

Run: `cd frontend && npm install @react-oauth/google`
Expected: dependency added to `frontend/package.json`.

- [ ] **Step 2: Wrap the tenant subtree conditionally**

In `frontend/src/App.tsx`, import:

```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';
```

Wrap `TenantScope`'s provider tree. Update `TenantScope`:

```tsx
function TenantScope() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const tree = (
    <TenantProvider>
      <Outlet />
    </TenantProvider>
  );
  return clientId ? <GoogleOAuthProvider clientId={clientId}>{tree}</GoogleOAuthProvider> : tree;
}
```

- [ ] **Step 3: PhoneStepModal**

```tsx
import { useState } from "react";
import toast from "react-hot-toast";
import { useCustomerAuth } from "../../context/CustomerAuthContext";

export function PhoneStepModal({ onDone }: { onDone: () => void }) {
  const { completeProfile } = useCustomerAuth();
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const local = phone.replace(/\D/g, "").replace(/^0+/, "");
    if (local.length < 7) { toast.error("Enter a valid phone number."); return; }
    setBusy(true);
    try { await completeProfile(`+977${local}`, address); onDone(); }
    catch (e) { toast.error((e as Error).message || "Could not save."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[18px] bg-[var(--surface)] p-6">
        <h3 className="font-display text-lg font-bold">One more thing</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">Add your phone number to finish.</p>
        <div className="mt-4 flex items-center rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3">
          <span className="text-sm text-[var(--soft)]">+977</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric"
            placeholder="98XXXXXXXX" className="flex-1 bg-transparent px-2 py-3 text-sm focus:outline-none" />
        </div>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Address (optional)"
          className="mt-3 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:outline-none" />
        <button disabled={busy} onClick={save}
          className="mt-4 w-full rounded-[12px] py-3 font-bold text-white disabled:opacity-50" style={{ background: "var(--brand)" }}>
          {busy ? "Saving…" : "Finish"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add Google button + forgot link to login**

In `frontend/src/routes/CustomerLogin.tsx`, import:

```tsx
import { GoogleLogin } from "@react-oauth/google";
import { PhoneStepModal } from "../components/customer/PhoneStepModal";
import { useCustomerAuth } from "../context/CustomerAuthContext";
```

Add state `const [showPhone, setShowPhone] = useState(false);` and pull `loginWithGoogle` from `useCustomerAuth()`. Render below the login form (only if `VITE_GOOGLE_CLIENT_ID` is set):

```tsx
{import.meta.env.VITE_GOOGLE_CLIENT_ID && (
  <div className="mt-4">
    <GoogleLogin
      onSuccess={async (cred) => {
        if (!cred.credential) return;
        try {
          const { needsPhone } = await loginWithGoogle(cred.credential);
          if (needsPhone) setShowPhone(true);
          else navigate(`/${slug}/dashboard`);
        } catch (e) { toast.error((e as Error).message || "Google sign-in failed."); }
      }}
      onError={() => toast.error("Google sign-in failed.")}
    />
  </div>
)}
{showPhone && <PhoneStepModal onDone={() => navigate(`/${slug}/dashboard`)} />}
```

Add a forgot-password link near the submit button:

```tsx
<Link to={`/${slug}/forgot-password`} className="text-xs underline text-[var(--muted)]">Forgot password?</Link>
```

Ensure `navigate` (`useNavigate`), `slug` (`useParams`), `toast`, `Link` are available.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/App.tsx frontend/src/routes/CustomerLogin.tsx frontend/src/components/customer/PhoneStepModal.tsx
git commit -m "feat(auth-fe): Google sign-in button + post-Google phone step + forgot link"
```

---

### Task 14: Verify interstitial + scan gating on dashboard

**Files:**
- Modify: `frontend/src/routes/CustomerDashboard.tsx`

**Interfaces:**
- Consumes: `user.emailVerified` (Task 10); `apiRequest` for resend.

- [ ] **Step 1: Add the banner + gate**

In `frontend/src/routes/CustomerDashboard.tsx`, read `const { user } = useCustomerAuth();`. When `user && user.emailVerified === false`, render a banner above the card and disable the scan entrypoint:

```tsx
{user?.emailVerified === false && (
  <div className="mb-4 rounded-[14px] border border-[var(--warn-soft)] bg-[var(--warn-soft)] px-4 py-3 text-sm" style={{ color: "var(--warn)" }}>
    Verify your email to start collecting stamps.
    <button
      onClick={async () => {
        await apiRequest("/api/auth/resend-verification", { method: "POST", body: { email: /* user email */ "" } });
        toast.success("Verification email resent.");
      }}
      className="ml-2 font-bold underline">Resend</button>
  </div>
)}
```

Because the stored `user` object does not include email, add `email` to the auth payload: in backend `formatAuthPayload` add `email: user.email` to the returned `user`, and add `email?: string` to the frontend `User` interface (Task 10 file). Then use `user?.email` above.

Gate the scan button: when unverified, disable it (`disabled` + reduced opacity) so scanning is blocked client-side (the backend 403 is the real guard).

- [ ] **Step 2: Backend echo of email (small amend)**

In `backend/services/authService.js` `formatAuthPayload`, add `email: user.email` to the `user` object. Re-run `cd backend && node tests/auth-email-flow.js` — expected still all PASS.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/CustomerDashboard.tsx frontend/src/context/CustomerAuthContext.tsx backend/services/authService.js
git commit -m "feat(auth-fe): unverified-email banner + client-side scan gate"
```

---

### Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suites green**

Run: `cd backend && npm test`
Expected: integration-qa, voucher, isolation, auth-email-flow all PASS, exit 0.

- [ ] **Step 2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Browser end-to-end (dev)**

Start dev (`npm run dev`), open `/coffesarowar/register`:
- Register with email + password + phone + address → "Check your email" panel.
- Copy the verify link from the **backend console** (`[email:stub] body=...`), open it → "Email verified".
- Log in → dashboard, no banner, scan enabled.
- Register a second account, log in **without** verifying → banner shows, scan disabled; hit `/api/stamps/claim` → 403.
- `/coffesarowar/forgot-password` → submit → grab reset link from console → set new password → log in with it.
- If `VITE_GOOGLE_CLIENT_ID` is set, Google button appears and post-Google phone modal shows for a new Google user.

- [ ] **Step 4: Commit any final fixes, then finish**

```bash
git add -A
git commit -m "chore(auth): verification pass fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** phone required (Task 1,4,11), address optional (Task 1,11), emailVerified (Task 1), VerificationToken (Task 2), emailService stub+prod (Task 3), register/verify/resend (Task 4,8), forgot/reset (Task 5,8), Google auto-verify+needsPhone+completeProfile (Task 6,8,13), soft-gate stamping (Task 7,14), all endpoints wired (Task 8), tenant-isolation + gate tests (Task 9), frontend context (Task 10), register UI (Task 11), 3 new screens (Task 12), Google button + phone modal (Task 13), interstitial (Task 14), verification (Task 15). No gaps.
- **Type consistency:** `loginWithGoogle → { needsPhone }`, `completeProfile(phone, address?)`, `registerUser(name,email,password,phone,address?)`, `formatAuthPayload.user` = `{ id, name, role, emailVerified, email }` used consistently across Tasks 10–14.
- **Mock-DB safety:** all token lookups use equality + `usedAt: null`; expiry checked in JS; user lookups use `findOne({ _id, organizationId })`.
- **Dev graceful degradation:** no SMTP → console-stub; no `VITE_GOOGLE_CLIENT_ID` → button + provider omitted; test-hook mounted only when `MONGODB_URI` unset.

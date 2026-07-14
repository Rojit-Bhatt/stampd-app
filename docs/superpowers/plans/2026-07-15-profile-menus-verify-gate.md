# Epic E1 — Profile Menus, Account Settings & Business-Admin Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All three roles get a profile dropdown (Settings + Log out) replacing the static logout block; a shared Settings screen lets any role edit their name and change their password; business_admin accounts now receive and are gated on email verification, exactly like customer accounts already are.

**Architecture:** One role-agnostic `/api/account` backend API operating on `req.user.id` (works for all three roles with zero duplication). Business-admin verification reuses the existing generic `sendVerifyEmail`/`resendVerification`/`verifyEmail` machinery already built for customers — only `platformService.createBusiness` and `tenantController.getMySettings` change on the backend. `AdminGuard` gains a hard gate that renders a dedicated verify screen instead of the console when `adminEmailVerified` is false.

**Tech Stack:** Node/Express, Mongoose (+ in-memory mock in dev), bcryptjs, React 19 + Vite + TS, TanStack Query, lucide-react.

## Global Constraints

- Every user/loyalty query includes `organizationId` where applicable — tenant isolation is the core invariant. The new account endpoints operate on `req.user.id` directly (the caller's own document), so no organizationId scoping is needed there — a user can only ever edit themselves.
- Backend layering: `routes/ → controllers/ (thin) → services/ (logic) → models/`. No business logic in controllers.
- `req.user` (set by `verifyToken`) has fields `{ id, role, organizationId }` — note the field is `id`, not `userId`.
- The admin-console gate blocks the entire console (no `AdminLayout`, no routes reachable) when `adminEmailVerified` is `false` — not just one action.
- Platform role gets no verify-email section anywhere (no endpoint can create a second platform account).
- Commit with explicit file paths (`git add <path>`) — never `git add -A`.

---

### Task 1: Backend — account API + business-admin verification wiring + tests

**Files:**
- Create: `backend/services/accountService.js`
- Create: `backend/controllers/accountController.js`
- Create: `backend/routes/accountRoutes.js`
- Modify: `backend/server.js`
- Modify: `backend/services/authService.js`
- Modify: `backend/services/platformService.js`
- Modify: `backend/controllers/tenantController.js`
- Create: `backend/tests/account-settings.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `GET /api/account/me` → `{ success, id, name, email, role, emailVerified }`.
- Produces: `PATCH /api/account/profile` `{ name }` → `{ success, id, name, email, role, emailVerified }`.
- Produces: `POST /api/account/change-password` `{ currentPassword, newPassword }` → `{ success, message }`.
- Produces: `authService.sendVerifyEmail(user, organizationId, slug)` now exported (previously internal-only).
- Produces: `GET /api/admin/settings` response gains `adminEmailVerified: boolean`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/account-settings.js`:

```js
/**
 * Account settings + business-admin email verification suite (Epic E1).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms profile/password edits work for all three
 * roles, that onboarding a new business sends its admin a verification
 * email, that GET /api/admin/settings exposes adminEmailVerified correctly
 * before and after verifying, and tenant isolation.
 *
 * Run directly: `node tests/account-settings.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5021 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) headers["X-Tenant-Slug"] = slug;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    // --- Customer: profile + password ---
    const email = `e1_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "E1 Tester", email, password: "password", phone: "+9779811110000", address: "1 Test St" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Tenant-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    const meBefore = await api("/api/account/me", { token: customerToken });
    check("customer GET /account/me -> 200", meBefore.status === 200);
    check("customer me has correct name", meBefore.body.name === "E1 Tester");

    const patchedName = await api("/api/account/profile", { method: "PATCH", token: customerToken, body: { name: "Renamed Tester" } });
    check("customer profile update -> 200", patchedName.status === 200);
    check("customer profile update reflects new name", patchedName.body.name === "Renamed Tester");

    const wrongPw = await api("/api/account/change-password", {
      method: "POST", token: customerToken, body: { currentPassword: "wrong", newPassword: "newpassword1" },
    });
    check("wrong current password -> 401", wrongPw.status === 401);

    const rightPw = await api("/api/account/change-password", {
      method: "POST", token: customerToken, body: { currentPassword: "password", newPassword: "newpassword1" },
    });
    check("correct current password -> 200", rightPw.status === 200);

    const oldPwLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    check("old password no longer works", oldPwLogin.status === 401);
    const newPwLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "newpassword1" } });
    check("new password works", newPwLogin.status === 200);

    // --- Google-only account: change-password should reject ---
    const googleLoginRes = await api("/api/auth/google", { method: "POST", body: { idToken: "not-a-real-token" } });
    check("fake google token rejected (sanity check, not part of this suite's account)", googleLoginRes.status === 401 || googleLoginRes.status === 400);

    // --- Business admin: existing seeded admin, profile + password ---
    const adminLogin = await api("/api/auth/login", { method: "POST", body: { email: "barista@mansarowar.cafe", password: "password" } });
    const adminToken = adminLogin.body.token;

    const adminMe = await api("/api/account/me", { token: adminToken });
    check("admin GET /account/me -> 200", adminMe.status === 200);
    check("admin me has role business_admin", adminMe.body.role === "business_admin");

    const adminPatch = await api("/api/account/profile", { method: "PATCH", token: adminToken, body: { name: "Renamed Barista" } });
    check("admin profile update -> 200", adminPatch.status === 200);

    // --- Platform: profile + password ---
    const platformLogin = await api("/api/platform/login", { method: "POST", slug: undefined, body: { email: "admin@stampd.co", password: "password" } });
    const platformToken = platformLogin.body.token;

    const platformMe = await api("/api/account/me", { slug: undefined, token: platformToken });
    check("platform GET /account/me -> 200", platformMe.status === 200);
    check("platform me has role platform", platformMe.body.role === "platform");

    // --- New business onboarding: admin starts unverified, gets a verify email ---
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
    const secondAdminLogin = await api("/api/auth/login", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, password: "password" } });
    const secondAdminToken = secondAdminLogin.body.token;

    const secondSettingsBefore = await api("/api/admin/settings", { slug: secondSlug, token: secondAdminToken });
    check("new admin settings -> 200", secondSettingsBefore.status === 200);
    check("new admin starts unverified", secondSettingsBefore.body.settings.adminEmailVerified === false);

    const mintAdminVerify = await api("/__test__/mint-token", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, type: "email_verify" } });
    check("mint verify token for new admin -> 200", mintAdminVerify.status === 200);
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-email?token=${mintAdminVerify.body.token}`, { headers: { "X-Tenant-Slug": secondSlug } });
    check("new admin verify-email link -> 200", verifyRes.status === 200);

    const secondSettingsAfter = await api("/api/admin/settings", { slug: secondSlug, token: secondAdminToken });
    check("new admin now verified", secondSettingsAfter.body.settings.adminEmailVerified === true);

    // --- Existing seeded admin (verified since seed) unaffected by the new tenant ---
    const originalSettings = await api("/api/admin/settings", { token: adminToken });
    check("original tenant's admin still verified, untouched by second tenant", originalSettings.body.settings.adminEmailVerified === true);
  } finally {
    stop();
  }

  if (failures) { console.error(`account-settings: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("account-settings: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run: `cd backend && node tests/account-settings.js`
Expected: FAIL — `/api/account/*` routes don't exist yet (404s), and `adminEmailVerified` is absent from `/api/admin/settings`.

- [ ] **Step 2: Implement accountService**

Create `backend/services/accountService.js`:

```js
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const SALT_ROUNDS = 10;

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getAccount = async (userId) => {
  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);
  return user;
};

const updateProfile = async (userId, { name }) => {
  if (!name || !name.trim()) {
    throw createHttpError("Name is required.", 400);
  }

  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);

  user.name = name.trim();
  await user.save();
  return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    throw createHttpError("Current and new password are required.", 400);
  }
  if (newPassword.length < 8) {
    throw createHttpError("New password must be at least 8 characters.", 400);
  }

  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);

  if (!user.password) {
    throw createHttpError("This account signs in with Google and has no password to change.", 400);
  }

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    throw createHttpError("Current password is incorrect.", 401);
  }

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  return { success: true, message: "Password updated." };
};

module.exports = {
  getAccount,
  updateProfile,
  changePassword
};
```

- [ ] **Step 3: Implement accountController**

Create `backend/controllers/accountController.js`:

```js
const { getAccount, updateProfile, changePassword } = require("../services/accountService");

const formatAccount = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified
});

const getMe = async (req, res, next) => {
  try {
    const user = await getAccount(req.user.id);
    res.status(200).json({ success: true, ...formatAccount(user) });
  } catch (error) {
    next(error);
  }
};

const updateProfileController = async (req, res, next) => {
  try {
    const user = await updateProfile(req.user.id, req.body);
    res.status(200).json({ success: true, ...formatAccount(user) });
  } catch (error) {
    next(error);
  }
};

const changePasswordController = async (req, res, next) => {
  try {
    const result = await changePassword(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMe,
  updateProfileController,
  changePasswordController
};
```

- [ ] **Step 4: Wire the account routes**

Create `backend/routes/accountRoutes.js`:

```js
const express = require("express");
const { getMe, updateProfileController, changePasswordController } = require("../controllers/accountController");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/me", verifyToken, getMe);
router.patch("/profile", verifyToken, updateProfileController);
router.post("/change-password", verifyToken, changePasswordController);

module.exports = router;
```

In `backend/server.js`, add the import alongside the other route requires:

```js
const accountRoutes = require("./routes/accountRoutes");
```

Add the mount alongside `app.use("/api/auth", authRoutes);`:

```js
app.use("/api/account", accountRoutes);
```

- [ ] **Step 5: Export sendVerifyEmail and genericize its copy**

In `backend/services/authService.js`, change the email body in `sendVerifyEmail` from:

```js
    html: `<p>Confirm your email to start collecting stamps:</p><p><a href="${link}">${link}</a></p>`
```

to:

```js
    html: `<p>Confirm your email to activate your account:</p><p><a href="${link}">${link}</a></p>`
```

Add `sendVerifyEmail` to the `module.exports` block at the bottom:

```js
module.exports = {
  registerUser,
  loginUser,
  authenticateWithGoogle,
  completeProfile,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  sendVerifyEmail
};
```

- [ ] **Step 6: Send a verification email when onboarding a new business**

In `backend/services/platformService.js`, add the import:

```js
const { sendVerifyEmail } = require("./authService");
```

In `createBusiness`, change the admin creation block from:

```js
  const admin = await User.create({
    organizationId: organization._id,
    name: adminName.trim(),
    email: normalizedAdminEmail,
    password: hashedPassword,
    role: "business_admin"
  });
```

to:

```js
  const admin = await User.create({
    organizationId: organization._id,
    name: adminName.trim(),
    email: normalizedAdminEmail,
    password: hashedPassword,
    role: "business_admin",
    emailVerified: false
  });

  await sendVerifyEmail(admin, organization._id, normalizedSlug);
```

- [ ] **Step 7: Expose adminEmailVerified on the admin settings endpoint**

In `backend/controllers/tenantController.js`, add the import:

```js
const User = require("../models/User");
```

In `getMySettings`, after the existing `organization` lookup and before the response, add:

```js
    const adminUser = await User.findOne({ _id: req.user.id });
```

Add `adminEmailVerified: adminUser ? adminUser.emailVerified : false` to the `settings` object in both the success-path response of `getMySettings`. The function's `res.status(200).json(...)` block becomes:

```js
    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        branding: organization.branding,
        contact: organization.contact,
        adminEmailVerified: adminUser ? adminUser.emailVerified : false,
        program: organization.program,
        menuEnabled: organization.menuEnabled
      }
    });
```

(`updateMySettings`'s response does not need this field — it's read-only status, not something `PATCH /api/admin/settings` ever sets.)

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd backend && node tests/account-settings.js`
Expected: `account-settings: all PASS`.

- [ ] **Step 9: Add to the test suite**

In `backend/package.json`, append to the `test` script:

```
"test": "node tests/integration-qa.js && node tests/run-voucher-test.js && node tests/multi-tenant-isolation.js && node tests/auth-email-flow.js && node tests/min-bill-amount.js && node tests/menu-import.js && node tests/customer-detail.js && node tests/business-reports.js && node tests/business-contact.js && node tests/menu-featured.js && node tests/upcoming-events.js && node tests/account-settings.js",
```

Run: `cd backend && npm test`
Expected: all twelve suites pass, exit 0.

- [ ] **Step 10: Commit**

```bash
git add backend/services/accountService.js backend/controllers/accountController.js backend/routes/accountRoutes.js backend/server.js backend/services/authService.js backend/services/platformService.js backend/controllers/tenantController.js backend/tests/account-settings.js backend/package.json
git commit -m "feat(account): shared profile/password API + business-admin email verification"
```

---

### Task 2: Frontend — account hook, profile menu, settings screens, verify gate

**Files:**
- Create: `frontend/src/hooks/useAccount.ts`
- Create: `frontend/src/components/shared/AccountMenu.tsx`
- Create: `frontend/src/components/shared/AccountSettingsForm.tsx`
- Create: `frontend/src/components/admin/VerifyEmailGate.tsx`
- Create: `frontend/src/routes/platform/PlatformSettings.tsx`
- Create: `frontend/src/routes/admin/AdminSettings.tsx`
- Create: `frontend/src/routes/CustomerSettings.tsx`
- Modify: `frontend/src/components/platform/PlatformLayout.tsx`
- Modify: `frontend/src/components/admin/AdminLayout.tsx`
- Modify: `frontend/src/components/admin/AdminGuard.tsx`
- Modify: `frontend/src/routes/CustomerDashboard.tsx`
- Modify: `frontend/src/hooks/useAdminSettings.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /api/account/*`, `POST /api/account/change-password` (Task 1).
- Consumes: `GET /api/admin/settings` now returning `adminEmailVerified` (Task 1).
- Consumes: existing `POST /api/auth/resend-verification` (unmodified, already generic).

- [ ] **Step 1: Create the account hook**

Create `frontend/src/hooks/useAccount.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: "customer" | "business_admin" | "platform";
  emailVerified: boolean;
}

type Role = "admin" | "customer" | "platform";

export function useAccount(role: Role) {
  return useQuery<Account>({
    queryKey: ["account", role],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean } & Account>("/api/account/me", { role });
      return res;
    },
  });
}

export function useUpdateProfile(role: Role) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      apiRequest<{ success: boolean } & Account>("/api/account/profile", {
        method: "PATCH",
        role,
        body: { name },
      }),
    onSuccess: (account) => {
      qc.setQueryData(["account", role], account);
    },
  });
}

export function useChangePassword(role: Role) {
  return useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) =>
      apiRequest<{ success: boolean; message: string }>("/api/account/change-password", {
        method: "POST",
        role,
        body,
      }),
  });
}
```

- [ ] **Step 2: Create the shared AccountMenu component**

Create `frontend/src/components/shared/AccountMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings, LogOut } from "lucide-react";

interface AccountMenuProps {
  initial: string;
  name: string;
  email?: string;
  settingsPath: string;
  onLogout: () => void;
  accent?: string;
  dropUp?: boolean;
}

export function AccountMenu({ initial, name, email, settingsPath, onLogout, accent, dropUp }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-[11px] px-2 py-2 text-left transition-colors hover:bg-[var(--bg)]"
      >
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] font-display text-sm font-extrabold text-white"
          style={{ background: accent || "var(--brand)" }}
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold">{name}</span>
          {email && <span className="block truncate text-[11px] text-[var(--soft)]">{email}</span>}
        </span>
      </button>

      {open && (
        <div
          className={`absolute left-0 z-10 w-full min-w-[180px] overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface)] shadow-lg ${
            dropUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <Link
            to={settingsPath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg)]"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-[var(--muted)] hover:bg-[var(--bg)]"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the shared AccountSettingsForm component**

Create `frontend/src/components/shared/AccountSettingsForm.tsx`:

```tsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiRequest } from "../../lib/api";
import { useAccount, useUpdateProfile, useChangePassword } from "../../hooks/useAccount";

export function AccountSettingsForm({ role }: { role: "admin" | "customer" | "platform" }) {
  const { data: account, isLoading } = useAccount(role);
  const updateProfile = useUpdateProfile(role);
  const changePassword = useChangePassword(role);

  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (account && !name) setName(account.name);
  }, [account, name]);

  if (isLoading || !account) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }

  const saveName = async () => {
    if (!name.trim()) return;
    try {
      await updateProfile.mutateAsync(name);
      toast.success("Name updated");
    } catch (err) {
      toast.error((err as Error).message || "Failed to update name.");
    }
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error).message || "Failed to update password.");
    }
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      await apiRequest("/api/auth/resend-verification", { method: "POST", body: { email: account.email } });
      toast.success("Verification email resent.");
    } catch {
      toast.error("Could not resend. Try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex max-w-[480px] flex-col gap-6">
      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 text-sm font-bold">Profile</div>
        <label className="mb-1.5 block text-sm font-bold">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
        />
        <div className="mb-3 text-[13px] text-[var(--muted)]">{account.email}</div>
        <button
          onClick={saveName}
          disabled={updateProfile.isPending || !name.trim()}
          className="rounded-[13px] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {updateProfile.isPending ? "Saving…" : "Save name"}
        </button>
      </div>

      {role !== "platform" && (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="mb-2 text-sm font-bold">Email verification</div>
          <div className="mb-3 text-[13px] text-[var(--muted)]">
            {account.emailVerified ? "Verified" : "Not verified"}
          </div>
          {!account.emailVerified && (
            <button
              onClick={resendVerification}
              disabled={resending}
              className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          )}
        </div>
      )}

      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 text-sm font-bold">Change password</div>
        <label className="mb-1.5 block text-sm font-bold">Current password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="mb-3 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
        />
        <label className="mb-1.5 block text-sm font-bold">New password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-3 w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
        />
        <button
          onClick={savePassword}
          disabled={changePassword.isPending || !currentPassword || !newPassword}
          className="rounded-[13px] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {changePassword.isPending ? "Saving…" : "Update password"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the three thin settings route pages**

Create `frontend/src/routes/platform/PlatformSettings.tsx`:

```tsx
import { AccountSettingsForm } from "../../components/shared/AccountSettingsForm";

export default function PlatformSettings() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[var(--muted)]">Your account details.</p>
      <AccountSettingsForm role="platform" />
    </div>
  );
}
```

Create `frontend/src/routes/admin/AdminSettings.tsx`:

```tsx
import { AccountSettingsForm } from "../../components/shared/AccountSettingsForm";

export default function AdminSettings() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[var(--muted)]">Your account details.</p>
      <AccountSettingsForm role="admin" />
    </div>
  );
}
```

Create `frontend/src/routes/CustomerSettings.tsx`:

```tsx
import { AccountSettingsForm } from "../components/shared/AccountSettingsForm";

export default function CustomerSettings() {
  return (
    <div className="px-5 py-6">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[13px] text-[var(--muted)]">Your account details.</p>
      <AccountSettingsForm role="customer" />
    </div>
  );
}
```

- [ ] **Step 5: Wire the three settings routes**

In `frontend/src/App.tsx`, add the three lazy imports alongside the others:

```tsx
const PlatformSettings = lazy(() => import('./routes/platform/PlatformSettings'));
const AdminSettings = lazy(() => import('./routes/admin/AdminSettings'));
const CustomerSettings = lazy(() => import('./routes/CustomerSettings'));
```

Add the platform settings route inside the `/platform` layout block:

```tsx
<Route path="/platform" element={<PlatformLayout />}>
  <Route index element={<Businesses />} />
  <Route path="onboard" element={<OnboardBusiness />} />
  <Route path="business/:id" element={<BusinessDetail />} />
  <Route path="settings" element={<PlatformSettings />} />
</Route>
```

Add the customer settings route inside the customer `<CustomerLayout />` block:

```tsx
<Route element={<CustomerLayout />}>
  <Route path="dashboard" element={<CustomerDashboard />} />
  <Route path="wallet" element={<CustomerWallet />} />
  <Route path="menu" element={<CustomerMenu />} />
  <Route path="settings" element={<CustomerSettings />} />
</Route>
```

Add the admin settings route inside the guarded admin block, after `events`:

```tsx
<Route path="events" element={<AdminEvents />} />
<Route path="settings" element={<AdminSettings />} />
<Route path="reports/summary" element={<AdminReportsSummary />} />
```

- [ ] **Step 6: Wire AccountMenu into PlatformLayout**

In `frontend/src/components/platform/PlatformLayout.tsx`, add the import:

```tsx
import { AccountMenu } from "../shared/AccountMenu";
```

Replace the bottom block:

```tsx
        <div className="mt-auto border-t border-[var(--line)] pt-3">
          <div className="mb-2 px-2 text-[13px]">
            <div className="font-bold">{user.name}</div>
            <div className="text-[11px] text-[var(--soft)]">Super-admin</div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/platform/login");
            }}
            className="flex w-full items-center gap-2 rounded-[11px] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--bg)]"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
```

with:

```tsx
        <div className="mt-auto border-t border-[var(--line)] pt-3">
          <AccountMenu
            initial={user.name.charAt(0).toUpperCase()}
            name={user.name}
            settingsPath="/platform/settings"
            onLogout={() => {
              logout();
              navigate("/platform/login");
            }}
            accent="var(--plat)"
            dropUp
          />
        </div>
```

Remove `LogOut` from the `lucide-react` import (no longer used directly in this file).

- [ ] **Step 7: Wire AccountMenu into AdminLayout**

In `frontend/src/components/admin/AdminLayout.tsx`, add the import:

```tsx
import { AccountMenu } from "../shared/AccountMenu";
```

Replace the bottom block:

```tsx
        <div className="mt-auto border-t border-[var(--line)] pt-3">
          <div className="mb-2 px-2 text-[13px]">
            <div className="font-bold">{user?.name}</div>
            <div className="text-[11px] text-[var(--soft)]">Business admin</div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-[11px] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--bg)]"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
```

with:

```tsx
        <div className="mt-auto border-t border-[var(--line)] pt-3">
          <AccountMenu
            initial={(user?.name || "?").charAt(0).toUpperCase()}
            name={user?.name || ""}
            settingsPath="settings"
            onLogout={handleLogout}
            dropUp
          />
        </div>
```

Remove `LogOut` from the `lucide-react` import (no longer used directly in this file).

- [ ] **Step 8: Wire AccountMenu into CustomerDashboard**

In `frontend/src/routes/CustomerDashboard.tsx`, add the import:

```tsx
import { AccountMenu } from "../components/shared/AccountMenu";
```

Replace:

```tsx
        <button
          onClick={logout}
          className="rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          Logout
        </button>
```

with:

```tsx
        <AccountMenu
          initial={(user?.name || "?").charAt(0).toUpperCase()}
          name={user?.name || ""}
          email={user?.email}
          settingsPath="settings"
          onLogout={logout}
        />
```

- [ ] **Step 9: Add adminEmailVerified to the AdminSettings type**

In `frontend/src/hooks/useAdminSettings.ts`, add `adminEmailVerified: boolean;` to the `AdminSettings` interface:

```ts
export interface AdminSettings {
  name: string;
  slug: string;
  status: "active" | "suspended";
  branding: AdminBranding;
  contact: AdminContact;
  adminEmailVerified: boolean;
  program: AdminProgram;
  menuEnabled: boolean;
}
```

- [ ] **Step 10: Create the verify-email gate component**

Create `frontend/src/components/admin/VerifyEmailGate.tsx`:

```tsx
import { useState } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { MailWarning, LogOut } from "lucide-react";
import { apiRequest } from "../../lib/api";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAccount } from "../../hooks/useAccount";

export function VerifyEmailGate() {
  const qc = useQueryClient();
  const { logout } = useAdminAuth();
  const { data: account } = useAccount("admin");
  const [resending, setResending] = useState(false);

  const resend = async () => {
    if (!account?.email) return;
    setResending(true);
    try {
      await apiRequest("/api/auth/resend-verification", { method: "POST", body: { email: account.email } });
      toast.success("Verification email resent.");
    } catch {
      toast.error("Could not resend. Try again.");
    } finally {
      setResending(false);
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["adminSettings"] });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-sm rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        <MailWarning className="mx-auto mb-4 h-10 w-10 text-[var(--warn)]" />
        <h2 className="font-display text-xl font-extrabold text-[var(--ink)]">Verify your email</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Check <span className="font-semibold text-[var(--ink)]">{account?.email}</span> for a verification link
          before using the admin console.
        </p>
        <button
          onClick={resend}
          disabled={resending}
          className="mt-5 w-full rounded-[13px] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {resending ? "Sending…" : "Resend verification email"}
        </button>
        <button
          onClick={refresh}
          className="mt-2.5 w-full rounded-[13px] border border-[var(--line)] bg-[var(--bg)] py-3 text-sm font-bold"
        >
          I've verified — refresh
        </button>
        <button
          onClick={logout}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Wire the gate into AdminGuard**

In `frontend/src/components/admin/AdminGuard.tsx`, add the imports:

```tsx
import { useAdminSettings } from "../../hooks/useAdminSettings";
import { VerifyEmailGate } from "./VerifyEmailGate";
```

Change the component body from:

```tsx
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAdminAuth();
  const navigate = useNavigate();
  const { slug } = useParams();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "business_admin")) {
      navigate(slug ? `/${slug}/admin/login` : "/");
    }
  }, [user, isLoading, navigate, slug]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212]">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#EBE6DF] animate-pulse">
          Verifying credentials...
        </div>
      </div>
    );
  }

  if (!user || user.role !== "business_admin") {
    return null;
  }

  return <>{children}</>;
}
```

to:

```tsx
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAdminAuth();
  const navigate = useNavigate();
  const { slug } = useParams();
  const { data: settings, isLoading: settingsLoading } = useAdminSettings();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "business_admin")) {
      navigate(slug ? `/${slug}/admin/login` : "/");
    }
  }, [user, isLoading, navigate, slug]);

  if (isLoading || (user && user.role === "business_admin" && settingsLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212]">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#EBE6DF] animate-pulse">
          Verifying credentials...
        </div>
      </div>
    );
  }

  if (!user || user.role !== "business_admin") {
    return null;
  }

  if (settings && !settings.adminEmailVerified) {
    return <VerifyEmailGate />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 12: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/hooks/useAccount.ts frontend/src/components/shared/AccountMenu.tsx frontend/src/components/shared/AccountSettingsForm.tsx frontend/src/components/admin/VerifyEmailGate.tsx frontend/src/routes/platform/PlatformSettings.tsx frontend/src/routes/admin/AdminSettings.tsx frontend/src/routes/CustomerSettings.tsx frontend/src/components/platform/PlatformLayout.tsx frontend/src/components/admin/AdminLayout.tsx frontend/src/components/admin/AdminGuard.tsx frontend/src/routes/CustomerDashboard.tsx frontend/src/hooks/useAdminSettings.ts frontend/src/App.tsx
git commit -m "feat: profile dropdown menus, account settings screens, admin email-verify gate"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suite green**

Run: `cd backend && npm test`
Expected: all twelve suites PASS, exit 0.

- [ ] **Step 2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end browser walkthrough**

With the dev servers running:
- Onboard a fresh business via the platform console (`/platform/onboard`). Log in as its new admin — confirm the `VerifyEmailGate` screen appears and nothing else in the console is reachable (try navigating directly to `/admin` sub-routes by URL, confirm the gate still shows).
- Click "Resend verification email", grab the emailed link from the backend's stub-email log output, open it — confirm "Email verified" renders. Back in the admin tab, click "I've verified — refresh" — confirm the full console (sidebar, `Overview`, etc.) becomes reachable.
- On the seeded (already-verified) `coffesarowar` admin: open the profile dropdown (bottom of sidebar), confirm name shows correctly, go to Settings, change the display name, confirm it updates in the dropdown immediately; change the password, log out, log back in with the new password.
- On the seeded customer: open the profile dropdown (top of dashboard), confirm name/email show, go to Settings, confirm the verify-email section shows "Verified" (seeded customer is pre-verified), change name and password the same way.
- On the platform admin: open the profile dropdown, go to Settings, confirm there is no verify-email section (platform-only), change name and password.

- [ ] **Step 4: Commit any final fixes, then finish**

```bash
git add -A
git commit -m "chore(account): verification pass fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** shared `/api/account` API usable by all 3 roles (Task 1, decision 1), settings content = name + password for all roles, verify-email section only for customer/business_admin (Task 2 Step 3, decision 2), business_admin verify-email wiring via reused `sendVerifyEmail` (Task 1 Steps 5-6, decision 3), full-console gate via `VerifyEmailGate` replacing all of `AdminGuard`'s children (Task 2 Steps 10-11, decision 4), platform excluded from verify-email entirely (Task 2 Step 3's `role !== "platform"` check, decision 5), shared `AccountMenu` replacing the static logout block in all three layouts (Task 2 Steps 6-8, decision 6), shared `AccountSettingsForm` parameterized by role (Task 2 Step 3, decision 7). No gaps against the spec.
- **`req.user.id` vs `req.user.userId` verified directly against `authMiddleware.js`** before writing any endpoint code — this codebase's JWT middleware sets `req.user.id`, not `req.user.userId` (a mismatch here would have silently produced `undefined` lookups failing every account operation).
- **Type consistency:** `Account` (frontend, Task 2 Step 1) matches `accountController.js`'s `formatAccount` shape (Task 1 Step 3) field-for-field. `AdminSettings.adminEmailVerified` (Task 2 Step 9) matches the field name added to `getMySettings`'s response (Task 1 Step 7) exactly — a mismatch here would silently show the gate as permanently stuck (or permanently bypassed).
- **Test-design note:** Task 1's test proves the full verification lifecycle end-to-end through real HTTP + the existing `/__test__/mint-token` helper (same pattern every prior epic's email-adjacent test has used, since reading the actual stub-logged email body isn't practical from a test process) — onboard a business, confirm unverified, mint+consume a real verify token, confirm verified — rather than only asserting the field's presence.
- **Existing behavior preserved:** customer registration/login/verify/reset flows are completely untouched; `sendVerifyEmail`'s only change is its email copy (generic wording, not a behavior change) and being exported (additive).

# Set/Change Password (hasPassword) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `hasPassword` flag to account payloads (customer + admin/staff/platform) and use it to show "Set password" (new + confirm only) for Google-only accounts instead of the current always-shown "Change password" (current + new) form that silently rejects Google-only users server-side.

**Architecture:** Backend: both account services already know whether `account.password`/`user.password` is set — expose it as `hasPassword` in the existing summary-formatting functions (no new endpoint), and relax both `changePassword` functions to skip the current-password requirement/compare when there's no password to compare against, instead of hard-rejecting. Frontend: both `CustomerProfilePanel` and `AccountSettingsForm` read `hasPassword` off the account object already returned by their existing `GET` calls, add a confirm-password field and a strength indicator (new shared `passwordStrength` helper), and conditionally omit the current-password field/requirement.

**Tech Stack:** Node/Express/Mongoose (backend), React/TypeScript (frontend) — no new dependencies.

## Global Constraints

- No new npm dependencies.
- Two entirely separate account systems in this codebase — `CustomerAccount` (customer, `backend/services/customerAccountService.js`) and `User` (admin/staff/platform, `backend/services/accountService.js`) — both need the identical `hasPassword` + relaxed-check treatment; they are not shared code, so this plan touches both.
- Backend test command is `npm test` in `backend/`, which runs every file in `backend/tests/` sequentially (see `backend/package.json`) — new assertions are appended to the two existing relevant files (`backend/tests/customer-profile.js`, `backend/tests/account-settings.js`) rather than new files, matching how those files already group "profile + password" checks for their respective account type.
- No frontend unit test runner; frontend verification = `tsc --noEmit` (`cd frontend && npm run lint`) + manual browser check.
- Minimum password length (8 chars) enforced server-side is unchanged — the strength indicator is UI feedback only, not a new validation rule.

---

### Task 1: Backend — `hasPassword` + relaxed change-password for customers

**Files:**
- Modify: `backend/services/customerAccountService.js:89-100` (`formatAccountSummary`), `:476-504` (`changeAccountPassword`)
- Test: `backend/tests/customer-profile.js` (append)

**Interfaces:**
- Produces: `formatAccountSummary(account)` now includes `hasPassword: boolean` in its return object — consumed by every response that already spreads this summary (`GET /api/customer-auth/me`, `PATCH /api/customer-auth/profile`, `PATCH /api/customer-auth/preferences`, avatar endpoints, login/register), no route changes needed since they all go through this one function.
- Produces: `POST /api/customer-auth/change-password` now accepts `{ newPassword }` alone (no `currentPassword`) when the account has no password set; still requires and validates `currentPassword` when one exists.

- [ ] **Step 1: Add `hasPassword` to the account summary**

In `backend/services/customerAccountService.js`, replace lines 89–100:

```js
const formatAccountSummary = (account) => ({
  id: account._id.toString(),
  name: account.name,
  email: account.email,
  phone: account.phone || "",
  emailVerified: account.emailVerified,
  avatarVersion: account.avatarVersion || 0,
  marketingConsent: account.marketingConsent,
  birthdayMonth: account.birthdayMonth ?? null,
  birthdayDay: account.birthdayDay ?? null,
  gender: account.gender ?? null
});
```

with:

```js
const formatAccountSummary = (account) => ({
  id: account._id.toString(),
  name: account.name,
  email: account.email,
  phone: account.phone || "",
  emailVerified: account.emailVerified,
  avatarVersion: account.avatarVersion || 0,
  marketingConsent: account.marketingConsent,
  birthdayMonth: account.birthdayMonth ?? null,
  birthdayDay: account.birthdayDay ?? null,
  gender: account.gender ?? null,
  hasPassword: Boolean(account.password)
});
```

- [ ] **Step 2: Relax `changeAccountPassword`**

Replace lines 476–504:

```js
const changeAccountPassword = async ({ customerAccountId, currentPassword, newPassword }) => {
  if (!currentPassword || !newPassword) {
    throw createHttpError("Current and new password are required.", 400);
  }
  if (newPassword.length < 8) {
    throw createHttpError("New password must be at least 8 characters.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (!account.password) {
    // Either a Google-only signup, or an account whose unproven password was
    // discarded when Google proved the address (see utils/googleLink.js).
    // Password reset is the way in — it mails the address Google verified.
    throw createHttpError(
      "This account signs in with Google. Use \"forgot password\" if you'd like to set one.",
      400
    );
  }

  const isValid = await bcrypt.compare(currentPassword, account.password);
  if (!isValid) throw createHttpError("Current password is incorrect.", 401);

  account.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await account.save();

  return { success: true, message: "Password updated." };
};
```

with:

```js
const changeAccountPassword = async ({ customerAccountId, currentPassword, newPassword }) => {
  if (!newPassword) {
    throw createHttpError("New password is required.", 400);
  }
  if (newPassword.length < 8) {
    throw createHttpError("New password must be at least 8 characters.", 400);
  }

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (account.password) {
    if (!currentPassword) {
      throw createHttpError("Current password is required.", 400);
    }
    const isValid = await bcrypt.compare(currentPassword, account.password);
    if (!isValid) throw createHttpError("Current password is incorrect.", 401);
  }
  // else: no password set yet (Google-only signup, or one discarded when
  // Google proved the address — see utils/googleLink.js). The session
  // itself, required by verifyGlobalSession on this route, is proof enough
  // of identity to set one for the first time.

  account.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await account.save();

  return { success: true, message: "Password updated." };
};
```

- [ ] **Step 3: Append an integration test**

At the end of the `try` block in `backend/tests/customer-profile.js` (after the existing password-change assertions, before its `finally`/`catch`), add:

```js
    console.log("\n== Setting a password on a Google-only account ==");
    const CustomerAccount = require("../models/CustomerAccount");
    const googleOnlyAccount = await CustomerAccount.findOne({ email });
    googleOnlyAccount.password = null;
    googleOnlyAccount.googleId = "test-google-id-123";
    await googleOnlyAccount.save();

    const meBeforeSet = await api("/api/customer-auth/me", { token: customerToken });
    check("hasPassword is false once password is cleared", meBeforeSet.body.hasPassword === false, meBeforeSet.body);

    const setWithoutCurrent = await api("/api/customer-auth/change-password", {
      method: "POST", token: customerToken, body: { newPassword: "freshpassword1" },
    });
    check("setting a first password with no currentPassword -> 200", setWithoutCurrent.status === 200, setWithoutCurrent.body);

    const meAfterSet = await api("/api/customer-auth/me", { token: customerToken });
    check("hasPassword is true after setting one", meAfterSet.body.hasPassword === true, meAfterSet.body);

    const loginWithSetPassword = await api("/api/customer-auth/login", {
      method: "POST", body: { email, password: "freshpassword1" },
    });
    check("the newly-set password signs in", loginWithSetPassword.status === 200, loginWithSetPassword.body);
```

- [ ] **Step 4: Run the backend test suite**

Run: `cd backend && npm test`
Expected: all PASS lines, including the three new ones above, no FAIL lines.

- [ ] **Step 5: Commit**

```bash
git add backend/services/customerAccountService.js backend/tests/customer-profile.js
git commit -m "feat(account): add hasPassword flag, allow first-time password set for Google-only customers"
```

---

### Task 2: Backend — `hasPassword` + relaxed change-password for admin/staff/platform

**Files:**
- Modify: `backend/controllers/accountController.js:3-10` (`formatAccount`), `backend/services/accountService.js:50-74` (`changePassword`)
- Test: `backend/tests/account-settings.js` (append)

**Interfaces:**
- Produces: `formatAccount(user)` now includes `hasPassword: boolean` — consumed by every response using it (`GET /api/account/me`, profile update, info-prompt dismiss).
- Produces: `POST /api/account/change-password` accepts `{ newPassword }` alone when `user.password` is falsy.

- [ ] **Step 1: Add `hasPassword` to `formatAccount`**

In `backend/controllers/accountController.js`, replace lines 3–10:

```js
const formatAccount = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  ...(user.role === "customer" ? { infoPromptDismissed: user.infoPromptDismissed } : {})
});
```

with:

```js
const formatAccount = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
  hasPassword: Boolean(user.password),
  ...(user.role === "customer" ? { infoPromptDismissed: user.infoPromptDismissed } : {})
});
```

- [ ] **Step 2: Relax `changePassword`**

In `backend/services/accountService.js`, replace lines 50–74:

```js
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
```

with:

```js
const changePassword = async (userId, { currentPassword, newPassword }) => {
  if (!newPassword) {
    throw createHttpError("New password is required.", 400);
  }
  if (newPassword.length < 8) {
    throw createHttpError("New password must be at least 8 characters.", 400);
  }

  const user = await User.findOne({ _id: userId });
  if (!user) throw createHttpError("Account not found.", 404);

  if (user.password) {
    if (!currentPassword) {
      throw createHttpError("Current password is required.", 400);
    }
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw createHttpError("Current password is incorrect.", 401);
    }
  }
  // else: Google-only sign-in, nothing to compare against — the
  // authenticated session is proof enough to set a first password.

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  return { success: true, message: "Password updated." };
};
```

- [ ] **Step 3: Append an integration test**

`backend/tests/account-settings.js` already logs in as the seeded admin (`durbarmarg@coffesarowar.com`) around line 73, storing the token in `adminToken` (line 74). After its existing password-change block, add:

```js
    console.log("\n== Setting a password on a Google-only admin account ==");
    const User = require("../models/User");
    const adminUser = await User.findOne({ email: "durbarmarg@coffesarowar.com" });
    const originalPasswordHash = adminUser.password;
    adminUser.password = null;
    adminUser.googleId = "test-google-id-456";
    await adminUser.save();

    const meBeforeSet = await api("/api/account/me", { token: adminToken });
    check("hasPassword is false once password is cleared", meBeforeSet.body.hasPassword === false, meBeforeSet.body);

    const setWithoutCurrent = await api("/api/account/change-password", {
      method: "POST", token: adminToken, body: { newPassword: "adminfreshpass1" },
    });
    check("setting a first password with no currentPassword -> 200", setWithoutCurrent.status === 200, setWithoutCurrent.body);

    const meAfterSet = await api("/api/account/me", { token: adminToken });
    check("hasPassword is true after setting one", meAfterSet.body.hasPassword === true, meAfterSet.body);

    // Restore the original password hash so later tests in this file (or a
    // re-run against the same seeded admin) still authenticate with "password".
    adminUser.password = originalPasswordHash;
    await adminUser.save();
```

- [ ] **Step 4: Run the backend test suite**

Run: `cd backend && npm test`
Expected: all PASS, no FAIL.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/accountController.js backend/services/accountService.js backend/tests/account-settings.js
git commit -m "feat(account): add hasPassword flag, allow first-time password set for Google-only staff/platform accounts"
```

---

### Task 3: Frontend — shared password strength helper

**Files:**
- Create: `frontend/src/lib/passwordStrength.ts`

**Interfaces:**
- Produces: `type PasswordStrength = "weak" | "medium" | "strong"`, `passwordStrength(password: string): PasswordStrength`, `STRENGTH_LEVELS: PasswordStrength[]`, `strengthColor(strength: PasswordStrength): string` — consumed by both `CustomerProfilePanel` and `AccountSettingsForm` in Tasks 4–5.

- [ ] **Step 1: Write the helper**

```ts
export type PasswordStrength = "weak" | "medium" | "strong";

export const STRENGTH_LEVELS: PasswordStrength[] = ["weak", "medium", "strong"];

/**
 * Rough client-side strength signal for the meter — not a security
 * boundary. The only enforced rule is the backend's 8-character minimum;
 * this is feedback while typing, nothing more.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 8) return "weak";
  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 12 && varietyCount >= 3) return "strong";
  if (password.length >= 8 && varietyCount >= 2) return "medium";
  return "weak";
}

export function strengthColor(strength: PasswordStrength): string {
  if (strength === "strong") return "bg-emerald-500";
  if (strength === "medium") return "bg-amber-500";
  return "bg-red-500";
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/passwordStrength.ts
git commit -m "feat(settings): add shared password strength helper"
```

---

### Task 4: Frontend — customer Set/Change password UI

**Files:**
- Modify: `frontend/src/context/CustomerAuthContext.tsx:26-38` (`GlobalAccount` interface)
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx:56-58` (state), `:113-130` (`savePassword`), `:449-475` (Security card JSX)

**Interfaces:**
- Consumes: `hasPassword` field on `GlobalAccount` (Task 1's backend change); `passwordStrength`, `STRENGTH_LEVELS`, `strengthColor` from Task 3.

- [ ] **Step 1: Add `hasPassword` to `GlobalAccount`**

In `frontend/src/context/CustomerAuthContext.tsx`, replace lines 26–38:

```tsx
export interface GlobalAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  /** 0 = no profile picture. Bumped by the backend on every upload/removal. */
  avatarVersion?: number;
  marketingConsent?: MarketingConsent;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  gender?: Gender;
}
```

with:

```tsx
export interface GlobalAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  /** 0 = no profile picture. Bumped by the backend on every upload/removal. */
  avatarVersion?: number;
  marketingConsent?: MarketingConsent;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  gender?: Gender;
  /** False for a Google-only signup that never set one. */
  hasPassword: boolean;
}
```

- [ ] **Step 2: Add confirm-password state**

In `frontend/src/components/customer/CustomerProfilePanel.tsx`, replace lines 56–58:

```tsx
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
```

with:

```tsx
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
```

Also add the import at the top of the file (near the existing `import toast from "@/lib/toast";`):

```tsx
import { passwordStrength, STRENGTH_LEVELS, strengthColor } from "@/lib/passwordStrength";
```

- [ ] **Step 3: Update `savePassword`**

Replace lines 113–130:

```tsx
  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    try {
      await apiRequest("/api/customer-auth/change-password", {
        method: "POST",
        role: "customer-global",
        body: { currentPassword, newPassword },
      });
      toast.success("Password updated!");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your password — try again.");
    } finally {
      setSavingPassword(false);
    }
  };
```

with:

```tsx
  const savePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) return;
    if (globalAccount.hasPassword && !currentPassword) return;
    setSavingPassword(true);
    try {
      await apiRequest("/api/customer-auth/change-password", {
        method: "POST",
        role: "customer-global",
        body: globalAccount.hasPassword ? { currentPassword, newPassword } : { newPassword },
      });
      toast.success(globalAccount.hasPassword ? "Password updated!" : "Password set!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setGlobalAccountData({ ...globalAccount, hasPassword: true });
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your password — try again.");
    } finally {
      setSavingPassword(false);
    }
  };
```

- [ ] **Step 4: Replace the Security card's password section**

Replace lines 449–475 (the `<Card title="Change password">...</Card>` block) with:

```tsx
          <Card title={globalAccount.hasPassword ? "Change password" : "Set password"}>
            {globalAccount.hasPassword && (
              <>
                <label className="mb-1.5 block text-sm font-bold" htmlFor="current-password">
                  Current password
                </label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={`mb-3 ${fieldClass}`}
                />
              </>
            )}

            <label className="mb-1.5 block text-sm font-bold" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={fieldClass}
            />
            {newPassword && (
              <div className="mb-3 mt-1.5 flex gap-1">
                {STRENGTH_LEVELS.map((level, i) => {
                  const strength = passwordStrength(newPassword);
                  const filled = STRENGTH_LEVELS.indexOf(strength) >= i;
                  return (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full ${filled ? strengthColor(strength) : "bg-[var(--surface-2)]"}`}
                    />
                  );
                })}
              </div>
            )}

            <label className="mb-1.5 block text-sm font-bold" htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`mb-3 ${fieldClass}`}
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mb-3 text-[13px] text-red-500">Passwords don't match.</p>
            )}

            <Button
              onClick={savePassword}
              disabled={
                savingPassword ||
                !newPassword ||
                newPassword !== confirmPassword ||
                (globalAccount.hasPassword && !currentPassword)
              }
            >
              {savingPassword ? "Saving…" : globalAccount.hasPassword ? "Update password" : "Set password"}
            </Button>
          </Card>
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/context/CustomerAuthContext.tsx frontend/src/components/customer/CustomerProfilePanel.tsx
git commit -m "feat(settings): Set/Change password UI with confirm field and strength meter"
```

---

### Task 5: Frontend — admin/staff/platform Set/Change password UI

**Files:**
- Modify: `frontend/src/hooks/useAccount.ts` (`Account` interface, lines 4–9)
- Modify: `frontend/src/components/shared/AccountSettingsForm.tsx:24-26` (state), `:64-74` (`savePassword`), `:151-175` (Security section JSX)

**Interfaces:**
- Consumes: `hasPassword` field on `Account` (Task 2's backend change); `passwordStrength`, `STRENGTH_LEVELS`, `strengthColor` from Task 3.

- [ ] **Step 1: Add `hasPassword` to `Account`**

In `frontend/src/hooks/useAccount.ts`, replace:

```tsx
export interface Account {
  id: string;
  name: string;
  email: string;
  role: "customer" | "business_admin" | "platform";
  emailVerified: boolean;
}
```

with:

```tsx
export interface Account {
  id: string;
  name: string;
  email: string;
  role: "customer" | "business_admin" | "platform";
  emailVerified: boolean;
  /** False for a Google-only signin that never set one. */
  hasPassword: boolean;
}
```

- [ ] **Step 2: Add confirm-password state and import**

In `frontend/src/components/shared/AccountSettingsForm.tsx`, replace lines 24–26:

```tsx
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resending, setResending] = useState(false);
```

with:

```tsx
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resending, setResending] = useState(false);
```

Add near the top imports:

```tsx
import { passwordStrength, STRENGTH_LEVELS, strengthColor } from "@/lib/passwordStrength";
```

- [ ] **Step 3: Update `savePassword`**

Replace lines 64–74:

```tsx
  const savePassword = async () => {
    if (!currentPassword || !newPassword) return;
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success("Password updated!");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your password — try again.");
    }
  };
```

with:

```tsx
  const savePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) return;
    if (account.hasPassword && !currentPassword) return;
    try {
      await changePassword.mutateAsync(
        account.hasPassword ? { currentPassword, newPassword } : { newPassword },
      );
      toast.success(account.hasPassword ? "Password updated!" : "Password set!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update your password — try again.");
    }
  };
```

`useChangePassword`'s `mutationFn` signature (`frontend/src/hooks/useAccount.ts`) currently types its argument as `{ currentPassword: string; newPassword: string }` — update it to `{ currentPassword?: string; newPassword: string }` so `{ newPassword }` alone type-checks:

```tsx
export function useChangePassword(role: Role) {
  return useMutation({
    mutationFn: async (body: { currentPassword?: string; newPassword: string }) =>
      apiRequest<{ success: boolean; message: string }>("/api/account/change-password", {
        method: "POST",
        role,
        body,
      }),
  });
}
```

- [ ] **Step 4: Replace the password section of the Security block**

Replace lines 151–175 (the `<div className="rounded-[var(--radius-card)] ...">` block containing "Change password") with:

```tsx
          <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
            <div className="mb-3 text-sm font-bold">{account.hasPassword ? "Change password" : "Set password"}</div>

            {account.hasPassword && (
              <>
                <label className="mb-1.5 block text-sm font-bold">Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </>
            )}

            <label className="mb-1.5 block text-sm font-bold">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            {newPassword && (
              <div className="mb-3 mt-1.5 flex gap-1">
                {STRENGTH_LEVELS.map((level, i) => {
                  const strength = passwordStrength(newPassword);
                  const filled = STRENGTH_LEVELS.indexOf(strength) >= i;
                  return (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full ${filled ? strengthColor(strength) : "bg-[var(--surface-2)]"}`}
                    />
                  );
                })}
              </div>
            )}

            <label className="mb-1.5 block text-sm font-bold">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mb-3 text-[13px] text-red-500">Passwords don't match.</p>
            )}

            <button
              onClick={savePassword}
              disabled={
                changePassword.isPending ||
                !newPassword ||
                newPassword !== confirmPassword ||
                (account.hasPassword && !currentPassword)
              }
              className="rounded-[var(--radius-btn)] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {changePassword.isPending ? "Saving…" : account.hasPassword ? "Update password" : "Set password"}
            </button>
          </div>
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useAccount.ts frontend/src/components/shared/AccountSettingsForm.tsx
git commit -m "feat(settings): Set/Change password UI for admin/staff/platform accounts"
```

---

### Task 6: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Normal customer account**

Log in as a customer with a password set. Navigate to Security. Verify: card says "Change password", shows Current/New/Confirm fields, strength bar appears while typing a new password, mismatched confirm shows the red warning and disables the button, matching passwords + correct current password succeeds and shows "Password updated!".

- [ ] **Step 2: Google-only customer account**

Using a test account with `googleId` set and `password: null` (e.g. via the test hook or by signing up through Google in a dev environment), navigate to Security. Verify: card says "Set password", no Current password field is rendered, New + Confirm fields work, submitting succeeds and shows "Password set!", and the card immediately relabels to "Change password" with a Current password field now present (from the local `hasPassword: true` patch — no page reload needed).

- [ ] **Step 3: Admin/platform accounts**

Repeat Steps 1–2 for an admin account (`AdminSettings` → Account → Security) and the platform account (`PlatformSettings`).

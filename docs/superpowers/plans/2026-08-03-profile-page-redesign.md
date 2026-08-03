# Profile Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup the customer profile page's 8 flat cards and `AccountSettingsForm`'s 3 flat cards into a Clerk `<UserProfile>`-style sidebar-sectioned layout, via one shared shell.

**Architecture:** One new presentational component, `ProfileShell`, that takes sections as data and renders a left rail of section links + a right content pane (collapsing to a horizontal strip below `md`). `CustomerProfilePanel.tsx` and `AccountSettingsForm.tsx` each restructure their existing JSX into `ProfileShell` sections — no field, hook, or endpoint changes in either file.

**Tech Stack:** React 19 + TS, `lucide-react` icons (already a dependency).

**Spec:** `docs/superpowers/specs/2026-08-03-profile-page-redesign-design.md`

## Global Constraints

- **Pure restructuring.** No backend changes. No field, hook (`useAccount`, `useUpdateProfile`, `useChangePassword`, `useCustomerAuth`), or endpoint changes in either file — only which section a card's JSX renders under.
- **`ProfileShell` takes sections as data**, not hardcoded children — the same convention `SettingsTabs.tsx` already uses.
- **Active-section styling matches `AdminLayout.tsx`'s existing nav-link active state** (`navLinkClass`, `AdminLayout.tsx:100-106`): `bg-[var(--primary-soft)] text-[var(--primary-deep)]` when active, `text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]` otherwise — so this doesn't introduce a second "selected nav item" visual language into the app.
- Frontend has no test runner. Verification is `npm run lint` (`tsc --noEmit`) plus manual browser checks.
- `MONGODB_URI="" npm run dev -w backend` (not plain `npm run dev`) for local verification.

---

### Task 1: `ProfileShell` component

**Files:**
- Create: `frontend/src/components/shared/profile/ProfileShell.tsx`

**Interfaces:**
- Produces: `ProfileShell({ sections }: { sections: ProfileSection[] })` and the exported type `ProfileSection = { id: string; label: string; icon: LucideIcon; danger?: boolean; content: ReactNode }`.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface ProfileSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Red-tinted link — this app's one case is "Delete account". */
  danger?: boolean;
  content: ReactNode;
}

/**
 * A Clerk <UserProfile>-style shell: a rail of section links, one section's
 * content shown at a time. Takes sections as data, the same convention
 * SettingsTabs.tsx already uses for its own tabs — so a later profile
 * surface can add a section without touching this file.
 *
 * Below md, the rail becomes a horizontal scrollable strip above the
 * content, mirroring how AdminLayout's own nav rail collapses to a drawer
 * on a narrow screen — this app's established answer to "no room for a
 * fixed side rail," just horizontal since a profile page has no need for
 * the drawer's overlay behavior.
 */
export function ProfileShell({ sections }: { sections: ProfileSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  const linkClass = (section: ProfileSection) => {
    const isActive = section.id === activeId;
    const base = "flex items-center gap-3 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors whitespace-nowrap";
    if (section.danger) {
      return `${base} ${isActive ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400" : "text-red-500/80 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"}`;
    }
    return `${base} ${isActive ? "bg-[var(--primary-soft)] text-[var(--primary-deep)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`;
  };

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <nav className="flex flex-shrink-0 gap-1 overflow-x-auto pb-1 md:w-[200px] md:flex-col md:overflow-visible md:pb-0">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveId(section.id)}
            className={linkClass(section)}
          >
            <section.icon className="h-4 w-4 flex-shrink-0" />
            {section.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">{active?.content}</div>
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
git add frontend/src/components/shared/profile/ProfileShell.tsx
git commit -m "feat: add ProfileShell for Clerk-style sectioned account pages"
```

---

### Task 2: Regroup `CustomerProfilePanel.tsx` into `ProfileShell` sections

**Files:**
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx` (imports; the `return` statement, lines 260-476)
- Modify: `frontend/src/components/customer/CustomerProfilePage.tsx:39` (`max-w-2xl` → `max-w-3xl`, to give the two-column shell room)

**Interfaces:**
- Consumes: `ProfileShell`, `ProfileSection` from `../shared/profile/ProfileShell` (Task 1).

- [ ] **Step 1: Add the import**

In `frontend/src/components/customer/CustomerProfilePanel.tsx`, add to the imports:

```tsx
import { User, Contact, Bell, ShieldCheck, Trash2 } from "lucide-react";
import { ProfileShell, type ProfileSection } from "../shared/profile/ProfileShell";
```

- [ ] **Step 2: Replace the `return` statement**

Every `Card` inside stays byte-for-byte identical — only the wrapping structure changes, from one flat `<div className="flex max-w-[480px] flex-col gap-6">...</div>` stack into 5 `ProfileSection`s fed to `ProfileShell`. `AvatarPicker` and the final "Log out" button move to the top of the `profile` section's content (the avatar belongs with the identity fields it sits beside today) and stay outside the shell respectively — logging out isn't a per-section setting, it's an action for the whole page, so it renders below the shell exactly as it did below the old stack.

Replace the file's closing `return (...)` block (starting at `return (` around line 260, through the closing `);` and `}` at the end of the file) with:

```tsx
  const sections: ProfileSection[] = [
    {
      id: "profile",
      label: "Profile",
      icon: User,
      content: (
        <div className="flex max-w-[480px] flex-col gap-6">
          <AvatarPicker />

          <Card title="Profile">
            <label className="mb-1.5 block text-sm font-bold" htmlFor="profile-name">
              Name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mb-3 ${fieldClass}`}
            />
            <div className="mb-3 text-[13px] text-[var(--muted)]">{globalAccount.email}</div>
            <Button onClick={saveName} disabled={savingName || !name.trim()}>
              {savingName ? "Saving…" : "Save name"}
            </Button>
          </Card>
        </div>
      ),
    },
    {
      id: "personal",
      label: "Personal info",
      icon: Contact,
      content: (
        <div className="flex max-w-[480px] flex-col gap-6">
          <Card title="Personal info">
            <p className="mb-3 text-sm text-[var(--muted)]">Optional — we'll send you something nice on your birthday.</p>
            <div className="mb-3 flex items-center gap-2">
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
            </div>
            <select
              value={gender ?? ""}
              onChange={(e) => setGender((e.target.value || "") as Gender | "")}
              className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Gender — prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
            <div className="flex items-center gap-2">
              <Button onClick={savePersonalInfo} disabled={savingBirthday}>
                {savingBirthday ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>
        </div>
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      content: (
        <div className="flex max-w-[480px] flex-col gap-6">
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

          <Card title="SMS updates">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={smsOptIn}
                disabled={savingSmsOptIn}
                onChange={(e) => saveSmsOptIn(e.target.checked)}
              />
              Send me offers and updates by SMS
            </label>
          </Card>

          <Card title="Push notifications">
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={savingPush}
                onChange={(e) => savePushOptIn(e.target.checked)}
              />
              Send me updates as push notifications
            </label>
          </Card>
        </div>
      ),
    },
    {
      id: "security",
      label: "Security",
      icon: ShieldCheck,
      content: (
        <div className="flex max-w-[480px] flex-col gap-6">
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
                    setGlobalAccountData({ ...globalAccount, emailVerified: true });
                  }}
                />
              ) : (
                <Button variant="outline" onClick={() => setShowVerify(true)}>
                  Verify email
                </Button>
              )
            )}
          </Card>

          <Card title="Change password">
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
            <label className="mb-1.5 block text-sm font-bold" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`mb-3 ${fieldClass}`}
            />
            <Button onClick={savePassword} disabled={savingPassword || !currentPassword || !newPassword}>
              {savingPassword ? "Saving…" : "Update password"}
            </Button>
          </Card>
        </div>
      ),
    },
    {
      id: "danger",
      label: "Danger zone",
      icon: Trash2,
      danger: true,
      content: (
        <div className="flex max-w-[480px] flex-col gap-6">
          <Card title="Delete account">
            <div className="mb-3 text-[13px] text-[var(--muted)] leading-relaxed">
              Once you delete your account, there is no going back. All of your points, memberships, and profile details will be permanently removed across all cafes.
            </div>

            {!showConfirmDelete ? (
              <Button
                variant="destructive"
                onClick={() => setShowConfirmDelete(true)}
              >
                Delete account
              </Button>
            ) : (
              <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                <p className="text-[13px] text-red-600 dark:text-red-400 font-medium">
                  Please type <strong className="select-all break-all">{globalAccount.email}</strong> to confirm deletion.
                </p>
                <input
                  type="text"
                  placeholder={globalAccount.email}
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  className="w-full rounded-[var(--radius-btn)] border border-red-200 bg-[var(--bg)] px-4 py-3 text-sm focus:border-red-500 focus:outline-none dark:border-red-900 text-[var(--ink)]"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={confirmEmail !== globalAccount.email || deleting}
                    onClick={handleDeleteAccount}
                    className="flex-1"
                  >
                    {deleting ? "Deleting…" : "Confirm Delete"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowConfirmDelete(false);
                      setConfirmEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ProfileShell sections={sections} />

      {/* Lives here rather than in either navbar: logging out is the one thing
          on this page you can't undo with another tap, so it belongs at the
          bottom of the page you went to on purpose, not one stray tap from
          the header of every screen. */}
      <Button
        variant="ghost"
        onClick={onLogout}
        className="w-full text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Widen the page wrapper**

In `frontend/src/components/customer/CustomerProfilePage.tsx`, change the outer container from:

```tsx
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
```

to:

```tsx
    <div className="mx-auto w-full max-w-3xl px-5 py-6">
```

The old `max-w-2xl` (672px) was sized for a single-column card stack; the shell's rail (~200px) plus a 480px content column needs more room.

- [ ] **Step 4: Typecheck**

```bash
npm run lint
```

Expected: no errors. If TypeScript complains about an unused `React` import or similar, check nothing outside the `return` was accidentally touched — every hook, handler and the `if (!globalAccount) return null;` guard above the `return` stay exactly as they were.

- [ ] **Step 5: Verify in the browser**

Start the backend on the mock DB (`MONGODB_URI="" npm run dev -w backend`) and the frontend. Sign in as a customer (`asha@example.com` / `password` at `/customer-login`) and open `/explore/profile`:

1. Five section links render in the rail: Profile, Personal info, Notifications, Security, Danger zone (red-tinted).
2. Clicking each switches the content pane; the active link is highlighted exactly like `AdminLayout`'s own active nav item (green-tinted background).
3. Every action still works: save a name change, toggle an email/SMS/push notification switch, save personal info, the email-verification inline-OTP flow (if the signed-in account is unverified — use a freshly registered customer to check this), change password, and the delete-account confirmation flow (do not actually confirm delete — just confirm the UI opens and closes correctly).
4. Resize below `768px` width — the rail becomes a horizontal scrollable strip above the content, every section still reachable.
5. "Log out" still renders below the shell and works.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/customer/CustomerProfilePanel.tsx frontend/src/components/customer/CustomerProfilePage.tsx
git commit -m "feat: regroup customer profile into ProfileShell sections"
```

---

### Task 3: Regroup `AccountSettingsForm.tsx` into `ProfileShell` sections

**Files:**
- Modify: `frontend/src/components/shared/AccountSettingsForm.tsx`

**Interfaces:**
- Consumes: `ProfileShell`, `ProfileSection` from `./profile/ProfileShell` (Task 1).

- [ ] **Step 1: Add the import**

In `frontend/src/components/shared/AccountSettingsForm.tsx`, add:

```tsx
import { User, ShieldCheck } from "lucide-react";
import { ProfileShell, type ProfileSection } from "./profile/ProfileShell";
```

- [ ] **Step 2: Replace the `return` statement**

The loading-skeleton `return` (the `if (isLoading || !account)` block) stays untouched — only the final `return` (the populated-state JSX) changes. Replace it with:

```tsx
  const sections: ProfileSection[] = [
    {
      id: "profile",
      label: "Profile",
      icon: User,
      content: (
        <div className="max-w-[480px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
          <div className="mb-3 text-sm font-bold">Profile</div>
          <label className="mb-1.5 block text-sm font-bold">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <div className="mb-3 text-[13px] text-[var(--muted)]">{account.email}</div>
          <button
            onClick={saveName}
            disabled={updateProfile.isPending || !name.trim()}
            className="rounded-[var(--radius-btn)] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            {updateProfile.isPending ? "Saving…" : "Save name"}
          </button>
        </div>
      ),
    },
    {
      id: "security",
      label: "Security",
      icon: ShieldCheck,
      content: (
        <div className="flex max-w-[480px] flex-col gap-6">
          {role !== "platform" && (
            <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
              <div className="mb-2 text-sm font-bold">Email verification</div>
              <div className="mb-3 text-[13px] text-[var(--muted)]">
                {account.emailVerified
                  ? "Verified"
                  : role === "customer"
                    ? "Not verified — you can still earn points, but you'll need this to redeem them."
                    : "Not verified"}
              </div>
              {!account.emailVerified && (
                <button
                  onClick={resendVerification}
                  disabled={resending}
                  className="rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  {resending ? "Sending…" : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient p-5">
            <div className="mb-3 text-sm font-bold">Change password</div>
            <label className="mb-1.5 block text-sm font-bold">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <label className="mb-1.5 block text-sm font-bold">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mb-3 w-full rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <button
              onClick={savePassword}
              disabled={changePassword.isPending || !currentPassword || !newPassword}
              className="rounded-[var(--radius-btn)] px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {changePassword.isPending ? "Saving…" : "Update password"}
            </button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ProfileShell sections={sections} />

      {onLogout && (
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] py-3 text-sm font-bold text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify in the browser**

1. Sign in at `/admin-login` as an outlet admin (`thamel@coffesarowar.com` / `password`), open Settings → Account tab: Profile and Security sections both render; Security shows Email verification + Change password.
2. Sign in as a platform admin (`admin@stampd.co` / `password`), open Platform Settings: Profile and Security render; Security shows **only** Change password — no Email verification block (matches the existing `role !== "platform"` guard).
3. Save a name change and (for the admin) confirm the resend-verification button still posts correctly if the account happens to be unverified.

- [ ] **Step 5: Full verification**

```bash
npm test -w backend && npm run lint
```

Expected: full backend chain green (no backend files touched, so this confirms nothing broke elsewhere), frontend typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/shared/AccountSettingsForm.tsx
git commit -m "feat: regroup staff and platform account settings into ProfileShell sections"
```

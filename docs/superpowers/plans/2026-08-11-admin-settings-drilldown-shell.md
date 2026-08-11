# Admin Settings Drill-Down Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the `SettingsList` drill-down/master-detail shell (built in the customer settings plan) to `AccountSettingsForm` (admin/platform) and to `AdminSettings`, replacing `SettingsTabs`, and rename the two config tabs to match the spec's "mental model" grouping.

**Architecture:** `AccountSettingsForm` swaps its internal `ProfileShell` for `SettingsList` (same one-line-import change as `CustomerProfilePanel` got). `AdminSettings` swaps `SettingsTabs` for a top-level `SettingsList` whose three rows are Account (`AccountSettingsForm role="admin"`), Privacy / Data collection (renamed from "Customer Info", same `CustomerInfoSettingsTab`), and Staff (renamed from "Sub-Admin", same `SubAdminSettingsTab`, still gated to the primary admin). `PlatformSettings` needs no changes — it renders `AccountSettingsForm` directly, so it inherits the shell swap automatically.

**Tech Stack:** React, TypeScript, Tailwind CSS — no new dependencies.

## Global Constraints

- No new npm dependencies.
- Reuse existing CSS variables — no new design tokens.
- No frontend unit test runner in this repo; verification = `tsc --noEmit` + manual browser check at `375x812` and `1280x800`.
- Depends on `SettingsList` from `docs/superpowers/plans/2026-08-11-customer-settings-drilldown-shell.md` (Task 1) already being merged — that file, `frontend/src/components/shared/profile/SettingsList.tsx`, is only read here, not modified.
- `SubAdminSettingsTab` and `CustomerInfoSettingsTab` internals are **not modified** — only how they're reached (row label + nesting) changes.
- `ProfileShell.tsx` and `SettingsTabs.tsx` are left in place after this plan (not deleted) — confirm with a repo-wide grep in Task 3 that nothing else still imports them before considering removal in a later cleanup, since removal isn't this plan's job.

---

### Task 1: Swap `AccountSettingsForm` onto `SettingsList`

**Files:**
- Modify: `frontend/src/components/shared/AccountSettingsForm.tsx:7` (import), `:97` (type rename), `:183` (render swap)

**Interfaces:**
- Consumes: `SettingsList`, `SettingsSection` from `frontend/src/components/shared/profile/SettingsList.tsx`.

- [ ] **Step 1: Update the import**

Replace line 7:

```tsx
import { ProfileShell, type ProfileSection } from "./profile/ProfileShell";
```

with:

```tsx
import { SettingsList, type SettingsSection } from "./profile/SettingsList";
```

- [ ] **Step 2: Rename the sections array type**

At line 97, replace:

```tsx
  const sections: ProfileSection[] = [
```

with:

```tsx
  const sections: SettingsSection[] = [
```

(Contents unchanged — Profile and Security section objects, lines 98–179.)

- [ ] **Step 3: Swap the rendered shell**

At line 183, replace:

```tsx
      <ProfileShell sections={sections} />
```

with:

```tsx
      <SettingsList sections={sections} />
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared/AccountSettingsForm.tsx
git commit -m "feat(settings): use drill-down SettingsList shell in AccountSettingsForm"
```

---

### Task 2: Rebuild `AdminSettings` on `SettingsList` with renamed rows

**Files:**
- Modify: `frontend/src/routes/admin/AdminSettings.tsx` (full rewrite of the component body — file is only 29 lines)

**Interfaces:**
- Consumes: `SettingsList`, `SettingsSection` from `frontend/src/components/shared/profile/SettingsList.tsx`; `AccountSettingsForm` (unchanged props: `role="admin"`); `CustomerInfoSettingsTab` (unchanged, no props); `SubAdminSettingsTab` (unchanged, no props); `useAdminSettings` (unchanged, existing hook — reads `settings?.staffRole`).

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `frontend/src/routes/admin/AdminSettings.tsx` with:

```tsx
import { User, ShieldQuestion, Users } from "lucide-react";
import { AccountSettingsForm } from "../../components/shared/AccountSettingsForm";
import { SettingsList, type SettingsSection } from "../../components/shared/profile/SettingsList";
import { CustomerInfoSettingsTab } from "../../components/admin/CustomerInfoSettingsTab";
import { SubAdminSettingsTab } from "../../components/admin/SubAdminSettingsTab";
import { useAdminSettings } from "../../hooks/useAdminSettings";

export default function AdminSettings() {
  const { data: settings } = useAdminSettings();

  const sections: SettingsSection[] = [
    { id: "account", label: "Account", icon: User, content: <AccountSettingsForm role="admin" /> },
    {
      id: "privacy",
      label: "Privacy & data collection",
      icon: ShieldQuestion,
      content: <CustomerInfoSettingsTab />,
    },
    // Only the primary admin (staffRole null) can manage_staff — a manager
    // sees the other two rows; a staff account never reaches Settings at
    // all. This gate is convenience only: the server refuses regardless.
    ...(settings?.staffRole === null
      ? [{ id: "staff", label: "Staff", icon: Users, content: <SubAdminSettingsTab /> } as SettingsSection]
      : []),
  ];

  return (
    <div>
      <h1 className="font-display text-[28px] font-bold tracking-[-0.015em] text-[var(--ink)]">Settings</h1>
      <p className="mb-6 text-[var(--muted)]">Your account, and what you collect from customers.</p>
      <SettingsList sections={sections} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 3: Grep for other `SettingsTabs` consumers**

Run: `grep -rn "SettingsTabs" frontend/src --include='*.tsx'`
Expected: only the definition file (`frontend/src/components/shared/SettingsTabs.tsx`) remains — `AdminSettings.tsx` no longer imports it. Do not delete `SettingsTabs.tsx` in this plan even if it's now unused; leaving dead exports for a follow-up cleanup pass is the existing repo convention (see Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/admin/AdminSettings.tsx
git commit -m "feat(settings): rebuild AdminSettings on SettingsList, rename Customer Info/Sub-Admin rows"
```

---

### Task 3: Manual verification across admin and platform surfaces

**Files:** none (verification only).

- [ ] **Step 1: Verify `AdminSettings` — mobile**

Start the dev server, log in as a primary admin (staffRole `null`), navigate to Settings, resize to `375x812`.

Verify:
- Row list shows "Account", "Privacy & data collection", "Staff" (three rows, no tabs).
- Tapping "Account" drills into a **second-level** list (Profile, Security — this nesting is expected, since `AccountSettingsForm` has its own internal `SettingsList`), each behaving like Task 3 of the customer plan (back row returns one level).
- Tapping "Privacy & data collection" shows the same two toggles (collect DOB, collect gender) as before this plan — content unchanged, just relabeled/relocated.
- Tapping "Staff" shows the existing staff list/PIN/invite UI unchanged.

- [ ] **Step 2: Verify `AdminSettings` — desktop**

Resize to `1280x800`, reload.

Verify:
- Top-level list (Account/Privacy/Staff) visible on the left, "Account" content visible on the right by default.
- Clicking "Account" in the outer list shows `AccountSettingsForm`'s own list+pane nested inside the outer content pane (list-in-list is expected and matches the customer plan's Security screen pattern of one row = one form, not a redesign of `AccountSettingsForm` itself).

- [ ] **Step 3: Verify manager role sees no Staff row**

Log in as a manager-role staff account (`staffRole !== null`), navigate to Settings.

Verify: only "Account" and "Privacy & data collection" rows are present — no "Staff" row.

- [ ] **Step 4: Verify `PlatformSettings`**

Navigate to the platform admin Settings route, at both `375x812` and `1280x800`.

Verify: same `SettingsList`-based Profile/Security nesting from Task 1 renders correctly (platform role skips the email-verification card inside Security, per existing `role !== "platform"` check at `AccountSettingsForm.tsx:129` — unchanged by this plan).

- [ ] **Step 5: Commit** (only if Step 1–4 surfaced a fix; otherwise this task has no code changes to commit)

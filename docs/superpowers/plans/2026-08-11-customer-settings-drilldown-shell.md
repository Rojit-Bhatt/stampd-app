# Customer Settings Drill-Down Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ProfileShell`'s rail/pane layout in `CustomerProfilePanel` with a WhatsApp/Telegram-style drill-down list on mobile and a master-detail split on desktop, with no changes to section content yet.

**Architecture:** New `SettingsList` component (`frontend/src/components/shared/profile/SettingsList.tsx`) replaces `ProfileShell` for this surface. Single component, single `activeId` state: on mobile (`<md`), `activeId === null` shows the row list, any other value shows only that section's content with a back row; on desktop (`md+`), the list is always visible on the left and the content pane always shows a section (falls back to the first section when nothing's been clicked yet) — no separate mobile/desktop code paths, just responsive Tailwind classes on one tree.

**Tech Stack:** React, TypeScript, Tailwind CSS (existing app conventions — no new dependencies).

## Global Constraints

- No new npm dependencies.
- Reuse existing CSS variables (`--radius-btn`, `--radius-card`, `--surface`, `--surface-2`, `--line`, `--ink`, `--muted`, `--primary`, `--primary-soft`, `--primary-deep`, `--bg`) — do not introduce new design tokens.
- This repo has no frontend unit test runner (`frontend/package.json` only has `lint` = `tsc --noEmit`, no vitest/jest). Verification steps are: `tsc --noEmit` for type safety, plus manual browser verification through the dev server preview at both a mobile (`375px`) and desktop (`1280px`) viewport width — this matches how prior frontend features in this repo were verified (see `docs/superpowers/specs/2026-08-11-profile-settings-redesign-design.md`, "Testing considerations").
- Section content (`Card` components, form fields, handlers) inside `CustomerProfilePanel` is **not modified** in this plan — only the shell/navigation wrapping it changes. Mechanic changes (password, avatar, push) are separate plans.
- `ProfileShell.tsx` itself is not deleted — `AccountSettingsForm.tsx` (admin/staff/platform) still uses it until the admin nav plan lands.

---

### Task 1: Build the `SettingsList` shell component

**Files:**
- Create: `frontend/src/components/shared/profile/SettingsList.tsx`

**Interfaces:**
- Produces: `SettingsList({ sections }: { sections: SettingsSection[] })` — React component.
- Produces: `interface SettingsSection { id: string; label: string; icon: LucideIcon; danger?: boolean; content: ReactNode }` — same shape as `ProfileShell`'s existing `ProfileSection`, renamed so both shells can coexist without a naming collision during the transition.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface SettingsSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Red-tinted row — this app's one case is "Delete account". */
  danger?: boolean;
  content: ReactNode;
}

function rowClass(section: SettingsSection, isActive: boolean) {
  const base =
    "flex w-full items-center gap-3 rounded-[var(--radius-btn)] px-3.5 py-3 text-[13.5px] font-semibold transition-colors text-left";
  if (section.danger) {
    const activeCls = isActive ? "md:bg-red-50 md:text-red-600 dark:md:bg-red-950/30 dark:md:text-red-400" : "";
    return `${base} text-red-500/80 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 ${activeCls}`;
  }
  const activeCls = isActive ? "md:bg-[var(--primary-soft)] md:text-[var(--primary-deep)]" : "";
  return `${base} text-[var(--ink)] hover:bg-[var(--surface-2)] ${activeCls}`;
}

/**
 * WhatsApp/Telegram-style settings list: a row per section. On mobile,
 * tapping a row drills into a full-width sub-screen with a back row; on
 * desktop there's room for both, so the list stays visible on the left
 * and the content pane on the right shows the selected section (falling
 * back to the first section before anything's been clicked).
 *
 * `activeId` only tracks "what mobile is drilled into" — the desktop
 * pane derives its own fallback from `sections[0]` so first paint on a
 * wide screen isn't an empty "pick something" state.
 */
export function SettingsList({ sections }: { sections: SettingsSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const desktopActive = sections.find((s) => s.id === activeId) ?? sections[0] ?? null;

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <nav
        className={`flex-col gap-1 md:flex md:w-[240px] md:flex-shrink-0 ${
          activeId ? "hidden md:flex" : "flex"
        }`}
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveId(section.id)}
            className={rowClass(section, desktopActive?.id === section.id)}
          >
            <section.icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{section.label}</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--muted)] md:hidden" />
          </button>
        ))}
      </nav>

      <div
        className={`min-w-0 flex-1 flex-col md:flex ${activeId ? "flex" : "hidden md:flex"}`}
      >
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)] md:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </button>
        <div className="mb-3 hidden text-sm font-bold md:block">{desktopActive?.label}</div>
        {desktopActive?.content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run lint`
Expected: no new errors from `SettingsList.tsx` (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared/profile/SettingsList.tsx
git commit -m "feat(settings): add drill-down/master-detail SettingsList shell"
```

---

### Task 2: Swap `CustomerProfilePanel` onto `SettingsList`

**Files:**
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx:10` (import), `:263` (rename `ProfileSection[]` → `SettingsSection[]`), `:537-539` (swap `<ProfileShell sections={sections} />` for `<SettingsList sections={sections} />`)

**Interfaces:**
- Consumes: `SettingsList` and `SettingsSection` from Task 1 (`frontend/src/components/shared/profile/SettingsList.tsx`).

- [ ] **Step 1: Update the import**

In `frontend/src/components/customer/CustomerProfilePanel.tsx`, replace line 10:

```tsx
import { ProfileShell, type ProfileSection } from "../shared/profile/ProfileShell";
```

with:

```tsx
import { SettingsList, type SettingsSection } from "../shared/profile/SettingsList";
```

- [ ] **Step 2: Rename the sections array type**

At line 263, replace:

```tsx
  const sections: ProfileSection[] = [
```

with:

```tsx
  const sections: SettingsSection[] = [
```

(The array contents — all six section objects, lines 264–535 — are unchanged.)

- [ ] **Step 3: Swap the rendered shell**

At lines 537–539, replace:

```tsx
    <div className="flex flex-col gap-6">
      <ProfileShell sections={sections} />
```

with:

```tsx
    <div className="flex flex-col gap-6">
      <SettingsList sections={sections} />
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npm run lint`
Expected: no errors. Confirms no other file still expects `ProfileShell`/`ProfileSection` to be exported from `CustomerProfilePanel`'s import path.

- [ ] **Step 5: Manual verification — mobile drill-down**

Start the dev server (`npm run dev` in `frontend/`, or via the project's existing preview workflow), navigate to the customer profile route (`/explore/profile` or `/:company/:outlet/settings` while logged in as a customer), resize the viewport to `375x812`.

Verify:
- Page loads showing only the row list (Profile, Notifications, Appearance, Security, Danger zone — content unchanged from before this plan), no content pane visible.
- Tapping "Profile" replaces the list with the Profile section's content (avatar picker + name card) plus a "‹ Settings" back row at the top.
- Tapping "‹ Settings" returns to the row list.
- Tapping "Danger zone" shows it red-tinted in the list before drilling in, and the delete-account card after.

- [ ] **Step 6: Manual verification — desktop master-detail**

Resize the viewport to `1280x800`, reload.

Verify:
- Row list is visible on the left (`~240px` wide) and the Profile section's content is visible on the right simultaneously, with no click needed.
- Clicking "Security" updates the right pane to the Security section while the list stays visible and "Security" is highlighted.
- Clicking "Danger zone" highlights it red in the list and shows the delete-account card on the right, list still visible.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/customer/CustomerProfilePanel.tsx
git commit -m "feat(settings): use drill-down SettingsList shell for customer profile"
```

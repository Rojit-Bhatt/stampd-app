# Staff Console Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing (but currently unused) `.dark` CSS token block in `frontend/src/index.css` up to a real light/dark toggle for the three fixed-identity staff consoles — admin (outlet staff), platform (super-admin), and company (owner) — and fix every hardcoded colour in those consoles' component tree that would otherwise render unreadable once dark mode goes live.

**Architecture:** One hook (`useTheme`) applies/removes the `dark` class on `document.documentElement` from inside a `useLayoutEffect` whose cleanup runs on unmount — since the three console layouts are mutually exclusive route subtrees and no customer route ever calls the hook, dark mode is live exactly while a staff console is on screen and vanishes the instant the user navigates elsewhere, with no new CSS scoping. One shared `localStorage` preference (`theme_preference`) across all three consoles. One `ThemeToggle` component wraps the hook in a sun/moon icon button; each layout supplies its own `className` to match its existing chrome. Everything else is a colour-token cleanup pass over the eleven files the spec's grep identified as unsafe once `.dark` actually applies.

**Tech Stack:** React 19 + Vite + TS + Tailwind v4, `lucide-react` (already a dependency) for icons. Pure frontend change — no backend routes, models, or services are touched.

**Spec:** `docs/superpowers/specs/2026-08-02-staff-console-dark-mode-design.md`

## Global Constraints

- **This is a frontend-only change.** No file under `backend/` is created or modified in this plan. If a task seems to need one, that's a signal to stop and re-read the spec's scope section rather than proceed.
- **The customer console is out of scope.** Do not add a `ThemeToggle`, call `useTheme()`, or modify any file under `components/customer/`, any customer-facing route, `lib/color.ts`, or `scripts/verify-tenant-color.ts`.
- **`routes/platform/landing/`, `routes/platform/legal/`, and `routes/platform/reviewqr/` are out of scope** — they are public/marketing surfaces with their own permanently-dark `.landing-dark` system, not staff consoles. Do not touch any file under these three subtrees.
- **`--primary`/`--plat` (fixed-identity platform/admin green) and `--brand` (tenant identity) must never swap jobs, and neither is introduced or removed by this change.** A toggle changes `--bg`/`--surface`/`--ink`/`--muted`/`--soft`/`--line` and the semantic `--ok`/`--warn`/`--err` pairs — never which token means what.
- **The `.dark` token block in `index.css` already exists in full and is not modified by this plan.** This is a wiring task, not a token-design task.
- **`document.documentElement` (`<html>`) is the toggle's target**, applied/removed by `useTheme()`'s own effect lifecycle — never applied once globally from `App.tsx`, which would leak dark mode into the excluded customer console and the always-dark public landing page.
- **One shared `localStorage` key, `"theme_preference"`, values `"light"` | `"dark"`.** No stored value falls back to `window.matchMedia("(prefers-color-scheme: dark)")`.
- **`PlatformLayout`'s header (`bg-[var(--ink)]`) is deliberately never themed** — see Task 3. This is the one file where the fix is "make it stop responding to the toggle," not "make it respond correctly."
- **No new npm dependencies.** `lucide-react` (`Sun`, `Moon`) is already installed.
- **Frontend has no test runner.** Verification is `npm run lint` (`tsc --noEmit`) from the repo root — clean after every task.
- **`AdminOverview.tsx`'s two chart series colours (`CHART_EARNED_COLOR`, `CHART_REDEEMED_COLOR`) are explicitly flagged, not fixed**, per the spec's "Known gap" — do not invent new chroma/CVD-validated colours for them in this plan.
- Run all commands from the repo root unless a step says otherwise.
- Commit after each task.

---

## File Structure

New files:
- `frontend/src/hooks/useTheme.ts` — the toggle mechanism (state, `matchMedia` fallback, `localStorage` persistence, mount-scoped `.dark` class lifecycle).
- `frontend/src/components/shared/ThemeToggle.tsx` — sun/moon icon button wrapping `useTheme()`, `className` prop for per-layout styling.

Modified (mechanism):
- `frontend/src/components/admin/AdminLayout.tsx` — mounts `ThemeToggle` in the sidebar footer next to `AccountMenu`.
- `frontend/src/components/company/CompanyLayout.tsx` — same placement/styling as Admin.
- `frontend/src/components/platform/PlatformLayout.tsx` — mounts `ThemeToggle` in the header next to `AccountMenu`; also gets the `bg-[var(--ink)]` → `bg-[#14201C]` header fix.

Modified (colour-token cleanup, grouped by fix category):
- `frontend/src/routes/admin/MenuManagement.tsx` — toggle-track hardcoded hex → token; featured-badge colours already correct (no change, verified in Task 8).
- `frontend/src/routes/admin/AdminContact.tsx` — day-hours toggle `bg-gray-200` → token; customer-view preview pinned.
- `frontend/src/routes/platform/RegisterCompany.tsx` — mint border → token-opacity; two `bg-white` → `bg-[var(--surface)]`.
- `frontend/src/components/admin/MenuImportPreviewModal.tsx` — two hardcoded borders → token-opacity.
- `frontend/src/components/admin/SuspendedOverlay.tsx` — `bg-white` → `bg-[var(--surface)]`.
- `frontend/src/routes/platform/CompanyDetail.tsx` — `bg-white` → `bg-[var(--surface)]`.
- `frontend/src/routes/company/CompanyDashboard.tsx` — `bg-white` → `bg-[var(--surface)]`.
- `frontend/src/routes/admin/GenerateQr.tsx` — QR display box pinned to always-light.
- `frontend/src/routes/admin/RedeemPoints.tsx` — same, redeem QR box.
- `frontend/src/routes/admin/Branding.tsx` — customer-view branding preview pinned.

Untouched (confirmed in Task 8, not modified anywhere in this plan): everything under `components/customer/`, every customer-facing route, `lib/color.ts`, `scripts/verify-tenant-color.ts`, the platform landing/legal/review-QR subtrees, `AdminLogin.tsx`, `routes/platform/PlatformLogin.tsx`, `components/admin/CampaignFormModal.tsx`, `routes/admin/AdminCampaigns.tsx` (line 89), `routes/admin/MenuManagement.tsx` (line 365 and the toggle-knob `bg-white`), `components/ui/switch.tsx`, `components/admin/AdminLayout.tsx`'s brand-fallback logo tile, `components/shared/StampdLogo.tsx`, `routes/admin/AdminOverview.tsx`'s chart colours.

---

### Task 1: `useTheme` hook + `ThemeToggle` component, wired into `AdminLayout`

**Files:**
- Create: `frontend/src/hooks/useTheme.ts`
- Create: `frontend/src/components/shared/ThemeToggle.tsx`
- Modify: `frontend/src/components/admin/AdminLayout.tsx`

**Interfaces:**
- Produces: `useTheme() -> { theme: "light" | "dark", toggle: () => void }`
- Produces: `<ThemeToggle className?: string />` (renders a `<button>`; internally calls `useTheme()`)
- Consumed later by: Task 2 (`CompanyLayout`), Task 3 (`PlatformLayout`)

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useTheme.ts`:

```ts
import { useCallback, useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme_preference";

function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    // Private mode / storage disabled — fall through to system preference.
    return null;
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
}

/**
 * Wires the `.dark` token block in index.css to a real toggle. Used by all
 * three staff console layouts (AdminLayout, CompanyLayout, PlatformLayout —
 * the only three call sites) and nowhere else: the customer console and the
 * public landing page never call this hook.
 *
 * The `.dark` class lives on `document.documentElement` (every token in
 * index.css is written against `:root`/`.dark`), but it is applied AND
 * REMOVED by this hook's own effect cleanup — not once globally from
 * App.tsx. That means dark mode is live exactly while one of the three
 * console layouts is mounted, and disappears the instant the user navigates
 * to a customer or public route. Since the three console layouts are
 * mutually exclusive route subtrees, only one instance of this hook is ever
 * "in charge" of the class at a time.
 *
 * Preference is one shared localStorage key across all three consoles — one
 * person is behind all of them, so toggling in the admin console and later
 * opening the platform console remembers the choice. No stored preference
 * falls back to the OS-level `prefers-color-scheme`.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => readStoredTheme() ?? (systemPrefersDark() ? "dark" : "light"),
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");

    // Cleanup runs on every re-run of this effect (toggling) AND on unmount
    // (navigating away). Removing the class unconditionally here — rather
    // than only on unmount — is safe: on a toggle, the effect body that
    // follows immediately re-adds it if the new theme is dark, and both
    // happen synchronously before the browser paints (useLayoutEffect), so
    // there's no flash. On a true unmount, nothing follows, so the class is
    // left off — which is the whole point: dark mode must not leak into
    // whatever route is mounted next.
    return () => {
      root.classList.remove("dark");
    };
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Non-fatal: the toggle still works for the life of the tab.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
```

- [ ] **Step 2: Create the toggle component**

Create `frontend/src/components/shared/ThemeToggle.tsx`:

```tsx
import { Moon, Sun } from "lucide-react";

import { useTheme } from "../../hooks/useTheme";

interface ThemeToggleProps {
  /**
   * Each of the three console layouts styles this to match its own chrome
   * (AdminLayout/CompanyLayout: sidebar-footer icon button using the ambient
   * theme tokens; PlatformLayout: header icon button, literal hex — see
   * PlatformLayout.tsx for why its header never themes at all).
   */
  className?: string;
}

/**
 * Sun/moon icon button wrapping useTheme(). The icon shown is the
 * DESTINATION, not the current state — a moon while light (tap for dark), a
 * sun while dark (tap for light) — matching how the rest of this console's
 * icon-only affordances describe the action, not the status quo.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className={className}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
```

- [ ] **Step 3: Wire it into `AdminLayout`**

In `frontend/src/components/admin/AdminLayout.tsx`, add the import next to the existing `AccountMenu` import:

```tsx
import { AccountMenu } from "../shared/AccountMenu";
import { ThemeToggle } from "../shared/ThemeToggle";
```

Then replace the sidebar-footer block:

```tsx
        <div className="mt-2 border-t border-[var(--line)] pt-3">
          <AccountMenu
            initial={(account?.name || user?.name || "?").charAt(0).toUpperCase()}
            name={account?.name || user?.name || ""}
            settingsPath="settings"
            onLogout={handleLogout}
            dropUp
          />
        </div>
```

with:

```tsx
        <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-3">
          <div className="min-w-0 flex-1">
            <AccountMenu
              initial={(account?.name || user?.name || "?").charAt(0).toUpperCase()}
              name={account?.name || user?.name || ""}
              settingsPath="settings"
              onLogout={handleLogout}
              dropUp
            />
          </div>
          <ThemeToggle className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]" />
        </div>
```

`AccountMenu`'s own trigger button is `w-full` by design, so it needs the `min-w-0 flex-1` wrapper to share the row with a fixed-size icon button rather than pushing it off — the same shrink pattern already used for `AccountMenu`'s own `compact`-mode text.

- [ ] **Step 4: Verify**

```bash
npm run lint
```

Expected: clean, no TypeScript errors.

Live check: start the app (`MONGODB_URI="" npm run dev -w backend` in one terminal, `npm run dev -w frontend` in another, or `npm run dev` from the repo root if `backend/.env` has no real `MONGODB_URI` set), sign in to any outlet admin console, and confirm:
- A moon icon sits beside the account menu in the sidebar footer.
- Clicking it flips the whole console to dark surfaces/ink and the icon becomes a sun.
- `localStorage.getItem("theme_preference")` reads `"dark"` after the click.
- Reloading the page keeps dark mode (persistence).
- Clicking again returns to light and `localStorage` reads `"light"`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTheme.ts frontend/src/components/shared/ThemeToggle.tsx frontend/src/components/admin/AdminLayout.tsx
git commit -m "feat: wire a light/dark theme toggle into the admin console"
```

---

### Task 2: Wire `ThemeToggle` into `CompanyLayout`

**Files:**
- Modify: `frontend/src/components/company/CompanyLayout.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` from `frontend/src/components/shared/ThemeToggle.tsx` (Task 1)

- [ ] **Step 1: Add the import**

In `frontend/src/components/company/CompanyLayout.tsx`, add next to the existing `AccountMenu` import:

```tsx
import { AccountMenu } from "../shared/AccountMenu";
import { ThemeToggle } from "../shared/ThemeToggle";
```

- [ ] **Step 2: Wire the toggle into the sidebar footer**

Replace:

```tsx
      <div className="mt-auto border-t border-[var(--line)] pt-3">
        <AccountMenu
          initial={account.name.charAt(0).toUpperCase()}
          name={account.name}
          email={account.email}
          settingsPath="/company"
          onLogout={logout}
          accent="var(--primary)"
          dropUp
        />
      </div>
```

with:

```tsx
      <div className="mt-auto flex items-center gap-2 border-t border-[var(--line)] pt-3">
        <div className="min-w-0 flex-1">
          <AccountMenu
            initial={account.name.charAt(0).toUpperCase()}
            name={account.name}
            email={account.email}
            settingsPath="/company"
            onLogout={logout}
            accent="var(--primary)"
            dropUp
          />
        </div>
        <ThemeToggle className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]" />
      </div>
```

This is placement follows the actual existing convention (sidebar footer, identical to `AdminLayout`) rather than the brief's "header area" shorthand — the company console has no header-area account control to match, as the spec's "Toggle placement" section explains.

- [ ] **Step 3: Verify**

```bash
npm run lint
```

Expected: clean.

Live check: sign in as a company owner (`owner@coffesarowar.com` / `password` against the seeded demo data), confirm the same moon/sun toggle appears in the company console's sidebar footer, toggles the console dark, and shares the `theme_preference` value already set from Task 1's admin-console test (open the company console in the same browser right after toggling the admin console — it should already be dark on first paint).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/company/CompanyLayout.tsx
git commit -m "feat: wire the theme toggle into the company console"
```

---

### Task 3: Wire `ThemeToggle` into `PlatformLayout`, and fix its header's one theme-reactive token

**Files:**
- Modify: `frontend/src/components/platform/PlatformLayout.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` from `frontend/src/components/shared/ThemeToggle.tsx` (Task 1)

**Why this task also touches the header fix, not just the toggle:** `PlatformLayout`'s header is a deliberately-always-dark data desk ("Dark chrome, on purpose... this one is a data desk" per its own comment), unconditionally independent of any theme — that's pre-existing, not new. Today it's `bg-[var(--ink)] text-[#E9F0EC]`. `text-[#E9F0EC]` and the sibling `text-[#8DA79A]`/`text-[#6E8578]`/`bg-white/10` are already literal hex, which is correct for "always dark." But `bg-[var(--ink)]` is a live token reference, and `--ink` is the one token that inverts between light and dark mode. The instant `.dark` exists anywhere in the app, toggling dark mode flips this header's background from dark-navy to near-white — while the sibling text stays literally `#E9F0EC` (light) — producing light text on a light header, the exact "unreadable" failure this whole pass exists to prevent, and it would land in the one place already designed to be immune to the toggle. Landing the toggle and this fix in the same task means the console can never be in a state where the toggle exists but this header bug does too.

- [ ] **Step 1: Add the import**

In `frontend/src/components/platform/PlatformLayout.tsx`, add next to the existing `AccountMenu` import:

```tsx
import { AccountMenu } from "../shared/AccountMenu";
import { ThemeToggle } from "../shared/ThemeToggle";
```

- [ ] **Step 2: Fix the header's theme-reactive token**

Replace:

```tsx
      <header className="sticky top-0 z-30 bg-[var(--ink)] text-[#E9F0EC]">
```

with:

```tsx
      <header className="sticky top-0 z-30 bg-[#14201C] text-[#E9F0EC]">
```

This isn't "hardcoding a colour that should be a token" — the opposite: this header was already deliberately hardcoded everywhere else in it (the nav pills, the search button, the account-menu accent all already use literal hex or are exempt for other reasons); the one remaining token reference was an oversight, now made visible by turning the toggle on. `#14201C` is today's `--ink` light-mode value — the header keeps looking exactly as it does today, in both themes, forever. No other part of `PlatformLayout` needs this treatment: the page body below the header (`bg-[var(--bg)] text-[var(--ink)]`) is meant to flip with the theme like every other console surface.

- [ ] **Step 3: Wire the toggle into the header, next to `AccountMenu`**

Replace:

```tsx
          <div className="flex-shrink-0">
            <AccountMenu
              initial={(account?.name || user.name).charAt(0).toUpperCase()}
              name={account?.name || user.name}
              settingsPath="/platform/settings"
              onLogout={() => {
                logout();
                navigate("/platform/login");
              }}
              accent="var(--primary)"
              compact
            />
          </div>
```

with:

```tsx
          <ThemeToggle className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-white/10 text-[#8DA79A] transition-colors hover:text-white" />

          <div className="flex-shrink-0">
            <AccountMenu
              initial={(account?.name || user.name).charAt(0).toUpperCase()}
              name={account?.name || user.name}
              settingsPath="/platform/settings"
              onLogout={() => {
                logout();
                navigate("/platform/login");
              }}
              accent="var(--primary)"
              compact
            />
          </div>
```

Styled like the header's other icon buttons (the `⌘K` search trigger, a few lines above: `bg-white/10 ... text-[#8DA79A] ... hover:text-white`) — fixed hex colours, not tokens, because this header never themes (Step 2 is exactly why).

- [ ] **Step 4: Verify**

```bash
npm run lint
```

Expected: clean.

Live check: sign in as the platform admin (`admin@stampd.co` / `password`). Confirm:
- A moon/sun toggle sits in the header next to the account menu, styled like the search button.
- Toggling to dark mode: the page body (`--bg`/`--surface`/`--ink`) goes dark, but **the header stays exactly the same dark navy it always was** — this is the assertion that matters. Zoom in on the header text/background before and after; nothing about it should change.
- Toggling back to light: same thing — the header still doesn't move, proving it's genuinely independent of the toggle in both directions, not just "happens to look dark by default."

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/platform/PlatformLayout.tsx
git commit -m "feat: wire the theme toggle into the platform console, pin its header dark"
```

---

### Task 4: Fix hardcoded literals with no dark equivalent — toggle tracks and mint/warn borders

**Files:**
- Modify: `frontend/src/routes/admin/MenuManagement.tsx`
- Modify: `frontend/src/routes/admin/AdminContact.tsx`
- Modify: `frontend/src/routes/platform/RegisterCompany.tsx` (one fix; the other two `bg-white` fixes are Task 5)
- Modify: `frontend/src/components/admin/MenuImportPreviewModal.tsx`

None of these four files introduce any new pattern — every fix below resolves to a token, or a token scaled to partial opacity via Tailwind's `/NN` suffix, a convention already used elsewhere in this codebase (`ring-[var(--primary)]/25` in `ui/input.tsx` and `ui/select.tsx`).

- [ ] **Step 1: `MenuManagement.tsx` — menu-visibility toggle track**

Find:

```tsx
        <button
          onClick={() => updateSettings.mutate({ menuEnabled: !menuEnabled })}
          className="relative h-8 w-14 rounded-full transition-colors"
          style={{ background: menuEnabled ? "var(--brand)" : "#DDD2CB" }}
          aria-pressed={menuEnabled}
          aria-label="Toggle menu visibility"
        >
```

Replace the `style` line:

```tsx
          style={{ background: menuEnabled ? "var(--brand)" : "var(--line)" }}
```

`#DDD2CB` is a light warm-gray with no dark-mode equivalent; `--line` already has one and is the "unchecked track" convention used elsewhere in this file's own sibling toggles.

- [ ] **Step 2: `AdminContact.tsx` — day-hours toggle track**

Find:

```tsx
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        dh.isOpen ? "bg-[var(--primary)]" : "bg-gray-200"
                      }`}
```

Replace with:

```tsx
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        dh.isOpen ? "bg-[var(--primary)]" : "bg-[var(--surface-2)]"
                      }`}
```

`bg-gray-200` is an un-migrated Tailwind default that never got moved onto the token system; this matches `ui/switch.tsx`'s own unchecked-track convention (`data-[state=unchecked]:bg-[var(--surface-2)]`).

- [ ] **Step 3: `RegisterCompany.tsx` — success-panel border**

Find:

```tsx
        <div className="shadow-ambient rounded-[var(--radius-card)] border border-[#CBE4D6] bg-[var(--ok-soft)] p-8 text-center">
```

Replace with:

```tsx
        <div className="shadow-ambient rounded-[var(--radius-card)] border border-[var(--ok)]/30 bg-[var(--ok-soft)] p-8 text-center">
```

The literal mint `#CBE4D6` border has no dark counterpart; `--ok` scaled to 30% opacity reproduces the same subtle-outline-on-soft-fill relationship in both themes.

- [ ] **Step 4: `MenuImportPreviewModal.tsx` — two section borders**

Find (the "new items" section):

```tsx
            <section className="rounded-[var(--radius-btn)] border border-[#CBE4D6] bg-[var(--ok-soft)] p-4">
```

Replace with:

```tsx
            <section className="rounded-[var(--radius-btn)] border border-[var(--ok)]/30 bg-[var(--ok-soft)] p-4">
```

Find (the "changed items" section):

```tsx
            <section className="rounded-[var(--radius-btn)] border border-[#EBDCAE] bg-[var(--warn-soft)] p-4">
```

Replace with:

```tsx
            <section className="rounded-[var(--radius-btn)] border border-[var(--warn)]/30 bg-[var(--warn-soft)] p-4">
```

Same pattern as Step 3, warn variant for the second one.

- [ ] **Step 5: Verify**

```bash
npm run lint
```

Expected: clean.

Live check: in an admin console with dark mode on, open Menu Management (confirm the visibility toggle's unchecked track is a visible dark-surface gray, not a jarring light patch) and Contact settings (same for a closed day's toggle track). Import a menu file (or trigger the preview modal any other way available) and confirm both the new-items and changed-items panel borders are visible, subtle outlines against their tinted backgrounds — not invisible, not stark.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/admin/MenuManagement.tsx frontend/src/routes/admin/AdminContact.tsx frontend/src/routes/platform/RegisterCompany.tsx frontend/src/components/admin/MenuImportPreviewModal.tsx
git commit -m "fix: replace hardcoded toggle-track and success/warn border colours with tokens"
```

---

### Task 5: Fix `bg-white` boxes with inherited or explicit token text (real "unreadable" bugs)

**Files:**
- Modify: `frontend/src/components/admin/SuspendedOverlay.tsx`
- Modify: `frontend/src/routes/platform/RegisterCompany.tsx`
- Modify: `frontend/src/routes/platform/CompanyDetail.tsx`
- Modify: `frontend/src/routes/company/CompanyDashboard.tsx`

Each of these is a `bg-white` box sitting under text that either inherits the ambient `var(--ink)` (genuinely unreadable once `.dark` is live: light text on the box's own hardcoded-white background) or uses an explicit `var(--ok)`/`var(--warn)`/`var(--primary-deep)` colour (not literally unreadable, but a stark white patch against an otherwise-themed page). All five fix the same way: swap the literal white for the surface token.

- [ ] **Step 1: `SuspendedOverlay.tsx` — the "Log out" button**

Find:

```tsx
        <button
          onClick={onLogout}
          className="stamp-interactive mt-5 rounded-full border border-[var(--line)] bg-white px-5 py-2.5 text-sm font-bold"
        >
          Log out
        </button>
```

Replace the `className`:

```tsx
          className="stamp-interactive mt-5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-2.5 text-sm font-bold"
```

This button sets no explicit text colour, so it inherits the ambient `var(--ink)` from `body` — in dark mode that's light text, and without this fix the button would be nearly invisible against its own hardcoded-white background.

- [ ] **Step 2: `RegisterCompany.tsx` — two `bg-white` boxes**

Find (the copyable URL row):

```tsx
          <div className="mb-4 flex items-center justify-between gap-2.5 rounded-[var(--radius-btn)] border border-[var(--line)] bg-white px-4 py-3">
```

Replace with:

```tsx
          <div className="mb-4 flex items-center justify-between gap-2.5 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
```

Find (the "Back to companies" link):

```tsx
            <Link
              to="/platform"
              className="rounded-full border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold"
            >
              Back to companies
            </Link>
```

Replace the `className`:

```tsx
              className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-bold"
```

The URL row's text is explicitly `var(--primary-deep)` (not an inherited-ink bug), but a stark white patch is the wrong read against a themed page. The link has no explicit colour, so it inherits ambient ink — same shape as `SuspendedOverlay`'s button, genuinely unreadable without the fix.

- [ ] **Step 3: `CompanyDetail.tsx` — suspend/reactivate button**

Find:

```tsx
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={setStatus.isPending}
            className="rounded-[var(--radius-btn)] border bg-white px-4 py-2.5 font-bold disabled:opacity-50"
            style={{
              borderColor: suspended ? "var(--ok-soft)" : "var(--warn-soft)",
              color: suspended ? "var(--ok)" : "var(--warn)",
            }}
          >
```

Replace the `className`:

```tsx
            className="rounded-[var(--radius-btn)] border bg-[var(--surface)] px-4 py-2.5 font-bold disabled:opacity-50"
```

The button's text colour is explicitly `var(--ok)`/`var(--warn)` (not inherited ink, so not literally unreadable), but bringing it onto `--surface` keeps it consistent with every other card-level surface in the console.

- [ ] **Step 4: `CompanyDashboard.tsx` — "View subscription" pill**

Find:

```tsx
          <Link to="/company/subscription" className="rounded-full bg-white px-4 py-2 text-xs font-bold" style={{ color: "var(--warn)" }}>
            View subscription
          </Link>
```

Replace the `className`:

```tsx
          <Link to="/company/subscription" className="rounded-full bg-[var(--surface)] px-4 py-2 text-xs font-bold" style={{ color: "var(--warn)" }}>
```

Same reasoning as Step 3 — explicit `var(--warn)` text, fixed for consistency with the surrounding `--warn-soft` banner rather than literal unreadability.

- [ ] **Step 5: Verify**

```bash
npm run lint
```

Expected: clean.

Live check, all in dark mode: view a suspended tenant's console to see `SuspendedOverlay` (the Log out button must be legible, not a light-on-white ghost); register a new company through the platform console and confirm the success screen's URL row and "Back to companies" link both sit on a dark surface, not a white patch; open a company detail page as platform admin and confirm the suspend/reactivate button; log in as a company owner near a subscription limit and confirm the "View subscription" pill.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/SuspendedOverlay.tsx frontend/src/routes/platform/RegisterCompany.tsx frontend/src/routes/platform/CompanyDetail.tsx frontend/src/routes/company/CompanyDashboard.tsx
git commit -m "fix: replace bg-white with the surface token on five staff-console boxes"
```

---

### Task 6: Pin the QR display boxes to always-light (GenerateQr, RedeemPoints)

**Files:**
- Modify: `frontend/src/routes/admin/GenerateQr.tsx`
- Modify: `frontend/src/routes/admin/RedeemPoints.tsx`

A QR code needs a white background for camera scan contrast — genuinely, permanently, regardless of the admin's own theme choice — and that part is already correct. The bug is the box's *empty state* ("no active code"), which renders `text-[var(--soft)]` (icon), `text-[var(--ink)]` (label), and `text-[var(--muted)]` (caption) — all of which would go light-on-white once `.dark` is live, because those tokens invert. The fix pins the box's background AND every token used inside it to their light-mode values via an inline `style`, using the same `["--x" as any]: value` pattern already used in `TenantContext.tsx` and `AdminLayout.tsx` to inject custom properties through React's typed `CSSProperties`.

- [ ] **Step 1: `GenerateQr.tsx`**

Find:

```tsx
        <div className="mt-5 flex justify-center">
          <div className="grid h-[236px] w-[236px] place-items-center rounded-[var(--radius-card)] border border-[var(--line)] bg-white p-4">
```

Replace the inner `div`'s opening tag with:

```tsx
          <div
            className="grid h-[236px] w-[236px] place-items-center rounded-[var(--radius-card)] border p-4"
            style={{
              background: "#FFFFFF",
              borderColor: "#E4E9E6",
              ["--ink" as any]: "#14201C",
              ["--muted" as any]: "#5C6B64",
              ["--soft" as any]: "#8B9A93",
            }}
          >
```

The `fgColor="#14201C"` on the `<QRCodeSVG>` a few lines below is already hardcoded dark ink, unrelated to any token, and needs no change — it was already correct for a background that's always white.

- [ ] **Step 2: `RedeemPoints.tsx`**

Find:

```tsx
        <div className="flex justify-center">
          <div className="grid h-[236px] w-[236px] place-items-center rounded-[var(--radius-card)] border border-[var(--line)] bg-white p-4">
```

Replace the inner `div`'s opening tag with:

```tsx
          <div
            className="grid h-[236px] w-[236px] place-items-center rounded-[var(--radius-card)] border p-4"
            style={{
              background: "#FFFFFF",
              borderColor: "#E4E9E6",
              ["--ink" as any]: "#14201C",
              ["--muted" as any]: "#5C6B64",
              ["--soft" as any]: "#8B9A93",
            }}
          >
```

Same fix, same reasoning, redeem side.

- [ ] **Step 3: Verify**

```bash
npm run lint
```

Expected: clean — TypeScript accepts the `["--x" as any]` pattern because it's already used elsewhere in this codebase.

Live check, in dark mode: open Generate QR with no bill entered (empty state) — the box must stay a crisp white square with dark "Enter a bill to generate" text and a visible muted icon, not a dark box or light-on-white text. Enter a bill, generate a code, let it expire (or check immediately after — the "Code expired" state) — same check. Repeat both empty/expired checks on Redeem Points. Then generate a live QR code and confirm it's still scannable (dark modules on white background, unrelated to the fix but worth eyeballing once).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/admin/GenerateQr.tsx frontend/src/routes/admin/RedeemPoints.tsx
git commit -m "fix: pin the earn/redeem QR display boxes to always-light regardless of theme"
```

---

### Task 7: Pin the customer-view live previews to always-light (Branding, AdminContact)

**Files:**
- Modify: `frontend/src/routes/admin/Branding.tsx`
- Modify: `frontend/src/routes/admin/AdminContact.tsx`

Both `Branding.tsx` and `AdminContact.tsx` render a mockup of what the *customer* sees on their own (always-light, out-of-scope) dashboard — the branding card and the contact-info card respectively. Once `.dark` ships, these previews would otherwise render as a dark mockup of a page that is never dark: the same bug shape as Task 6, but with a larger set of tokens referenced inside each box. Same fix pattern: pin the box's background and every token actually used inside it.

- [ ] **Step 1: `Branding.tsx` — the live preview card**

Find:

```tsx
          <div className="overflow-hidden rounded-[28px] border border-[var(--line)] bg-white shadow-lg">
```

Replace with:

```tsx
          <div
            className="overflow-hidden rounded-[28px] border shadow-lg"
            style={{
              background: "#FFFFFF",
              borderColor: "#E4E9E6",
              ["--ink" as any]: "#14201C",
              ["--muted" as any]: "#5C6B64",
              ["--soft" as any]: "#8B9A93",
              ["--surface" as any]: "#FFFFFF",
              ["--line" as any]: "#E4E9E6",
              ["--primary" as any]: "#0FA968",
            }}
          >
```

These are exactly the tokens referenced inside this card today: `--ink`/`--muted`/`--soft` (business name, tagline, "Points balance" label/caption), `--surface`/`--line` (the balance sub-card), and `--primary` (the balance figure itself — Stampd's fixed green, which the preview correctly shows regardless of the outlet's own brand colour). `brand.primaryColor` and `identityAccent(brand.primaryColor)` are untouched JS values, not tokens, and need no change.

- [ ] **Step 2: `AdminContact.tsx` — the live preview card**

Find:

```tsx
          <div className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-lg">
```

Replace with:

```tsx
          <div
            className="overflow-hidden rounded-[24px] border p-4 shadow-lg"
            style={{
              background: "#FFFFFF",
              borderColor: "#E4E9E6",
              ["--ink" as any]: "#14201C",
              ["--muted" as any]: "#5C6B64",
              ["--bg" as any]: "#F7F8F7",
              ["--line" as any]: "#E4E9E6",
            }}
          >
```

These are the tokens referenced inside this card today: `--ink`/`--muted` (address, phone, email, hours, about-us text) and `--bg`/`--ink` on the social-icon circles' background/foreground. The nested Google-review mockup further inside this same card is already 100% literal hex (`#f8f9fa`/`#e8eaed`/`#202124`/`#fbbc05`/`#5f6368`/`#1a73e8`) with no token references — it was never going to move, and needs no change.

- [ ] **Step 3: Verify**

```bash
npm run lint
```

Expected: clean.

Live check, in dark mode: open Branding settings and confirm the "Live preview" card on the right stays a crisp white mockup with dark text throughout, including the "Points balance" figure in green — while the rest of the page around it (labels, inputs, the "Save branding" button's surrounding chrome) is dark. Open Contact settings and confirm the same for its preview card — address/phone/hours text stays dark-on-white, social icon circles stay visually consistent, and (if a Google review URL is set) the nested review mockup is unaffected either way since it was never token-based.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/admin/Branding.tsx frontend/src/routes/admin/AdminContact.tsx
git commit -m "fix: pin the customer-view branding and contact previews to always-light"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full frontend typecheck**

```bash
npm run lint
```

Expected: clean, 0 errors.

- [ ] **Step 2: Confirm zero backend changes**

```bash
git diff main --stat -- backend/
```

Expected: no output. This plan never touches `backend/`; if this prints anything, something went wrong in an earlier task and must be reverted before proceeding.

- [ ] **Step 3: Full backend suite, unaffected**

```bash
cd backend && MONGODB_URI="" npm test
```

Expected: the full chained suite passes with 0 failures, identical to a run against `main` — this task made no backend changes, so this is confirming "unaffected," not "newly passing."

- [ ] **Step 4: Grep sweep for anything the spec's original inventory might have missed**

```bash
cd frontend/src && grep -rn "bg-white\b" routes/admin routes/platform routes/company components/admin components/platform components/company components/ui components/shared --include="*.tsx" | grep -v "routes/platform/landing\|routes/platform/legal\|routes/platform/reviewqr"
```

Expected output: only the toggle-knob `bg-white` instances already catalogued as correct-as-is in the spec (`MenuManagement.tsx` line ~186, `AdminContact.tsx` line ~245, `components/ui/switch.tsx` line ~24 — decorative knobs riding on a colour-token track, fine in both themes) and nothing else. If any other `bg-white` shows up, it was missed by this plan — open it, determine which of Task 4/5/6/7's patterns it matches, and fix it following that pattern before considering this task done.

```bash
grep -rnE "#[0-9A-Fa-f]{3,6}\b" routes/admin routes/platform routes/company components/admin components/platform components/company components/ui components/shared --include="*.tsx" | grep -v "routes/platform/landing\|routes/platform/legal\|routes/platform/reviewqr"
```

Expected output: only the literals the spec explicitly leaves alone — `CampaignFormModal.tsx`'s `color: "#fff"` on a solid `--primary` fill, `AdminCampaigns.tsx` line ~89 and `MenuManagement.tsx` line ~365's `"#fff"` on solid fills, `AdminLayout.tsx`'s brand-fallback `"#0FA968"` and its logo tile's `"#fff"`, `StampdLogo.tsx`'s fixed coin colours, `AdminOverview.tsx`'s two flagged (not fixed) chart colours, `PlatformLayout.tsx`'s now-fixed header (`#14201C`, `#E9F0EC`, `#8DA79A`, `#6E8578`) which is supposed to be literal, and every hex literal inside this plan's own Task 6/7 pinned `style` objects (`#FFFFFF`, `#E4E9E6`, `#14201C`, `#5C6B64`, `#8B9A93`, `#F7F8F7`, `#0FA968`) plus AdminContact's untouched nested Google-review mockup. Anything else is a gap — fix it following whichever of Tasks 4–7's patterns fits, then re-run this grep.

- [ ] **Step 5: Live verification pass across all three consoles**

With the app running (`MONGODB_URI="" npm run dev -w backend` + `npm run dev -w frontend`), for each of the three consoles (admin, company, platform):
1. Sign in, confirm the toggle is present and placed per Tasks 1–3.
2. Toggle to dark, click through several pages of that console, confirm no unreadable text (light-on-light or dark-on-dark) anywhere.
3. Toggle back to light, confirm it returns cleanly.

Then specifically re-confirm the four "always-white box" fixes render correctly in dark mode (Generate QR and Redeem Points empty/expired states from Task 6; the Branding and Contact previews from Task 7), and re-confirm `PlatformLayout`'s header stays dark in both directions (Task 3, Step 4) — toggle the platform console from light→dark and separately from dark→light, confirming the header never changes either time.

Finally, confirm dark mode does NOT leak: while in a dark-mode admin console, navigate to a customer-facing route in the same tab (e.g. log out to `AdminLogin`, or open `/explore` in a new tab) and confirm it renders in its normal light/tenant-themed appearance, not dark — proving the mount-scoped cleanup in `useTheme` actually removes the class rather than leaving it stuck on `<html>`.

- [ ] **Step 6: Commit any stragglers**

If Step 4's grep sweep found and fixed anything not already covered by Tasks 1–7, commit it now with a message describing what the sweep caught. If nothing was found, this step is a no-op — do not create an empty commit.

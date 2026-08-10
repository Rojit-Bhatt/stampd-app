# Customer Explore Shell Apple Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the global customer Explore shell (Discover, My Places, Events, Profile) around Apple's actual design language — Inter/HIG typography, a true-black dark-first theme with a light toggle, glass limited to floating chrome, and real drag physics on the wallet card stack — without leaking any of it into the admin/business/platform consoles that share the same global stylesheet.

**Architecture:** All new visual tokens (fonts, dark palette, Apple-green primary) are scoped under a new `.customer-shell` CSS class applied at the root of `GlobalCustomerLayout`, not written into `:root`/`.dark` — those stay exactly as they are today so every non-customer screen (admin, business, platform) is unaffected. A new `useCustomerTheme` hook owns the light/dark preference (localStorage-backed, dark by default) and toggles a `dark` class alongside `.customer-shell`. The wallet card stack (`OutletCardStack.tsx`, `ExploreHeroContext.tsx`) already exists with real Framer Motion drag physics in an unmerged worktree — Task 1 merges it in; every later task retrofits it and the rest of the shell to the new tokens rather than rebuilding from scratch.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4 (`@theme` tokens in `frontend/src/index.css`), `motion/react` (Framer Motion), React Router.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-10-customer-explore-shell-apple-redesign-design.md` — every task below implements a section of it. Re-read it if a step's rationale is unclear.
- **No frontend test runner exists in this repo** (`frontend/package.json` has no vitest/jest/testing-library — `npm run lint` is `tsc --noEmit` only). "Test" steps in this plan mean: (1) the TypeScript compiler passes with zero errors, and (2) a concrete manual/browser verification checklist. Do not invent a test framework as part of this work — that's out of scope.
- **Scope boundary:** only `GlobalCustomerLayout.tsx`, `OutletCardStack.tsx`, `ExploreHeroContext.tsx`, `GlobalScannerModal.tsx`, `Explore.tsx`, `ExploreMine.tsx`, `ExploreEvents.tsx`, `CustomerProfilePanel.tsx` (one section only), and net-new files. Never edit `:root`/`.dark` in `frontend/src/index.css` directly, and never remove/rename an existing CSS custom property or Tailwind `@theme` token — only add new ones or override existing token values inside the new `.customer-shell` scope.
- Dark is the default theme for the customer shell; light is opt-in via a toggle in Profile. No `prefers-color-scheme` auto-detection this phase.
- Every touch-driven transition must go through the existing `useMotion()` helper (`frontend/src/lib/motion.ts`) so `prefers-reduced-motion` is respected automatically — never a bare CSS `transition`/`@keyframes` on something the user's input drives.
- One sentence maximum per helper/subhead text added or edited in this work. Section headings are plain sentence-case (no tracked all-caps eyebrow) unless the label is genuine metadata.
- Every step that touches a `.tsx` file ends with `npm run lint` (from `frontend/`) passing — this is the TypeScript compiler, treat a failure as a blocking bug, not a warning.

---

## Task 1: Merge the wallet card stack worktree into `main`

The card stack shown to the user (banner photos, wallet-notch cutout, drag-to-swipe, scroll-tinted header) is already built on branch `worktree-explore-outlet-card-stack` (worktree at `.claude/worktrees/explore-outlet-card-stack`, HEAD `aec51a3`), but was branched before today's "My businesses" → "My Places" rename, so the merge needs a follow-up text fix.

**Files:**
- Merge brings in: `frontend/src/components/customer/OutletCardStack.tsx` (new), `frontend/src/context/ExploreHeroContext.tsx` (new)
- Merge modifies: `frontend/src/components/customer/GlobalCustomerLayout.tsx`, `frontend/src/routes/Explore.tsx`, `frontend/src/lib/motion.ts`
- Modify after merge: `frontend/src/components/customer/GlobalCustomerLayout.tsx` (re-fix nav label)

**Interfaces:**
- Produces: `OutletCardStack` component (default export from `OutletCardStack.tsx`, no props — reads `useMyTenants()` itself), `ExploreHeroProvider`/`useExploreHero()` (from `ExploreHeroContext.tsx`, exports `ExploreHeroContextValue` with `heroColor`, `setHeroColor`, `progress: MotionValue<number>`, `headerHeight`, `setHeaderHeight`), `SPRINGS.cardGlide` transition in `lib/motion.ts`.

- [ ] **Step 1: Merge the branch**

```bash
git merge worktree-explore-outlet-card-stack -m "merge: bring in wallet card stack (OutletCardStack, ExploreHeroContext)"
```

Expected: fast-forward or clean auto-merge. If a conflict appears in `GlobalCustomerLayout.tsx` or `Explore.tsx`, resolve by keeping the merged branch's structural changes (the new `GlobalHeader` component, `ExploreHeroProvider` wrapper, `OutletCardStack` usage) while keeping `main`'s content changes (the "My Places" label text, any content committed today).

- [ ] **Step 2: Re-fix the nav label the merge reintroduces**

Open `frontend/src/components/customer/GlobalCustomerLayout.tsx` and search for `"My businesses"` (the merge reintroduces it in the new `GlobalHeader` function's desktop `<nav>`). Replace both occurrences (desktop `<nav>` inside `GlobalHeader`, and the mobile `<footer>` tab row further down) with `"My Places"`.

```bash
grep -n "My businesses" frontend/src/components/customer/GlobalCustomerLayout.tsx
```

Expected: no output after the fix.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0, no errors.

- [ ] **Step 4: Browser verification**

Start the dev server and open `/explore` on a mobile viewport (375px). Confirm: the wallet card stack renders at the top (if the logged-in test account belongs to at least one outlet), swiping/dragging the front card up or down cycles through outlets, the header's background tints toward the active card's brand color while the stack is in view, and every visible nav label reads "My Places" (not "My businesses") in both the desktop nav and mobile footer.

- [ ] **Step 5: Commit**

The merge commit from Step 1 already exists; commit the label fix separately:

```bash
git add frontend/src/components/customer/GlobalCustomerLayout.tsx
git commit -m "fix(customer): reapply My Places rename after wallet-stack merge"
```

---

## Task 2: Scoped design tokens — Inter type scale + true-black dark palette

Adds the new tokens from the design spec without touching `:root`/`.dark`, so nothing outside the customer shell changes.

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `.customer-shell` class (scoped light-mode font override), `.customer-shell.dark` class (scoped dark palette), and ten new utility classes: `.text-large-title`, `.text-title-1`, `.text-title-2`, `.text-title-3`, `.text-headline`, `.text-body`, `.text-callout`, `.text-subhead`, `.text-footnote`, `.text-caption`.

- [ ] **Step 1: Add the scoped token block**

Append to `frontend/src/index.css`, after the existing `.dark { ... }` block (after line 175):

```css
/* Customer-facing shell only (GlobalCustomerLayout and, later, the
   per-outlet CustomerLayout) — scoped so admin/business/platform screens,
   which share this same stylesheet, are never affected by this redesign.
   Overriding the custom properties here is enough: every existing
   var(--token) reference and every @theme-generated utility (.font-display,
   .font-numeral, etc.) resolves against the nearest ancestor's value, so
   nothing outside .customer-shell changes. */
.customer-shell {
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-display: var(--font-sans);
  --font-numeral: var(--font-sans);
}

.customer-shell.dark {
  --bg: #000000;
  --surface: #1C1C1E;
  --surface-2: #2C2C2E;
  --line: #3A3A3C;

  --ink: #FFFFFF;
  --muted: #98989D;
  --soft: #6C6C70;

  --primary: #30D158;
  --primary-deep: #248A3D;
  --primary-soft: #0F2818;

  --brand: var(--primary);
  --brand-deep: var(--primary-deep);
  --brand-ink: var(--primary);
  --brand-on: #000000;

  --info: #0A84FF;
  --info-soft: #0A1F33;
  --ok: var(--primary);
  --ok-soft: var(--primary-soft);
  --warn: #FF9F0A;
  --warn-soft: #332405;
  --err: #FF453A;
  --err-soft: #330E0B;

  --background: var(--bg);
  --foreground: var(--ink);
  --muted-foreground: var(--muted);
  --surface-container: var(--surface-2);
  --surface-container-high: var(--surface-2);
  --surface-dim: var(--line);
  --ring: var(--primary);
  --secondary: var(--surface-2);
  --accent: var(--surface-2);
  --border: var(--line);
  --destructive: var(--err);
}
```

- [ ] **Step 2: Add the HIG type scale utility classes**

Append immediately after the block from Step 1:

```css
/* HIG-mapped type scale — hierarchy from weight+size+tracking+leading as a
   set, never one fixed letter-spacing across sizes. Global (not scoped to
   .customer-shell): these are brand-new class names unused elsewhere, so
   adding them can't affect any existing screen; they only render on Inter
   when used inside .customer-shell, where --font-sans is overridden. */
.text-large-title { font-size: 2.125rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
.text-title-1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.018em; line-height: 1.1; }
.text-title-2 { font-size: 1.375rem; font-weight: 700; letter-spacing: -0.015em; line-height: 1.15; }
.text-title-3 { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.012em; line-height: 1.2; }
.text-headline { font-size: 1.0625rem; font-weight: 600; letter-spacing: -0.005em; line-height: 1.3; }
.text-body { font-size: 1.0625rem; font-weight: 400; letter-spacing: 0; line-height: 1.4; }
.text-callout { font-size: 1rem; font-weight: 400; letter-spacing: 0; line-height: 1.35; }
.text-subhead { font-size: 0.9375rem; font-weight: 500; letter-spacing: 0; line-height: 1.3; }
.text-footnote { font-size: 0.8125rem; font-weight: 400; letter-spacing: 0.005em; line-height: 1.3; }
.text-caption { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.01em; line-height: 1.3; }
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0. (CSS changes don't affect `tsc`, but this confirms the file still parses as part of the build graph — Vite will catch a CSS syntax error on the next `npm run dev` in Task 3's verification instead if this passes trivially.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(customer): scoped Inter + true-black Apple-green tokens for the customer shell"
```

---

## Task 3: `useCustomerTheme` hook + wire `.customer-shell`/`.dark` onto the layout

**Files:**
- Create: `frontend/src/hooks/useCustomerTheme.ts`
- Modify: `frontend/src/components/customer/GlobalCustomerLayout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useCustomerTheme(): { theme: "light" | "dark"; toggleTheme: () => void }`, exported from `frontend/src/hooks/useCustomerTheme.ts`. `CustomerProfilePanel.tsx` (Task 8) will import this same hook.

- [ ] **Step 1: Write the hook**

```typescript
// frontend/src/hooks/useCustomerTheme.ts
import { useCallback, useState } from "react";

const STORAGE_KEY = "stampd-customer-theme";
type Theme = "light" | "dark";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

// Dark is the customer shell's default personality (see the design spec's
// "Wallet" personality choice) — light is an explicit opt-in, never
// inferred from prefers-color-scheme.
export function useCustomerTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
```

- [ ] **Step 2: Apply the class in `GlobalCustomerLayout.tsx`**

Find the root `<div className="flex min-h-screen flex-col bg-[var(--bg)]">` (inside the `<ExploreHeroProvider>` from Task 1's merge). Import and call the hook, and add the classes:

```typescript
import { useCustomerTheme } from "../../hooks/useCustomerTheme";
```

```typescript
const { theme } = useCustomerTheme();
```

```tsx
<div className={`customer-shell flex min-h-screen flex-col bg-[var(--bg)] ${theme === "dark" ? "dark" : ""}`}>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 4: Browser verification**

Start the dev server, open `/explore`. Confirm the page renders on the new true-black dark palette by default (background is pure black, not the old light `#F7F8F7`, not the old tinted-green dark). Run `window.localStorage.setItem('stampd-customer-theme', 'light')` in the browser console and reload — confirm the page renders on the original light palette (`#FFFFFF`/`#F7F8F7`) unchanged from before this work. No toggle UI exists yet (Task 8 adds it) — this step only confirms the mechanism.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCustomerTheme.ts frontend/src/components/customer/GlobalCustomerLayout.tsx
git commit -m "feat(customer): wire dark-by-default theme onto the customer shell"
```

---

## Task 4: Retrofit `GlobalCustomerLayout` chrome — type scale, Scan FAB, glass nav

**Files:**
- Modify: `frontend/src/components/customer/GlobalCustomerLayout.tsx`

**Interfaces:**
- Consumes: `useCustomerTheme` (Task 3).
- No new exports.

- [ ] **Step 1: Swap the wordmark and nav heading classes to the type scale**

In the `GlobalHeader` function (from Task 1's merge), find:

```tsx
<span className="font-display text-lg font-bold text-[var(--ink)]">{PLATFORM_NAME}</span>
```

Replace with:

```tsx
<span className="text-headline text-[var(--ink)]">{PLATFORM_NAME}</span>
```

(`.text-headline` already carries `font-weight: 600`; drop the redundant `font-bold`.)

- [ ] **Step 2: Move Scan to a centered FAB on mobile, keep the header button on desktop only**

Still in `GlobalHeader`, find the Scan `<button>` (`onClick={onScan}` / `aria-label="Scan a business's QR code"`). Add `hidden lg:flex` so it only renders at the desktop breakpoint (mirrors the mobile footer's own `lg:hidden`):

```tsx
<button
  onClick={onScan}
  aria-label="Scan a business's QR code"
  className="hidden items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--primary)] px-3.5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 lg:flex"
>
  <QrCode className="h-4 w-4" />
  <span>Scan</span>
</button>
```

(The `hidden sm:inline` on the inner `<span>` is no longer needed since the whole button is desktop-only now — the label always shows there.)

- [ ] **Step 3: Rebuild the mobile footer nav as a glass pill with a centered Scan FAB**

Find the `<footer>` element (currently a plain 4-tab row with no blur and no scan button). Replace its contents:

```tsx
<footer className="fixed inset-x-0 bottom-0 z-30 flex-shrink-0 px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden">
  <div className="relative mx-auto flex max-w-md items-center justify-between rounded-full border border-[var(--line)] bg-[var(--surface)]/85 px-4 py-2 shadow-float backdrop-blur-xl">
    <Tab to="/explore" icon={Compass} label="Discover" variant="bottom" />
    <Tab to="/explore/events" icon={CalendarDays} label="Events" variant="bottom" />

    {/* Centre scan FAB — mirrors BottomNav.tsx's proven pattern for the
        per-outlet dashboard, so the gesture is identical everywhere in the
        app. Deliberate HIG bend: an action inside a navigation-only tab
        bar, accepted because Scan is the single most-used control and this
        is the single most thumb-reachable spot on the screen. */}
    <div className="absolute -top-7 left-1/2 -translate-x-1/2">
      <button
        type="button"
        onClick={onScan}
        aria-label="Scan a business's QR code"
        className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-float transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
      >
        <QrCode className="h-6 w-6" strokeWidth={2} />
      </button>
    </div>
    <div className="w-14" aria-hidden="true" />

    <Tab to="/explore/mine" icon={Store} label="My Places" variant="bottom" />
    <Tab to="/explore/profile" icon={CircleUser} label="Profile" variant="bottom" />
  </div>
</footer>
```

This changes the footer's `onClick` needs: `GlobalCustomerLayout`'s render currently passes `onScan={() => setScanOpen(true)}` only to `GlobalHeader`. Thread the same callback to the footer — since the footer is rendered directly in `GlobalCustomerLayout`'s own JSX (not a separate component), it already has `setScanOpen` in scope; use `onClick={() => setScanOpen(true)}` directly instead of an `onScan` prop.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 5: Browser verification**

At a 375px mobile viewport: confirm the bottom nav is now a translucent/blurred pill (content visible scrolling underneath it), with a raised green circular Scan button breaking its top edge, centered between Events and My Places. Confirm the header on mobile shows only the logo/wordmark and avatar — no Scan button. Tapping the FAB opens the scanner modal exactly as before. At a desktop width (‰1280px): confirm the footer is absent, and the header shows the full nav row plus the Scan button with its text label.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/customer/GlobalCustomerLayout.tsx
git commit -m "feat(customer): glass bottom nav with centered Scan FAB, desktop-only header Scan"
```

---

## Task 5: `OutletCardStack` — fix the hardcoded value color

The stack's brand-tinted card gradients are deliberately bespoke (tenant identity, not app chrome) and stay as-is. Its points figure, however, hardcodes a green (`#5EE9A4`) instead of using `var(--primary)` — breaking the app-wide rule that the value figure is always the platform's green, never a one-off. This also means it currently won't pick up the new Apple systemGreen from Task 2.

**Files:**
- Modify: `frontend/src/components/customer/OutletCardStack.tsx`

**Interfaces:**
- No signature changes — `OutletCardStack` keeps its no-props export.

- [ ] **Step 1: Replace the hardcoded green**

Find:

```tsx
<span className="font-numeral text-[44px] leading-none text-[#5EE9A4]">
```

Replace with:

```tsx
<span className="font-numeral text-[44px] leading-none text-[var(--primary)]">
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 3: Browser verification**

At `/explore` with the dark theme active (default), confirm the points figure on each wallet card renders the new Apple systemGreen (`#30D158`) rather than the old mint (`#5EE9A4`) — visually a slightly more saturated, grassier green. Confirm the outlet name text (`font-display` → now Inter via the scoped token from Task 2) and the balance figure (`font-numeral` → also Inter) both render in Inter, not the old Space Grotesk/DM Serif.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/customer/OutletCardStack.tsx
git commit -m "fix(customer): wallet card value figure uses --primary, not a hardcoded green"
```

---

## Task 6: `Explore.tsx` (Discover) — type scale and copy pass

**Files:**
- Modify: `frontend/src/routes/Explore.tsx`

**Interfaces:**
- No signature changes.

- [ ] **Step 1: Retarget the "Discover" heading**

Find:

```tsx
<h2 className="mb-3 font-display text-lg font-bold text-[var(--ink)]">Discover</h2>
```

Replace with:

```tsx
<h2 className="mb-3 text-title-2 text-[var(--ink)]">Discover</h2>
```

- [ ] **Step 2: Confirm the empty-state copy already meets the one-sentence rule**

No change needed — `"No businesses match that. Try a different search or category."` and `"No businesses are listed yet."` are both already single, direct sentences. Leave as-is; this step is a verification, not an edit.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 4: Browser verification**

At `/explore`, confirm "Discover" now renders in Inter at the Title 2 size/weight (22px/700) instead of the old Space Grotesk `text-lg`/`font-bold` (18px). Confirm the business grid cards below still render correctly — their `font-display` name headings should also now be Inter (scoped token, no code change needed there), which is expected per the design spec ("Inter everywhere").

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/Explore.tsx
git commit -m "style(customer): Discover heading onto the HIG type scale"
```

---

## Task 7: `ExploreMine.tsx` and `ExploreEvents.tsx` — foundation pass

Both screens get the same tokens automatically (scoped CSS variables), plus their headings move onto the type scale. Neither is converted into a drag-stack — that pattern is specific to the Explore-home preview (`OutletCardStack`); these are dedicated full-list pages where a scannable list is the right pattern.

**Files:**
- Modify: `frontend/src/routes/ExploreMine.tsx`
- Modify: `frontend/src/routes/ExploreEvents.tsx`

**Interfaces:**
- No signature changes to either file.

- [ ] **Step 1: `ExploreMine.tsx` heading**

Find:

```tsx
<h1 className="font-display text-2xl font-bold text-[var(--ink)]">My Places</h1>
```

Replace with:

```tsx
<h1 className="text-large-title text-[var(--ink)]">My Places</h1>
```

(This is the top-level page title for its own screen, so it takes Large Title rather than Title 2 — unlike "Discover," which is a section heading inside the combined Explore-home page.)

- [ ] **Step 2: `ExploreEvents.tsx` heading**

Find:

```tsx
<h1 className="font-display text-2xl font-bold text-[var(--ink)]">Events</h1>
```

Replace with:

```tsx
<h1 className="text-large-title text-[var(--ink)]">Events</h1>
```

- [ ] **Step 3: Confirm existing copy meets the one-sentence rule**

`ExploreMine.tsx`'s subhead ("Every business you've earned points at.") and empty state ("You haven't joined a business yet. Find one to start earning points." — two short sentences, both load-bearing: what happened, what to do) and `ExploreEvents.tsx`'s subhead ("Upcoming events from every business on Stampd.") and empty state ("No upcoming events yet. Check back soon.") all already hold to the spirit of the rule. No edits needed — verification only.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 5: Browser verification**

Visit `/explore/mine` and `/explore/events` in the dark theme. Confirm both page titles render as large, bold Inter (34px), and that the cards below (membership cards, event cards) render on the true-black surfaces (`#1C1C1E` cards on `#000000` background) with legible text — spot-check contrast visually (light text clearly readable on the dark card surfaces, muted text still legible but visibly secondary).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/ExploreMine.tsx frontend/src/routes/ExploreEvents.tsx
git commit -m "style(customer): My Places and Events page titles onto the HIG type scale"
```

---

## Task 8: Theme toggle in Profile

**Files:**
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx`
- Modify: `frontend/src/components/customer/CustomerProfilePage.tsx`

**Interfaces:**
- Consumes: `useCustomerTheme` from `frontend/src/hooks/useCustomerTheme.ts` (Task 3).

- [ ] **Step 1: `CustomerProfilePage.tsx` heading onto the type scale**

Find:

```tsx
<h1 className="font-display text-2xl font-bold text-[var(--ink)]">Profile</h1>
```

Replace with:

```tsx
<h1 className="text-large-title text-[var(--ink)]">Profile</h1>
```

- [ ] **Step 2: Add an Appearance section**

In `CustomerProfilePanel.tsx`, import the hook and a `Sun`/`Moon`-style icon pair (the file already imports `lucide-react` icons elsewhere — follow that pattern):

```typescript
import { Moon, Sun } from "lucide-react";
import { useCustomerTheme } from "../../hooks/useCustomerTheme";
```

Inside the component body, call the hook:

```typescript
const { theme, toggleTheme } = useCustomerTheme();
```

Add a new entry to the `sections` array (from Task's context, positioned after `"notifications"` and before whatever comes next — check the array for its next `id` and insert before it):

```tsx
{
  id: "appearance",
  label: "Appearance",
  icon: theme === "dark" ? Moon : Sun,
  content: (
    <div className="flex max-w-[480px] flex-col gap-6">
      <Card title="Appearance">
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--muted)]">
          <span>Dark mode</span>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            onClick={toggleTheme}
            className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 ${
              theme === "dark" ? "bg-[var(--primary)]" : "bg-[var(--surface-2)]"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                theme === "dark" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </label>
      </Card>
    </div>
  ),
},
```

Note: this section only visibly does anything when `CustomerProfilePanel` is rendered inside a `.customer-shell`-wrapped tree — today that's `ExploreProfile.tsx` via `GlobalCustomerLayout`. The per-outlet `CustomerSettings.tsx` route also renders this same panel but isn't wrapped in `.customer-shell` yet (that's Phase 2's job) — the toggle will still appear there and persist the preference, it just won't visibly change that screen's colors until Phase 2 wraps `CustomerLayout` the same way. This is expected, not a bug to fix here.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 4: Browser verification**

Go to `/explore/profile`, confirm the "Profile" page heading now renders at the Large Title size/weight. Open the new "Appearance" section, toggle the switch. Confirm the entire Explore shell (background, cards, nav) flips between the true-black dark palette and the original light palette instantly, and that reloading the page preserves the choice (localStorage). Confirm the switch's own visual state (thumb position, track color) matches the active theme.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/CustomerProfilePanel.tsx frontend/src/components/customer/CustomerProfilePage.tsx
git commit -m "feat(customer): light/dark toggle in Profile > Appearance"
```

---

## Task 9: `GlobalScannerModal` — materials and motion pass

The scanner is intentionally always-dark regardless of the shell's light/dark toggle (camera-view convention — Apple's own scanner-style overlays don't follow the system appearance either), so it gets the new true-black values as fixed hex, not `var()` tokens tied to the toggle. It currently has zero entrance/exit animation and no glass treatment; per the spec, modals are one of the two places glass applies.

**Files:**
- Modify: `frontend/src/components/customer/GlobalScannerModal.tsx`

**Interfaces:**
- No signature changes.

- [ ] **Step 1: Retarget the hardcoded colors to the new true-black values**

Find and replace every occurrence in the file (these are the old tinted-dark palette this modal hardcoded before this redesign existed):

| Old | New | Meaning |
|---|---|---|
| `#0C110F` | `#000000` | canvas |
| `#141B18` | `#1C1C1E` | elevated surface |
| `#223029` | `#3A3A3C` | border/separator |
| `#E9F0EC` | `#FFFFFF` | label |
| `#8DA79A` | `#98989D` | muted label |
| `#0FA968` | `#30D158` | primary action |
| `#0B7A4B` | `#248A3D` | primary action, pressed/hover |

```bash
cd frontend/src/components/customer
sed -i '' \
  -e 's/#0C110F/#000000/g' \
  -e 's/#141B18/#1C1C1E/g' \
  -e 's/#223029/#3A3A3C/g' \
  -e 's/#E9F0EC/#FFFFFF/g' \
  -e 's/#8DA79A/#98989D/g' \
  -e 's/#0FA968/#30D158/g' \
  -e 's/#0B7A4B/#248A3D/g' \
  GlobalScannerModal.tsx
```

- [ ] **Step 2: Add glass to the scrim and spring entrance/exit**

Find the root `<div role="dialog" ...>` and its `bg-[#000000]/98` (post-sed) background. Wrap the modal in `AnimatePresence`/`motion.div` so it animates in rather than popping, and give the scrim translucency + blur:

```typescript
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";
```

Inside the component, before the `if (!open) return null;` line, call the hook:

```typescript
const m = useMotion();
```

Change the guard and wrapper — instead of `if (!open) return null; return (<div ...>`, wrap the whole return in `AnimatePresence`:

```tsx
return (
  <AnimatePresence>
    {open && (
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Scan a business's counter QR code"
        initial={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
        animate={{ opacity: 1, scale: 1 }}
        exit={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
        transition={m.spring("settle")}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#000000]/90 backdrop-blur-xl font-sans text-[#FFFFFF]"
      >
        {/* existing modal content unchanged */}
      </motion.div>
    )}
  </AnimatePresence>
);
```

Move the existing JSX body (the close button, camera error states, scanner view — everything currently inside the plain `<div>`) inside this `motion.div`, and remove the old early-return `if (!open) return null;` line since `AnimatePresence` now handles mount/unmount.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 4: Browser verification**

Open the scanner from either the header (desktop) or the FAB (mobile). Confirm it fades/scales in smoothly rather than popping instantly, the scrim is a blurred translucent black (content is fully obscured but the blur is visually present, not just a flat black square), and all colors read as true black/white rather than the old green-tinted dark. Force `prefers-reduced-motion: reduce` in devtools and reopen — confirm it now just cross-fades with no scale.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/GlobalScannerModal.tsx
git commit -m "style(customer): scanner modal onto true-black palette with glass entrance"
```

---

## Task 10: Full-flow verification

No code changes — this is the plan's final gate, confirming the whole Phase 1 surface together rather than one screen at a time.

- [ ] **Step 1: Type-check the whole frontend**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 2: Full manual walkthrough at mobile viewport (375px), dark theme (default)**

Log in as a customer belonging to at least one outlet. Walk: `/explore` (wallet stack drag/swipe, header brand-tint on scroll, Discover grid, Scan FAB) → `/explore/mine` (list) → `/explore/events` (list) → `/explore/profile` (toggle to light, confirm whole shell flips, toggle back to dark). Confirm the bottom nav's active-tab highlighting still works correctly on every route, and that the Scan FAB opens the scanner from every one of the four tabs.

- [ ] **Step 3: Repeat at desktop viewport (‰1280px)**

Confirm the header (not the footer) carries navigation + Scan + avatar, the footer is entirely absent, and the same four routes render correctly.

- [ ] **Step 4: Reduced motion pass**

With `prefers-reduced-motion: reduce` forced in devtools, repeat the `/explore` walkthrough. Confirm the wallet card stack's settle animation and the scanner modal's entrance both degrade to simple cross-fades with no spring/scale/overshoot, while drag-to-swipe on the stack still works (dragging itself is user-driven 1:1 tracking, not an automatic animation, so it's unaffected by this setting).

- [ ] **Step 5: Final commit (if any fixes were needed)**

If Steps 2–4 surfaced any issues, fix them in the relevant file from the task above, re-run `npm run lint`, and commit with a message describing the specific fix — not a generic "final fixes" commit.

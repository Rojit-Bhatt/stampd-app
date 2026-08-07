# Frontend UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four frontend UX bugs: (1) sticky/fixed navbars scrolling away app-wide, (2) Featured/Show toggles taking ~1s to reflect instead of updating instantly, (3) dark-mode color distortion in the staff console mobile menu, (4) landing-page nav anchors (Services/Pricing/FAQ) not working from a non-`/` route like `/review-qr`.

**Architecture:** Each bug has an isolated, independently-confirmed root cause and a small, targeted fix — no shared architecture between the four tasks beyond the existing design-token/React-Query/react-router conventions already in this codebase. No new files.

**Tech Stack:** React 19 + Vite + TS + Tailwind v4, TanStack Query, react-router-dom. **No frontend test framework exists in this repo** (confirmed: no `vitest`/`jest` in `frontend/package.json`) — verification is `npx tsc --noEmit` plus manual browser checks, not automated tests, for every task in this plan.

## Global Constraints
- `@custom-variant dark (&:is(.dark *));` in `frontend/src/index.css:4` — dark-mode CSS only activates under an ancestor `.dark` class, never via OS `prefers-color-scheme` media query directly.
- Don't touch `MenuItem`'s or `RewardItem`'s other fields — only the mutation/cache-update logic changes in Task 2.
- `frontend/src/index.css`'s `.landing-dark`-scoped rules (lines 262-306) are a different concern (landing page dark theme) from the app's `.dark` class (staff console dark mode toggle) — don't conflate them across tasks.
- Verify every task with `cd frontend && npx tsc --noEmit` before committing.

---

### Task 1: Global sticky/fixed navbar fix

**Files:**
- Modify: `frontend/src/index.css:180-194`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — independent.

**Context:** `html`/`body`'s global `overflow-x: hidden` backstop (an anti-pinch-zoom-misalignment guard, see the comment at `index.css:168-179`) makes browsers auto-promote `overflow-y` to `auto` on both elements, since CSS requires the un-set axis to become `auto` when the other is non-`visible`. This creates nested scroll containers that break every `position: sticky`/`fixed` element app-wide — confirmed live in-browser: the outlet admin console's mobile header scrolled away with the page instead of pinning. This exact mechanism was already diagnosed and fixed once, but scoped only to the landing page (`html.landing-dark` override to `overflow-x: clip` at `index.css:291-295`) — the fix comment there literally says "scoped to the landing... rest of the app is built on the original rule," meaning this was a known, deliberately deferred gap.

- [x] **Step 1: Change the global rule from `hidden` to `clip`**

Open `frontend/src/index.css`. Find:

```css
html {
  overflow-x: hidden;
  max-width: 100vw;
}

body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0;
  overflow-x: hidden;
  max-width: 100vw;
}
```

Replace with:

```css
html {
  overflow-x: clip;
  max-width: 100vw;
}

body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0;
  overflow-x: clip;
  max-width: 100vw;
}
```

- [x] **Step 2: Remove the now-redundant landing-only duplicate**

Find (still in `index.css`):

```css
/* The global html/body `overflow-x: hidden` backstop above turns body into a
   scroll container, which silently breaks the hero's sticky pin — the section
   scrolls away instead of pinning. `clip` clips exactly the same overflow
   WITHOUT establishing a scrollport, so the backstop's anti-pinch-zoom intent
   survives and sticky still works. Scoped to the landing rather than changed
   globally, because the rest of the app is built on the original rule.
   The background is repeated on body so overscroll stays dark. */
html.landing-dark,
html.landing-dark body {
  overflow-x: clip;
  background-color: var(--lp-bg);
}
```

Replace with (the `overflow-x: clip` is now inherited from the global rule — this block only needs to keep supplying the dark background color, which the global rule doesn't set):

```css
/* The global html/body rule above now uses `clip` (not `hidden`), so this no
   longer needs its own overflow override — only the landing's dark
   background, which the global rule doesn't set. The background is repeated
   on body so overscroll stays dark. */
html.landing-dark,
html.landing-dark body {
  background-color: var(--lp-bg);
}
```

- [x] **Step 3: Fix the now-stale comment about no console having a fixed header**

Find:

```css
/* Without this every anchor lands UNDERNEATH the fixed nav pill, hiding the
   heading the visitor just clicked. 96px is the pill's height plus its top
   margin. Scoped to the landing because no console has a fixed header. */
html.landing-dark {
  scroll-padding-top: 96px;
}
```

Replace with:

```css
/* Without this every anchor lands UNDERNEATH the fixed nav pill, hiding the
   heading the visitor just clicked. 96px is the pill's height plus its top
   margin. Scoped to the landing because its nav pill's height is unique to
   this page — other consoles' sticky headers are a different height and
   don't need scroll-padding at all (they have no in-page anchor links). */
html.landing-dark {
  scroll-padding-top: 96px;
}
```

- [x] **Step 4: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (pure CSS change, no TS surface).

- [x] **Step 5: Manually verify in a browser**

Start this worktree's own dev servers directly (not via a shared preview tool that may be bound to a different checkout):

```bash
cd backend && MONGODB_URI= PORT=5001 npm run dev > /tmp/wt-backend.log 2>&1 &
cd frontend && npx vite --port 3010 > /tmp/wt-frontend.log 2>&1 &
```

Wait a few seconds, then open `http://localhost:3010` in the browser tool, log in as `durbarmarg@coffesarowar.com` / `password` at `/admin-login`, resize to mobile width, and scroll the Overview page. Expected: the top header stays pinned instead of scrolling away. Stop both background servers when done (`pkill -f "vite --port 3010"`, `pkill -f "PORT=5001"` or equivalent for your shell).

- [x] **Step 6: Commit**

```bash
git add frontend/src/index.css
git commit -m "$(cat <<'EOF'
fix: sticky/fixed navbars work app-wide, not just on the landing page

The global html/body overflow-x:hidden backstop auto-promoted
overflow-y to auto on both elements (CSS spec behavior when only one
axis is set), creating nested scroll containers that broke every
position:sticky/fixed element outside the landing page. The landing
page already worked around this with a scoped overflow-x:clip
override — this makes that the global rule instead, since clip
achieves the same anti-pinch-zoom backstop without establishing a
scroll container.
EOF
)"
```

---

### Task 2: Optimistic Featured/Show toggles

**Files:**
- Modify: `frontend/src/routes/admin/MenuManagement.tsx:134-138` (`patchItem` mutation)
- Modify: `frontend/src/routes/admin/AdminRewards.tsx:45-49` (`update` mutation)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — independent.

**Context:** Both toggles wait for the full round trip before the UI reflects the change (`onSuccess: invalidate` only, no `onMutate`). Fix: add React Query optimistic updates — `onMutate` cancels in-flight queries, snapshots the current cache, writes the toggled value in immediately; `onError` rolls back to the snapshot and shows an error toast; `onSettled` invalidates to reconcile with the server. Both queries (`["adminMenu", orgId]` and `["adminRewards", orgId]`) are matched with a partial key (`["adminMenu"]` / `["adminRewards"]`) so the mutation doesn't need to know the exact `orgId` suffix — React Query's query filters match by prefix.

- [x] **Step 1: Add optimistic update to `MenuManagement.tsx`'s `patchItem`**

Open `frontend/src/routes/admin/MenuManagement.tsx`. Find:

```typescript
  const patchItem = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<MenuItem> }) =>
      apiRequest(`/api/admin/menu/${id}`, { method: "PATCH", role: "admin", body }),
    onSuccess: invalidate,
  });
```

Replace with:

```typescript
  const patchItem = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<MenuItem> }) =>
      apiRequest(`/api/admin/menu/${id}`, { method: "PATCH", role: "admin", body }),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: ["adminMenu"] });
      const previous = qc.getQueriesData<MenuItem[]>({ queryKey: ["adminMenu"] });
      qc.setQueriesData<MenuItem[]>({ queryKey: ["adminMenu"] }, (old) =>
        old?.map((item) => (itemId(item) === id ? { ...item, ...body } : item)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error((error as Error).message || "Couldn't update that — try again.");
    },
    onSettled: invalidate,
  });
```

- [x] **Step 2: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. `itemId` is already defined at module scope in this file (`const itemId = (i: MenuItem) => i.id || (i._id as string);`), `toast` is already imported (`import toast from "react-hot-toast";`), `qc` is already in scope in the component.

- [x] **Step 3: Add optimistic update to `AdminRewards.tsx`'s `update`**

Open `frontend/src/routes/admin/AdminRewards.tsx`. Add the `toast` import if not already present — check the top of the file first; if `import toast from "react-hot-toast";` is missing, add it alongside the other imports.

Find:

```typescript
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { isActive: boolean } }) =>
      apiRequest(`/api/admin/rewards/${id}`, { method: "PATCH", role: "admin", body: patch }),
    onSuccess: invalidate,
  });
```

Replace with:

```typescript
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { isActive: boolean } }) =>
      apiRequest(`/api/admin/rewards/${id}`, { method: "PATCH", role: "admin", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["adminRewards"] });
      const previous = qc.getQueriesData<AdminRewardItem[]>({ queryKey: ["adminRewards"] });
      qc.setQueriesData<AdminRewardItem[]>({ queryKey: ["adminRewards"] }, (old) =>
        old?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error((error as Error).message || "Couldn't update that — try again.");
    },
    onSettled: invalidate,
  });
```

- [x] **Step 4: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. `AdminRewardItem` is already imported (`import { RewardFormModal, type AdminRewardItem } from "../../components/admin/RewardFormModal";`).

- [x] **Step 5: Manually verify in a browser**

Using the same worktree-local dev servers from Task 1 Step 5 (start them again if stopped), log into the admin console, go to Menu Management, click "Feature" on an item — expected: the button switches to "Featured" state immediately, not after a delay. Do the same for a reward's "Hide"/"Show" button on the Rewards page.

- [x] **Step 6: Commit**

```bash
git add frontend/src/routes/admin/MenuManagement.tsx frontend/src/routes/admin/AdminRewards.tsx
git commit -m "$(cat <<'EOF'
fix: Featured/Show toggles update instantly, not after a ~1s round trip

Both mutations only had onSuccess: invalidate, so the UI waited for the
full request before reflecting the change. Added optimistic updates
(onMutate/onError rollback/onSettled reconcile) matching the pattern
already used elsewhere for instant-feeling toggles, with an error toast
and automatic rollback if the backend request actually fails.
EOF
)"
```

---

### Task 3: Dark-mode color distortion in mobile hamburger menu

**Files:**
- Modify: `frontend/src/index.css:39-114` (`:root` token block)
- Modify: `frontend/src/index.css:119-166` (`.dark` token block)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — independent.

**Context:** `components/ui/sheet.tsx` (the shadcn Sheet primitive used by all three staff console mobile nav drawers — outlet admin, company, platform, all wired through `AdminLayout.tsx`/`CompanyLayout.tsx`/`PlatformLayout.tsx`) references `--ring` and `--secondary` (via `ring-ring`, `bg-secondary`, `ring-offset-background` on `SheetClose`'s close button) — neither is defined anywhere in `index.css`'s token set. Tailwind falls back to its own built-in default palette for these undefined custom properties, which clashes visibly against this app's real (especially dark-mode) palette on the sheet's close button. Fix: define `--ring`/`--secondary` mapped to real Stampd tokens, in both `:root` and `.dark`, so every console's mobile menu (not just the one directly observed) gets consistent colors.

- [x] **Step 1: Add `--ring`/`--secondary` to `:root`**

Open `frontend/src/index.css`. Find (inside the `:root` block):

```css
  /* Retained aliases so un-migrated screens still resolve. */
  --background: var(--bg);
  --foreground: var(--ink);
  --muted-foreground: var(--muted);
  --surface-container: var(--surface-2);
  --surface-container-high: var(--surface-2);
  --surface-dim: var(--line);
```

Replace with (two new custom properties added at the end: `--ring` reuses the brand-neutral `--primary` green — visually correct for a focus ring, and `--secondary` reuses `--surface-2`, the existing "slightly-off-surface" token already used for hover backgrounds elsewhere in this file):

```css
  /* Retained aliases so un-migrated screens still resolve. */
  --background: var(--bg);
  --foreground: var(--ink);
  --muted-foreground: var(--muted);
  --surface-container: var(--surface-2);
  --surface-container-high: var(--surface-2);
  --surface-dim: var(--line);
  --ring: var(--primary);
  --secondary: var(--surface-2);
```

- [x] **Step 2: Add the same two properties to `.dark`, with dark-appropriate values**

Find (inside the `.dark` block):

```css
.dark {
  --bg: #0C110F;
  --surface: #141B18;
  --surface-2: #1B241F;
  --ink: #E9F0EC;
  --muted: #8DA79A;
  --soft: #6E8578;
  --line: #223029;

  --primary: #34D399;
  --primary-deep: #0FA968;
  --primary-soft: #182019;
```

Replace with:

```css
.dark {
  --bg: #0C110F;
  --surface: #141B18;
  --surface-2: #1B241F;
  --ink: #E9F0EC;
  --muted: #8DA79A;
  --soft: #6E8578;
  --line: #223029;

  --primary: #34D399;
  --primary-deep: #0FA968;
  --primary-soft: #182019;
  --ring: var(--primary);
  --secondary: var(--surface-2);
```

- [x] **Step 3: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (pure CSS token additions).

- [x] **Step 4: Manually verify in a browser**

Using the worktree-local dev servers, open the admin console at mobile width, toggle dark mode via the theme toggle (moon/sun icon in the sidebar footer), open the hamburger menu, and check the close button (X) in the corner — expected: its hover/focus ring and background use the app's green/surface tokens, not a mismatched default blue/gray. Repeat for the company console (`/company`) and platform console (`/platform`) mobile menus if reachable in your test session.

- [x] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "$(cat <<'EOF'
fix: define --ring/--secondary tokens, fixing mobile menu color clash

ui/sheet.tsx (shared by all 3 staff console mobile drawers) referenced
--ring and --secondary, which didn't exist anywhere in this app's
token set. Tailwind silently fell back to its own default palette for
them, clashing against the app's real colors — most visible in dark
mode on the sheet's close button. Both now alias real Stampd tokens in
both :root and .dark.
EOF
)"
```

---

### Task 4: Landing nav anchors work from any route, not just `/`

**Files:**
- Modify: `frontend/src/routes/platform/landing/primitives.tsx:98-124` (`NavLinkItem`)
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks — independent.

**Context:** `NAV_LINKS` (`routes/platform/landing/data.ts`, also reused as `FOOTER_LINKS`) mixes anchor links (`{kind:"anchor", href:"#services"}`) with a real route (`{kind:"route", to:"/review-qr"}`). `NavLinkItem` (shared by `LandingNav.tsx` and `LandingFooter.tsx`) renders anchors as a plain `<a href="#services">`, which works fine on `/` but does nothing useful on `/review-qr` — it just rewrites the hash on the current path, and there's no `#services` element there to scroll to. Fix: when an anchor link is clicked and the current route isn't `/`, navigate to `/` with the hash via react-router's `Link` instead; the landing page gets a `useEffect` that scrolls to `location.hash` on mount/change, so both real full navigation (from `/review-qr`) and the plain same-page case (already on `/`) end up correct.

- [x] **Step 1: Make anchor links route-aware in `NavLinkItem`**

Open `frontend/src/routes/platform/landing/primitives.tsx`. Find:

```typescript
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
```

Replace with:

```typescript
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
```

Find:

```typescript
export function NavLinkItem({
  link,
  className,
  onClick,
  children,
}: {
  link: NavLink;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const content = children ?? link.label;

  if (link.kind === "route") {
    return (
      <Link to={link.to} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <a href={link.href} className={className} onClick={onClick}>
      {content}
    </a>
  );
}
```

Replace with:

```typescript
export function NavLinkItem({
  link,
  className,
  onClick,
  children,
}: {
  link: NavLink;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const content = children ?? link.label;
  const location = useLocation();

  if (link.kind === "route") {
    return (
      <Link to={link.to} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  // On the landing page itself, a plain same-page anchor scroll already
  // works natively. From any other route (e.g. /review-qr, which reuses
  // this same nav), a plain <a href="#services"> just rewrites the hash on
  // the current path — there's no #services element there to scroll to. A
  // real react-router navigation to "/" + the hash fixes that; the landing
  // page's own hash-scroll effect (PlatformLanding.tsx) handles the rest.
  if (location.pathname !== "/") {
    return (
      <Link to={`/${link.href}`} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <a href={link.href} className={className} onClick={onClick}>
      {content}
    </a>
  );
}
```

- [x] **Step 2: Add hash-scroll handling to `PlatformLanding.tsx`**

Open `frontend/src/routes/platform/PlatformLanding.tsx`. Find:

```typescript
import { useEffect } from "react";

import { usePlatformContact } from "../../hooks/usePlatformContact";
```

Replace with:

```typescript
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { usePlatformContact } from "../../hooks/usePlatformContact";
```

Find:

```typescript
export default function PlatformLanding() {
  const { data: contact } = usePlatformContact();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Loyalty points for Nepali businesses | Stampd";
    document.documentElement.classList.add("landing-dark");

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);
```

Replace with:

```typescript
export default function PlatformLanding() {
  const { data: contact } = usePlatformContact();
  const location = useLocation();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Loyalty points for Nepali businesses | Stampd";
    document.documentElement.classList.add("landing-dark");

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  // Arriving here via a Link to "/#services" (e.g. clicked from /review-qr)
  // is a client-side navigation, not a real page load — the browser's
  // native same-document anchor scroll never fires. This does it manually.
  // scroll-padding-top (index.css, scoped to html.landing-dark) already
  // accounts for the fixed nav pill's height, and applies to
  // scrollIntoView() calls the same as it would a native anchor jump.
  useEffect(() => {
    if (!location.hash) return;
    const target = document.querySelector(location.hash);
    target?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);
```

- [x] **Step 3: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [x] **Step 4: Manually verify in a browser**

Using the worktree-local dev servers, navigate to `/review-qr`, click "Services" in the nav — expected: navigates to `/` and scrolls to the Services section. Then, while already on `/`, click "Pricing" — expected: same-page scroll works as before (unchanged plain-anchor path). Also check the footer's equivalent links from `/review-qr` since `LandingFooter` shares the same `NavLinkItem`.

- [x] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/primitives.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "$(cat <<'EOF'
fix: landing nav Services/Pricing/FAQ links work from any route

NAV_LINKS mixes anchor links with the real /review-qr route, all
rendered through the same NavLinkItem. Anchors were plain <a
href="#services">, which only works while already on "/" — clicking
from /review-qr just rewrote the hash on that page with nothing to
scroll to. Anchors now navigate to "/" + the hash when not already
there; the landing page's own hash-scroll effect handles the rest.
Fixes both LandingNav and LandingFooter, which share this component.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all four Group C items covered — sticky navbar (Task 1), optimistic toggles (Task 2), dark-mode token gap (Task 3), landing nav anchors (Task 4).
- **Placeholder scan:** clean — every step shows the literal before/after code.
- **Type consistency:** `AdminRewardItem` used identically to its existing import in `AdminRewards.tsx`; `MenuItem`/`itemId` used identically to their existing definitions in `MenuManagement.tsx`; no new types introduced.
- **No frontend test framework**: every task's verification step is `tsc --noEmit` + manual browser check, not a fabricated automated test — consistent with this repo's actual toolchain.

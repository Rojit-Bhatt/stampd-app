# Explore Outlet Card Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal-scroll "My businesses" row on `/explore` with a swipeable, PayPal-wallet-style stack of outlet balance cards whose header tints to the active card's colour and collapses/vanishes as the page scrolls.

**Architecture:** A new `ExploreHeroContext` (React state for the rarely-changing active colour, a single shared `MotionValue` for the continuously-changing scroll progress) bridges a new `OutletCardStack` component (rendered inside `Explore.tsx`, owns the card data/gesture/scroll logic) and a newly-extracted `GlobalHeader` component (inside `GlobalCustomerLayout.tsx`, owns the tinted/neutral background crossfade). Card repositioning, drag release, and all transitions use the existing `SPRINGS.settle` spring via `useMotion()` — no new spring is added to `lib/motion.ts`.

**Tech Stack:** React 19, TypeScript, `motion/react` (drag gestures, `useScroll`, `useTransform`, `useMotionValue`, `useMotionValueEvent`), Tailwind v4, existing `lib/color.ts`/`lib/images.ts`/`lib/tenantPath.ts` helpers, `useMyTenants()` hook (no backend changes).

## Global Constraints

- Design source of truth: [docs/superpowers/specs/2026-08-09-explore-outlet-card-stack-design.md](../specs/2026-08-09-explore-outlet-card-stack-design.md).
- **No frontend unit test framework exists in this repo** (no vitest/jest — `npm run lint` is `tsc --noEmit`, per [CLAUDE.md](../../../CLAUDE.md)). Every task's "test" cycle is therefore: (1) `npm run lint` in `frontend/` must pass with zero errors, (2) a manual browser check against the running dev server, per CLAUDE.md's "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete." Steps below spell out exactly what to click/observe for each check.
- Dev server: backend needs `MONGODB_URI=""` to use the in-memory mock DB (see CLAUDE.md "Known gap"). Start with `MONGODB_URI="" npm run dev -w backend` in one terminal and `npm run dev -w frontend` in another, or `npm run dev` from repo root if `backend/.env` has no real `MONGODB_URI` set.
- Test account: seeded customer `bikash@example.com` / `password` spans **three outlets across three different companies** — the best account for verifying a multi-card stack. `asha@example.com` spans two outlets of one company (good for a 2-card case). Log in via `/customer-login`.
- `tsconfig` has `noUnusedLocals`/`noUnusedParameters: true` — any import removed from `Explore.tsx` that becomes unused must actually be deleted, not left dangling.
- Every animated transition (card reposition, drag release) must go through `useMotion().spring("settle")` — do not hand-write a `transition` object or a bare CSS `transition-*` class for these.
- The header tint is a deliberate, scoped override of CLAUDE.md's "the `/explore` header is never tenant-themed" rule — it applies **only** while `ExploreHeroContext`'s `heroColor` is non-null (i.e., only while `OutletCardStack` is mounted with ≥1 membership). Every other route must render pixel-identical to today.

---

## Task 1: `ExploreHeroContext`

**Files:**
- Create: `frontend/src/context/ExploreHeroContext.tsx`
- Modify: `frontend/src/components/customer/GlobalCustomerLayout.tsx` (wrap the shell's root return in the new provider)

**Interfaces:**
- Produces: `ExploreHeroProvider` (component, wraps children), `useExploreHero()` returning `{ heroColor: string | null; setHeroColor: (c: string | null) => void; progress: MotionValue<number> }`. Every later task imports these two from `frontend/src/context/ExploreHeroContext`.

- [ ] **Step 1: Create the context file**

```tsx
// frontend/src/context/ExploreHeroContext.tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { useMotionValue, type MotionValue } from "motion/react";

// Bridges GlobalCustomerLayout's header and OutletCardStack (mounted only on
// the /explore route). heroColor is plain React state — it only changes on a
// discrete swipe/tap, so a header re-render is cheap and correct. progress is
// a single MotionValue driven every scroll frame; reading it via
// useTransform/style means the header never re-renders on scroll.
export interface ExploreHeroContextValue {
  heroColor: string | null;
  setHeroColor: (color: string | null) => void;
  progress: MotionValue<number>;
}

const ExploreHeroContext = createContext<ExploreHeroContextValue | null>(null);

export function ExploreHeroProvider({ children }: { children: ReactNode }) {
  const [heroColor, setHeroColor] = useState<string | null>(null);
  const progress = useMotionValue(0);

  return (
    <ExploreHeroContext.Provider value={{ heroColor, setHeroColor, progress }}>
      {children}
    </ExploreHeroContext.Provider>
  );
}

export function useExploreHero(): ExploreHeroContextValue {
  const ctx = useContext(ExploreHeroContext);
  if (!ctx) throw new Error("useExploreHero must be used within ExploreHeroProvider");
  return ctx;
}
```

- [ ] **Step 2: Wrap `GlobalCustomerLayout`'s shell in the provider**

In `frontend/src/components/customer/GlobalCustomerLayout.tsx`, add the import:

```tsx
import { ExploreHeroProvider } from "../../context/ExploreHeroContext";
```

Find the component's final `return` statement (the one after the `!globalAccount` and `!globalAccount.phone` early returns — currently starts `return (\n    <div className="flex min-h-screen flex-col bg-[var(--bg)]">`). Wrap it:

```tsx
return (
  <ExploreHeroProvider>
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      {/* ... existing content unchanged ... */}
    </div>
  </ExploreHeroProvider>
);
```

Do not touch the two earlier early returns (loading spinner, phone gate) — they render no header, so they don't need the provider.

- [ ] **Step 3: Typecheck**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Manual browser check (regression only — no visible change yet)**

Start dev server, log in as `bikash@example.com`. Visit `/explore`, `/explore/mine`, `/explore/events`, `/explore/profile`. All four should look and behave exactly as before this change — the context exists but nothing consumes it yet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/ExploreHeroContext.tsx frontend/src/components/customer/GlobalCustomerLayout.tsx
git commit -m "feat(customer): add ExploreHeroContext scaffold for card-stack hero"
```

---

## Task 2: Static `OutletCardStack`

**Files:**
- Create: `frontend/src/components/customer/OutletCardStack.tsx`
- Modify: `frontend/src/routes/Explore.tsx:1-9,37-38,96-125` (remove old row, drop now-unused imports/data, mount the new component)

**Interfaces:**
- Consumes: `useMyTenants()` → `MyTenantMembership[]` (`frontend/src/hooks/useMyTenants.ts`, unchanged), `useCustomerAuth()` → `{ globalAccount }` (`frontend/src/context/CustomerAuthContext.tsx`, unchanged), `formatPoints` (`frontend/src/hooks/usePoints.ts`), `resolveImageUrl` (`frontend/src/lib/images.ts`), `tenantPath` (`frontend/src/lib/tenantPath.ts`), `CustomerAvatar` (`frontend/src/components/customer/CustomerAvatar.tsx`), `useMotion` (`frontend/src/lib/motion.ts`).
- Produces: `OutletCardStack` (default-less named export, no props) — later tasks (3, 4, 5) only ever modify the body of this same file/component, never its external call site again.

- [ ] **Step 1: Create `OutletCardStack.tsx` with static, tappable layered cards**

```tsx
// frontend/src/components/customer/OutletCardStack.tsx
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";

import { useMyTenants, type MyTenantMembership } from "../../hooks/useMyTenants";
import { useCustomerAuth } from "../../context/CustomerAuthContext";
import { formatPoints } from "../../hooks/usePoints";
import { resolveImageUrl } from "../../lib/images";
import { tenantPath } from "../../lib/tenantPath";
import { useMotion } from "../../lib/motion";
import { CustomerAvatar } from "./CustomerAvatar";

// Front card + this many peeking layers behind it = 3 visible cards max,
// regardless of how many outlets the customer belongs to.
const MAX_PEEK_DEPTH = 2;

export function OutletCardStack() {
  const { data: memberships = [] } = useMyTenants();
  const { globalAccount } = useCustomerAuth();
  const [activeIndex, setActiveIndex] = useState(0);

  if (memberships.length === 0) return null;

  const clampedIndex = Math.min(activeIndex, memberships.length - 1);

  return (
    <section className="relative mb-7 flex justify-center" style={{ height: "min(50vh, 380px)" }}>
      <div className="relative w-full max-w-sm">
        {memberships.map((m, i) => {
          const depth = i - clampedIndex;
          if (depth < 0 || depth > MAX_PEEK_DEPTH) return null;
          return (
            <Fragment key={m.organizationId}>
              {depth === 0 && (
                <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2">
                  <CustomerAvatar
                    accountId={globalAccount?.id}
                    avatarVersion={globalAccount?.avatarVersion}
                    name={globalAccount?.name}
                    size={40}
                    className="rounded-full border-2 border-white shadow-modal"
                  />
                </div>
              )}
              <OutletCard membership={m} depth={depth} onTap={() => setActiveIndex(i)} />
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function OutletCard({
  membership,
  depth,
  onTap,
}: {
  membership: MyTenantMembership;
  depth: number;
  onTap: () => void;
}) {
  const m = useMotion();
  const logo = resolveImageUrl(membership.branding.logoImageId, membership.branding.logoUrl);
  const initial = membership.name.charAt(0).toUpperCase();

  const content = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {logo ? (
          <img
            src={logo}
            alt=""
            className="h-11 w-11 rounded-[var(--radius-field)] bg-white object-cover shadow-modal"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-field)] font-display text-lg font-bold text-white shadow-modal"
            style={{ background: membership.branding.primaryColor }}
          >
            {initial}
          </div>
        )}
        <div className="truncate font-display text-base font-bold text-[var(--ink)]">{membership.name}</div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-numeral text-4xl leading-none text-[var(--primary)]">
          {formatPoints(membership.balance)}
        </span>
        <span className="text-sm text-[var(--soft)]">pts</span>
      </div>
    </div>
  );

  const cardClassName =
    "absolute inset-x-0 top-0 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient";
  const animate = {
    y: depth * -14,
    scale: 1 - depth * 0.06,
    opacity: depth === 0 ? 1 : 1 - depth * 0.18,
  };
  const transition = m.spring("settle");

  if (depth === 0) {
    return (
      <motion.div className={cardClassName} style={{ zIndex: 10 - depth }} animate={animate} transition={transition}>
        <Link to={tenantPath(membership.companySlug, membership.slug, "dashboard")}>{content}</Link>
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onTap}
      aria-label={`Show ${membership.name}`}
      className={`${cardClassName} text-left`}
      style={{ zIndex: 10 - depth }}
      animate={animate}
      transition={transition}
    >
      {content}
    </motion.button>
  );
}
```

- [ ] **Step 2: Wire it into `Explore.tsx`, remove the old row**

In `frontend/src/routes/Explore.tsx`:

Remove these two now-unused imports (line 6-7 in the current file):

```tsx
import { useMyTenants } from "../hooks/useMyTenants";
import { formatPoints } from "../hooks/usePoints";
```

Add:

```tsx
import { OutletCardStack } from "../components/customer/OutletCardStack";
```

Remove this line from inside the `Explore` component (currently line 38):

```tsx
const { data: myTenants = [] } = useMyTenants();
```

Replace the entire block (currently lines 96-125):

```tsx
{myTenants.length > 0 && (
  <section className="mb-7">
    <h2 className="mb-3 font-display text-lg font-bold text-[var(--ink)]">My businesses</h2>
    <div className="hide-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
      {/* ...old horizontal-scroll cards... */}
    </div>
  </section>
)}
```

with:

```tsx
<OutletCardStack />
```

`OutletCardStack` returns `null` internally when there are no memberships, so the unconditional mount is correct — no `length > 0` guard needed at the call site.

`tenantPath` is still imported and used by `BusinessCard` further down in the same file — do not remove that import.

- [ ] **Step 3: Typecheck**

Run: `npm run lint -w frontend`
Expected: no errors, no unused-import warnings.

- [ ] **Step 4: Manual browser check**

Log in as `bikash@example.com` (3 outlets, 3 companies) at `/customer-login`, land on `/explore`. Confirm:
- Front card shows an outlet name, logo (or initial tile), and a points balance, with the small avatar circle overlapping its top-center edge.
- Up to two more card edges are visible peeking behind it, progressively smaller/more transparent/offset upward.
- Clicking a peeking card's visible sliver brings it to front (with a spring-y animation, not an instant snap) and its own info now fills the front slot; the avatar stays in place (still overlapping whichever card is now front).
- Clicking the front card itself navigates to that outlet's dashboard (`/[company]/[outlet]/dashboard`).
- Log out, log in as `asha@example.com` (2 outlets) — confirm it degrades gracefully to a front card + 1 peek, no dead space.
- Log in as a customer with exactly one outlet (or check any account with a single membership) — confirm a single static card renders, no peek, no console error from `depth > MAX_PEEK_DEPTH` edge cases.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/OutletCardStack.tsx frontend/src/routes/Explore.tsx
git commit -m "feat(customer): replace My businesses row with tappable outlet card stack"
```

---

## Task 3: Header tint — extract `GlobalHeader`, wire `heroColor`

**Files:**
- Modify: `frontend/src/components/customer/GlobalCustomerLayout.tsx` (extract header JSX into a new `GlobalHeader` sub-component that consumes `useExploreHero()`)
- Modify: `frontend/src/components/customer/OutletCardStack.tsx` (push the active card's colour into context)

**Interfaces:**
- Consumes: `useExploreHero()` from Task 1.
- Produces: `GlobalHeader` (module-private component inside `GlobalCustomerLayout.tsx`, not exported — only called from `GlobalCustomerLayout`'s own return).

**Why the extraction is required:** `useContext` only sees a `Provider` that is an *ancestor* of the calling component in the rendered tree. `GlobalCustomerLayout` creates `ExploreHeroProvider` as part of its own return value — a call to `useExploreHero()` at the top of `GlobalCustomerLayout` itself would be looking for a provider *above* `GlobalCustomerLayout`, not the one it's about to render as a child. The header must become its own component, rendered *inside* `<ExploreHeroProvider>`, for its `useExploreHero()` call to resolve.

- [ ] **Step 1: Extract `GlobalHeader` in `GlobalCustomerLayout.tsx`**

Add these imports:

```tsx
import { motion, useTransform } from "motion/react";
import { useExploreHero } from "../../context/ExploreHeroContext";
```

Update the existing `CustomerAuthContext` import to also bring in the type:

```tsx
import { useCustomerAuth, type GlobalAccount } from "../../context/CustomerAuthContext";
```

Add a new component in the same file, above `GlobalCustomerLayout` (below the existing `Tab` component):

```tsx
function GlobalHeader({ onScan, globalAccount }: { onScan: () => void; globalAccount: GlobalAccount }) {
  const { heroColor, progress } = useExploreHero();
  const tintedOpacity = useTransform(progress, [0, 1], [1, 0]);
  const neutralOpacity = useTransform(progress, [0, 1], [0, 1]);
  const tintedBackground = heroColor
    ? `linear-gradient(180deg, color-mix(in srgb, ${heroColor} 55%, white), color-mix(in srgb, ${heroColor} 30%, white))`
    : undefined;

  return (
    <header
      className={`sticky top-0 z-20 flex-shrink-0 ${
        heroColor
          ? "relative overflow-hidden"
          : "bg-[var(--surface)]/95 shadow-[0_1px_16px_-6px_rgba(20,32,28,0.14)] backdrop-blur"
      }`}
    >
      {heroColor && (
        <>
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{ background: tintedBackground, opacity: tintedOpacity }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[var(--surface)]/95 shadow-[0_1px_16px_-6px_rgba(20,32,28,0.14)] backdrop-blur"
            style={{ opacity: neutralOpacity }}
          />
        </>
      )}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl items-center gap-3 px-5 py-3">
        <Link to="/explore" className="flex flex-shrink-0 items-center gap-2">
          <StampdLogo size={22} />
          <span className="font-display text-lg font-bold text-[var(--ink)]">{PLATFORM_NAME}</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          <Tab to="/explore" icon={Compass} label="Discover" variant="top" />
          <Tab to="/explore/events" icon={CalendarDays} label="Events" variant="top" />
          <Tab to="/explore/mine" icon={Store} label="My businesses" variant="top" />
          <Tab to="/explore/profile" icon={CircleUser} label="Profile" variant="top" />
        </nav>

        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <button
            onClick={onScan}
            aria-label="Scan a business's QR code"
            className="flex items-center gap-2 rounded-[var(--radius-btn)] bg-[var(--primary)] px-3.5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
          >
            <QrCode className="h-4 w-4" />
            <span className="hidden sm:inline">Scan</span>
          </button>
          <NavLink
            to="/explore/profile"
            aria-label="Profile"
            className="flex items-center justify-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
          >
            <CustomerAvatar
              accountId={globalAccount.id}
              avatarVersion={globalAccount.avatarVersion}
              name={globalAccount.name}
              size={36}
            />
          </NavLink>
        </div>
      </div>
    </header>
  );
}
```

Now replace the inline `<header>...</header>` block inside `GlobalCustomerLayout`'s final return (everything from `<header className="sticky top-0 z-20...` through its matching `</header>`) with:

```tsx
<GlobalHeader onScan={() => setScanOpen(true)} globalAccount={globalAccount} />
```

`globalAccount` is guaranteed non-null at this point in the function — the two early returns above it already handled the null and no-phone cases, exactly as the removed inline header code already assumed (it read `globalAccount.id` unguarded).

- [ ] **Step 2: Push the active card's colour into context from `OutletCardStack`**

In `frontend/src/components/customer/OutletCardStack.tsx`, add:

```tsx
import { useEffect } from "react";
import { useExploreHero } from "../../context/ExploreHeroContext";
```

Inside `OutletCardStack`, before the `if (memberships.length === 0) return null;` line, add:

```tsx
const { setHeroColor } = useExploreHero();
const clampedIndexForColor = memberships.length ? Math.min(activeIndex, memberships.length - 1) : 0;
const activeColor = memberships[clampedIndexForColor]?.branding.primaryColor ?? null;

useEffect(() => {
  setHeroColor(activeColor);
  return () => setHeroColor(null);
}, [activeColor, setHeroColor]);
```

(This computes `clampedIndex` a second time, before the early return — hooks must run unconditionally on every render, so this can't be deferred past the `if` guard. The existing `clampedIndex` further down the function, used for rendering, stays as-is.)

- [ ] **Step 3: Typecheck**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Manual browser check**

Log in as `bikash@example.com`, land on `/explore`. Confirm:
- The top header (logo, nav, scan button, avatar) now shows a soft gradient tinted toward the front card's outlet colour instead of the plain white/neutral bar — and it visually continues into the card zone below it with no hard seam or shadow line between them.
- Tap a peeking card to bring a *different* outlet to front — the header's tint shifts to match the new front card's colour.
- Navigate to `/explore/mine`, `/explore/events`, `/explore/profile` — header must revert to the exact plain neutral bar from before this change (no tint, normal shadow/blur). Navigate back to `/explore` — tint reappears.
- Log in as a customer with zero memberships (or check the empty-state path) — header stays neutral throughout, since `OutletCardStack` renders `null` and never mounts the effect that would set a colour... *actually it does mount and run the effect even when it returns `null` from render, setting `heroColor` to `null` either way* — confirm visually the header still looks neutral (it will, since `activeColor` is `null` when `memberships` is empty).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/GlobalCustomerLayout.tsx frontend/src/components/customer/OutletCardStack.tsx
git commit -m "feat(customer): tint explore header to the active outlet card's colour"
```

---

## Task 4: Drag-to-swipe on the front card

**Files:**
- Modify: `frontend/src/components/customer/OutletCardStack.tsx`

**Interfaces:**
- No new exports — this only changes `OutletCard`'s `depth === 0` branch and adds a `handleSwipe` callback in `OutletCardStack`.

- [ ] **Step 1: Add a clamped swipe handler in `OutletCardStack`**

Add, alongside the existing `setActiveIndex` state:

```tsx
const handleSwipe = (direction: "next" | "prev") => {
  setActiveIndex((i) => {
    const next = direction === "next" ? i + 1 : i - 1;
    return Math.max(0, Math.min(memberships.length - 1, next));
  });
};
```

Pass it down to `OutletCard`:

```tsx
<OutletCard
  membership={m}
  depth={depth}
  onTap={() => setActiveIndex(i)}
  onSwipe={handleSwipe}
/>
```

- [ ] **Step 2: Add the drag gesture to the front card in `OutletCard`**

Update `OutletCard`'s signature:

```tsx
function OutletCard({
  membership,
  depth,
  onTap,
  onSwipe,
}: {
  membership: MyTenantMembership;
  depth: number;
  onTap: () => void;
  onSwipe: (direction: "next" | "prev") => void;
}) {
```

Replace the `if (depth === 0)` branch with:

```tsx
if (depth === 0) {
  return (
    <motion.div
      className={cardClassName}
      style={{ zIndex: 10 - depth }}
      animate={animate}
      transition={transition}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.5}
      onDragEnd={(_event, info) => {
        const DISTANCE_THRESHOLD = 60;
        const VELOCITY_THRESHOLD = 500;
        if (info.offset.y < -DISTANCE_THRESHOLD || info.velocity.y < -VELOCITY_THRESHOLD) {
          onSwipe("next");
        } else if (info.offset.y > DISTANCE_THRESHOLD || info.velocity.y > VELOCITY_THRESHOLD) {
          onSwipe("prev");
        }
      }}
    >
      <Link to={tenantPath(membership.companySlug, membership.slug, "dashboard")}>{content}</Link>
    </motion.div>
  );
}
```

The `motion.button` branch for `depth > 0` is unchanged.

- [ ] **Step 3: Typecheck**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Manual browser check**

Log in as `bikash@example.com`, on `/explore`:
- Drag the front card upward past a short distance (or flick it quickly) — the next outlet becomes front, header retints, with a spring settle (not an instant jump).
- Drag it a small distance and release — it should snap back to its original position/data without changing outlets (below threshold).
- Drag downward on the front card while a previous outlet exists — it goes back to the prior outlet.
- On the *first* card, drag downward (attempting to go before index 0) — the card should rubber-band and bounce back to the same outlet, not error or go negative.
- On the *last* card, drag upward — same rubber-band-and-stay behavior, no wraparound to the first card.
- Confirm the front card is still tappable/navigable as a `Link` when *not* being dragged (a plain click/tap without drag still opens the outlet dashboard).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/OutletCardStack.tsx
git commit -m "feat(customer): add drag-to-swipe gesture to outlet card stack"
```

---

## Task 5: Scroll collapse

**Files:**
- Modify: `frontend/src/components/customer/OutletCardStack.tsx`

**Interfaces:**
- No new exports — replaces the `<section>`/inner `<div>` wrapper markup with scroll-driven `motion.div`s, and feeds the local scroll progress into the context `progress` MotionValue from Task 1/3 so `GlobalHeader` crossfades in sync.

- [ ] **Step 1: Add scroll tracking and push it into the shared context value**

By this point in the file (after Tasks 2-4), the top of `OutletCardStack.tsx` has:

```tsx
import { Fragment, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
```

Replace those two lines with:

```tsx
import { Fragment, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useMotionValueEvent } from "motion/react";
```

Inside the `OutletCardStack` function body, the existing hook calls from Tasks 2-3 read (in order): `useMyTenants()`, `useCustomerAuth()`, `useState(0)` for `activeIndex`, `useExploreHero()`, then the `activeColor`/`useEffect` block, then the `if (memberships.length === 0) return null;` guard. **All of the following new hooks must be added immediately after that `useEffect` block and still strictly before the `if (memberships.length === 0) return null;` line** — hooks cannot follow a conditional return.

First, change the existing context destructure line from Task 3:

```tsx
const { setHeroColor } = useExploreHero();
```

to:

```tsx
const { setHeroColor, progress } = useExploreHero();
```

Then, directly below the existing `activeColor`/`useEffect` block (still above the `if (memberships.length === 0) return null;` guard), add:

```tsx
const [heroHeight, setHeroHeight] = useState(() =>
  typeof window !== "undefined" ? Math.min(window.innerHeight * 0.5, 380) : 380,
);

useEffect(() => {
  const onResize = () => setHeroHeight(Math.min(window.innerHeight * 0.5, 380));
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);

const sectionRef = useRef<HTMLDivElement>(null);
const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });

useMotionValueEvent(scrollYProgress, "change", (v) => progress.set(v));

const sectionHeight = useTransform(scrollYProgress, [0, 1], [heroHeight, 0]);
const contentOpacity = useTransform(scrollYProgress, [0, 0.6, 1], [1, 0, 0]);
const contentY = useTransform(scrollYProgress, [0, 1], [0, -24]);
```

The pre-existing `if (memberships.length === 0) return null;` line stays exactly where it was, now after all of the above.

- [ ] **Step 2: Replace the outer markup with the scroll-driven wrapper**

Replace:

```tsx
return (
  <section className="relative mb-7 flex justify-center" style={{ height: "min(50vh, 380px)" }}>
    <div className="relative w-full max-w-sm">
      {memberships.map((m, i) => {
```

with:

```tsx
return (
  <motion.div
    ref={sectionRef}
    className="relative mb-7 flex justify-center overflow-hidden"
    style={{ height: sectionHeight }}
  >
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -bottom-1 h-6 shadow-[0_12px_20px_-8px_rgba(20,32,28,0.3)]"
      style={{ opacity: scrollYProgress }}
    />
    <motion.div className="relative w-full max-w-sm" style={{ opacity: contentOpacity, y: contentY }}>
      {memberships.map((m, i) => {
```

And update the matching closing tags at the end of the function from:

```tsx
      </div>
    </section>
  );
}
```

to:

```tsx
      })}
    </motion.div>
  </motion.div>
);
}
```

(Only the two closing wrapper tags change — the `{memberships.map(...)})}` closing itself was already there; make sure the `.map()` closing parenthesis/brace still lines up correctly with the new nesting.)

- [ ] **Step 3: Typecheck**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Manual browser check**

Log in as `bikash@example.com`, on `/explore` (with enough Discover results below to actually scroll — the seed data provides several businesses):
- At the top of the page, the card stack is fully visible at roughly half the viewport height, header tinted.
- Scroll down slowly: the card stack's content (cards + avatar) fades and shifts upward while the whole hero zone's height shrinks toward zero, and the header's tinted background crossfades to the plain neutral one **in sync** with that collapse — it should read as one continuous dissolve, not two separately-timed animations.
- Keep scrolling: once fully collapsed, only the compact neutral sticky header remains pinned at top; the Discover grid occupies the freed-up space with no leftover gap.
- Scroll back up: the effect reverses smoothly (this is driven directly by `scrollYProgress`, not a one-shot animation, so it must track scroll position bidirectionally with no jump).
- Resize the browser window (or check on a shorter-height device via responsive mode) — the hero's initial height visibly adapts (capped at 380px on tall viewports, `50vh` on short ones).
- Re-run the Task 2 and Task 4 checks (tap-to-switch, drag-to-swipe) to confirm they still work correctly now that the wrapper structure changed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/OutletCardStack.tsx
git commit -m "feat(customer): collapse outlet card stack into header on scroll"
```

---

## Final verification

- [ ] Run `npm run lint` from the repo root (builds both workspaces' typecheck) — must pass with zero errors.
- [ ] Full manual pass through Tasks 2, 3, 4, 5's browser checks in one sitting, using `bikash@example.com` (3 outlets), `asha@example.com` (2 outlets), and any single-outlet seeded customer, to confirm nothing regressed across the four incremental commits.
- [ ] Confirm `/explore/mine`, `/explore/events`, `/explore/profile`, and the tenant-scoped customer console (`CustomerLayout`) are all visually unchanged from before this feature.

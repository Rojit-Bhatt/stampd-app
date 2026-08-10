# Customer Outlet Dashboard Apple Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the per-outlet customer dashboard (`CustomerDashboard.tsx`,
`PointsBalanceCard.tsx`, `EventCard.tsx`) onto the same Apple-native system
Phase 1 built for the global Explore shell — same tokens, same type scale,
same content discipline, and a wallet-card treatment on the balance card
that echoes the Discover stack it visually collapses from.

**Architecture:** `CustomerLayout.tsx` gets the same `.customer-shell` +
`useCustomerTheme()` wiring `GlobalCustomerLayout.tsx` already has (Phase 1
Task 3), so every token already defined in `index.css` applies here with no
new CSS. `PointsBalanceCard` adopts `OutletCardStack`'s `color-mix`-from-brand
gradient technique, but driven by the already-in-scope `var(--brand)` custom
property rather than a new prop — no data plumbing needed.

**Tech Stack:** Same as Phase 1 — React 19, TypeScript, Vite, Tailwind CSS v4
(`@theme` tokens in `frontend/src/index.css`), `motion/react`.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-10-customer-outlet-dashboard-apple-redesign-design.md`.
- Builds directly on Phase 1's tokens (`docs/superpowers/specs/2026-08-10-customer-explore-shell-apple-redesign-design.md`,
  section 3) — do not redefine `.customer-shell`/`.customer-shell.dark` or the
  type-scale utility classes; they already exist in `frontend/src/index.css`.
- No frontend test runner exists in this repo. "Test" steps mean: (1)
  `npm run lint` (`tsc --noEmit`) passes, and (2) a concrete browser
  verification checklist.
- Scope boundary: `CustomerLayout.tsx`, `CustomerDashboard.tsx`,
  `PointsBalanceCard.tsx`, `EventCard.tsx`, and net-new files only.
  `CustomerMenu.tsx`, `CustomerHistory.tsx`, `CustomerRewards.tsx`,
  `CustomerSettings.tsx`, `BottomNav.tsx` are untouched — separate Phase 3.
- One sentence maximum per helper/subhead text touched in this work.
- Every step that touches a `.tsx` file ends with `npm run lint` passing
  from `frontend/`.

---

## Task 1: Wrap `CustomerLayout` in the customer-shell scope

**Files:**
- Modify: `frontend/src/components/customer/CustomerLayout.tsx`

**Interfaces:**
- Consumes: `useCustomerTheme` from `frontend/src/hooks/useCustomerTheme.ts` (already exists, Phase 1 Task 3).

- [ ] **Step 1: Import and call the hook**

Add the import alongside `CustomerLayout.tsx`'s other hook imports:

```typescript
import { useCustomerTheme } from "../../hooks/useCustomerTheme";
```

Inside `CustomerLayout()`, alongside its other hook calls (near `const
[scanOpen, setScanOpen] = useState(false);`):

```typescript
const { theme } = useCustomerTheme();
```

- [ ] **Step 2: Apply the scope class to the root div**

Find the root `<div className="flex min-h-screen flex-col bg-[var(--bg)]">`
(the one returned after the loading/phone-gate early returns, not those
early-return divs themselves — leave those as plain `bg-[var(--bg)]`
spinners, they render before the shell's own class would matter anyway).
Replace:

```tsx
<div className="flex min-h-screen flex-col bg-[var(--bg)]">
```

with:

```tsx
<div className={`customer-shell flex min-h-screen flex-col bg-[var(--bg)] ${theme === "dark" ? "dark" : ""}`}>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 4: Browser verification**

Visit a tenant dashboard (`/<company>/<outlet>/dashboard`) at mobile
viewport. Confirm the page now renders on the true-black dark palette by
default (matching `/explore`'s look), Inter type throughout, and that
toggling the Appearance switch in Profile (`/explore/profile` or this
outlet's `/settings`, same shared `CustomerProfilePanel`) flips this screen
too, since both shells read the same `localStorage` key.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/CustomerLayout.tsx
git commit -m "feat(customer): wire dark-by-default theme onto the outlet dashboard shell"
```

---

## Task 2: `PointsBalanceCard` — wallet gradient treatment

**Files:**
- Modify: `frontend/src/components/customer/PointsBalanceCard.tsx`

**Interfaces:**
- No prop changes — `brand` comes from the already-in-scope `var(--brand)`
  custom property (set by `TenantProvider` on this subtree), not a new prop.

- [ ] **Step 1: Replace the card's surface and border**

Find:

```tsx
      className="relative mb-4 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient"
```

Replace with a `style` prop carrying the gradient (className drops the
border/bg utility classes, since they're superseded by the inline gradient):

```tsx
      className="relative mb-4 overflow-hidden rounded-[var(--radius-card)] border border-white/12 p-6"
      style={{
        backgroundImage: `linear-gradient(148deg,
          color-mix(in srgb, var(--brand) 34%, #0A1411) 0%,
          color-mix(in srgb, var(--brand) 20%, #0A1411) 52%,
          color-mix(in srgb, var(--brand) 8%, #05100D) 100%)`,
        boxShadow: `0 24px 48px -24px color-mix(in srgb, var(--brand) 45%, rgba(5,16,13,0.85)),
          0 8px 20px -12px rgba(5,16,13,0.45),
          inset 0 1px 0 0 rgba(255,255,255,0.16)`,
      }}
```

This is deliberately always-dark regardless of the shell's light/dark
toggle — same precedent `OutletCardStack`'s cards already set: a rich
brand-tinted card, not a surface that flips with the page theme. `var(--brand)`
resolves correctly either way since `TenantProvider` sets it independent of
`.customer-shell`'s own tokens.

- [ ] **Step 2: Remove the old accent bar, add the sheen overlay**

Find:

```tsx
      {/* The one piece of tenant colour on this card. --brand-accent, not
          --brand: it steps aside to the ink when the outlet's own brand is
          green, so this bar can never be mistaken for the value figure. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: "var(--brand-accent)" }}
      />
```

Replace with:

```tsx
      {/* Brand identity now lives in the whole card's gradient, not a thin
          accent bar — same technique OutletCardStack uses. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(125deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 28%, rgba(255,255,255,0) 48%),
            radial-gradient(120% 95% at 88% 106%, color-mix(in srgb, var(--brand) 55%, transparent) 0%, transparent 62%)`,
        }}
      />
```

- [ ] **Step 3: Fix the name, eyebrow, and tier badge for the always-dark card**

Find:

```tsx
      <div className="min-w-0">
        {businessName && (
          <div className="flex items-center gap-2">
            <div
              className="min-w-0 truncate font-display text-base font-bold"
              style={{ color: "var(--brand-ink)" }}
            >
              {businessName}
            </div>
            {tier && <Badge>{tier}</Badge>}
          </div>
        )}
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          Your points
        </div>
      </div>
```

Replace with (`var(--brand-ink)`/`var(--soft)` both shift with the shell's
light/dark toggle — wrong for a card that's always dark; fixed near-white
values match `OutletCardStack`'s equivalent text):

```tsx
      <div className="relative z-10 min-w-0">
        {businessName && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 truncate text-headline text-[#F4F8F6]">
              {businessName}
            </div>
            {tier && <Badge className="bg-white/15 text-[#F4F8F6]">{tier}</Badge>}
          </div>
        )}
        <div className="mt-0.5 text-caption text-white/40">Your points</div>
      </div>
```

- [ ] **Step 4: Fix the balance figure's stacking context and the expiry warning**

Find:

```tsx
      <div className="mt-3">
        {isLoading ? (
          <Skeleton className="h-14 w-36" />
        ) : (
          <motion.div
            key={balance}
            initial={m.pick({ scale: 0.92, opacity: 0.6 }, false)}
            animate={{ scale: 1, opacity: 1 }}
            transition={m.spring("settle")}
            className="origin-left font-numeral font-numeral-lg text-[56px] leading-none text-[var(--primary)]"
          >
            {formatPoints(balance)}
          </motion.div>
        )}
      </div>

      {showExpiry && (
        <div
          className="mt-4 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          {daysLeft <= 0
            ? "These points have expired."
            : `Expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — any visit resets the clock.`}
        </div>
      )}
```

Replace with (balance figure gets `relative z-10` so it renders above the
sheen overlay from Step 2; the expiry box's `--warn-soft`/`--warn` are also
theme-conditional, same problem as Step 3 — fixed to the dark warn values
Phase 1 already established for this always-dark-card context):

```tsx
      <div className="relative z-10 mt-3">
        {isLoading ? (
          <Skeleton className="h-14 w-36" />
        ) : (
          <motion.div
            key={balance}
            initial={m.pick({ scale: 0.92, opacity: 0.6 }, false)}
            animate={{ scale: 1, opacity: 1 }}
            transition={m.spring("settle")}
            className="origin-left font-numeral font-numeral-lg text-[56px] leading-none text-[var(--primary)]"
          >
            {formatPoints(balance)}
          </motion.div>
        )}
      </div>

      {showExpiry && (
        <div
          className="relative z-10 mt-4 rounded-[var(--radius-btn)] px-3.5 py-2.5 text-[13px] font-semibold"
          style={{ background: "#332405", color: "#FF9F0A" }}
        >
          {daysLeft <= 0
            ? "These points have expired."
            : `Expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — any visit resets the clock.`}
        </div>
      )}
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 6: Browser verification**

Visit a tenant dashboard. Confirm the balance card now renders as a
brand-tinted dark gradient (not a flat surface with a thin top bar),
readable white outlet name, green balance figure, and — if the test
account's points are near expiry — a legible amber warning box. Switch the
Appearance toggle between light and dark: confirm this card stays visually
the same (always dark), while the rest of the page (background, other
Section cards) changes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/customer/PointsBalanceCard.tsx
git commit -m "style(customer): PointsBalanceCard onto the wallet gradient treatment"
```

---

## Task 3: `CustomerDashboard` — type scale on heading and Section titles

**Files:**
- Modify: `frontend/src/routes/CustomerDashboard.tsx`

**Interfaces:**
- No signature changes.

- [ ] **Step 1: Page heading**

Find:

```tsx
        <h1 className="font-display text-2xl font-bold leading-tight text-[var(--ink)]">
```

Replace with:

```tsx
        <h1 className="text-large-title text-[var(--ink)]">
```

- [ ] **Step 2: Section title — drop the all-caps eyebrow**

Find:

```tsx
        <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
          {title}
        </h2>
```

Replace with:

```tsx
        <h2 className="text-title-3 text-[var(--ink)]">
          {title}
        </h2>
```

This is the `Section` component used by every card on this screen ("Coming
up", "Featured picks", "Upcoming events", "Google Reviews", "Visit us") —
one change fixes all five.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 4: Browser verification**

Confirm the page's own heading ("Welcome back...") renders at Large Title
size, and every section below the balance card now has a plain bold
sentence-case title instead of a small tracked all-caps label.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/CustomerDashboard.tsx
git commit -m "style(customer): dashboard heading and section titles onto the HIG type scale"
```

---

## Task 4: First-visit Scan tip + Google review copy trim

**Files:**
- Create: `frontend/src/hooks/useFirstVisitTip.ts`
- Modify: `frontend/src/routes/CustomerDashboard.tsx`

**Interfaces:**
- Produces: `useFirstVisitTip(key: string): { show: boolean; dismiss: () =>
  void }`, exported from `frontend/src/hooks/useFirstVisitTip.ts`.

- [ ] **Step 1: Write the hook**

```typescript
// frontend/src/hooks/useFirstVisitTip.ts
import { useState } from "react";

function storageKey(key: string): string {
  return `stampd-tip-seen:${key}`;
}

// One-way, unlike useCustomerTheme: once shown and dismissed, a tip never
// comes back. `key` scopes it — e.g. per outlet, so a customer with
// memberships at two outlets sees each outlet's tip once, not just the
// first one they ever visited.
export function useFirstVisitTip(key: string): { show: boolean; dismiss: () => void } {
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(storageKey(key)) !== "1";
  });

  const dismiss = () => {
    window.localStorage.setItem(storageKey(key), "1");
    setShow(false);
  };

  return { show, dismiss };
}
```

- [ ] **Step 2: Wire it into `CustomerDashboard.tsx`**

Add the import:

```typescript
import { useFirstVisitTip } from "../hooks/useFirstVisitTip";
```

`CustomerDashboard` already destructures `tenant` from `useTenant()` — add
`slug` alongside it:

```typescript
const { tenant, slug } = useTenant();
```

Then, alongside the component's other hook calls:

```typescript
const { show: showScanTip, dismiss: dismissScanTip } = useFirstVisitTip(`scan-hint:${slug}`);
```

- [ ] **Step 3: Replace the permanent footer hint**

Find:

```tsx
      <p className="mt-5 text-center text-xs text-[var(--muted)]">
        Tap Scan and point at the counter's QR to earn points.
      </p>
```

Replace with:

```tsx
      {showScanTip && (
        <button
          type="button"
          onClick={dismissScanTip}
          className="mt-5 block w-full text-center text-xs text-[var(--muted)]"
        >
          Tap Scan and point at the counter's QR to earn points.
        </button>
      )}
```

- [ ] **Step 4: Trim the Google review pitch**

Find:

```tsx
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  Love what we offer? We'd love if you could leave a review on Google! Your support helps other customers find us.
                </p>
```

Replace with:

```tsx
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  Enjoying it? Leave us a review.
                </p>
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 6: Browser verification**

On first load of a tenant dashboard, confirm the Scan tip is visible;
click it, confirm it disappears; reload the page and confirm it stays
gone. Run `window.localStorage.clear()` and reload to confirm it reappears
(simulating a genuinely first-ever visit). Confirm the Google Reviews
section (if the tenant has `contact.googleReviewUrl` configured) now shows
the one-line pitch instead of three sentences.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useFirstVisitTip.ts frontend/src/routes/CustomerDashboard.tsx
git commit -m "feat(customer): first-visit-only Scan tip, trim Google review copy to one line"
```

---

## Task 5: `EventCard` — onto the type scale

**Files:**
- Modify: `frontend/src/components/customer/EventCard.tsx`

**Interfaces:**
- No signature changes.

- [ ] **Step 1: Retarget the three text sizes**

Find:

```tsx
        <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--brand-ink)" }}>
```

Replace with:

```tsx
        <div className="flex items-center gap-1.5 text-caption" style={{ color: "var(--brand-ink)" }}>
```

Find:

```tsx
        <div className="mt-1 text-[15px] font-semibold leading-snug text-[var(--ink)]">{event.title}</div>
```

Replace with:

```tsx
        <div className="mt-1 text-subhead text-[var(--ink)]">{event.title}</div>
```

Find both remaining `text-[13px]` occurrences (location line and
description line) and replace with `text-footnote`:

```tsx
          <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
```
→
```tsx
          <div className="mt-1 flex items-center gap-1.5 text-footnote text-[var(--muted)]">
```

```tsx
          <div className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-[var(--muted)]">
```
→
```tsx
          <div className="mt-1.5 whitespace-pre-line text-footnote leading-relaxed text-[var(--muted)]">
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 3: Browser verification**

Visit a tenant dashboard with at least one upcoming event, or
`/explore/events`, which also renders this component. Confirm event cards
still read clearly — eyebrow date, semibold title, muted location/description
— just on the shared type scale now instead of ad hoc pixel sizes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/customer/EventCard.tsx
git commit -m "style(customer): EventCard onto the HIG type scale"
```

---

## Task 6: Full-flow verification

No code changes — final gate confirming the whole Phase 2 surface together.

- [ ] **Step 1: Type-check the whole frontend**

```bash
cd frontend && npm run lint
```

Expected: exits 0.

- [ ] **Step 2: Manual walkthrough at mobile viewport (375px), dark theme (default)**

Log in as a customer with at least one outlet membership. Visit that
outlet's dashboard: confirm the balance card's brand gradient, the Scan
tip's first-visit behavior, every Section's plain title, and (if
configured) the trimmed Google review copy and a legible contact/map
section. Confirm the bottom nav's Scan FAB still opens the tenant-scoped
scanner correctly.

- [ ] **Step 3: Toggle Appearance, confirm both shells stay in sync**

From this dashboard's Profile (or `/explore/profile` — same shared
component), toggle dark/light. Confirm the outlet dashboard's page
chrome flips (background, section cards) while `PointsBalanceCard` stays
its own always-dark gradient by design. Navigate to `/explore` and confirm
it's on the same theme — proving the shared `localStorage` key keeps both
shells in sync.

- [ ] **Step 4: Desktop viewport (≥1280px)**

Confirm the header (not a bottom nav) carries navigation + Scan + avatar,
matching the pattern Phase 1 established for the global shell, and that
`BottomNav` (already lg:hidden) doesn't need any change here.

- [ ] **Step 5: Final commit (if any fixes were needed)**

If Steps 2–4 surfaced issues, fix them in the relevant file from the task
above, re-run `npm run lint`, and commit with a message describing the
specific fix.

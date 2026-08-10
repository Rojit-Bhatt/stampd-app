# Customer Outlet Dashboard — Apple-Native Redesign (Phase 2)

Date: 2026-08-10
Status: Draft, pending user review

## Problem

Phase 1 (`docs/superpowers/specs/2026-08-10-customer-explore-shell-apple-redesign-design.md`)
redesigned the global Explore shell — Discover, My Places, Events, Profile —
around Apple's actual design language. It deliberately deferred the
per-outlet customer dashboard to a later phase to keep each pass shippable.

This spec covers that deferred phase, scoped to what the user actually
asked about: the outlet dashboard screen itself — `CustomerDashboard.tsx`
(balance card, Coming up, Featured picks, Upcoming events, Google Reviews,
Visit us) — plus its direct pieces, `PointsBalanceCard.tsx` and
`EventCard.tsx`, and the `CustomerLayout.tsx` shell that wraps it.

**Explicitly out of scope:** `CustomerMenu.tsx`, `CustomerHistory.tsx`,
`CustomerRewards.tsx`, `CustomerSettings.tsx` — separate screens the user
didn't ask about, deferred to a later Phase 3. `BottomNav.tsx` needs no
chrome work — unlike the Explore shell's nav (which Phase 1 had to build
the glass-pill-plus-FAB pattern for from scratch), this one already has it.

## 1. Scoping infrastructure

`CustomerLayout.tsx`'s root `<div className="flex min-h-screen flex-col
bg-[var(--bg)]">` gets the same `customer-shell` (+ conditional `dark`)
class treatment `GlobalCustomerLayout.tsx` already has, via the same
`useCustomerTheme()` hook. This is mechanical, not a new design decision —
without it, none of Phase 1's tokens (Inter, true-black dark, Apple green)
apply here at all, and the toggle in Profile (shared component,
`CustomerProfilePanel.tsx`) already writes to the same `localStorage` key
regardless of which shell renders it, so both shells stay in sync for free.

## 2. PointsBalanceCard — wallet treatment

Currently a plain bordered card with a thin `--brand-accent` top bar. Moves
to the same technique `OutletCardStack.tsx`'s `cardSurface()` already uses:
a `color-mix`-from-brand gradient background (capped so it stays dark and
legible for any brand hex), the same glass sheen overlay, Apple-green
(`var(--primary)`) balance figure on Inter tabular numerals, HIG type scale
for the outlet name and "Your points" eyebrow.

This is a deliberate two-scale echo, not a coincidence: the wallet card a
customer flicks through on Discover collapses to exactly this card once
they're inside that outlet. Making them visually the same object reinforces
that.

The existing rule stays: the balance figure is always `var(--primary)`,
never the brand hue, regardless of how dark/saturated the gradient gets
around it.

## 3. Section cards — content rule enforcement

Every `Section` in `CustomerDashboard.tsx` ("Coming up", "Featured picks",
"Upcoming events", "Google Reviews", "Visit us") currently renders its title
as a tracked all-caps 10px eyebrow — exactly the pattern Phase 1's spec
named as an anti-pattern: eyebrow treatment is for genuine metadata (a
status, a category), not section titles. Converts to plain `.text-title-3`
sentence-case, applying Phase 1's own rule here rather than introducing a
new one.

## 4. Content trims

- Google review pitch (`CustomerDashboard.tsx`) — three sentences down to
  one: *"Enjoying it? Leave us a review."* The button below already carries
  the call to action; repeating it in prose doesn't earn its place.
- Permanent footer hint ("Tap Scan and point at the counter's QR to earn
  points.") becomes a first-visit-only tip. New `useFirstVisitTip(key)` hook
  — same `localStorage`-flag shape as `useCustomerTheme`, but boolean and
  one-way (once dismissed/shown, never again) rather than toggleable. Shown
  once per customer per outlet (keyed by tenant slug, since a customer's
  first visit to *this* outlet is what matters, not their first visit to
  the app).

## 5. EventCard — type scale only

Already reasonably close to the HIG scale (11px eyebrow, 15px title, 13px
body) and already uses `var()` color tokens throughout, so it inherits the
new dark palette automatically with no code change there. Only the ad hoc
pixel sizes move onto the shared scale: eyebrow → `.text-caption`, title →
`.text-subhead` (15px, matches current), body/location → `.text-footnote`.

## 6. Materials & motion — no change to established rules

Section cards stay solid (Phase 1's rule: glass is for floating chrome —
nav and modals — only, not page content). Card entrance already uses
`useMotion()`/`SPRINGS.settle` where animated; no new gesture work, since
this screen has no drag-stack equivalent.

## Verification plan

- Visual check at mobile viewport, dark (default) and light, on a tenant
  with a distinctive brand color, to confirm the gradient card reads
  correctly against very light and very dark brand hues alike (the same
  `color-mix` capping `OutletCardStack` already relies on)
- Confirm `PointsBalanceCard`'s balance figure stays `var(--primary)` at
  both themes, never the brand hue
- Confirm the first-visit tip shows once, then stays hidden on reload,
  scoped per-outlet (a customer with two outlets sees it once at each)
- `npm run lint` (tsc) clean, per Phase 1's established gate — no test
  runner exists in this repo

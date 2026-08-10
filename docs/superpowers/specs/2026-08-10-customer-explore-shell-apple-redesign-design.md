# Customer Explore Shell — Apple-Native Redesign

Date: 2026-08-10
Status: Draft, pending user review

## Problem

The customer-facing app (the global Explore shell and the per-outlet customer
dashboard) currently reads as competently built but generic — "AI-app"
generic, in the user's words. The goal is a ground-up visual and interaction
redesign modeled on how Apple actually builds interfaces (per Apple's own
WWDC design talks and HIG), not a component swap or rearrangement of the
existing layout.

This is not a small change. The full surface (global Explore shell +
per-outlet customer dashboard, ~10 screens plus shared shell components) is
too large for one spec, so the work is split into phases. **This spec covers
Phase 1 only: the global Explore shell** — `Explore.tsx` (Discover),
`ExploreMine.tsx` (My Places), `ExploreEvents.tsx`, `ExploreProfile.tsx`, and
the shared `GlobalCustomerLayout.tsx` shell (header, nav, scanner modal).

Phase 2 (the per-outlet customer dashboard: `CustomerDashboard`,
`CustomerMenu`, `CustomerHistory`, `CustomerRewards`, `CustomerSettings`, and
`BottomNav`/`PointsBalanceCard`) applies the same system established here,
via its own spec, once Phase 1 has landed and been used.

**Explicitly out of scope for this phase:** the tenant-color-contract system
(green = value/action, tenant hue = identity only, never confused — see the
`darken`/`resolveImageUrl` color logic in `lib/color.ts`) is a solved,
deliberate system. This redesign restyles around it, not through it.

## Design language source

Built from Apple's own design communication, not visual mimicry of
screenshots:

- *Designing Fluid Interfaces* (WWDC 2018) — motion, gesture, interruptibility
- *The Details of UI Typography* (WWDC 2020) — optical sizing, tracking, leading
- *Principles of Great Design* (WWDC 2026) — purpose, agency, simplicity, craft
- Apple's own UX writing guidance — conciseness, read-aloud test
- Community-verified iOS system color values (Apple doesn't publish exact hex;
  these are the stable values used since iOS 13 across design tooling)

## 1. Typography — full replacement

Space Grotesk, DM Serif Display, and IBM Plex Mono are removed from UI text
entirely (mono may stay for genuine codes/slugs if any remain — audit at
implementation time). **Inter, one family, everywhere** — including the
points balance figure. Inter shares SF Pro's core design goal (built for
screens, optical sizing) and is already partially in use.

Hierarchy comes from weight + size + tracking + leading as a set, per Apple's
typography rules — never one fixed `letter-spacing` across all sizes.

| Role | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| Large Title | 34px / 2.125rem | 700 | -0.02em | 1.05 |
| Title 1 | 28px / 1.75rem | 700 | -0.018em | 1.1 |
| Title 2 | 22px / 1.375rem | 700 | -0.015em | 1.15 |
| Title 3 | 20px / 1.25rem | 600 | -0.012em | 1.2 |
| Headline | 17px / 1.0625rem | 600 | -0.005em | 1.3 |
| Body | 17px / 1.0625rem | 400 | 0 | 1.4 |
| Callout | 16px / 1rem | 400 | 0 | 1.35 |
| Subhead | 15px / 0.9375rem | 500 | 0 | 1.3 |
| Footnote | 13px / 0.8125rem | 400 | 0.005em | 1.3 |
| Caption | 11px / 0.6875rem | 600 | 0.01em | 1.3 |

The points balance keeps its outsized treatment but on Inter: ~56px / 700 /
-0.025em, tabular figures (`font-variant-numeric: tabular-nums`, already
implemented and kept).

Implementation note: `--font-display`, `--font-numeral`, `--font-serif`
tokens in `index.css` and the `.font-display` / `.font-numeral` classes are
retargeted to Inter, not deleted outright, so the token names stay stable for
any other code that references them.

## 2. Content & copy

Apple's own writing guidance: read it aloud, one idea per string, cut
anything that doesn't earn its place.

Rule for this redesign: **one sentence maximum per helper/subhead.** If a
label just restates what's already visually obvious, delete the label.
Section headings default to plain sentence-case text (Title 3), not tracked
all-caps eyebrow labels — reserve the eyebrow treatment for genuine metadata
(a status, a category tag), not section titles.

Applies to Phase 1 screens directly: category pill labels, empty states
("No businesses match that. Try a different search or category." — already
good, keep as the bar), the My Places empty state, and any future copy added
to these screens. Multi-sentence marketing-style copy (e.g. the Google
review pitch pattern currently in `CustomerDashboard.tsx`) is a Phase 2
concern but the rule applies there too when that phase starts.

One deliberate exception: the नमस्ते/Hello/Namaste greeting rotation
(Phase 2, `CustomerDashboard.tsx`) stays — Apple's own principle is "cut
everywhere except where it earns its place," and one small delight moment
per screen is the earned exception, not the rule.

## 3. Color & theming

**Light mode:** no changes. Current tokens (`--bg: #F7F8F7`,
`--surface: #FFFFFF`, `--surface-2: #EEF1EF`) are already near-identical to
Apple's real system values (`systemGroupedBackground` ≈ `#F2F2F7`,
`systemBackground` = `#FFFFFF`). Confirmed by direct comparison, not assumed.

**Dark mode — new values, replacing the existing unwired `.dark` block.**
Apple's actual dark canvas is true black with elevation via pure lightness
steps, not a tinted near-black:

```css
.dark {
  --bg: #000000;        /* Apple systemBackground/systemGroupedBackground dark */
  --surface: #1C1C1E;   /* Apple secondarySystemBackground dark */
  --surface-2: #2C2C2E; /* Apple tertiarySystemBackground dark */
  --line: #3A3A3C;       /* Apple systemGray4-equivalent, for hairline separators */

  --ink: #FFFFFF;         /* Apple label dark */
  --muted: #98989D;      /* Apple secondaryLabel-equivalent */
  --soft: #6C6C70;        /* Apple tertiaryLabel-equivalent */

  --primary: #30D158;     /* Apple systemGreen dark — shifted from mint #34D399 */
  --primary-deep: #248A3D;
  --primary-soft: #0F2818;

  --brand: var(--primary);      /* platform default; TenantProvider overrides per outlet */
  --brand-deep: var(--primary-deep);
  --brand-ink: var(--primary);
  --brand-on: #000000;
}
```

`--info`/`--warn`/`--err` semantic tokens get the same true-black-elevation
treatment at implementation time (currently green-tinted; rework to neutral
Apple-style semantic hues — systemBlue/systemOrange/systemRed dark
equivalents — while keeping the soft/solid pairing pattern already
established).

**Toggle:** dark is the default (matches the "Wallet" personality target —
premium, card-forward, mostly dark). A light/dark toggle lives in Profile
settings, persisted to `localStorage`, applied via the existing `.dark` class
on `<html>` (no new mechanism needed — `@custom-variant dark (&:is(.dark *))`
in `index.css` already wires Tailwind's `dark:` variant to it). No
`prefers-color-scheme` auto-detection in this phase — explicit default +
explicit toggle only, to keep behavior predictable.

## 4. Materials

Glass/translucency applies to **floating chrome only** — the bottom nav pill
(already glass, per the earlier glass-card-stack pass) and any sheets/modals
(the scanner modal, future action sheets). The header bar and page
backgrounds stay solid dark, not translucent. This limits `backdrop-filter`
surface area (perf-sensitive on lower-end Android WebViews) while still
landing the one place glass reads most Apple-native: a floating pill nav
with content scrolling underneath.

Per the Apple materials rules already loaded: never stack a light translucent
surface on another, bigger surfaces read as thicker (stronger blur + deeper
shadow than small chips), and modals get a dimming scrim while non-blocking
floating chrome (the nav) doesn't.

## 5. Motion

Springs, not CSS transitions, for anything touch-driven — critically damped
(`damping 1.0`, `response ~0.3-0.4`) as the default for all UI motion, bounce
(`damping ~0.8`) reserved for momentum-driven interactions only (a flick, a
drag release). The app already has a `motion/react` + `useMotion()` spring
helper (`lib/motion.ts`) — extend it, don't replace it.

**My Places wallet card stack gets real drag physics** — the flagship
interaction of this phase:

- Pointer Events with `setPointerCapture`, 1:1 finger tracking respecting
  grab offset (not snapping to card center)
- Velocity tracked from recent pointer history, handed off to the spring on
  release (no seam between drag and animation)
- Momentum projection for where a flick lands (Apple's exponential-decay
  projection function, not `v²/2a`), snapping to the nearest card
- Rubber-banding at the ends of the stack (progressive resistance, not a
  hard stop)
- Fully interruptible: grabbing a settling card mid-animation redirects it
  from its current on-screen position, never its target

Every other transition in this phase (tab switches, empty-state fades, the
category pill row, card entrance) uses a critically-damped spring via the
existing `useMotion()` helper — no bare CSS `transition`/`@keyframes` for
anything the user's input drives.

Respects `prefers-reduced-motion`: springs/drag physics replaced with a
simple opacity cross-fade, no overshoot, no parallax.

## 6. Navigation

Tab bar (`GlobalCustomerLayout.tsx`'s nav / the mobile bottom nav) stays
navigation-only in principle — Discover, My Places, Events, Profile — but
keeps its centered Scan action as a raised FAB breaking the bar's top edge.
This is a deliberate, acknowledged HIG bend: Scan is the single most-used
action in the app, and the FAB sits in the single most thumb-reachable spot
on the screen. Precedent: Apple's own Camera/Phone apps use similar
raised-action patterns despite the "tab bars are for navigation only" rule.

No change to the four destinations or their order.

## Phase 1 concrete scope

**Screens:** `Explore.tsx`, `ExploreMine.tsx`, `ExploreEvents.tsx`,
`ExploreProfile.tsx`

**Shared components touched:** `GlobalCustomerLayout.tsx` (header, nav,
theming shell), `GlobalScannerModal.tsx` (materials/motion only, not a
redesign of scanning itself), the My Places wallet card component(s)
(rebuilt for drag physics)

**Not touched in this phase:** `CustomerDashboard.tsx`, `CustomerMenu.tsx`,
`CustomerHistory.tsx`, `CustomerRewards.tsx`, `CustomerSettings.tsx`,
`BottomNav.tsx` (the per-outlet nav, distinct from the global Explore nav),
`PointsBalanceCard.tsx`, `EventCard.tsx`, `RewardCard.tsx` — these are Phase
2. Backend is untouched entirely; this is frontend-only.

## Verification plan

- Visual check at real mobile viewport widths (375px, 390px, 428px) in the
  browser preview, both light and dark
- Contrast check on the new dark tokens (label/muted/soft against
  `#000000`/`#1C1C1E`/`#2C2C2E`) — WCAG AA minimum (4.5:1 body text)
- `prefers-reduced-motion` verified by forcing the media query and confirming
  drag physics degrade to cross-fades
- Manual drag-and-flick test on the My Places stack: interrupt mid-animation,
  confirm no jump; flick and confirm momentum-based landing, not
  nearest-on-release
- Existing test suite run to confirm no regressions in data-fetching hooks
  (`useMyTenants`, `useDiscover`) that these screens depend on — this is a
  visual/interaction redesign, not a data-layer change

# Fluid Interface Motion Standards — Design

**Date:** 2026-08-09
**Status:** Draft, ready for planning
**Scope:** Remediate the gaps found by the `apple-design` skill audit (2026-08-09) against the frontend's existing motion system (`lib/motion.ts`, `lib/toast.tsx`, Radix `components/ui/`, `index.css`)
**Not scope:** New gesture surfaces, dark mode, haptics/sound (no Vibration API usage exists or is proposed)

## Why

An audit against Apple's *Designing Fluid Interfaces* principles (skill: `apple-design`) found the app's motion system is real and mostly well-built — `lib/motion.ts`'s `useMotion()` hook is the correct shape, reduced-motion is respected almost everywhere, celebratory components use genuine springs. But five gaps are load-bearing enough to fix deliberately rather than let compound as more screens get built on top of them. Two are outright breakage (dead CSS classes, a reduced-motion bypass); three are inconsistencies with the house physics vocabulary the codebase already committed to.

This is a remediation spec, not a new feature — every workstream below edits an existing component in place. No new dependencies except where noted.

## Priority order

| P | Workstream | Why first/last |
|---|---|---|
| P0 | A. Radix dialog/sheet/alert-dialog have zero motion | Every confirm dialog and the admin mobile-nav sheet currently pops instantly — the most visible gap, and the riskiest one to leave (looks like a bug, not a style choice) |
| P0 | B. Toast bypasses reduced motion | Accessibility regression already shipped — `lib/toast.tsx` is the one motion call site that doesn't route through `useMotion()` |
| P1 | C. Spring vocabulary — bounce is applied to non-gesture entrances | House physics currently says the opposite of what it means to say; fixing this changes the *feel* of balance cards, numbers, toasts app-wide |
| P2 | D. Materials/depth — headers, bottom nav, dialog overlay | Visual polish, no functional risk |
| P2 | E. Typography — fixed tracking on numerals at all sizes | Visual polish, isolated to one CSS rule |
| P3 | F. `ServicesCarousel` velocity/momentum/rubber-band | Single surface (platform landing marketing page), deliberately no-snap already — lowest traffic, lowest risk, do last or skip |

## A. Radix surfaces have no animation

### The problem

`components/ui/dialog.tsx:24,41`, `sheet.tsx:24,34-44`, and `alert-dialog.tsx:19,37` all build their open/close motion from Tailwind's `animate-in`/`animate-out`/`fade-in-0`/`zoom-in-95`/`slide-in-from-*` utility classes. Those utilities are shipped by the `tailwindcss-animate` plugin. It is not in `frontend/package.json`, not in `node_modules`, and the Tailwind v4 CSS-first config (`index.css`, no `tailwind.config.*`) registers no `@plugin` or matching `@keyframes` for them. The classes compile to nothing. Every `DialogContent`, `SheetContent`, and `AlertDialogContent` currently mounts and unmounts with a hard cut — no fade, no scale, no slide.

Consumers affected: the confirm dialog in `RedeemLanding.tsx`, the mobile nav `Sheet` in `AdminLayout.tsx`, every `ConfirmDialog`/`AlertDialog` usage across admin, company, and platform consoles.

### The fix

Radix's own `data-state="open"|"closed"` attribute is fine as a state signal — the problem is only the CSS driving it. Replace the Tailwind-utility animation with `motion/react`, matching how `CardStack.tsx` and the celebration components already animate:

- Wrap `DialogContent`/`SheetContent`/`AlertDialogContent`'s inner element in `motion.div`, driven by Radix's `forceMount` + `AnimatePresence` pattern (the standard Radix+Framer Motion integration — `Root open` state lifted to control `AnimatePresence`, content given `forceMount`).
- Overlay: fade `opacity` 0→1 via `useMotion().ease("ui")`.
- Dialog content: fade + scale from `0.96→1` (mirrors the dead `zoom-in-95`), using a **critically damped** spring (new `SPRINGS.sheetEnter`, see workstream C) — not the underdamped celebratory springs, this is a UI chrome entrance, not a physical moment.
- Sheet content: slide in from its `side` prop (`top`/`bottom`/`left`/`right`) using the same critically-damped spring, translating along the one axis implied by `side`. This is spatial consistency (skill §7): a right sheet must exit back to the right, which `AnimatePresence`'s `exit` variant gets for free if `initial`/`exit` are symmetric.
- Every one of these routes through `useMotion()` so reduced motion collapses to `INSTANT` automatically — no separate reduced-motion branch to maintain per component.

Radix's Portal/Overlay/Content structure and all existing props (`className`, `side`, `forwardRef`) stay unchanged — this is an internal implementation swap, not an API change. No call site (`RedeemLanding.tsx`, `AdminLayout.tsx`, etc.) needs to change.

## B. Toast bypasses reduced motion

### The problem

`lib/toast.tsx:18` imports `SPRINGS` directly (`import { SPRINGS } from "./motion"`) and `lib/toast.tsx:158` uses `transition={SPRINGS.cardEnter}` on the toast's `motion.div`. `Toaster()` never calls `useMotion()`/`useReducedMotion()`, so every toast animates its full spring regardless of the user's OS-level reduced-motion setting — the one motion call site in the app that doesn't honor it.

### The fix

`Toaster` is already a component (`export function Toaster()`), so call `const m = useMotion()` at its top and use `transition={m.spring("cardEnter")}` (or the renamed spring from workstream C) in place of the raw `SPRINGS.cardEnter` reference at line 158. Same one-line shape as every other consumer of `useMotion()`.

## C. Spring vocabulary — bounce belongs to gestures, not mounts

### The problem

`lib/motion.ts:19-25`, all four named springs are underdamped:

| Spring | stiffness/damping | Damping ratio | Used for |
|---|---|---|---|
| `coinPop` | 280/14 | ≈0.42 | Earn celebration — coin lands (genuinely physical, gesture-adjacent) |
| `voucherFlip` | 220/18 | ≈0.61 | Redeem celebration — voucher flip (genuinely physical) |
| `cardEnter` | 220/20 | ≈0.67 | Balance card mount, toast mount — **not gesture-driven** |
| `numberChange` | 300/18 | ≈0.52 | A number ticking to a new value — **not gesture-driven** |

Apple's rule (skill §4): start most UI at damping `1.0` (critically damped, no overshoot); reserve bounce for interactions where the gesture itself carried momentum (a flick, a throw, a drag release). `coinPop` and `voucherFlip` are defensible exceptions — they're the app's two named "physical" celebration moments (`PointsCelebration.tsx`'s two variants), not incidental UI chrome, and the product's own design language (`CLAUDE.md`: "stamp-claim physics") explicitly wants them to read as tactile events. `cardEnter` and `numberChange` are not: a balance card mounting on page load and a KPI ticking up are declarative UI state changes with no preceding gesture, so their overshoot currently reads as noise rather than physicality.

### The fix

Add a critically-damped default and repoint the two non-gesture springs at it:

```ts
export const SPRINGS = {
  /** Default UI entrance — dialogs, sheets, cards, numbers. No overshoot. */
  settle: { type: "spring", stiffness: 260, damping: 26 }, // ratio 1.0, response ~0.4s
  /** Earn: the coin lands. Overshoots to 1.16 before settling. */
  coinPop: { type: "spring", stiffness: 280, damping: 14 },
  /** Redeem: the exchange. Voucher flips rotateY 90 -> 0. */
  voucherFlip: { type: "spring", stiffness: 220, damping: 18 },
} satisfies Record<string, Transition>;
```

- `cardEnter` and `numberChange` are retired in favor of `settle`; every call site that used them (`PointsBalanceCard.tsx`, count-up numbers, `lib/toast.tsx`, the new dialog/sheet entrances from workstream A) switches to `m.spring("settle")`.
- `coinPop`/`voucherFlip` are untouched — they're the one place bounce is earned.
- Grep for `SPRINGS.cardEnter` and `SPRINGS.numberChange` (and `spring("cardEnter")`/`spring("numberChange")`) to find every call site before renaming; this is a rename with a behavior change, not just a string replace, so each site should be re-checked for whether it's actually gesture-adjacent (none currently are, per the audit) before flipping it to `settle`.

## D. Materials & depth

Three isolated fixes, no shared mechanism:

- **`BottomNav.tsx`** — currently fully opaque. Add `backdrop-blur` + semi-transparent background matching the pattern already used in `LandingNav.tsx`/`LandingFooter.tsx` (`backdrop-blur-[25px]`) and `SuspendedOverlay.tsx` (`backdrop-blur-sm`), so content scrolling underneath shows through per skill §12.
- **`CustomerLayout.tsx` / `GlobalCustomerLayout.tsx` headers** — currently pair `backdrop-blur` with a hard `border-b`. Replace the 1px border with a scroll-edge fade (small gradient mask that only appears once content has scrolled under the header), per skill §12's "scroll edge effects, not hard dividers."
- **Dialog/AlertDialog overlay** (`bg-black/80` in `dialog.tsx:24`, `alert-dialog.tsx:19`) — dim-only, no blur. Add `backdrop-blur-sm` so the scrim reads as a material dimming the background rather than a flat black layer. Keep the same opacity — this is additive, not a redesign of the scrim.

## E. Typography — size-specific tracking

### The problem

`index.css:212-216` `.font-numeral` applies one fixed `letter-spacing: -0.01em` at every size it's used — from 64px (`EarnCelebration.tsx`) down to 36px and smaller elsewhere. Skill §15: large display numerals want more negative tracking as they grow; a single fixed value is wrong at one end of the range.

### The fix

Split `.font-numeral` into a base rule (family, `tabular-nums`, no tracking) plus size-keyed tracking, following the existing small-label pattern already correct elsewhere in the app (`tracking-[0.14em]`–`[0.18em]` on uppercase labels, e.g. `RedeemLanding.tsx:171`):

```css
.font-numeral {
  font-family: var(--font-numeral);
  font-variant-numeric: tabular-nums;
}
.font-numeral-lg {  /* 48px+ — hero balances, celebration numerals */
  letter-spacing: -0.02em;
}
.font-numeral-sm {  /* body-scale KPIs, list figures */
  letter-spacing: -0.005em;
}
```

Call sites pick the modifier matching their rendered size; anything that doesn't specify one keeps today's `-0.01em` behavior via a base fallback, so this is additive and non-breaking until each site is migrated.

## F. `ServicesCarousel` — velocity, momentum, rubber-band (P3, optional)

### Current state

`routes/platform/landing/ServicesCarousel.tsx:65-84` — real Pointer Events with `setPointerCapture` (line 72) and grab-offset respected (line 77). Deliberately no scroll-snap (`ServicesCarousel.tsx:97-99` comment: snap points would fight the art's parallax offset). Mouse-drag only; touch already gets native momentum scrolling and isn't touched by this code (line 63-64 comment).

This is the single lowest-risk surface in the audit — one marketing page, mouse-only interaction, already has a deliberate design rationale for what it doesn't do. Two optional improvements if this workstream is picked up:

- **Velocity handoff on release** — track the last 2-3 `pointermove` timestamps/positions in `drag.current`, compute px/s at `endDrag`, and hand the strip a brief native momentum continuation (`scrollLeft` decremented by an exponentially-decaying velocity per frame — skill §6's projection formula) instead of stopping dead at release.
- **Rubber-band at the strip's scroll bounds** — currently native `overflow-x-auto` clamps `scrollLeft` hard at 0 and max; a custom drag can overshoot past either bound with skill §9's rubber-band function before snapping back, matching the give real scroll surfaces have.

Neither changes the "no scroll-snap" decision — both are about how release feels, not where it lands.

## Testing

- **Visual/manual** (no automated motion assertions exist in this codebase and none are proposed): open every `Dialog`/`Sheet`/`AlertDialog` consumer (`RedeemLanding.tsx` confirm, `AdminLayout.tsx` mobile nav, every `ConfirmDialog` usage) and confirm enter/exit motion is present and symmetric (slides back out the side it came from).
- Toggle OS-level `prefers-reduced-motion` and confirm: dialogs/sheets crossfade instead of sliding, toasts stop animating (workstream B), `.stamp-interactive` and button press states already correctly no-op (unchanged, verify no regression).
- `frontend/scripts/verify-tenant-color.ts` — unaffected by this spec (no `lib/color.ts` changes) but re-run as a smoke check since dialog/sheet overlays touch shared chrome.
- `npm run lint` (`tsc --noEmit`) clean after the `SPRINGS` rename in workstream C — every `SPRINGS.cardEnter`/`SPRINGS.numberChange` reference must be caught by the type system once those keys are removed.
- No backend changes in this spec — backend test chain unaffected.

## Out of scope

Dark mode (tokens exist under `.dark`, no toggle ships — unrelated to this spec). Haptics/sound (no Vibration API usage exists; skill §12 rules are noted as not applicable). New gesture surfaces beyond the carousel touch-up in workstream F. `prefers-reduced-transparency` and `prefers-contrast` media queries — flagged by the audit as unimplemented anywhere in the app, but adding them is a larger, separate accessibility pass, not a motion-system fix; worth its own spec.

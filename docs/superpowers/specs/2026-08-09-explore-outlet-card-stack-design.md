# Explore "My businesses" swipeable card stack

## Problem

`Explore.tsx`'s "My businesses" section is a horizontal-scroll row of static outlet cards ([Explore.tsx:96-125](../../../frontend/src/routes/Explore.tsx#L96-L125)). We're replacing it with a PayPal-wallet-style vertical swipe card stack: one outlet's balance card up front, the next couple peeking behind, swipe or tap to change which outlet is shown. The whole zone (nav header + cards) should read as one blended surface that collapses away as the page scrolls, the way an iOS large-title header collapses into its compact form.

Reference: PayPal wallet screen (header and balance card share one background, no seam) vs. the current Stampd `/explore` screen (separate header bar + card row below it).

## Scope

- Touches only the `/explore` (Discover) route and its shared shell, `GlobalCustomerLayout.tsx`.
- No backend changes — `useMyTenants()` already returns everything needed: `balance`, `name`, `branding.{logoUrl,primaryColor}`.
- Does not touch Events / My businesses (`/explore/mine`) / Profile tabs, or the tenant-scoped (`CustomerLayout`) shell. Those keep today's neutral header, unconditionally.

## Deliberate rule override

CLAUDE.md documents the `/explore` header as fixed platform-green identity, never tenant-themed. This spec overrides that **for this one component only**, per explicit product decision: while `/explore` shows the card stack, the header tints toward the active card's outlet colour. Every other screen — including `/explore/mine`, `/explore/events`, `/explore/profile` — is unaffected; the header reverts to its normal neutral styling the instant the stack unmounts or the route changes.

## Architecture

**New: `ExploreHeroContext`** (`frontend/src/context/ExploreHeroContext.tsx`)
Provided once, in `GlobalCustomerLayout.tsx`, wrapping `<Outlet>`.

```ts
interface ExploreHeroContextValue {
  heroColor: string | null;       // active card's branding.primaryColor, or null
  setHeroColor: (c: string | null) => void;
  progress: MotionValue<number>;  // 0 = fully expanded/tinted, 1 = fully collapsed/neutral
}
```

- `heroColor` is plain React state — it only changes on a discrete swipe/tap (index change), so a re-render is fine and cheap (header is the only consumer).
- `progress` is a single `useMotionValue(0)` instance created once in the provider and read via `useTransform`/`style` in the header — continuous scroll updates never trigger a React re-render.
- On unmount, `OutletCardStack` resets `heroColor` to `null` and `progress` to `0` (effect cleanup), so leaving `/explore` (or having zero memberships) immediately restores the neutral header.

**New: `OutletCardStack.tsx`** (`frontend/src/components/customer/`)
Renders in `Explore.tsx` where the old "My businesses" block was. Reads `useMyTenants()` directly (same data source as before). Renders nothing if `myTenants.length === 0`, matching current behavior.

**Modified: `GlobalCustomerLayout.tsx`**
Header (`<header>` at line 144) gains a conditional dual-background: when `heroColor` is set, two absolutely-positioned layers crossfade via `progress`; when `null` (every route except `/explore`, or zero memberships), it renders exactly as it does today — no motion values, no extra DOM, zero cost on other pages.

**Modified: `Explore.tsx`**
Old lines 96-125 replaced with `<OutletCardStack />`.

## Card stack behavior

- Cards render front-to-back by `depth = index - activeIndex` for `depth` in `0..2` (front + 2 peeking layers); anything deeper isn't rendered at all.
- Peeking cards: `translateY(-14px * depth)`, `scale(1 - 0.06 * depth)`, reduced opacity, lower z-index, **not tinted individually** — cards stay `bg-[var(--surface)]` white with each outlet's own logo/colour on the logo tile only, so the outer hero tint (which does carry outlet colour) never doubles up with the card face.
- Front card content: outlet logo image (`resolveImageUrl`, same fallback-to-initial-tile pattern as `BusinessCard`), outlet name, `formatPoints(balance)` as the numeral. No send/receive/add controls.
- Customer's own avatar (`CustomerAvatar`, already imported in the layout) is pinned at a fixed screen position — top-center, half-overlapping the top edge of the **front slot**. It does not move or re-render on swipe: because the front slot is a fixed position and only its *contents* change, whichever card is currently front automatically appears to "have" the badge. Peeking cards behind never show it.
- Single-membership case: stack degrades to one static card, no drag, avatar still shown.

## Gesture

- Front card only: `drag="y"`, `dragElastic` (rubber-band feel), `dragConstraints={{ top: 0, bottom: 0 }}`.
- `onDragEnd`: if drag distance/velocity crosses a threshold (~60px or a velocity equivalent), advance/retreat `activeIndex`; otherwise snap back.
- **Clamped at both ends** — swiping past the first or last card rubber-bands and bounces back, no wraparound. Matches the iOS scroll-limit feel already established elsewhere in the app.
- Tapping a visible peeking card also sets it active (same transition as a completed swipe).
- All transitions use the existing `SPRINGS.settle` via `useMotion()` — no new spring is introduced. Reduced-motion users get instant index changes, no bounce.

## Header blend

Only active when `heroColor !== null` (i.e., only on `/explore` with ≥1 membership):

- **Tinted layer**: `background: linear-gradient(180deg, color-mix(in srgb, ${heroColor} 55%, white), color-mix(in srgb, ${heroColor} 30%, white))`, `opacity: 1 - progress`.
- **Neutral layer**: today's `bg-[var(--surface)]/95 backdrop-blur` exactly as-is, `opacity: progress`.
- Header's own bottom shadow is suppressed while `heroColor` is set (no seam between header and the card zone below it). The hero zone (`OutletCardStack`'s outer wrapper) carries a shadow instead, whose opacity rises with `progress` — so a shadow only appears once the zone has mostly collapsed and needs to visually separate from the Discover grid beneath it.

`color-mix()` is used directly in inline styles — no new helper needed in `lib/color.ts`; darkening/lightening toward white via `color-mix` covers both light-mode blend directions this spec needs. (No dark-mode toggle ships today per CLAUDE.md, so only the light-mode direction — toward white — is implemented; the ask to branch on dark mode is a no-op until a toggle exists.)

## Scroll collapse

- `OutletCardStack`'s outer wrapper gets a ref; `useScroll({ target: ref, offset: ["start start", "end start"] })` drives a local `scrollYProgress`.
- `useMotionValueEvent(scrollYProgress, "change", v => progress.set(v))` pushes the same value into the shared context `MotionValue` — one-directional, no React re-render on either side.
- Wrapper height interpolates from `min(50vh, 380px) - headerHeight` down to `0` over the scroll range; card layer + avatar fade `opacity 1 → 0` and translate up slightly (e.g. `y: 0 → -24`) over the same range, so cards visually dissolve into the header rather than just sliding off.
- Because the header's own crossfade is driven by the identical `progress` value, the two animate in lockstep — reads as one surface collapsing, not two independently-animated pieces.

## Sizing

- Same component at every breakpoint (no separate desktop code path). Height capped at `min(50vh, 380px)` so desktop/tablet doesn't get an oversized hero. Content centers with a `max-w-md`-ish cap on wide screens so the card doesn't stretch edge-to-edge on a monitor.

## Not in scope

- No changes to `/explore/mine`, `/explore/events`, `/explore/profile`, or the tenant-scoped `CustomerLayout` header.
- No new spring/easing added to `lib/motion.ts` — reuses `SPRINGS.settle`.
- No backend/API changes.
- No dot/position indicator (explicitly declined).

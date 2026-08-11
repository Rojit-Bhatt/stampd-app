# Earn/Redeem Celebration Animation Redesign

Date: 2026-08-11

## Problem

Current earn/redeem celebration animations (`frontend/src/components/customer/EarnCelebration.tsx`, `frontend/src/components/customer/RedeemCelebration.tsx`) are opaque full-screen takeovers with a "Go to dashboard" / "Back to my points" button. This is being replaced with a new, transparent/blurred overlay design that shows no manual dismiss button and reveals the real outlet dashboard underneath.

## Goals

- Completely new animation designs for both earn and redeem — not a rearrangement of the existing ones.
- Semi-transparent overlay with the real, live, per-outlet `CustomerDashboard` blurred behind it (not `/explore`, not a static screenshot).
- No "go to dashboard" button anywhere in the new components.
- Auto-vanishes after a few seconds, revealing the already-mounted dashboard.
- Consistent behavior across all three trigger sites.

## Architecture

**Overlay pattern replaces full-takeover pattern.**

Today: parent route conditionally renders `<EarnCelebration>`/`<RedeemCelebration>` *instead of* its normal JSX (`if (stage === "success") return <EarnCelebration .../>`), and the celebration itself contains a button that calls `navigate()`.

New: on claim/redeem success, the parent **navigates immediately** to the outlet dashboard route (`tenantPath(companySlug, slug, "dashboard")`), so the real `CustomerDashboard` mounts and fetches the fresh point balance right away. The celebration renders as a `fixed inset-0` overlay (portal) on top of it — `backdrop-filter: blur(...)` + dim scrim, dashboard visible but non-interactive underneath. The overlay unmounts itself via an internal timer; no `onDone`/`doneLabel` props, no button.

Trigger sites, all updated to this pattern:
- `frontend/src/routes/ClaimLanding.tsx` (QR claim-link flow)
- `frontend/src/components/customer/ScannerModal.tsx` (in-app scanner — currently closes a modal in place instead of navigating; will switch to navigate-then-overlay so behavior matches the other two sites)
- `frontend/src/routes/RedeemLanding.tsx` (reward redemption)

## Visual design

**Earn — coin/particle burst.** Point icon(s) burst outward from center and settle, number counts up. Built fresh (new motion choreography), not reusing current `EarnCelebration` spring/timing values.

**Redeem — voucher/ticket reveal.** A ticket-style card (notch cutouts, dashed divider, brand line, reward code/name) materializes and settles, feels like unlocking a reward. Approved direction from mockup review; further polish (shine sweep, confetti flecks, coin-flip accents, etc.) is left to implementation-time judgment rather than pinned to one exact mockup variant.

Both:
- Built with `motion/react` (Framer Motion), consistent with the rest of the codebase (`frontend/src/lib/motion.ts` springs/`useMotion()` hook) — reuse the reduced-motion gating pattern, not the existing celebration content.
- Auto-dismiss only, no tap-to-skip, no manual button.
- Timing: Earn ~2.5s total. Redeem ~3.5s (slightly longer to read the reward name/code before it disappears).
- Reduced-motion: shortened/simplified timing via existing `useMotion()` gate, same convention as today.

## Non-goals / explicitly deferred

- Redemption status tracking (redeemed / pending / canceled) visible in the customer's account and synced to the outlet admin app is a separate, larger feature. Not part of this change.
- No persistent receipt/voucher screen — the reward record is expected to live in that future status-history feature, not in the animation itself.

## Process note

Motion/animation design work should use Opus 5; implementation (wiring into components/routes) should use Sonnet.

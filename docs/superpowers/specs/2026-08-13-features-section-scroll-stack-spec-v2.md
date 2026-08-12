# Features section — scroll-pinned alternating card pile (v2, corrected after user review)

## Problem (updated)

The v1 implementation (`FeaturePile.tsx`, PR #21) was rejected by the user for two reasons: the cards render **too big** (nearly full-viewport in the user's browser) and the motion **pops instead of sliding** — the entrance reads as an instant snap, not the fluid eased slide-in of the reference video. The v1 approach also incorrectly attached the caption *below* the card as a separate block, unlike the reference where art and copy live **inside one card**. This v2 supersedes the v1 spec after a frame-by-frame re-analysis of the reference video.

**Root causes identified:**

1. **Size**: v1's `<article>` used `absolute inset-0` inside a sticky stage of `h-screen`, and the inner card used `w-full` — so the card filled the entire viewport. The reference cards are much smaller.
2. **Motion**: v1 had no easing on the translate; with a track of only `(N+1)*100vh`, each card's entrance window was `~1.43vh` of real scroll (1100px ÷ 7), so any normal scroll velocity covered the whole slide in milliseconds — a pop.
3. **Composition**: v1 placed caption outside the card; the reference keeps art + copy inside one rounded panel, so piling naturally covers the previous card's content and only edges peek out.

## Reference video — frame-by-frame analysis (v2 basis)

Source: `ScreenRecording2026-08-12at11.57.48PM.mov` (3420×1910, 60 fps, 9.5 s). Site: Bombon testimonials section ("BOMBON FANS CAN'T STOP TALKING!").

| Property | Measured value | How measured |
| --- | --- | --- |
| Card size (settled) | ≈ **38–45% vw** wide, ≈ **33–44% vh** tall | Pixel measurement of the Sarah D. card in frame f060 (width ≈ 1285–1590px of 3420 vw; height ≈ 650–840px of 1910 vh) |
| Card composition | ONE white rounded panel containing photo LEFT and stars/quote/name RIGHT | Frames f060, stacked-15 |
| Entrance | From its side, sliding toward the settled stack position; width in frame grows 0.11 → 0.26 → 0.38 over ~2 frames (decelerating — ease-out) | Card-width curve per 10fps frame (001–095) |
| Entrance duration | ≈ 0.3–0.4 s worth of scroll per card at the recorder's scroll speed | Frames f41–f43 (card 1), f53–f55 (card 2), f72+ (card 3) |
| Post-pile settle | Brief fan/spread overshoot (visible width jumps to 0.74 then settles back to 0.38 over ~9 frames) | Frames f62–f70 |
| Opacity | Cards stay **fully opaque** throughout; no fades | All frames |
| Rotation | Small, alternating signs (±1–3°), easing as it settles | Visual, frames f060 |
| Stack offset | Each settled card offset slightly from the previous (x/y) with alternating rotation — a fanned deck, edges of all cards visible | Frame f060, stacked-15 |
| Scroll link | 1:1 scrubbed with the scrollbar; backwards scrub reverses in reverse order | Whole video |

## Architecture (unchanged skeleton, corrected constants)

Keep the v1 skeleton — tall track + native CSS sticky stage + absolutely stacked cards, because it is exactly what makes the mechanism match the video (scroll-linked, reversible, no hijack). Correct the constants and composition:

1. **Track**: `height = (1 + CARD_COUNT) * 250vh` → 1750vh for 6 cards. Each card's entrance window is now ≈ 3.6 viewport-heights of real scroll — slow enough to *see* the slide at normal scroll speed, while easing makes it feel like the video's 0.3–0.4s entrance.
2. **Card**: self-contained rounded panel sized **`w-[min(56vw,820px)] h-[min(44vh,480px)]`** (≈ 56–60% vw wide on the user's 1440px-class screen — noticeably smaller than v1, larger than the original 380px), centred inside the stage. Art occupies the top ~62% of the panel; kicker/title/body sit inside the panel's bottom ~38% with padding — one unit, like the reference.
3. **Slide motion**: `x` goes from `±110vw` to the card's settled horizontal offset, driven by an **ease-out curve** `e(p) = 1 - (1-p)^3` applied to the raw side progress. Rotation eases from `±8°` to the settled `±1.4°`. A faint scale 0.97 → 1 completes the settle.
4. **Deck offsets**: settled card `i` sits at horizontal offset `(-1)^i * 8%` and rotation `(-1)^i * 1.4°`, so after piling all six the result is a fanned deck with all cards' edges visible — matching the video's settled state.
5. **Opacity**: cards fully opaque, no caption fade-out — the incoming card covers the previous card's copy, and only edges peek out.
6. **Reduced motion**: static column of all six self-contained cards, unchanged from v1.

## Acceptance (v2)

| Check | Pass condition |
| --- | --- |
| Card size | Card ≈ 44–56vw wide and 33–44vh tall on desktop; never larger than ~900×500px |
| Composition | Art AND kicker/title/body inside ONE rounded panel (like the reference) |
| Entrance | Card 1 from LEFT, card 2 from RIGHT (piling on card 1), alternating — visibly sliding, ease-out, ~3.6vh of scroll per entrance at default easing |
| Fluidity | No pop: at any fractional scroll position the card is mid-slide with correct eased position; reverse scrub reverses smoothly |
| Deck | After piling, cards form a fanned deck: edges of all piled cards visible, alternating ±1.4° rotation |
| Opacity | Cards fully opaque throughout |
| Reduced motion | Static column, all six visible |
| No regression | Lint, typecheck, production build pass; anchors work; `ServicesCarousel` stays deleted |

## Out of scope (unchanged)

No autoplay, no changes outside the features section, no deploy or backend changes.

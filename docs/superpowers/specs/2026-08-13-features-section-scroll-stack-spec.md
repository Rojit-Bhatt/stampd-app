# Features section — full-screen alternating scroll-in card stack

## Problem

The "What you get" section (`ServicesCarousel.tsx`) is a horizontal drag-strip: six 300/380px-wide cards in a free-scroll row with momentum drag, edge fades and a 24px parallax offset on the art. Per the reference image, those cards should instead be **noticeably bigger — one card per screen** — and per the reference video, they should reveal on scroll: each card **slides in from the side, alternating left/right** (card 1 from the left, card 2 from the right piling on top of card 1, card 3 from the left, and so on), with each new card stacking **on top of** the previous one so the previous card's edge stays visible beneath.

The user's wording and video agree on the essentials: one large card per viewport at a time, side entrances that alternate, and a pile-up (z-stacked) composition. Where they differ slightly is the *direction*: the video enters from the bottom-right with rotation, while the user asked for left/right alternation in plain horizontal slides. **The user's explicit instruction takes precedence**: horizontal alternation, left/right/left…, with right-sliding cards piling onto the previous card. Rotation is kept minimal (a faint tilt at most, matching the "pile" feel) since the user did not ask for it and the app's design language is quiet.

## Scope

- Touches only the landing page's features section: `SectionsFeatures.tsx`, `ServicesCarousel.tsx` (replaced), and a new motion component. `data.ts` and `graphics/FeatureArt.tsx` are unchanged — same six blocks and art, re-rendered at a larger size.
- The horizontal drag-strip, momentum code, edge fades and art parallax are removed — they belong to the old interaction model and nothing downstream consumes them.
- No backend changes. No new dependencies — `motion` v12.42.2 (already installed) provides `useScroll`, `useTransform`, `useReducedMotion` and `scrollTransforms` exactly like the existing `HeroStack.tsx` precedent.
- No copy changes: kicker, title and body travel with each card below its art, exactly as today.

## Reference behavior (video)

The reference (Bombon testimonials section) builds the pile on scroll progress: cards advance with the scrubber, each new card layers above the previous with a slight offset, previous cards stay partially visible at the edges, and scrolling backwards reverses the animation. Fully scroll-linked — no autoplay, no fixed delays. We replicate that *mechanism* (scroll-linked stacking) with the user's *direction* (alternating horizontal sides).

## Architecture

**New: `FeaturePile.tsx`** (`frontend/src/routes/platform/landing/FeaturePile.tsx`) — replaces `<ServicesCarousel />`. Follows the exact pattern already established on this page by `HeroStack.tsx`:

1. A tall **track** (`height = (1 + BLOCKS.length) * 100vh`, i.e. 7 screens for 6 cards) carries the scroll distance.
2. A **sticky stage** (`sticky top-0 h-screen`) covers the viewport while the track scrolls — native CSS sticky, no JS scroll hijack, so the native scrollbar and scroll speed are untouched (page background is opaque, so nothing shows behind the stage).
3. Inside the stage, every card is rendered **stacked absolutely** in the same slot (full-viewport size). Scroll progress `0 → 1` across the track is mapped per-card into a continuous **side position**: card `i` enters from its side (left when `i` is even, right when `i` is odd), travels to the center, and stays — the next card then enters from the opposite side **on top of it** (higher z-index), so each advance is a pile-up, not a replacement. Cards past their own entrance remain fully in place; the final card fills the screen at progress 1.
4. Every visual property (translate, z-index, and a subtle rotation that makes the pile feel physical) derives from that one scroll-mapped number per card, so there are no discrete animation states and scrubbing backwards reverses cleanly.

**Card sizing** ("a bit bigger — one card in a screen"): the art frame grows from 380px-wide to roughly `min(880px, 72vw)` wide with an art block of ~`min(440px, 36vw)` height (from 220px), centred in the viewport with the kicker/title/body centred beneath it. That is the "bigger" the reference image implies while still leaving headroom for the copy — if the user wants the art to fill nearly the entire screen, that becomes a follow-up tweak (the sizing constants live in one place).

**Overflow guardrail**: the stage carries `overflow-clip`, and all slide-ins happen *within* the stage width via clamp — cards start just outside the stage edge (`translateX(±110vw)`), never outside the page, respecting `html { overflow-x: clip }`.

**Reduced motion**: `useReducedMotion` returns a static, fully-visible column of all six cards (same treatment as `HeroStack`'s reduced-motion path) — the pile animation is disabled, nothing is hidden.

## Copy placement

Each card keeps its kicker (mono, green, letterspaced), title (display) and body (muted) below the art, centred under the card, in a band that stays visible with the card. During a pile-up, only the *incoming* card's copy transitions with it; the previous card's copy remains visible alongside its art, matching how the reference video keeps caption text attached to each card layer.

## Edge cases

- **Narrow viewports** (<640px): same behavior, card width is `88vw` so the pile-up edges peek from both sides by design.
- **Window resize mid-scroll**: `useScroll` tracks the live track geometry, so progress stays correct.
- **Backwards scrubbing**: fully reversible by construction (pure transforms of a continuous progress value).
- **Anchor nav** (`#services`): lands at the section start, first card centered — unchanged semantics.

## Acceptance

| Check | Pass condition |
| --- | --- |
| Card size | Each card fills ~1 screen; art ≥ 2× the old 380×220 card |
| Entrance direction | Card 1 (Points Engine) slides in from the LEFT; card 2 (Campaigns) from the RIGHT and piles on card 1; alternation continues for all six |
| Pile-up | Previous card's edges remain visible under each new card; new card always on top |
| Scroll link | Animation tracks the scrollbar 1:1; reverse scrubbing reverses the animation |
| Reduced motion | All six cards render statically, none hidden |
| No regression | Landing builds (`npm run build -w frontend`), typechecks (`npm run lint -w frontend`), nav anchor works, production deploy unchanged |

## Out of scope

- No autoplay or timer-based slideshow.
- No rotation of copy blocks, no scale-shrink of previous cards (kept for a follow-up if the user wants more drama).
- No changes to hero, marquee, pricing, FAQ, CTA, or footer.
- No backend or deploy changes — Render/Cloudflare pipelines are untouched.

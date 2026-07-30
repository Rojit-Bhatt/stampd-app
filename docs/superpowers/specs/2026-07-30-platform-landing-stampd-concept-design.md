# Platform Landing Redesign — Stampd "Stack Advance" Concept

**Date:** 2026-07-30
**Route:** `/` (`frontend/src/routes/platform/PlatformLanding.tsx`)
**Source material:** `Stampd Landing Concepts.html` (frame **2b**), navbar + footer from `samparka.co`, hero background from kokonutui `mouse-effect-card`, three motion techniques from motion.dev examples (§7.4).

---

## 1. Goal

Replace the marketing landing page with concept frame **2b — "Stack advance"**: a pinned hero whose four product cards advance as a stack (front card lifts away, the next rises forward), followed by features, pricing, FAQ, CTA and footer.

The concept was designed as a static mockup with invented data and several marketing claims the product does not support. This spec ports the *design* and corrects the *content* — the landing page must not promise anything Stampd does not do.

Non-goals: no changes to the loyalty model, auth, tenancy, or any console. Three additive public read endpoints are the only backend surface touched, plus one `RESERVED_SLUGS` entry.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Concept frame | **2b — Stack advance** (the only frame with the full page built out) |
| Brand | **Stampd** (matches `PLATFORM_NAME`) |
| Type pairing | **Space Grotesk / Inter** — already in `styles/fonts.css`, no new font weight |
| Existing Samparka landing | **Replaced wholesale**, after being committed to a branch so it is recoverable |
| Primary CTA | **"Talk to us"** — there is no self-serve signup |
| Hero stats | **Wired to real platform analytics**, floored, hidden below threshold |
| Pricing | **Wired to real `SubscriptionPlan`s** |
| Green treatment | **Flat accent only** — all radial glows deleted |
| Navbar | **samparka.co chrome, concept link set**, dark-adapted |
| Footer | **samparka.co footer**, inverted to cream; Recognition grid and "Let's get started" card dropped |
| WhatsApp float | **Kept, redesigned** — cream pill, not the stock green badge |
| Hero background | **kokonut dot-repel field, reimplemented on canvas** |
| FAQ | **Horizontally scrollable cards** with Prev/Next |
| Nav CTA hover | **Rolling text** (motion.dev), CTA pill only |
| "What You Get" heading | **Scroll word reveal** (motion.dev), pass-through — no pin |
| Footer entrance | **Footer reveal** (motion.dev), rounded top retained |
| Animation library | **`motion` only** — no GSAP, no Anime.js |

---

## 3. Backend

Three additive endpoints. All are public reads on `/api/platform`, alongside the existing `GET /api/platform/public-contact` which this page also consumes.

### 3.1 `GET /api/platform/public-stats`

No auth. Powers the hero stat row.

```json
{ "visible": true, "outlets": 1200, "pointsIssuedMonth": 3100000, "customers": 8400 }
```

New `platformAnalyticsService.getPublicStats()`:

- `outlets` — `Organization.countDocuments()` equivalent over fetched docs
- `customers` — **distinct `CustomerAccount` count**, never summed `User` memberships (would double-count anyone at more than one outlet — same rule `getPlatformAnalytics` already follows for `customersTotal`)
- `pointsIssuedMonth` — sum of `pointsCenti` over `PointsTransaction` of type `earn` in the last 30 days, converted once via `toPoints()` on the way out

**Aggregate only.** No company id, outlet id, slug, name or customer identifier appears in the response. This lives in `platformAnalyticsService` because that file is already the one documented place where a missing `organizationId` filter is deliberate rather than a leak.

**Floored for display.** Values round down to a readable figure (2 significant figures) so a slow week never reads as decline.

**Threshold.** When `outlets < 5` the response is `{ "visible": false }` and the frontend renders no stat row at all. Pre-traction numbers are worse than no numbers.

**Mock-DB constraints.** Only `$gte` on `createdAt` (supported). Sums are JS `reduce` over fetched documents — there is no aggregation pipeline in the mock, and `getPlatformAnalytics` already computes its totals this way.

### 3.2 `GET /api/platform/public-plans`

No auth. Powers the pricing section.

```json
{ "plans": [{ "slug": "shop", "name": "Shop", "priceNpr": 1499, "features": ["..."], "isMostPopular": true }] }
```

Active plans only (`isActive: true`), ordered by `sortOrder`. Returns exactly those five fields — `outletLimit`, `billingIntervalDays` and internal ids stay server-side.

Pricing copy therefore can never drift from what a redeemed subscription key actually grants.

### 3.3 Reserved slugs

Add `"privacy"` and `"terms"` to `RESERVED_SLUGS` in `backend/config/platform.js`.

Without this a company registered with slug `privacy` becomes permanently unreachable: `App.tsx` matches the literal `/privacy` route before `/:companySlug`, so the tenant redirect never fires. This is exactly the class of collision `RESERVED_SLUGS` exists to prevent.

### 3.4 Rate limiting

None on these three. They are cheap cached reads with no auth surface and no write, matching the existing unlimited `public-contact`. `authLimiter`/`registrationLimiter` stay scoped to the abuse-prone endpoints they already cover.

---

## 4. Frontend structure

`routes/platform/landing/` is rebuilt. All six current files (`SectionsTop`, `SectionsMid`, `SectionsPricing`, `SectionsBottom`, `data.ts`, `primitives.tsx`) are replaced.

```
routes/platform/
  PlatformLanding.tsx        composition + <html class="landing-dark"> lifecycle
  landing/
    LandingNav.tsx           glass pill nav, hide-on-scroll
    DotField.tsx             canvas dot-repel background
    HeroStack.tsx            pinned hero + four-card stack advance
    SectionsFeatures.tsx     "Everything the counter needs"
    SectionPricing.tsx       plans from the API
    SectionFaq.tsx           horizontal card rail
    SectionCta.tsx           closing CTA
    LandingFooter.tsx        cream footer panel
    WhatsAppFloat.tsx        cream expanding pill
    primitives.tsx           Eyebrow, SectionHead, Pill, StatValue
    data.ts                  static copy only — no numbers, no prices
    motion/
      RollingLabel.tsx       rolling text (nav CTA)
      WordReveal.tsx         scroll word reveal (features statement)
      FooterReveal.tsx       sticky under-page footer uncover
  legal/
    Privacy.tsx              stub
    Terms.tsx                stub

hooks/
  usePublicStats.ts
  usePublicPlans.ts
  usePublicContact.ts
```

`data.ts` holds copy only. Every number on the page — stats, prices, contact details — comes from an API. This is the property that keeps the page honest as the product changes.

### Tokens

Landing tokens are defined **scoped under `.landing-dark`** in `index.css`, never at `:root`:

```
--lp-bg      #14201C
--lp-panel   #1D2F28
--lp-ink     #F3ECE2
--lp-muted   rgba(243,236,226,.62)
--lp-line    rgba(243,236,226,.12)
--lp-green   #0FA968
--lp-terra   #C15D2C
```

The consoles stay light and must not inherit any of these. `PlatformLanding` already adds/removes `landing-dark` on `<html>` in an effect — that pattern is kept, including the cleanup, so the class cannot leak on route change.

---

## 5. Colour

Background is **flat `#14201C`**. Every radial gradient glow in the concept is deleted — the `rgba(15,169,104,.2)` green washes, the `rgba(193,93,44,.16)` orange washes, and the green sweep-line rule. They are what made the mockup read as generated.

What survives:

- `#0FA968` as **solid fill only** — eyebrow labels, the live-campaign dot, point deltas, the primary button
- `#C15D2C` on the **logo mark only** (`StampdLogo` colours are fixed and not tenant-themed)
- A 1px cream grid at 0.03 alpha, on sections **below** the hero

This preserves the project's standing rule: `--primary` green means value and action, `--brand` means tenant identity. The landing has no tenant, so green here only ever marks value.

---

## 6. Navigation

Structure and behaviour copied from samparka.co, adapted for a dark page.

**Wrapper** — `fixed top-0 z-50 w-full flex justify-center`, transition `300ms cubic-bezier(.4,0,.2,1)`, toggles `-translate-y-full` on scroll-down and restores on scroll-up.

**Pill** — `max-w-6xl w-full mx-4 md:mx-6 mt-4 px-6 md:px-8 py-3 md:py-4 rounded-[20px]`, `backdrop-blur-[25px]`, `border border-white/15`, shadow `0 8px 40px rgba(0,0,0,.4)` plus an inset top highlight.

**Glass value is `white/.06`, not samparka's `white/.15`.** 15% white over `#14201C` is an opaque grey slab; .06 reads as glass. This is the one deliberate deviation from the source.

**Layout** — `StampdLogo` + wordmark left; centre links `hidden lg:flex gap-6` — `Product · Rewards · Campaigns · Pricing · FAQ`, anchors to sections that exist; right a **cream** `rounded-[74px]` pill reading **"Talk to us"**, whose label rolls on hover/focus via `RollingLabel` (§7.4) with a chevron alongside.

The samparka CTA is a dark gradient pill, invisible on a dark page — inverted to cream with dark ink, same geometry.

**Mobile** — `p-2 rounded-2xl` 42×42 button opening a full-screen sheet.

**Link hover** — the samparka glass chip: a `rounded-2xl` panel fading in behind the label, `opacity 0→1`, `scale .9→1`, 300ms.

---

## 7. Hero

### 7.1 Dot field background (`DotField.tsx`)

Ports the behaviour of kokonutui's `mouse-effect-card` (MIT, @dorianbaffier — attribution retained in the file header) but **reimplemented as a single `<canvas>` driven by one `requestAnimationFrame` loop**.

The original renders every dot as a `motion.div` carrying three `useTransform`s, three `useSpring`s and an infinite opacity tween. At card scale (~400 dots) that is fine. Stretched across a 1280×800 hero at 16px spacing it is ~4,000 dots and ~12,000 concurrent springs, which will not hold frame rate on the mid-range Android phones this product's users are on. Concept 1c had already reached the same conclusion independently: *"no library, one rAF loop over 646 particles."*

Behaviour preserved exactly:

- Dot grid at `spacing` px, with the original's centre-weighted random cull so density falls off toward the edges
- Dots within `repulsionRadius` push away along the cursor vector with force `(1 - d/r) * strength`
- Eased return to base position (critically-damped integration, matching the spring's felt weight)
- Proximity opacity boost inside `radius * 1.2`
- Slow per-dot opacity twinkle, phase-offset by index so nothing pulses in sync

Adapted: dots are cream `#F3ECE2` at low alpha, not `zinc-400`. The `Card`/`Button` chrome the original ships is dropped — this is a background, not a card, so neither shadcn primitive gets pulled in.

**Constraints:** canvas sized to devicePixelRatio, capped at 2. Loop pauses when the hero leaves the viewport (`IntersectionObserver`). Pointer tracking is passive. On coarse pointers the repulsion is inert and only the twinkle runs. Under `prefers-reduced-motion` the field renders **once, static**, and the loop never starts.

Applies to the **hero only**. Sections below keep the quiet 1px grid, so the interactive surface is what you land on and the page settles as you read.

### 7.2 Copy and stats

Headline "Points that bring them back." with the rotate-up-from-mask entrance, 95ms stagger. Sub-line changes with the active card.

Stat row consumes `usePublicStats()`. Renders nothing when `visible: false`. Values count up once on entry; `useReducedMotion` shows final values immediately.

Labels: `OUTLETS` · `POINTS / MO` · `CUSTOMERS`. Repeat rate is **not** shown — it is not computed anywhere in the codebase and will not be invented.

### 7.3 Stack advance

Four cards: Points balance → Live campaign → Reward catalogue → Redeemed.

Implemented with `motion` only:

- Scroll track `h-[1800px]`, hero pinned with CSS `position: sticky` — no JS pinning, no scroll hijack, native scrollbar unaffected
- `useScroll({ target, offset })` → `scrollYProgress`
- `useTransform(progress, [0,.25,.5,.75,1], …)` drives, per card, `translateY` / `rotateX` / `scale` / `opacity` / `zIndex`
- Front card lifts up and away; the next rises forward through the stack. All four stay visible, so the sequence reads as a pipeline rather than a slideshow
- The step rail (`EARN / ENGAGE / REWARD / REDEEM`) and the sub-line track the active index
- Cursor tilt: the stack tips toward the pointer, clamped, pointer-events-none

Springs resolve through `useMotion()` per project convention — no component hand-rolls one.

**Reduced motion:** the 1800px track collapses, the pin is removed entirely, and the four cards render as a static stack with the copy fading in. The section is fully readable with zero motion.

### 7.4 Borrowed motion techniques

Three techniques from motion.dev examples. All three are `motion`-only and add no dependency. Each is wrapped in a component under `landing/motion/` so the technique is defined once and the sections stay readable.

**`RollingLabel.tsx` — rolling text** (`react-rolling-text-button`)

Two identical copies of the label stacked in an `overflow: hidden` window. On hover or focus the outgoing copy translates `0% → 100%` while the incoming copy translates `-100% → 0%`, `duration .3`, ease `[.338,.015,.395,.959]`.

The example's queueing logic is kept verbatim in spirit: a `pendingRequest` ref holds the latest hover/focus intent while an animation is mid-flight and applies it on completion. Without it, a fast hover-out during the roll leaves the label stranded mid-window. Hover and focus are tracked as **separate refs** so tabbing away while still hovered does not incorrectly reset.

Applied to the **nav CTA pill only**. The five nav links keep samparka's glass-chip hover — two hover languages inside one 60px pill would compete. `useReducedMotion` short-circuits `requestActive`, so the label never moves.

**`WordReveal.tsx` — scroll word reveal** (`react-text-scroll-word-reveal`)

Splits a statement on spaces; each word gets a `useTransform` mapping scroll progress to opacity `0.15 → 1` across its own slice of the range. Slices are distributed over `SPREAD = 0.8` of the range with `WORD_DURATION = 0.2`, so words overlap and the reveal cascades rather than ticking.

**Deviation from the example:** the example pins a tall stage (`offset: ["start start", "end end"]`). This page already has two other scroll-driven behaviours; a third pin would add roughly a viewport of scroll and risk fighting the hero pin's boundaries. Here the reveal is **pass-through** — `offset: ["start end", "end start"]` — so the words light up as the section travels the viewport, no pin and no added page height.

Accessibility per the example: individual word spans are `aria-hidden`, and the containing heading carries the full statement as `aria-label`, so assistive tech reads one sentence rather than a word list. Under reduced motion no opacity style is applied at all and the text renders solid.

**`FooterReveal.tsx` — footer reveal** (`react-footer-reveal`)

A sticky under-page footer that the page content uncovers as it scrolls away, fading transparent → opaque via `useScroll`. (Motion+ gates the example source; this is a reimplementation from the documented technique, not a copy.)

The footer is fixed at the bottom of the viewport behind the page content, with a spacer of equal height at the end of the document reserving its space. `useScroll` on that spacer with `offset: ["start end", "end end"]` drives opacity. The page's own background is opaque `#14201C`, which is what makes the uncover read.

The `rounded-t-[40px]` step is **retained, moved to the page content's bottom edge** rather than the footer's top — so the dark content ends in rounded corners that sweep away over the cream plane. The step still reads, and it reads on the way out rather than sliding in.

Under reduced motion the footer is a normal in-flow block at full opacity with no sticky behaviour.

---

## 8. Features, pricing, FAQ, CTA

**Features** — eyebrow `WHAT YOU GET`, heading "Everything the counter needs. Nothing it does not."

The heading and its sub-line ("One programme for points, campaigns, rewards and redemption — run from a phone.") render through `WordReveal` (§7.4), lighting word by word as the section passes the viewport. A thin `scaleY` progress rule sits alongside, as in the example.

Below it, six blocks: Points engine, Campaigns, Rewards, Redeem, Insights, Multi-outlet. Copy as written in the concept; these six all describe things that ship. The blocks themselves use ordinary stagger-on-entry, not word reveal — the technique marks the section statement, and loses its weight if everything uses it.

**Pricing** — heading "Priced for a tea shop, not a chain of hotels." Cards render from `usePublicPlans()`; `isMostPopular` gets the emphasis treatment. Every CTA reads **"Talk to us"** and opens the WhatsApp/contact action. Loading shows skeletons; an empty plan list hides the section rather than showing an empty shell.

**FAQ — horizontal card rail.** Heading "The things shop owners ask first."

- `overflow-x-auto snap-x snap-mandatory`, cards ~360px wide with a shared `min-height` so the rail does not jump
- Scrollbar hidden; **vertical page scroll is never trapped**
- Cream Prev/Next pills below, samparka's carousel affordance; disabled at each end
- Arrow keys move focus card to card; each card is a real `h3` + body, always visible — no disclosure semantics, nothing hidden from a screen reader or from search
- Mobile: native swipe, same snap points

**CTA** — "Your regulars are already coming in. Give them a reason to come back." Buttons: "Talk to us" primary, contact secondary. Footnote drops "Free for your first outlet" (not a promise the product makes) in favour of the real onboarding line.

---

## 9. FAQ copy corrections

The concept's FAQ makes three claims the product does not support. All three are corrected.

| Concept answer | Problem | Resolution |
|---|---|---|
| "Scans queue on the device and sync as soon as the connection is back." | False. The service worker precaches only the static shell and **never** caches `/api` — balances and claims are always live, so loyalty actions require a connection. | Rewritten: a connection is needed at the counter; the scan itself is instant. |
| "Can I run points and stamps together? Yes — either model, or both, per outlet." | False. The product is points-only. There is no stamp model. | Question **deleted**. |
| "Every scan is logged against the staff member who made it." | Unverified. | Verify against `PointsTransaction` before writing. Keep only what the ledger actually records; the append-only ledger claim is true and can carry the answer on its own. |

Retained as written (all accurate): no app download (PWA installs from the browser), same-day setup.

The two remaining true answers plus corrections leave four cards in the rail.

---

## 10. Footer

samparka.co's footer structure, **inverted**: cream `#F3ECE2` panel with dark ink, `min-h-[60vh]`, `px-6 sm:px-10 md:px-16 lg:px-20 pb-10`, `flex items-end`.

It enters via `FooterReveal` (§7.4) rather than scrolling in — the dark page uncovers it and it fades transparent → opaque. The `rounded-t-[40px]` step is retained on the page content's bottom edge, so the dark surface ends in rounded corners that sweep away over the cream plane. samparka's light spacer strip is unnecessary; the uncover provides the separation.

Contents, top to bottom:

1. Nav link row — same anchors as the nav pill
2. Social icons — Facebook, Instagram, X, LinkedIn from `PlatformConfig.contact.socials`. **Each icon renders only if its URL is set**, so an unconfigured platform shows no dead icons
3. Hairline divider
4. Bottom bar — `© 2026 Stampd.` · Privacy Policy · Terms of Service

Dropped from the source: the Recognition award grid (Stampd has no awards; fabricated logos are worse than none), the overlapping "Let's get started" glass card (the CTA section above already does that job), the mascot illustration.

`/privacy` and `/terms` are new stub routes on the landing's dark surface with placeholder bodies, added to `App.tsx` and to `RESERVED_SLUGS` (§3.3).

---

## 11. WhatsApp float

Kept — it is how this market actually makes contact, and it gives every "Talk to us" CTA a real destination in the absence of self-serve signup. Redesigned so it is not a copy of samparka's.

Collapsed: a cream circle with a thin-stroke WhatsApp glyph in `--lp-ink`. On hover or keyboard focus it expands to a `rounded-[74px]` pill reading "Chat with us". No stock green badge, no mascot illustration — built from the page's own cream / ink / radius vocabulary.

Number comes from `PlatformConfig.contact.phone` via `usePublicContact()`. **The component returns `null` when phone is unset** — no hardcoded number ships. Under reduced motion the pill does not expand and stays collapsed.

---

## 12. Testing

**New:** `backend/tests/public-landing-endpoints.js`, **added to the `test` chain in `backend/package.json`** — a suite not in that chain never runs.

Asserts:
- `public-stats` and `public-plans` return 200 with **no** `Authorization` header
- Neither response contains any company id, outlet id, slug, name, or customer identifier — asserted by scanning the serialized body, so a future field addition trips it
- `public-stats` returns `{ visible: false }` and no figures when outlet count is below threshold
- `public-plans` omits inactive plans and never exposes `outletLimit`
- `customers` counts distinct `CustomerAccount`s — seeded `bikash` spans three companies and must count once

**Existing:** `npm run lint` (tsc), `npm test` (full chain, including `multi-tenant-isolation` and `auth-links`).

**Browser:** verify at 1280 and 375 — nav hide/show, stack advance across the pin, rolling label under a fast hover-in/hover-out (the case the queueing refs exist for), word reveal cascade timing, FAQ rail snap and Prev/Next bounds, footer uncover and its interaction with the WhatsApp float, and a full reduced-motion pass with the OS setting on: no pin, no roll, no reveal, page fully readable.

---

## 13. Sequencing

1. Commit the current uncommitted Samparka landing to a branch so it is recoverable, then return to `main`
2. Backend: `getPublicStats`, `public-plans` controller/route, `RESERVED_SLUGS` entries, new test suite → `npm test` green
3. Tokens under `.landing-dark`; `primitives.tsx`; `data.ts`; the three `motion/` technique components
4. `LandingNav` + `DotField` + `HeroStack` — the highest-risk pieces, verified in browser before anything else is built on them
5. Features → Pricing → FAQ rail → CTA → Footer → WhatsApp float
6. `/privacy`, `/terms` stubs
7. Full verification pass (§12)
8. Remove the temporary `concepts` entry from `.claude/launch.json`

---

## 14. Risks

- **Dot field performance.** The mitigation is the canvas rewrite, but it still needs measuring on a real phone, not just a throttled desktop profile. If it does not hold, widen spacing before adding complexity.
- **Four scroll-driven behaviours on one page** — hero pin, word reveal, footer reveal, hide-on-scroll nav. Making the word reveal pass-through instead of pinned removes one pin, but the remaining interactions still need verifying together, not in isolation. Specifically: the nav must not flicker at the hero pin boundaries, and the fixed nav must not sit over the cream footer once it is uncovered.
- **Footer reveal vs. WhatsApp float.** Both are fixed-position and both live at the bottom of the viewport. Verify the float stays legible against cream as the footer fades in — it is a cream pill on a cream plane at full reveal, and will need a border or ink treatment at that point.
- **Mock DB.** `getPublicStats` must use only top-level equality and `$gte`; any other operator throws rather than silently matching.
- **Empty-state honesty.** Stats hidden, plans hidden, socials hidden, WhatsApp hidden — each renders nothing rather than a placeholder. Verify a fully unconfigured platform still produces a coherent page.

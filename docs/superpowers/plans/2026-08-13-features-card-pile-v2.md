# Features Card Pile v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `FeaturePile.tsx` so the cards match the reference video: correct size (~44–56vw × 33–44vh self-contained panels), fluid eased scroll-linked slide-ins alternating left/right, and a fanned settled deck.

**Architecture:** Keep the v1 skeleton (tall track + native CSS sticky stage + absolutely stacked cards driven by `useScroll`/`useTransform`), correcting the three root causes: `inset-0` card sizing, missing easing + too-short scroll window, and caption-outside-card composition.

**Tech Stack:** motion v12.42.2 (`useScroll`, `useTransform`, `useReducedMotion`, `useMotionValue`), Tailwind 4, existing landing tokens (`--lp-line`, `--lp-panel`, `--lp-green`, `--lp-ink`, `--lp-muted`).

## Global Constraints

- One `FeaturePile.tsx` file; no new dependencies.
- Branch `feature/pile-cards`; deliver as a PR against `main` (production untouched).
- Reduced motion: static column of all six cards, none hidden.
- `npm run lint -w frontend` (tsc) and `npm run build -w frontend` must pass.
- No horizontal overflow: stage keeps `overflow-clip`, slides happen within.

## Files

- Modify: `frontend/src/routes/platform/landing/FeaturePile.tsx` (full rework of `PileCard`)
- No change: `SectionsFeatures.tsx`, `data.ts`, `FeatureArt.tsx` (v1 already rewired them)

---

### Task 1: Card sizing + composition (self-contained panel)

**Files:** Modify `FeaturePile.tsx` (`PileCard` return markup)

- [ ] **Step 1: Restyle the card markup**

Replace the `absolute inset-0` `<article>` with a centred, fixed-size card:

```tsx
<motion.article
  style={{ x, rotate, scale, zIndex: z }}
  className="absolute inset-0 flex items-center justify-center"
  aria-label={`${block.title}: ${block.body}`}
>
  <div className="flex h-[44vh] w-[min(56vw,820px)] max-w-[880px] flex-col overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] shadow-[0_24px_60px_-32px_rgba(0,0,0,0.5)]">
    <div className="flex-1 min-h-0 w-full">
      {Art ? <Art /> : null}
    </div>
    <div className="px-6 pb-6 pt-4 md:px-8 md:pb-8">
      <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">{block.kicker}</p>
      <h3 className="mt-2 font-display text-xl text-[var(--lp-ink)] sm:text-2xl">{block.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--lp-muted)]">{block.body}</p>
    </div>
  </div>
</motion.article>
```

Remove the entire `copyOpacity` / `nextSideProgress` logic — the caption now lives inside the panel, so the incoming card naturally covers previous content; cards stay fully opaque.

- [ ] **Step 2: Run lint**

Run: `npm run lint -w frontend`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/platform/landing/FeaturePile.tsx
git commit -m "refactor(landing): make pile card a self-contained panel sized to reference video"
```

### Task 2: Fluid slide motion (easing + longer track + deck offsets)

**Files:** Modify `FeaturePile.tsx` (`PileCard` motion values, `TRACK_HEIGHT_VH`, deck offsets)

- [ ] **Step 1: Lengthen the track and add ease-out mapping**

```tsx
// 250vh per card entrance so the slide is visible across several scrolls,
// plus one screen for the opening state.
const TRACK_HEIGHT_VH = (CARD_COUNT + 1) * 250;

function easeOut(p: number) {
  return 1 - Math.pow(1 - p, 3);
}
```

`sideProgress` keeps its per-card window (`[index/CARD_COUNT, (index+1)/CARD_COUNT]` clamped), but every downstream transform applies `easeOut` to the raw progress:

```tsx
const rawSide = useTransform(progress, (p) =>
  Math.max(0, Math.min(1, p * CARD_COUNT - index + 1)),
);
const eased = useTransform(rawSide, (s) => easeOut(s));
```

- [ ] **Step 2: Slide + rotate + scale + deck offset**

Settled position for card `i`: horizontal offset `(-1)^i * 8%` of card width, rotation `(-1)^i * 1.4deg`. The slide starts off-screen (`±110vw`) and eases into that settled spot:

```tsx
const settledX = index % 2 === 0 ? -8 : 8; // percent of card width
const settledRotate = index % 2 === 0 ? -1.4 : 1.4;
const startX = fromLeft ? -110 : 110; // vw units

// x in vw units: motion maps numbers to px? — use vw unit string via
// useTransform returning a px value multiplied by live vw width (same
// technique as v1, now with easing):
const x = useTransform([eased, vwPx], (vals: number[]) => {
  const [e, w] = vals;
  const startPx = fromLeft ? -1.1 * w : 1.1 * w;
  const endPx = (settledX / 100) * 0.56 * w; // 8% of 56vw card
  return startPx + (endPx - startPx) * e;
});

const rotate = useTransform(eased, (e) => {
  const startRot = fromLeft ? 8 : -8;
  return startRot + (settledRotate - startRot) * e;
});

const scale = useTransform(eased, (e) => 0.97 + 0.03 * e);
```

z-index: `Math.round(10 + index * 10 + eased * 2)` (unchanged).

- [ ] **Step 3: Run lint**

Run: `npm run lint -w frontend`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/platform/landing/FeaturePile.tsx
git commit -m "feat(landing): eased scroll-linked slide-ins with deck offsets for card pile"
```

### Task 3: Iterative visual verification loop

**Files:** none (dev server on :3000, exposed URL with allowedHosts already set)

Verify in the browser at these scroll fractions of the track (`top + h*frac`): `0.02` (card 1 centred, alone), `1/7` (card 2 mid-slide from right), `2/7`, `3.5/7` (card 4 sliding), `5/7`, `6.5/7` (fanned deck, all edges visible), `end-5px`.

- [ ] **Step 1: Check card size** — card panel ≈ 56vw × 44vh (measure with `getBoundingClientRect` relative to `innerWidth/innerHeight`). FAIL if width > 0.62 vw or height > 0.52 vh.
- [ ] **Step 2: Check motion continuity** — at fractions 0.13, 0.26, 0.40 (mid-entrances) the entering card's centre must be strictly between off-screen and settled, with eased distances decelerating. FAIL if any card jumps from off-screen to settled between consecutive samples.
- [ ] **Step 3: Screenshot at 3.5/7 and 6.5/7** — card must be a compact rounded panel (art top, caption bottom inside), piled/fanned deck visible at 6.5/7.
- [ ] **Step 4: Fluidity spot-check** — programmatically step scroll by 40px increments across one card's entrance and confirm the card moves smoothly through ≥ 8 distinct positions (no pop).
- [ ] **Step 5: Iterate** — any FAIL means adjust constants (window size, ease curve, settled offsets), re-run steps 1–4. Target: at least 3 consecutive clean passes.
- [ ] **Step 6: Run lint + build** — `npm run lint -w frontend` and `npm run build -w frontend`.

### Task 4: Update PR and deliver

- [ ] **Step 1: Force-push** branch `feature/pile-cards` and update PR #21 body with the v2 summary.
- [ ] **Step 2: Report** preview URL + PR link to the user with before/after screenshots.

---

## Self-Review

Spec coverage: card size (Task 1), composition (Task 1), eased slide (Task 2), deck offsets (Task 2), scroll link + reverse (by construction, verified Task 3), reduced motion (unchanged from v1), no regression (Tasks 1–3). No placeholders found. Signature consistency: `eased`, `vwPx`, `x`, `rotate`, `scale`, `z` are the only MotionValues used in the `style` prop.

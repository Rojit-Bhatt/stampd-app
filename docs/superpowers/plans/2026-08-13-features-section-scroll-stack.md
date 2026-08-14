# Feature cards — full-screen alternating scroll-in pile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal drag-strip "What you get" carousel with a scroll-pinned section where each card occupies one full screen and reveals by sliding in from the side — alternating left, right, left, … — piling each new card on top of the previous one, scrubbed 1:1 with the scrollbar.

**Architecture:** One new component, `FeaturePile.tsx`, replacing `<ServicesCarousel />` in `SectionsFeatures.tsx`. It reuses the exact pattern `HeroStack.tsx` already established on this page: a tall scroll track (`(1 + n) * 100vh`) with a `sticky top-0 h-screen` stage (native CSS sticky, no JS scroll hijack), `useScroll` giving `scrollYProgress` 0→1 over the track, and one `useTransform` chain per card mapping progress into side position (left for even index, right for odd), z-index, and a small rotation. The stage is `overflow-clip`, so slide-ins from outside the stage never widen the page.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4 + `motion` v12.42.2 (`useScroll`, `useTransform`, `useReducedMotion`) — no new dependencies.

## Global Constraints

- No new npm dependencies — `motion` v12.42.2 is already installed and provides everything needed.
- Follow the landing page's existing motion precedent (`HeroStack.tsx`): native CSS sticky pin, scroll-linked transforms, `useReducedMotion` static fallback.
- Landing tokens only: `--lp-bg`, `--lp-panel`, `--lp-ink`, `--lp-muted`, `--lp-line`, `--lp-green`, `--lp-cream`; `lp-grid` for the section background; mono kicker at `text-[10px] tracking-[0.18em]`.
- Page overflow is guarded globally (`html { overflow-x: clip }`) — the stage must not introduce horizontal overflow; slide starts at `±110vw` *inside* the clipped stage.
- No copy changes — `data.ts` (six `FEATURES.blocks`) and `graphics/FeatureArt.tsx` are read-only for this plan.
- Validation commands (from README/contributing): `npm run lint -w frontend` (TypeScript), `npm run build -w frontend` (production build). No frontend test runner exists; verification = typecheck + build + browser check.
- Git: work on a `feature/pile-cards` branch off `main`, push it, and hand off via PR (never force-push `main` — two cafes run production off it).

## File Structure

| File | Responsibility |
| --- | --- |
| `frontend/src/routes/platform/landing/FeaturePile.tsx` (new) | The pinned section: track, sticky stage, six stacked absolute cards, scroll math, reduced-motion fallback. |
| `frontend/src/routes/platform/landing/SectionsFeatures.tsx` | Swap `<ServicesCarousel />` for `<FeaturePile />`. |
| `frontend/src/routes/platform/landing/ServicesCarousel.tsx` | Deleted — replaced wholesale. |
| `frontend/src/routes/platform/landing/graphics/FeatureArt.tsx` | Read-only, but its module doc comment references `ServicesCarousel.tsx` — update that comment line to name `FeaturePile.tsx`. |
| `docs/superpowers/specs/2026-08-13-features-section-scroll-stack-spec.md` | Spec (written already). |
| This plan | In `docs/superpowers/plans/`. |

---

### Task 1: Build `FeaturePile.tsx` — pinned alternating slide-in stack

**Files:**
- Create: `frontend/src/routes/platform/landing/FeaturePile.tsx`
- Read (precedent, do not modify): `frontend/src/routes/platform/landing/HeroStack.tsx`, `frontend/src/routes/platform/landing/data.ts`
- Update comment only: `frontend/src/routes/platform/landing/graphics/FeatureArt.tsx` line 5 — change "wired in ServicesCarousel.tsx" to "wired in FeaturePile.tsx".
- Delete (Task 2): `frontend/src/routes/platform/landing/ServicesCarousel.tsx`

**Interfaces:**
- Consumes: `FEATURES.blocks` from `./data` (type `Block`, with `id`, `kicker`, `title`, `body`); `FEATURE_ART[block.id]` from `./graphics/FeatureArt` (rendered inside `div.h-full.w-full`).
- Consumes (optional): nothing else — self-contained, exported as `FeaturePile` (no props).
- Produces: a section element with `className="lp-grid"` and the same visual identity as before (dark panel, rounded corners, mono kicker, display title, muted body), but one card per screen.

**Implementation:**

```tsx
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { useRef } from "react";

import { FEATURES } from "./data";
import { FEATURE_ART } from "./graphics/FeatureArt";

const BLOCKS = FEATURES.blocks;
const CARD_COUNT = BLOCKS.length;

// ---------- geometry constants ----------
// Track height: 1 screen to hold the first card centred, then one screen of
// scroll per remaining card advance.
const TRACK_HEIGHT_VH = CARD_COUNT + 1;

// Art frame at rest inside the stage, centred. Card grows from the old
// 380x220 to one-per-screen while the copy band keeps the same typography.
const ART_CLASS = "h-[220px] w-full sm:h-[280px] md:h-[340px]"; // matches stage layout below

type Block = (typeof BLOCKS)[number];

/**
 * One card of the pile.
 *
 * All cards share the same absolute slot. `sideProgress` is 0 before the card
 * has entered (stashed off its side), 1 once it has reached centre, and stays
 * 1 while later cards pile on top. Even indices enter from the LEFT, odd from
 * the RIGHT — the alternation the spec asks for.
 */
function PileCard({
  block,
  index,
  progress,
}: {
  block: Block;
  index: number;
  progress: MotionValue<number>;
}) {
  const fromLeft = index % 2 === 0;

  // This card's window within the overall scroll: it enters over the
  // segment [(i)/(n), (i+1)/(n)] of progress and is fully settled by then.
  // Segment math identical in spirit to HeroStack's StackCard position =
  // index - p*(n-1), but expressed per-card so the transform reads directly.
  const sideProgress = useTransform(progress, (p) =>
    Math.max(0, Math.min(1, (p * CARD_COUNT - index) + 1)),
  );

  // Distance per unit: start at -110% (off the left edge of the stage) and
  // travel to 0; right-entrants mirror it. Percent units keep it viewport-
  // relative without ever exceeding the clipped stage.
  const x = useTransform(sideProgress, (s) => (fromLeft ? -110 * (1 - s) : 110 * (1 - s)));

  // z-index: later cards sit above earlier ones — that is what makes the
  // entrance read as piling ONTO the previous card.
  const z = useTransform(sideProgress, (s) => Math.round(10 + index * 10 + s * 2));

  // A faint tilt that relaxes as the card settles — the "pile" feel from the
  // reference video, kept subtle so the page stays quiet.
  const rotate = useTransform(
    sideProgress,
    (s) => (fromLeft ? -1.4 * (1 - s) : 1.4 * (1 - s)),
  );

  const Art = FEATURE_ART[block.id];

  return (
    <motion.article
      style={{ x, rotate, zIndex: z }}
      className="absolute inset-0 flex flex-col items-center justify-center px-4"
      aria-label={`${block.title}: ${block.body}`}
    >
      <div className="w-full max-w-[720px] md:max-w-[880px]">
        <div className="overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]">
          <div className="aspect-[400/280] w-full">{Art ? <Art /> : null}</div>
        </div>
        <p className="mt-8 font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
          {block.kicker}
        </p>
        <h3 className="mt-3 font-display text-2xl text-[var(--lp-ink)] sm:text-3xl md:text-4xl">
          {block.title}
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[var(--lp-muted)]">
          {block.body}
        </p>
      </div>
    </motion.article>
  );
}

export function FeaturePile() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  if (reduced) {
    // Static fallback: all six cards listed in a column, nothing hidden.
    return (
      <section className="lp-grid px-6 py-28 md:px-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-12">
          {BLOCKS.map((block) => {
            const Art = FEATURE_ART[block.id];
            return (
              <div
                key={block.id}
                className="overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]"
              >
                <div className="aspect-[400/280] w-full">{Art ? <Art /> : null}</div>
                <div className="p-6 md:p-8">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                    {block.kicker}
                  </p>
                  <h3 className="mt-3 font-display text-2xl text-[var(--lp-ink)] sm:text-3xl">
                    {block.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[var(--lp-muted)]">
                    {block.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    // Native CSS sticky pin — the track's height supplies the scroll range,
    // the stage covers the viewport, nothing below the fold is ever visible
    // through the stage because the page background is opaque.
    <div ref={trackRef} className={`relative h-[${TRACK_HEIGHT_VH}vh]`}>
      <section
        className="lp-grid sticky top-0 h-screen overflow-clip"
        aria-label="What you get with Stampd"
      >
        <div className="relative h-full w-full">
          {BLOCKS.map((block, i) => (
            <PileCard key={block.id} block={block} index={i} progress={scrollYProgress} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

Notes for the implementer: `TRACK_HEIGHT_VH` must NOT be a Tailwind template literal class — Tailwind cannot generate arbitrary vh values; render the track with an inline style (`style={{ height: `${TRACK_HEIGHT_VH}vh` }}`) instead, and document why in a comment. Keep the section's outer shell `lp-grid px-6 py-28 md:px-10` semantics via the stage's own padding (the stage is full-bleed; inner content uses the `max-w-[880px]` cap). The deletion in Task 2 is safe: a repo-wide grep confirms only `SectionsFeatures.tsx` imports `ServicesCarousel`.

**Verification (no test runner):**
- [ ] `cd frontend && npm run lint` passes with the new file (TypeScript check; `npm run build` runs later, after wiring).
- [ ] Stage renders with all six cards stacked, first card centred at scroll offset 0.
- [ ] Slow scroll: card 1 (points-engine, even index) enters from the LEFT, card 2 (campaigns, odd) from the RIGHT and visibly layers above card 1, alternating through all six; final card centred at track end.
- [ ] Scrubbing backwards reverses the pile in the opposite order.
- [ ] Devtools with `prefers-reduced-motion: reduce` shows the static six-card column.
- [ ] No horizontal scrollbar appears at any viewport width (check `document.documentElement.scrollWidth === clientWidth`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/FeaturePile.tsx docs/superpowers/specs/2026-08-13-features-section-scroll-stack-spec.md docs/superpowers/plans/2026-08-13-features-section-scroll-stack.md
git commit -m "feat(landing): scroll-pinned alternating card pile for features section"
```

---

### Task 2: Wire `FeaturePile` into the section, remove the carousel

**Files:**
- Modify: `frontend/src/routes/platform/landing/SectionsFeatures.tsx` (replace the carousel import and usage)
- Delete: `frontend/src/routes/platform/landing/ServicesCarousel.tsx`

**Interfaces:**
- Consumes: `FeaturePile` from `./FeaturePile` (no props).
- Produces: `FeaturesSection` renders the eyebrow, the word-reveal statement, then `<FeaturePile />` — same composition as before.

**Steps:**

- [ ] **Step 1: Update `SectionsFeatures.tsx`**

Replace the `ServicesCarousel` import with `FeaturePile` and the JSX usage:

```tsx
import { FEATURES } from "./data";
import { Eyebrow } from "./primitives";
import { FeaturePile } from "./FeaturePile";
import { WordReveal } from "./motion/WordReveal";

export function FeaturesSection() {
  return (
    <section id="services" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>{FEATURES.eyebrow}</Eyebrow>
        <WordReveal
          text={FEATURES.statement}
          className="mt-5 max-w-4xl font-display text-3xl leading-[1.15] tracking-[-0.02em] text-[var(--lp-ink)] sm:text-4xl md:text-5xl"
        />
      </div>

      {/* The pile takes over from here: cards are full-viewport sized, so the
          max-w-6xl content column would clip them — render it full-bleed. */}
      <FeaturePile />
    </section>
  );
}
```

Note the structural change: `FeaturePile` renders OUTSIDE the `max-w-6xl` wrapper because full-screen cards cannot live inside a content column; keep the eyebrow + statement inside the column so the section head keeps its layout.

- [ ] **Step 2: Verify nothing else imports the deleted file, then delete it**

```bash
git grep -n ServicesCarousel
# expect hits only in SectionsFeatures.tsx (being updated) and the file itself
git rm frontend/src/routes/platform/landing/ServicesCarousel.tsx
```

- [ ] **Step 3: Run verification**

Run `npm run lint -w frontend && npm run build -w frontend` from the repo root.

Expected: both pass, no warnings about unused exports (the old carousel's helpers are gone with it). Then in the browser: `#services` anchor lands at the section head, scrolling down pins the stage and runs the pile, and the section below (pricing) flows in naturally after the track ends.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/SectionsFeatures.tsx
git commit -m "feat(landing): replace drag-strip carousel with scroll-pinned card pile"
```

---

### Task 3: Visual verification against the reference, branch finish, and handoff

**Files:**
- No code changes expected — this task is verification and integration.

**Steps:**

- [ ] **Step 1: Record the new behavior** — scroll the `/` route through the features section on desktop (≥1280px) and mobile width (375px); confirm card 1 enters from the left, card 2 from the right piling on card 1, alternating through all six, matching the reference video's pile-up feel and the user's direction requirement.
- [ ] **Step 2: Reduced-motion and anchor checks** — static column visible under `prefers-reduced-motion`; `#services` nav link lands correctly.
- [ ] **Step 3: Push the branch and open a PR against `main`** — do not merge silently; the user owns production.

```bash
git push -u origin feature/pile-cards
gh pr create --title "Features section: full-screen alternating scroll-in card pile" \
  --body "Replaces the horizontal drag-strip carousel with a scroll-pinned pile: one card per screen, alternating left/right entrances, each new card stacking on the previous. Static fallback under reduced motion. No dependency or backend changes."
```

- [ ] **Step 4: Report** — summarize the before/after, link the PR, and note deployment is untouched (Render/Cloudflare deploy whatever is on their tracked branch once merged).

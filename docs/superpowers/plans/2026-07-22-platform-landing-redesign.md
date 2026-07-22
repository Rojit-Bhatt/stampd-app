# Platform Landing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the platform marketing page (`/`) into scroll-driven, component-split sections with fresh copy, while keeping the existing editorial-ledger design tokens untouched.

**Architecture:** `PlatformLanding.tsx` becomes a thin composer of nine new files under `frontend/src/routes/platform/landing/`. Each existing section is extracted verbatim-then-enhanced (own file, own scroll-reveal motion); three sections are entirely new (`ProductPreview`, `ServicesGrid`, `Pricing`). One new data hook (`usePublicPlans`) feeds Pricing from the already-existing, already-public `GET /api/platform/plans/public` endpoint — zero backend changes. One new entry (`reveal`) is added to the shared `lib/motion.ts` vocabulary so every section's scroll animation pulls from the same physics, same as the rest of the app.

**Tech Stack:** React 19, TypeScript, Tailwind v4, `motion/react` (re-exports `framer-motion`: `motion`, `useScroll`, `useTransform`, `useReducedMotion` — all confirmed present in `node_modules/framer-motion`), TanStack Query (`useQuery`), existing `apiRequest` fetch wrapper, existing `components/ui/button`.

## Global Constraints

- **No backend changes.** `GET /api/platform/plans/public` already exists, is unauthenticated, and returns `{ success: true, plans: [...] }` — consume as-is.
- **Design tokens (`index.css`, `fonts.css`) do not change.** Every color/font reference below is an existing CSS custom property or Tailwind class already used elsewhere in this file.
- **No fabricated data.** No invented customer counts, ratings, or testimonials anywhere in these sections.
- **No dark-mode toggle** — out of scope, not part of this work.
- **Motion vocabulary is centralized.** Every scroll/entrance animation resolves its transition through `useMotion()` (existing hook in `lib/motion.ts`) so `prefers-reduced-motion` is honored everywhere with zero per-component opt-out risk.
- **This repo has no frontend unit test framework** (`frontend/package.json` has no `test` script, no vitest/jest, zero `*.test.*` files — confirmed by inspection). "Test" for every task below means: `npm run lint` (`tsc --noEmit`) passes, and a manual visual check of the composed page in the browser preview — the same pattern the rest of this frontend already uses (CLAUDE.md: "start the dev server and use the feature in a browser before reporting complete"). Do not introduce a new test framework as part of this plan — out of scope.
- Every task mounts its new/changed section directly into `PlatformLanding.tsx` in the same task (not at the end) so each task is independently visually verifiable.
- Run all commands from the repo root unless stated otherwise. Dev server: `MONGODB_URI="" npm run dev -w backend` (backend, one terminal) is only needed if verifying Pricing's real data — for pure layout/motion tasks the frontend alone (`npm run dev -w frontend`, or the Browser pane's dev-server preview) is enough to see the page (Pricing section will show its loading/empty state until the backend task connects).

---

## Task 1: Motion vocabulary — add the `reveal` transition

**Files:**
- Modify: `frontend/src/lib/motion.ts`

**Interfaces:**
- Produces: `EASES.reveal: Transition` — usable via `useMotion().ease("reveal")`. Every later section task imports `useMotion` from `../../lib/motion` and calls `m.ease("reveal")` for its `whileInView` transition.

- [ ] **Step 1: Add the `reveal` entry to `EASES`**

In `frontend/src/lib/motion.ts`, change:

```ts
export const EASES = {
  /** Hover lift, colour shifts, anything non-celebratory. */
  ui: { duration: 0.18, ease: "easeOut" },
  /** Press. Deliberately faster than the release. */
  press: { duration: 0.1, ease: "easeOut" },
} satisfies Record<string, Transition>;
```

to:

```ts
export const EASES = {
  /** Hover lift, colour shifts, anything non-celebratory. */
  ui: { duration: 0.18, ease: "easeOut" },
  /** Press. Deliberately faster than the release. */
  press: { duration: 0.1, ease: "easeOut" },
  /** Scroll-triggered fade/slide-up used by marketing-page sections
      entering the viewport. Not celebratory, so an ease, not a spring. */
  reveal: { duration: 0.5, ease: "easeOut" },
} satisfies Record<string, Transition>;
```

- [ ] **Step 2: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors (the object literal still satisfies `Record<string, Transition>`; `EaseName` is derived from `keyof typeof EASES` so `"reveal"` is now a valid `EaseName` automatically).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/motion.ts
git commit -m "feat(landing): add reveal easing to shared motion vocabulary"
```

---

## Task 2: `usePublicPlans` data hook

**Files:**
- Create: `frontend/src/hooks/usePublicPlans.ts`

**Interfaces:**
- Consumes: `apiRequest<T>(path: string, opts?)` from `../lib/api` (existing wrapper — no `role`/auth needed for a public route, matching `usePlatformContact`'s pattern).
- Produces: `usePublicPlans()` → `UseQueryResult<SubscriptionPlan[]>`, and the exported `SubscriptionPlan` interface (`id, slug, name, priceNpr, outletLimit, features: string[], isMostPopular: boolean, billingIntervalDays: number`). Task 9 (`Pricing.tsx`) imports both.

- [ ] **Step 1: Write the hook**

```ts
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface SubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  priceNpr: number;
  outletLimit: number;
  features: string[];
  isMostPopular: boolean;
  billingIntervalDays: number;
}

// Public read — used by the platform landing page's Pricing section. No
// auth required, mirrors usePlatformContact's public/admin split pattern.
// Real, admin-configured plans; never invented numbers on the marketing page.
export function usePublicPlans() {
  return useQuery<SubscriptionPlan[]>({
    queryKey: ["subscriptionPlans", "public"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; plans: SubscriptionPlan[] }>(
        "/api/platform/plans/public",
      );
      return res.plans;
    },
    staleTime: 1000 * 60,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/usePublicPlans.ts
git commit -m "feat(landing): add usePublicPlans hook for the public plans endpoint"
```

---

## Task 3: `Nav.tsx` — scroll-morphing navigation

**Files:**
- Create: `frontend/src/routes/platform/landing/Nav.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (remove the inline `<header>`, lines 135–156 of the current file; render `<Nav />` in its place; remove now-unused imports `StampdLogo` if no longer referenced elsewhere in the file — it is still used in the footer section later in this same file, so keep it for now)

**Interfaces:**
- Consumes: `PLATFORM_NAME` from `../../../lib/platform`, `StampdLogo` from `../../../components/shared/StampdLogo`, `Button` from `@/components/ui/button`, `useMotion` from `../../../lib/motion` (not used directly here — the scroll morph uses `useScroll`/`useTransform` from `motion/react` and only needs `useReducedMotion` to decide whether to animate at all).
- Produces: `export function Nav()` — no props. Rendered once, at the top of `PlatformLanding.tsx`'s returned tree.

- [ ] **Step 1: Write `Nav.tsx`**

```tsx
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";

import { PLATFORM_NAME } from "../../../lib/platform";
import { StampdLogo } from "../../../components/shared/StampdLogo";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#loop", label: "How it works" },
  { href: "#services", label: "Services" },
  { href: "#features", label: "For businesses" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "Questions" },
];

// Full-width bar at the top of the hero, morphing into a centered floating
// pill once scrolled past it. One continuous transform driven by scroll
// progress over a fixed 0-160px range, not a breakpoint swap — so it reads
// as fluid rather than a snap. Collapses to the pill's resting state
// instantly under reduced motion (no scroll-linked transform at all).
export function Nav() {
  const prefersReduced = useReducedMotion() ?? false;
  const { scrollY } = useScroll();

  const maxWidth = useTransform(scrollY, [0, 160], ["100%", "760px"]);
  const marginTop = useTransform(scrollY, [0, 160], ["0px", "12px"]);
  const radius = useTransform(scrollY, [0, 160], ["0px", "9999px"]);
  const borderOpacity = useTransform(scrollY, [0, 160], [1, 0.6]);

  if (prefersReduced) {
    return (
      <header className="sticky top-3 z-30 mx-auto w-full max-w-[760px] rounded-full border border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <NavInner />
      </header>
    );
  }

  return (
    <motion.header
      className="sticky top-0 z-30 mx-auto overflow-hidden border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur"
      style={{
        maxWidth,
        marginTop,
        borderRadius: radius,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: `color-mix(in srgb, var(--line) ${borderOpacity}%, transparent)`,
      }}
    >
      <NavInner />
    </motion.header>
  );
}

function NavInner() {
  return (
    <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-4">
      <Link to="/" className="flex items-center gap-2.5">
        <StampdLogo size={26} />
        <span className="font-display text-lg font-bold">{PLATFORM_NAME}</span>
      </Link>
      <nav className="ml-6 hidden items-center gap-6 text-sm font-semibold text-[var(--muted)] lg:flex">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="hover:text-[var(--ink)]">
            {l.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin-login">Log in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/explore">Start collecting</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

In `frontend/src/routes/platform/PlatformLanding.tsx`:

Add the import near the top (with the other local imports):

```tsx
import { Nav } from "./landing/Nav";
```

Replace the entire `<header>...</header>` block (the sticky header JSX) with:

```tsx
      <Nav />
```

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Start the frontend dev server preview (`npm run dev -w frontend` via the Browser pane's `preview_start`), open `/`, confirm: nav renders full-width at the top; scrolling down ~160px shrinks it into a centered rounded pill with blur; scrolling back up restores full width; all links still jump to their anchors (`#loop`, `#faq` still exist at this point — `#services`/`#pricing` will resolve once Tasks 7 and 9 add those sections, which is expected and not a regression to fix now).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/Nav.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): extract Nav into its own component with scroll-morph"
```

---

## Task 4: `Hero.tsx` — tightened copy + entrance motion

**Files:**
- Create: `frontend/src/routes/platform/landing/Hero.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (remove the `<section>` for HERO — current lines 158–243 — render `<Hero />` in its place)

**Interfaces:**
- Consumes: `Button` from `@/components/ui/button`, `Link` from `react-router-dom`, `ArrowRight` from `lucide-react`, `useMotion` from `../../../lib/motion`.
- Produces: `export function Hero()` — no props.

- [ ] **Step 1: Write `Hero.tsx`**

```tsx
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMotion } from "../../../lib/motion";

const STATS = [
  { v: "10%", k: "of a bill back — your call" },
  { v: "30s", k: "single-use earn code" },
  { v: "0", k: "app installs needed" },
];

// Leads with the sentence that actually describes the product. Every figure
// here is a fact about how the product works — no invented traction.
export function Hero() {
  const m = useMotion();

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-14 lg:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={m.pick({ opacity: 0, y: 16 }, false)}
          animate={{ opacity: 1, y: 0 }}
          transition={m.ease("reveal")}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary-deep)]">
            Loyalty for local Nepal
          </span>
          <h1 className="mt-4 font-display text-[40px] font-bold leading-[1.05] tracking-tight lg:text-[56px]">
            Every bill earns points. Every visit spends them back.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--muted)]">
            No app to install, no punch cards, no hardware — just a phone
            camera and a counter.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/admin-login">
                Start your program <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/explore">See it as a customer</Link>
            </Button>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
            {STATS.map((s, i) => (
              <motion.div
                key={s.k}
                className="border-t border-[var(--line)] pt-3"
                initial={m.pick({ opacity: 0, y: 10 }, false)}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...m.ease("reveal"), delay: m.prefersReduced ? 0 : i * 0.08 }}
              >
                <dt className="font-numeral text-[32px] leading-none text-[var(--primary)]">
                  {s.v}
                </dt>
                <dd className="mt-1.5 text-xs leading-snug text-[var(--muted)]">{s.k}</dd>
              </motion.div>
            ))}
          </dl>
        </motion.div>

        {/* The product's own moment rather than a stock dashboard shot: what
            a customer sees the instant points land. */}
        <motion.div
          className="relative mx-auto w-full max-w-[320px]"
          initial={m.pick({ opacity: 0, scale: 0.96 }, false)}
          animate={{ opacity: 1, scale: 1 }}
          transition={m.ease("reveal")}
        >
          <div className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-field)] bg-[#B8460C] font-display text-sm font-bold text-white">
                C
              </span>
              <span className="font-display text-sm font-bold">Your café</span>
            </div>

            <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
              Points earned
            </div>
            <div className="font-numeral text-[56px] leading-none text-[var(--primary)]">
              +10.5
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">on a Rs 105 bill</p>

            <div className="mt-5 rounded-[var(--radius-btn)] bg-[var(--surface-2)] p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
                Balance
              </div>
              <div className="font-numeral text-[28px] leading-none">240</div>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  { n: "Free coffee", p: "80" },
                  { n: "Slice of cake", p: "120" },
                ].map((r) => (
                  <div key={r.n} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--ink)]">{r.n}</span>
                    <span className="font-numeral text-lg leading-none text-[var(--primary)]">
                      {r.p}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { Hero } from "./landing/Hero";
```

Replace the whole `{/* HERO ... */}` `<section>` block with:

```tsx
      <Hero />
```

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Reload `/` in the browser preview. Confirm the hero renders with the new headline/copy, the phone-card mockup still looks identical to before, and the three stat chips fade/slide in on load (or instantly, if the OS's reduce-motion setting is on).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/Hero.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): extract Hero, tighten copy, add entrance motion"
```

---

## Task 5: `ProductPreview.tsx` — new section

**Files:**
- Create: `frontend/src/routes/platform/landing/ProductPreview.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (add `<ProductPreview />` right after `<Hero />`)

**Interfaces:**
- Consumes: `useMotion` from `../../../lib/motion`.
- Produces: `export function ProductPreview()` — no props.

- [ ] **Step 1: Write `ProductPreview.tsx`**

Three real-screen mockups in the same phone-card visual language the Hero already established (a bordered `--surface` card with `shadow-ambient`), not stock photography or samparka-style scattered decoration. Each is a simplified re-creation of an actual screen: the claim moment, an admin dashboard stat, and the redeem catalog.

```tsx
import { motion } from "motion/react";
import { useMotion } from "../../../lib/motion";

const PREVIEWS = [
  {
    label: "Customer scans",
    title: "Points land instantly",
    body: "+10.5",
    sub: "on a Rs 105 bill",
  },
  {
    label: "Staff dashboard",
    title: "See the week at a glance",
    body: "Rs 84,200",
    sub: "points issued this week",
  },
  {
    label: "Reward catalog",
    title: "Spend it back at the counter",
    body: "80 pts",
    sub: "Free coffee",
  },
];

export function ProductPreview() {
  const m = useMotion();

  return (
    <section className="border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex items-baseline gap-3">
          <span className="font-numeral text-sm text-[var(--primary)]">•</span>
          <h2 className="font-display text-2xl font-bold">Real screens, not a mockup</h2>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {PREVIEWS.map((p, i) => (
            <motion.div
              key={p.label}
              className="rounded-[28px] border border-[var(--line)] bg-[var(--bg)] p-6 shadow-ambient"
              initial={m.pick({ opacity: 0, y: 20 }, false)}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...m.ease("reveal"), delay: m.prefersReduced ? 0 : i * 0.1 }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--soft)]">
                {p.label}
              </div>
              <h3 className="mt-2 font-display text-base font-bold">{p.title}</h3>
              <div className="mt-4 font-numeral text-[32px] leading-none text-[var(--primary)]">
                {p.body}
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{p.sub}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { ProductPreview } from "./landing/ProductPreview";
```

Right after `<Hero />`, add:

```tsx
      <ProductPreview />
```

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Reload `/`. Confirm the new three-card section appears between the hero and "The whole loop," each card staggers in on scroll.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/ProductPreview.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): add ProductPreview section"
```

---

## Task 6: `HowItWorks.tsx` — extract "the whole loop"

**Files:**
- Create: `frontend/src/routes/platform/landing/HowItWorks.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (remove the `id="loop"` `<section>` — current lines 245–276 — render `<HowItWorks />` in its place; remove the now-unused `Lock` import if nothing else in the file uses it — check before removing, since it is only used inside this section today)

**Interfaces:**
- Consumes: `Lock` from `lucide-react`, `useMotion` from `../../../lib/motion`.
- Produces: `export function HowItWorks()` — no props.

- [ ] **Step 1: Write `HowItWorks.tsx`**

```tsx
import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { useMotion } from "../../../lib/motion";

const LOOP = [
  {
    n: "1",
    title: "Enter the bill",
    body: "Staff types what the customer paid. Points are a share of it — you set the percent.",
  },
  {
    n: "2",
    title: "Customer scans",
    body: "Their own phone camera opens the claim page. No app, no account hunting.",
  },
  {
    n: "3",
    title: "Points land",
    body: "Instantly, with a little celebration. Fractional too, so a Rs 105 bill at 10% is 10.5.",
  },
  {
    n: "4",
    title: "They spend it here",
    body: "On rewards you choose — and a real reason to walk back through your door.",
  },
];

export function HowItWorks() {
  const m = useMotion();

  return (
    <section id="loop" className="border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex items-baseline gap-3">
          <span className="font-numeral text-sm text-[var(--primary)]">01</span>
          <h2 className="font-display text-2xl font-bold">The whole loop</h2>
        </div>

        <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((s, i) => (
            <motion.li
              key={s.n}
              className="border-t border-[var(--line)] pt-4"
              initial={m.pick({ opacity: 0, y: 16 }, false)}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...m.ease("reveal"), delay: m.prefersReduced ? 0 : i * 0.08 }}
            >
              <span className="font-numeral text-2xl leading-none text-[var(--primary)]">
                {s.n}
              </span>
              <h3 className="mt-2 font-display text-base font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{s.body}</p>
            </motion.li>
          ))}
        </ol>

        <div className="mt-10 flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--primary-soft)] px-5 py-4">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--primary-deep)]" />
          <p className="text-sm text-[var(--primary-deep)]">
            <span className="font-bold">Points stay where they're earned.</span> Each outlet
            keeps its own balances — even between two branches of the same chain — so customers
            always know exactly where their points live.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { HowItWorks } from "./landing/HowItWorks";
```

Replace the `{/* THE LOOP */}` `<section id="loop">...</section>` block with:

```tsx
      <HowItWorks />
```

Remove the `Lock` entry from the `lucide-react` import list at the top of `PlatformLanding.tsx` (it is no longer used directly in this file — `HowItWorks.tsx` has its own import).

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Reload `/`, scroll to "The whole loop," confirm the four steps stagger-reveal as they enter the viewport, and the nav's "How it works" link still jumps here correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/HowItWorks.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): extract HowItWorks with scroll-reveal steps"
```

---

## Task 7: `ServicesGrid.tsx` — new bento-grid features section

**Files:**
- Create: `frontend/src/routes/platform/landing/ServicesGrid.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (remove the `id="features"` `<section>` — current lines 279–294 — render `<ServicesGrid />` in its place; remove the now-unused `Zap, Palette, BookOpen, Building2, ShieldCheck, Gift` icon imports and the `FEATURES` array from `PlatformLanding.tsx` since they move into this file)

**Interfaces:**
- Consumes: `Gift, Zap, Palette, BookOpen, Building2, ShieldCheck` from `lucide-react`, `useMotion` from `../../../lib/motion`.
- Produces: `export function ServicesGrid()` — no props.

Deliberately an asymmetric bento grid — one large lead card plus four smaller ones — not samparka's vertical numbered 01–05 list. Five real shipped features only.

- [ ] **Step 1: Write `ServicesGrid.tsx`**

```tsx
import { motion } from "motion/react";
import { Gift, Zap, Palette, Building2, ShieldCheck } from "lucide-react";
import { useMotion } from "../../../lib/motion";

const LEAD = {
  Icon: Gift,
  title: "Points as a share of the bill",
  body: "Set 5%, 10%, whatever fits your margins. Sensible defaults, overridable per outlet. Every earn and spend is a ledger row that never changes — balances always equal the history.",
};

const CARDS = [
  {
    Icon: Zap,
    title: "Double-point campaigns",
    body: "Run a 2× weekend or a quiet-Tuesday boost, on the days you pick, in Nepal time.",
  },
  {
    Icon: Palette,
    title: "Your brand, not ours",
    body: "Your logo and colour theme the customer experience.",
  },
  {
    Icon: Building2,
    title: "One chain, many outlets",
    body: "Run several branches from one login, each isolated, with a private group rollup.",
  },
  {
    Icon: ShieldCheck,
    title: "Staff-safe by design",
    body: "Earn codes are single-use and short-lived. Customers can never move their own balance.",
  },
];

export function ServicesGrid() {
  const m = useMotion();

  return (
    <section id="services" className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="flex items-baseline gap-3">
        <span className="font-numeral text-sm text-[var(--primary)]">02</span>
        <h2 className="font-display text-2xl font-bold">Built for the counter</h2>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3 lg:grid-rows-2">
        <motion.div
          className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-ambient lg:col-span-2 lg:row-span-2"
          initial={m.pick({ opacity: 0, y: 20 }, false)}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={m.ease("reveal")}
        >
          <LEAD.Icon className="h-6 w-6 text-[var(--primary-deep)]" strokeWidth={1.75} />
          <h3 className="mt-4 font-display text-xl font-bold">{LEAD.title}</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">{LEAD.body}</p>
        </motion.div>

        {CARDS.map((f, i) => (
          <motion.div
            key={f.title}
            className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient"
            initial={m.pick({ opacity: 0, y: 20 }, false)}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...m.ease("reveal"), delay: m.prefersReduced ? 0 : (i + 1) * 0.08 }}
          >
            <f.Icon className="h-5 w-5 text-[var(--primary-deep)]" strokeWidth={1.75} />
            <h3 className="mt-3 font-display text-base font-bold">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { ServicesGrid } from "./landing/ServicesGrid";
```

Replace the `{/* FEATURES */}` `<section id="features">...</section>` block with:

```tsx
      <ServicesGrid />
```

Remove `Zap, Palette, BookOpen, Building2, ShieldCheck, Gift` from the `lucide-react` import in `PlatformLanding.tsx`, and delete the now-unused `FEATURES` array.

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Reload `/`, scroll to "Built for the counter." Confirm the asymmetric grid (one large card spanning two columns/rows, four smaller cards) renders and staggers in — visibly different from a numbered vertical list.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/ServicesGrid.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): replace features list with asymmetric bento ServicesGrid"
```

---

## Task 8: `WhyStampd.tsx` — extract "made for Nepal"

**Files:**
- Create: `frontend/src/routes/platform/landing/WhyStampd.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (remove the `id="nepal"` `<section>` — current lines 297–337 — render `<WhyStampd />` in its place)

**Interfaces:**
- Consumes: `useMotion` from `../../../lib/motion`.
- Produces: `export function WhyStampd()` — no props.

- [ ] **Step 1: Write `WhyStampd.tsx`**

```tsx
import { motion } from "motion/react";
import { useMotion } from "../../../lib/motion";

const ROWS = [
  {
    k: "Rs",
    t: "Rupees, with decimals handled gracefully — 10.5 points stays 10.5, not rounded away.",
  },
  {
    k: "+5:45",
    t: "UTC+5:45 aware, so a Thursday campaign runs on Nepal's Thursday.",
  },
  {
    k: "PWA",
    t: "Add to home screen. The shell is cached; balances and claims are always live.",
  },
];

export function WhyStampd() {
  const m = useMotion();

  return (
    <section id="nepal" className="border-y border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1fr_1fr]">
        <motion.div
          initial={m.pick({ opacity: 0, y: 16 }, false)}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={m.ease("reveal")}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary-deep)]">
            Made for Nepal
          </span>
          <h2 className="mt-3 font-display text-[28px] font-bold leading-tight">
            Built for a mid-range Android on cafe Wi-Fi.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
            Rupees everywhere. Fast on slow networks and small screens. Campaigns judged in
            Nepal time, not a server's. It installs to the home screen like an app — because
            for your customers, it is one.
          </p>
        </motion.div>

        <div className="flex flex-col gap-4">
          {ROWS.map((r, i) => (
            <motion.div
              key={r.k}
              className="flex gap-4 border-t border-[var(--line)] pt-4"
              initial={m.pick({ opacity: 0, y: 16 }, false)}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...m.ease("reveal"), delay: m.prefersReduced ? 0 : i * 0.08 }}
            >
              <span className="w-16 flex-shrink-0 font-numeral text-lg leading-none text-[var(--primary)]">
                {r.k}
              </span>
              <span className="text-sm leading-relaxed text-[var(--muted)]">{r.t}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { WhyStampd } from "./landing/WhyStampd";
```

Replace the `{/* MADE FOR NEPAL */}` `<section id="nepal">...</section>` block with:

```tsx
      <WhyStampd />
```

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Reload `/`, scroll to "Made for Nepal," confirm both columns fade/slide in and the nav's "Made for Nepal" link still resolves (note: this link's label doesn't exist in `Nav.tsx`'s `LINKS` array from Task 3 — it was replaced with "For businesses"/"Services"/"Pricing"/"Questions"; the `#nepal` anchor itself still works by direct URL/id, just isn't in the nav bar anymore, which is expected since Task 3's nav list was deliberately updated for the new section set).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/WhyStampd.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): extract WhyStampd section with scroll-reveal"
```

---

## Task 9: `Pricing.tsx` — new, real-data pricing section

**Files:**
- Create: `frontend/src/routes/platform/landing/Pricing.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (add `<Pricing />` between `<WhyStampd />` and the FAQ section)

**Interfaces:**
- Consumes: `usePublicPlans`, `SubscriptionPlan` from `../../../hooks/usePublicPlans` (Task 2); `formatNpr` from `../../../lib/subscription`; `Button` from `@/components/ui/button`; `Check` from `lucide-react`; `useMotion` from `../../../lib/motion`.
- Produces: `export function Pricing()` — no props.

Informational only — CTAs are "Contact us" / "Start free trial", never a checkout, matching the real key-redemption model (no payment gateway exists in this codebase).

- [ ] **Step 1: Write `Pricing.tsx`**

```tsx
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Check } from "lucide-react";

import { usePublicPlans } from "../../../hooks/usePublicPlans";
import { formatNpr } from "../../../lib/subscription";
import { Button } from "@/components/ui/button";
import { useMotion } from "../../../lib/motion";

function periodLabel(billingIntervalDays: number): string {
  if (billingIntervalDays <= 31) return "/mo";
  if (billingIntervalDays <= 92) return "/quarter";
  return "/yr";
}

export function Pricing() {
  const m = useMotion();
  const { data: plans, isLoading } = usePublicPlans();

  return (
    <section id="pricing" className="border-t border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex items-baseline gap-3">
          <span className="font-numeral text-sm text-[var(--primary)]">03</span>
          <h2 className="font-display text-2xl font-bold">Plans that scale with your outlets</h2>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          No card on file, no self-checkout — we activate your plan with a key once payment's
          arranged directly with us.
        </p>

        {isLoading && (
          <div className="mt-8 text-sm text-[var(--muted)]">Loading plans…</div>
        )}

        {!isLoading && plans && plans.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p, i) => (
              <motion.div
                key={p.id}
                className="rounded-[var(--radius-card)] p-6"
                style={
                  p.isMostPopular
                    ? { background: "var(--primary)", color: "white" }
                    : { background: "var(--bg)", border: "1px solid var(--line)" }
                }
                initial={m.pick({ opacity: 0, y: 20 }, false)}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...m.ease("reveal"), delay: m.prefersReduced ? 0 : i * 0.08 }}
              >
                <div
                  className="inline-flex rounded-full px-3 py-1 text-xs font-bold"
                  style={
                    p.isMostPopular
                      ? { background: "rgba(255,255,255,0.16)", color: "white" }
                      : { background: "var(--line)", color: "var(--soft)" }
                  }
                >
                  {p.isMostPopular ? "Most popular" : p.name}
                </div>
                <div className="mt-4 font-numeral text-[32px] leading-none">
                  {formatNpr(p.priceNpr)}
                  <span
                    className={`ml-1 text-sm ${p.isMostPopular ? "text-white/70" : "text-[var(--muted)]"}`}
                  >
                    {periodLabel(p.billingIntervalDays)}
                  </span>
                </div>
                <p
                  className={`mt-1 text-sm ${p.isMostPopular ? "text-white/80" : "text-[var(--muted)]"}`}
                >
                  Up to {p.outletLimit} outlet{p.outletLimit === 1 ? "" : "s"}
                </p>
                <ul className="mt-5 flex flex-col gap-2">
                  {p.features.map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm">
                      <Check
                        className={`mt-0.5 h-4 w-4 flex-shrink-0 ${p.isMostPopular ? "text-white" : "text-[var(--ok,var(--primary))]"}`}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant={p.isMostPopular ? "secondary" : "outline"}
                  size="sm"
                  className="mt-6 w-full"
                >
                  <Link to="/admin-login">Start free trial</Link>
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { Pricing } from "./landing/Pricing";
```

Right after `<WhyStampd />` (and before the FAQ section), add:

```tsx
      <Pricing />
```

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Functional + visual verification**

Start the backend too (`MONGODB_URI="" npm run dev -w backend`) so `GET /api/platform/plans/public` is live and seeded (`ensureDefaultPlansSeeded` runs at boot). Reload `/` in the browser preview, scroll to the new Pricing section, confirm real seeded plan names/prices/outlet limits render (check `read_network_requests` for the `/api/platform/plans/public` call to confirm real data, not a fallback/empty state), and that every CTA reads "Start free trial" linking to `/admin-login` — never a checkout button.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/Pricing.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): add Pricing section backed by real public plans"
```

---

## Task 10: `Faq.tsx` — extract FAQ, add pricing/key questions

**Files:**
- Create: `frontend/src/routes/platform/landing/Faq.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (remove the `Faq` helper function — current lines 108–127 — the `FAQ` array — current lines 89–106 — the `useState` import if unused elsewhere in the file after this change, and the `id="faq"` `<section>` — current lines 340–347 — render `<Faq />` in its place)

**Interfaces:**
- Produces: `export function Faq()` — no props. (Note: this is the *section* component; the per-question toggle sub-component is now a private, unexported `FaqItem` inside this same file to avoid a naming collision with the exported section.)

- [ ] **Step 1: Write `Faq.tsx`**

```tsx
import { useState } from "react";
import { motion } from "motion/react";
import { Plus, Minus } from "lucide-react";
import { useMotion } from "../../../lib/motion";

const QUESTIONS = [
  {
    q: "Do my customers need to download an app?",
    a: "No. They scan with their phone's own camera and it opens in the browser. They can add it to their home screen if they want to, and then it behaves like an app.",
  },
  {
    q: "Can I choose my own rewards?",
    a: "Yes. Put a points price on any menu item, or create a standalone reward that isn't on the menu at all. You also set how much of a bill comes back as points.",
  },
  {
    q: "Do points work across my branches?",
    a: "Points are earned and spent at the same counter, on purpose — each outlet keeps its own balances, even between two branches of one chain. You still get a private rollup across all of them.",
  },
  {
    q: "Is there a payment gateway?",
    a: "No. Stampd is purely loyalty — we never touch your customers' money. Your own subscription is arranged with us directly and activated with a key.",
  },
  {
    q: "How does billing actually work?",
    a: "There's no self-checkout. We agree on a plan, arrange payment directly, and hand you a key — you redeem it from your company console and you're live.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes, whenever your outlet count changes. Talk to us and we'll issue a new key for the plan that fits.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--line)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-display text-base font-bold text-[var(--ink)]">{q}</span>
        {open ? (
          <Minus className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
        ) : (
          <Plus className="h-4 w-4 flex-shrink-0 text-[var(--soft)]" />
        )}
      </button>
      {open && <p className="-mt-1 pb-5 text-sm leading-relaxed text-[var(--muted)]">{a}</p>}
    </div>
  );
}

export function Faq() {
  const m = useMotion();

  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-6 py-16">
      <motion.h2
        className="font-display text-2xl font-bold"
        initial={m.pick({ opacity: 0, y: 12 }, false)}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={m.ease("reveal")}
      >
        Questions, answered
      </motion.h2>
      <div className="mt-6">
        {QUESTIONS.map((f) => (
          <FaqItem key={f.q} {...f} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { Faq } from "./landing/Faq";
```

Replace the `{/* FAQ */}` `<section id="faq">...</section>` block with:

```tsx
      <Faq />
```

Delete the `FAQ` array, the `Faq` helper function, and the `Plus, Minus` entries from the `lucide-react` import in `PlatformLanding.tsx`. Remove the `import { useState } from "react";` line at the top of `PlatformLanding.tsx` — after this task, nothing in `PlatformLanding.tsx` itself calls `useState` directly (verify by searching the file for `useState` before deleting the import).

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Reload `/`, scroll to "Questions, answered," confirm all six questions (four original + two new pricing/key ones) expand/collapse correctly, and the nav's "Questions" link still jumps here.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/Faq.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): extract Faq, add pricing/key questions"
```

---

## Task 11: `Footer.tsx` — extract closing CTA + footer nav

**Files:**
- Create: `frontend/src/routes/platform/landing/Footer.tsx`
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx` (remove the CLOSING `<section>` and the trailing `<footer>` — current lines 350–437 — render `<Footer />` in their place)

**Interfaces:**
- Consumes: `usePlatformContact` from `../../../hooks/usePlatformContact`, `PLATFORM_NAME` from `../../../lib/platform`, `StampdLogo` from `../../../components/shared/StampdLogo`, `Button` from `@/components/ui/button`, `Link` from `react-router-dom`, `ArrowRight, Phone, Mail, MapPin` from `lucide-react`.
- Produces: `export function Footer()` — no props. This is the last section rendered by `PlatformLanding.tsx`.

- [ ] **Step 1: Write `Footer.tsx`**

```tsx
import { Link } from "react-router-dom";
import { ArrowRight, Phone, Mail, MapPin } from "lucide-react";

import { PLATFORM_NAME } from "../../../lib/platform";
import { StampdLogo } from "../../../components/shared/StampdLogo";
import { usePlatformContact } from "../../../hooks/usePlatformContact";
import { Button } from "@/components/ui/button";

const FOOTER_LINKS = [
  { h: "Customers", l: "Customer login", to: "/customer-login" },
  { h: "Businesses", l: "Staff & owner login", to: "/admin-login" },
  { h: "Platform", l: "Platform admin", to: "/platform/login" },
];

export function Footer() {
  const { data: contact } = usePlatformContact();
  const hasContact = Boolean(contact && (contact.phone || contact.email || contact.address));

  return (
    <>
      <section className="border-t border-[var(--line)] bg-[var(--ink)] text-[#E9F0EC]">
        <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
          <h2 className="font-display text-[30px] font-bold leading-tight text-white">
            Give people a reason to choose you again.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[#8DA79A]">
            Set up your program in minutes. No hardware, no app store, no card on file.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/admin-login">Start your program</Link>
            </Button>
            {hasContact && (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/25 bg-transparent text-white hover:border-white hover:text-white"
              >
                <a href={contact?.email ? `mailto:${contact.email}` : `tel:${contact?.phone}`}>
                  Talk to us
                </a>
              </Button>
            )}
          </div>

          {hasContact && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#8DA79A]">
              {contact?.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-white">
                  <Phone className="h-3.5 w-3.5" /> {contact.phone}
                </a>
              )}
              {contact?.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-1.5 hover:text-white"
                >
                  <Mail className="h-3.5 w-3.5" /> {contact.email}
                </a>
              )}
              {contact?.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {contact.address}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <StampdLogo size={22} />
              <span className="font-display text-base font-bold">{PLATFORM_NAME}</span>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Points that work like money, for local business in Nepal.
            </p>
          </div>

          <div className="flex flex-wrap gap-10 text-sm">
            {FOOTER_LINKS.map((c) => (
              <div key={c.h}>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
                  {c.h}
                </div>
                <Link
                  to={c.to}
                  className="mt-1.5 inline-flex items-center gap-1 font-semibold text-[var(--ink)] hover:text-[var(--primary-deep)]"
                >
                  {c.l} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-10 border-t border-[var(--line)] pt-5 text-xs text-[var(--soft)]">
          © {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
        </p>
      </footer>
    </>
  );
}
```

- [ ] **Step 2: Wire it into `PlatformLanding.tsx`**

Add import:

```tsx
import { Footer } from "./landing/Footer";
```

Replace both the `{/* CLOSING */}` `<section>` and the trailing `<footer>` with:

```tsx
      <Footer />
```

- [ ] **Step 3: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors.

- [ ] **Step 4: Visual verification**

Reload `/`, scroll to the bottom, confirm the dark closing CTA and the footer nav both render exactly as before, contact info still shows conditionally.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/Footer.tsx frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "feat(landing): extract Footer (closing CTA + footer nav)"
```

---

## Task 12: Final cleanup of `PlatformLanding.tsx` + full verification pass

**Files:**
- Modify: `frontend/src/routes/platform/PlatformLanding.tsx`

By this task, `PlatformLanding.tsx` should be a thin composer. This task removes any leftover dead imports/comments and does the whole-page verification pass the spec requires.

- [ ] **Step 1: Confirm the final shape of `PlatformLanding.tsx`**

The file should now read, in full:

```tsx
import { Nav } from "./landing/Nav";
import { Hero } from "./landing/Hero";
import { ProductPreview } from "./landing/ProductPreview";
import { HowItWorks } from "./landing/HowItWorks";
import { ServicesGrid } from "./landing/ServicesGrid";
import { WhyStampd } from "./landing/WhyStampd";
import { Pricing } from "./landing/Pricing";
import { Faq } from "./landing/Faq";
import { Footer } from "./landing/Footer";

// The marketing site. Rebuilt around the actual loop rather than generic SaaS
// claims — see docs/superpowers/specs/2026-07-22-platform-landing-redesign-design.md
// for the full rationale. Every section here is its own file under ./landing/.
export default function PlatformLanding() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <Nav />
      <Hero />
      <ProductPreview />
      <HowItWorks />
      <ServicesGrid />
      <WhyStampd />
      <Pricing />
      <Faq />
      <Footer />
    </div>
  );
}
```

Diff the actual file against this and remove anything left over (stray imports, the old inline `<header>`/section JSX, unused arrays) that doesn't match.

- [ ] **Step 2: Type-check**

Run: `npm run lint -w frontend`
Expected: no errors — this is the strongest signal that no dead import or unused variable survived the extraction.

- [ ] **Step 3: Full build check**

Run: `npm run build -w frontend`
Expected: clean build, no errors.

- [ ] **Step 4: Full-page visual verification at two breakpoints**

In the browser preview: resize to 375px width, load `/`, scroll top to bottom — every section should read cleanly on a phone width (this is the mobile-first product; CLAUDE.md: "Mid-range Android is the baseline"). Resize to 1280px, repeat. Confirm the nav morph, every scroll-reveal, and the Pricing section's real data all still work at both sizes.

- [ ] **Step 5: Reduced-motion verification**

Force `prefers-reduced-motion: reduce` (macOS: System Settings → Accessibility → Display → Reduce motion; or emulate via the browser devtools' Rendering panel → "Emulate CSS media feature prefers-reduced-motion"). Reload `/`. Confirm: the nav renders directly in its pill-shaped resting state (no scroll-linked transform), and every section's content is immediately visible with no fade/slide delay — nothing stays invisible or half-transitioned.

- [ ] **Step 6: Confirm scope boundary**

Run: `git diff --stat main` (or against the branch's base) and confirm every changed file is one of: files under `frontend/src/routes/platform/landing/`, `frontend/src/routes/platform/PlatformLanding.tsx`, `frontend/src/hooks/usePublicPlans.ts`, `frontend/src/lib/motion.ts`. No backend file, no other route, no `index.css`/`fonts.css` change.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/platform/PlatformLanding.tsx
git commit -m "chore(landing): finish composing PlatformLanding from extracted sections"
```

---

## Self-Review Notes

- **Spec coverage:** every "Decisions locked" item in the design spec maps to a task — tokens unchanged (no task touches `index.css`/`fonts.css`), component split (Tasks 1–12), Nav morph (Task 3), bento ServicesGrid (Task 7), ProductPreview (Task 5), Pricing informational-only real data (Task 9), no testimonials (no task adds one), shared `reveal` motion vocabulary (Task 1, consumed by Tasks 4–11), copy tightened (Task 4).
- **Type consistency:** `SubscriptionPlan` interface (Task 2) field names (`priceNpr`, `outletLimit`, `isMostPopular`, `billingIntervalDays`, `features`) match exactly what Task 9's `Pricing.tsx` destructures, and match the backend's `formatPlan` output verified against `subscriptionPlanService.js`. `useMotion()`'s `m.ease`/`m.pick` signatures (Task 1, unchanged from the existing `lib/motion.ts`) are used identically across Tasks 4–11.
- **Scope check:** single subsystem (one route file + its extracted sections), independently shippable, matches the spec's stated scope exactly.

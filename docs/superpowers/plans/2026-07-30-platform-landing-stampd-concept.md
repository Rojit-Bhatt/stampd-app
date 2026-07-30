# Platform Landing Redesign (Stampd Concept 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the platform marketing landing page at `/` with concept frame 2b ("stack advance"), wired to real platform data, with samparka.co nav/footer chrome and four borrowed motion techniques.

**Architecture:** Three additive public read endpoints on `/api/platform` feed a rebuilt `routes/platform/landing/` section tree. The page is a dark, self-contained surface with its own tokens scoped under a `.landing-dark` class on `<html>` — the app's light editorial-ledger tokens are untouched. All motion goes through the existing `motion` package; no new dependency is added.

**Tech Stack:** Express + Mongoose (mock in dev/test) · React 19 + Vite + TypeScript + Tailwind v4 · TanStack Query · `motion` (Framer Motion's successor) · plain `node tests/*.js` suites.

**Spec:** `docs/superpowers/specs/2026-07-30-platform-landing-stampd-concept-design.md`

## Global Constraints

- **Backend layering is enforced:** `routes/ → controllers/ → services/ → models/`. Controllers parse the request, call a service, format the response. No business logic in controllers.
- **Mock DB query support is limited to top-level equality, `$or`, `$lte`, `$gte`.** Any other operator **throws**. No nested-path queries, no `findById`, no aggregation pipeline, no `updateMany`. Sums are JS `reduce` over fetched documents.
- **New test suites must be added to the `test` chain in `backend/package.json`** or they never run.
- **Centipoints never leave the backend.** Convert once on the way out via `toPoints()`.
- **`xlsx` is banned.** Not relevant here, but do not introduce it.
- **No new npm dependency.** `motion` is already installed and is the only animation library used. Do not add GSAP, Anime.js, or shadcn `card`.
- **Landing tokens are scoped under `.landing-dark`, never at `:root`.** The consoles stay light and must not inherit them.
- **Colour roles:** `--primary` green (`#0FA968`) means value and action. `--brand` means tenant identity. The landing has no tenant, so green here only ever marks value. `#C15D2C` appears on the logo mark only.
- **Every number on the page comes from an API.** `data.ts` holds copy only — no figures, no prices, no phone numbers.
- **Every motion must respect `prefers-reduced-motion`,** resolved through `useMotion()` from `frontend/src/lib/motion.ts` or `useReducedMotion()` directly. No component hand-rolls a spring.
- **Empty states render nothing, not a placeholder.** Stats below threshold, no plans, unset socials, unset phone — each hides its element.
- **Frontend has no test runner.** Frontend verification is `npm run lint` (tsc --noEmit) plus browser evidence via the preview tools. Backend verification is the `node tests/*.js` suites.
- **Branch:** all work lands on `landing/stampd-concept-2026`.

---

## File Structure

**Backend**

| File | Responsibility |
|---|---|
| `backend/services/platformAnalyticsService.js` *(modify)* | Add `getPublicStats()` — aggregate-only public figures |
| `backend/services/subscriptionPlanService.js` *(modify)* | Add `listPublicPlans()` — active plans, public fields only |
| `backend/controllers/platformController.js` *(modify)* | Add `getPublicStats`, `getPublicPlans` handlers |
| `backend/routes/platformRoutes.js` *(modify)* | Mount both, unauthenticated |
| `backend/config/platform.js` *(modify)* | Add `privacy`, `terms` to `RESERVED_SLUGS` |
| `backend/tests/public-landing-endpoints.js` *(create)* | Public-read suite |
| `backend/package.json` *(modify)* | Add suite to the `test` chain |

**Frontend**

| File | Responsibility |
|---|---|
| `frontend/src/index.css` *(modify)* | `.landing-dark` token block |
| `frontend/src/hooks/usePublicStats.ts` *(create)* | Hero stat query |
| `frontend/src/hooks/usePublicPlans.ts` *(create)* | Pricing query |
| `frontend/src/routes/platform/landing/data.ts` *(create)* | Copy only |
| `frontend/src/routes/platform/landing/primitives.tsx` *(create)* | `Eyebrow`, `SectionHead`, `CtaPill`, `StatValue` |
| `frontend/src/routes/platform/landing/motion/RollingLabel.tsx` *(create)* | Rolling text technique |
| `frontend/src/routes/platform/landing/motion/WordReveal.tsx` *(create)* | Scroll word reveal technique |
| `frontend/src/routes/platform/landing/motion/FooterReveal.tsx` *(create)* | Sticky under-page footer uncover |
| `frontend/src/routes/platform/landing/DotField.tsx` *(create)* | Canvas dot-repel hero background |
| `frontend/src/routes/platform/landing/LandingNav.tsx` *(create)* | Glass pill nav, hide-on-scroll |
| `frontend/src/routes/platform/landing/HeroStack.tsx` *(create)* | Pinned hero + four-card stack advance |
| `frontend/src/routes/platform/landing/SectionsFeatures.tsx` *(create)* | "What you get" + six blocks |
| `frontend/src/routes/platform/landing/SectionPricing.tsx` *(create)* | Plans from API |
| `frontend/src/routes/platform/landing/SectionFaq.tsx` *(create)* | Horizontal snap rail |
| `frontend/src/routes/platform/landing/SectionCta.tsx` *(create)* | Closing CTA |
| `frontend/src/routes/platform/landing/LandingFooter.tsx` *(create)* | Cream footer panel |
| `frontend/src/routes/platform/landing/WhatsAppFloat.tsx` *(create)* | Expanding cream pill |
| `frontend/src/routes/platform/legal/Privacy.tsx` *(create)* | Stub |
| `frontend/src/routes/platform/legal/Terms.tsx` *(create)* | Stub |
| `frontend/src/routes/platform/PlatformLanding.tsx` *(replace)* | Composition + `landing-dark` lifecycle |
| `frontend/src/App.tsx` *(modify)* | `/privacy`, `/terms` routes |

---

## Task 1: Public platform stats endpoint

**Files:**
- Modify: `backend/services/platformAnalyticsService.js`
- Modify: `backend/controllers/platformController.js`
- Modify: `backend/routes/platformRoutes.js`
- Create: `backend/tests/public-landing-endpoints.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `GET /api/platform/public-stats` → `{ success: true, stats: { visible: false } }` or `{ success: true, stats: { visible: true, outlets: number, pointsIssuedMonth: number, customers: number } }`. Service export `getPublicStats(): Promise<PublicStats>`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/public-landing-endpoints.js`:

```js
/**
 * Public landing-page reads (platform marketing site).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. These two endpoints are deliberately unauthenticated —
 * the landing page at `/` is public — so the thing worth testing is not that
 * they answer, but that they answer with aggregates ONLY. A tenant name,
 * slug or id leaking into the marketing page would break the same isolation
 * invariant the rest of the product is built on.
 *
 * Run directly: `node tests/public-landing-endpoints.js`
 */

const { bootServer } = require("./helpers/bootServer");

// Anything that would identify a specific tenant or customer. Asserted against
// the serialized response body, not against a field list, so a future field
// addition trips this rather than silently shipping.
const FORBIDDEN_KEYS = [
  "companyId", "organizationId", "outletId", "userId", "customerAccountId",
  "slug", "companySlug", "outletSlug", "email", "phone"
];

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5044 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { token } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, { headers }).then(async (r) => ({
      status: r.status,
      body: await r.json().catch(() => null)
    }));
  };

  try {
    const stats = await api("/api/platform/public-stats");
    check("GET public-stats without a token -> 200", stats.status === 200);
    check("public-stats returns a stats object", Boolean(stats.body?.stats));

    // The demo seed has 6 outlets across 3 companies, which is above the
    // 5-outlet visibility floor — so the seeded world must show figures.
    check("public-stats is visible on the seeded world", stats.body.stats.visible === true);
    check("public-stats reports outlets", typeof stats.body.stats.outlets === "number");
    check("public-stats reports customers", typeof stats.body.stats.customers === "number");
    check("public-stats reports monthly points", typeof stats.body.stats.pointsIssuedMonth === "number");

    // The seed has 3 CustomerAccounts. bikash belongs to outlets across three
    // DIFFERENT companies, so a count of User memberships would over-report.
    // Below 100 the floor is exact, so this asserts the distinct count.
    check("public-stats counts distinct accounts, not memberships", stats.body.stats.customers === 3);

    const statsBlob = JSON.stringify(stats.body);
    for (const key of FORBIDDEN_KEYS) {
      check(`public-stats leaks no ${key}`, !statsBlob.includes(key));
    }
    check("public-stats leaks no company name", !statsBlob.toLowerCase().includes("coffesarowar"));

    if (failures === 0) console.log("\nAll public landing endpoint checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node backend/tests/public-landing-endpoints.js
```

Expected: FAIL — `GET public-stats without a token -> 200` fails with status 404, because the route does not exist yet.

- [ ] **Step 3: Add `getPublicStats` to the analytics service**

In `backend/services/platformAnalyticsService.js`, add below the existing `getPlatformAnalytics` function (before `module.exports`):

```js
// Below this many outlets the landing page shows no figures at all. A
// pre-launch platform reporting "3 outlets" reads worse than reporting
// nothing, and there is no honest way to dress up a small number.
const PUBLIC_STATS_MIN_OUTLETS = 5;

// Round DOWN to two significant figures — 1,247 -> 1,200. Never rounds up:
// the page must not claim more than the platform has. Values under 100 pass
// through as whole numbers, since flooring them further would erase them.
const floorToTwoSigFigs = (n) => {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 100) return Math.floor(n);
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.floor(n / magnitude) * magnitude;
};

// Public, unauthenticated counterpart to getPlatformAnalytics — the three
// figures the marketing landing page shows. Same deliberate cross-tenant
// aggregation as the rest of this file, but with a much harder rule: the
// response is consumed by an anonymous visitor, so it carries counts and
// sums ONLY. No id, slug, name or per-tenant breakdown may appear here.
const getPublicStats = async () => {
  const outletsTotal = await Organization.countDocuments({});
  if (outletsTotal < PUBLIC_STATS_MIN_OUTLETS) return { visible: false };

  // Distinct people, not per-outlet memberships — the same reason
  // getPlatformAnalytics counts CustomerAccount rather than summing User.
  const customersTotal = await CustomerAccount.countDocuments({});

  // Query the window, filter the type in JS: the established pattern in this
  // file, and it keeps the query to a single top-level $gte the mock DB
  // actually supports.
  const since = new Date(Date.now() - 30 * DAY_MS);
  const txns = await PointsTransaction.find({ createdAt: { $gte: since } });
  const pointsCenti = txns
    .filter((t) => t.type === "earn")
    .reduce((sum, t) => sum + t.pointsCenti, 0);

  return {
    visible: true,
    outlets: floorToTwoSigFigs(outletsTotal),
    customers: floorToTwoSigFigs(customersTotal),
    pointsIssuedMonth: floorToTwoSigFigs(Math.round(toPoints(pointsCenti)))
  };
};
```

Then add `getPublicStats` to that file's `module.exports`.

- [ ] **Step 4: Add the controller**

In `backend/controllers/platformController.js`, import `getPublicStats` from the analytics service alongside the existing analytics imports, then add:

```js
// Public — the marketing landing page's hero figures. No auth by design;
// the service guarantees the payload is aggregate-only.
const getPublicStats = async (req, res, next) => {
  try {
    const stats = await getPublicStatsService();
    res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};
```

Import it aliased so it does not shadow the handler name:

```js
const { getPublicStats: getPublicStatsService } = require("../services/platformAnalyticsService");
```

(If the file already destructures from `platformAnalyticsService`, add the aliased entry to that existing destructure instead of a second `require`.)

Add `getPublicStats` to the controller's `module.exports`.

- [ ] **Step 5: Mount the route**

In `backend/routes/platformRoutes.js`, add `getPublicStats` to the destructured import from `platformController`, then add the route directly above the existing `public-contact` line:

```js
// Public marketing-site reads. Unauthenticated by design, and deliberately
// unthrottled: cheap aggregate reads with no auth surface and no write, same
// as public-contact. The rate limiters stay scoped to login/registration.
router.get("/public-stats", getPublicStats);
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
node backend/tests/public-landing-endpoints.js
```

Expected: PASS on every check, ending `All public landing endpoint checks passed.`

- [ ] **Step 7: Add the suite to the test chain**

In `backend/package.json`, append to the end of the `"test"` script value:

```
 && node tests/public-landing-endpoints.js
```

- [ ] **Step 8: Run the full backend suite**

```bash
npm test -w backend
```

Expected: every suite passes, including the new one. If `multi-tenant-isolation` fails, stop — the new endpoint has broken an invariant.

- [ ] **Step 9: Commit**

```bash
git add backend/services/platformAnalyticsService.js backend/controllers/platformController.js backend/routes/platformRoutes.js backend/tests/public-landing-endpoints.js backend/package.json
git commit -m "feat: add public platform stats endpoint for the landing page"
```

---

## Task 2: Public plans endpoint and reserved slugs

**Files:**
- Modify: `backend/services/subscriptionPlanService.js`
- Modify: `backend/controllers/platformController.js`
- Modify: `backend/routes/platformRoutes.js`
- Modify: `backend/config/platform.js`
- Modify: `backend/tests/public-landing-endpoints.js`

**Interfaces:**
- Consumes: the test file and route file from Task 1.
- Produces: `GET /api/platform/public-plans` → `{ success: true, plans: Array<{ slug, name, priceNpr, features, isMostPopular }> }`. Service export `listPublicPlans(): Promise<PublicPlan[]>`.

- [ ] **Step 1: Write the failing test**

In `backend/tests/public-landing-endpoints.js`, insert before the `if (failures === 0)` summary block:

```js
    const plans = await api("/api/platform/public-plans");
    check("GET public-plans without a token -> 200", plans.status === 200);
    check("public-plans returns an array", Array.isArray(plans.body?.plans));

    for (const plan of plans.body.plans) {
      check(`plan ${plan.slug} exposes a name`, typeof plan.name === "string");
      check(`plan ${plan.slug} exposes a price`, typeof plan.priceNpr === "number");
      check(`plan ${plan.slug} exposes features`, Array.isArray(plan.features));
      // outletLimit is a subscription-enforcement detail, not a marketing
      // fact. It must not ride along into an anonymous response.
      check(`plan ${plan.slug} hides outletLimit`, plan.outletLimit === undefined);
      check(`plan ${plan.slug} hides its id`, plan._id === undefined && plan.id === undefined);
    }

    const plansBlob = JSON.stringify(plans.body);
    check("public-plans hides outletLimit entirely", !plansBlob.includes("outletLimit"));
    check("public-plans hides billingIntervalDays", !plansBlob.includes("billingIntervalDays"));
    check("public-plans hides isActive", !plansBlob.includes("isActive"));
```

And add the reserved-slug assertions immediately after:

```js
    const { isReservedSlug } = require("../config/platform");
    check("privacy is a reserved slug", isReservedSlug("privacy"));
    check("terms is a reserved slug", isReservedSlug("terms"));
    check("reserved-slug check is case-insensitive", isReservedSlug("Privacy"));
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node backend/tests/public-landing-endpoints.js
```

Expected: FAIL on `GET public-plans without a token -> 200` (404, route missing) and on both reserved-slug checks.

- [ ] **Step 3: Add `listPublicPlans` to the plan service**

In `backend/services/subscriptionPlanService.js`, add before `module.exports`:

```js
// Public, unauthenticated projection of the plan catalogue for the marketing
// pricing section. Explicitly builds the response object field by field
// rather than filtering the document — a whitelist cannot leak a field added
// to the schema later, a blacklist can. outletLimit, billingIntervalDays and
// the internal id stay server-side.
const listPublicPlans = async () => {
  const plans = await SubscriptionPlan.find({ isActive: true });
  return plans
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((plan) => ({
      slug: plan.slug,
      name: plan.name,
      priceNpr: plan.priceNpr,
      features: plan.features || [],
      isMostPopular: Boolean(plan.isMostPopular)
    }));
};
```

Add `listPublicPlans` to that file's `module.exports`. If the file's model import is named differently from `SubscriptionPlan`, use the existing name.

- [ ] **Step 4: Add the controller and route**

In `backend/controllers/platformController.js`:

```js
// Public — the marketing pricing section. Wiring pricing to the real plan
// catalogue is what keeps the page from promising a tier that no
// subscription key actually grants.
const getPublicPlans = async (req, res, next) => {
  try {
    const plans = await listPublicPlans();
    res.status(200).json({ success: true, plans });
  } catch (error) {
    next(error);
  }
};
```

Import `listPublicPlans` from `../services/subscriptionPlanService`, and add `getPublicPlans` to `module.exports`.

In `backend/routes/platformRoutes.js`, add `getPublicPlans` to the destructured controller import and mount it beside `public-stats`:

```js
router.get("/public-plans", getPublicPlans);
```

- [ ] **Step 5: Reserve the legal-page slugs**

In `backend/config/platform.js`, extend `RESERVED_SLUGS`:

```js
const RESERVED_SLUGS = new Set([
  "api", "www", "app", "admin", "assets", "static", "public",
  "explore", "platform", "company", "owner",
  "admin-login", "business-login", "customer-login", "customer-register",
  "admin-verify-email", "admin-forgot-password", "admin-reset-password",
  "verify-email", "reset-password", "forgot-password",
  // Marketing-site legal pages. App.tsx matches these literal routes before
  // /:companySlug, so a company registered on either slug would become
  // permanently unreachable — exactly the collision this set exists to stop.
  "privacy", "terms"
]);
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
node backend/tests/public-landing-endpoints.js
```

Expected: PASS on every check.

- [ ] **Step 7: Run the full backend suite**

```bash
npm test -w backend
```

Expected: all suites pass.

- [ ] **Step 8: Commit**

```bash
git add backend/services/subscriptionPlanService.js backend/controllers/platformController.js backend/routes/platformRoutes.js backend/config/platform.js backend/tests/public-landing-endpoints.js
git commit -m "feat: add public plans endpoint and reserve privacy/terms slugs"
```

---

## Task 3: Landing tokens, hooks, copy and primitives

**Files:**
- Modify: `frontend/src/index.css`
- Create: `frontend/src/hooks/usePublicStats.ts`
- Create: `frontend/src/hooks/usePublicPlans.ts`
- Create: `frontend/src/routes/platform/landing/data.ts`
- Create: `frontend/src/routes/platform/landing/primitives.tsx`

**Interfaces:**
- Consumes: `GET /api/platform/public-stats` and `/public-plans` from Tasks 1–2.
- Produces:
  - `usePublicStats(): UseQueryResult<PublicStats>` where `PublicStats = { visible: false } | { visible: true; outlets: number; pointsIssuedMonth: number; customers: number }`
  - `usePublicPlans(): UseQueryResult<PublicPlan[]>` where `PublicPlan = { slug: string; name: string; priceNpr: number; features: string[]; isMostPopular: boolean }`
  - From `data.ts`: `NAV_LINKS`, `HERO`, `HERO_CARDS`, `STEPS`, `FEATURES`, `FAQ`, `CTA`, `FOOTER_LINKS`
  - From `primitives.tsx`: `Eyebrow`, `SectionHead`, `CtaPill`, `StatValue`

- [ ] **Step 1: Add the landing token block**

At the **end** of `frontend/src/index.css`, append:

```css
/* ---- Platform landing page — "Stampd concept 2b" ----

   A dark, self-contained marketing surface. These tokens are scoped to
   .landing-dark (added to <html> for the lifetime of the / route only) and
   MUST NOT be promoted to :root — every console in this app is light, and
   inheriting a dark ink token would wreck all of them.

   The concept's ambient radial glows are deliberately absent. Green appears
   as a solid fill only, and only where it means value or action; the
   terracotta belongs to the logo mark alone. */
.landing-dark {
  --lp-bg: #14201C;
  --lp-panel: #1D2F28;
  --lp-ink: #F3ECE2;
  --lp-muted: rgba(243, 236, 226, 0.62);
  --lp-line: rgba(243, 236, 226, 0.12);
  --lp-green: #0FA968;
  --lp-terra: #C15D2C;
  --lp-cream: #F3ECE2;
  background-color: var(--lp-bg);
}

/* The quiet grid that sits under every section BELOW the hero. The hero has
   the interactive dot field instead — the two must never stack. */
.lp-grid {
  background-image:
    linear-gradient(rgba(243, 236, 226, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(243, 236, 226, 0.03) 1px, transparent 1px);
  background-size: 64px 64px;
}

/* Horizontal snap rail (FAQ). The scrollbar is hidden because the rail has
   explicit Prev/Next controls; vertical page scroll is never intercepted. */
.lp-rail {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.lp-rail::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 2: Create the stats hook**

Create `frontend/src/hooks/usePublicStats.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../lib/api";

/**
 * The landing page's hero figures.
 *
 * `visible: false` is not an error state — it is the backend saying the
 * platform is below the threshold where showing figures helps. The consumer
 * renders nothing in that case rather than a zero or a placeholder.
 */
export type PublicStats =
  | { visible: false }
  | { visible: true; outlets: number; pointsIssuedMonth: number; customers: number };

export function usePublicStats() {
  return useQuery<PublicStats>({
    queryKey: ["publicStats"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; stats: PublicStats }>(
        "/api/platform/public-stats",
      );
      return res.stats;
    },
    staleTime: 1000 * 60 * 5,
  });
}
```

- [ ] **Step 3: Create the plans hook**

Create `frontend/src/hooks/usePublicPlans.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../lib/api";

export interface PublicPlan {
  slug: string;
  name: string;
  priceNpr: number;
  features: string[];
  isMostPopular: boolean;
}

/**
 * The marketing pricing section reads the real plan catalogue, so the prices
 * on the landing page can never drift from what a redeemed subscription key
 * actually grants.
 */
export function usePublicPlans() {
  return useQuery<PublicPlan[]>({
    queryKey: ["publicPlans"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; plans: PublicPlan[] }>(
        "/api/platform/public-plans",
      );
      return res.plans;
    },
    staleTime: 1000 * 60 * 5,
  });
}
```

- [ ] **Step 4: Create the copy file**

Create `frontend/src/routes/platform/landing/data.ts`:

```ts
// Landing page copy. COPY ONLY — no figures, no prices, no phone numbers.
// Everything numeric on this page comes from an API, which is what keeps the
// marketing site honest as the product changes.
//
// Three answers from the source concept were corrected or removed here
// because they described things Stampd does not do: offline scan queueing
// (the service worker never caches /api — loyalty actions are online), a
// stamps model (the product is points-only), and self-serve signup (a
// company is registered by the platform owner, so every CTA is "Talk to us").

export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "Rewards", href: "#rewards" },
  { label: "Campaigns", href: "#campaigns" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

export const HERO = {
  eyebrow: "LOYALTY FOR NEPALI BUSINESSES",
  headline: ["Points that", "bring them back."],
  primaryCta: "Talk to us",
  secondaryCta: "See how it works",
  statLabels: {
    outlets: "OUTLETS",
    pointsIssuedMonth: "POINTS / MO",
    customers: "CUSTOMERS",
  },
} as const;

// One card per step of the loop. `subline` replaces the hero sub-paragraph as
// each card advances, so the copy and the card always describe the same
// moment.
export const HERO_CARDS = [
  {
    id: "earn",
    step: "EARN",
    subline: "Every visit adds points. No cards, no punches.",
    kicker: "POINTS BALANCE",
    tag: "YOUR CARD",
    headline: "1,240 pts",
    detail: "260 pts to your next reward",
  },
  {
    id: "engage",
    step: "ENGAGE",
    subline: "Launch a campaign and it lands on their phone.",
    kicker: "CAMPAIGN · LIVE",
    tag: "FRI–SUN",
    headline: "Double points weekend",
    detail: "Sent to 1,280 customers · 41% opened",
  },
  {
    id: "reward",
    step: "REWARD",
    subline: "You decide what points are worth.",
    kicker: "REWARD CATALOGUE",
    tag: "ACTIVE",
    headline: "Free flat white",
    detail: "500 pts · redeemed 214 times",
  },
  {
    id: "redeem",
    step: "REDEEM",
    subline: "One tap at the counter and it is done.",
    kicker: "REDEEMED",
    tag: "2 MIN AGO",
    headline: "− 500 pts",
    detail: "Himalayan Brew · balance now 740 pts",
  },
] as const;

export const FEATURES = {
  eyebrow: "WHAT YOU GET",
  // Revealed word by word as the section passes the viewport.
  statement:
    "Everything the counter needs. Nothing it does not. One programme for points, campaigns, rewards and redemption — run from a phone.",
  blocks: [
    {
      id: "product",
      kicker: "POINTS ENGINE",
      title: "Points, on your terms",
      body: "Set what a rupee earns and what a reward costs. Change it whenever you like, for one outlet or all of them.",
    },
    {
      id: "campaigns",
      kicker: "CAMPAIGNS",
      title: "Reach them without a poster",
      body: "Double points on a slow Tuesday. A win-back for anyone who has not been in a month.",
    },
    {
      id: "rewards",
      kicker: "REWARDS",
      title: "You set what points buy",
      body: "A free coffee, a discount, a birthday gift.",
    },
    {
      id: "redeem",
      kicker: "REDEEM",
      title: "One tap at the counter",
      body: "Scan, points come off, done.",
    },
    {
      id: "insights",
      kicker: "INSIGHTS",
      title: "Know your regulars by name",
      body: "Visits, repeat rate and what each reward actually costs you — on one screen.",
    },
    {
      id: "multi-outlet",
      kicker: "MULTI-OUTLET",
      title: "One programme, every branch",
      body: "Give each outlet its own rules, or run the same programme across all of them.",
    },
  ],
} as const;

export const PRICING = {
  eyebrow: "PRICING",
  title: "Priced for a tea shop, not a chain of hotels.",
  cta: "Talk to us",
} as const;

export const FAQ = {
  eyebrow: "QUESTIONS",
  title: "The things shop owners ask first.",
  subtitle: "Still unsure about something? Ask us — we answer in Nepali or English.",
  items: [
    {
      q: "Do my customers need to download an app?",
      a: "No. They open a link and their card is there. If they want it on their home screen it installs straight from the browser — no store, no download.",
    },
    {
      q: "How long does setup take?",
      a: "Most shops are live the same day. Set your earn rate, add one reward, print the QR for the counter.",
    },
    {
      q: "Does it need internet at the counter?",
      a: "Yes. Balances and rewards are always read live, so a point is never awarded twice or spent twice. The scan itself is instant.",
    },
    {
      q: "Can I see who gave away points?",
      a: "Every earn and every redemption is written to a ledger that is only ever added to, never edited. A correction is a new line, so the history always adds up.",
    },
  ],
} as const;

export const CTA = {
  eyebrow: "GET STARTED",
  title: "Your regulars are already coming in. Give them a reason to come back.",
  primary: "Talk to us",
  secondary: "See pricing",
  footnote: "We set your outlet up with you — usually the same day.",
} as const;

export const FOOTER_LINKS = NAV_LINKS;
```

- [ ] **Step 5: Create the primitives**

Create `frontend/src/routes/platform/landing/primitives.tsx`:

```tsx
import type { ReactNode } from "react";

import { useCountUp } from "../../../hooks/useCountUp";

/** Small letterspaced label. The one place the landing page uses solid green. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--lp-green)]">
      {children}
    </p>
  );
}

export function SectionHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 font-display text-3xl leading-[1.1] text-[var(--lp-ink)] sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-base text-[var(--lp-muted)]">{subtitle}</p>
      ) : null}
    </div>
  );
}

/**
 * The page's button geometry, borrowed from samparka.co's nav CTA:
 * rounded-[74px] with a scale-on-hover. `tone` picks which of the two
 * treatments applies — cream is the primary action, outline is secondary.
 */
export function CtaPill({
  href,
  tone = "cream",
  className = "",
  children,
}: {
  href: string;
  tone?: "cream" | "outline";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    cream: "bg-[var(--lp-cream)] text-[#14201C] hover:scale-105",
    outline:
      "border border-[var(--lp-line)] text-[var(--lp-ink)] hover:border-[var(--lp-ink)]/40 hover:scale-105",
  };
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-[74px] px-6 py-3 text-sm font-medium transition-transform duration-200 motion-reduce:transition-none motion-reduce:hover:scale-100 ${tones[tone]} ${className}`}
    >
      {children}
    </a>
  );
}

/**
 * A hero figure. Numerals use the serif numeral face, as they do everywhere
 * else in this product — a figure should read like money in a passbook.
 * Counts up once on mount; under reduced motion `useCountUp` returns the
 * final value immediately, because the number is information first.
 */
export function StatValue({ value, label }: { value: number; label: string }) {
  const animated = useCountUp(value);
  return (
    <div>
      <p className="font-numeral text-3xl text-[var(--lp-ink)] sm:text-4xl">
        {Math.round(animated).toLocaleString()}
      </p>
      <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-[var(--lp-muted)]">
        {label}
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

```bash
npm run lint
```

Expected: PASS, no errors. (`data.ts` and the hooks are not yet imported anywhere — that is fine, they compile standalone.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/index.css frontend/src/hooks/usePublicStats.ts frontend/src/hooks/usePublicPlans.ts frontend/src/routes/platform/landing/data.ts frontend/src/routes/platform/landing/primitives.tsx
git commit -m "feat: add landing tokens, public data hooks, copy and primitives"
```

---

## Task 4: The three borrowed motion techniques

**Files:**
- Create: `frontend/src/routes/platform/landing/motion/RollingLabel.tsx`
- Create: `frontend/src/routes/platform/landing/motion/WordReveal.tsx`
- Create: `frontend/src/routes/platform/landing/motion/FooterReveal.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `<RollingLabel>{string}</RollingLabel>` — wraps a label; the parent element owns hover/focus and passes `active`.
  - `<WordReveal text={string} className?={string} />`
  - `<FooterReveal>{ReactNode}</FooterReveal>`

- [ ] **Step 1: Create `RollingLabel`**

Create `frontend/src/routes/platform/landing/motion/RollingLabel.tsx`:

```tsx
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";

// Technique from motion.dev's "rolling text button" example. Two identical
// copies of the label sit in an overflow-hidden window: on activation the
// outgoing copy translates down and out while the incoming copy translates
// down into its place, so the label reads as a cylinder turning.
const outgoingVariants = {
  rest: { y: "0%" },
  active: { y: "100%" },
};

const incomingVariants = {
  rest: { y: "-100%" },
  active: { y: "0%" },
};

const transition = { duration: 0.3, ease: [0.338, 0.015, 0.395, 0.959] as const };

/**
 * Tracks hover and focus as SEPARATE signals and queues the latest intent
 * while a roll is mid-flight.
 *
 * Both halves matter. Without the queue, a fast hover-out during the 300ms
 * roll leaves the label stranded mid-window. Without separate hover/focus
 * refs, tabbing away while the pointer is still over the button would
 * incorrectly roll the label back.
 */
export function useRollingState() {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const animating = useRef(false);
  const pending = useRef<boolean | null>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const reduceMotion = useReducedMotion();

  const request = useCallback(
    (next: boolean) => {
      if (reduceMotion) return;
      if (next === activeRef.current) {
        pending.current = null;
        return;
      }
      if (animating.current) {
        pending.current = next;
        return;
      }
      animating.current = true;
      activeRef.current = next;
      setActive(next);
    },
    [reduceMotion],
  );

  const onAnimationComplete = useCallback(() => {
    if (!animating.current) return;
    animating.current = false;
    if (pending.current !== null && pending.current !== activeRef.current) {
      const next = pending.current;
      pending.current = null;
      animating.current = true;
      activeRef.current = next;
      setActive(next);
    } else {
      pending.current = null;
    }
  }, []);

  return {
    active,
    onAnimationComplete,
    handlers: {
      onMouseEnter: () => {
        hovered.current = true;
        request(true);
      },
      onMouseLeave: () => {
        hovered.current = false;
        request(focused.current);
      },
      onFocus: () => {
        focused.current = true;
        request(true);
      },
      onBlur: () => {
        focused.current = false;
        request(hovered.current);
      },
    },
  };
}

export function RollingLabel({
  children,
  active,
  onAnimationComplete,
}: {
  children: string;
  active: boolean;
  onAnimationComplete: () => void;
}) {
  return (
    <span className="relative block w-max overflow-hidden" aria-hidden="true">
      <motion.span
        className="block whitespace-nowrap"
        variants={outgoingVariants}
        initial="rest"
        animate={active ? "active" : "rest"}
        transition={transition}
        onAnimationComplete={onAnimationComplete}
      >
        {children}
      </motion.span>
      <motion.span
        className="absolute inset-0 block whitespace-nowrap"
        variants={incomingVariants}
        initial="rest"
        animate={active ? "active" : "rest"}
        transition={transition}
      >
        {children}
      </motion.span>
    </span>
  );
}
```

- [ ] **Step 2: Create `WordReveal`**

Create `frontend/src/routes/platform/landing/motion/WordReveal.tsx`:

```tsx
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { Fragment, useRef } from "react";

// Technique from motion.dev's "text scroll word reveal" example: each word
// owns a slice of the section's scroll progress and fades from dim to solid
// across it. Slices overlap (SPREAD < 1 while WORD_DURATION stays wide), so
// the reveal cascades rather than ticking word by word.
const START_OPACITY = 0.15;
const SPREAD = 0.8;
const WORD_DURATION = 0.2;

function wordRange(index: number, count: number) {
  const start = count <= 1 ? 0 : (index / (count - 1)) * SPREAD;
  return { start, end: Math.min(1, start + WORD_DURATION) };
}

function Word({
  children,
  progress,
  index,
  count,
  still,
}: {
  children: string;
  progress: MotionValue<number>;
  index: number;
  count: number;
  still: boolean;
}) {
  const { start, end } = wordRange(index, count);
  const opacity = useTransform(progress, (latest) => {
    if (latest <= start) return START_OPACITY;
    if (latest >= end) return 1;
    return START_OPACITY + (1 - START_OPACITY) * ((latest - start) / (end - start));
  });

  // Word spans are hidden from assistive tech; the heading carries the whole
  // statement as its label, so it is announced as one sentence rather than a
  // list of words.
  return (
    <motion.span aria-hidden="true" style={still ? undefined : { opacity }}>
      {children}
    </motion.span>
  );
}

/**
 * Deviation from the source example, deliberately: the example pins a tall
 * sticky stage (offset start-start -> end-end). This page already pins the
 * hero and reveals the footer on scroll, so a third pinned stage would add a
 * viewport of scroll and risk fighting the hero's pin boundaries. Here the
 * reveal is pass-through — the words light as the section crosses the
 * viewport, with no pin and no added page height.
 */
export function WordReveal({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const words = text.split(" ");

  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <Word
            progress={scrollYProgress}
            index={index}
            count={words.length}
            still={Boolean(reduced)}
          >
            {word}
          </Word>
          {index < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </p>
  );
}
```

- [ ] **Step 3: Create `FooterReveal`**

Create `frontend/src/routes/platform/landing/motion/FooterReveal.tsx`:

```tsx
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Sticky under-page footer, reimplemented from motion.dev's documented
 * "footer reveal" technique (the example's source is behind Motion+).
 *
 * The footer is fixed at the bottom of the viewport BEHIND the page content;
 * a spacer of equal height at the end of the document reserves its space, so
 * scrolling to the end slides the (opaque) page content off it and uncovers
 * it. `useScroll` over that spacer drives the opacity fade.
 *
 * This only works because the page background is fully opaque — see the
 * .landing-dark background-color rule in index.css.
 */
export function FooterReveal({ children }: { children: ReactNode }) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);

  // The spacer must exactly match the footer's rendered height, and that
  // height depends on viewport width (the link row wraps). Measured rather
  // than assumed, and re-measured on resize.
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({
    target: spacerRef,
    offset: ["start end", "end end"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.6], [0, 1]);

  if (reduced) {
    // No sticky behaviour, no fade: an ordinary block at the end of the page.
    return <div ref={footerRef}>{children}</div>;
  }

  return (
    <>
      <div ref={spacerRef} style={{ height }} aria-hidden="true" />
      <motion.div
        ref={footerRef}
        style={{ opacity }}
        className="fixed inset-x-0 bottom-0 -z-10"
      >
        {children}
      </motion.div>
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/landing/motion/
git commit -m "feat: add rolling text, word reveal and footer reveal motion techniques"
```

---

## Task 5: Canvas dot-repel hero background

**Files:**
- Create: `frontend/src/routes/platform/landing/DotField.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `<DotField className?={string} />` — an absolutely-positioned canvas that fills its nearest positioned ancestor.

- [ ] **Step 1: Create `DotField`**

Create `frontend/src/routes/platform/landing/DotField.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Interactive dot field — the hero background.
 *
 * Ports the behaviour of kokonutui's `mouse-effect-card`
 * (https://kokonutui.com/docs/cards/mouse-effect-card, MIT, @dorianbaffier)
 * but draws to a single <canvas> from one rAF loop instead of rendering each
 * dot as a motion component.
 *
 * That change is the whole point. The original gives every dot three
 * useTransforms, three useSprings and an infinite opacity tween — fine at its
 * native card size (~400 dots), but this is a full-bleed hero: at 1280x800
 * with 16px spacing it would be ~4,000 dots and ~12,000 concurrent springs.
 * The people this product is sold to are running it on mid-range Android
 * phones. One loop over a flat array holds frame rate; 4,000 components does
 * not.
 *
 * Behaviour preserved from the original: centre-weighted random cull so
 * density falls toward the edges, repulsion force (1 - d/r) * strength along
 * the cursor vector, eased return to base, a proximity opacity boost inside
 * radius * 1.2, and a slow per-dot twinkle phase-offset by index.
 */

const SPACING = 22;
const DOT_RADIUS = 1.1;
const REPULSION_RADIUS = 120;
const REPULSION_STRENGTH = 26;
const RETURN = 0.12; // spring pull toward base
const FRICTION = 0.82; // damping, so dots settle rather than oscillate
const PROXIMITY_MULTIPLIER = 1.2;
const PROXIMITY_OPACITY_BOOST = 0.8;
const BASE_OPACITIES = [0.18, 0.3, 0.42];

interface Dot {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  phase: number;
}

function generateDots(width: number, height: number): Dot[] {
  const dots: Dot[] = [];
  const cols = Math.ceil(width / SPACING);
  const rows = Math.ceil(height / SPACING);
  const cx = width / 2;
  const cy = height / 2;
  const maxDistance = Math.sqrt(cx * cx + cy * cy);

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = col * SPACING;
      const y = row * SPACING;
      const dx = x - cx;
      const dy = y - cy;
      const edgeFactor = Math.min(Math.sqrt(dx * dx + dy * dy) / (maxDistance * 0.7), 1);
      // Same cull as the original: denser at the centre, thinning outward.
      if (Math.random() > edgeFactor) continue;

      dots.push({
        baseX: x,
        baseY: y,
        x,
        y,
        vx: 0,
        vy: 0,
        opacity: BASE_OPACITIES[(row + col) % 3] * edgeFactor,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  return dots;
}

export function DotField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let frame: number | null = null;
    let running = false;
    const pointer = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      // Cap at 2: a 3x phone display would triple the fill cost for no
      // visible gain on 2px dots.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = generateDots(width, height);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const px = pointer.x;
      const py = pointer.y;
      const proximityRadius = REPULSION_RADIUS * PROXIMITY_MULTIPLIER;

      for (const dot of dots) {
        const dx = dot.baseX - px;
        const dy = dot.baseY - py;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let targetX = dot.baseX;
        let targetY = dot.baseY;
        let boost = 0;

        if (distance < REPULSION_RADIUS) {
          const force = (1 - distance / REPULSION_RADIUS) * REPULSION_STRENGTH;
          const angle = Math.atan2(dy, dx);
          targetX += Math.cos(angle) * force;
          targetY += Math.sin(angle) * force;
        }
        if (distance < proximityRadius) {
          boost = (1 - distance / proximityRadius) * PROXIMITY_OPACITY_BOOST;
        }

        // Damped spring toward the target, integrated per frame — the felt
        // weight of the original's useSpring without the per-dot machinery.
        dot.vx = (dot.vx + (targetX - dot.x) * RETURN) * FRICTION;
        dot.vy = (dot.vy + (targetY - dot.y) * RETURN) * FRICTION;
        dot.x += dot.vx;
        dot.y += dot.vy;

        // Slow twinkle, phase-offset per dot so nothing pulses in sync.
        const twinkle = 0.8 + 0.2 * Math.sin(time / 1400 + dot.phase);
        const alpha = Math.min(dot.opacity * twinkle + boost, 1);

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    ctx.fillStyle = "#F3ECE2";
    resize();

    if (reduced) {
      // Render the field once and never animate it. Still a texture, no motion.
      draw(0);
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onPointerLeave = () => {
      pointer.x = Number.POSITIVE_INFINITY;
      pointer.y = Number.POSITIVE_INFINITY;
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      ctx.fillStyle = "#F3ECE2";
    });
    resizeObserver.observe(canvas);

    // Do not burn frames on a field nobody can see.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0 },
    );
    io.observe(canvas);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      stop();
      io.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/platform/landing/DotField.tsx
git commit -m "feat: add canvas dot-repel hero background"
```

---

## Task 6: Landing nav

**Files:**
- Create: `frontend/src/routes/platform/landing/LandingNav.tsx`

**Interfaces:**
- Consumes: `NAV_LINKS` from `data.ts` (Task 3); `RollingLabel` + `useRollingState` from Task 4.
- Produces: `<LandingNav contactHref={string} />`

- [ ] **Step 1: Create `LandingNav`**

Create `frontend/src/routes/platform/landing/LandingNav.tsx`:

```tsx
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import StampdLogo from "../../../components/shared/StampdLogo";
import { NAV_LINKS } from "./data";
import { RollingLabel, useRollingState } from "./motion/RollingLabel";

/**
 * Nav chrome copied from samparka.co: a centred glass pill that hides on
 * scroll-down and slides back on scroll-up.
 *
 * One deliberate deviation. samparka fills the pill with white at 15% over a
 * light page; over #14201C that same value is an opaque grey slab, so this
 * uses 6% — the value that actually reads as glass on a dark surface. Its CTA
 * is likewise inverted: samparka's dark gradient pill would be invisible here,
 * so the primary action is cream with dark ink.
 */
export function LandingNav({ contactHref }: { contactHref: string }) {
  const [hidden, setHidden] = useState(false);
  const reduced = useReducedMotion();
  const rolling = useRollingState();

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // The 8px deadband stops the nav flickering when the hero's sticky pin
      // produces tiny scroll deltas at its boundaries.
      if (Math.abs(y - lastY) < 8) return;
      setHidden(y > lastY && y > 120);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 flex w-full justify-center transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none ${
        hidden && !reduced ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <nav
        className="mx-4 mt-4 w-full max-w-6xl rounded-[20px] border border-white/15 bg-white/[0.06] px-6 py-3 backdrop-blur-[25px] md:mx-6 md:px-8 md:py-4"
        style={{
          boxShadow:
            "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(243,236,226,0.14)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <a href="/" className="flex flex-shrink-0 items-center gap-2">
            <StampdLogo className="h-8 w-8" />
            <span className="font-display text-lg text-[var(--lp-ink)]">Stampd</span>
          </a>

          <ul className="hidden flex-1 items-center justify-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="group relative block px-3 py-1.5 text-sm text-[var(--lp-muted)] transition-colors duration-300 hover:text-[var(--lp-ink)]"
                >
                  {link.label}
                  {/* samparka's glass chip, fading in behind the label. */}
                  <span className="absolute inset-0 -z-10 scale-90 rounded-2xl border border-white/10 bg-white/[0.06] opacity-0 backdrop-blur-[15px] transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none" />
                </a>
              </li>
            ))}
          </ul>

          <motion.a
            href={contactHref}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-[74px] bg-[var(--lp-cream)] px-5 py-2.5 text-sm font-medium text-[#14201C] transition-transform duration-200 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
            {...rolling.handlers}
          >
            <RollingLabel
              active={rolling.active}
              onAnimationComplete={rolling.onAnimationComplete}
            >
              Talk to us
            </RollingLabel>
            {/* The label is aria-hidden inside RollingLabel (it is duplicated),
                so the accessible name lives here. */}
            <span className="sr-only">Talk to us</span>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M6 3l5 5-5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.a>
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Verify the logo import matches the real export**

```bash
grep -n "export" frontend/src/components/shared/StampdLogo.tsx
```

If `StampdLogo` is a **named** export, change the import to `import { StampdLogo } from "../../../components/shared/StampdLogo";`. If it takes a `size` prop rather than `className`, adjust the call accordingly. Do not guess — read the file.

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/platform/landing/LandingNav.tsx
git commit -m "feat: add landing nav with hide-on-scroll and rolling CTA"
```

---

## Task 7: Hero with stack advance

**Files:**
- Create: `frontend/src/routes/platform/landing/HeroStack.tsx`

**Interfaces:**
- Consumes: `HERO`, `HERO_CARDS` from `data.ts`; `DotField` (Task 5); `Eyebrow`, `CtaPill`, `StatValue` from `primitives.tsx`; `usePublicStats` (Task 3).
- Produces: `<HeroStack contactHref={string} />`

- [ ] **Step 1: Create `HeroStack`**

Create `frontend/src/routes/platform/landing/HeroStack.tsx`:

```tsx
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { useRef } from "react";

import { usePublicStats } from "../../../hooks/usePublicStats";
import { DotField } from "./DotField";
import { HERO, HERO_CARDS } from "./data";
import { CtaPill, Eyebrow, StatValue } from "./primitives";

const CARD_COUNT = HERO_CARDS.length;

/**
 * One card of the stack.
 *
 * "Stack advance": the front card lifts up and away while the next rises
 * forward through the pile. All four stay on screen, so the sequence reads as
 * one pipeline rather than four unrelated slides.
 *
 * Each card owns a slot index; scroll progress is mapped to a continuous
 * "position in the stack" (0 = front, higher = further back), and every
 * visual property is derived from that one number.
 */
function StackCard({
  card,
  index,
  progress,
}: {
  card: (typeof HERO_CARDS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  // progress 0..1 maps to an advance of 0..CARD_COUNT-1 steps.
  const position = useTransform(progress, (p) => index - p * (CARD_COUNT - 1));

  // Behind the front card: settle back and shrink. In front of it (position
  // < 0, i.e. already advanced past): lift up and fade out.
  const y = useTransform(position, (pos) =>
    pos < 0 ? pos * 120 : Math.min(pos, 3) * 18,
  );
  const scale = useTransform(position, (pos) =>
    pos < 0 ? 1 + pos * 0.06 : 1 - Math.min(pos, 3) * 0.05,
  );
  const opacity = useTransform(position, (pos) => (pos < -1 ? 0 : pos < 0 ? 1 + pos : 1));
  const rotateX = useTransform(position, (pos) => (pos < 0 ? pos * 14 : 0));
  const zIndex = useTransform(position, (pos) => Math.round(100 - pos * 10));

  return (
    <motion.div
      style={{ y, scale, opacity, rotateX, zIndex }}
      className="absolute inset-x-0 top-0 origin-top rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-6"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
          {card.kicker}
        </p>
        <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-muted)]">
          {card.tag}
        </p>
      </div>
      <p className="mt-6 font-numeral text-4xl text-[var(--lp-ink)]">{card.headline}</p>
      <p className="mt-2 text-sm text-[var(--lp-muted)]">{card.detail}</p>
    </motion.div>
  );
}

function StatRow() {
  const { data } = usePublicStats();
  // Not an error state: the backend hides figures below its threshold, and a
  // pre-launch number is worse than none.
  if (!data || !data.visible) return null;

  return (
    <div className="mt-12 flex flex-wrap gap-10">
      <StatValue value={data.outlets} label={HERO.statLabels.outlets} />
      <StatValue value={data.pointsIssuedMonth} label={HERO.statLabels.pointsIssuedMonth} />
      <StatValue value={data.customers} label={HERO.statLabels.customers} />
    </div>
  );
}

export function HeroStack({ contactHref }: { contactHref: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  const activeIndex = useTransform(scrollYProgress, (p) =>
    Math.min(CARD_COUNT - 1, Math.round(p * (CARD_COUNT - 1))),
  );

  if (reduced) {
    // No pin, no track, no advance — a static stack with all copy present.
    return (
      <section className="relative overflow-hidden px-6 pb-24 pt-32 md:px-10">
        <DotField />
        <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>{HERO.eyebrow}</Eyebrow>
            <h1 className="mt-5 font-display text-4xl leading-[1.05] text-[var(--lp-ink)] sm:text-5xl md:text-6xl">
              {HERO.headline[0]}
              <br />
              {HERO.headline[1]}
            </h1>
            <div className="mt-6 space-y-2">
              {HERO_CARDS.map((card) => (
                <p key={card.id} className="text-base text-[var(--lp-muted)]">
                  {card.subline}
                </p>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaPill href={contactHref}>{HERO.primaryCta}</CtaPill>
              <CtaPill href="#product" tone="outline">
                {HERO.secondaryCta}
              </CtaPill>
            </div>
            <StatRow />
          </div>
          <div className="space-y-4">
            {HERO_CARDS.map((card) => (
              <div
                key={card.id}
                className="rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-6"
              >
                <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                  {card.kicker}
                </p>
                <p className="mt-4 font-numeral text-3xl text-[var(--lp-ink)]">
                  {card.headline}
                </p>
                <p className="mt-2 text-sm text-[var(--lp-muted)]">{card.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    // 1800px of scroll drives four card states. The pin is CSS sticky, not a
    // JS scroll hijack — the native scrollbar and scroll speed are untouched.
    <div ref={trackRef} className="relative h-[1800px]">
      <section className="sticky top-0 h-screen overflow-hidden px-6 pt-32 md:px-10">
        <DotField />
        <div className="relative mx-auto grid h-full max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>{HERO.eyebrow}</Eyebrow>
            <h1 className="mt-5 font-display text-4xl leading-[1.05] text-[var(--lp-ink)] sm:text-5xl md:text-6xl">
              {HERO.headline[0]}
              <br />
              {HERO.headline[1]}
            </h1>

            {/* The sublines are stacked and cross-faded so the block never
                changes height as the cards advance. */}
            <div className="relative mt-6 h-14">
              {HERO_CARDS.map((card, i) => (
                <motion.p
                  key={card.id}
                  className="absolute inset-0 text-base text-[var(--lp-muted)]"
                  style={{
                    opacity: useTransform(activeIndex, (a) => (a === i ? 1 : 0)),
                  }}
                >
                  {card.subline}
                </motion.p>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <CtaPill href={contactHref}>{HERO.primaryCta}</CtaPill>
              <CtaPill href="#product" tone="outline">
                {HERO.secondaryCta}
              </CtaPill>
            </div>
            <StatRow />

            <div className="mt-10 flex gap-4">
              {HERO_CARDS.map((card, i) => (
                <motion.span
                  key={card.id}
                  className="font-mono text-[10px] tracking-[0.18em]"
                  style={{
                    color: useTransform(activeIndex, (a) =>
                      a === i ? "#0FA968" : "rgba(243,236,226,0.35)",
                    ),
                  }}
                >
                  {card.step}
                </motion.span>
              ))}
            </div>
          </div>

          <div className="relative h-[280px] [perspective:1400px]">
            {HERO_CARDS.map((card, i) => (
              <StackCard key={card.id} card={card} index={i} progress={scrollYProgress} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Fix the hooks-in-loop violation**

The `HERO_CARDS.map(...)` bodies above call `useTransform` inside a loop. That is only safe because `HERO_CARDS` is a frozen `as const` array of fixed length — but it will still trip `react-hooks/rules-of-hooks` and is fragile. Extract two small components at the top of the file and use them in those two loops:

```tsx
function Subline({
  text,
  index,
  activeIndex,
}: {
  text: string;
  index: number;
  activeIndex: MotionValue<number>;
}) {
  const opacity = useTransform(activeIndex, (a) => (a === index ? 1 : 0));
  return (
    <motion.p style={{ opacity }} className="absolute inset-0 text-base text-[var(--lp-muted)]">
      {text}
    </motion.p>
  );
}

function StepLabel({
  label,
  index,
  activeIndex,
}: {
  label: string;
  index: number;
  activeIndex: MotionValue<number>;
}) {
  const color = useTransform(activeIndex, (a) =>
    a === index ? "#0FA968" : "rgba(243,236,226,0.35)",
  );
  return (
    <motion.span style={{ color }} className="font-mono text-[10px] tracking-[0.18em]">
      {label}
    </motion.span>
  );
}
```

Replace the two inline `motion.p` / `motion.span` loops with:

```tsx
{HERO_CARDS.map((card, i) => (
  <Subline key={card.id} text={card.subline} index={i} activeIndex={activeIndex} />
))}
```

```tsx
{HERO_CARDS.map((card, i) => (
  <StepLabel key={card.id} label={card.step} index={i} activeIndex={activeIndex} />
))}
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/platform/landing/HeroStack.tsx
git commit -m "feat: add pinned hero with four-card stack advance"
```

---

## Task 8: Features, pricing, FAQ and CTA sections

**Files:**
- Create: `frontend/src/routes/platform/landing/SectionsFeatures.tsx`
- Create: `frontend/src/routes/platform/landing/SectionPricing.tsx`
- Create: `frontend/src/routes/platform/landing/SectionFaq.tsx`
- Create: `frontend/src/routes/platform/landing/SectionCta.tsx`

**Interfaces:**
- Consumes: `FEATURES`, `PRICING`, `FAQ`, `CTA` from `data.ts`; `WordReveal` (Task 4); `Eyebrow`, `SectionHead`, `CtaPill` (Task 3); `usePublicPlans` (Task 3).
- Produces: `<FeaturesSection />`, `<PricingSection contactHref />`, `<FaqSection />`, `<CtaSection contactHref />`

- [ ] **Step 1: Create the features section**

Create `frontend/src/routes/platform/landing/SectionsFeatures.tsx`:

```tsx
import { motion, useReducedMotion } from "motion/react";

import { FEATURES } from "./data";
import { Eyebrow } from "./primitives";
import { WordReveal } from "./motion/WordReveal";

export function FeaturesSection() {
  const reduced = useReducedMotion();

  return (
    <section id="product" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <Eyebrow>{FEATURES.eyebrow}</Eyebrow>
        {/* The section statement reveals word by word as it crosses the
            viewport. The blocks below use an ordinary stagger — if everything
            used the reveal, the reveal would stop meaning anything. */}
        <WordReveal
          text={FEATURES.statement}
          className="mt-5 max-w-4xl font-display text-3xl leading-[1.15] text-[var(--lp-ink)] sm:text-4xl md:text-5xl"
        />

        <div className="mt-20 grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.blocks.map((block, i) => (
            <motion.div
              key={block.id}
              id={block.id}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: reduced ? 0 : i * 0.06 }}
            >
              <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                {block.kicker}
              </p>
              <h3 className="mt-3 font-display text-xl text-[var(--lp-ink)]">
                {block.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">
                {block.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the pricing section**

Create `frontend/src/routes/platform/landing/SectionPricing.tsx`:

```tsx
import { usePublicPlans } from "../../../hooks/usePublicPlans";
import { PRICING } from "./data";
import { CtaPill, SectionHead } from "./primitives";

/** Whole rupees, as the platform stores them. */
const formatNpr = (n: number) => (n === 0 ? "Rs 0" : `Rs ${n.toLocaleString()}`);

export function PricingSection({ contactHref }: { contactHref: string }) {
  const { data: plans, isLoading } = usePublicPlans();

  // An unconfigured platform shows no pricing section rather than an empty
  // shell promising tiers that do not exist.
  if (!isLoading && (!plans || plans.length === 0)) return null;

  return (
    <section id="pricing" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={PRICING.eyebrow} title={PRICING.title} />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {isLoading
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]"
                />
              ))
            : plans!.map((plan) => (
                <div
                  key={plan.slug}
                  className={`rounded-3xl border bg-[var(--lp-panel)] p-8 ${
                    plan.isMostPopular
                      ? "border-[var(--lp-green)]"
                      : "border-[var(--lp-line)]"
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--lp-muted)]">
                    {plan.name}
                  </p>
                  <p className="mt-4 font-numeral text-4xl text-[var(--lp-ink)]">
                    {formatNpr(plan.priceNpr)}
                  </p>
                  <ul className="mt-6 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="text-sm text-[var(--lp-muted)]">
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <CtaPill
                    href={contactHref}
                    tone={plan.isMostPopular ? "cream" : "outline"}
                    className="mt-8 w-full"
                  >
                    {PRICING.cta}
                  </CtaPill>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create the FAQ rail**

Create `frontend/src/routes/platform/landing/SectionFaq.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";

import { FAQ } from "./data";
import { SectionHead } from "./primitives";

/**
 * Horizontal snap rail.
 *
 * Every answer is rendered in full and always present — this is not a
 * disclosure widget. Nothing is hidden from a screen reader or from search,
 * and vertical page scroll is never intercepted: the rail only owns its own
 * horizontal overflow.
 */
export function FaqSection() {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const syncBounds = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    syncBounds();
    window.addEventListener("resize", syncBounds);
    return () => window.removeEventListener("resize", syncBounds);
  }, [syncBounds]);

  const scrollBy = (direction: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const card = el.querySelector("article");
    const step = card ? card.clientWidth + 24 : el.clientWidth * 0.8;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <section id="faq" className="lp-grid px-6 py-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow={FAQ.eyebrow} title={FAQ.title} subtitle={FAQ.subtitle} />

        <div
          ref={railRef}
          onScroll={syncBounds}
          className="lp-rail mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4"
        >
          {FAQ.items.map((item, i) => (
            <article
              key={item.q}
              className="flex min-h-[260px] w-[300px] flex-shrink-0 snap-start flex-col rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)] p-7 sm:w-[360px]"
            >
              <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 font-display text-lg leading-snug text-[var(--lp-ink)]">
                {item.q}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--lp-muted)]">
                {item.a}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={atStart}
            aria-label="Previous question"
            className="rounded-[74px] border border-[var(--lp-line)] px-5 py-2.5 text-sm text-[var(--lp-ink)] transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={atEnd}
            aria-label="Next question"
            className="rounded-[74px] border border-[var(--lp-line)] px-5 py-2.5 text-sm text-[var(--lp-ink)] transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create the CTA section**

Create `frontend/src/routes/platform/landing/SectionCta.tsx`:

```tsx
import { CTA } from "./data";
import { CtaPill, Eyebrow } from "./primitives";

export function CtaSection({ contactHref }: { contactHref: string }) {
  return (
    <section className="lp-grid px-6 pb-40 pt-28 md:px-10">
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow>{CTA.eyebrow}</Eyebrow>
        <h2 className="mt-5 font-display text-3xl leading-[1.12] text-[var(--lp-ink)] sm:text-4xl md:text-5xl">
          {CTA.title}
        </h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <CtaPill href={contactHref}>{CTA.primary}</CtaPill>
          <CtaPill href="#pricing" tone="outline">
            {CTA.secondary}
          </CtaPill>
        </div>
        <p className="mt-6 text-sm text-[var(--lp-muted)]">{CTA.footnote}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/platform/landing/SectionsFeatures.tsx frontend/src/routes/platform/landing/SectionPricing.tsx frontend/src/routes/platform/landing/SectionFaq.tsx frontend/src/routes/platform/landing/SectionCta.tsx
git commit -m "feat: add landing features, pricing, FAQ rail and CTA sections"
```

---

## Task 9: Footer and WhatsApp float

**Files:**
- Create: `frontend/src/routes/platform/landing/LandingFooter.tsx`
- Create: `frontend/src/routes/platform/landing/WhatsAppFloat.tsx`

**Interfaces:**
- Consumes: `FOOTER_LINKS` from `data.ts`; `FooterReveal` (Task 4); `usePlatformContact` (existing hook at `frontend/src/hooks/usePlatformContact.ts`).
- Produces: `<LandingFooter />`, `<WhatsAppFloat />`

- [ ] **Step 1: Create the footer**

Create `frontend/src/routes/platform/landing/LandingFooter.tsx`:

```tsx
import StampdLogo from "../../../components/shared/StampdLogo";
import { usePlatformContact } from "../../../hooks/usePlatformContact";
import { FOOTER_LINKS } from "./data";
import { FooterReveal } from "./motion/FooterReveal";

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
};

/**
 * samparka.co's footer, inverted: a cream panel with dark ink, uncovered by
 * the dark page scrolling away over it.
 *
 * The rounded step lives on the PAGE's bottom edge rather than here (see
 * PlatformLanding), because a revealed footer is uncovered rather than slid
 * into view — the dark surface ends in rounded corners that sweep off it.
 *
 * Dropped from the source: the Recognition award grid (Stampd has none, and
 * inventing logos is worse than showing nothing) and the overlapping "Let's
 * get started" card (CtaSection already does that job).
 */
export function LandingFooter() {
  const { data: contact } = usePlatformContact();
  const socials = contact?.socials;

  // Only render an icon whose URL is actually configured — an unconfigured
  // platform shows no dead links.
  const socialEntries = socials
    ? (Object.entries(socials) as [keyof typeof socials, string][]).filter(
        ([, url]) => Boolean(url),
      )
    : [];

  return (
    <FooterReveal>
      <footer className="flex min-h-[60vh] items-end bg-[var(--lp-cream)] px-6 pb-10 pt-20 text-[#14201C] sm:px-10 md:px-16 lg:px-20">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex items-center gap-2">
            <StampdLogo className="h-8 w-8" />
            <span className="font-display text-lg">Stampd</span>
          </div>

          <nav className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-[#14201C]/70 transition-colors hover:text-[#14201C]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {socialEntries.length > 0 ? (
            <div className="mt-6 flex gap-5">
              {socialEntries.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-[#14201C]/60 transition-colors hover:text-[#14201C]"
                >
                  {SOCIAL_LABELS[key] ?? key}
                </a>
              ))}
            </div>
          ) : null}

          <div className="mt-10 border-t border-[#14201C]/12 pt-6">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-[#14201C]/60">
              <span>© {new Date().getFullYear()} Stampd.</span>
              <a href="/privacy" className="underline-offset-4 hover:underline">
                Privacy Policy
              </a>
              <a href="/terms" className="underline-offset-4 hover:underline">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </FooterReveal>
  );
}
```

- [ ] **Step 2: Create the WhatsApp float**

Create `frontend/src/routes/platform/landing/WhatsAppFloat.tsx`:

```tsx
import { useReducedMotion } from "motion/react";
import { useState } from "react";

import { usePlatformContact } from "../../../hooks/usePlatformContact";

/** Strips spaces, dashes and a leading + so the number is wa.me-safe. */
export const toWaNumber = (phone: string) => phone.replace(/[^\d]/g, "");

/**
 * Contact float. Kept because WhatsApp is how this market actually makes
 * contact, and because it gives every "Talk to us" CTA a real destination in
 * the absence of self-serve signup — but rebuilt out of this page's own cream
 * / ink / radius vocabulary rather than the stock green badge.
 *
 * Renders nothing when no phone is configured: no hardcoded number ships.
 */
export function WhatsAppFloat() {
  const { data: contact } = usePlatformContact();
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  const number = contact?.phone ? toWaNumber(contact.phone) : "";
  if (!number) return null;

  const expanded = open && !reduced;

  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noreferrer noopener"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-label="Chat with us on WhatsApp"
      // z-40 keeps it under the nav (z-50) and above the revealed footer.
      className={`fixed bottom-6 right-6 z-40 flex h-14 items-center gap-3 overflow-hidden rounded-[74px] border border-[#14201C]/15 bg-[var(--lp-cream)] text-[#14201C] shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-[width,padding] duration-300 motion-reduce:transition-none ${
        expanded ? "w-[188px] px-5" : "w-14 justify-center px-0"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 flex-shrink-0" aria-hidden="true">
        <path
          d="M20 11.7a8 8 0 0 1-11.9 7L4 20l1.4-4a8 8 0 1 1 14.6-4.3Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M9.2 9.4c.3 1.9 2 3.6 3.9 3.9l.9-1.1 1.6.7c-.2 1-1.1 1.5-2.1 1.4-2.6-.3-4.7-2.4-5-5-.1-1 .4-1.9 1.4-2.1l.7 1.6-1.4.6Z"
          fill="currentColor"
        />
      </svg>
      <span
        className={`whitespace-nowrap text-sm font-medium transition-opacity duration-200 ${
          expanded ? "opacity-100" : "opacity-0"
        }`}
      >
        Chat with us
      </span>
    </a>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/platform/landing/LandingFooter.tsx frontend/src/routes/platform/landing/WhatsAppFloat.tsx
git commit -m "feat: add revealed cream footer and redesigned WhatsApp float"
```

---

## Task 10: Legal stubs and route wiring

**Files:**
- Create: `frontend/src/routes/platform/legal/Privacy.tsx`
- Create: `frontend/src/routes/platform/legal/Terms.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: routes `/privacy` and `/terms`.

- [ ] **Step 1: Create a shared stub layout and the two pages**

Create `frontend/src/routes/platform/legal/Privacy.tsx`:

```tsx
import { useEffect } from "react";

// Placeholder body. The route exists so the footer links resolve; the copy is
// for the platform owner to write. Both /privacy and /terms are registered in
// backend RESERVED_SLUGS, so no company can claim either slug.
export default function Privacy() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Privacy Policy | Stampd";
    document.documentElement.classList.add("landing-dark");
    return () => {
      document.title = previous;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--lp-bg)] px-6 py-24 md:px-10">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="font-mono text-[11px] tracking-[0.18em] text-[var(--lp-green)]">
          ← STAMPD
        </a>
        <h1 className="mt-6 font-display text-4xl text-[var(--lp-ink)]">Privacy Policy</h1>
        <p className="mt-6 text-base leading-relaxed text-[var(--lp-muted)]">
          We are writing this up properly. In the meantime, if you have a question about
          what we store or how we use it, talk to us and we will answer directly.
        </p>
      </div>
    </main>
  );
}
```

Create `frontend/src/routes/platform/legal/Terms.tsx` — identical, with `Terms` as the component name, `"Terms of Service | Stampd"` as the title, `Terms of Service` as the heading, and this body:

```tsx
        <p className="mt-6 text-base leading-relaxed text-[var(--lp-muted)]">
          We are writing this up properly. Until then, your agreement is whatever we
          agreed with you directly when your outlet was set up.
        </p>
```

- [ ] **Step 2: Register the routes**

In `frontend/src/App.tsx`, add two lazy imports beside the existing `PlatformLanding` one:

```tsx
const Privacy = lazy(() => import('./routes/platform/legal/Privacy'));
const Terms = lazy(() => import('./routes/platform/legal/Terms'));
```

And add the routes immediately after the `<Route path="/" element={<PlatformLanding />} />` line:

```tsx
{/* Marketing-site legal pages. Both slugs are in backend RESERVED_SLUGS —
    these literal routes match before /:companySlug, so a company on either
    slug would otherwise become unreachable. */}
<Route path="/privacy" element={<Privacy />} />
<Route path="/terms" element={<Terms />} />
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/platform/legal/ frontend/src/App.tsx
git commit -m "feat: add privacy and terms stub routes"
```

---

## Task 11: Compose the page and verify end to end

**Files:**
- Replace: `frontend/src/routes/platform/PlatformLanding.tsx`
- Modify: `.claude/launch.json`

**Interfaces:**
- Consumes: every component from Tasks 3–9.
- Produces: the finished `/` route.

- [ ] **Step 1: Replace `PlatformLanding.tsx`**

Overwrite `frontend/src/routes/platform/PlatformLanding.tsx` entirely:

```tsx
import { useEffect } from "react";

import { usePlatformContact } from "../../hooks/usePlatformContact";
import { HeroStack } from "./landing/HeroStack";
import { LandingFooter } from "./landing/LandingFooter";
import { LandingNav } from "./landing/LandingNav";
import { CtaSection } from "./landing/SectionCta";
import { FaqSection } from "./landing/SectionFaq";
import { PricingSection } from "./landing/SectionPricing";
import { FeaturesSection } from "./landing/SectionsFeatures";
import { WhatsAppFloat } from "./landing/WhatsAppFloat";
import { toWaNumber } from "./landing/WhatsAppFloat";

// The marketing site. A dark, self-contained surface with its own tokens,
// scoped by the `landing-dark` class added to <html> for the lifetime of this
// route only — so the dark background covers overscroll without leaking into
// the consoles, which stay light.
//
// Concept: docs/superpowers/specs/2026-07-30-platform-landing-stampd-concept-design.md

export default function PlatformLanding() {
  const { data: contact } = usePlatformContact();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Loyalty points for Nepali businesses | Stampd";
    document.documentElement.classList.add("landing-dark");

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  // There is no self-serve signup — a company is registered by the platform
  // owner — so every CTA on this page resolves to a real conversation.
  // Falls back to the pricing anchor until contact details are configured,
  // which is still a live destination rather than a dead link.
  const phone = contact?.phone ? toWaNumber(contact.phone) : "";
  const contactHref = phone ? `https://wa.me/${phone}` : "#pricing";

  return (
    <main className="min-h-screen bg-[var(--lp-bg)] font-sans antialiased" style={{ overflowX: "clip" }}>
      <LandingNav contactHref={contactHref} />

      {/* The rounded step belongs to the page content's bottom edge, not the
          footer's top: the footer is uncovered rather than slid in, so it is
          the dark surface that ends in rounded corners and sweeps away. */}
      <div className="relative z-10 rounded-b-[40px] bg-[var(--lp-bg)]">
        <HeroStack contactHref={contactHref} />
        <FeaturesSection />
        <PricingSection contactHref={contactHref} />
        <FaqSection />
        <CtaSection contactHref={contactHref} />
      </div>

      <LandingFooter />
      <WhatsAppFloat />
    </main>
  );
}
```

Merge the two `WhatsAppFloat` imports into one line:

```tsx
import { WhatsAppFloat, toWaNumber } from "./landing/WhatsAppFloat";
```

- [ ] **Step 2: Typecheck**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run the backend suite once more**

```bash
npm test -w backend
```

Expected: all suites pass.

- [ ] **Step 4: Start the app and verify in the browser**

Start the dev servers via the preview tools (`preview_start` with `backend`, then `frontend`) — **never** via Bash. Note that `backend/.env` carries a real `MONGODB_URI`, so if the backend fails to connect, restart it with `MONGODB_URI=""` so it falls back to the in-memory mock.

Navigate to `http://localhost:3000/` and confirm, at **1280 wide**:

- Nav pill reads as glass, hides on scroll-down, returns on scroll-up, and does **not** flicker at the hero pin boundaries
- "Talk to us" label rolls on hover — then hover in and out rapidly and confirm the label always settles fully, never stranded mid-window
- Dot field repels from the cursor and returns; check `read_console_messages` for errors
- Hero cards advance through all four states across the pin, and the step rail plus subline track the active card
- Stat row shows three figures (the seed has 6 outlets, above the threshold)
- "What you get" statement lights word by word as it passes
- Pricing shows the seeded plans with real prices
- FAQ rail snaps; Previous is disabled at the start and Next at the end; page scroll is not trapped
- Footer is uncovered by the page scrolling off it and fades in
- WhatsApp float is legible against the cream footer at full reveal — **if it is not, add the border/ink treatment now**

Then `resize_window` to **375** and re-check: nav collapses, cards stack readably, FAQ rail swipes.

- [ ] **Step 5: Verify the reduced-motion path**

```bash
npx playwright --version
```

If Playwright is unavailable, use the browser tools' `emulateMedia` equivalent via `javascript_tool`, or set the OS setting. Confirm with reduced motion on:

- No pin — the hero is a static two-column block with all four sublines and all four cards visible
- Nav does not hide
- CTA label does not roll
- Word reveal renders solid text
- Footer is an ordinary block at full opacity
- Dot field is rendered but still

- [ ] **Step 6: Capture proof**

Take a screenshot at 1280 and one at 375 and include them in the completion report.

- [ ] **Step 7: Remove the temporary preview server entry**

In `.claude/launch.json`, delete the `concepts` configuration block added while reviewing the source mockup.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/routes/platform/PlatformLanding.tsx .claude/launch.json
git commit -m "feat: compose Stampd concept landing page"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §3.1 public-stats | Task 1 |
| §3.2 public-plans | Task 2 |
| §3.3 reserved slugs | Task 2 |
| §3.4 no rate limiting | Task 1 Step 5 (documented in the route comment) |
| §4 file structure + tokens | Task 3 |
| §5 colour | Task 3 (tokens), enforced throughout |
| §6 navigation | Task 6 |
| §7.1 dot field | Task 5 |
| §7.2 copy and stats | Task 7 |
| §7.3 stack advance | Task 7 |
| §7.4 three techniques | Task 4 |
| §8 features/pricing/FAQ/CTA | Task 8 |
| §9 FAQ copy corrections | Task 3 (`data.ts` FAQ items) |
| §10 footer | Task 9 |
| §11 WhatsApp float | Task 9 |
| §12 testing | Tasks 1–2 (backend), Task 11 (browser) |
| §13 sequencing | Task order |

**Known deviation from the spec:** §9 says to verify the staff-attribution claim against `PointsTransaction` before writing it. The model has no staff/actor field, so the FAQ answer in `data.ts` was rewritten to describe the append-only ledger instead — which is true — rather than claiming per-staff attribution, which is not.

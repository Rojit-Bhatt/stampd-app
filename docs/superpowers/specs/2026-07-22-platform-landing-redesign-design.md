# Platform landing page redesign

**Date:** 2026-07-22
**Status:** Approved design, ready for implementation plan
**Scope:** Rebuild `frontend/src/routes/platform/PlatformLanding.tsx` (the slug-less marketing page at `/`) into scroll-driven, component-split sections with fresh copy. Frontend-only, one new read-only API integration (an existing public endpoint, no backend changes). Does NOT touch the editorial-ledger design tokens, the tenant-scoped customer/admin app, or any other route.

## Context

The editorial-ledger redesign (`redesign-2` / `redesign/stampd-ledger-2026`) is done and merged into `main` — it already rebuilt this same file once (`docs/design/stampd-redesign-2026/IMPLEMENTATION-PLAN.md` Phase 7), replacing generic SaaS copy with facts about the actual loop. That rebuild is competent but static: a sticky bar nav, five anchor-linked sections (hero / how-it-works / features / made-for-Nepal / FAQ), zero scroll motion, no pricing section, 440 lines in one file.

This spec was brainstormed against a competitor, samparka.co (also a Nepali loyalty SaaS), for its floating-pill nav and lively scroll feel — but the section content and layout must not read as a copy of a named competitor's site. Two other reference sites (linear.app, framer.com) were checked during brainstorming for a second data point: both lean on a single giant headline, a real product screenshot bleeding past the fold, and (commonly, across modern SaaS marketing sites generally, not any one competitor) asymmetric bento-grid feature cards rather than a numbered list — informing the Services section decision below.

Two real, verified constraints shape what this page can honestly say:
- **No self-serve checkout exists.** Subscriptions are admin-issued keys (`SubscriptionKey` → company owner redeems at `/company/subscription`), not a payment gateway. A pricing section must not imply an "add to cart" flow.
- **`GET /api/platform/plans/public`** (`subscriptionPlanController.getPublicPlans` → `listActivePlans`) already exists, is unauthenticated, and returns real admin-configured `SubscriptionPlan` documents (`name`, `priceNpr`, `outletLimit`). It has zero frontend consumers today. The Pricing section uses this — real numbers, not invented tiers.
- **No fabricated trust signals.** CLAUDE.md already establishes this principle elsewhere (Explore's discover grid: "never a fabricated rating or deal"). This page must not claim a customer count, testimonial, or rating this codebase has no data behind.

## Decisions locked during brainstorming

1. **Design tokens unchanged.** `--primary` green / `--brand` / Space Grotesk / DM Serif Display / Inter / IBM Plex Mono stay exactly as the merged redesign left them. This spec changes structure, motion, and copy — not the palette or type system.
2. **Component split**, not one growing file. New directory `frontend/src/routes/platform/landing/`: `Nav.tsx`, `Hero.tsx`, `ProductPreview.tsx` (new), `HowItWorks.tsx`, `ServicesGrid.tsx` (new), `WhyStampd.tsx`, `Pricing.tsx` (new), `Faq.tsx`, `Footer.tsx`. `PlatformLanding.tsx` becomes a thin composer that renders them in order.
3. **Nav**: keeps today's content (logo, links, Log in / Start collecting) but gains a scroll-linked morph — full-width bar at the top of the hero, transforming into a centered rounded pill with blur backdrop once scrolled past the hero (`useScroll` + `useTransform` over that range). One continuous transform, not a breakpoint swap. Adds **Services** and **Pricing** anchor links as those sections are new. This shape is common across modern SaaS marketing sites generally (Linear, Framer, and others all ship some scroll-reactive nav) — not a copy of any single site's implementation.
4. **Services section becomes an asymmetric bento grid**, explicitly *not* samparka's vertical numbered 01–05 list. One larger lead card plus four smaller ones, five real shipped features only: QR-based earn/redeem, Campaigns (multiplier promos), Rewards & redemption catalog, Business analytics/reports, Multi-outlet management. Each card stagger-reveals on scroll via `whileInView`.
5. **New section: Product Preview strip**, placed between Hero and How-it-works. Two to three real UI mockups in the same phone-card visual language the Hero already uses (claim screen, admin dashboard chart, redeem catalog) — not samparka's scattered-card decoration, not stock photography. Scroll-linked reveal (parallax offset or staggered fade, decided during implementation against what reads best, not scroll-jacked).
6. **New section: Pricing, informational only.** Fetches `GET /api/platform/plans/public` (TanStack Query, matching the rest of the app's data-fetching convention), renders each plan's real name/price/outlet limit. CTA buttons read "Contact us" / "Start free trial" and link to `/admin-login` or the existing contact info (`usePlatformContact`, already used elsewhere on this page) — never a checkout button, matching the actual key-redemption model.
7. **No testimonials section.** No real customer quotes exist to use honestly; fabricating them conflicts with the product's own anti-fake-data principle (decision above, and CLAUDE.md's existing Explore-page rule). Revisit only once real testimonials exist.
8. **Motion**: one new shared entry in `lib/motion.ts` — a `reveal` easing/variant for the fade/slide-up used by every `whileInView` trigger across the new and rebuilt sections, keeping the codebase's "one physics vocabulary, no hand-rolled springs" rule intact. The nav's scroll-linked transform is component-local (it's a one-off `useScroll` range, not a reusable spring) but must still collapse to an instant snap under `useReducedMotion()` / `useMotion().pick`, same as everything else in this file.
9. **Copy**: shorter per section, one clear visual anchor per section (icon, real screenshot, or stat) instead of paragraphs — "what it says" prioritized over decoration, per explicit steer. Every claim on the page must be a fact about how the product actually works (mirrors the existing Hero's own internal comment to this effect) — no invented traction numbers, no invented testimonials.

## Explicitly out of scope

- Any backend change. `GET /api/platform/plans/public` already exists and is read-only; nothing here adds or modifies an API.
- Any change to the tenant-scoped customer/admin/company consoles, or to `index.css` / `fonts.css` tokens.
- A dark-mode toggle (still not shipping, per the existing redesign's own locked decision).
- Copying samparka.co's literal layout, its numbered-list feature section, or its testimonials — used only as one data point among several (alongside linear.app/framer.com) during brainstorming, not as a template.
- The separate Google Review Generator feature (search + QR flyer) — a second, independent project, specced separately and built to live inside whatever shell this spec produces.

## Verification

1. `npm run lint` (`tsc --noEmit`) green.
2. Visual check in the browser preview at 375px and 1280px: nav morph, every section's scroll-reveal, Pricing rendering real seeded plan data.
3. `prefers-reduced-motion` forced on: every scroll effect collapses to an instant, no-motion equivalent — no section becomes invisible or broken, only unanimated.
4. No route, no other page, and no backend file changed outside `frontend/src/routes/platform/landing/`, `PlatformLanding.tsx`, and `lib/motion.ts`.

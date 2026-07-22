# Loyalty growth suite: tiers, campaigns, messaging, analytics

**Date:** 2026-07-22
**Status:** Approved design, ready for implementation plan (Phase 1 only — later phases get their own brainstorm pass before planning, per the phasing section below)
**Scope:** Five requested features — tier system, custom campaigns with segment targeting, multi-channel messaging (SMS/WhatsApp/email/push/automated triggers), coupons, and analytics — decomposed into phases with the cross-cutting architectural decisions locked here. Does NOT include implementation-level detail for phases beyond Phase 1; those get refined immediately before their own plan is written. Does NOT include coupons — deferred indefinitely pending a separate POS/RMS integration design (see "Explicitly out of scope").

## Context

Five requested features are five separate subsystems, not one feature, with real dependency ordering: a campaign builder needs both a tier system (to target by) and messaging infra (to send through) before it means anything; analytics needs the others to exist before there's anything to report on. Coupons were previously attempted in this codebase (`couponController.js`/`Coupon.js`/`couponService.js`) and reverted mid-work to prioritize the frontend redesign — that work is gone, not a starting point.

The user wants an eventual POS/RMS integration layered on top of this app, and coupons/discounts belong to that design, not this one — building a discount model now that POS would likely redefine anyway is wasted work.

## Decisions locked during brainstorming

1. **Tiers are derived, never stored.** Same philosophy the codebase already applies to points balances ("the balance must always equal the sum of the ledger") — a tier is a computed view over the ledger, not a mutable field that can drift from it. Zero changes to `pointsService`'s atomic earn/redeem guards.
2. **Tiers are scoped per-outlet**, matching the existing invariant that points never pool across outlets. Two outlets of the same company can independently place the same customer in different tiers.
3. **Tier labels are fixed** (e.g. Bronze/Silver/Gold/Platinum) — admins configure the numeric thresholds per outlet, not the label set. Computed over a **trailing 12-month rolling window** (visit count = earn-transaction count, spend = summed bill amount), so tier reflects recent behavior rather than being permanently set by one large historical year.
4. **Marketing campaigns are a new model, explicitly not the existing `Campaign`.** This codebase's `Campaign` already means "bill-multiplier for a window" (see CLAUDE.md's Campaigns section) — reusing that name for messaging would collide two unrelated concepts the way `Campaign`/`Event` are already deliberately kept separate. The new model is called **`Broadcast`**.
5. **Segments resolve live at send time**, not as a frozen snapshot list — same pattern as `resolveActiveMultiplier`/`resolveProgram` resolving fresh on every call rather than caching. A `Broadcast`'s audience is whoever matches the filter *right now*.
6. **One `Broadcast` = one channel.** No multi-channel fan-out from a single campaign in v1 — an outlet creates separate broadcasts per channel if it wants both. Real complexity (per-channel content variants, per-channel delivery status) for marginal v1 value.
7. **Consent is per-channel, explicit, and documented** — not a business preference but a legal requirement: Nepal's NTA requires documented consent for marketing SMS with opt-out support in English and Nepali; WhatsApp requires its own separate opt-in that cannot be inherited from SMS consent. `CustomerAccount.marketingConsent` carries one boolean + one timestamp per channel, defaulting false.
8. **Milestone triggers fire in real time** off the earn write path (Nth visit, checked right after a successful earn, as a non-blocking fire-and-forget event — never inside the atomic guarded update itself, matching the existing fire-and-forget pattern already used for `sendEmail()` calls). **Birthday and inactivity triggers are calendar-based**, requiring a daily `node-cron` job — the first cron job in this codebase (CLAUDE.md currently states none exists or is needed anywhere; this is a deliberate, scoped exception, safe because the deploy target is Render's persistent Node host, not serverless). Runs once daily at a fixed Kathmandu-local hour, consistent with the existing `PLATFORM_TIMEZONE` convention used for campaign day-of-week judging.
9. **Birthday field collects month+day only, not a full date of birth** — that's all a birthday trigger needs, and it's meaningfully less PII to carry. Added to `CustomerAccount` as a new optional field, editable from the existing profile settings page — **not** collected at registration. UX research on progressive profiling in loyalty apps backs this: ask optional fields after a customer's had a login or two, not during signup where it adds friction for zero immediate value to them.
10. **SMS/WhatsApp cost is billed to each company as a usage-based add-on** on top of their existing `SubscriptionPlan`, not absorbed by the platform. Exact spend-cap ceilings are a pricing decision for later, not a blocker on the architecture — the design just needs a configurable per-company cap, whatever the number ends up being.
11. **Email and push ship before SMS; SMS ships before WhatsApp.** Email reuses the existing `emailService.js` (Brevo API / SMTP / dev stub) at effectively no new cost. Push is Web Push via the PWA's existing service worker (VAPID keys, no third-party cost, though iOS Safari only supports it once installed to homescreen on 16.4+). SMS needs a Nepal-local aggregator (e.g. Sparrow SMS) — no account exists yet, ~NPR 0.70–1.50/SMS depending on volume, confirm live rate before committing. WhatsApp needs an approved BSP (Gupshup/Wati/Twilio/Sinch/Meta Cloud API directly), Facebook Business verification, a dedicated number, and Meta template pre-approval (24–48hr per template) — deferred until SMS is proven out and a BSP is picked.

## Explicitly out of scope

- **Coupons/discount codes** — belongs to the future POS/RMS integration design, not this one. No model, no service, no UI here.
- **WhatsApp and SMS sending** in the phases built now — infra is designed to support them (channel-adapter pattern, consent model already covers all four channels), but no provider integration ships until Phase 5/6.
- **Multi-channel fan-out per campaign** (decision 6).
- **Tier perks/bonus multipliers** — tiers are a segmentation label only for now, not an earn-rate modifier. Revisit only if a future ask specifically wants tier-based bonus earning.
- **Full date-of-birth collection, age-gating, or any DOB-derived feature** beyond month/day birthday triggers.

## Phasing

Each phase below gets a short brainstorm-refinement pass immediately before its own implementation plan — the decisions above are locked platform-wide, but per-phase specifics (exact API shapes, UI layouts) aren't pre-decided beyond what's written here.

1. **Tier system** — detailed below, ready for `writing-plans` now.
2. **Analytics basics** — tier distribution view, reusing `reportService.js`/`companyReportService.js` conventions. Nothing to report on for campaigns yet since Phase 4 doesn't exist.
3. **Messaging foundation** — consent model, birthday field, email + push channel adapters, both trigger mechanisms (real-time milestone, daily-cron birthday/inactivity), using fixed canned message templates. No campaign builder UI yet — triggers fire pre-written messages.
4. **Campaign/`Broadcast` builder** — segmentation UI, custom message authoring, manual send, built on Phases 1 and 3.
5. **SMS provider integration** — gated on picking a budget ceiling and an aggregator account.
6. **WhatsApp BSP integration** — gated on Phase 5 landing and a BSP decision.

## Phase 1 detail: Tier System

### Data model

`Organization` gets a new optional field, `tierThresholds`: an array of `{label, minVisits, minSpendCenti}`, outlet-configured, defaulting to `null` (no tiers configured → tier resolution returns `null`/"unranked"). Labels are drawn from a fixed platform-wide constant list (e.g. `["Bronze", "Silver", "Gold", "Platinum"]` in `config/platform.js`, alongside the existing `PLATFORM_NAME`/`CAMPAIGN_STACKING` constants) — admins set thresholds per label, not the label text itself.

No changes to `PointsBalance`, `PointsTransaction`, or `pointsService`'s write paths.

### Backend

New `services/tierService.js`, one exported function: `resolveTier(organizationId, customerId)`.
- Queries `PointsTransaction` for `{organizationId, customerId, type: "earn", createdAt: {$gte: <12 months ago>}}` (top-level equality + `$gte` — mock-DB safe per the project's query-matching limits).
- Computes `visits = matching transaction count`, `spendCenti = sum of billAmountCenti across those rows`.
- Fetches the outlet's `tierThresholds` off `req.organization` (already resolved by existing middleware), walks the thresholds highest-to-lowest, returns the first label where the customer meets both `minVisits` and `minSpendCenti` — or `null` if none match or no thresholds are configured.

Exposed read-only, in two places:
- Business-admin customer list/detail (`/api/admin/customers`) — an added `tier` field per customer row, computed on read.
- Customer-facing balance/profile response (`/api/points/balance`) — a `tier` field alongside the existing balance data.

No new route is strictly needed beyond adding this field to responses that already exist — this is a read-side enrichment, not a new resource.

### Frontend

- Outlet admin settings: a new small section (near existing program-config settings) listing the four fixed labels with two number inputs each (min visits, min spend) — same form patterns already used for other program-config fields.
- Customer-facing: tier label surfaced wherever the balance is already shown (e.g. `CustomerSettings`/dashboard balance card) — a small badge, no new page.
- Business-admin customer list: tier shown as a column/badge alongside existing customer row data.

### Testing

New `backend/tests/tier-resolution.js` (added to `package.json`'s test chain, per this repo's existing convention): seeds transactions across the 12-month boundary to verify the rolling window excludes older activity, verifies per-outlet isolation (same customer, two outlets, different tiers), verifies threshold edge cases (exactly-at-threshold counts as met, per the codebase's established `$gte`-not-strict convention seen in the redemption guard).

## Explicitly out of scope for Phase 1

- Tier-based earn multipliers or perks (decision list, "Explicitly out of scope").
- Any UI for Phases 2–6.
- Historical backfill/migration — tier resolution works purely off existing `PointsTransaction` data already in the ledger; no data migration needed since nothing is stored.

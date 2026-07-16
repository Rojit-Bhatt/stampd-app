# Multi-business subscriptions + key-based activation

Status: in progress. Planned by Opus 4.8 (single-agent-implemented per user
instruction thereafter), revised 2026-07-16 after the payment-integration
pivot below.

## What this is

A plan-based subscription tier gating how many separate businesses
(Organizations) one owner can run, plus platform-admin tooling to configure
plans and confirm payment. Reference pricing: Basic Rs 999/yr = 1 business,
Growth Rs 2499/yr = up to 3 ("Most Popular"), Pro Rs 4999/yr = up to 6.

## Architecture (unchanged from the original Opus plan)

Mirrors the existing global-customer-identity pattern: a new
`BusinessOwnerAccount` (global login) owns N `Organization`s. Each
Organization's existing `business_admin` `User` row is the owner's
per-tenant membership (`User.ownerAccountId`, analogue of
`User.customerAccountId`). The owner holds a global session token
(`{type: "global_owner", ownerAccountId}`, `JWT_GLOBAL_SECRET`), exchanged
per-business for a normal tenant JWT via `POST /api/owner/enter-business`
(`verifyOwnerSession` middleware, mirrors `verifyGlobalSession`). Tenant JWTs
stay exactly as org-scoped as today — this feature does not touch
`authMiddleware.js`'s security invariant.

`Subscription` (one per owner) snapshots `businessLimitAtPurchase` from the
plan at purchase/key-redemption time — a later plan edit never retroactively
strands an existing subscriber (see D-decision below, unchanged). Expiry and
the grace window are always DERIVED from `currentPeriodEnd` at read time
(`subscriptionService.computeEffectiveStatus`), never a persisted "expired"
status requiring a cron job — mirrors Voucher's lazy `expiresAt` check,
required because this app has no scheduler (see CLAUDE.md's "Zero-config dev
DB"). `GRACE_PERIOD_DAYS` (5) lets an owner keep adding businesses briefly
past `currentPeriodEnd` before being gated; `EXPIRY_REMINDER_DAYS` (7)
controls when the renewal reminder appears.

Confirmed decisions (unchanged): expiry blocks only owner-tier actions
(adding a business) — never a business's storefront or its
barista/admin console; both self-serve owner signup and platform-admin
manual onboarding create/attach an owner; the pre-existing seeded
Coffesarowar tenant is grandfathered with a 100-year comped `Subscription`
via `server.js`'s `seedDemoData()` (a real migration script,
`scripts/backfillBusinessOwners.js`, does the equivalent for a real
production DB); a 14-day/1-business trial replaces a separate "Rs 0" plan;
`businessLimitAtPurchase` is snapshotted, not read live off the plan.
Grace period, downgrade-over-limit rule (`assertPlanChangeAllowed`), and an
email reminder (see below) were folded in per explicit request, beyond
Opus's original "core feature only" recommendation.

## PIVOT (2026-07-16): no live payment gateway — key-based activation instead

**Original plan** (superseded): integrate eSewa ePay v2 + Fonepay sandbox
redirect-checkout, HMAC-signed requests, callback + status-check
verification, a `PaymentTransaction` audit log.

**Corrected plan**: no payment API integration of any kind. Instead:

1. Platform admin generates a **subscription key** (a random code, like a
   voucher code) scoped to a specific plan, from a new "Subscription Keys"
   platform-admin page (design mirrors the existing "Team" page — see
   `frontend/src/routes/platform/PlatformTeam.tsx` for the pattern: a table
   + a generation form).
2. The platform admin manually contacts the business (phone/email, entirely
   outside the app) to confirm they've received payment, then hands over
   the generated key through that same out-of-band channel.
3. The business admin enters the key in a new **Subscription** section
   inside the existing tenant-scoped admin console
   (`/:slug/admin/subscription` — NOT a separate owner-only surface; this
   lives in `AdminLayout`, reachable by whoever operates that business's
   console day-to-day). Submitting a valid, unused key immediately confirms
   /extends that business's owner's subscription.
4. This tenant-scoped Subscription page shows: current plan, a **days-left
   countdown**, effective status (trial/active/grace/expired), the key-redeem
   form, and — once within `EXPIRY_REMINDER_DAYS` of expiry — the **platform
   admin's contact info** (phone/email, reusing the existing
   `platformConfigService.getContact()` singleton already used by the public
   platform contact page) so the business knows who to reach out to.
5. The same contact info is included in the **email** reminder sent once
   per expiry cycle (tracked via a new `Subscription.reminderEmailSentAt`
   field, compared against `currentPeriodStart` so it fires again on each
   new cycle — still no cron, sent lazily the next time the subscription is
   read after crossing the reminder threshold).
6. `PaymentTransaction`, `esewaService.js`, `fonepayService.js` are dropped
   entirely — replaced by a single `SubscriptionKey` model +
   `subscriptionKeyService.js` (`generateKey`, `listKeys`, `revokeKey`,
   `redeemKey`). `redeemKey` still runs the same `assertPlanChangeAllowed`
   downgrade-over-limit check before applying the key's plan via
   `subscriptionService.applyPurchase` (renamed conceptually to "apply an
   activation", same function).

### New/changed data model

- **`SubscriptionKey`**: `code` (unique, e.g. 16-char alphanumeric),
  `planId`/`planSlug` (denormalized, same rationale as elsewhere), `status`
  enum `["unused","redeemed","revoked"]`, `generatedByActorId` (platform
  `User` ref), `note` (free text — e.g. an invoice/reference the platform
  admin jots down), `assignedToOwnerAccountId` (null until redeemed),
  `createdAt`, `redeemedAt`.
- **`Subscription`**: add `reminderEmailSentAt` (Date, default null).
- No `PaymentTransaction` model.

### New/changed routes

- `POST /api/platform/subscription-keys` (generate, `isPlatformOwner`)
- `GET /api/platform/subscription-keys` (list, `isPlatformAdmin`)
- `DELETE /api/platform/subscription-keys/:code` (revoke an unused key,
  `isPlatformOwner`)
- `GET /api/admin/subscription` (tenant-scoped, `isBusinessAdmin` — resolves
  `req.user.organizationId` → `Organization.ownerAccountId` → the owner's
  subscription summary + reminder + platform contact info)
- `POST /api/admin/subscription/redeem-key` (tenant-scoped, `isBusinessAdmin`
  — same resolution, then `subscriptionKeyService.redeemKey`)
- Owner-side `POST /api/owner/subscription/redeem-key` also exists for the
  global owner dashboard (Phase 5), doing the same thing from that surface.
- Dropped: `POST /api/owner/checkout`, `POST /api/owner/checkout/verify`
  (never implemented — pivot happened before Phase 4 payment code was
  written).

### Design reference

Platform-admin "Subscription Keys" page should mirror the existing
`PlatformTeam.tsx` visual pattern (table + generation form + platform accent
`var(--plat)`). No new visual reference image has been provided for the
tenant-admin "Subscription" page as of this writing — built using the
existing Stampd design system conventions (`.shadow-ambient` cards,
`rounded-3xl`, `--brand` accent) consistent with other `/:slug/admin/*`
pages, pending any further design input.

## Phased sequence (updated)

- Phase 0 — config + currency groundwork. **Done.**
- Phase 1 — `SubscriptionPlan` model + platform CRUD. **Done.**
- Phase 2 — Owner identity + auth + migration. **Done.**
- Phase 3 — `Subscription` model + limit enforcement + lazy expiry + grace
  period + downgrade rule. **Done.**
- Phase 4 (revised) — `SubscriptionKey` model + generate/list/revoke/redeem
  + platform contact surfacing + email reminder. **In progress.**
- Phase 5 — Owner-facing frontend (global login/dashboard/business
  switcher/add-business flow, own subscription view + key redemption).
- Phase 6 — Platform admin frontend: Plans page, Subscription Keys page,
  Owners view.
- Phase 7 — Tenant-admin "Subscription" page (plan, countdown, redeem-key
  form, contact info) + final currency/copy polish + full test run +
  browser verification.
- Then: send the full diff to Opus 4.8 for review/correction, per the
  user's explicit multi-agent instruction for this feature.

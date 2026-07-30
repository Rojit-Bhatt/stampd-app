# Samparka-Parity Feature Roadmap

**Date:** 2026-07-30
**Status:** Roadmap — each entry needs its own spec before implementation
**Source:** A batch of reference screenshots and requests covering eight independent subsystems

This document exists so the seven sub-projects *not* in the first batch have a
recorded shape, ordering and set of open questions. It is not an
implementation plan and does not authorise building anything. Each entry gets
its own brainstorm → spec → plan cycle.

## Sub-project index

| # | Sub-project | Status | Depends on |
|---|---|---|---|
| 1 | Create-with-preview modals (rewards, campaigns, events) | **Specced** — batch 1 | — |
| 2 | Image storage (`Image` model, WebP, cacheable reads) | **Specced** — batch 1 | — |
| 3 | Points settings restyle (toggle rows) | **Specced** — batch 1 | — |
| 4 | kokonutui component swaps | **Specced** — batch 1 | — |
| 5 | Per-outlet customer leaderboard | Roadmap | — |
| 6 | Customer-info collection toggles (DOB, gender) | Roadmap | Switch primitive (batch 1) |
| 7 | Events feed in `/explore` | Roadmap | — |
| 8 | Outlet role system | Roadmap | — |
| 9 | PIN-based earn / redeem | Roadmap | 8 |
| 10 | Dark mode | Roadmap | Switch primitive (batch 1) |

Recommended order after batch 1: **6 → 5 → 7 → 8 → 9 → 10.** Rationale: 6 is
small and unlocks the birthday trigger that already exists but has no data to
fire on; 5 and 7 are self-contained reads; 8 must settle before 9 can be
designed at all; 10 is a whole-app audit best done once the surfaces stop
changing.

---

## 5. Per-outlet customer leaderboard

Two views of one ranking: an admin view inside the Customers section, and a
customer-facing view inside that outlet's customer console.

**Shape.** Ranked by points earned within a date-filtered window (All Time /
This Month / This Week), derived from `PointsTransaction` — never from
`PointsBalance`, which is spend-adjusted and would rank a customer lower for
having redeemed. Scoped by `organizationId` like every other loyalty read.

**The hard question is the customer-facing view.** A leaderboard shows
customers to other customers. The isolation model says `CustomerAccount` is
never joined into or exposed through an admin-facing report, and the reason
generalises: a customer did not sign up to have their name ranked publicly.
Options to resolve in that spec:

- opt-in, with a display name the customer chooses
- first name plus last initial, no opt-in
- rank and points only; only *your own* row is named
- top N named, everyone else sees only their own position

The customer-facing leaderboard also must not leak across outlets: a customer
who visits three outlets sees three separate boards, and no board reveals that
any of its members visit anywhere else.

**Open questions.** Ties. Whether staff accounts are excluded. Whether an
inactive or suspended customer keeps a slot. Whether the admin view's CSV
export is a new report or an extension of `reportService`.

---

## 6. Customer-info collection toggles

Admin settings toggles for what registration collects: date of birth, gender.

**Why this one first.** The birthday messaging trigger already exists in
`PointsProgram` and `messagingTriggers`, but nothing in the product collects a
birthday, so the trigger can never fire. This closes a real gap rather than
adding a new surface.

**Shape.** Per-outlet settings flags. `CustomerAccount` is global identity, so
the field lives there, but the *requirement* to provide it is per-outlet — a
customer who joined outlet A without a birthday must be askable for one when
they join outlet B. That asymmetry is the main design question.

**Open questions.** Where an existing customer is prompted for a
newly-required field (registration only, or a nudge in the console). Whether
gender is a free-text field, a fixed list, or a list with a decline option.
Whether these fields flow into any report — they are personal data, and
`CustomerAccount` fields do not currently reach admin-facing reporting.

---

## 7. Events feed in `/explore`

A nav entry in the global customer layout listing events from all outlets,
most recent first.

**Shape.** `Event` and `eventService` already exist per-outlet. This needs a
cross-tenant read alongside `discoveryService`'s existing `discover` and
`my-tenants` — `verifyGlobalSession` only, no tenant resolution. Each row
links to its outlet's event, which is a normal tenant entry through
`TenantSessionSync`.

Cross-tenant aggregation is deliberate here, same as `/explore`'s discover
grid: it lists public listings, not loyalty data. Nothing about a customer's
balance or membership may appear.

**Open questions.** Whether past events drop off or show as ended. Distance
sorting versus date sorting (the discover grid already does haversine sorting
when geolocation is granted). Whether a third bottom-nav tab is added or the
existing two-tab nav grows a top-bar entry. Pagination for a platform with
hundreds of outlets.

---

## 8. Outlet role system

Roles inside a single outlet, so an outlet admin can grant limited access to
staff rather than sharing one login.

**Shape.** `User.role` currently has three values (`platform`,
`business_admin`, `customer`) and `AdminAccount.kind` has two
(`company_owner`, `outlet_admin`). This adds a sub-role dimension underneath
`business_admin` — likely a `permissions` set or a named role on the `User`
membership, not a fourth top-level role, since the tenant JWT's
`{userId, role, organizationId}` shape and the `isBusinessAdmin` guard are a
security boundary that should not gain new shapes lightly.

**Open questions.** The permission taxonomy (who can redeem, who can see
reports, who can change the program, who can manage staff). Whether a role is
per-outlet or per-company. How an invited staff member verifies email —
`AdminAccount` already requires verification before login, and the unified
slug-less `/api/admin-auth/login` branches on `kind`. Whether the company
owner console manages outlet roles or each outlet manages its own.

---

## 9. PIN-based earn / redeem

**This one has a real conflict with the existing design and must not be
copied from the reference without resolving it.**

The current loop is deliberately staff-initiated. Staff enters the bill amount
and generates a 30-second single-use QR; the customer scans it with their
phone camera and the points move. Redemption is staff-initiated for the same
reason — a customer must never be able to move their own balance, and the
sufficient-funds check is an atomic guarded `findOneAndUpdate` precisely so two
concurrent redeems cannot both pass.

A static 4-digit store PIN inverts that. Anyone who memorises the PIN can
award themselves points indefinitely, and the bill amount stops being
staff-attested — which matters because the award is a function of the bill.
The reference product's model works because its earn is a flat check-in, not a
percentage of a bill.

**Options for that spec, none of them "add a store PIN":**

- PIN as *staff authentication* at the counter — a per-staff-member PIN that
  authorises generating an earn QR or confirming a redeem, replacing password
  re-entry on a shared device. This is the reading that fits the existing
  model and pairs naturally with sub-project 8.
- PIN as a *fallback claim path* when a camera fails — staff reads a
  short-lived code aloud, customer types it. Same single-use token, different
  transport. Preserves staff initiation.
- PIN as *redemption confirmation* — customer picks a reward, staff enters a
  PIN to authorise the handover.

Whichever is chosen, the invariants that must survive: earn requires a
staff-attested bill; a customer cannot move their own balance; the
single-use-token guard continues to serialise claimers; `DynamicQRToken.purpose`
continues to prevent an earn code being used on the redeem path.

---

## 10. Dark mode

`index.css` already carries a full `.dark` token set; nothing toggles it.

**What shipping it actually costs**, beyond adding a switch:

- 29 hardcoded `bg-white` sites stay white in dark mode
- `lib/color.ts` derives `--brand-ink` / `--brand-on` through a contrast check
  that assumes a light backdrop; a tenant brand colour would be measured
  against the wrong background in dark
- `.dark`'s own `--brand` is hardcoded green, which the tenant's inline style
  overrides — so the dark block's brand tokens are currently decorative
- `scripts/verify-tenant-color.ts` guards both tenant-colour invariants and
  would need to run in both themes

The invariant that must hold in either theme: `--primary` green means value and
action, `--brand` means tenant identity, and the two never swap jobs.

**Open question.** Whether the customer console is included. It is the surface
with tenant brand theming and therefore the whole of the contrast risk; the
admin, platform and company consoles are fixed-identity and comparatively
cheap.

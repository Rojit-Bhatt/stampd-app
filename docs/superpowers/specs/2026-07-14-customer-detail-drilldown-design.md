# Epic D1 — Customer Detail Drill-in

**Date:** 2026-07-14
**Status:** Approved design, ready for implementation plan
**Scope:** First of four specs decomposed from the original "Epic D" (customer drill-in, Excel report, contact/maps config, featured-items/events cards). This spec covers only the admin's customer-detail slide-over. D2 (Excel report), D3 (contact/maps config), D4 (featured items/events) are separate, independent specs.

## Context

Multi-tenant loyalty SaaS ("Stampd"). The admin's Customers screen (`AdminCustomers.tsx`) shows a flat list — name, email, customer #, stamps, valid-voucher count, last visit — with no way to see more. The ask: clicking a row opens a detail view with richer per-customer information.

**A blocking dependency surfaced during brainstorming:** the requested "total money spent" metric requires the bill amount entered at QR-generation time (Epic B1) to actually be recorded somewhere. B1's design explicitly decided to **discard** it after the pass/fail check (`docs/superpowers/specs/2026-07-14-min-bill-amount-gate-design.md`, decision 4) — nothing persists it today. This spec reopens that decision: **billAmount now gets persisted going forward**, as a small precursor change, not a re-litigation of B1's gate logic (the gate itself — hard-reject below the configured minimum — is untouched).

## Decisions locked during brainstorming

1. **Presentation: slide-over drawer**, not a separate route. Clicking a row opens a panel over the list (list stays visible/dimmed behind it); closes via X or click-outside. No new URL, no back-button plumbing, no lost scroll position.
2. **Drawer fields:** Name, Email, Customer #, Phone, Address, Current stamp count (`X/required`), Lifetime voucher total, Total spent, Recent visits (up to 10 most recent scan timestamps — already fetched server-side today, just never surfaced to the frontend).
3. **Phone/Address:** already exist on the `User` model (added in Epic A) — `getCustomersList` simply needs to include them in its response; no schema change for these two.
4. **Lifetime voucher total ≠ the existing `validVoucherCount`.** `validVoucherCount` (already on the list row) counts only currently-unredeemed (`isValid: true`) vouchers. The new `lifetimeVoucherCount` counts **every** `Voucher` ever created for that customer, redeemed or not — a "how many rewards has this customer earned from us, ever" metric.
5. **Bill-amount persistence (the reopened B1 decision):** `billAmount` is now saved on `DynamicQRToken` at generation time, then copied onto `StampClaimEvent` at the moment a claim consumes that token. "Total spent" = sum of `billAmount` across a customer's `StampClaimEvent`s. **Not retroactive** — claims made before this ships have `billAmount: null` and contribute 0 to the sum. The gate's enforcement logic in `generateQRToken` (hard-reject below `minBillAmount`) is unchanged; this only adds persistence of the value that already flows through that function.
6. **Recent visits list:** reuses the exact data `getCustomersList` already builds (`scanHistory`, capped at 10, already tenant/customer-scoped) — currently computed but never rendered by the frontend.

## Data Model

### `backend/models/DynamicQRToken.js` — one new field

| Field | Type | Rule |
|-------|------|------|
| `billAmount` | Number | `default: null`. Set from whatever the barista entered at generation (or `null` if the gate was disabled and nothing was entered). |

### `backend/models/StampClaimEvent.js` — one new field

| Field | Type | Rule |
|-------|------|------|
| `billAmount` | Number | `default: null`. Copied from the consumed `DynamicQRToken.billAmount` at claim time. |

No other schema changes. `User.phone`/`User.address` already exist (Epic A). `Voucher` is unchanged — the "lifetime" count is a different query shape (no `isValid` filter), not a new field.

## Backend

### `backend/services/stampService.js`

- `generateQRToken(adminUserId, organizationId, billAmount)`: the `DynamicQRToken.create({...})` call gains `billAmount: billAmount !== undefined && billAmount !== null && billAmount !== "" ? Number(billAmount) : null` — stores whatever valid value was provided (already validated against `minBillAmount` earlier in the same function when the gate is enabled), or `null` when nothing was entered (gate disabled).
- `claimStamp({...})`: after `existingToken` is loaded (before it's marked used), capture `const billAmount = existingToken.billAmount ?? null;`. Both `StampClaimEvent.create([...])` call sites (the brand-new-card branch and the existing-card branch) gain `billAmount` in the created doc, using that captured value.

### `backend/controllers/stampController.js` — `getCustomersList`

For each customer, alongside the existing `stampsEarned`, `lastStampedAt`, `validVoucherCount`, `scanHistory`:

- Add `phone: customer.phone`, `address: customer.address` (straight off the already-loaded `customer` doc — no extra query).
- Add `lifetimeVoucherCount`: `await Voucher.countDocuments({ userId: customer._id, organizationId })` (no `isValid` filter — every voucher ever created for this customer in this tenant).
- Add `totalSpent`: sum of `billAmount` across that customer's `StampClaimEvent`s. Given the mock DB's limited aggregation support (no `$group`/`$sum` pipeline), compute this by fetching the customer's `StampClaimEvent`s (already being fetched for `scanHistory`, but that query is `.limit(10)` — the sum needs *all* events, so this becomes two queries: the existing capped-10 fetch for the visit list, and a separate uncapped fetch — or one uncapped fetch reused for both, slicing the first 10 client-side for the list. Implementation detail resolved in the plan, not the spec) and reducing `billAmount || 0` across them in JS.

## Frontend

### `frontend/src/routes/admin/AdminCustomers.tsx`

- `AdminCustomer` interface gains `phone: string`, `address: string`, `lifetimeVoucherCount: number`, `totalSpent: number`, `scanHistory: { id: string; timestamp: string }[]`.
- Clicking a row (the whole row becomes a button/clickable element) sets a `selectedCustomer` state and opens a new `CustomerDetailDrawer` component.
- `CustomerDetailDrawer`: fixed-position panel sliding in from the right (or a simple overlay + centered card, matching the existing admin console's visual language — no new design system introduced), showing: name, email, customer #, phone, address, stamps (`X/{required}`), lifetime vouchers, total spent (formatted as a plain number/string, consistent with how `MenuItem.price` and bill amounts are displayed elsewhere — no currency-symbol assumptions baked in beyond what's already used in this codebase), and a "Recent visits" list of the up-to-10 timestamps. Closes on an X button or a click on the dimmed backdrop.

## Testing / Verification

1. **Backend**, self-contained via `tests/helpers/bootServer.js`, extending or adding to the existing `min-bill-amount.js` suite (or a new focused file — resolved in the plan):
   - Generate a QR with `billAmount: 500`, claim it → the resulting `StampClaimEvent` (verified indirectly through `getCustomersList`'s `totalSpent`) reflects that 500.
   - Generate + claim a second time with `billAmount: 300` (gate disabled or a lower configured minimum) → `totalSpent` accumulates to 800.
   - A claim made via a token with no `billAmount` (gate disabled, nothing entered) contributes 0 — confirm `totalSpent` isn't `NaN`/`null` after mixing in a no-amount claim.
   - `getCustomersList` for that customer returns `phone`, `address` matching what they registered with, `lifetimeVoucherCount` counting redeemed + unredeemed correctly (distinct from `validVoucherCount`), and `scanHistory` populated.
   - Tenant isolation: a customer's `totalSpent`/`lifetimeVoucherCount` in tenant A is unaffected by activity in tenant B.
2. **Frontend:** `npx tsc --noEmit` clean.
3. **Browser**, tenant `coffesarowar`: as the admin, click a customer row with real claim/voucher history → drawer shows all fields correctly, closes via X and via backdrop click.

## Out of scope

D2 (Excel report), D3 (contact/maps config), D4 (featured items/events) are unaffected. Voucher *codes* (not just counts) are not shown in the drawer (not requested). Backfilling `billAmount` for pre-existing `StampClaimEvent`s is explicitly not done (decision 5 — going-forward only).

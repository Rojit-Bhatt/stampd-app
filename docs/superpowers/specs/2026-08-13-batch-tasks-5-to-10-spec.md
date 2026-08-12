# Batch Spec — Tasks 5–10

**Date:** 2026-08-13 · **Author:** Manus AI
**Scope:** Six tasks delivered in one batch under the agreed "full auto" mode. Each task keeps its own branch and PR for reviewability, then everything is merged to `main` together at the end per the user's instruction.

---

## Task 5 — Redeem Report

**Goal.** The outlet admin console's Reports section gains a **Redeem Report** page showing a detailed, filterable view of every redemption at the outlet, presented as stat cards, a time-range chart, and a detail table, plus an Excel download button consistent with the existing Summary/Customers/Transactions reports.

**Requirements.**

1. New page `AdminReportsRedeems` reachable from the same Reports navigation as the Summary and Customers reports, at route `/reports/redeem`.
2. **Stat cards** over the selected range: total redemptions, total points redeemed, unique customers who redeemed, and the top redeemed item/reward.
3. **Time-range chart** of redemptions per day across the selected window (the same day-bucketing approach reportService already uses for the summary chart), so spikes and dry spells are visible.
4. **Detail table** with one row per redemption: date/time, customer, item/reward name, points used, and reward value in Rs. Same time filters as other reports (today / 7 days / 30 days / this month / custom range), reusing the existing `DateRangeFilter` component.
5. **Excel export** button matching the Summary report's pattern: `GET /api/admin/reports/redeem/download?startDate=&endDate=` returning `redeem-report.xlsx` with the same headers as the table.
6. **Visual + text parity:** figures rendered both as a chart and as the numbers in the stat cards and table; no visual-only information.

**Constraints.** Ledger source is `PointsTransaction` (type `redeem`), whose denormalized fields (`userId`, `rewardName`, `rewardKind`, `pointsCenti`, `rewardValueNpr`, `performedByName`) already carry everything the report needs; no schema changes.

---

## Task 6 — Click-to-sort table headers

**Goal.** The Customers and Transactions tables in the outlet admin sort on header click, cycling through **ascending → descending → original (newest-first)** order, so an admin can quickly rank customers by points or joins, or transactions by date or amount, without leaving the page.

**Requirements.**

1. A shared `SortableHeader` component: a header cell that shows a sort arrow (or neutral placeholder) and cycles direction on click. Keyboard accessible (Enter/Space triggers the cycle), announced via `aria-sort`.
2. Apply to the **Customers** table (name/email, points, joins date) and the **Transactions** table (date, type, points/amount, bill). Sorting happens client-side over the already-loaded page of rows; the existing server-side pagination filter (search/category) is preserved.
3. Three-state cycle: ascending → descending → original (load order, which is newest first). The original order is always reachable in at most two clicks.
4. Sorting by points/amount is numeric, by date is chronological, by name is alphabetical and case-insensitive.
5. The sorted column gets a visible arrow indicator; other columns show a neutral, subtle indicator so the affordance is discoverable.

**Constraints.** Strictly the customers and transactions tables — the menu grid is deliberately excluded per the user's decision.

---

## Task 7 — Repeat customer definition in Impact

**Goal.** The Impact section's "repeat customers" figure should count customers who came back on a **different day**, not customers who merely earned points twice. A customer who earns once and redeems on a later visit must count as a repeat customer.

**Requirements.**

1. In `impactService.summarizeEarns`, a customer is a **repeat** when they have qualifying activity (any earn **or** redeem transaction) on **two or more distinct local days**.
2. Day boundaries use the same Nepal-local midnight logic (`startOfLocalDay`, `PLATFORM_TIMEZONE`) already present in reportService, so a 10:00 pm visit and an 1:00 am visit that fall on different Nepal days count as two days, and two visits in the same afternoon do not.
3. `repeatRevenue` keeps its existing meaning — the total revenue of repeat customers, first visit included. Only the *classification* of which customers are repeat changes.
4. `retentionPercent` and `avgSpendPerRepeatCustomer` derive from the corrected counts automatically; no UI changes.
5. `earnsByAccount` continues to drive the customer count and revenue; the distinct-day set is built alongside it in the same single pass over the ledger.

**Constraints.** Impact is all-time; no date window changes. Company-console Impact reuses the same service, so both consoles get the corrected figure together.

---

## Task 8 — Platform analytics: total registered customers

**Goal.** The platform admin console's Analytics page shows the total number of **registered customer accounts** on the platform — people who created an account, regardless of whether they are members of any outlet yet.

**Requirements.**

1. A new "Registered customers" metric card on `/platform/analytics`, alongside Companies/Outlets/Customers. It counts `CustomerAccount` documents — the global identity — including accounts whose email is not yet verified (per user confirmation, "registered" means the account exists).
2. The card shows the total plus a **7-day trend** (current week vs previous week), consistent with the existing metric cards.
3. Backend: `platformAnalyticsService.getPlatformAnalytics` adds `registeredCustomersTotal` and a `registeredCustomers` trend metric computed from `CustomerAccount.countDocuments` over the same week windows used by the other trends.
4. The existing "Customers" card continues to mean the same thing as today (documented as customer memberships across outlets via the same identity count), so the two cards read as "accounts created" vs "active in a loyalty program".

---

## Task 9 — WhatsApp "Talk to us" on the pricing section

**Goal.** Each tier card's **Talk to us** button on the landing page's `/` pricing section opens a WhatsApp chat pre-filled with a plan-specific message, so the sales conversation starts with the right context.

**Requirements.**

1. Replace the single shared `contactHref` for pricing CTAs with a per-plan `wa.me` link: `https://wa.me/{digits}?text={encoded message}`. The number comes from the platform contact configuration (`contact.phone` via `/api/platform/public-contact`), passing through the existing `toWaNumber` sanitiser — no hardcoded number ships.
2. One message template per plan, drafted to read naturally when the conversation opens:
   - **Basic** — interest in the entry tier, Rs 999/yr, 1 outlet.
   - **Growth** — interest in the most-popular tier, Rs 2,499/yr, up to 3 outlets.
   - **Pro** — interest in the top tier, Rs 4,999/yr, up to 6 outlets.
   Templates include the plan name, price, and outlet allowance; wording left to the implementer (user gave approval to draft freely).
3. The button opens in a new tab (`target="_blank" rel="noreferrer noopener"`), matching the existing WhatsApp float behaviour; on desktop it lands on WhatsApp Web, on mobile on the app — the standard `wa.me` behaviour.
4. If no phone is configured, the CTAs keep the current `#pricing` anchor fallback so the page never renders a broken chat link.

---

## Task 10 — Error message UX overhaul

**Goal.** Errors must be impossible to miss: field-level validation errors render **inline, in red, directly below the offending input**; form-level failures render as a red alert near the form top; session-level failures keep a toast with a red treatment. A full audit surfaces every place an error is swallowed or never displayed.

**Requirements.**

1. **Inline field errors.** Each validated input renders its error message immediately below it, in red text (`var(--lp-terra)` is the palette's red — the login page already uses it, so it becomes the standard), with the input's border turning red while the error is active. Inputs are linked to their error text via `aria-describedby`; errors are announced by assistive tech through `aria-invalid`.
2. **Trigger policy (best practice).** Field errors appear after the field has been touched and blurred, or immediately on submit for untouched fields; the original untouched state is never red.
3. **Form-level errors** (server-side failures like wrong credentials) render a red banner/alert at the top of the form with an actionable message ("Incorrect email or password — please check and try again."), plus the usual toast so it isn't lost.
4. **Toasts.** `toast.error` gains a red icon/accent variant (the app's neutral-toast rule is extended: icon stays shape-coded but error toasts now also tint red, per the user's explicit direction for errors). Every async failure path audited must call `toast.error` where it today fails silently.
5. **Audit scope.** Login (admin + platform + customer, including global/guest login), registration and email-verification flows, forgot/reset password, and every form on the consoles that validates input (invite admin, staff settings, plan editing, contact settings, QR generation, menu import, campaign/event/reward form modals, sub-admin PIN gate). For each: show inline errors where inputs exist; surface server messages that today are swallowed; add `toast.error` where a failure currently only stops a spinner.
6. **Consistency helper.** A small `FieldError` shared component implements the red text, spacing, and ARIA wiring so every form renders the same pattern.

**Research basis.** Inline errors under the failing field with red affordances, blur/submit triggering, and `aria-invalid`/`aria-describedby` pairing are the established pattern recommended by Material Design, Shopify Polaris, and GOV.UK form-design guidance; banner-level messages cover form-wide failures; toasts remain for non-field, session-level feedback.

---

## Delivery model

Each task gets its own feature branch and PR (squash-merge), spec + plan docs live under `docs/superpowers/` per the Superpowers workflow. When every task is verified, all branches are merged into `main` together and production is updated — no per-PR merge confirmations, per the user's explicit full-auto instruction for this batch. PRs #22, #23, and #24 (open from earlier tasks) are merged in the same final pass unless the user says otherwise.

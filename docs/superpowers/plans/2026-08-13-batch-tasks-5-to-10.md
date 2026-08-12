# Implementation Plan — Tasks 5–10

**Date:** 2026-08-13 · **Author:** Manus AI

Branching: one branch per task (`feature/redeem-report`, `feature/sortable-table-headers`, `feature/repeat-customer-fix`, `feature/platform-registered-customers`, `feature/pricing-whatsapp`, `feature/error-ux`). Each pushed, PR opened with a body file. Final step: squash-merge all to `main` including PRs #22–#24.

---

## Task 5 — Redeem Report (`feature/redeem-report`)

**Backend.** `backend/services/reportService.js` gains `getRedeemStats(organizationId, { startDate, endDate })` returning: rows (date, customerName via performedByName with userId fallback, rewardName, points, valueNpr), totalRedemptions, totalPointsRedeemed, uniqueCustomers, topItem, and a daily chart series (date, count, points) built with the existing `dayKey`/`startOfLocalDay` bucketing. `backend/controllers/reportController.js` gains `getRedeemReport` (JSON) and `downloadRedeems` (xlsx via `buildRedeemWorkbook` using the same exceljs pattern as `buildTransactionsWorkbook`). `backend/routes/adminRoutes.js` registers `/reports/redeem` and `/reports/redeem/download` with `verifyToken, isBusinessAdmin, canReports`.

**Frontend.** New `frontend/src/routes/admin/AdminReportsRedeems.tsx` modelled on `AdminReportsSummary.tsx`: `DateRangeFilter`, four stat cards (Total redemptions, Points redeemed, Unique customers, Top redeemed item), a line chart of daily redemptions/points (recharts, same palette tokens as the summary chart), and the detail table using the shared `ScrollableTable` from Task 4 with sticky first column. A Download Excel button hits `/api/admin/reports/redeem/download?...`. Wire into the admin Reports navigation in `AdminLayout` alongside Summary/Customers. Skeleton loading states match sibling pages.

## Task 6 — Sortable headers (`feature/sortable-table-headers`)

New `frontend/src/components/shared/SortableHeader.tsx` — a button rendering the column label + a direction arrow (`ArrowUpDown` neutral / `ArrowUp` / `ArrowDown`), cycles `none → asc → desc → none` (none == original), `aria-sort` announced, focusable. Usage: tables keep their state `{ col, dir }`, rows are `.slice()` sorted (stable) before render; original order restored when `dir === "none"`. Numeric/date/name sorters per column type. Apply to the Customers header row (name, points, joined) and Transactions header row (date, type, points/amount, bill). No backend changes — the whole page fits in one load.

## Task 7 — Repeat customer fix (`feature/repeat-customer-fix`)

Edit `backend/services/impactService.js` only. In `collectOutletFacts`, build a `daysByAccount: Map<key, Set<dayKey>>` across **all** transactions (earn + redeem), using `startOfLocalDay(txn.createdAt).getTime()` as the day key. `summarizeEarns` takes the new argument and counts a customer repeat when `days.size >= 2`. `repeatRevenue` unchanged (sum of row revenue for repeat customers). Tests via the existing seed data and a local API call to `/api/admin/impact` for the demo outlet before/after check.

## Task 8 — Platform registered customers (`feature/platform-registered-customers`)

Backend `backend/services/platformAnalyticsService.js`: add `registeredCustomersTotal = await CustomerAccount.countDocuments({})` and trend computed as current-week minus previous-week `CustomerAccount` counts over the same week windows; return `registeredCustomers: { value, trend }`. Frontend `frontend/src/routes/platform/PlatformAnalytics.tsx`: add metric card "Registered customers" (total + 7d trend, e.g. "+12 this week"), placed right after the Customers card, label "accounts created" as sub-copy to distinguish from the outlet-membership count.

## Task 9 — Pricing WhatsApp (`feature/pricing-whatsapp`)

Edit `frontend/src/routes/platform/landing/SectionPricing.tsx` + `data.ts`. Import `usePlatformContact` and `toWaNumber`; if no phone, fall back to `#pricing`. Per plan, render `https://wa.me/${number}?text=${encodeURIComponent(template)}` where templates are:

> Basic — "Hi Stampd! I'm interested in the Basic plan (Rs 999/year, 1 outlet). Could you tell me more?"
> Growth — "Hi Stampd! I'm interested in the Growth plan (Rs 2,499/year, up to 3 outlets). Could you tell me more?"
> Pro — "Hi Stampd! I'm interested in the Pro plan (Rs 4,999/year, up to 6 outlets). Could you tell me more?"

Templates keyed by `plan.name` via a small `PRICING_TEMPLATES` map. `CtaPill` becomes an `<a>` with `target="_blank" rel="noreferrer noopener"` (keep the pill styling).

## Task 10 — Error UX (`feature/error-ux`)

1. Shared helpers in `frontend/src/components/shared/FieldError.tsx`: `FieldError({message})` (red `text-[var(--lp-terra)]` text-xs, pl-1, `role="alert"`) and an `errorProps(valid, hasError, touched)` helper that emits `aria-invalid` + `aria-describedby` + red border. For react-hook-form forms, a small `fieldErrorProps(field, errors)` wrapper.
2. Toasts: `frontend/src/lib/toast.tsx` — error toasts get a red-tinted icon chip (`bg-[var(--lp-terra)]/10 text-[var(--lp-terra)]`) and a red left border; success stays neutral. All `toast.error` call sites keep working (API unchanged).
3. Login pages (`AdminLogin`, `PlatformLogin`, `CustomerLogin`, `GlobalCustomerLogin`): server error (`err.message`) renders a red `Alert` banner at form top with "Incorrect email or password — please check and try again."-style wording, keyed by known error codes (`INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_LOCKED`, `NOT_FOUND`); field errors already show (react-hook-form) but get the shared `FieldError` treatment.
4. Registration / verify / forgot / reset flows: same banner for server errors; email/phone/password mismatch errors inline under the field.
5. Console forms audit (each gets inline errors + toast.error where swallowed): CampaignFormModal, EventFormModal, RewardFormModal, SubAdminSettingsTab, StaffPinGate, CustomerInfoSettingsTab, AdminContact, AdminBroadcasts (audience failures), MenuManagement (import errors), GenerateQr, Branding (upload), CompanyDetail/PlatformContact/PlatformTeam/Plans console edits, Invitation flows.
6. Lint/TS pass after each subtask; spot-check login page visually at mobile and desktop.

---

## Final pass

1. Run `npm run lint -w frontend` + backend node run smoke on each branch.
2. Verify in browser at localhost:3000 (dev login: outlet `durbarmarg@coffesarowar.com`/password via `/admin-login`; platform via `/platform/login`).
3. Push all branches, open PRs #25–#30.
4. Squash-merge #22–#30 into `main`, delete branches, confirm production build triggers (Render/Cloudflare).
5. Final result message with all PR links.

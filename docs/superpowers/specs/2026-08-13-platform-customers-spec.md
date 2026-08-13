# Spec — Platform Customers detail page (bug-fix round 2, B2)

## Context
Bug-fix round 2 item reported by the user: the platform admin's console shows a total-registered-customers tile (Task 8), but there is no Customers section from which the platform admin can see the details of every customer registered to the platform.

## Goal
A platform-console page at `/platform/customers` listing every `CustomerAccount` ever created (verified and unverified alike), with each customer's identifying details, their membership state, points balance and verification status, plus search, sortable columns and an Excel export, matching the look of the existing Analytics/Companies pages.

## Users
Platform admin only (authenticated, `role: platform` — already enforced by `PlatformLayout` + `isPlatformAdmin` middleware on the API).

## Requirements

### R1 — Backend endpoint `GET /api/platform/customers`
Returns a list of every `CustomerAccount` with, per row:
- `id`, `name`, `email`, `phone`, `emailVerified`
- `company` (name + slug) and `outlet` (name + slug) taken from the customer's `User` membership row
- `pointsBalance` (whole points, from `PointsBalance.balanceCenti`), `tier`, `redemptionCount` (from `PointsBalance`)
- `joinedAt` (CustomerAccount `createdAt`), `lastActivityAt`

Notes:
- One customer may be a member of zero, one, or many outlets. Customers with no membership still appear (they registered, just never joined an outlet) — company/outlet columns read "—" for them.
- Pagination is unnecessary at demo scale; keep it a single list but cap the response to a reasonable defensive limit (1,000 rows) with a warning flag if truncated.
- Auth: `verifyToken` + `isPlatformAdmin`, same pattern as `/api/platform/companies`.

### R2 — Frontend page `/platform/customers`
Shell mirrors `PlatformAnalytics` (page title + description, same container chrome). Contents:
- Search input (debounce ~200 ms) filtering by name / email / phone / company / outlet.
- Sortable table columns: Customer (name + email), Company, Outlet, Points, Redemption count, Tier, Joined, Verified. Header clicks cycle ascending → descending → original, identical component-level pattern to the already-merged Customers/Redeem sort (local `sortKey`/`sortDir` state in JS — no backend sorting needed).
- Verified column renders a small badge (Yes green / No muted).
- Excel export button (top right) calling `GET /api/platform/customers/report/download?search=` — mirrors `downloadCompaniesReport`.
- Empty state + loading skeleton (same as other console pages).

### R3 — Navigation
New console section "Customers" in the platform nav (after Analytics, before Billing), and a matching command-palette entry.

### R4 — Styling/theme
Page uses CSS variables (`var(--bg)`, `var(--surface)`, …) like other console pages — dark-light neutral.

## Non-goals
- Per-outlet analytics, customer edits/deletes, or marketing consents management — the platform admin only inspects here.
- Server-side sorting/pagination — out of scope at current scale.

## Acceptance
1. `GET /api/platform/customers` (platform token) returns all seeded demo customers with correct company/outlet/points/tier/verification fields; 401/403 without platform auth.
2. `/platform/customers` renders all demo customers; search narrows rows; each header click cycles asc → desc → original; export downloads an xlsx whose first row is the header row and which contains every visible row.
3. Lint (`tsc --noEmit`) passes; page looks correct at desktop and mobile widths.

# Organisation (outlet) switcher for company owners

Date: 2026-08-03
Status: approved, not implemented

## Scope

Sub-project 3a of the original four-group request (landing carousel + review
QR, and auth redesign + OTP, already shipped). Covers only the switcher.
Profile page redesign (3b) and the notification center (3c) are separate
specs — the "UI improvements" ask decomposed into three independent
sub-projects once the notification piece turned out to need a new backend
model, not a restyle.

## Problem

A company owner who calls `POST /api/company/enter-outlet` (already used by
`CompanyDashboard.tsx`'s "enter outlet" buttons) trades nothing away — the
call only *adds* a tenant JWT (`admin_auth_token`) alongside the existing
`company_session`; nothing clears the company session. Once inside that
outlet's console, though, there is no way back except browser back or typing
`/company` — and no way to hop to a *different* outlet without doing that
round trip. `AdminLayout.tsx`'s topbar has no awareness that the signed-in
"admin" might actually be a company owner just passing through.

## Design

### Detecting "this is a company owner, not a real outlet admin"

`AdminLayout.tsx` already renders inside a `TenantScope`/`AdminGuard` context
authenticated by `admin_auth_token`. The switcher renders only when
`localStorage.getItem("company_session")` is also present and non-null — a
genuine `outlet_admin` (one outlet, no company relationship) never has this
key at all, so the check is a plain existence read, no new API call.

### The dropdown

A new `OrgSwitcher.tsx` in `components/admin/`, placed in `AdminLayout.tsx`'s
topbar next to the existing `AccountMenu`. Reuses the same `DropdownMenu`
primitive `AccountMenu` already uses (`components/ui/dropdown-menu`), so it
matches that component's exact visual language rather than introducing a
second dropdown style.

- Trigger: the company name (fetched once, cached) with a chevron — e.g.
  "Coffesarowar Group ▾".
- Fetches `GET /api/company/outlets` with `role: "company"` (the exact call
  `CompanyDashboard.tsx` already makes) — company-session-authenticated, so
  it can only ever list that owner's own outlets. No new backend endpoint.
- Lists every active outlet (excludes archived, matching `CompanyDashboard`'s
  own `active` filter), the current one visibly marked/disabled.
- Picking a different outlet calls `POST /api/company/enter-outlet` with that
  outlet's id — the exact call `CompanyDashboard.tsx`'s `enterOutlet` already
  makes — then `window.location.href`s to that outlet's `/admin`, matching
  the existing full-reload pattern (a fresh tenant JWT changes what
  `AdminGuard` and every admin-scoped query key resolve against, so a full
  navigation is simpler and more certain than trying to hot-swap in place).
- A pinned first item, "Back to company dashboard", clears `admin_auth_token`
  / `admin_auth_user` and navigates to `/company` — the reverse trip.

### No backend changes

`POST /api/company/enter-outlet` and `GET /api/company/outlets` already exist
and are already correctly scoped (`verifyCompanySession` middleware, per
`companyRoutes.js`) — this is a frontend-only feature.

## Testing

Frontend-only change; no new backend test. Verification is `npm run lint`
plus manual browser checks:

1. Sign in as a genuine outlet admin (e.g. `thamel@coffesarowar.com`) — the
   switcher must NOT render (no `company_session` in localStorage).
2. Sign in as a company owner (`owner@coffesarowar.com`), enter an outlet from
   `/company` — the switcher renders, showing the company name and the
   current outlet excluded/marked from the list.
3. Pick a different outlet from the dropdown — lands in that outlet's console
   with a fresh tenant JWT (confirm via `localStorage.admin_auth_user`).
4. "Back to company dashboard" — lands at `/company`, `admin_auth_token` is
   cleared, `company_session` is untouched (still signed in as the owner).

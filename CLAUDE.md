# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **multi-tenant white-label loyalty SaaS** (the "Druto" model). The platform owner onboards nearby cafes/restaurants; each becomes an isolated **tenant** with its own branded space, its own stamp program, its own customers. One codebase serves many businesses. "Coffesarowar" is now just the first seeded tenant, not the product.

The core loyalty loop: a barista generates a short-lived QR → the customer scans it with their **phone's own camera** (no app install), lands on a public claim page, signs in or registers with zero friction if already recognized → earns 1 stamp (per-tenant cooldown) → at the tenant's `stampsRequired` threshold, a reward voucher auto-generates and the stamp balance resets → barista redeems the voucher. A customer can also stamp from inside the app itself via the in-app camera scanner.

**Migration state:** multi-tenant backend/frontend, the global customer-identity + QR-as-link claim flow, the full visual redesign, and a global `/explore` cross-tenant business directory (see below) are all done and merged to `main`. `.env.example` files document every required var. Remaining: deploy (Vercel + Atlas), LAN HTTPS for on-phone testing.

**In progress (branch `redesign-stampd-visual-system`, not yet merged):** Menu Management redesign + safe Excel import, and Admin Dashboard analytics/charts. Locked decisions so far:
- Replace `xlsx` (unpatched CVEs GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9, flagged in `menuService.js`) with **ExcelJS** everywhere it's used (`menuService.js`, `reportService.js`) — independent implementation, not a SheetJS wrapper like `node-xlsx`.
- Menu import becomes stateless preview/confirm: parse → return full new/changed/unchanged diff to the client → client POSTs back the approved subset → write via existing `createItem`/`updateItem`. No server-side temp storage. Match key is **name only, case-insensitive** (no SKU/id column exists in the import format).
- `MenuItem.price` converts from String to Number (needs a one-time migration script + `CustomerMenu.tsx` display update).
- New charting library: **Recharts** (none existed before).
- Dashboard trend %s must be real, computed week-over-week — only for flow metrics (new customers, stamps issued, revenue) that have a meaningful prior-window comparison; snapshot metrics (e.g. active vouchers right now) get no trend badge, by design, not by oversight. Never fabricate metrics or copy ("Recent Activity" feed, "Campaign Spotlight", trend numbers) that reference designs may show but the data model can't actually back.
- New Voucher Performance report: redemption rate/avg days-to-redeem scoped to a single cohort (vouchers *earned* in the selected date range, checked for redemption regardless of when), not two independently-filtered populations.

**Stale docs:** `docs/00-overview.md` and `docs/01-project-rules.md` describe the OLD single-cafe app and explicitly list multi-tenancy as out-of-scope. That is obsolete — the product pivoted. Trust the code over those docs. The governance rules in `docs/01` (thin controllers, service-layer logic, no unapproved deps) still apply.

## Commands

Run from repo root (npm workspaces: `backend`, `frontend`):

```bash
npm run dev              # backend :5001 + frontend :3000 concurrently
npm run build            # build frontend
npm run lint             # frontend typecheck (tsc --noEmit)
```

Backend (`cd backend`):

```bash
npm run dev              # node --watch server.js
npm test                 # chained run of every tests/*.js suite (see package.json)
npm run test:integration # single suite
npm run test:voucher
npm run test:isolation   # the key cross-tenant leakage test
```

Tests are plain `node tests/*.js` scripts (no framework) that boot against the in-memory mock DB. Run one directly: `node backend/tests/multi-tenant-isolation.js`. New suites must be added to `package.json`'s `test` script's chain to run in CI/`npm test`.

## Zero-config dev DB

There is **no real MongoDB in dev.** When `MONGODB_URI` is unset, `server.js` monkey-patches `require("mongoose")` to return `utils/mockMongoose.js` — an in-memory Mongoose shim. Same when `JWT_SECRET` is unset (dev fallback key; both **fatal in production**).

The mock is deliberately partial — know its limits before writing queries against it:
- Query matching: top-level equality, `$or`, `$lte`, `$gte` only. No nested-path or other operators.
- `.populate()` only handles the `userId` path.
- **No `findById`** — use `findOne({ _id })`.
- It DOES fill nested schema defaults (`computeDefaults`) so `Organization.program` / `.branding` populate correctly.

Because it is in-memory, it does not persist across serverless invocations — **production needs MongoDB Atlas.**

`seedDemoData()` only seeds a legacy per-tenant `User` row for the demo customer — it does **not** create a matching global `CustomerAccount`. Since customer login now goes through the global `/api/customer-auth` system (see below), the seeded `customer@mansarowar.cafe` cannot sign in via the UI on a fresh mock DB. To exercise a real customer session in dev, register a new account through `/​:slug/register` and verify it with the `/__test__/mint-global-token` hook (mock-DB-only, mirrors the real "check your email" flow without sending mail).

## Multi-tenant architecture

**Every loyalty record carries `organizationId`.** `User`, `StampCard`, `Voucher`, `DynamicQRToken`, `StampClaimEvent`, `MenuItem` are all tenant-scoped. Isolation is enforced by scoping every query with `organizationId` — when adding any query, it MUST include it, or you leak data across tenants. This is the invariant the whole product depends on.

**Three roles** (`User.role`):
- `platform` — SaaS super-admin, `organizationId = null`, onboards/suspends businesses.
- `business_admin` — a tenant's admin/barista.
- `customer` — a tenant's end user.

**Customer identity is global; loyalty data stays per-tenant.** A `CustomerAccount` (`models/CustomerAccount.js`) owns email/password/phone/name/emailVerified/googleId platform-wide — one signup works at every tenant. Each tenant's `User` (role `customer`) is a lightweight **membership** row linked via `User.customerAccountId`, and it alone still owns that tenant's `StampCard`/`Voucher`/`StampClaimEvent` rows. `name`/`phone`/`emailVerified` on the membership are denormalized copies kept in sync by `customerAccountService.ensureMembership` — this is what lets existing tenant-scoped code (`stampService`, admin customer list/reports) read a customer's identity fields with zero changes. **Reporting stays strictly per-tenant**: `CustomerAccount` is never joined into or exposed through any admin-facing report, so a cafe never sees that "its" customer also visits other cafes, and stamp/visit counts never bleed across tenants — this is the same `organizationId` isolation invariant, one layer below the shared identity.

Two parallel auth systems, deliberately kept separate: `business_admin`/`platform` login is untouched, tenant-scoped, `{userId, role, organizationId}` JWTs via `authService.js`/`authRoutes.js`. Customer auth is entirely global: a customer holds a long-lived **global session token** (`{type: "global_customer", customerAccountId}`, separate `JWT_GLOBAL_SECRET`, verified by `middleware/customerAuthMiddleware.js`) that is exchanged per-tenant for a normal tenant JWT via `POST /api/customer-auth/enter-tenant` (auto-provisioning the membership on first visit to a new tenant). The frontend's `TenantSessionSync` component runs this exchange on every `/:slug/*` page load, so a returning customer is recognized silently everywhere, not just on the QR-claim page.

**QR-as-link claim flow:** the QR a barista generates (`GenerateQr.tsx`) encodes a real URL (`/:slug/claim?token=...`), not a bare token, so it opens in the phone's native camera/browser with no app required. `/:slug/claim` converts the scanned `DynamicQRToken` (still 30s, single-use) into a longer-lived `PendingClaim` (`models/PendingClaim.js`, 15 min window) — this decouples "how long the on-screen QR is scannable" from "how long the customer then has to finish signing in." A brand-new signup's first stamp stays an unfulfilled `PendingClaim` until the customer verifies their email (possibly minutes later, another tab/device), at which point `pendingClaimService.autoFulfillForAccount` fulfills every pending claim for that account across all tenants.

**Two ways the active tenant is determined — do not confuse them:**
1. **Public/unauthenticated routes** (`/api/tenant`, `/api/menu`, `/api/auth` register/login) use `resolveTenant` middleware (`middleware/tenantMiddleware.js`), which reads the tenant from, in order: `X-Tenant-Slug` header → `:slug` param → Host subdomain. Sets `req.organization` + `req.organizationId`. This is subdomain-ready for the future custom-domain flip with no rewrite.
2. **Authenticated loyalty routes** (`/api/admin`, `/api/stamps`, `/api/vouchers`) take the tenant from the **JWT** (`req.user.organizationId`), NOT the URL. A user can only ever act within their own tenant regardless of any client-supplied slug — this is a security boundary, don't replace it with slug-based resolution.

Tenant JWT payload: `{ userId, role, organizationId }`, signed in `utils/tokenUtils.js`, verified in `middleware/authMiddleware.js` (`verifyToken` → sets `req.user`; `isBusinessAdmin` / `isPlatformAdmin` role guards). This covers `business_admin`, `platform`, and — after `enter-tenant` — `customer` too, so every already-existing tenant-scoped route needed zero changes for the global-identity migration. The separate global session token (`{type, customerAccountId}`) only ever proves "which `CustomerAccount`," never grants tenant access directly — its shape structurally can't pass `verifyToken`'s `userId`/`role` check even before considering it's signed with a different secret.

**Per-tenant program config replaces hardcoded constants.** `stampsRequired`, `rewardTitle`, `rewardDescription`, `cooldownHours` live in `Organization.program`; branding in `Organization.branding`; `Organization.category` (enum: `cafe`/`restaurant`/`bakery`/`salon`/`gym`/`retail`/`other`, default `other`) powers the `/explore` directory's filter pills — set at platform onboarding (`OnboardBusiness.tsx`) or self-service by the tenant (`Branding.tsx`). Defaults come from `config/platform.js` (`DEFAULT_PROGRAM`, `BUSINESS_CATEGORIES`). `PLATFORM_NAME` (default "Stampd") is the single rebrand knob for the whole SaaS; frontend mirror in `lib/platform.ts`.

## Backend layering (enforced)

`routes/ → controllers/ → services/ → models/`. Controllers are thin: parse request, call a service, format the HTTP response. **All business logic and multi-model/DB writes live in `services/`.** Keep the atomic `findOneAndUpdate` transaction style in `services/stampService.js` — the stamp claim uses a session + atomic cooldown-guarded update to prevent double-stamping races.

Route groups mounted in `server.js`:
- `/api/platform` — super-admin: onboard/list/manage tenants (`isPlatformAdmin`).
- `/api/tenant` — public tenant branding+program lookup by slug (`resolveTenant`).
- `/api/menu` — public display-only menu (`resolveTenant`).
- `/api/auth` — tenant-scoped business_admin/platform login only now (`resolveTenant`); customer register/login moved to `/api/customer-auth`.
- `/api/account` — shared profile/password endpoints for any authenticated role (`verifyToken`).
- `/api/customer-auth` — global customer identity: register/login/google/verify-email/forgot-reset password (no tenant needed), `enter-tenant` (exchanges a global session for a tenant JWT, `resolveTenant` + `verifyGlobalSession`), and the `/explore` surface's two reads — `discover` (every active business + a real recent-stamp-volume trending signal) and `my-tenants` (every membership the current `CustomerAccount` has, joined to `Organization`/`StampCard`/`Voucher`), both `verifyGlobalSession`-gated only, no tenant.
- `/api/claim` — QR-as-link claim lifecycle: `start` (token → `PendingClaim`), `:id/status` (polling), `:id/fulfill` (the actual stamp award, tenant JWT only — `resolveTenant` deliberately not used here).
- `/api/admin` — business-admin console: QR gen, redeem, customers, settings, menu CRUD (`isBusinessAdmin`).
- `/api/stamps`, `/api/vouchers` — customer loyalty (tenant from JWT).
- `/api/reviews` — public Google reviews passthrough for the tenant landing page.

`server.js` `seedDemoData()` seeds a platform admin (`admin@stampd.co` / password), tenant `coffesarowar`, its business admin (`barista@mansarowar.cafe`), and a demo customer — all password `password`.

## Frontend

React 19 + Vite + TS + Tailwind v4. State conventions (`docs/01-project-rules.md` §4, still current): TanStack Query for server state; React Context for session auth (`PlatformAuthContext`, `AdminAuthContext`, `CustomerAuthContext`, separate `platform_auth_token` / `admin_auth_token` / `customer_auth_token` in localStorage); React Hook Form + Zod for forms; React Hot Toast for alerts. `components/ui/` is a shadcn/Radix kit — reuse it, don't reimplement primitives. `motion` (Framer Motion's successor) is the animation library.

`lib/api.ts` `apiRequest()` is the single fetch wrapper; it auto-selects the auth token by path/role and attaches `X-Tenant-Slug` (set via `setTenantSlug`).

Route structure (`App.tsx`): `/` platform landing, `/platform/*` SaaS console (`routes/platform/`), `/:slug/*` tenant-scoped (wrapped in `TenantProvider` + `TenantSessionSync`, which silently exchanges a customer's global session for a tenant JWT on every page load) — customer app + `/:slug/admin/*` business console (`routes/admin/`). Several customer-facing routes are deliberately **slug-less** (no tenant context at all until one is actually entered): `/business-login` (`FindBusiness.tsx`, typed business name → resolves via `GET /api/tenant` → `/:slug/admin/login`), `/customer-login` / `/customer-register` (`GlobalCustomerLogin.tsx`/`GlobalCustomerRegister.tsx`, genuine global sign-in/signup — no business lookup, since customer identity is global), `/verify-email` (global customer-identity verification), and `/explore` + `/explore/mine` (wrapped in `GlobalCustomerLayout`, see below). `TenantContext` themes the `/:slug` subtree from `branding.primaryColor` (`--brand`).

`GoogleOAuthProvider` wraps the **entire** app once at the top of `App.tsx` (one client id, not per-tenant) — don't reintroduce it inside `TenantScope`; any `<GoogleLogin>` anywhere, tenant-scoped or the global customer pages, needs this shared ancestor or it throws.

Auth guards trust their cached token optimistically but must revalidate against the server: `AdminGuard` logs out and redirects to login if the settings fetch comes back with an auth error (a stale/expired `admin_auth_token` used to strand staff in a permanent "Verifying credentials" loop otherwise); `GlobalCustomerLayout` does the same for a stale `customer_global_session` using its `useMyTenants()` fetch. `CustomerAuthContext.ensureTenantSession` only reuses a cached tenant token if its embedded `organizationId` actually matches the tenant being viewed, so a stale tenant-A token can never get attached to tenant-B requests. `CustomerAuthContext`'s `globalAccount` state is lazily hydrated from `localStorage` on init (not just inside `ensureTenantSession`) so slug-less pages can gate on it with no `TenantSessionSync` in their tree.

**`/explore` — the cross-tenant business directory.** `GlobalCustomerLayout.tsx` (parallel to the tenant-scoped `CustomerLayout.tsx`) provides the shell: top-bar scan icon opens `GlobalScannerModal.tsx` (decodes a QR and just `navigate()`s to its `/:slug/claim?token=...` path — no claim API call itself, unlike the tenant-scoped `ScannerModal.tsx`), plus a 2-tab bottom nav (`/explore` "Home", `/explore/mine` "My Businesses"; no center FAB, since the scanner already lives in the top bar here). `Explore.tsx` shows a condensed "My Places" row (via `useMyTenants()`) above a search/category-filtered "Discover" grid (via `useDiscover()`) sorted by client-side haversine distance (`lib/geo.ts`) when geolocation is granted, else by real recent stamp volume — never a fabricated rating or "deal." Clicking any business (already-joined or brand new) links straight to `/:slug/dashboard`; first-time entry is auto-provisioned by the existing `TenantSessionSync`/`ensureTenantSession`, no separate "join" call. `ExploreMine.tsx` is the fuller membership list with real stamp/voucher progress.

### Design system ("Stampd")

Warm cream/brown palette, retrofitted onto the shadcn kit via CSS custom properties in `index.css`: `--bg`/`--surface`/`--surface-container`/`--surface-container-high`/`--ink`/`--muted`/`--soft`/`--line`/`--brand`/`--brand-deep` plus `--info`/`--ok`/`--warn`/`--err` (each with a `-soft` tint). **`--plat` and `--plat-soft` are aliases of `--brand`/a `color-mix()` of it** — the platform console shares the tenant accent rather than having its own distinct color, so `var(--plat)` call-sites don't need touching if the shared token ever changes. Fonts: Libre Caslon Text (serif, `--font-display`) for headings/display text, Inter (`--font-sans`) for body/UI, loaded in `styles/fonts.css`.

Shared utility classes (in `index.css`, use them instead of ad hoc shadows/hover states): `.shadow-ambient` (soft brand-tinted card shadow — every card-level `bg-[var(--surface)]` container should pair `rounded-3xl` with this) and `.stamp-interactive` (hover-lift + press-scale, respects `prefers-reduced-motion`).

Motion philosophy ("stamp-claim physics"): weighted, celebratory, squash-and-stretch spring entrances (`type: "spring"`), always guarded by `useReducedMotion()`. `components/customer/StampCelebration.tsx` is the shared "you earned a stamp / here's your voucher" moment reused by both the in-app scanner (`ScannerModal.tsx`) and the QR-link claim page (`ClaimLanding.tsx`) — don't duplicate that celebration UI, extend the shared component instead. Other signature moments: the voucher-redeem "hole punch" effect (`RedeemVoucher.tsx`), the login/logout stamp-card flip (`CustomerSettings.tsx`).

`AdminCustomerDetail.tsx` (`/:slug/admin/customers/:id`) is a dedicated page, not a drawer — it reads from the same cached `["adminCustomers"]` list rather than a new endpoint.

The reference screens this system was built from live outside the app at `frontend design/` (8 `code.html`+`screen.png` pairs plus `stampd_core/DESIGN.md`) — useful for the token values and motion rationale, but the shipped code is the source of truth where they've since diverged (e.g. heading weight is bold/extrabold throughout the app, not the regular weight `DESIGN.md` specifies).

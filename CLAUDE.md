# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Stampd** — a multi-tenant white-label loyalty SaaS for the Nepali market. The platform owner registers **companies**; each company runs one or more **outlets**, each an isolated tenant with its own branding, loyalty program, and customers. One codebase serves many businesses. "Coffesarowar" is just the first seeded company, not the product.

The core loyalty loop: staff enters the **bill amount** (mandatory) and generates a short-lived QR → the customer scans it with their **phone's own camera** (no app install), lands on a public claim page, signs in or is recognized silently → earns points as a percentage of the bill. To spend them, staff puts up a **redeem** QR → the customer scans it and picks from the outlet's reward catalog → the price is deducted. A customer can also scan from inside the app.

`PLATFORM_NAME` in `backend/config/platform.js` (mirrored in `frontend/src/lib/platform.ts`) is the single rebrand knob for the whole SaaS.

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
npm run test:isolation   # the key cross-tenant leakage test
```

Tests are plain `node tests/*.js` scripts (no framework) that boot a real server against the in-memory mock DB, each on its own port. Run one directly: `node backend/tests/multi-tenant-isolation.js`. **New suites must be added to `package.json`'s `test` chain** or they never run. Helpers live in `tests/helpers/` (`bootServer.js`, `makeOutlet.js`).

## Zero-config dev DB

There is **no real MongoDB in dev.** When `MONGODB_URI` is unset, `server.js` monkey-patches `require("mongoose")` to return `utils/mockMongoose.js` — an in-memory shim. Same when `JWT_SECRET` is unset (dev fallback key; both **fatal in production**). Being in-memory, it doesn't persist across serverless invocations — **production needs MongoDB Atlas.**

The mock is deliberately partial. Know its limits *before* writing a query:
- **Query matching: top-level equality, `$or`, `$lte`, `$gte` only.** Any other operator **throws** — it does not silently match. Don't reach for `$ne`/`$gt`/`$in`.
- **No nested-path queries.** `{"program.x": 1}` reads `doc["program.x"]` literally and matches nothing; a dotted `$set` creates a literal dotted key instead of nesting. Resolve nested config in JS from fetched documents.
- `.populate()` only handles the `userId` path.
- **No `findById`** — use `findOne({ _id })`.
- `.sort()` takes a single key. No `updateMany`, no aggregation pipeline, no real transactions.
- It DOES fill nested schema defaults (`computeDefaults`), so `Organization.program` / `.branding` populate.
- **Indexes are not enforced.** Any uniqueness an index promises must also be checked explicitly in the service (see `companyService.assertEmailAvailable`).

`seed/demoSeed.js` seeds the whole demo world, all with password `password`:
- platform admin `admin@stampd.co`
- 3 companies — `coffesarowar` (3 outlets), `himalayan-bites` (2), `sweet-corner` (1)
- a company owner per company (`owner@coffesarowar.com`, …) and an admin per outlet (`durbarmarg@coffesarowar.com`, …)
- 3 customers (`asha@example.com`, `bikash@example.com`, `chandra@example.com`) as real verified `CustomerAccount`s, so they can sign in through the UI. Overlaps are deliberate: asha spans two outlets of one company; bikash spans three outlets across **three different companies** — that's the case the isolation invariant must hold for.

## Company → outlet structure

`Company` is the entity (globally unique `slug`, branding, `programDefaults`, status). An `Organization` is **one outlet** and carries a required `companyId`.

**An outlet slug is unique only within its company** — compound unique `{companyId, slug}`. Two chains can both own a `durbarmarg`. This is why every tenant URL and every tenant lookup needs **both** slugs; one slug alone can never identify an outlet. `config/platform.js` `RESERVED_SLUGS` / `isReservedSlug` keeps a company slug from colliding with a real route (`explore`, `platform`, `company`, `admin-login`, …).

**Program config inherits: platform default → company → outlet.** Every field in `Organization.program` defaults to `null`, meaning "inherit". `services/programService.js` `resolveProgram(company, organization)` is **the only place config resolves** — never read `org.program.x` directly. It uses `??`, never `||`, because `0` is a legitimate configured value that `||` would silently drop through to the parent.

## Multi-tenant architecture

**Every loyalty record carries `organizationId`.** `User`, `PointsBalance`, `PointsTransaction`, `DynamicQRToken`, `MenuItem` are all outlet-scoped. Isolation is enforced by scoping every query with `organizationId` — when adding any query, it MUST include it, or you leak data across tenants. This is the invariant the whole product depends on. **Points never pool across outlets**: a balance is earned at one counter and spent at that same counter, even between two outlets of the same company.

**Three roles** (`User.role`): `platform` (super-admin, `organizationId = null`), `business_admin` (an outlet's staff), `customer` (an outlet's end user). Platform admins additionally carry `platformRole` (`owner` / `support`) — `owner` gates registering companies, team management, plans, and keys.

**Identity is global; loyalty data stays per-outlet.** Two parallel global-identity systems, same shape, deliberately separate:

| | Customers | Staff |
|---|---|---|
| Global identity | `CustomerAccount` | `AdminAccount` |
| Owns | email/password/phone/name/emailVerified/googleId | same, plus `kind` (`company_owner`/`outlet_admin`) + `companyId` |
| Per-outlet row | `User` (role `customer`) via `customerAccountId` | `User` (role `business_admin`) via `adminAccountId` |

One collection per identity is what makes email uniqueness a single enforceable index. `name`/`phone`/`emailVerified` on the `User` membership are denormalized copies kept in sync by `customerAccountService.ensureMembership`, which is what lets outlet-scoped code read identity fields unchanged.

**Reporting stays strictly per-outlet.** `CustomerAccount` is never joined into or exposed through any admin-facing report — a cafe never learns that "its" customer also visits others. The company owner's rollup (`companyReportService`) is the one cross-outlet view, and it is company-private: no outlet console can see a sibling's numbers.

**Three token types:**
1. **Tenant JWT** `{userId, role, organizationId}` — `JWT_SECRET`, signed in `utils/tokenUtils.js`, verified by `middleware/authMiddleware.js` (`verifyToken` → `req.user`; `isBusinessAdmin`/`isPlatformAdmin`/`isPlatformOwner` guards). Covers `business_admin`, `platform`, and — after `enter-tenant` — `customer`.
2. **Global customer session** `{type: "global_customer", customerAccountId}` — `JWT_GLOBAL_SECRET`, `middleware/customerAuthMiddleware.js`. Proves *which account*, never grants tenant access; its shape structurally can't pass `verifyToken`.
3. **Company session** `{type: "company_owner", adminAccountId, companyId}` — `JWT_GLOBAL_SECRET`, `middleware/companyAuthMiddleware.js`.

**Two ways the active tenant is determined — do not confuse them:**
1. **Public routes** (`/api/tenant`, `/api/menu`, `/api/auth`) use `resolveTenant` (`middleware/tenantMiddleware.js`): reads `X-Company-Slug` + `X-Outlet-Slug` headers → `:companySlug`/`:outletSlug` params → Host subdomain, then `Company.findOne({slug})` → `Organization.findOne({companyId, slug})`. Both are top-level equality, so mock-DB safe. Sets `req.company`, `req.organization`, `req.organizationId`. Suspended → 403 `TENANT_SUSPENDED`.
2. **Authenticated loyalty routes** (`/api/admin`, `/api/stamps`, `/api/vouchers`) take the tenant from the **JWT**, NOT the URL. A user can only ever act within their own tenant regardless of any client-supplied slug — **a security boundary; don't replace it with slug-based resolution.**

**Unified admin login.** `POST /api/admin-auth/login` is slug-less: one email+password form for all staff. The backend looks up the `AdminAccount` and branches on `kind` — a company owner gets a company session and lands at `/company`; an outlet admin gets a tenant JWT and lands at `/[company]/[outlet]/admin`. No match → "not registered". Each outlet's credentials are independent (own hash, verified once) — there is no password copying or fan-out between them. An unverified admin is refused **at login** with 403 `EMAIL_NOT_VERIFIED`, not gated inside the console.

**QR-as-link claim flow.** The QR staff generates (`GenerateQr.tsx`) encodes a real URL (`/[company]/[outlet]/claim?token=…`), not a bare token, so the phone's native camera opens it. Build these with `tenantUrl`, never by hand — a one-segment URL resolves to a *company* and silently bounces to `/explore`. The claim page converts the scanned `DynamicQRToken` (30s, single-use) into a `PendingClaim` (15 min) — decoupling "how long the QR is scannable" from "how long the customer has to finish signing in." A brand-new signup's first earn stays pending until they verify their email (maybe minutes later, another device), at which point `pendingClaimService.autoFulfillForAccount` fulfills every pending claim for that account across all tenants.

## The points loop

`services/pointsService.js` is the whole loyalty core. `PointsBalance` holds one balance per customer per outlet; `PointsTransaction` is the append-only ledger behind every history, report and KPI. A correction is a new row, never an edit — **the balance must always equal the sum of the ledger**, which is what makes a drifted balance detectable instead of merely wrong.

**Points are INTEGER centipoints** (`utils/pointsMath.js`; 1 point = 100). A balance is mutated with `$inc`, so the arithmetic happens inside the DB where the result can't be rounded, and repeatedly `$inc`-ing a decimal drifts until a balance reads `10.499999999` and the `$gte` redemption guard rejects a customer who has exactly enough. Integers make that impossible while preserving the fractional points the program promises (Rs 105 at 10% = 10.5 points = 1050 centi). **Centipoints never leave the backend** — responses convert once, on the way out, via `toPoints()`.

- **Earn**: the bill is **mandatory** (the award is a function of it, so a bill-less token could only award zero). `earnCenti = round(bill × earnPercent × multiplier)` — the `/100` and `×100` cancel, which is why `earnPercent` maps so cleanly onto this representation.
- **No cooldown.** The token's single-use guard (`consumeDynamicQrToken`) already serializes claimers, so removing it left no gap, and two genuine bills are two genuine earns.
- **`DynamicQRToken.purpose`** (`earn`/`redeem`) is checked on consume, so scanning the counter's earn QR on the redeem page can't move a balance the wrong way.
- **Redeem** is staff-initiated too: a customer must never be able to move their own balance. The sufficient-funds check **is** the atomic `findOneAndUpdate({…, balanceCenti: {$gte: price}})` — not a read-then-write, which two concurrent redeems could both pass.
- **Expiry is rolling inactivity**: derived from `lastActivityAt` at read time, materialized on the next write (zero the row + log an `expire` row). Any earn or redeem restarts the clock. `pointsExpiryDays: 0` = never. **No cron.** Test hook: `/__test__/expire-points` just drags `lastActivityAt` back, so ageing a row *is* the production path.
- **Catalog**: a `MenuItem` with a `pointsPriceCenti` is redeemable; `null` means menu-only, so adding points to an outlet never puts its whole menu up for redemption.

## Subscriptions (key-based, no payment gateway)

Platform-admin-configurable `SubscriptionPlan`s (outlet-count limits) gate how many outlets a company may run. **There is no payment API** — eSewa/Fonepay integration was considered and deliberately dropped. Instead: the platform admin generates a `SubscriptionKey` scoped to a plan, confirms payment out-of-band (phone/email), and hands over the key; the **company owner** redeems it at `/company/subscription` (`POST /api/company/subscription/redeem-key` — outlet admins cannot). That page shows a days-left countdown and, near expiry, the platform's contact info (from the `platformConfigService` singleton), which also goes into the lazily-sent renewal-reminder email.

Two rules worth not breaking:
- `Subscription.outletLimitAtPurchase` is **snapshotted at redemption**, never read live off the plan — a later plan edit must never retroactively strand an existing subscriber.
- Expiry and the 5-day grace period are **always derived from `currentPeriodEnd` at read time**. No cron job exists or is needed anywhere in this codebase.

## Backend layering (enforced)

`routes/ → controllers/ → services/ → models/`. Controllers are thin: parse request, call a service, format the response. **All business logic and multi-model writes live in `services/`.** Keep the atomic `findOneAndUpdate` style in `services/stampService.js` — the stamp claim uses a session + atomic guarded update to prevent double-stamping races.

Route groups mounted in `server.js`:
- `/api/platform` — super-admin: register/list/manage companies + outlets (`isPlatformAdmin`); `/plans` and `/subscription-keys` nested under it.
- `/api/tenant` — public outlet branding+program lookup (`resolveTenant`).
- `/api/menu` — public display-only menu (`resolveTenant`).
- `/api/auth` — legacy tenant-scoped login (`resolveTenant`).
- `/api/admin-auth` — the unified staff identity: login, verify-email, resend, forgot/reset password. Slug-less.
- `/api/company` — company owner console (`verifyCompanySession`): outlets CRUD, `enter-outlet`, subscription + key redemption, cross-outlet rollup.
- `/api/account` — shared profile/password for any authenticated role (`verifyToken`).
- `/api/customer-auth` — global customer identity: register/login/google/verify/reset (no tenant), `enter-tenant` (exchanges a global session for a tenant JWT, auto-provisioning the membership), plus `/explore`'s two reads — `discover` and `my-tenants` (`verifyGlobalSession` only, no tenant).
- `/api/claim` — QR-as-link lifecycle: `start`, `:id/status`, `:id/fulfill` (tenant JWT only — `resolveTenant` deliberately unused).
- `/api/admin` — outlet console: QR gen, redeem, customers, settings, menu CRUD (`isBusinessAdmin`).
- `/api/stamps`, `/api/vouchers` — customer loyalty (tenant from JWT).
- `/api/reviews` — public Google reviews passthrough.

**Dependency constraint:** `xlsx` is banned (unpatched CVEs GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). Spreadsheet work uses **ExcelJS** (`menuService.js`, `reportService.js`) — an independent implementation, not a SheetJS wrapper like `node-xlsx`. Don't reintroduce it, directly or transitively.

**Menu import** is stateless preview/confirm: `POST /api/admin/menu/import/preview` (multipart → new/changed/unchanged diff, matched on name case-insensitively) → admin reviews in `MenuImportPreviewModal.tsx` → `POST /api/admin/menu/import/confirm` (JSON `{rows}`) writes only approved rows through the org-scoped `createItem`/`updateItem`, so a tampered `existingId` from another tenant just matches nothing.

## Frontend

React 19 + Vite + TS + Tailwind v4. TanStack Query for server state; React Context for session auth; React Hook Form + Zod for forms; React Hot Toast for alerts; `motion` (Framer Motion's successor) for animation; Recharts for charts. `components/ui/` is a shadcn/Radix kit — reuse it, don't reimplement primitives.

`lib/api.ts` `apiRequest()` is the single fetch wrapper: it auto-selects the auth token by path/role and attaches `X-Company-Slug`/`X-Outlet-Slug` (set via `setTenantRef`). localStorage keys: `platform_auth_token`, `admin_auth_token`, `customer_auth_token`, `customer_global_session`, `company_session`.

**`lib/tenantPath.ts` builds every tenant URL** — `tenantPath(company, outlet, sub)` / `tenantUrl(origin, …)` for QR codes and emails. Don't interpolate `/${slug}/…` by hand: a missing company segment should be a type error, not a URL that silently resolves elsewhere.

Route structure (`App.tsx`):
- `/` platform landing · `/platform/*` SaaS console (`routes/platform/`, `PlatformLayout` gated on `platformRole`)
- `/admin-login` unified staff sign-in (slug-less) · `/company/*` company owner console (`routes/company/`)
- `/:companySlug` alone → redirect to `/explore` (there is no company-level customer page)
- `/:companySlug/:outletSlug/*` → `TenantScope` (`TenantProvider` + `TenantSessionSync`) — customer app + `/admin/*` outlet console (`routes/admin/`)
- Deliberately slug-less customer routes: `/customer-login`, `/customer-register`, `/verify-email`, and `/explore` + `/explore/mine` (in `GlobalCustomerLayout`)

`TenantContext` themes the `/:companySlug/:outletSlug` subtree from `branding.primaryColor` (`--brand`); its query key includes both slugs.

`GoogleOAuthProvider` wraps the **entire** app once at the top of `App.tsx` (one client id, not per-tenant) — don't reintroduce it inside `TenantScope`; any `<GoogleLogin>` anywhere needs this shared ancestor or it throws.

**Auth guards trust their cached token optimistically but must revalidate.** `AdminGuard` logs out and redirects if its settings fetch returns an auth error (a stale token otherwise strands staff in a permanent "Verifying credentials" loop); `GlobalCustomerLayout` does the same via `useMyTenants()`. `CustomerAuthContext.ensureTenantSession` only reuses a cached tenant token if its embedded `organizationId` matches the outlet being viewed, so a stale tenant-A token can never be attached to tenant-B requests. Its `globalAccount` state hydrates from localStorage on init so slug-less pages can gate on it with no `TenantSessionSync` in their tree.

**`/explore` — the cross-tenant directory.** `GlobalCustomerLayout.tsx` (parallel to tenant-scoped `CustomerLayout.tsx`): top-bar scan icon opens `GlobalScannerModal.tsx` (decodes a QR and just `navigate()`s to its claim path — no API call, unlike the tenant-scoped `ScannerModal.tsx`), plus a 2-tab bottom nav. `Explore.tsx` shows a "My Places" row above a search/category-filtered "Discover" grid, sorted by client-side haversine distance (`lib/geo.ts`) when geolocation is granted, else by real recent stamp volume — **never a fabricated rating or "deal."** Clicking any business links straight to its dashboard; first-time entry auto-provisions via `TenantSessionSync`. `ExploreMine.tsx` is the fuller membership list.

### Design system ("Stampd")

Warm cream/brown palette, retrofitted onto the shadcn kit via CSS custom properties in `index.css`: `--bg`/`--surface`/`--surface-container`/`--surface-container-high`/`--ink`/`--muted`/`--soft`/`--line`/`--brand`/`--brand-deep`, plus `--info`/`--ok`/`--warn`/`--err` (each with a `-soft` tint). **`--plat`/`--plat-soft` are aliases of `--brand`** — the platform console shares the tenant accent rather than owning a separate color. Fonts: Libre Caslon Text (`--font-display`) for headings, Inter (`--font-sans`) for body/UI, loaded in `styles/fonts.css`.

Use the shared utilities instead of ad hoc shadows/hover states: `.shadow-ambient` (every card-level `bg-[var(--surface)]` container should pair `rounded-3xl` with it) and `.stamp-interactive` (hover-lift + press-scale, respects reduced motion).

**Toasts:** single `<Toaster>` in `App.tsx`, `bottom-right`. No green/red — success and error share one neutral `--surface`/`--ink` card and differ by icon shape only. Copy is light and chill throughout; match that voice.

**Logo:** `components/shared/StampdLogo.tsx` — hand-built SVG (a coin earned atop another, the top one struck with a point). Colors are fixed (`#1F1B18`/`#C15D2C`/`#F3ECE2`), **not** tenant-themed: this is the platform's identity, distinct from `--brand`. Also inlined as the favicon in `index.html` — change both together.

**Motion** ("stamp-claim physics"): weighted, celebratory spring entrances (`type: "spring"`), always guarded by `useReducedMotion()`. `components/customer/StampCelebration.tsx` is the shared earn moment reused by both `ScannerModal.tsx` and `ClaimLanding.tsx` — extend it, don't duplicate it. Other signature moments: the voucher-redeem "hole punch" (`RedeemVoucher.tsx`), the login/logout card flip (`CustomerSettings.tsx`).

The reference screens this system came from live at `frontend design/` (8 `code.html`+`screen.png` pairs plus `stampd_core/DESIGN.md`) — useful for token values and motion rationale, but **the shipped code wins** where they've diverged (e.g. headings are bold/extrabold, not the regular weight `DESIGN.md` specifies).

## Phase C — rewards catalog + campaigns (next)

- Standalone `RewardItem` for non-menu rewards, alongside the existing `MenuItem.pointsPriceCenti` (which Phase B pulled forward because redeem needed something to redeem against). Plus a `pointsPrice` column in the Excel menu import, and admin CRUD for both.
- `Campaign{organizationId, name, multiplier, startAt, endAt, daysOfWeek[], isActive}` with `resolveActiveMultiplier(org, now)` evaluated at earn time. `PointsTransaction` already carries `multiplier` and `campaignId`, and `awardPointsInTransaction` already snapshots a `multiplier` of 1 — so the ledger's shape doesn't change when campaigns land.
- **Stacking rule: max, no compounding** (if a 2x weekend and a 3x Thursday both match, it's 3x, not 6x) — still worth confirming before building.
- Timezone is unresolved: `daysOfWeek` needs a definition of "Thursday" and the server runs UTC.
- Suites: `tests/rewards-catalog.js`, `tests/campaigns.js`.

## Stale docs

`docs/00-overview.md` and `docs/01-project-rules.md` describe the OLD single-cafe app and explicitly list multi-tenancy as out of scope. That is obsolete — the product pivoted. **Trust the code over those docs.** The governance rules in `docs/01` (thin controllers, service-layer logic, no unapproved deps) still apply.

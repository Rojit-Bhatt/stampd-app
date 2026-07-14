# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **multi-tenant white-label loyalty SaaS** (the "Druto" model). The platform owner onboards nearby cafes/restaurants; each becomes an isolated **tenant** with its own branded space, its own stamp program, its own customers. One codebase serves many businesses. "Coffesarowar" is now just the first seeded tenant, not the product.

The core loyalty loop: customer registers (scoped to a tenant) → scans the barista's 30s single-use QR → earns 1 stamp (per-tenant cooldown) → at the tenant's `stampsRequired` threshold, a reward voucher auto-generates and the stamp balance resets → barista redeems the voucher.

**Migration state:** backend and frontend are both multi-tenant. `App.tsx` routes `/:slug/*` through `TenantProvider`; `lib/api.ts` sends `X-Tenant-Slug` on every request (`setTenantSlug` from the URL). Platform, business-admin, and customer consoles are built. Remaining: customer menu/profile/activity screens, deploy (Vercel + Atlas).

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
npm test                 # integration-qa + voucher + multi-tenant-isolation
npm run test:integration # single suite
npm run test:voucher
npm run test:isolation   # the key cross-tenant leakage test
```

Tests are plain `node tests/*.js` scripts (no framework) that boot against the in-memory mock DB. Run one directly: `node backend/tests/multi-tenant-isolation.js`.

## Zero-config dev DB

There is **no real MongoDB in dev.** When `MONGODB_URI` is unset, `server.js` monkey-patches `require("mongoose")` to return `utils/mockMongoose.js` — an in-memory Mongoose shim. Same when `JWT_SECRET` is unset (dev fallback key; both **fatal in production**).

The mock is deliberately partial — know its limits before writing queries against it:
- Query matching: top-level equality, `$or`, `$lte`, `$gte` only. No nested-path or other operators.
- `.populate()` only handles the `userId` path.
- **No `findById`** — use `findOne({ _id })`.
- It DOES fill nested schema defaults (`computeDefaults`) so `Organization.program` / `.branding` populate correctly.

Because it is in-memory, it does not persist across serverless invocations — **production needs MongoDB Atlas.**

## Multi-tenant architecture

**Every loyalty record carries `organizationId`.** `User`, `StampCard`, `Voucher`, `DynamicQRToken`, `StampClaimEvent`, `MenuItem` are all tenant-scoped. Isolation is enforced by scoping every query with `organizationId` — when adding any query, it MUST include it, or you leak data across tenants. This is the invariant the whole product depends on.

**Three roles** (`User.role`):
- `platform` — SaaS super-admin, `organizationId = null`, onboards/suspends businesses.
- `business_admin` — a tenant's admin/barista.
- `customer` — a tenant's end user.

Customer accounts are **per-tenant**: email is unique per org, not globally (`User` compound index `{ organizationId, email }`). The same person at two businesses is two `User` docs.

**Two ways the active tenant is determined — do not confuse them:**
1. **Public/unauthenticated routes** (`/api/tenant`, `/api/menu`, `/api/auth` register/login) use `resolveTenant` middleware (`middleware/tenantMiddleware.js`), which reads the tenant from, in order: `X-Tenant-Slug` header → `:slug` param → Host subdomain. Sets `req.organization` + `req.organizationId`. This is subdomain-ready for the future custom-domain flip with no rewrite.
2. **Authenticated loyalty routes** (`/api/admin`, `/api/stamps`, `/api/vouchers`) take the tenant from the **JWT** (`req.user.organizationId`), NOT the URL. A user can only ever act within their own tenant regardless of any client-supplied slug — this is a security boundary, don't replace it with slug-based resolution.

JWT payload: `{ userId, role, organizationId }`, signed in `utils/tokenUtils.js`, verified in `middleware/authMiddleware.js` (`verifyToken` → sets `req.user`; `isBusinessAdmin` / `isPlatformAdmin` role guards).

**Per-tenant program config replaces hardcoded constants.** `stampsRequired`, `rewardTitle`, `rewardDescription`, `cooldownHours` live in `Organization.program`; branding in `Organization.branding`. Defaults come from `config/platform.js` (`DEFAULT_PROGRAM`). `PLATFORM_NAME` (default "Stampd") is the single rebrand knob for the whole SaaS; frontend mirror in `lib/platform.ts`.

## Backend layering (enforced)

`routes/ → controllers/ → services/ → models/`. Controllers are thin: parse request, call a service, format the HTTP response. **All business logic and multi-model/DB writes live in `services/`.** Keep the atomic `findOneAndUpdate` transaction style in `services/stampService.js` — the stamp claim uses a session + atomic cooldown-guarded update to prevent double-stamping races.

Route groups mounted in `server.js`:
- `/api/platform` — super-admin: onboard/list/manage tenants (`isPlatformAdmin`).
- `/api/tenant` — public tenant branding+program lookup by slug (`resolveTenant`).
- `/api/menu` — public display-only menu (`resolveTenant`).
- `/api/auth` — tenant-scoped register/login/google (`resolveTenant`).
- `/api/admin` — business-admin console: QR gen, redeem, customers, settings, menu CRUD (`isBusinessAdmin`).
- `/api/stamps`, `/api/vouchers` — customer loyalty (tenant from JWT).

`server.js` `seedDemoData()` seeds a platform admin (`admin@stampd.co` / password), tenant `coffesarowar`, its business admin (`barista@mansarowar.cafe`), and a demo customer — all password `password`.

## Frontend

React 19 + Vite + TS + Tailwind v4. State conventions (`docs/01-project-rules.md` §4, still current): TanStack Query for server state; React Context for session auth (`AdminAuthContext`, `CustomerAuthContext`, separate `admin_auth_token` / `customer_auth_token` in localStorage); React Hook Form + Zod for forms; React Hot Toast for alerts. `components/ui/` is a shadcn/Radix kit — reuse it, don't reimplement primitives.

`lib/api.ts` `apiRequest()` is the single fetch wrapper; it auto-selects the `platform_auth_token` / `admin_auth_token` / `customer_auth_token` by path/role and attaches `X-Tenant-Slug` (set via `setTenantSlug`).

Route structure (`App.tsx`): `/` platform landing, `/platform/*` SaaS console (`routes/platform/`, maroon `--plat`), `/:slug/*` tenant-scoped (wrapped in `TenantProvider`) — customer app + `/:slug/admin/*` business console (`routes/admin/`). Three auth contexts: `PlatformAuthContext`, `AdminAuthContext`, `CustomerAuthContext`; `TenantContext` themes the subtree from `branding.primaryColor` (`--brand`).

Design system "Stampd" is retrofitted onto the shadcn kit: cream/ink palette, `--brand` (tenant) vs `--plat` (platform maroon), Bricolage Grotesque display + Plus Jakarta Sans body.

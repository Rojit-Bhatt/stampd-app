# Epic E1 — Profile Menus, Account Settings & Business-Admin Email Verification

**Date:** 2026-07-15
**Status:** Approved design, ready for implementation plan
**Scope:** First of four specs decomposed from the original "Epic E" list (profile menus [this spec], landing-page Contact Us + platform config [E2], loading skeletons [E3], toast/dialog restyling [E4]). E3 and E4 are visual redesign work, previously deferred alongside B2's stamp-animation until a dedicated frontend-design pass — this Epic E reopens that deferral, but each visual item still gets its own spec.

## Context

All three roles (platform, business_admin, customer) currently show only a static, always-visible "Log out" button — no dropdown, no account settings, no way to change a password or edit a display name from within the app. Separately, email verification today only exists for the customer role: registration sends a verification email and `stampService.claimStamp` checks `emailVerified` before allowing a claim. Business_admin accounts (created via platform onboarding) and the platform role never get a verification email and nothing checks their `emailVerified` status — it silently defaults to `false` and is never acted on. There is also no endpoint to create a second platform account at all (only the one seeded admin), so platform-role verification is unreachable and out of scope.

## Decisions locked during brainstorming

1. **Shared account API, not per-role duplication.** One `/api/account` route group (`PATCH /profile`, `POST /change-password`) works off `req.user.userId` from the JWT — role-agnostic, usable by all three roles.
2. **Settings screen content:** name edit + change password, for all three roles. Verify-email status/resend section appears only for customer and business_admin (platform has no reachable unverified state, so nothing to show).
3. **Business_admin gets real email verification wiring**, previously entirely absent: `platformService.createBusiness` now sends a verification email to the new admin (reusing the existing generic `sendVerifyEmail` helper), same as customer registration already does.
4. **Full admin-console gate for unverified business_admin** — stronger than the customer pattern (which only blocks the single claim-stamp action). An unverified business_admin sees a dedicated "verify your email" screen and nothing else in the console until verified. This is a deliberate, real new restriction on tenant onboarding, chosen explicitly over the lighter "status badge, no enforcement" option.
5. **Platform role is out of scope for verification** — no endpoint creates a second platform account, so building verify-email plumbing for it would be dead, untestable code.
6. **Profile dropdown UI**: one shared `AccountMenu` component (avatar/name trigger → Settings + Log out) replaces the static logout block in all three layouts (`PlatformLayout.tsx`, `AdminLayout.tsx`, `CustomerDashboard.tsx`).
7. **One shared settings form**, not three separate bespoke screens: `AccountSettingsForm` takes a `role` prop and conditionally renders the verify-email section.

## Data Model

No new models. `User.emailVerified` (already exists, default `false`) is now meaningfully set and checked for business_admin, exactly as it already is for customer.

## Backend

### `backend/services/accountService.js` (new)

- `updateProfile(userId, { name })`: validates non-empty trimmed name, updates and returns the `User` doc (only `name` is mutable via this path — email/role/organizationId are never touched here).
- `changePassword(userId, { currentPassword, newPassword })`: loads the user; if `user.password` is falsy (Google-only account), throws a 400 ("This account signs in with Google and has no password to change."); otherwise bcrypt-compares `currentPassword`, throws 401 on mismatch, else hashes and saves `newPassword`.

### `backend/controllers/accountController.js` (new)

- `getMe`: returns `{ id, name, email, role, emailVerified }` for `req.user.userId` — backs the settings screen's initial state and the profile dropdown's displayed name/email (avoids each of the three auth contexts needing its own ad-hoc fetch).
- `updateProfileController`, `changePasswordController`: thin wrappers around the service.

### Routes (`backend/routes/accountRoutes.js`, new; mounted at `/api/account` in `server.js`)

- `GET /api/account/me`, `PATCH /api/account/profile`, `POST /api/account/change-password` — all `verifyToken` only (works for any authenticated role; no `isBusinessAdmin`/`isPlatformAdmin` gate).

### Business-admin verification wiring

- `backend/services/authService.js`: export the existing `sendVerifyEmail` function (currently internal-only) so `platformService.js` can reuse it.
- `backend/services/platformService.js`'s `createBusiness`: after creating the admin `User` with explicit `emailVerified: false`, call `sendVerifyEmail(admin, organization._id, normalizedSlug)`.
- `backend/services/authService.js`'s `sendVerifyEmail` email body copy is genericized from "Confirm your email to start collecting stamps" to "Confirm your email to activate your account" so it reads correctly for both customers and business admins.
- No changes to `/api/auth/resend-verification` or `/api/auth/verify-email` — both already key off `{ organizationId, email }`/token, not role, so they work for business_admin unmodified.

### Admin-console gate

- `backend/controllers/tenantController.js`'s `getMySettings`: gains `adminEmailVerified: (await User.findOne({ _id: req.user.userId })).emailVerified` in its response — read fresh from the DB every call (never trusted from the JWT, since verification can happen in a different session).

## Frontend

### `frontend/src/hooks/useAccount.ts` (new)

- `useAccount(role)`: `GET /api/account/me`, `staleTime` short (this drives the dropdown's displayed name).
- `useUpdateProfile(role)`, `useChangePassword(role)`: mutations against the two `PATCH`/`POST` endpoints, passing `role` through to `apiRequest` so the correct token header is attached (the new `/api/account/*` paths don't auto-match any of the existing role-prefix heuristics in `lib/api.ts`, so every call here must pass `role` explicitly).

### `frontend/src/components/shared/AccountMenu.tsx` (new)

- Props: `{ role: "platform" | "admin" | "customer"; name: string; email?: string; settingsPath: string; onLogout: () => void }`.
- Renders the avatar-initial circle (already present in each layout) as a click target; on click, opens a small dropdown (name, email if provided, "Settings" link to `settingsPath`, "Log out" button calling `onLogout`). Closes on outside click (same backdrop-click pattern already established in `CustomerDetailDrawer.tsx`, adapted to a small anchored popover instead of a full-screen overlay).

### `frontend/src/components/shared/AccountSettingsForm.tsx` (new)

- Props: `{ role: "platform" | "admin" | "customer" }`.
- Name field (pre-filled from `useAccount`, saved via `useUpdateProfile`).
- Current/new password fields, saved via `useChangePassword`, with the existing `react-hot-toast` success/error pattern used everywhere else in this codebase.
- If `role !== "platform"`: a verify-email status line (Verified / Not verified) sourced from `useAccount`'s `emailVerified`, with a "Resend verification email" button when not verified (calls the existing `/api/auth/resend-verification`, same as the customer dashboard's existing unverified banner already does).

### Route wiring (one thin page per role, reusing the shared form)

- `frontend/src/routes/platform/PlatformSettings.tsx` (new) → `/platform/settings`.
- `frontend/src/routes/admin/AdminSettings.tsx` (new) → `/:slug/admin/settings`, reached via the `AccountMenu` dropdown in `AdminLayout.tsx` (not added to the sidebar `NAV` array — Settings is a profile action, not a business-operations section, matching decision 6's "replaces the static logout block" framing rather than becoming a ninth flat nav entry).
- `frontend/src/routes/CustomerSettings.tsx` (new) → `/:slug/settings`, rendered inside `CustomerLayout`.

### The verify-email gate (`frontend/src/components/admin/AdminGuard.tsx`, modified)

- After confirming `user.role === "business_admin"`, additionally reads `adminEmailVerified` from `useAdminSettings()`.
- If `false`: renders a new `VerifyEmailGate` component instead of `children` — shows the admin's email, a "Resend verification email" button (`/api/auth/resend-verification`), an "I've verified — refresh" button (invalidates the `adminSettings` query so the gate re-checks without a full reload), and a Log out button. No `AdminLayout`, no sidebar, no `NAV` — the entire console is inaccessible, matching decision 4.
- Once `adminEmailVerified` is `true`, `AdminGuard` renders `children` (the normal `AdminLayout` + routes) as it does today — the in-console `AccountMenu`/`AdminSettings` route becomes reachable at that point, same as any other admin route.

## Testing / Verification

1. **Backend**, self-contained (`backend/tests/account-settings.js`):
   - `PATCH /api/account/profile` updates name for each of the three roles (customer, business_admin, platform), tenant-scoped correctly.
   - `POST /api/account/change-password` with wrong current password → 401; with correct current password → 200, and a subsequent login with the new password succeeds while the old one fails.
   - Google-only account (no password) attempting change-password → 400 with the expected message.
   - Onboarding a new business via `/api/platform/businesses` triggers a verification email to the new admin (assert via the existing email-stub log pattern already used in `auth-email-flow.js`), and the new admin's `GET /api/admin/settings` shows `adminEmailVerified: false`.
   - Resending verification and then verifying via the emailed token flips `adminEmailVerified` to `true` on a subsequent `GET /api/admin/settings`.
   - Tenant isolation: a second tenant's admin's verification status is independent of the first.
2. **Frontend:** `npx tsc --noEmit` clean.
3. **Browser:**
   - Onboard a fresh business via the platform console, confirm its new admin cannot log into anything but the verify-gate screen; resend, capture the emailed link from the stub log, visit it, click "I've verified — refresh" on the gate, confirm the full console becomes reachable.
   - On the now-verified admin, existing seeded admin, and the seeded customer: open the profile dropdown, confirm name/email show correctly, navigate to Settings, change the display name, change the password, log out and log back in with the new password.
   - Platform admin: confirm the profile dropdown and Settings screen work (name + password only, no verify-email section).

## Out of scope

E2 (landing Contact Us + platform config), E3 (loading skeletons), E4 (toast/dialog restyling) are unaffected and remain separate specs. No email-change flow (only name is editable profile data). No "forgot password while logged out" changes — that flow already exists and is untouched. No gate for platform (unreachable, per decision 5).

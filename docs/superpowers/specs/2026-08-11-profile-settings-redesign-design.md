# Profile & Account Settings Redesign

Status: approved design, not yet planned/implemented
Date: 2026-08-11

## Problem

Current settings surfaces are inconsistent and have UX gaps:

- **Customer** (`CustomerProfilePanel.tsx`): `ProfileShell` rail/pane shell, 6 sections (Profile, Personal info, Notifications, Appearance, Security, Danger zone). Danger zone is scrolled-past, not visually separated. Notifications and privacy/consent are conflated.
- **Admin** (`AdminSettings.tsx`): tab shell (`SettingsTabs`), 3 tabs (Account, Customer Info, Sub-Admin). Sub-Admin tab breaks pattern (standalone card, not shell-driven).
- **Change password**: inline card, current+new fields only, no confirm field, no strength indicator. Always shows "Current password" even for Google-only accounts that never set one — no `hasPassword` flag exists anywhere in the account payload, so a Google-only user gets a confusing server-side rejection with no client-side handling.
- **Avatar**: auto-crop-to-square with no user control (no manual reposition/zoom), separate "Change" button instead of tap-avatar.
- **Push notification opt-in**: plain checkbox that fires the native browser permission dialog immediately with no explanation. No recovery UI if the user has already blocked notifications at the browser level.

## Decisions made this session

1. Drop `ProfileShell`/`SettingsTabs` reuse — moving to a new navigation pattern (below).
2. Redesign covers **both** customer and admin/staff surfaces.
3. Nav pattern: **WhatsApp/Telegram-style drill-down list** — single scrollable list of rows, each navigates to its own dedicated sub-screen. On **desktop**, use a **master-detail split** (list stays visible on left, selected section renders on right) instead of full navigation, to use the available width — same list/rows/grouping as mobile, just no full-screen push. On **mobile**, full drill-down (list → sub-screen → back button).
4. Customer section grouping: Profile / Notifications / Privacy / Appearance / Security / Danger zone (Privacy split out as its own section instead of folded into Notifications; Personal info fields merge into Profile).
5. Also redesign the mechanics of three specific settings actions (not just navigation shell):
   - Change password
   - Avatar upload
   - Push notification permission request

## Section structure

### Customer (`CustomerProfilePanel` replacement)

Drill-down list, rows in order:

1. **Profile** — avatar (tap-to-change), name, email, personal info (birthday month/day, gender) merged in.
2. **Notifications** — email opt-in, SMS opt-in, push notification toggle.
3. **Privacy** *(new)* — marketing consent granularity, data visibility controls. Split out from Notifications.
4. **Appearance** — dark mode toggle.
5. **Security** — password (change/set, see below), email verification/OTP.
6. **Danger zone** — delete account. Own row, visually distinct (red/warning styling) at the bottom of the list, not just the last card in a scroll — still last in order, but styled to read as categorically different from the rest.

Logout: stays outside the settings list (as today), not a settings row.

### Admin (`AdminSettings` replacement)

Same drill-down pattern applied to existing 3 groupings:

1. **Account** — name/email/password (see below).
2. **Privacy / Data collection** *(renamed from "Customer Info")* — the 2 existing toggles (collect DOB, collect gender). Rename reflects that this configures privacy-of-customers, not admin's own info.
3. **Staff** *(renamed from "Sub-Admin", primary admin only)* — existing staff management (role toggle, PIN dialogs, invite dialog) unchanged internally, just reachable as a drill-down row instead of a tab.

Platform role: same shell, Account row only (as today, `AccountSettingsForm role="platform"`).

## Mechanic redesigns

### Change / set password

Account payload gains a `hasPassword` flag (derived from `!!account.password`), added to `formatAccountSummary` / `formatGlobalSessionPayload` / `formatAccountPayload` in `backend/services/customerAccountService.js`, flowing through existing `useAccount`/`CustomerAuthContext` fetches — no new endpoint needed.

- **`hasPassword === true`** (normal case): "Change password" sub-screen. Fields: current password, new password, confirm new password (client-side match check). Live strength indicator on new password. Current-password gate enforced server-side as today.
- **`hasPassword === false`** (Google-only account): "Set password" sub-screen. Fields: new password, confirm new password only — no current-password field. Backend `changeAccountPassword` relaxed to skip the current-password compare when `account.password` is falsy (session auth is sufficient proof of identity). Optional small "Signed in with Google" badge near the row so the differing UI is self-explanatory rather than looking broken.

Applies to both `CustomerProfilePanel`'s Security section and `AccountSettingsForm`'s Security section (admin/staff/platform) — same `hasPassword` logic, same relaxed backend path.

### Avatar

- Tap the avatar image itself (not a separate "Change" button) → action sheet: Choose photo / Remove.
- After picking a file: manual crop step — pinch-zoom/drag-to-reposition inside a circular mask, explicit "Save"/"Done" — replacing the current silent auto-crop-to-square with no user control.
- Keep existing optimistic local preview and backend storage path (`CustomerAvatar` Mongo doc, base64, `POST/DELETE /api/customer-auth/avatar`) — no changes needed there.

### Push notification permission

- Insert a soft pre-prompt card/dialog before calling `Notification.requestPermission()`: explains the value ("Get notified when your order's ready"), Enable / Not now. Native browser dialog only fires if user taps "Enable".
- If `Notification.permission === "denied"` already (browser-level block from a prior visit), show a "Notifications blocked — enable in browser settings" row with instructions instead of a dead/silently-failing toggle.
- Toggle-off behavior (unsubscribe + `DELETE /api/customer-auth/push-subscription`) unchanged.

## Out of scope

- Any change to the underlying data model beyond adding `hasPassword` to account payloads.
- Sub-admin/staff PIN dialog internals (flagged during discussion as possibly worth revisiting, explicitly deferred).
- "Password changed" security notification email/push (flagged as nice-to-have, not core to this redesign).
- Bottom-nav settings entry point for customer app (noted as a gap, not part of this redesign's scope — current entry points unchanged).

## Testing considerations (for the implementation plan)

- Google-only account password flow needs an integration test: verify `hasPassword: false` in payload, verify "Set password" UI (no current-password field), verify backend accepts first-time password set without current-password compare, verify normal accounts still require it.
- Master-detail split vs full drill-down needs a responsive breakpoint decision (reuse existing app breakpoint if one exists) and manual verification at both sizes.
- Avatar crop step needs manual verification (no good way to automate pinch/zoom interaction in tests) — screenshot-based check acceptable.
- Push permission soft pre-prompt: verify native `requestPermission()` is not called until "Enable" is clicked; verify denied-state row appears when `Notification.permission === "denied"`.

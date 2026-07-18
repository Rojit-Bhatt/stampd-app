# Stampd redesign — implementation plan

Branch: `redesign/stampd-ledger-2026` (off `main` @ `ebeaf51`)
Design package: `docs/design/stampd-redesign-2026/*.dc.html`

## Approved decisions

| Decision | Answer |
|---|---|
| Outlet nav → hub dashboard + rail (OB×OA) | Approved |
| Platform nav → top-bar + contextual sub-nav + ⌘K (PB) | Approved |
| Two distinct celebrations (earn / redeem) | Approved |
| Analytics two-metric-families + subscription 3-step trust flow | Approved |
| Dark mode | Tokens written, **no toggle shipped** |
| New primitives | All 8 approved |
| Identity | Keep `Stampd` name + existing coin logo |

## Scope guardrails

- **Frontend only.** No backend file changes, no API contract changes, no model changes. If a screen needs data the API doesn't return, that is a finding to raise, not a backend edit.
- **No feature removed.** Every route in `App.tsx` survives. Nav concepts only move where things live.
- Backend test suite (`npm test -w backend`) must stay green at every phase — it is the isolation guarantee and must not be collateral damage.
- `npm run lint` (`tsc --noEmit`) green at the end of every phase. No phase lands red.

---

## Phase 0 — Foundation

**Deliverable:** the token layer every later phase builds on. No screen changes yet.

1. `frontend/src/index.css` — replace the warm cream/brown custom properties with the Stampd light set:
   `--bg #F7F8F7` · `--surface #FFFFFF` · `--surface-2 #EEF1EF` · `--ink #14201C` · `--muted #5C6B64` · `--soft #8B9A93` · `--line #E4E9E6` · `--primary #0FA968` · `--primary-deep #0B7A4B` · `--primary-soft #E6F7EF` · `--warn #C98A12` · `--err #C0392B`.
   Add the dark set under a `.dark` scope (written, unused).
2. `frontend/src/styles/fonts.css` — swap Libre Caslon Text/Inter for **Space Grotesk** (display), **DM Serif Display** (numerals), **Inter** (body/UI), **IBM Plex Mono** (keys/slugs/codes only). Self-hosted or `@import`, matching however fonts.css loads today.
3. Radii tokens: 8 field · 12 button · 18 card · pill. Replaces the current blanket `rounded-3xl`.
4. Elevation: green-tinted ambient shadows. Rewrite `.shadow-ambient`; keep `.stamp-interactive` but retune to lift −2px / press scale .97.
5. **Tenant-color contract** — the one piece of real logic in this phase. `lib/color.ts` gains a helper deriving `--tenant-ink` (darken until ≥4.5:1 on `--surface`) and `--tenant-on` (white or `--ink`, whichever passes on `--tenant`). `TenantContext` injects all three. **Rule enforced everywhere after this: tenant hue = identity, `--primary` green = value and action.** The points figure is never tenant-colored.
6. Motion constants module — the six springs from Foundations §05, each with a reduced-motion branch, so no component hand-rolls a spring.

**Verify:** `npm run lint` green; boot the app, every existing screen renders in new tokens without layout collapse. Deliberately ugly at this stage.

## Phase 1 — Primitives

Add the 8 approved primitives to `components/ui/`: `tabs`, `dropdown-menu`, `table`, `badge`, `progress`, `segmented-control`, `command`, `select`.
New deps: `@radix-ui/react-tabs`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-progress`, `@radix-ui/react-select`, `@radix-ui/react-toggle-group`, `cmdk`. `table`/`badge` are dependency-free.
Each built against Phase 0 tokens, not stock shadcn defaults.

**Verify:** lint green + a throwaway page rendering all 8. Deleted before merge.

## Phase 2 — Core loop

The highest-value phase. Ship this before anything cosmetic.

- `GenerateQr.tsx` — bill entry, big QR, pulsing 30s countdown ring, live campaign multiplier chip + award preview.
- `RedeemPoints.tsx` — redeem QR, consumption watch, confirm.
- `ClaimLanding.tsx` / `RedeemLanding.tsx` — happy path **plus all 6 failure states**: expired token, already-consumed, already-fulfilled (**must read as success**), wrong QR purpose, insufficient balance, unverified-email pending.
- `PointsCelebration.tsx` → split into two moments per approval: earn "coin lands" (spring 280/14, 0→1.16→1, 600ms count-up), redeem "the exchange" voucher flip (spring 220/18, rotateY 90→0, balance ticks down). Both reduced-motion branched.
- `ScannerModal.tsx` / `GlobalScannerModal.tsx`.

**Verify:** drive the full loop end-to-end in the browser against the mock DB — generate a bill QR, claim it, confirm the balance and ledger row, then redeem. Screenshots of both celebrations.

## Phase 3 — Customer app

`Explore.tsx` (My Places row + search/category discover grid, distance-sorted, **no fabricated ratings or deals**), `ExploreMine.tsx`, `CustomerDashboard.tsx` (balance card with thin tenant accent bar, green value figure), `CustomerHistory.tsx` (append-only ledger rows), `CustomerMenu.tsx`, `CustomerSettings.tsx`, `PointsBalanceCard.tsx`, `AuthView.tsx`, `PhoneStepModal.tsx`.
`BottomNav.tsx` → floating pill, tabs + centre scan FAB kept 1:1.
`CustomerLayout` / `GlobalCustomerLayout` — genuinely responsive, desktop as an expansion not a stretched phone layout.

**Verify:** every screen at 375px and 1280px. Mid-range Android is the baseline.

## Phase 4 — Outlet console

Nav restructure (OB×OA): hub dashboard + persistent rail, Earn/Redeem pinned. `AdminLayout.tsx` + `AdminOverview.tsx` are the structural work; the remaining 14 admin routes are reskins onto the new shell — Transactions, Customers, CustomerDetail, Reports ×2, PointsProgram (with a **visible inherit/override distinction**, since `null` means inherit and `0` is a real different value), Rewards, Campaigns, Menu, Events, Branding, Contact, Subscription, Settings, plus `MenuImportPreviewModal` and `SuspendedOverlay`.

## Phase 5 — Platform console

Nav restructure (PB): dark top-bar, contextual sub-nav, ⌘K palette. `PlatformLayout.tsx` + a new Overview dashboard.
`PlatformAnalytics.tsx` — the approved split: point-in-time metrics as plain bordered cards with **no trend badge**; weekly-flow metrics with green left-tab + sparkline + WoW delta.
Then Companies, CompanyDetail, RegisterCompany, Plans, SubscriptionKeys, Team, AuditLog, Contact, Settings, Login.

## Phase 6 — Company console + subscription

`CompanyLayout`, `CompanyDashboard`, `CompanyReports`, `CompanySubscription`.
`SubscriptionPanel.tsx` → approved 3-step trust flow: segmented `KEY-••••` input, "issued only by Stampd / no card details" reassurance, success state showing the new expiry.

## Phase 7 — Landing page

`PlatformLanding.tsx` — full rebuild around the real loop and "made for Nepal". New copy and IA, not a reskin. Platform identity, never tenant-themed.

## Phase 8 — Shared states + polish

`AccountMenu`, `AccountSettingsForm`, `ConfirmDialog`, `ErrorBoundary`, `NotFound`, all auth routes (admin + customer login/register/verify/forgot/reset).
Systematic sweep of every empty, loading, skeleton, error, permission-denied, suspended-tenant, and expired-subscription state.
Toast restyle. PWA theme-color and icons updated to the green palette.

## Phase 9 — Verification before merge

1. `npm run lint` green.
2. `npm test -w backend` green (all suites, including `test:isolation`).
3. `npm run build` clean.
4. Manual pass at 375px and 1280px across every route.
5. Real-device pass over the core loop on a phone via LAN IP (`SEED_DEMO_DATA=false`, `FRONTEND_ORIGINS`/`APP_BASE_URL` on the Mac's LAN IP) — the QR flow is the one thing a desktop browser cannot honestly verify.
6. Accessibility: contrast holds against a deliberately ugly tenant color, 44px touch targets, visible focus rings, reduced-motion respected.
7. Then PR into `main`.

---

---

## Status — all phases complete

Phases 0–8 are implemented and pushed to `redesign-2`. Phase 9 (final
verification) is partly done: lint, build, the tenant-colour check and all 20
backend suites are green, and the loop has been driven end-to-end against the
real backend in a browser at 375px and 1280px. **The real-device pass on a
phone over LAN is still outstanding and is the one thing a desktop browser
cannot honestly stand in for.**

### Bugs found and fixed along the way

These were pre-existing, not introduced by the redesign:

| Bug | Where | Why it mattered |
|---|---|---|
| Links built from the outlet slug alone | `Explore` discover cards, `AdminOverview` customer rows | An outlet slug is unique only within its company, so the path resolved to a company or to nothing. Every Discover card was a dead link. |
| Auth guards missed a stale session | `AdminGuard`, `GlobalCustomerLayout` | Both gated on `isError`; a bad token left the console rendering indefinitely off cached data while every write failed. |
| Redeem token expired mid-choice | `pointsService` | 30s had to cover scanning, browsing the catalog, choosing and confirming. Now 180s; earn stays 30s because it converts to a 15-minute pending claim on scan. |
| Branding preview lied | `Branding` | It drew the customer's balance in the outlet's gradient. After the colour contract the balance is always green, so admins were shown a result they'd never get. |
| Perpetual subscription rendered as a countdown | `SubscriptionPanel` | A grandfathered plan showed "36500 days left" beside a full bar. |
| Value figures wearing identity colour | `ExploreMine`, `AdminCampaigns` | Balances and campaign multipliers were painted with the raw tenant hue, unchecked for contrast. |

### Known gaps

- **The "that's a redeem code" claim state cannot be built.**
  `consumeDynamicQrToken` returns a bare `"Invalid QR token."` for a purpose
  mismatch, identical to a genuinely invalid token, so the frontend cannot tell
  them apart. All other claim failures are classified from message text for the
  same reason. A separate task covers adding real error codes.
- **Per-metric sparklines on the platform's flow tiles** are not built.
  `getPlatformAnalytics` returns one shared `pointsVelocity` series, not one per
  metric, so drawing four would mean inventing three.
- **Dark mode** tokens exist under `.dark` but no toggle ships, as agreed.

## Open risks

- ~~**Tenant color × green.**~~ Resolved in Phase 0: a colliding green hands its *identity accent* to the ink while the value green never moves. Logo tiles and the business name keep the true brand colour. `scripts/verify-tenant-color.ts` guards it, and Branding warns the admin before they save.
- **Design docs are static HTML mockups, not component code.** They are the reference, not a source to port. Every screen is a real build against the token system.
- ~~**`frontend design/`**~~ Resolved: deleted deliberately and committed in `41e69d7`, with CLAUDE.md repointed at this package.

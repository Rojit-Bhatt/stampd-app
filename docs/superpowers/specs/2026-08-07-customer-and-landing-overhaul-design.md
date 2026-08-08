# Customer + Landing Overhaul — Design & Implementation Plan

**Date:** 2026-08-07
**Status:** Approved preferences captured; F1 (dashboard redesign) awaiting a reference mock.
**Scope:** 17 requested changes across customer app, admin console, landing/marketing, and subscription.

Grouped by aspect (A–H). Each group is independently shippable except where a dependency is noted. Ordering in the plan reflects reuse (shared primitives first) and dependency.

---

## Confirmed preferences (from clarifying round)

| Topic | Decision |
|---|---|
| Notification source (C1) | Derive from existing data. A `/api/admin/notifications` endpoint already exists (types `redemption`, `new_customer`) — reuse it; filter today-only + last 7 client-side. No new model. |
| Toast system (C2) | **Replace** react-hot-toast globally with a motion.dev stacked-toast system. Keep the redesign's rule: neutral `--surface`/`--ink` card, success/error differ by **icon only**, no green/red. |
| WhatsApp number (H1) | Platform contact config (`usePlatformContact` / `platformConfigService.phone`). |
| Carousel graphics (B3) | Hand-built themeable **SVG** components (design tokens), not raster screenshots. |
| Post-earn destination (F2) | Auto-navigate to the outlet **dashboard (Card tab)** after the transparent animation. |
| Menu→reward points prefill (E3) | Prefill points = the rupee **price number** (e.g. Rs 165 → 165 pts), editable. |
| Time picker (D3) | **Custom styled** picker (hour / minute / AM–PM) matching the dark dialog. |
| Legal content (B2) | Research-grounded, tailored to Stampd (Nepal, loyalty data, no payment gateway). Nepal Individual Privacy Act 2075 + GDPR/CCPA-shaped structure. Clearly not lawyer-reviewed. |
| Dashboard redesign (F1) | **Blocked** — user will send a mock. Spec stubbed. |
| Login selector entry (A1) | New `/login` route with Business vs Customer cards. Business → `/admin-login`; Customer → `/customer-login`. Back chain: form → selector → landing. |
| Legal links (B2) | Footer links + `/terms`, `/privacy` routes (both already exist as stubs). |

---

## Group A — Auth / Login pages

### A1. Login-type selector
**Current:** Landing footer links go straight to `/customer-login`, `/admin-login`, `/platform/login`. No selector. (`LandingFooter.tsx`, `LandingNav.tsx`.)

**Spec:**
- New route `/login` → `routes/LoginSelect.tsx`. Two cards ("Business Login", "Customer Login") using `.stamp-interactive` + `.shadow-ambient`, tenant-neutral `--primary` accents.
- Business card → `/admin-login`. Customer card → `/customer-login`.
- Landing nav/footer "Login" button points to `/login` (not the individual forms).
- **Back buttons:** each login form (`AdminLogin`, `GlobalCustomerLogin`) gets a back control → `/login`; the selector gets a back control → `/` (landing). Use existing back-arrow pattern; guard so a form reached directly (deep link) still has a sensible back target (`navigate(-1)` fallback to `/login`).

**Files:** `App.tsx` (route), new `routes/LoginSelect.tsx`, `routes/AdminLogin.tsx`, `routes/GlobalCustomerLogin.tsx`, `LandingNav.tsx`, `LandingFooter.tsx`.

### A2. Platform admin login restyle
**Current:** `routes/platform/PlatformLogin.tsx` diverges visually from customer/admin login.

**Spec:** Refactor `PlatformLogin` to the same shell/card/typography as `AdminLogin`/`GlobalCustomerLogin` (fixed `--primary`/`--plat` green — platform is never tenant-themed). Extract a shared `AuthShell` wrapper if the three forms share enough markup (they do) to avoid three-way drift.

**Files:** `PlatformLogin.tsx`, optional new `components/shared/AuthShell.tsx`, `AdminLogin.tsx`, `GlobalCustomerLogin.tsx`.

**Acceptance:** three login screens visually consistent; back navigation works from each; deep-linking a form still works.

---

## Group B — Landing page & marketing content

### B1. Remove footer "Sign in" column
**Current:** `LandingFooter.tsx` renders a `SIGN_IN_LINKS` column (Customer / Staff / Platform).
**Spec:** Delete the `Sign in` `<Column>` and the `SIGN_IN_LINKS` const. The single navbar "Login" button (A1) is now the only console entry from the marketing site. Keep the Product + Company (legal) columns.

### B2. Terms of Service + Privacy Policy content
**Current:** `routes/platform/legal/Terms.tsx` and `Privacy.tsx` exist (stubs). Routes `/terms`, `/privacy` already registered and RESERVED.
**Spec:** Fill with structured, Stampd-tailored copy. Marketing-page chrome (dark landing theme). "Last updated" date. Sectioned with headings + bullets.

**Privacy Policy sections** (Nepal Individual Privacy Act 2075 + GDPR/CCPA shape):
1. Who we are / scope (Stampd, multi-tenant loyalty platform; controller vs the outlet).
2. Data we collect — account (name, email, phone, password hash, Google id), loyalty (points, transactions, bill amounts), device/usage, location (only if geolocation granted for `/explore`).
3. How we collect it (registration, QR claim, staff entry, Google OAuth).
4. How we use it (run the loyalty program, per-outlet balances, email verification/reminders).
5. Legal basis / consent (Privacy Act 2075 §12 informed consent).
6. Sharing — **explicit**: each outlet sees only its own tenant data; the platform never tells one outlet a customer visits another; third parties (email provider Brevo/SMTP, Google auth, hosting Render/Cloudflare/Atlas). No selling of data.
7. Retention (ledger is append-only; account deletion path).
8. Security (hashing, JWT, per-tenant isolation invariant).
9. Your rights — access, rectification, erasure, complaint (Privacy Act rights).
10. Children.
11. International transfers (hosting outside Nepal).
12. Changes + contact (platform contact config).

**Terms of Service sections:**
1. Acceptance / who may use.
2. Accounts — staff vs customer, accuracy, security of credentials.
3. The service — loyalty points are a promotional benefit, **not** money/legal tender, no cash value, governed by each outlet's program; points are per-outlet and don't pool.
4. Acceptable use / prohibited conduct (no fraud, no gaming QR claims).
5. Business (outlet) responsibilities — subscription key model, out-of-band payment, outlet sets earn/reward rules.
6. Intellectual property (Stampd platform vs outlet branding/content).
7. Third-party services.
8. Disclaimers & limitation of liability (no payment gateway; "as-is").
9. Suspension/termination (tenant suspension → 403).
10. Governing law — Nepal.
11. Changes + contact.

Add a footer/first-line disclaimer: template content, not legal advice; outlet should have counsel review. Include Nepal Privacy Act 2075 reference.

**Files:** `routes/platform/legal/Terms.tsx`, `routes/platform/legal/Privacy.tsx`.

### B3. Feature carousel — SVG graphics + item-offset, kill edge-blur
**Current:** `ServicesCarousel.tsx` = free-scroll strip of `/landing/services/{id}.webp` **screenshots**, with `from-[var(--lp-bg)]` edge gradient fades (the "blurred at each end, hard to read" complaint) and a per-card opacity fade `[0.35,1,1,0.35]` that dims text at rest.
**Spec:**
- Replace the webp `<img>` with a hand-built SVG illustration component per feature (`landing/graphics/PointsEngineArt.tsx`, `CampaignsArt.tsx`, `RewardsArt.tsx`, …), using `--lp-*`/green/ink tokens. Abstract representations of each feature (points meter, campaign multiplier, reward card) — not literal app screenshots.
- Rework to the [motion.dev react-carousel-item-offset](https://motion.dev/examples/react-carousel-item-offset) pattern: a tracked carousel where the media translates against the card by an offset while the **card frame and its caption stay fully opaque and legible**.
- Remove the resting-state text dimming and the hard edge-gradient fades (or reduce to a subtle non-obscuring mask that never touches the caption text). Fix "blurred at each end."

**Files:** `ServicesCarousel.tsx`, new `routes/platform/landing/graphics/*.tsx`, `data.ts` (map block id → art component), delete now-unused `/public/landing/services/*.webp` if nothing else references them.

### B4. Infinite marquee / ticker
**Spec:** New `routes/platform/landing/Marquee.tsx`. Pure-CSS seamless loop (duplicated track, `translateX(0 → -50%)`, pause on hover, `prefers-reduced-motion` disables the animation). Content = **our own** words: short value tags / one-line testimonials in Stampd voice (e.g. "Points that spend like cash", "No app to install", "Runs from one phone", "Every rupee earns", outlet-type tags: "Cafés · Bakeries · Kitchens"). Place as a band on `PlatformLanding.tsx`. Optionally two rows opposite directions (logo-wall effect) using tag chips. No external logos we don't own.

**Files:** new `Marquee.tsx`, `PlatformLanding.tsx`, `data.ts` (marquee content), CSS keyframes in `index.css` or a scoped style.

**Acceptance:** carousel captions fully readable end-to-end; no screenshots; marquee loops seamlessly and pauses on hover; reduced-motion respected.

---

## Group C — Motion.dev feedback stacks (shared primitive first)

### C0. Shared stacked-card primitive
Build `components/ui/CardStack.tsx` (or `motion/StackedCards`) once — collapsed pile that expands to a list, based on [js-notifications-stack](https://motion.dev/examples/js-notifications-stack), adapted to React + our `useMotion()`. Both C1 and C2 consume it. **Expand downward** (source expands up; invert).

### C1. Notification stack (admin console)
**Current:** `components/admin/NotificationBell.tsx` — a `Bell` button in the console navbar opening a `DropdownMenu`, polling `/api/admin/notifications` (30s), dwell-to-mark-read. Types: `redemption`, `new_customer`.
**Spec:**
- Move to **top-right of the admin dashboard** as a stacked notification component (not the navbar). Remove the bell icon from the navbar (`AdminLayout.tsx`).
- Collapsed = a single notification **button/pill with icon + count**. Click → reveals the stack expanding **downward** (motion.dev stack physics via C0).
- Filter to **today only** (createdAt within current day, `Asia/Kathmandu`), then cap at **last 7**.
- Empty → "No notifications" (or "Nothing today").
- Keep the existing dwell mark-all-read behaviour.

**Files:** `NotificationBell.tsx` (rework → `NotificationStack.tsx`), `AdminLayout.tsx` (remove navbar bell, mount stack on dashboard/overview or as a fixed top-right overlay in the console shell), consume `CardStack`.

### C2. Toast stack — replace react-hot-toast
**Current:** single `<Toaster>` (react-hot-toast) in `App.tsx`, bottom-right, neutral card, icon-only success/error (per redesign). Used app-wide via `toast()`.
**Spec:**
- Replace with a motion.dev [react-toast-stack](https://motion.dev/examples/react-toast-stack)-style system: a `ToastProvider` + `useToast()` (or a thin `toast` shim keeping the same call sites) rendering stacked, spring-animated toasts. Reuse C0 stack visuals where sensible.
- **Preserve the design rule:** one neutral `--surface`/`--ink` card; success vs error differ by **icon shape only**; no green/red. Bottom-right. Respect `useReducedMotion`.
- Migrate all `react-hot-toast` call sites. Prefer a compatible `toast.success/error/…` shim so call sites don't all change; audit `toast(` usages.
- Apply to the flows the user named: event created/updated, contact updated, redeem success, earn success, generic errors.
- Remove `react-hot-toast` dep once migrated.

**Files:** new `components/ui/toast/*` (`ToastProvider`, `useToast`, `toast` shim), `App.tsx` (swap `<Toaster>`), sweep of `toast` imports, `package.json`.

**Acceptance:** notifications stack expands downward with today-only/last-7; empty state; navbar bell gone. Toasts stacked & animated, still neutral/icon-only; all existing call sites fire.

---

## Group D — Events feature

### D1. Event card redesign (image top, details below)
**Current:** `components/customer/EventCard.tsx` = horizontal thumbnail-left layout with **truncated** title/location/description. `ExploreEvents.tsx` and the customer dashboard render events.
**Spec:** Rebuild as a vertical card — **image on top** (full-width, `object-cover`, rounded top), details below (date chip, title, time, location, full description — **no truncation**, wraps). `.shadow-ambient` + `rounded-3xl`. Placeholder graphic when no image. Use across: customer dashboard events section, `/explore/events`.

### D2. Sort closest events first
**Spec:** Order events by soonest upcoming date first (ascending by `date`, upcoming before past; hide or de-emphasize past). Apply in `useExploreEvents` and wherever the dashboard pulls events.

### D3. Time field → custom time picker
**Current:** `EventFormModal.tsx` has a free-text Time field ("Time (e.g. 7:00 PM)").
**Spec:** Replace the text input with a custom styled picker (hour 1–12, minute, AM/PM) matching the dark dialog. Emits the same display string ("7:00 PM") the model already stores (`event.time` is a display string), so no backend change. Keep it keyboard-accessible.

**Files:** `EventCard.tsx`, `ExploreEvents.tsx`, `useExploreEvents.ts`, customer dashboard, `EventFormModal.tsx`, new `components/ui/TimePicker.tsx`.

**Acceptance:** cards show image-top with full wrapped description; nearest events first; event form uses a picker, stored string unchanged.

---

## Group E — Rewards restructure

### E1. New "Rewards" nav section (replaces Profile tab)
**Current:** `BottomNav.tsx` tabs = Card / Menu / (scan) / Points / **Profile** (`settings`). Profile = `CustomerSettings`.
**Spec:**
- Replace the **Profile** bottom-nav slot with **Rewards** (gift icon), routing to a new `rewards` page listing the outlet's configured rewards as cards (reuse/upgrade `RewardCard.tsx`, grid, brand-themed). New route `dashboard`-sibling: `/:c/:o/rewards` → `routes/CustomerRewards.tsx`.
- Profile becomes reachable via a **profile icon at the top-right** of the customer shell (`CustomerLayout` header) → `settings`.

### E2. Remove "Redeem Your Points" card
**Spec:** Remove the "Redeem Your Points" card section from the customer dashboard entirely — it's superseded by the Rewards tab (E1) and the dashboard events section (D1). Verify nothing else links to it.
**Depends on:** E1 existing.

### E3. Menu-set rewards get full config flow + Points button
**Current:** `MenuManagement.tsx` sets a `pointsPriceCenti` inline on a menu row (the "pts" number field in the reference). `RewardFormModal.tsx` is the full manual-reward dialog (name/points/description/image).
**Spec:**
- In the menu manager, replace the inline **points number field** with a **"Points" button** per row.
- Clicking it opens a dialog modeled on `RewardFormModal` (description, image upload, points) with the **item name pre-filled and locked** (can't edit — it's the menu item's name).
- Points **pre-filled = the item's rupee price number** (e.g. 165), editable.
- Saving writes the menu item's redeem config (points price + optional reward description/image) through the existing org-scoped `updateItem`. If `MenuItem` lacks reward description/image fields, add them (backend `MenuItem` model + `menuService`) — see open items.

**Files:** `MenuManagement.tsx`, `RewardFormModal.tsx` (make reusable with a locked-name + prefilled-points mode), `RewardCard.tsx`, new `routes/CustomerRewards.tsx`, `BottomNav.tsx`, `CustomerLayout.tsx`, `App.tsx` (route), possibly backend `models/MenuItem`, `services/menuService.js`.

**Acceptance:** bottom nav shows Rewards not Profile; profile via top-right icon; Rewards tab lists reward cards; menu rows use a Points button opening the full dialog with locked name + price-prefilled points.

---

## Group F — Customer dashboard & points UX

### F1. Customer console outlet dashboard redesign — **BLOCKED**
Awaiting reference mock from user. Placeholder: current dashboard is `routes/CustomerDashboard.tsx` + `PointsBalanceCard.tsx`. Spec on mock arrival.

### F2. Transparent auto-advancing points animation
**Current:** `EarnCelebration.tsx` shows a full-screen celebration with a manual "Go to dashboard" button (`onDone`). Used by `ClaimLanding`, `ScannerModal`, etc.
**Spec:** Add a mode where, after the earn animation plays, a **transparent/short** confirmation lingers briefly then **auto-navigates to the outlet dashboard (Card tab)** with the updated balance — no manual tap. Implementation: auto-fire `onDone` after a timeout (e.g. ~2–2.5s after the count-up settles), keep the button as an accessible fallback/skip. Respect reduced-motion (shorter/no delay). Apply on the customer-side earn flow (`ClaimLanding`, in-app scan earn).

### F3. Account-created date in customer full details
**Current:** `routes/admin/AdminCustomerDetail.tsx` shows customer details (no created date). `CustomerAccount`/`User` membership has `createdAt`.
**Spec:** Surface "Customer since {date}" in the customer full-details section. Prefer the membership `createdAt` at this outlet (per-tenant, matches the isolation rule — do **not** expose the global `CustomerAccount.createdAt` which would leak cross-outlet tenure). Confirm the customers API returns a `createdAt`; add to the serializer if missing (org-scoped).

**Files:** `AdminCustomerDetail.tsx`, possibly `services/customerService`/controller serializer.

**Acceptance:** earn flow auto-lands on dashboard; admin customer detail shows join date sourced per-outlet.

---

## Group G — Menu display bug + sweep

### G1. Customer menu description wraps (no truncation) + similar-bug sweep
**Current:** `EventCard` and menu item cards use `truncate` on descriptions (single line + ellipsis) — the reported bug. Customer menu is `CustomerMenu.tsx` / `useCustomerMenu`.
**Spec:**
- Customer mobile menu: description **wraps** to the next line and the card grows; remove `truncate`/`line-clamp-1` on the description. Keep name on one line if desired, but description shows in full.
- **Sweep** for the same anti-pattern elsewhere (`truncate` / `line-clamp` hiding meaningful content): `EventCard` (fixed by D1), reward cards, customer/explore lists, admin lists. List each occurrence, decide keep-vs-wrap per context (a name truncating is fine; a description hiding content is the bug), fix the offenders. Deliver the list in the PR description.

**Files:** `CustomerMenu.tsx`, `useCustomerMenu.ts`, plus sweep results.

---

## Group H — Subscription "Talk to us" → WhatsApp

### H1. WhatsApp deep-link with per-subscription template
**Current:** `components/shared/SubscriptionPanel.tsx` (used by `CompanySubscription.tsx` / `AdminSubscription.tsx`) has a "Talk to us" button. Platform contact phone available via `usePlatformContact` (`toWaNumber` helper already exists in `WhatsAppFloat.tsx`).
**Spec:**
- "Talk to us" opens `https://wa.me/{platformPhone}?text={encoded template}` in a new tab.
- Per-subscription template pre-fills the message with the specific plan/subscription context (plan name, outlet/company, days left / expiry, "I'd like to renew/upgrade …"). The user can edit before sending — WhatsApp puts the template in the input box; editable by nature of the `?text=` prefill.
- One template per subscription state (active/expiring/expired) or per plan, chosen from the subscription the button is clicked from.

**Files:** `SubscriptionPanel.tsx`, reuse `toWaNumber` (export it), `usePlatformContact`, template builder helper.

**Acceptance:** button opens WhatsApp to the platform number with an editable, context-filled message.

---

## Implementation plan (ordering)

Reuse-first, then dependencies, then independents.

**Phase 1 — Shared primitives (unblocks most)**
1. C0 `CardStack` stacked primitive.
2. C2 toast system replacement (depends on C0 visuals) — do early so later groups emit toasts through the new system.
3. `AuthShell` extraction (A2 groundwork).

**Phase 2 — Rewards + Events restructure (interdependent)**
4. E1 Rewards nav + `CustomerRewards` route + top-right profile icon.
5. E2 remove "Redeem Your Points" card (needs E1).
6. D1 event card redesign + D2 sort (fills the space E2 frees on the dashboard).
7. E3 menu Points-button dialog (+ backend MenuItem reward fields if needed).
8. D3 event time picker.

**Phase 3 — Notifications**
9. C1 notification stack on admin dashboard, remove navbar bell (consumes C0).

**Phase 4 — Auth pages**
10. A1 login selector + back navigation.
11. A2 platform login restyle.

**Phase 5 — Landing / marketing**
12. B1 remove footer sign-in column.
13. B2 legal content (Terms + Privacy).
14. B3 carousel SVG graphics + item-offset + de-blur.
15. B4 infinite marquee.

**Phase 6 — Customer UX polish**
16. F2 auto-advancing earn animation.
17. F3 account-created date.
18. G1 menu description wrap + bug sweep.
19. H1 WhatsApp subscription deep-link.

**Blocked:** F1 dashboard redesign — start when mock arrives; slots cleanly after Phase 2 (dashboard already touched).

### Testing
- Backend touched only by E3 (MenuItem reward fields) and possibly F3 serializer — add/extend a `node tests/*.js` suite and register it in `package.json`'s `test` chain (per CLAUDE.md). Keep org-scoping on every new query.
- Frontend: `npm run lint` (tsc) after each phase; browser-preview verify the customer app (mobile viewport) for D1/E1/F2/G1.
- Isolation invariant: F3 must source `createdAt` per-outlet, never from `CustomerAccount`.

### Open items / risks
- **E3 backend:** confirm whether `MenuItem` should carry a reward `description`/`imageId`; if the redeem catalog only needs points price, keep it minimal and store description/image on a `RewardItem` instead. Decide before Phase 2 step 7.
- **G1 sweep:** produce the truncation-offender list during implementation; some `truncate` are intentional (names) — don't blanket-remove.
- **C2 migration:** ensure every `toast(...)` call site still compiles via the shim; grep before removing the dep.
- **F1:** blocked on mock.
- Legal copy is template-grade; add an on-page "not legal advice" note.

### Sources (legal research)
- [SaaS Privacy Policy guide 2025 — cookie-script](https://cookie-script.com/guides/saas-privacy-policy)
- [SaaS ToS template — Promise Legal](https://promise.legal/templates/terms-of-service)
- [Data Privacy & Protection Laws in Nepal (Privacy Act 2075)](https://nepaldivorce.com/blog/data-privacy-and-protection-laws-in-nepal)
- [Data Protection & Privacy Legislation in Nepal — Law Imperial](https://www.lawimperial.com/data-protection-and-privacy-legislation-in-nepal/)

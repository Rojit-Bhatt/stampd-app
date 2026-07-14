# Epic D3 — Contact, Social & Maps Config

**Date:** 2026-07-15
**Status:** Approved design, ready for implementation plan
**Scope:** Third of four specs decomposed from the original "Epic D" (customer drill-in [D1, merged], Excel reports [D2, merged], contact/maps config [this spec], featured-items/events cards [D4]). This spec covers only tenant contact/social/hours/map config and its customer-facing display. D4 is a separate, independent spec.

## Context

Each tenant already has admin-editable `branding` (logo, banner, tagline, colour) and `program` (stamp rules) config, following the same `Organization` sub-object pattern, edited via a dedicated admin screen with a live preview, and surfaced to customers through the public `/api/tenant` endpoint. There is currently no way for a business to tell its customers a phone number, address, hours, or social links. The ask: let the admin configure contact/location/social info, and show it to logged-in customers.

## Decisions locked during brainstorming

1. **Field set:** phone, email, address (free text), latitude/longitude (for a map embed), hours (free text), about-us blurb, and three fixed social links (Instagram, Facebook, X). All optional.
2. **Map rendering:** a small OpenStreetMap iframe embed (`openstreetmap.org/export/embed.html`), not a plain text link and not a static image — no API key, no cost, actually renders a small interactive map.
3. **Location input:** admin enters latitude/longitude directly (e.g. copied from Google Maps' "What's here" or its URL) — no geocoding call, no external HTTP dependency at save-time, works offline.
4. **Hours:** one free-text field (e.g. "Mon–Sat: 8am–8pm, Sun: Closed"), not structured per-day rows — matches the low-schema-overhead style of every other non-loyalty-critical field in this app.
5. **Social links:** fixed set of three optional URL fields (Instagram, Facebook, X) — same pattern as `logoUrl`/`bannerUrl`, no arbitrary add/remove list UI (this codebase has no such pattern anywhere).
6. **Admin nav placement:** a new flat "Contact" entry in `AdminLayout.tsx`'s `NAV` array, after "Branding" — same flat-list pattern as every other section, no new nested-nav UI.
7. **Admin screen layout:** mirrors `Branding.tsx` — form on the left, live preview (including the OSM iframe) on the right, one save button.
8. **Customer-facing placement:** a new section on the authenticated `CustomerDashboard.tsx`, below the existing "away hint" helper text — not a 5th bottom-nav tab (would crowd the 4-item phone-width footer) and not only on the pre-signup landing page. Renders only if at least one contact field is non-empty (no empty-state clutter for tenants who haven't configured it).

## Data Model

New `contact` sub-object on `Organization`, added alongside `branding`/`program` (no new schema file, no migration — Mongoose schema defaults backfill on read, same as every prior sub-object addition):

```js
contact: {
  phone: { type: String, default: "" },
  email: { type: String, default: "" },
  address: { type: String, default: "" },
  latitude: { type: Number, default: null },
  longitude: { type: Number, default: null },
  hours: { type: String, default: "" },
  aboutUs: { type: String, default: "" },
  socials: {
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    x: { type: String, default: "" }
  }
}
```

## Backend

**No new endpoints, no new controller functions, no new service.** Pure data pass-through on the existing tenant endpoints in `backend/controllers/tenantController.js`:

- `getPublicTenant` (public, `resolveTenant`-scoped, backs `GET /api/tenant`): response gains `contact: organization.contact`, alongside the existing `branding`.
- `getMySettings` (`GET /api/admin/settings`, JWT-scoped): response gains `contact: organization.contact`.
- `updateMySettings` (`PATCH /api/admin/settings`): gains the same spread-merge treatment already used for `branding` — `if (contact !== undefined && typeof contact === "object") { organization.contact = { ...organization.contact, ...contact }; }`. Nested `socials` merges shallowly the same way `branding` does today (whole-object replace on the nested key if provided, matching existing behavior — the admin form always sends the full `contact` object including a full `socials` object, so shallow-merge at the top level is sufficient and consistent with how `branding` already works).

## Frontend

### Admin: `frontend/src/routes/admin/AdminContact.tsx` (new)

- Fields: Phone, Email, Address (text inputs), Latitude, Longitude (number inputs), Hours (textarea), About us (textarea), Instagram/Facebook/X (URL text inputs).
- Live preview panel (right side, sticky, mirrors `Branding.tsx`): renders the OSM iframe (if lat/long set) + the same contact block the customer will see, at preview scale.
- One "Save contact info" button using `useUpdateAdminSettings`.
- `frontend/src/hooks/useAdminSettings.ts`: add `AdminContact` interface (mirrors the schema above), add `contact: AdminContact` to `AdminSettings`, add `contact?: Partial<AdminContact>` to `AdminSettingsPatch`.
- `frontend/src/components/admin/AdminLayout.tsx`: add `{ to: "contact", label: "Contact", Icon: Phone }` to `NAV`, after the "branding" entry; add `Phone` to the `lucide-react` import.
- `frontend/src/App.tsx`: lazy-import `AdminContact`, add `<Route path="contact" element={<AdminContact />} />` alongside the other admin routes.

### Customer: `CustomerDashboard.tsx` contact section

- `frontend/src/context/TenantContext.tsx`: add `TenantContact` interface (same shape), add `contact: TenantContact` to the `Tenant` interface.
- In `CustomerDashboard.tsx`, below the existing "away hint" block: a new card, rendered only if `tenant?.contact` has at least one non-empty field. Contents:
  - OSM iframe (`https://www.openstreetmap.org/export/embed.html?bbox={lon-0.01},{lat-0.01},{lon+0.01},{lat+0.01}&marker={lat},{lon}`) at a fixed small height (~160px, rounded corners matching the app's card style) if both latitude and longitude are set; tapping it opens `https://www.openstreetmap.org/?mlat={lat}&mlon={lon}` in a new tab.
  - Address, phone (as a `tel:` link), email (as a `mailto:` link), hours, about-us text — each only rendered if its field is non-empty.
  - Social icons (Instagram, Facebook, X from `lucide-react`, already a project dependency) as small linked buttons, one per non-empty `socials` field, opening in a new tab.

## Testing / Verification

1. **Backend**, self-contained via `tests/helpers/bootServer.js` (`backend/tests/business-contact.js`):
   - `PATCH /api/admin/settings` with a `contact` payload (all fields incl. `socials`) → `200`, response echoes it back.
   - `GET /api/admin/settings` → the saved `contact` persists.
   - `GET /api/tenant` (public, no auth, just `X-Tenant-Slug`) → also exposes the same `contact` object.
   - A second tenant's `GET /api/tenant` shows its own (empty-default) `contact`, unaffected by the first tenant's save — tenant isolation.
2. **Frontend:** `npx tsc --noEmit` clean.
3. **Browser**, tenant `coffesarowar`: fill in every field on the new admin Contact screen including a real lat/long, save, confirm the live preview updates and the OSM iframe renders. Log in as the seeded customer, confirm the new contact section appears on the dashboard below the reward/away-hint area with a working `tel:` link, `mailto:` link, rendered hours/about-us text, working social icons, and the map embed matching the saved coordinates.

## Out of scope

No geocoding of free-text addresses (lat/long entered directly, per decision 3). No structured per-day business hours (per decision 4). No arbitrary/add-remove social link list (fixed three platforms, per decision 5). No 5th bottom-nav tab or dedicated `/contact` route. D4 (featured items/events cards) is unaffected and remains a separate spec.

# Epic E2: Platform Contact Info — Design

## Context

Epic E (profile/settings polish) was decomposed into E1–E4. E1 (profile menus, account settings, business-admin email verification) is done and merged. This is E2.

The Stampd platform itself — the SaaS marketing/landing page at `/` (`PlatformLanding.tsx`) and the platform-admin console (`/platform/*`) — has **no contact info anywhere**: no schema field, no config, no Contact Us section on the landing page. This is distinct from the existing per-tenant `Organization.contact` (built in D3), which is a business's own contact info shown to *its* customers. E2 adds the platform's own contact info, edited by the platform admin, shown on the platform's public landing page.

## Data model

New `backend/models/PlatformConfig.js` — a singleton document (there is exactly one platform, not one per tenant):

```js
const mongoose = require("mongoose");

const PlatformConfigSchema = new mongoose.Schema({
  // Fixed lookup key. Always true, unique, so findOneAndUpdate({singleton:true}, ..., {upsert:true})
  // always targets the same one document.
  singleton: { type: Boolean, default: true, unique: true },

  contact: {
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    hours: { type: String, default: "" },
    aboutUs: { type: String, default: "" },
    socials: {
      instagram: { type: String, default: "" },
      facebook: { type: String, default: "" },
      x: { type: String, default: "" }
    }
  }
});

module.exports = mongoose.model("PlatformConfig", PlatformConfigSchema);
```

Same shape as `Organization.contact` minus `latitude`/`longitude` (no map embed — a SaaS company's HQ location isn't relevant to visitors the way a café's address is to its customers).

## Backend

New `backend/services/platformConfigService.js`:
- `getContact()` — `PlatformConfig.findOneAndUpdate({ singleton: true }, {}, { upsert: true, new: true })`. The empty `{}` update means "create with schema defaults if missing, otherwise return as-is" — this single call handles both "never configured" and "already configured" without a separate existence check.
- `updateContact(updates)` — `PlatformConfig.findOneAndUpdate({ singleton: true }, { $set: { contact: { ...current.contact, ...updates, socials: { ...current.contact.socials, ...(updates.socials || {}) } } } }, { upsert: true, new: true })`. Same shallow-merge-plus-nested-socials-merge pattern as `tenantController.updateMySettings`.

New endpoints in `backend/controllers/platformController.js` + `backend/routes/platformRoutes.js`:
- `GET /api/platform/public-contact` — no middleware (public, no tenant resolution needed — this isn't tenant data). Returns `{ success: true, contact }`.
- `GET /api/platform/contact` — `verifyToken, isPlatformAdmin`. Returns `{ success: true, contact }`.
- `PATCH /api/platform/contact` — `verifyToken, isPlatformAdmin`. Body: partial `{ phone?, email?, address?, hours?, aboutUs?, socials? }`. Returns `{ success: true, contact }`.

## Frontend

- New `frontend/src/hooks/usePlatformContact.ts` — `usePlatformContact()` (public GET, used by landing page), `usePlatformContactAdmin()` (authed GET, used by admin form), `useUpdatePlatformContact()` (PATCH mutation, invalidates both query keys on success).
- New `frontend/src/routes/platform/PlatformContact.tsx` — form mirroring `AdminContact.tsx`: phone/email/address/hours/about-us fields + 3 social-link fields, same `EMAIL_RE`/`PHONE_RE` validation and inline error styling already established in `AdminContact.tsx`, Save button disabled while invalid or saving. No live preview/map (no lat-long here).
- `frontend/src/components/platform/PlatformLayout.tsx` — `NAV` array gains `{ to: "contact", label: "Contact", Icon: Phone }` (after "Onboard new").
- `frontend/src/App.tsx` — new lazy `PlatformContact` import + route `contact` inside the existing guarded `PlatformLayout` block (sibling of `onboard`, `businesses/:id`, `settings`).
- `frontend/src/routes/platform/PlatformLanding.tsx` — new "Contact us" section added before the closing `<footer>`, rendered from `usePlatformContact()`. Shows only non-empty fields (phone/email/address/hours/aboutUs/socials) — if every field is empty, the whole section renders nothing, same "hide if blank" rule the tenant dashboard's Visit-us card uses.

## Testing

New `backend/tests/platform-contact.js`:
- `GET /api/platform/public-contact` before any config exists → `200`, all contact fields empty strings.
- Platform admin login → `PATCH /api/platform/contact` with a full set of fields → `200`, returns updated contact.
- `GET /api/platform/public-contact` again → reflects the update.
- `PATCH /api/platform/contact` without a token → `401`.
- `PATCH /api/platform/contact` with a business_admin or customer token → `403`.
- `backend/package.json` `test` script gains `&& node tests/platform-contact.js`.

## Out of scope

- Any change to per-tenant `Organization.contact` (D3, unaffected).
- Latitude/longitude or map embed for the platform.
- Multiple platform admins having different contact configs — this is one global record regardless of which platform admin edits it.

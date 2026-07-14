# Epic D3 — Contact, Social & Maps Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can configure phone/email/address/lat-long/hours/about-us/social links for their tenant; logged-in customers see a contact section (incl. a small OpenStreetMap embed) on their dashboard.

**Architecture:** A new `contact` sub-object on `Organization`, following the exact pattern `branding`/`program` already use. No new endpoints — the existing `getPublicTenant`/`getMySettings`/`updateMySettings` in `tenantController.js` just pass `contact` through like they already do for `branding`. Two new frontend surfaces: an admin edit screen (mirrors `Branding.tsx`) and a customer-facing display section on `CustomerDashboard.tsx`.

**Tech Stack:** Node/Express, Mongoose (+ in-memory mock in dev), React 19 + Vite + TS, TanStack Query, lucide-react icons, OpenStreetMap iframe embed (no API key).

## Global Constraints

- Every user/loyalty query includes `organizationId` — tenant isolation is the core invariant.
- Backend layering: `routes/ → controllers/ (thin) → services/ (logic) → models/`. No business logic in controllers. (This feature is pure data pass-through, so no service layer is needed — mirrors how `branding` already works with zero service-layer code.)
- No geocoding — latitude/longitude are entered directly by the admin, never derived from a free-text address.
- Hours is one free-text field, not structured per-day data.
- Social links are a fixed set of three optional fields (Instagram, Facebook, X/Twitter) — no add/remove list UI.
- The customer-facing contact section renders only if at least one `contact` field is non-empty.
- No new nested-nav UI — "Contact" is one more flat entry in `AdminLayout.tsx`'s `NAV` array.
- Commit with explicit file paths (`git add <path>`) — never `git add -A`.

---

### Task 1: Backend — contact schema + endpoint pass-through + tests

**Files:**
- Modify: `backend/models/Organization.js`
- Modify: `backend/controllers/tenantController.js`
- Create: `backend/tests/business-contact.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `Organization.contact` sub-document shape `{ phone: string, email: string, address: string, latitude: number|null, longitude: number|null, hours: string, aboutUs: string, socials: { instagram: string, facebook: string, x: string } }`.
- Produces: `GET /api/tenant` response gains `tenant.contact`; `GET /api/admin/settings` response gains `settings.contact`; `PATCH /api/admin/settings` accepts and merges `contact` in its request body, gains `settings.contact` in its response.

- [ ] **Step 1: Add the contact sub-schema**

In `backend/models/Organization.js`, add the new field after the existing `program` block (before `menuEnabled`):

```js
  // Contact/location/social info the business admin controls, shown to
  // customers on their dashboard. All fields optional — a tenant with
  // nothing filled in just shows no contact section.
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
  },

```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/business-contact.js`:

```js
/**
 * Contact/social/maps config suite (Epic D3).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms the admin can save contact info, that it's
 * readable back from the admin settings endpoint, that the public tenant
 * endpoint also exposes it (unauthenticated), and that a second tenant's
 * contact info stays isolated.
 *
 * Run directly: `node tests/business-contact.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5018 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) headers["X-Tenant-Slug"] = slug;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const contactPayload = {
      phone: "+977 1 4123456",
      email: "hello@coffesarowar.test",
      address: "123 Durbar Marg, Kathmandu",
      latitude: 27.7172,
      longitude: 85.324,
      hours: "Mon-Sat: 8am-8pm, Sun: Closed",
      aboutUs: "Kathmandu's cosiest corner coffeehouse since 2019.",
      socials: {
        instagram: "https://instagram.com/coffesarowar",
        facebook: "https://facebook.com/coffesarowar",
        x: "https://x.com/coffesarowar",
      },
    };

    const patched = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { contact: contactPayload },
    });
    check("PATCH settings -> 200", patched.status === 200);
    check("PATCH response echoes phone", patched.body.settings?.contact?.phone === contactPayload.phone);
    check("PATCH response echoes latitude", patched.body.settings?.contact?.latitude === contactPayload.latitude);
    check("PATCH response echoes instagram", patched.body.settings?.contact?.socials?.instagram === contactPayload.socials.instagram);

    const settings = await api("/api/admin/settings", { token: adminToken });
    check("GET settings -> 200", settings.status === 200);
    check("GET settings persists address", settings.body.settings?.contact?.address === contactPayload.address);
    check("GET settings persists hours", settings.body.settings?.contact?.hours === contactPayload.hours);
    check("GET settings persists x social", settings.body.settings?.contact?.socials?.x === contactPayload.socials.x);

    const publicTenant = await api("/api/tenant");
    check("GET public tenant -> 200", publicTenant.status === 200);
    check("public tenant exposes contact", publicTenant.body.tenant?.contact?.email === contactPayload.email);
    check("public tenant exposes longitude", publicTenant.body.tenant?.contact?.longitude === contactPayload.longitude);

    // Tenant isolation: a second tenant's contact info is untouched (still defaults).
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const runSuffix = Date.now();
    const secondSlug = `brewhaven-${runSuffix}`;
    const secondAdminEmail = `boss+${runSuffix}@brewhaven.test`;
    await api("/api/platform/businesses", {
      method: "POST",
      slug: undefined,
      token: platformToken,
      body: {
        name: "Brew Haven",
        slug: secondSlug,
        adminName: "Haven Boss",
        adminEmail: secondAdminEmail,
        adminPassword: "password",
      },
    });
    const secondPublicTenant = await api("/api/tenant", { slug: secondSlug });
    check("second tenant's contact is untouched (empty default)", secondPublicTenant.body.tenant?.contact?.phone === "");
    check("second tenant's contact has no coffesarowar email", secondPublicTenant.body.tenant?.contact?.email !== contactPayload.email);
  } finally {
    stop();
  }

  if (failures) { console.error(`business-contact: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("business-contact: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run: `cd backend && node tests/business-contact.js`
Expected: FAIL — `contact` doesn't exist on the model or the endpoints yet, so `patched.body.settings?.contact?.phone` etc. are `undefined`.

- [ ] **Step 3: Pass `contact` through the three tenant endpoints**

In `backend/controllers/tenantController.js`, `getPublicTenant`'s response object gains `contact`:

```js
    res.status(200).json({
      success: true,
      tenant: {
        name: organization.name,
        slug: organization.slug,
        branding: organization.branding,
        contact: organization.contact,
        menuEnabled: organization.menuEnabled,
        program: {
          stampsRequired: organization.program.stampsRequired,
          rewardTitle: organization.program.rewardTitle,
          rewardDescription: organization.program.rewardDescription
        }
      }
    });
```

`getMySettings`'s response object gains `contact`:

```js
    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        branding: organization.branding,
        contact: organization.contact,
        program: organization.program,
        menuEnabled: organization.menuEnabled
      }
    });
```

`updateMySettings`: destructure `contact` from `req.body` and merge it, then include it in the response, matching the existing `branding` treatment exactly:

```js
    const { name, branding, contact, program, menuEnabled } = req.body;

    if (name !== undefined) {
      organization.name = name.trim();
    }

    if (branding !== undefined && typeof branding === "object") {
      organization.branding = {
        ...organization.branding,
        ...branding
      };
    }

    if (contact !== undefined && typeof contact === "object") {
      organization.contact = {
        ...organization.contact,
        ...contact
      };
    }

    if (program !== undefined && typeof program === "object") {
      organization.program = {
        ...organization.program,
        ...program
      };
    }

    if (menuEnabled !== undefined) {
      organization.menuEnabled = Boolean(menuEnabled);
    }

    await organization.save();

    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        branding: organization.branding,
        contact: organization.contact,
        program: organization.program,
        menuEnabled: organization.menuEnabled
      }
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node tests/business-contact.js`
Expected: `business-contact: all PASS`.

- [ ] **Step 5: Add to the test suite**

In `backend/package.json`, append to the `test` script:

```
"test": "node tests/integration-qa.js && node tests/run-voucher-test.js && node tests/multi-tenant-isolation.js && node tests/auth-email-flow.js && node tests/min-bill-amount.js && node tests/menu-import.js && node tests/customer-detail.js && node tests/business-reports.js && node tests/business-contact.js",
```

Run: `cd backend && npm test`
Expected: all nine suites pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/models/Organization.js backend/controllers/tenantController.js backend/tests/business-contact.js backend/package.json
git commit -m "feat(contact): tenant contact/social/maps config, pass-through endpoints"
```

---

### Task 2: Frontend — admin Contact screen

**Files:**
- Modify: `frontend/src/hooks/useAdminSettings.ts`
- Modify: `frontend/src/components/admin/AdminLayout.tsx`
- Create: `frontend/src/routes/admin/AdminContact.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/settings`, `PATCH /api/admin/settings` (Task 1) — both now carry `contact`.
- Produces: `AdminContact` type (mirrors the backend schema) exported from `useAdminSettings.ts`, reused by Task 3's TenantContext types by shape (not import — customer side has its own `TenantContact` type, same shape, different source of truth per the existing `AdminBranding`/`TenantBranding` split).

- [ ] **Step 1: Widen the settings types and hook**

In `frontend/src/hooks/useAdminSettings.ts`, add after `AdminBranding`:

```ts
export interface AdminContact {
  phone: string;
  email: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hours: string;
  aboutUs: string;
  socials: {
    instagram: string;
    facebook: string;
    x: string;
  };
}
```

Update `AdminSettings`:

```ts
export interface AdminSettings {
  name: string;
  slug: string;
  status: "active" | "suspended";
  branding: AdminBranding;
  contact: AdminContact;
  program: AdminProgram;
  menuEnabled: boolean;
}
```

Update `AdminSettingsPatch`:

```ts
export interface AdminSettingsPatch {
  name?: string;
  branding?: Partial<AdminBranding>;
  contact?: Partial<AdminContact>;
  program?: Partial<AdminProgram>;
  menuEnabled?: boolean;
}
```

- [ ] **Step 2: Add the nav entry**

In `frontend/src/components/admin/AdminLayout.tsx`, add `Phone` to the lucide-react import:

```tsx
import {
  LayoutDashboard,
  QrCode,
  TicketCheck,
  Users,
  Stamp,
  Palette,
  UtensilsCrossed,
  FileSpreadsheet,
  Phone,
  LogOut,
} from "lucide-react";
```

Add the entry to `NAV`, after `branding`:

```tsx
const NAV = [
  { to: "", end: true, label: "Overview", Icon: LayoutDashboard },
  { to: "generate", label: "Generate stamp", Icon: QrCode },
  { to: "redeem", label: "Redeem voucher", Icon: TicketCheck },
  { to: "customers", label: "Customers", Icon: Users },
  { to: "program", label: "Stamp program", Icon: Stamp },
  { to: "branding", label: "Branding", Icon: Palette },
  { to: "contact", label: "Contact", Icon: Phone },
  { to: "menu", label: "Menu", Icon: UtensilsCrossed },
  { to: "reports/summary", label: "Summary report", Icon: FileSpreadsheet },
  { to: "reports/customers", label: "Customer report", Icon: FileSpreadsheet },
];
```

- [ ] **Step 3: Create the admin Contact screen**

Create `frontend/src/routes/admin/AdminContact.tsx`:

```tsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Facebook, Instagram, Twitter } from "lucide-react";
import {
  useAdminSettings,
  useUpdateAdminSettings,
  type AdminContact as AdminContactData,
} from "../../hooks/useAdminSettings";

const EMPTY_CONTACT: AdminContactData = {
  phone: "",
  email: "",
  address: "",
  latitude: null,
  longitude: null,
  hours: "",
  aboutUs: "",
  socials: { instagram: "", facebook: "", x: "" },
};

function osmEmbedUrl(lat: number, lon: number): string {
  const delta = 0.01;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lon}`;
}

export default function AdminContact() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateAdminSettings();
  const [contact, setContact] = useState<AdminContactData | null>(null);

  useEffect(() => {
    if (settings && !contact) {
      setContact(settings.contact ?? EMPTY_CONTACT);
    }
  }, [settings, contact]);

  if (isLoading || !contact) {
    return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  }

  const set = <K extends keyof AdminContactData>(k: K, v: AdminContactData[K]) =>
    setContact((c) => (c ? { ...c, [k]: v } : c));

  const setSocial = (k: keyof AdminContactData["socials"], v: string) =>
    setContact((c) => (c ? { ...c, socials: { ...c.socials, [k]: v } } : c));

  const save = async () => {
    try {
      await update.mutateAsync({ contact });
      toast.success("Contact info saved");
    } catch (err) {
      toast.error((err as Error).message || "Failed to save.");
    }
  };

  const hasLatLong = contact.latitude !== null && contact.longitude !== null;

  return (
    <div>
      <h1 className="font-display text-[28px] font-extrabold text-[var(--ink)]">Contact</h1>
      <p className="mb-6 text-[var(--muted)]">
        Shown to your customers on their dashboard. Changes preview live on the right.
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <Field label="Phone">
            <input
              value={contact.phone}
              onChange={(e) => set("phone", e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Email">
            <input
              value={contact.email}
              onChange={(e) => set("email", e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Address">
            <input
              value={contact.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude">
              <input
                type="number"
                step="any"
                value={contact.latitude ?? ""}
                onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="27.7172"
                className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
              />
            </Field>
            <Field label="Longitude">
              <input
                type="number"
                step="any"
                value={contact.longitude ?? ""}
                onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="85.3240"
                className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Hours">
            <textarea
              value={contact.hours}
              onChange={(e) => set("hours", e.target.value)}
              rows={2}
              placeholder="Mon–Sat: 8am–8pm, Sun: Closed"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="About us">
            <textarea
              value={contact.aboutUs}
              onChange={(e) => set("aboutUs", e.target.value)}
              rows={3}
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <Field label="Instagram URL">
            <input
              value={contact.socials.instagram}
              onChange={(e) => setSocial("instagram", e.target.value)}
              placeholder="https://instagram.com/…"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="Facebook URL">
            <input
              value={contact.socials.facebook}
              onChange={(e) => setSocial("facebook", e.target.value)}
              placeholder="https://facebook.com/…"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>
          <Field label="X (Twitter) URL">
            <input
              value={contact.socials.x}
              onChange={(e) => setSocial("x", e.target.value)}
              placeholder="https://x.com/…"
              className="w-full rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--brand)] focus:outline-none"
            />
          </Field>

          <button
            onClick={save}
            disabled={update.isPending}
            className="rounded-[13px] py-3.5 text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {update.isPending ? "Saving…" : "Save contact info"}
          </button>
        </div>

        {/* Live preview */}
        <div className="sticky top-5">
          <div className="mb-2.5 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--soft)]">
            Live preview
          </div>
          <div className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-white p-4 shadow-lg">
            {hasLatLong && (
              <iframe
                title="Location preview"
                src={osmEmbedUrl(contact.latitude as number, contact.longitude as number)}
                className="mb-3 h-[160px] w-full rounded-[14px] border-0"
              />
            )}
            {contact.address && <div className="mb-1 text-sm font-semibold text-[var(--ink)]">{contact.address}</div>}
            {contact.phone && <div className="mb-1 text-sm text-[var(--muted)]">{contact.phone}</div>}
            {contact.email && <div className="mb-1 text-sm text-[var(--muted)]">{contact.email}</div>}
            {contact.hours && <div className="mb-1 whitespace-pre-line text-sm text-[var(--muted)]">{contact.hours}</div>}
            {contact.aboutUs && <div className="mb-3 text-sm text-[var(--muted)]">{contact.aboutUs}</div>}
            <div className="flex gap-2">
              {contact.socials.instagram && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]">
                  <Instagram className="h-4 w-4" />
                </span>
              )}
              {contact.socials.facebook && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]">
                  <Facebook className="h-4 w-4" />
                </span>
              )}
              {contact.socials.x && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--ink)]">
                  <Twitter className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold">{label}</label>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Wire the route**

In `frontend/src/App.tsx`, add the lazy import alongside `Branding`:

```tsx
const AdminContact = lazy(() => import('./routes/admin/AdminContact'));
```

Add the route inside the admin `<Route>` block, after `branding`:

```tsx
<Route path="contact" element={<AdminContact />} />
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useAdminSettings.ts frontend/src/components/admin/AdminLayout.tsx frontend/src/routes/admin/AdminContact.tsx frontend/src/App.tsx
git commit -m "feat(admin-fe): contact/social/maps config screen"
```

---

### Task 3: Frontend — customer dashboard contact section

**Files:**
- Modify: `frontend/src/context/TenantContext.tsx`
- Modify: `frontend/src/routes/CustomerDashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/tenant` (Task 1) — now carries `tenant.contact`.
- Consumes: `useTenant()` from `TenantContext.tsx` (already used by `CustomerDashboard.tsx`).

- [ ] **Step 1: Add the contact type to TenantContext**

In `frontend/src/context/TenantContext.tsx`, add after `TenantBranding`:

```ts
export interface TenantContact {
  phone: string;
  email: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hours: string;
  aboutUs: string;
  socials: {
    instagram: string;
    facebook: string;
    x: string;
  };
}
```

Update `Tenant`:

```ts
export interface Tenant {
  slug: string;
  name: string;
  branding: TenantBranding;
  contact: TenantContact;
  program: TenantProgram;
  menuEnabled: boolean;
}
```

- [ ] **Step 2: Add the contact section to CustomerDashboard**

In `frontend/src/routes/CustomerDashboard.tsx`, add to the imports:

```tsx
import { Coffee, MailWarning, MapPin, Phone as PhoneIcon, Mail, Clock, Instagram, Facebook, Twitter } from "lucide-react";
```

Add this helper function above the component (after the imports):

```tsx
function osmEmbedUrl(lat: number, lon: number): string {
  const delta = 0.01;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lon}`;
}
```

Inside the component, after the existing `tenant`/`program` reads, add:

```tsx
  const contact = tenant?.contact;
  const hasLatLong = contact?.latitude != null && contact?.longitude != null;
  const hasContact = Boolean(
    contact &&
      (contact.phone ||
        contact.email ||
        contact.address ||
        contact.hours ||
        contact.aboutUs ||
        hasLatLong ||
        contact.socials.instagram ||
        contact.socials.facebook ||
        contact.socials.x)
  );
```

Add the new section in the JSX, immediately after the closing `</div>` of the "Away hint" block and before the final helper `<p>`:

```tsx
      {hasContact && contact && (
        <div className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
            Visit us
          </div>

          {hasLatLong && (
            <iframe
              title="Location"
              src={osmEmbedUrl(contact.latitude as number, contact.longitude as number)}
              className="mb-3 h-[160px] w-full rounded-[14px] border-0"
            />
          )}

          {contact.address && (
            <div className="mb-2 flex items-start gap-2 text-sm text-[var(--ink)]">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              <a
                href={
                  hasLatLong
                    ? `https://www.openstreetmap.org/?mlat=${contact.latitude}&mlon=${contact.longitude}`
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
              >
                {contact.address}
              </a>
            </div>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="mb-2 flex items-center gap-2 text-sm text-[var(--ink)]">
              <PhoneIcon className="h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="mb-2 flex items-center gap-2 text-sm text-[var(--ink)]">
              <Mail className="h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              {contact.email}
            </a>
          )}
          {contact.hours && (
            <div className="mb-2 flex items-start gap-2 whitespace-pre-line text-sm text-[var(--ink)]">
              <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              {contact.hours}
            </div>
          )}
          {contact.aboutUs && (
            <p className="mb-3 text-sm text-[var(--muted)]">{contact.aboutUs}</p>
          )}

          {(contact.socials.instagram || contact.socials.facebook || contact.socials.x) && (
            <div className="flex gap-2">
              {contact.socials.instagram && (
                <a
                  href={contact.socials.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--brand)]"
                  aria-label="Instagram"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {contact.socials.facebook && (
                <a
                  href={contact.socials.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--brand)]"
                  aria-label="Facebook"
                >
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {contact.socials.x && (
                <a
                  href={contact.socials.x}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--brand)]"
                  aria-label="X (Twitter)"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/TenantContext.tsx frontend/src/routes/CustomerDashboard.tsx
git commit -m "feat(customer-fe): contact-us section on dashboard with map embed"
```

---

### Task 4: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suite green**

Run: `cd backend && npm test`
Expected: all nine suites PASS, exit 0.

- [ ] **Step 2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end browser walkthrough**

With `npm run dev` running (or the two `preview_start` dev servers), on tenant `coffesarowar`:
- Admin: open the new "Contact" nav entry, fill in phone/email/address/lat-long/hours/about-us/all three socials, confirm the live preview updates including the OSM iframe, save, reload the page and confirm the saved values are still there (proves the `GET` round-trip).
- Customer: log in as the seeded customer, confirm the new "Visit us" section appears on the dashboard below the reward card/away-hint, with the map embed matching the saved coordinates, a tappable `tel:` phone link, a tappable `mailto:` email link, hours/about-us text rendered, and all three social icons linking out correctly.
- Confirm a tenant with no contact info configured (e.g. a freshly onboarded second tenant) shows no "Visit us" section at all on its customer dashboard.

- [ ] **Step 4: Commit any final fixes, then finish**

```bash
git add -A
git commit -m "chore(contact): verification pass fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** all 8 field groups (phone, email, address, lat/long, hours, about-us, 3 socials) present in the schema (Task 1 Step 1), admin form (Task 2 Step 3), and customer display (Task 3 Step 2). OSM iframe embed on both the admin live preview and the customer section (decision 2). Lat/long-only input, no geocoding (decision 3). Hours as one free-text field (decision 4). Fixed 3-social-field set (decision 5). Flat nav entry after Branding (decision 6). Admin screen mirrors `Branding.tsx`'s form+live-preview layout (decision 7). Customer section placed below the away-hint block on `CustomerDashboard.tsx`, not a bottom-nav tab (decision 8), and only renders when `hasContact` is true. No gaps against the spec.
- **No new endpoints, no service layer:** Task 1 only touches `tenantController.js`'s three existing functions, exactly matching the spec's "pure data pass-through" requirement and the existing `branding` precedent — avoids introducing an unnecessary service file for what is 100% CRUD pass-through, consistent with how `branding`/`program` already work with no service layer of their own.
- **Type consistency:** `AdminContact` (Task 2) and `TenantContact` (Task 3) are structurally identical (mirroring the existing `AdminBranding`/`TenantBranding` split — admin and customer sides each have their own type over the same wire shape). `osmEmbedUrl` is duplicated once (admin preview, Task 2) and once (customer section, Task 3) rather than shared — matches this codebase's convention of no cross-admin/customer shared component code, and the function is 4 lines, well under the threshold where duplication would violate DRY meaningfully.
- **Test-design note:** Task 1's test asserts exact field values (`===`) rather than truthy checks, catching both persistence bugs and the merge-shape bug (nested `socials` getting dropped) that a shallower assertion would miss.

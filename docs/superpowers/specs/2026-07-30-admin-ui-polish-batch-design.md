# Admin UI Polish Batch — Design

**Date:** 2026-07-30
**Status:** Approved, ready for planning
**Scope:** Roadmap sub-projects 1–4 — create-with-preview modals, image storage, points settings restyle, kokonutui component swaps
**Companion doc:** `2026-07-30-samparka-parity-roadmap-design.md` — the other five sub-projects this batch deliberately excludes

## Why this batch

The Samparka reference screenshots the user supplied describe eight independent
subsystems. This batch takes the three that share one property: they are
frontend-shaped, they change no loyalty semantics, and every later feature
lands on top of them. Shipping them first means the leaderboard, the role
system and the customer-info toggles get built against settled primitives
instead of retrofitting them.

One backend piece rides along, because the file-upload component cannot be
built honestly without it: image storage.

## The four workstreams

### A. Shared primitives

Five components. Four of them are ports of kokonutui pieces; the fifth is a
restyle of a component we already have.

| Component | File | Consumers |
|---|---|---|
| `Switch` | `frontend/src/components/ui/switch.tsx` | Points triggers; the customer-info toggles in a later batch — **shadcn/Radix, not kokonutui** (see below) |
| `Loader` | `frontend/src/components/ui/loader.tsx` | `AdminGuard`, `AdminVerifyEmail`, `VerifyEmail`, `GlobalVerifyEmail`, `GlobalCustomerLayout` |
| `FileDrop` | `frontend/src/components/shared/FileDrop.tsx` | Reward/Event modals, `Branding` logo + banner, `MenuManagement` xlsx import |
| `DynamicText` | `frontend/src/components/shared/DynamicText.tsx` | `CustomerDashboard` greeting |
| `AccountMenu` (restyle) | `frontend/src/components/shared/AccountMenu.tsx` | Already shared — `AdminLayout`, `PlatformLayout`, `CompanyLayout` all get it from one edit |

**Porting rules.** kokonutui ships Next-flavoured components. Each port must:

1. Drop `"use client"` and any `next/link` / `next/image` import.
2. Replace raw Tailwind greys (`text-gray-500`, `bg-neutral-900`, …) with the
   design tokens — `--ink`, `--muted`, `--soft`, `--line`, `--surface`,
   `--surface-2`. A port that keeps its own palette reads as foreign against
   the editorial-ledger system, which is the whole reason we have tokens.
3. Route animation config through `useMotion()` rather than hand-rolling a
   spring, per the existing motion rule. Reduced motion must be respected.
4. Use radii from the scale: 8 field / 12 button / 18 card / pill.

No new dependencies are required. `motion`, `clsx`, `tailwind-merge` and
`class-variance-authority` are already in `frontend/package.json`.

**`Switch` does not come from kokonutui.** Their `switch-button` is not a
generic toggle at all — it is a theme button hardwired to `next-themes` that
only flips light/dark, and with dark mode out of scope it has no job here. The
settings rows need a real two-state control, so `Switch` is the standard
shadcn/Radix `switch` (`@radix-ui/react-switch`), which is the only new
dependency this batch adds and matches the existing Radix kit in
`components/ui/`.

The other four kokonutui pieces need **no** new dependencies — their registry
manifests ask only for `motion` and `lucide-react`, both already installed.
`profile-dropdown` additionally wants the `dropdown-menu` primitive, which is
already in `components/ui/` and currently unused; wiring it up is what retires
one of the six pieces of dead scaffold rather than adding a seventh.

**`FileDrop` has two modes.** `mode="image"` resizes client-side, encodes
WebP, uploads, and yields an image id. `mode="file"` passes the raw `File`
through to its caller untouched — the xlsx menu import must stay a real
multipart upload to the existing preview/confirm endpoints, and must not be
routed through the image pipeline.

**Six `components/ui/` primitives are currently unused dead scaffold**
(`dropdown-menu`, `select`, `separator`, `table`, `tabs`, `tooltip`). The
`AccountMenu` restyle should either wire up `dropdown-menu` properly or leave
it alone — it must not add a seventh unused primitive.

### B. Image storage

#### The problem

`Branding.tsx` currently calls `resizeImageToBase64` and writes the resulting
data URI straight into `Organization.branding.logoUrl` / `bannerUrl`. Storage
size is the smaller half of the cost. The larger half: `resolveTenant` fetches
the Organization document on **every** public request — every tenant lookup,
every menu load, every claim-page hit — so the base64 logo and banner ride
along on all of them. Adding reward and event images to the same pattern
multiplies a problem that already exists.

#### The model

**This is not a new pattern — it is `CustomerAvatar` applied to a second case.**
That model already solves exactly this problem (binary out of the hot document,
served by one endpoint) and its header comment gives the same reasoning. The
new model follows its conventions rather than inventing parallel ones.

New `backend/models/Image.js`:

```
{
  _id,
  organizationId,   // required — scoped like every other loyalty record
  ownerType,        // "branding_logo" | "branding_banner" | "reward" | "event"
  ownerId,          // null until a save claims it; see orphan cleanup
  mimeType,         // "image/webp" | "image/jpeg" | "image/png"
  dataBase64,       // String, NOT Buffer
  byteSize,
  createdAt
}
```

`organizationId` is required and non-null, per the multi-tenant invariant: any
new collection that carries tenant data carries the scope, and every query
filters on it.

**`dataBase64` is a string, not a Buffer**, matching `CustomerAvatar` — the
in-memory mock DB round-trips plain JSON values, and a string needs no special
handling from it. The ~33% base64 overhead is charged against an image the
client has already resized and WebP-encoded, so rows stay small.

#### The service

`backend/services/imageService.js`:

- `createImage({ organizationId, ownerType, buffer })` — enforces a byte
  ceiling (**512 KB**; a 800px WebP banner lands far under it, so anything
  above is a client bug or an attack) and **decides the type from the bytes**.
- `getImage(id)` — unscoped by necessity; see the access note below.
- `claimImage({ id, organizationId, ownerId })` — stamps the owner on save.
- `deleteImage({ id, organizationId })` — **scoped**. An outlet admin can only
  delete their own outlet's images.

**The stored type is sniffed from the bytes, never taken from the multipart
part's declared Content-Type** — that header is written by the uploader and
proves nothing, and the served response echoes the type back, so trusting the
label would let anyone store arbitrary content and have it handed back under a
type of their choosing. `customerAccountService.sniffImageType` already
implements exactly this check against a closed list of PNG / JPEG / WebP.
**SVG is absent from that list and must stay absent: it is a document, not an
image, and it executes script in the origin that serves it.**

Rather than copy it, `sniffImageType` moves to `backend/utils/imageBytes.js`
and both services import it. Two divergent copies of a security check is the
failure mode worth spending one small refactor to avoid.

Mock-DB constraints apply: no `findById` (use `findOne({ _id })`), no
`updateMany`, no aggregation, top-level equality / `$or` / `$lte` / `$gte`
only. `deleteOne` and `deleteMany` **are** implemented by the mock
(`utils/mockMongoose.js`), so the sweep below can use `deleteMany`.

#### The endpoints

- `POST /api/admin/images` — `isBusinessAdmin`. Multipart or a base64 JSON
  body. Returns `{ id, url }`. `organizationId` comes from the JWT, never the
  request body.
- `GET /api/images/:id` — **public**, mounted alongside the other public route
  groups. Mirrors `getAvatarController` exactly: a `/^[a-f\d]{24}$/i` shape
  check before the lookup (a malformed id reaches real mongoose as a CastError
  and surfaces as a 500, which this endpoint would hit constantly from stale
  URLs), then `Cache-Control: public, max-age=31536000, immutable`,
  `X-Content-Type-Options: nosniff`, and the sniffed `Content-Type`.

`immutable` is safe without a version parameter here because ids are never
reused — a replaced image is a new row with a new id, and the document points
at the new one. This is why `Image` rows are never updated in place.

**Why the read endpoint is public.** An `<img>` tag carries no Authorization
header. Every image in this scheme is already public-facing content — outlet
logos, banners, reward photos, event photos — all of which are served today to
unauthenticated visitors of the public tenant page. The id is therefore a
bearer token for content that has no secrecy requirement. This is a deliberate
exception and must not be generalised: customer avatars stay on the existing
`CustomerAvatar` model and do not move into `Image`.

#### Reads and back-compat

Documents gain an `imageId` string field alongside the existing
`imageUrl` / `logoUrl` / `bannerUrl`. Resolution order at read time:

1. `imageId` set → emit `/api/images/<id>`
2. otherwise → emit the stored value unchanged (an external URL, or an
   existing base64 data URI)

Nothing breaks and no migration is forced. A one-shot script
(`backend/scripts/migrate-branding-images.js`) moves existing branding base64
into `Image` rows for outlets that have them; it is safe to run more than once
and skips any document that already has an `imageId`.

#### Orphan cleanup

This is the part that decides whether the change is an optimisation or a leak.
Two cases, and they need different mechanisms:

**Claimed images.** An `Image` is uploaded before the form that owns it is
saved, so it starts with `ownerId: null`. Saving the reward / event / branding
document stamps `ownerId` onto the row. From then on, replacing the image or
deleting the owner deletes the old row in the same service call. Without this,
every re-upload strands a row forever and the new scheme accumulates faster
than base64 did.

**Abandoned uploads.** An admin who uploads an image and then cancels the modal
leaves a row with `ownerId: null` and no owner that will ever claim it. These
are swept opportunistically inside `createImage`:
`deleteMany({ organizationId, ownerId: null, createdAt: { $lte: <24h ago> } })`.
Both operators are mock-DB safe (top-level equality and `$lte`), and the mock
implements `deleteMany`. **No cron job exists in this codebase and none is
being added** — the sweep piggybacks on a request that is already writing, and
is scoped to the uploading outlet so it can never touch another tenant's rows.

#### Client encoding

`resizeImageToBase64` grows a sibling that returns a `Blob`:
canvas `toBlob("image/webp", quality)`, falling back to `"image/jpeg"` when the
WebP encode returns `null`. Target dimensions: logo 256px square, banner 800px
wide, reward/event 800px wide.

### C. Create-with-preview modals

`frontend/src/components/shared/CreatePreviewModal.tsx` is a layout shell and
nothing else: `Dialog`, title, a form slot, a preview slot, a footer with
Cancel and a primary save. It holds no field state and knows nothing about
rewards, campaigns or events.

Layout: form left, preview right on desktop. On mobile the preview stacks
**above** the form, so it stays visible while the admin types rather than
sitting below the fold.

Three consumers, each owning its own fields and preview body:

| Modal | Preview shows |
|---|---|
| `RewardFormModal` | The customer catalog card — image, name, points price, description, Redeem button |
| `CampaignFormModal` | The campaign banner, a live math line, and the resolved active window in `Asia/Kathmandu` |
| `EventFormModal` | The upcoming-event card — image, title, date, time, location, description |

All three replace the current inline expand-in-place forms on `AdminRewards`,
`AdminCampaigns` and `AdminEvents`. Editing opens the same modal seeded from
the row, so create and edit stop being two different UIs.

**The campaign preview is an estimate and says so.** It computes locally from
the form values and the resolved `earnPercent` from `useAdminSettings`. The
real multiplier resolves at claim time in `campaignService`, not at
QR-generation time and not here — a campaign can start between the preview and
the claim, and `CAMPAIGN_STACKING = "max"` means an overlapping campaign can
change the answer. The preview must carry a line saying the final value is
computed at claim time.

**Extract the customer cards first.** There is currently no shared reward-card
or event-card component; the customer-facing versions are inlined separately in
`RedeemLanding.tsx`, `ScannerModal.tsx` and `CustomerDashboard.tsx`. A preview
that reimplements the card is a preview that lies the first time the real card
changes. So:

- `frontend/src/components/customer/RewardCard.tsx`
- `frontend/src/components/customer/EventCard.tsx`

are extracted from the existing inline markup, the customer surfaces are
switched to render them, and the previews render the same components. This is
the only way the preview can be trusted, and it removes duplicated markup that
already exists.

### D. Points program restyle

New `SettingRow` component: bold label plus muted description on the left,
control hard right, hairline divider between rows — the reference pattern.
Applied to `PointsProgram.tsx`:

- The birthday trigger's raw `<input type="checkbox">` becomes a `Switch`.
- Milestone and inactivity triggers stop using "clear the box to turn it off".
  Each gets a `Switch` plus a number field; switching off writes `null`. On and
  off become explicit states rather than a side effect of an empty input.
- Inherit / Override keeps its `SegmentedControl`. It is three-state — inherit,
  override, and a real configured `0` — which a two-state toggle cannot
  express. That `0` is a legitimate value (`pointsExpiryDays: 0` means never
  expire) is exactly why this must not become a toggle.

**No program model changes.** Stampd keeps `earnPercent`. The reference's
Conversion Rate / Point Value / Round Points fields are deliberately not
adopted: they are a second, parallel earn model, and "Round Points"
contradicts the integer-centipoint design that exists specifically to preserve
fractional points (Rs 105 at 10% = 10.5 points = 1050 centipoints).

## Data flow

**Image upload.** `FileDrop` reads the `File` → canvas resize → WebP `Blob` →
`POST /api/admin/images` → `{ id, url }` → the owning form holds `imageId` and
renders `url` in its preview → save writes `imageId` onto the reward / event /
branding document → the old `imageId`, if any, is deleted server-side in the
same service call.

**Image read.** Any consumer renders `<img src={resolveImageUrl(doc)}>`, where
`resolveImageUrl` applies the resolution order above. The browser and
Cloudflare cache the response for a year; the id is content-addressed in
practice because a new upload mints a new id.

## Error handling

- Upload rejected (too large, wrong type) → the `FileDrop` shows the reason
  inline and keeps the previous image. It does not clear the field.
- Upload succeeds but the form is cancelled → the `Image` row keeps
  `ownerId: null` and is collected by the abandoned-upload sweep described
  above.
- `GET /api/images/:id` for a missing id → 404 with no body. The `<img>` falls
  back to the existing placeholder treatment.
- Modal save fails → the modal stays open with its values intact and toasts the
  error. Losing a filled-in form to a network blip is the failure this design
  most needs to avoid.

## Testing

**Backend — new `backend/tests/images.js`, added to the `test` chain in
`backend/package.json` or it never runs:**

- upload as outlet A's admin, fetch by id, assert bytes round-trip
- assert `Cache-Control: public, max-age=31536000, immutable` on the read
- oversize body rejected
- disallowed content type rejected
- delete removes the row
- **outlet B's admin cannot delete outlet A's image** — the cross-tenant case
- saving a reward stamps `ownerId` onto its image row
- replacing a reward's image deletes the previous `Image` row
- an unclaimed row older than 24h is swept; a claimed row of the same age is not

**Frontend:**

- `npm run lint` (`tsc --noEmit`) clean
- live verification in the preview browser for each restyled screen: the three
  modals, `PointsProgram`, `Branding`, the `AdminGuard` loader, the
  `CustomerDashboard` greeting, and `AccountMenu` in all three consoles
- `frontend/scripts/verify-tenant-color.ts` still passes (the batch does not
  touch `lib/color.ts`, but the cards being extracted render `--brand`)

## Out of scope

Leaderboard, outlet role system, PIN-based earn/redeem, customer-info
collection toggles, events in `/explore`, and dark mode. Each is specced
separately; see the roadmap doc.

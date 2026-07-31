# Landing batch: services carousel, nav restructure, Google Review QR generator

Date: 2026-07-31
Status: approved, not implemented

## Scope

This is sub-project 1 of a seven-part request. It covers only the marketing
surface:

1. The "what you get" section becomes a free-scroll carousel with real product
   screenshots.
2. The nav merges Rewards + Campaigns into **Services** and gains a **Review
   QR** item, and its anchors are made to actually land where they claim.
3. A new public `/review-qr` page generates a printable Google-review QR flyer.

Explicitly **out of scope**, each to get its own spec: sign-in/sign-up
redesign, email-link-to-OTP verification, the Clerk-style profile page, the
company-owner organisation switcher, the notification stack, and the dashboard
chart replacements. Those were decomposed out because they touch the auth
core, the consoles, and the analytics layer respectively — three independent
blast radii, none of which overlaps this one.

Nothing here touches the loyalty model, tenant resolution, or the database.

## 1. Services carousel

### What changes

`frontend/src/routes/platform/landing/SectionsFeatures.tsx` keeps its
`Eyebrow` and its word-by-word `WordReveal` statement. The
`grid sm:grid-cols-2 lg:grid-cols-3` beneath them is replaced by a horizontal
free-scroll strip of the same six blocks, each block now carrying an image.

### Free scroll, not snap

The strip is a native `overflow-x-auto` container with **no
`scroll-snap-type`**. Touch momentum comes free from the platform; desktop
gains pointer-drag via `pointerdown`/`pointermove` handlers that adjust
`scrollLeft`. Snapping is deliberately absent — "free scroll" was the
requirement, and snap points would fight the offset animation described next.

### Offset-linked animation

The motion.dev reference (`react-carousel-item-offset`) is built on the
Motion+ `<Carousel>` component, which is a **paid subscription product** and is
not in the `motion` package this repo depends on. The effect is rebuilt from
free primitives instead:

- `useScroll({ container: stripRef, axis: "x" })` yields the strip's scroll
  progress as a motion value.
- Each card derives its own offset from that progress and its index, and feeds
  a `useTransform` that:
  - translates the card's **image** counter to the strip's direction of travel,
    producing the parallax that reads as depth, and
  - eases opacity down as a card approaches either edge of the viewport.

The card frame itself does not move relative to the scroll — only its contents
do. That is what makes the effect read as offset rather than as lag.

All of it routes through the existing `useMotion()` / `useReducedMotion()`
path, per the design-system rule that no component hand-rolls a spring. Under
reduced motion the parallax and the opacity ramp are dropped entirely and the
strip remains a plain scrollable list.

### Accessibility

The strip is `role="region"` with an `aria-label`, and `tabIndex={0}` so it can
be scrolled from the keyboard. Cards are content, not controls — they get no
`role="button"` and no click handler, because nothing in them is actionable.

### Anchors removed

Each of the six blocks currently carries an `id` (`points-engine`,
`campaigns`, `rewards`, `redeem`, `insights`, `multi-outlet`) because the nav
linked into two of them. After the nav change nothing links to any of them, and
anchoring into an element inside a horizontal scroller yanks the strip sideways
on load. **All six ids are deleted.** The `key` prop stays.

## 2. Screenshots

Six images, one per block, captured from the running app against the mock DB
and the demo seed:

| block | screen captured |
|---|---|
| `points-engine` | admin Points Program settings |
| `campaigns` | admin campaign list / builder |
| `rewards` | reward catalogue |
| `redeem` | counter redeem / scan |
| `insights` | `AdminOverview` KPIs and chart |
| `multi-outlet` | company dashboard outlet list |

Stored as WebP at `frontend/public/landing/services/<block-id>.webp`, served
statically. Each `<img>` carries `loading="lazy"` and explicit `width`/`height`
so the strip does not shift as images arrive. Budget: under ~80KB each.

`data.ts`'s existing rule — copy only, no figures — is about **claims**, and it
still holds: no screenshot gets an invented overlay, growth badge, or
percentage. The seeded demo numbers visible inside a console screenshot are
product UI, not a marketing claim.

Capture requires the backend on the in-memory mock, since `backend/.env` points
at an unreachable Atlas cluster:

```bash
MONGODB_URI="" npm run dev -w backend
```

## 3. Nav restructure and anchor correctness

### New link set

`NAV_LINKS` in `landing/data.ts` becomes:

| label | target | kind |
|---|---|---|
| Services | `#services` | anchor |
| Review QR | `/review-qr` | route |
| Pricing | `#pricing` | anchor |
| FAQ | `#faq` | anchor |

`Product` is gone: the section it pointed at *is* the list of everything the
product does, so `Services` replaces it rather than sitting beside it. Rewards
and Campaigns are gone as separate items — they are two cards inside that same
section, and pointing the nav at them was the bug, not the feature.

Each entry gains a `kind: "anchor" | "route"` discriminator. `LandingNav`
renders a react-router `<Link>` for `route` entries and an `<a href>` for
`anchor` entries, in **both** the desktop list and the mobile menu.
`FOOTER_LINKS` is `NAV_LINKS`, so `LandingFooter` needs the same branch.

### Two real fixes

- The features section renames `id="product"` to `id="services"`.
- `frontend/src/index.css` gains, **scoped to `.landing-dark`**:
  - `scroll-padding-top: 96px` — today there is none, so every anchor lands
    underneath the fixed nav pill, hiding the heading the visitor clicked.
  - `scroll-behavior: smooth`, wrapped in a `prefers-reduced-motion: no-preference`
    guard.

  Scoping to `.landing-dark` keeps both properties off the consoles, which are
  light and have their own scroll containers.

## 4. `/review-qr` page

### Routing

A literal `/review-qr` route in `App.tsx`, declared **above** `/:companySlug`,
outside `TenantScope` and outside `GlobalCustomerLayout`. `"review-qr"` is
added to `RESERVED_SLUGS` in `backend/config/platform.js`, for the reason the
existing `privacy` / `terms` entries document: a literal route that matches
before `/:companySlug` makes any company registered on that slug permanently
unreachable.

The page lives at `frontend/src/routes/platform/ReviewQrGenerator.tsx`, applies
the `landing-dark` class the same way `PlatformLanding` does, sets its own
`document.title`, and reuses `LandingNav` and `LandingFooter` so the marketing
chrome is identical.

### Flow

1. Visitor types their business name.
2. Input is debounced 350ms, then `POST /api/tools/places/autocomplete`.
3. Up to five suggestions render as `{ name, address }` rows.
4. Picking one resolves the review URL and renders a live flyer preview.
5. Two downloads: **Download flyer** (composite PNG) and **Download QR only**
   — dark modules on a transparent background, for owners placing it in their
   own artwork. Transparent rather than cream so it composites onto any light
   design; the accompanying copy states it must be placed on a light
   background, for the scan-reliability reason given under *Flyer* below.

### Review URL construction

From a Place ID: `https://search.google.com/local/writereview?placeid=<id>`.

From a pasted link: encoded as given. Accepted paste forms are
`https://g.page/r/<x>/review`, `https://search.google.com/local/writereview?placeid=<id>`,
`https://maps.app.goo.gl/<x>`, and a bare Place ID (`ChIJ…`), matched in that
order. Anything else is rejected with a message naming the four accepted forms.

`maps.app.goo.gl` links are encoded verbatim rather than resolved: resolving
one needs a redirect fetch that CORS blocks in the browser, and the short link
opens the listing correctly on a phone regardless.

### Degraded path

If the endpoint answers `503 { code: "PLACES_UNCONFIGURED" }`, the search field
is replaced by the paste field described above plus a manual business-name
input for the flyer, and a line linking to Google's Place ID Finder.

This is not a rare edge: it is the **only** path in dev and in tests today,
since no key is configured, and it is what the page falls back to if the key is
ever revoked or the quota is exhausted.

### Flyer

A 1080×1350 canvas — printable at A5 and shareable as-is — composed in the
landing's dark palette:

- business name (`--font-display`)
- "Scan to review us on Google"
- five stars
- the QR code on a **cream panel**

  Dark-on-light is a scan-reliability requirement, not a stylistic one. A QR
  inverted onto the dark landing background fails on a meaningful share of
  phone cameras, so the QR does not inherit the page's colour scheme.
- a small Stampd mark and URL

`QRCodeCanvas` from the already-installed `qrcode.react` (^4.2.0) draws the
code to an offscreen canvas, which is then `drawImage`d into the composite. No
new dependency. Download is `canvas.toBlob` into an object URL on a synthetic
`<a download>`.

## 5. Backend

One new route group, following the enforced `routes/ → controllers/ →
services/` layering:

- `backend/routes/toolsRoutes.js`, mounted at `/api/tools` in `server.js`
- `backend/controllers/placesController.js`
- `backend/services/placesService.js`

Public: no `resolveTenant`, no `verifyToken`, no database access, no tenant
concepts. It is a proxy and nothing else.

### `POST /api/tools/places/autocomplete`

Request `{ input: string }`. Calls
`https://places.googleapis.com/v1/places:autocomplete` with header
`X-Goog-Api-Key: <GOOGLE_PLACES_API_KEY>` and body
`{ input, includedRegionCodes: ["np"], languageCode: "en" }`.

Responds with a **reshaped** array, max five entries:

```json
[{ "placeId": "ChIJ…", "name": "…", "address": "…" }]
```

mapped from each suggestion's `placePrediction.placeId`,
`.structuredFormat.mainText.text` and `.structuredFormat.secondaryText.text`.
Google's raw payload is never forwarded — it carries fields the page has no use
for and pins the response shape to a third party's schema.

**No Place Details call is made.** Autocomplete alone returns the place ID, the
business name and the address, which is everything the flyer needs. This halves
both the code and the per-lookup cost.

**No session token is sent.** Session tokens only reduce billing when a run of
autocomplete calls is closed by a Details call; with no Details call they save
nothing and are one more thing to get wrong.

### Abuse controls

This is an unauthenticated endpoint on a public marketing page where every
outbound call is billed at roughly $2.83 per 1,000 requests. Three controls,
all required:

- a new `placesLimiter` in `middleware/rateLimitMiddleware.js`, 30 requests per
  5 minutes per IP, applied per-route in the style the existing `authLimiter`
  and `registrationLimiter` already use — never globally
- `input` trimmed and validated to **3–120 characters**, rejected with 400
  *before* any outbound call, so a one- or two-character keystroke can never
  bill
- the client's 350ms debounce

### Configuration

`GOOGLE_PLACES_API_KEY` is **optional**. Unlike `JWT_SECRET`, a missing value
is not fatal in production — the endpoint answers `503 PLACES_UNCONFIGURED`
and the page degrades to the paste path.

## 6. Testing

New `backend/tests/places-tool.js`, in the plain `node tests/*.js` style, booted
through `tests/helpers/bootServer.js`. **It must be added to the `test` chain
in `backend/package.json`** — a suite absent from that chain never runs.

Cases:

1. No `GOOGLE_PLACES_API_KEY` → 503 with `code: "PLACES_UNCONFIGURED"`.
2. `input` of 2 characters → 400, and **zero** outbound calls made.
3. `input` over 120 characters → 400.
4. Stubbed `fetch` returning a realistic Google payload → 200 with exactly the
   reshaped `{ placeId, name, address }` array, and no extra Google fields
   leaking through.
5. Requests past the limiter threshold → 429. (`trust proxy` is off outside
   production, which is what lets a single test process trip the bucket, as
   `tests/rate-limiting.js` already relies on.)

Frontend verification: `npm run lint` for the typecheck, plus a live browser
pass confirming the strip scrolls freely and parallaxes, every nav item lands on
its own section heading rather than under the nav pill, the Review QR item
navigates to the route, and the flyer downloads.

## Risks

- **Recurring cost on a public page.** The rate limiter, the minimum input
  length and the debounce are the only things standing between this endpoint
  and an unbounded Google bill. None of the three is optional.
- **Repo weight.** Six committed WebP screenshots, ~400KB total.
- **Screenshot staleness.** They are point-in-time captures; a console redesign
  dates them silently. Accepted — the alternative is illustration, which was
  rejected as less honest.
- **Reserved slug.** Forgetting `"review-qr"` in `RESERVED_SLUGS` does not fail
  loudly; it fails the day someone registers a company on that slug.

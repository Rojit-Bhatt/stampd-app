# Landing Carousel & Review QR Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the landing page's "what you get" grid into a free-scroll carousel of real product screenshots, restructure the nav to Services / Review QR / Pricing / FAQ with working anchors, and ship a public `/review-qr` page that generates a printable Google-review QR flyer.

**Architecture:** One new unauthenticated backend proxy (`POST /api/tools/places/autocomplete`) that reshapes Google Places Autocomplete results and is guarded by input-length validation plus a dedicated rate limiter. Everything else is frontend: a scroll-linked carousel built from free `motion` primitives, a nav data model that distinguishes anchors from routes, and a client-side canvas flyer composer. No database, no tenant code, no loyalty code is touched.

**Tech Stack:** Express + `express-rate-limit` (backend); React 19 + Vite + TS + Tailwind v4, `motion`, TanStack Query, `qrcode.react` (frontend). Backend tests are plain `node tests/*.js` scripts.

**Spec:** `docs/superpowers/specs/2026-07-31-landing-carousel-review-qr-design.md`

## Global Constraints

- **Backend layering is enforced:** `routes/ → controllers/ → services/`. Controllers parse the request, call a service, format the response. All logic lives in `services/`.
- **New test suites MUST be added to the `test` chain in `backend/package.json`** or they never run.
- **Rate limiters are applied per-route, never globally.**
- **`GOOGLE_PLACES_API_KEY` already exists** and is read by `backend/controllers/reviewsController.js` for the legacy Places API. Reuse the same variable. The key must have **both** "Places API" (legacy, for reviews) and **"Places API (New)"** (for autocomplete) enabled in Google Cloud.
- **Missing `GOOGLE_PLACES_API_KEY` is NOT fatal** — unlike `JWT_SECRET`. The endpoint answers `503 PLACES_UNCONFIGURED` and the page degrades.
- **The frontend has no test runner.** Verification for frontend tasks is `npm run lint` (which is `tsc --noEmit`) plus explicit browser checks. Do not add a test framework.
- **`qrcode.react` ^4.2.0 is already a dependency.** Do not add another QR library.
- **`data.ts` carries copy only** — no figures, prices, or phone numbers. Numbers on the landing page come from an API.
- **Landing tokens are `--lp-*`** (`--lp-bg`, `--lp-panel`, `--lp-ink`, `--lp-muted`, `--lp-line`, `--lp-green`, `--lp-terra`, `--lp-cream`), defined under `.landing-dark` in `frontend/src/index.css`. They MUST NOT be promoted to `:root`.
- **Every animation is guarded by reduced motion.** The landing files use `useReducedMotion()` from `motion/react` directly; follow that local convention.
- Run backend commands from `backend/`; run `npm run lint` from the repo root.

---

### Task 1: Places autocomplete proxy

**Files:**
- Create: `backend/services/placesService.js`
- Create: `backend/controllers/placesController.js`
- Create: `backend/routes/toolsRoutes.js`
- Create: `backend/tests/places-tool.js`
- Modify: `backend/middleware/rateLimitMiddleware.js` (add `placesLimiter`, extend `module.exports`)
- Modify: `backend/server.js` (require + mount `/api/tools`)
- Modify: `backend/package.json` (add `tests/places-tool.js` to the `test` chain)

**Interfaces:**
- Consumes: `bootServer` from `backend/tests/helpers/bootServer.js`, signature `bootServer({ port, timeoutMs, env, deleteEnv }) -> Promise<{ baseUrl, stop }>`.
- Produces:
  - `placesService.autocompleteBusinesses(rawInput: string) -> Promise<Array<{placeId: string, name: string, address: string}>>`, throwing `PlacesError` with `.status` and `.code`.
  - `POST /api/tools/places/autocomplete` with body `{ input: string }`, responding `200 { success: true, results: [{placeId, name, address}] }`, `400 INVALID_INPUT`, `503 PLACES_UNCONFIGURED`, `502 PLACES_UPSTREAM`, or `429`.
  - Env var `PLACES_API_BASE_URL` (default `https://places.googleapis.com`), which the test suite overrides to point at a local stub.

- [ ] **Step 1: Write the failing test**

The suite cannot stub `fetch`, because `bootServer` spawns the server as a **separate child process**. Instead it starts a local HTTP server that impersonates Google and points the child at it via `PLACES_API_BASE_URL`.

Note on unsetting the key: use `env: { GOOGLE_PLACES_API_KEY: "" }`, **not** `deleteEnv`. `server.js` runs `dotenv.config()` inside the child, which refills any *undefined* variable from `backend/.env` on disk — a real key configured there would defeat the test. An explicit empty string is already defined, so dotenv skips it.

Create `backend/tests/places-tool.js`:

```js
/**
 * Google Places autocomplete proxy (/api/tools/places/autocomplete).
 *
 * This endpoint is unauthenticated, sits on a public marketing page, and every
 * call it forwards is billed by Google. So the things worth testing are not
 * "does it return results" but the three guards that stand between it and an
 * unbounded bill: input-length validation before any outbound call, the
 * per-IP limiter, and a clean 503 when no key is configured.
 *
 * bootServer spawns the server as a child process, so `fetch` cannot be
 * stubbed in-process. A local HTTP server impersonates Google instead, and
 * PLACES_API_BASE_URL points the child at it. That server also counts hits,
 * which is how "rejected before any outbound call" is actually asserted
 * rather than assumed.
 *
 * Run directly: `node tests/places-tool.js`
 */

const http = require("http");
const { bootServer } = require("./helpers/bootServer");

const STUB_PORT = 5111;

// A realistic Places API (New) autocomplete payload. It deliberately carries
// fields the product has no use for (`types`, `place`, `text`) so the test can
// assert they do not leak through the reshape.
const GOOGLE_FIXTURE = {
  suggestions: [
    {
      placePrediction: {
        place: "places/ChIJAAAAAAAAAAAAAAAAAAAAAA",
        placeId: "ChIJAAAAAAAAAAAAAAAAAAAAAA",
        text: { text: "Himalayan Brew, Thamel, Kathmandu" },
        structuredFormat: {
          mainText: { text: "Himalayan Brew" },
          secondaryText: { text: "Thamel, Kathmandu, Nepal" }
        },
        types: ["cafe", "food"]
      }
    },
    {
      placePrediction: {
        place: "places/ChIJBBBBBBBBBBBBBBBBBBBBBB",
        placeId: "ChIJBBBBBBBBBBBBBBBBBBBBBB",
        text: { text: "Himalayan Java, Durbar Marg" },
        structuredFormat: {
          mainText: { text: "Himalayan Java" },
          secondaryText: { text: "Durbar Marg, Kathmandu, Nepal" }
        },
        types: ["cafe"]
      }
    },
    // A query prediction, which carries no placePrediction at all. The reshape
    // must drop it rather than emitting an entry with an empty placeId.
    { queryPrediction: { text: { text: "himalayan coffee" } } }
  ]
};

function startGoogleStub() {
  const state = { hits: 0, lastBody: null, lastApiKey: null };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      state.hits++;
      state.lastApiKey = req.headers["x-goog-api-key"] || null;
      try { state.lastBody = JSON.parse(raw); } catch (_) { state.lastBody = null; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(GOOGLE_FIXTURE));
    });
  });
  return new Promise((resolve) => {
    server.listen(STUB_PORT, () => resolve({ state, stop: () => server.close() }));
  });
}

async function main() {
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };

  const stub = await startGoogleStub();

  // One server with no key configured, one with a key pointed at the stub.
  const unconfigured = await bootServer({
    port: 5045,
    env: { GOOGLE_PLACES_API_KEY: "" }
  });
  const configured = await bootServer({
    port: 5046,
    env: {
      GOOGLE_PLACES_API_KEY: "test-key",
      PLACES_API_BASE_URL: `http://localhost:${STUB_PORT}`
    }
  });

  const post = (baseUrl, input) =>
    fetch(`${baseUrl}/api/tools/places/autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input })
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  try {
    // --- No key configured -------------------------------------------------
    const noKey = await post(unconfigured.baseUrl, "himalayan brew");
    check("no key -> 503", noKey.status === 503);
    check("no key -> code PLACES_UNCONFIGURED", noKey.body?.code === "PLACES_UNCONFIGURED");

    // --- Input validation, before any outbound call ------------------------
    const hitsBeforeValidation = stub.state.hits;

    const tooShort = await post(configured.baseUrl, "hi");
    check("2-character input -> 400", tooShort.status === 400);
    check("2-character input -> code INVALID_INPUT", tooShort.body?.code === "INVALID_INPUT");

    const tooLong = await post(configured.baseUrl, "a".repeat(121));
    check("121-character input -> 400", tooLong.status === 400);

    const blank = await post(configured.baseUrl, "   ");
    check("whitespace-only input -> 400", blank.status === 400);

    check(
      "rejected input makes ZERO outbound calls",
      stub.state.hits === hitsBeforeValidation
    );

    // --- Happy path --------------------------------------------------------
    const ok = await post(configured.baseUrl, "himalayan brew");
    check("valid input -> 200", ok.status === 200);
    check("valid input forwards to Google", stub.state.hits === hitsBeforeValidation + 1);
    check("forwards the API key as a header", stub.state.lastApiKey === "test-key");
    check("biases results to Nepal", JSON.stringify(stub.state.lastBody?.includedRegionCodes) === JSON.stringify(["np"]));
    check("trims the input before forwarding", stub.state.lastBody?.input === "himalayan brew");

    const results = ok.body?.results;
    check("returns an array", Array.isArray(results));
    check("drops the query prediction", results?.length === 2);
    check("maps placeId", results?.[0]?.placeId === "ChIJAAAAAAAAAAAAAAAAAAAAAA");
    check("maps mainText to name", results?.[0]?.name === "Himalayan Brew");
    check("maps secondaryText to address", results?.[0]?.address === "Thamel, Kathmandu, Nepal");
    check("entry has exactly three fields", Object.keys(results?.[0] || {}).length === 3);

    // Google's own field names must not survive the reshape — forwarding the
    // raw payload would pin this response to a third party's schema.
    const blob = JSON.stringify(ok.body);
    for (const leaked of ["structuredFormat", "placePrediction", "queryPrediction", "types", "mainText"]) {
      check(`response does not leak ${leaked}`, !blob.includes(leaked));
    }

    // --- Rate limiter ------------------------------------------------------
    // The limiter is 30 per 5 minutes per IP and counts every request that
    // reaches it, including the ones above. Firing well past the threshold
    // makes the assertion independent of how many were already spent.
    let sawTooMany = false;
    for (let i = 0; i < 40; i++) {
      const res = await post(configured.baseUrl, "himalayan brew");
      if (res.status === 429) { sawTooMany = true; break; }
    }
    check("limiter trips past its threshold", sawTooMany);

    if (failures === 0) console.log("\nAll places tool checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    unconfigured.stop();
    configured.stop();
    stub.stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node backend/tests/places-tool.js
```

Expected: FAIL. Every check fails because `/api/tools` is not mounted, so the server answers 404 on each request.

- [ ] **Step 3: Add the rate limiter**

In `backend/middleware/rateLimitMiddleware.js`, insert after the `uploadLimiter` block and before `module.exports`:

```js
// Google Places lookups from the public /review-qr tool. Unauthenticated, on a
// marketing page, and every call that gets past the guards is billed by Google
// — so this is a cost control, not just an abuse control. Its own bucket
// rather than reusing authLimiter: a visitor hunting for their shop should
// never be able to burn the budget that protects the login endpoints.
const placesLimiter = rateLimit({
  windowMs: 5 * MINUTE,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many searches. Please wait a few minutes and try again."),
});
```

Change the export line to:

```js
module.exports = { authLimiter, registrationLimiter, uploadLimiter, placesLimiter };
```

- [ ] **Step 4: Write the service**

Create `backend/services/placesService.js`:

```js
// Google Places Autocomplete, reshaped for the public /review-qr tool.
//
// Deliberately NOT paired with a Place Details call: autocomplete alone
// returns the place id, the business name and the address, which is
// everything the flyer needs. That halves both the code and the per-lookup
// bill. It is also why no session token is sent — session tokens only reduce
// billing when a run of autocomplete calls is closed by a Details call, so
// here they would save nothing and be one more thing to get wrong.
//
// The base URL is overridable so the test suite can point a child process at a
// local stub; nothing else should ever set it.

const PLACES_API_BASE_URL = () =>
  process.env.PLACES_API_BASE_URL || "https://places.googleapis.com";

const MIN_INPUT = 3;
const MAX_INPUT = 120;
const MAX_RESULTS = 5;

class PlacesError extends Error {
  constructor(message, { status, code }) {
    super(message);
    this.name = "PlacesError";
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {string} rawInput
 * @returns {Promise<Array<{placeId: string, name: string, address: string}>>}
 */
async function autocompleteBusinesses(rawInput) {
  const input = String(rawInput || "").trim();

  // Validated BEFORE the key check and before any outbound call, so a one- or
  // two-character keystroke can never bill, and so the 400 is deterministic
  // regardless of whether a key happens to be configured.
  if (input.length < MIN_INPUT || input.length > MAX_INPUT) {
    throw new PlacesError(
      `Enter between ${MIN_INPUT} and ${MAX_INPUT} characters.`,
      { status: 400, code: "INVALID_INPUT" }
    );
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new PlacesError(
      "Business search is not configured.",
      { status: 503, code: "PLACES_UNCONFIGURED" }
    );
  }

  let response;
  try {
    response = await fetch(`${PLACES_API_BASE_URL()}/v1/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      // includedRegionCodes keeps a search for "java" from returning results
      // on the other side of the planet — this product is sold in Nepal.
      body: JSON.stringify({
        input,
        includedRegionCodes: ["np"],
        languageCode: "en",
      }),
    });
  } catch (err) {
    throw new PlacesError(
      "Could not reach Google right now. Please try again.",
      { status: 502, code: "PLACES_UPSTREAM" }
    );
  }

  if (!response.ok) {
    throw new PlacesError(
      "Could not reach Google right now. Please try again.",
      { status: 502, code: "PLACES_UPSTREAM" }
    );
  }

  const data = await response.json().catch(() => ({}));

  // Reshaped, never forwarded: Google's payload carries fields the page has no
  // use for and would pin this response to a third party's schema.
  return (data.suggestions || [])
    .map((suggestion) => suggestion && suggestion.placePrediction)
    .filter(Boolean)
    .map((prediction) => ({
      placeId: prediction.placeId || "",
      name:
        (prediction.structuredFormat &&
          prediction.structuredFormat.mainText &&
          prediction.structuredFormat.mainText.text) ||
        (prediction.text && prediction.text.text) ||
        "",
      address:
        (prediction.structuredFormat &&
          prediction.structuredFormat.secondaryText &&
          prediction.structuredFormat.secondaryText.text) ||
        "",
    }))
    .filter((entry) => entry.placeId && entry.name)
    .slice(0, MAX_RESULTS);
}

module.exports = { autocompleteBusinesses, PlacesError, MIN_INPUT, MAX_INPUT };
```

- [ ] **Step 5: Write the controller**

Create `backend/controllers/placesController.js`:

```js
const { autocompleteBusinesses } = require("../services/placesService");

// Thin: parse, call the service, format. Every decision about what is valid,
// what is billed and what is returned lives in the service.
const postPlacesAutocomplete = async (req, res, next) => {
  try {
    const results = await autocompleteBusinesses(req.body && req.body.input);
    res.json({ success: true, results });
  } catch (err) {
    if (err.status && err.code) {
      return res
        .status(err.status)
        .json({ success: false, code: err.code, message: err.message });
    }
    next(err);
  }
};

module.exports = { postPlacesAutocomplete };
```

- [ ] **Step 6: Write the route and mount it**

Create `backend/routes/toolsRoutes.js`:

```js
const express = require("express");

const { postPlacesAutocomplete } = require("../controllers/placesController");
const { placesLimiter } = require("../middleware/rateLimitMiddleware");

// Public marketing-site tools. No resolveTenant, no verifyToken, no database:
// nothing here belongs to a tenant, and nothing here writes.
const router = express.Router();

router.post("/places/autocomplete", placesLimiter, postPlacesAutocomplete);

module.exports = router;
```

In `backend/server.js`, add the require alongside the other route requires:

```js
const toolsRoutes = require("./routes/toolsRoutes");
```

and mount it next to `reviewsRoutes` (around line 135):

```js
app.use("/api/tools", toolsRoutes);
```

- [ ] **Step 7: Add the suite to the test chain**

In `backend/package.json`, append to the end of the `"test"` script value:

```
 && node tests/places-tool.js
```

so it reads `… && node tests/public-landing-endpoints.js && node tests/places-tool.js`.

- [ ] **Step 8: Run the test to verify it passes**

```bash
node backend/tests/places-tool.js
```

Expected: PASS on every check, ending with `All places tool checks passed.`

- [ ] **Step 9: Confirm nothing else broke**

```bash
npm test -w backend
```

Expected: the full chain passes, ending with the new suite.

- [ ] **Step 10: Commit**

```bash
git add backend/services/placesService.js backend/controllers/placesController.js backend/routes/toolsRoutes.js backend/tests/places-tool.js backend/middleware/rateLimitMiddleware.js backend/server.js backend/package.json
git commit -m "feat: add rate-limited Google Places autocomplete proxy"
```

---

### Task 2: `/review-qr` route, reserved slug, and page shell

**Files:**
- Create: `frontend/src/routes/platform/ReviewQrGenerator.tsx`
- Modify: `frontend/src/App.tsx` (add the route above `/:companySlug`)
- Modify: `backend/config/platform.js` (add `"review-qr"` to `RESERVED_SLUGS`)
- Modify: `backend/tests/public-landing-endpoints.js` (assert the new reserved slug)

**Interfaces:**
- Consumes: `LandingNav({ contactHref: string })` and `LandingFooter()` from `frontend/src/routes/platform/landing/`; `usePlatformContact()` from `frontend/src/hooks/usePlatformContact`; `toWaNumber` from `landing/WhatsAppFloat`.
- Produces: default-exported `ReviewQrGenerator` component at route `/review-qr`, rendering a `<main>` with an element carrying `data-testid="review-qr-shell"`.

- [ ] **Step 1: Write the failing test**

In `backend/tests/public-landing-endpoints.js`, extend the reserved-slug block (currently around line 82) so it reads:

```js
    const { isReservedSlug } = require("../config/platform");
    check("privacy is a reserved slug", isReservedSlug("privacy"));
    check("terms is a reserved slug", isReservedSlug("terms"));
    // App.tsx matches /review-qr literally, before /:companySlug. A company
    // registered on that slug would be permanently unreachable.
    check("review-qr is a reserved slug", isReservedSlug("review-qr"));
    check("reserved-slug check is case-insensitive", isReservedSlug("Privacy"));
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node backend/tests/public-landing-endpoints.js
```

Expected: `FAIL review-qr is a reserved slug`, and a non-zero exit.

- [ ] **Step 3: Reserve the slug**

In `backend/config/platform.js`, change the marketing-pages entry in `RESERVED_SLUGS` (line 76) from:

```js
  "privacy", "terms"
```

to:

```js
  "privacy", "terms", "review-qr"
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node backend/tests/public-landing-endpoints.js
```

Expected: PASS on every check, ending with `All public landing endpoint checks passed.`

- [ ] **Step 5: Create the page shell**

Create `frontend/src/routes/platform/ReviewQrGenerator.tsx`:

```tsx
import { useEffect } from "react";

import { usePlatformContact } from "../../hooks/usePlatformContact";
import { LandingFooter } from "./landing/LandingFooter";
import { LandingNav } from "./landing/LandingNav";
import { toWaNumber } from "./landing/WhatsAppFloat";

// A free tool on the marketing site: paste or find your Google listing, get a
// printable flyer with the review QR on it. Public, unauthenticated, and
// deliberately useful to a shop that has never heard of Stampd.
//
// It renders inside the same `landing-dark` scope as the landing page, so the
// dark tokens and the nav/footer chrome are identical. The class is added to
// <html> for this route's lifetime only — the consoles stay light.

export default function ReviewQrGenerator() {
  const { data: contact } = usePlatformContact();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Free Google review QR generator | Stampd";
    document.documentElement.classList.add("landing-dark");

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove("landing-dark");
    };
  }, []);

  const phone = contact?.phone ? toWaNumber(contact.phone) : "";
  const contactHref = phone ? `https://wa.me/${phone}` : "/#pricing";

  return (
    <main className="min-h-screen font-sans antialiased">
      <LandingNav contactHref={contactHref} />

      <div className="relative z-10 rounded-b-[40px] bg-[var(--lp-bg)]">
        <section
          data-testid="review-qr-shell"
          className="lp-grid px-6 pt-40 pb-28 md:px-10"
        >
          <div className="mx-auto max-w-6xl">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
              FREE TOOL
            </p>
            <h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.1] text-[var(--lp-ink)] sm:text-5xl md:text-6xl">
              Get more Google reviews.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--lp-muted)]">
              Find your business, download the flyer, put it on the counter.
              Customers scan it and land straight on your review form. No
              account needed.
            </p>
          </div>
        </section>
      </div>

      <LandingFooter />
    </main>
  );
}
```

- [ ] **Step 6: Wire the route**

In `frontend/src/App.tsx`, add the import alongside the other platform route imports:

```tsx
import ReviewQrGenerator from "./routes/platform/ReviewQrGenerator";
```

and add the route immediately after the `/terms` route (line 115), keeping it above `/:companySlug`:

```tsx
          {/* Same reason as /privacy and /terms above: a literal route that
              matches before /:companySlug, so "review-qr" is reserved in
              config/platform.js. */}
          <Route path="/review-qr" element={<ReviewQrGenerator />} />
```

- [ ] **Step 7: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 8: Verify in the browser**

Start the backend against the in-memory mock (`backend/.env` points at an unreachable Atlas cluster, so the plain dev script fails):

```bash
MONGODB_URI="" npm run dev -w backend
```

Start the frontend, open `http://localhost:3000/review-qr`, and confirm: the page renders dark with the landing nav and footer, the heading reads "Get more Google reviews.", the tab title is "Free Google review QR generator | Stampd", and navigating away restores the light theme.

- [ ] **Step 9: Commit**

```bash
git add backend/config/platform.js backend/tests/public-landing-endpoints.js frontend/src/routes/platform/ReviewQrGenerator.tsx frontend/src/App.tsx
git commit -m "feat: add /review-qr route and reserve its slug"
```

---

### Task 3: Review URL resolution and place search

**Files:**
- Create: `frontend/src/lib/googleReviewUrl.ts`
- Create: `frontend/src/routes/platform/reviewqr/PlaceSearch.tsx`
- Modify: `frontend/src/routes/platform/ReviewQrGenerator.tsx` (render `PlaceSearch`, hold the selected place)

**Interfaces:**
- Consumes: `apiRequest<T>(path, options)` from `frontend/src/lib/api` — it throws an `Error` carrying `.status: number` and `.code: string` on a non-OK response. `POST /api/tools/places/autocomplete` from Task 1.
- Produces:
  - `reviewUrlForPlaceId(placeId: string): string`
  - `parsePastedReviewTarget(raw: string): string | null`
  - `ACCEPTED_PASTE_FORMS: readonly string[]`
  - `export interface SelectedPlace { name: string; address: string; reviewUrl: string }`
  - `PlaceSearch({ onSelect }: { onSelect: (place: SelectedPlace) => void })`

- [ ] **Step 1: Write the URL module**

Create `frontend/src/lib/googleReviewUrl.ts`:

```ts
// Resolving "which Google listing is this" to "a URL whose QR opens the review
// form". Two paths, because the search path depends on a billed API key that
// may not be configured, may be revoked, or may be over quota — and a tool
// that only works when Google is paid for is not much of a free tool.

/** The canonical review URL for a Place ID. */
export function reviewUrlForPlaceId(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/** Shown to the visitor when a paste is rejected. */
export const ACCEPTED_PASTE_FORMS = [
  "https://g.page/r/…/review",
  "https://search.google.com/local/writereview?placeid=…",
  "https://maps.app.goo.gl/…",
  "a Place ID like ChIJ…",
] as const;

const G_PAGE = /^https:\/\/g\.page\/r\/[A-Za-z0-9_-]+\/review\/?$/;
const WRITE_REVIEW = /^https:\/\/search\.google\.com\/local\/writereview\?placeid=[A-Za-z0-9_-]+$/;
// Short share links are encoded verbatim rather than resolved: following one
// needs a redirect fetch that CORS blocks in the browser, and the short link
// opens the listing correctly on a phone anyway.
const MAPS_SHORT = /^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+$/;
// Loosest of the four, so it is matched last — a Place ID is just an opaque
// token and would otherwise swallow anything that is not a recognised URL.
const PLACE_ID = /^[A-Za-z0-9_-]{20,}$/;

/**
 * @returns the URL to encode in the QR, or null if the paste is not one of the
 * four accepted forms.
 */
export function parsePastedReviewTarget(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (G_PAGE.test(value)) return value;
  if (WRITE_REVIEW.test(value)) return value;
  if (MAPS_SHORT.test(value)) return value;
  if (PLACE_ID.test(value)) return reviewUrlForPlaceId(value);
  return null;
}
```

- [ ] **Step 2: Write the search component**

Create `frontend/src/routes/platform/reviewqr/PlaceSearch.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../../lib/api";
import {
  ACCEPTED_PASTE_FORMS,
  parsePastedReviewTarget,
  reviewUrlForPlaceId,
} from "../../../lib/googleReviewUrl";

export interface SelectedPlace {
  name: string;
  address: string;
  reviewUrl: string;
}

interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

const MIN_QUERY = 3;
const DEBOUNCE_MS = 350;

const fieldClass =
  "w-full rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3 text-[var(--lp-ink)] placeholder:text-[var(--lp-muted)] outline-none focus:border-[var(--lp-green)]";

export function PlaceSearch({ onSelect }: { onSelect: (place: SelectedPlace) => void }) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  // Flips permanently once the backend reports it has no key. The paste path
  // is the only path in dev and in tests, so this is the common case, not an
  // edge case.
  const [pasteMode, setPasteMode] = useState(false);

  // 350ms, so a visitor typing "himalayan brew" costs one billed call rather
  // than fourteen.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isFetching, error } = useQuery<Suggestion[]>({
    queryKey: ["places-autocomplete", debounced],
    enabled: !pasteMode && debounced.length >= MIN_QUERY,
    // Repeating a search that has already been paid for should not pay again.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest<{ results: Suggestion[] }>(
        "/api/tools/places/autocomplete",
        { method: "POST", body: { input: debounced } },
      );
      return res.results;
    },
  });

  useEffect(() => {
    const code = (error as (Error & { code?: string }) | null)?.code;
    if (code === "PLACES_UNCONFIGURED") setPasteMode(true);
  }, [error]);

  if (pasteMode) return <PasteFallback onSelect={onSelect} />;

  const message = error ? (error as Error).message : null;

  return (
    <div className="max-w-xl">
      <label htmlFor="place-search" className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
        YOUR BUSINESS
      </label>
      <input
        id="place-search"
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Start typing your business name…"
        autoComplete="off"
        className={`mt-3 ${fieldClass}`}
      />

      {isFetching ? (
        <p className="mt-3 text-sm text-[var(--lp-muted)]">Searching…</p>
      ) : null}

      {message ? (
        <p className="mt-3 text-sm text-[var(--lp-muted)]">{message}</p>
      ) : null}

      {data && data.length === 0 && !isFetching ? (
        <div className="mt-3 text-sm text-[var(--lp-muted)]">
          <p>Nothing found.</p>
          <button
            type="button"
            onClick={() => setPasteMode(true)}
            className="mt-1 underline underline-offset-4 hover:text-[var(--lp-ink)]"
          >
            Paste your review link instead
          </button>
        </div>
      ) : null}

      {data && data.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {data.map((place) => (
            <li key={place.placeId}>
              <button
                type="button"
                onClick={() =>
                  onSelect({
                    name: place.name,
                    address: place.address,
                    reviewUrl: reviewUrlForPlaceId(place.placeId),
                  })
                }
                className="w-full rounded-2xl border border-[var(--lp-line)] bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-[var(--lp-green)]"
              >
                <span className="block text-[var(--lp-ink)]">{place.name}</span>
                <span className="block text-sm text-[var(--lp-muted)]">{place.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PasteFallback({ onSelect }: { onSelect: (place: SelectedPlace) => void }) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const reviewUrl = parsePastedReviewTarget(link);
    if (!reviewUrl) {
      setProblem(`That is not a Google review link. Accepted: ${ACCEPTED_PASTE_FORMS.join(", ")}.`);
      return;
    }
    if (!name.trim()) {
      setProblem("Add your business name for the flyer.");
      return;
    }
    setProblem(null);
    onSelect({ name: name.trim(), address: "", reviewUrl });
  };

  return (
    <form onSubmit={submit} className="max-w-xl">
      <p className="font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
        YOUR REVIEW LINK
      </p>

      <label htmlFor="place-name" className="mt-4 block text-sm text-[var(--lp-muted)]">
        Business name
      </label>
      <input
        id="place-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Himalayan Brew"
        className={`mt-2 ${fieldClass}`}
      />

      <label htmlFor="place-link" className="mt-5 block text-sm text-[var(--lp-muted)]">
        Google review link or Place ID
      </label>
      <input
        id="place-link"
        type="text"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://g.page/r/…/review"
        className={`mt-2 font-mono text-sm ${fieldClass}`}
      />

      <p className="mt-3 text-sm text-[var(--lp-muted)]">
        Don't have it?{" "}
        <a
          href="https://developers.google.com/maps/documentation/places/web-service/place-id"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-4 hover:text-[var(--lp-ink)]"
        >
          Find your Place ID
        </a>
        .
      </p>

      {problem ? <p className="mt-3 text-sm text-[var(--lp-ink)]">{problem}</p> : null}

      <button
        type="submit"
        className="mt-5 rounded-[74px] bg-[var(--lp-cream)] px-5 py-2.5 text-sm font-medium text-[#14201C] transition-transform duration-200 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        Make my flyer
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Render it on the page**

In `frontend/src/routes/platform/ReviewQrGenerator.tsx`, add to the imports:

```tsx
import { useState } from "react";
import { PlaceSearch, type SelectedPlace } from "./reviewqr/PlaceSearch";
```

(merge `useState` into the existing `import { useEffect } from "react";`), add the state inside the component:

```tsx
  const [place, setPlace] = useState<SelectedPlace | null>(null);
```

and insert after the closing `</p>` of the intro paragraph, still inside `<div className="mx-auto max-w-6xl">`:

```tsx
            <div className="mt-12">
              <PlaceSearch onSelect={setPlace} />
            </div>

            {place ? (
              <p className="mt-8 text-sm text-[var(--lp-muted)]">
                Selected: <span className="text-[var(--lp-ink)]">{place.name}</span>
              </p>
            ) : null}
```

- [ ] **Step 4: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Verify both paths in the browser**

With the backend running (`MONGODB_URI="" npm run dev -w backend`) and no `GOOGLE_PLACES_API_KEY` set, open `http://localhost:3000/review-qr`:

1. Type `himalayan` in the search box. The request returns 503, and the form must switch to the paste fallback.
2. Paste `ChIJuTDdFgC1pjkRhjJ4vtKcFeM`, enter a name, submit. "Selected: <name>" must appear.
3. Paste `not-a-link`, submit. The error must list all four accepted forms.
4. In devtools, confirm exactly **one** request to `/api/tools/places/autocomplete` fires per typing pause, not one per keystroke.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/googleReviewUrl.ts frontend/src/routes/platform/reviewqr/PlaceSearch.tsx frontend/src/routes/platform/ReviewQrGenerator.tsx
git commit -m "feat: add place search with paste fallback to review QR tool"
```

---

### Task 4: Flyer composition and downloads

**Files:**
- Create: `frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx`
- Modify: `frontend/src/routes/platform/ReviewQrGenerator.tsx` (render `ReviewFlyer` when a place is selected)

**Interfaces:**
- Consumes: `SelectedPlace` from `./PlaceSearch`; `QRCodeCanvas` from `qrcode.react`.
- Produces: `ReviewFlyer({ place }: { place: SelectedPlace })`, rendering a preview plus two download buttons.

- [ ] **Step 1: Write the flyer component**

Create `frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import type { SelectedPlace } from "./PlaceSearch";

// 1080x1350: prints cleanly at A5 and posts as-is to Instagram, which is where
// a Nepali shop is most likely to put it.
const W = 1080;
const H = 1350;

// The QR panel is cream even though the flyer is dark. Dark-on-light is a scan
// requirement, not a style choice — an inverted code fails on a meaningful
// share of phone cameras, so this one element does not inherit the page's
// colour scheme.
const QR_PX = 560;
const QR_PANEL = 680;

const INK = "#F3ECE2";
const BG = "#14201C";
const PANEL = "#1D2F28";
const CREAM = "#F3ECE2";
const GREEN = "#0FA968";

function drawStars(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number) {
  const gap = size * 1.5;
  const startX = cx - gap * 2;
  ctx.fillStyle = GREEN;
  for (let i = 0; i < 5; i++) {
    const x = startX + i * gap;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const radius = p % 2 === 0 ? size / 2 : size / 4.6;
      const angle = (Math.PI / 5) * p - Math.PI / 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function download(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function safeFilename(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business";
}

export function ReviewFlyer({ place }: { place: SelectedPlace }) {
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const flyerRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const compose = async () => {
      // The display fonts are web fonts; drawing before they load silently
      // falls back to a system face and the flyer ships in the wrong type.
      await document.fonts.ready;
      if (cancelled) return;

      const qrCanvas = qrWrapRef.current?.querySelector("canvas");
      const canvas = flyerRef.current;
      if (!qrCanvas || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = W;
      canvas.height = H;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);

      // Panel behind everything, so the flyer reads as one card when printed
      // and trimmed slightly off-centre.
      ctx.fillStyle = PANEL;
      roundedRect(ctx, 48, 48, W - 96, H - 96, 56);
      ctx.fill();

      ctx.textAlign = "center";

      ctx.fillStyle = GREEN;
      ctx.font = "500 26px 'IBM Plex Mono', monospace";
      ctx.fillText("REVIEW US ON GOOGLE", W / 2, 190);

      ctx.fillStyle = INK;
      ctx.font = "400 76px 'Space Grotesk', sans-serif";
      ctx.fillText(place.name, W / 2, 290);

      drawStars(ctx, W / 2, 360, 46);

      // Cream QR panel — see the note at the top of this file.
      const panelX = (W - QR_PANEL) / 2;
      const panelY = 430;
      ctx.fillStyle = CREAM;
      roundedRect(ctx, panelX, panelY, QR_PANEL, QR_PANEL, 44);
      ctx.fill();

      ctx.drawImage(
        qrCanvas,
        panelX + (QR_PANEL - QR_PX) / 2,
        panelY + (QR_PANEL - QR_PX) / 2,
        QR_PX,
        QR_PX,
      );

      ctx.fillStyle = INK;
      ctx.font = "400 46px 'Space Grotesk', sans-serif";
      ctx.fillText("Scan with your camera", W / 2, panelY + QR_PANEL + 100);

      ctx.fillStyle = "rgba(243, 236, 226, 0.62)";
      ctx.font = "400 30px Inter, sans-serif";
      ctx.fillText("It takes ten seconds. Thank you.", W / 2, panelY + QR_PANEL + 152);

      ctx.fillStyle = "rgba(243, 236, 226, 0.42)";
      ctx.font = "500 24px 'IBM Plex Mono', monospace";
      ctx.fillText("Made free with Stampd · stampd.co", W / 2, H - 110);

      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      }, "image/png");
    };

    void compose();
    return () => { cancelled = true; };
  }, [place]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const slug = safeFilename(place.name);

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* The QR is rendered off-screen at full size purely as a source for
          drawImage. bgColor is transparent so the "QR only" download drops
          onto any light artwork; the flyer supplies its own cream panel. */}
      <div ref={qrWrapRef} className="sr-only" aria-hidden="true">
        <QRCodeCanvas
          value={place.reviewUrl}
          size={QR_PX}
          bgColor="rgba(0,0,0,0)"
          fgColor="#14201C"
          level="M"
          marginSize={2}
        />
      </div>

      <canvas ref={flyerRef} className="hidden" />

      <div className="rounded-3xl border border-[var(--lp-line)] p-4">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Review flyer for ${place.name}`}
            className="mx-auto w-full max-w-sm rounded-2xl"
          />
        ) : (
          <p className="p-8 text-center text-sm text-[var(--lp-muted)]">
            Building your flyer…
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 self-start">
        <button
          type="button"
          onClick={() => flyerRef.current && download(flyerRef.current, `${slug}-review-flyer.png`)}
          className="rounded-[74px] bg-[var(--lp-cream)] px-5 py-3 text-sm font-medium text-[#14201C] transition-transform duration-200 hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          Download flyer
        </button>

        <button
          type="button"
          onClick={() => {
            const qr = qrWrapRef.current?.querySelector("canvas");
            if (qr) download(qr, `${slug}-review-qr.png`);
          }}
          className="rounded-[74px] border border-[var(--lp-line)] px-5 py-3 text-sm text-[var(--lp-ink)] transition-colors hover:border-[var(--lp-green)]"
        >
          Download QR only
        </button>

        <p className="text-sm leading-relaxed text-[var(--lp-muted)]">
          The QR-only file has a transparent background. Place it on a light
          background — a dark code on a dark surface will not scan.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the page**

In `frontend/src/routes/platform/ReviewQrGenerator.tsx`, add the import:

```tsx
import { ReviewFlyer } from "./reviewqr/ReviewFlyer";
```

and replace the placeholder "Selected: …" block added in Task 3 with:

```tsx
            {place ? <ReviewFlyer place={place} /> : null}
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify in the browser**

On `http://localhost:3000/review-qr`, submit the paste path with name `Himalayan Brew` and Place ID `ChIJuTDdFgC1pjkRhjJ4vtKcFeM`, then confirm:

1. A flyer preview appears showing the business name, five stars, and a dark QR on a cream panel.
2. **Scan the preview with a phone camera.** It must open the Google review form for that listing. This is the one check that proves the whole feature.
3. "Download flyer" saves a 1080×1350 PNG.
4. "Download QR only" saves a PNG whose background is transparent (open it over a dark surface to confirm).
5. Changing the business name and resubmitting rebuilds the preview.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/reviewqr/ReviewFlyer.tsx frontend/src/routes/platform/ReviewQrGenerator.tsx
git commit -m "feat: compose printable review QR flyer with PNG downloads"
```

---

### Task 5: Nav restructure and anchor correctness

**Files:**
- Modify: `frontend/src/routes/platform/landing/data.ts:11-17` (`NAV_LINKS`, new `NavLink` type)
- Modify: `frontend/src/routes/platform/landing/primitives.tsx` (add `NavLinkItem`)
- Modify: `frontend/src/routes/platform/landing/LandingNav.tsx:57-69, 127-139`
- Modify: `frontend/src/routes/platform/landing/LandingFooter.tsx:141-149`
- Modify: `frontend/src/routes/platform/landing/SectionsFeatures.tsx:11` (`id="product"` → `id="services"`)
- Modify: `frontend/src/index.css` (scroll padding and smooth scrolling, scoped to `.landing-dark`)

**Interfaces:**
- Consumes: nothing from earlier tasks except the `/review-qr` route created in Task 2.
- Produces: `export type NavLink = { label: string; kind: "anchor"; href: string } | { label: string; kind: "route"; to: string }` and `NavLinkItem({ link, className, onClick, children }: { link: NavLink; className?: string; onClick?: () => void; children?: ReactNode })` from `primitives.tsx`.

- [ ] **Step 1: Restructure the nav data**

In `frontend/src/routes/platform/landing/data.ts`, replace lines 11–17 with:

```ts
// Rewards and Campaigns used to be separate items pointing at two cards INSIDE
// the features section — an anchor into the middle of a grid, not a
// destination. They are folded into Services, which is the section that lists
// everything the product does. Product is gone for the same reason: it pointed
// at that same section, so keeping both would be two labels for one place.
export type NavLink =
  | { label: string; kind: "anchor"; href: string }
  | { label: string; kind: "route"; to: string };

export const NAV_LINKS: readonly NavLink[] = [
  { label: "Services", kind: "anchor", href: "#services" },
  { label: "Review QR", kind: "route", to: "/review-qr" },
  { label: "Pricing", kind: "anchor", href: "#pricing" },
  { label: "FAQ", kind: "anchor", href: "#faq" },
];
```

- [ ] **Step 2: Add the shared link renderer**

In `frontend/src/routes/platform/landing/primitives.tsx`, add to the imports at the top:

```tsx
import { Link } from "react-router-dom";

import type { NavLink } from "./data";
```

(if the file already imports `ReactNode` from `react`, reuse it; otherwise add `import type { ReactNode } from "react";`)

and append at the end of the file:

```tsx
/**
 * One nav entry, rendered as a router <Link> or a plain anchor depending on
 * its `kind`. Shared so the desktop nav, the mobile menu and the footer cannot
 * drift — a route rendered as `<a href>` would trigger a full page reload and
 * throw away the SPA.
 *
 * `children` overrides the label for call sites that decorate it (the desktop
 * nav nests a glass hover chip inside the link).
 */
export function NavLinkItem({
  link,
  className,
  onClick,
  children,
}: {
  link: NavLink;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const content = children ?? link.label;

  if (link.kind === "route") {
    return (
      <Link to={link.to} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <a href={link.href} className={className} onClick={onClick}>
      {content}
    </a>
  );
}
```

- [ ] **Step 3: Use it in the nav**

In `frontend/src/routes/platform/landing/LandingNav.tsx`, change the import on line 6 to:

```tsx
import { NAV_LINKS } from "./data";
import { NavLinkItem } from "./primitives";
```

Replace the desktop list body (lines 57–69) with:

```tsx
          <ul className="hidden flex-1 items-center justify-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <NavLinkItem
                  link={link}
                  className="group relative block px-3 py-1.5 text-sm text-[var(--lp-muted)] transition-colors duration-300 hover:text-[var(--lp-ink)]"
                >
                  {link.label}
                  {/* samparka's glass chip, fading in behind the label. */}
                  <span className="absolute inset-0 -z-10 scale-90 rounded-2xl border border-white/10 bg-white/[0.06] opacity-0 backdrop-blur-[15px] transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none" />
                </NavLinkItem>
              </li>
            ))}
          </ul>
```

Replace the mobile menu's `NAV_LINKS` block (lines 128–139) with:

```tsx
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <NavLinkItem
                  link={link}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-2xl px-3 py-2.5 text-sm text-[var(--lp-muted)] hover:bg-white/[0.06] hover:text-[var(--lp-ink)]"
                />
              </li>
            ))}
```

- [ ] **Step 4: Use it in the footer**

In `frontend/src/routes/platform/landing/LandingFooter.tsx`, add `NavLinkItem` to the imports:

```tsx
import { NavLinkItem } from "./primitives";
```

and replace the `FOOTER_LINKS` map (lines 142–148) with:

```tsx
              {FOOTER_LINKS.map((link) => (
                <li key={link.label}>
                  <NavLinkItem link={link} className={linkClass} />
                </li>
              ))}
```

- [ ] **Step 5: Rename the section anchor**

In `frontend/src/routes/platform/landing/SectionsFeatures.tsx`, change line 11 from:

```tsx
    <section id="product" className="lp-grid px-6 py-28 md:px-10">
```

to:

```tsx
    <section id="services" className="lp-grid px-6 py-28 md:px-10">
```

- [ ] **Step 6: Fix the scroll offset**

In `frontend/src/index.css`, insert immediately after the `html.landing-dark, html.landing-dark body` block (which currently ends at line 238):

```css
/* Without this every anchor lands UNDERNEATH the fixed nav pill, hiding the
   heading the visitor just clicked. 96px is the pill's height plus its top
   margin. Scoped to the landing because no console has a fixed header. */
html.landing-dark {
  scroll-padding-top: 96px;
}

@media (prefers-reduced-motion: no-preference) {
  html.landing-dark {
    scroll-behavior: smooth;
  }
}
```

- [ ] **Step 7: Typecheck**

```bash
npm run lint
```

Expected: no errors. If `data.ts`'s `FOOTER_LINKS = NAV_LINKS` export at line 158 now produces a type error at a call site, that call site is one this task should have updated — fix it rather than widening the type.

- [ ] **Step 8: Verify in the browser**

On `http://localhost:3000/`:

1. The nav reads **Services · Review QR · Pricing · FAQ** on desktop and in the mobile menu.
2. Clicking **Services**, **Pricing** and **FAQ** scrolls smoothly and leaves each section's eyebrow fully visible below the nav pill — not hidden behind it.
3. Clicking **Review QR** navigates to `/review-qr` **without a full page reload** (the network tab shows no document request).
4. The footer's Product column shows the same four links, and its Review QR entry also routes rather than reloading.
5. With `prefers-reduced-motion: reduce` set in devtools, anchors jump instantly but still land correctly.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/routes/platform/landing/data.ts frontend/src/routes/platform/landing/primitives.tsx frontend/src/routes/platform/landing/LandingNav.tsx frontend/src/routes/platform/landing/LandingFooter.tsx frontend/src/routes/platform/landing/SectionsFeatures.tsx frontend/src/index.css
git commit -m "feat: restructure landing nav to Services and Review QR"
```

---

### Task 6: Capture product screenshots

**Files:**
- Create: `frontend/public/landing/services/points-engine.webp`
- Create: `frontend/public/landing/services/campaigns.webp`
- Create: `frontend/public/landing/services/rewards.webp`
- Create: `frontend/public/landing/services/redeem.webp`
- Create: `frontend/public/landing/services/insights.webp`
- Create: `frontend/public/landing/services/multi-outlet.webp`
- Modify: `frontend/src/routes/platform/landing/data.ts` (add `imageAlt` to each block)

**Interfaces:**
- Produces: six WebP files at `/landing/services/<block-id>.webp`, each 1200×800, under ~80KB, and an `imageAlt: string` on every entry of `FEATURES.blocks`.

- [ ] **Step 1: Boot the app on the mock DB**

`backend/.env` carries a real `MONGODB_URI` pointing at an Atlas cluster that is not IP-whitelisted, so the plain dev script fails. Force the in-memory mock:

```bash
MONGODB_URI="" npm run dev -w backend
```

Then start the frontend and sign in at `http://localhost:3000/admin-login` as `durbarmarg@coffesarowar.com` / `password`.

Use `durbarmarg`, not `thamel`: the demo's live 2× campaign is on thamel, and its doubled figures would misrepresent the earn maths in a screenshot.

- [ ] **Step 2: Capture the six screens**

Set the browser viewport to 1200×800 for every capture, so the six images share one aspect ratio and the strip does not jump between cards.

| file | route | what must be visible |
|---|---|---|
| `points-engine.webp` | outlet admin → Points Program | earn percent and expiry fields |
| `campaigns.webp` | outlet admin → Campaigns | the campaign list with a multiplier |
| `rewards.webp` | outlet admin → Rewards | the reward catalogue with point prices |
| `redeem.webp` | outlet admin → Redeem | the redeem QR / catalogue picker |
| `insights.webp` | outlet admin → Overview | the KPI row and its chart |
| `multi-outlet.webp` | company console → Dashboard (sign in as `owner@coffesarowar.com` / `password`) | the list of three outlets |

Crop each to the content area — no browser chrome, no OS chrome. Add nothing: no callout arrows, no growth badges, no invented percentages. The `data.ts` copy-only rule is about claims, and a screenshot with an overlay becomes a claim.

- [ ] **Step 3: Convert and check the budget**

```bash
cd frontend/public/landing/services
for f in *.png; do cwebp -q 82 -resize 1200 0 "$f" -o "${f%.png}.webp"; done
rm -f *.png
ls -lh
```

Expected: six `.webp` files, each under ~80KB. If one is larger, drop `-q` to 75 and reconvert that file.

(If `cwebp` is unavailable, install it with `brew install webp`.)

- [ ] **Step 4: Add alt text**

In `frontend/src/routes/platform/landing/data.ts`, add an `imageAlt` field to each of the six entries in `FEATURES.blocks`. The image filename is derived from the block's existing `id`, so no path is stored:

```ts
    {
      id: "points-engine",
      kicker: "POINTS ENGINE",
      title: "Points, on your terms",
      body: "Set what a rupee earns and what a reward costs. Change it whenever you like, for one outlet or all of them.",
      imageAlt: "The points programme screen, showing the earn rate and expiry settings.",
    },
    {
      id: "campaigns",
      kicker: "CAMPAIGNS",
      title: "Reach them without a poster",
      body: "Double points on a slow Tuesday. A win-back for anyone who has not been in a month.",
      imageAlt: "The campaigns screen, showing a double-points campaign and its dates.",
    },
    {
      id: "rewards",
      kicker: "REWARDS",
      title: "You set what points buy",
      body: "A free coffee, a discount, a birthday gift.",
      imageAlt: "The reward catalogue, showing each reward and what it costs in points.",
    },
    {
      id: "redeem",
      kicker: "REDEEM",
      title: "One tap at the counter",
      body: "Scan, points come off, done.",
      imageAlt: "The counter redeem screen, showing the QR a customer scans.",
    },
    {
      id: "insights",
      kicker: "INSIGHTS",
      title: "Know your regulars by name",
      body: "Visits, repeat rate and what each reward actually costs you — on one screen.",
      imageAlt: "The outlet overview, showing visit and repeat-rate figures with a chart.",
    },
    {
      id: "multi-outlet",
      kicker: "MULTI-OUTLET",
      title: "One programme, every branch",
      body: "Give each outlet its own rules, or run the same programme across all of them.",
      imageAlt: "The company console, listing three outlets of one business.",
    },
```

- [ ] **Step 5: Confirm the files are served**

With the frontend running, open `http://localhost:3000/landing/services/points-engine.webp`. Expected: the image renders. Repeat for one more file.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/landing/services frontend/src/routes/platform/landing/data.ts
git commit -m "feat: add product screenshots for the services carousel"
```

---

### Task 7: Free-scroll services carousel

**Files:**
- Create: `frontend/src/routes/platform/landing/ServicesCarousel.tsx`
- Modify: `frontend/src/routes/platform/landing/SectionsFeatures.tsx:22-43` (replace the grid)

**Interfaces:**
- Consumes: `FEATURES.blocks` from `./data`, each entry now carrying `id`, `kicker`, `title`, `body`, `imageAlt` (Task 6).
- Produces: `ServicesCarousel()` — a self-contained horizontal strip; takes no props.

- [ ] **Step 1: Write the carousel**

The motion.dev reference (`react-carousel-item-offset`) is built on the **Motion+ `<Carousel>` component, which is a paid subscription product** and is not in this repo's `motion` dependency. The effect is rebuilt from free primitives: `useScroll` with a `target` and a `container` gives each card its own 0→1 progress as it crosses the strip, and `useTransform` turns that into the image offset and the edge fade. No index arithmetic, so it survives the responsive card widths.

Create `frontend/src/routes/platform/landing/ServicesCarousel.tsx`:

```tsx
import { useRef, type RefObject } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { FEATURES } from "./data";

type Block = (typeof FEATURES.blocks)[number];

// How far a card's image travels against the strip, in px. Enough to read as
// depth, small enough that the image never uncovers its frame.
const OFFSET = 36;

function ServiceCard({
  block,
  container,
}: {
  block: Block;
  container: RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  // 0 when the card is entering from the right, 1 when it has left to the
  // left. Measured per card against the strip, which is why nothing here
  // depends on the card's index or its width.
  const { scrollXProgress } = useScroll({
    container,
    target: ref,
    axis: "x",
    offset: ["start end", "end start"],
  });

  const x = useTransform(scrollXProgress, [0, 1], [OFFSET, -OFFSET]);
  const opacity = useTransform(scrollXProgress, [0, 0.18, 0.82, 1], [0.35, 1, 1, 0.35]);

  return (
    <motion.article
      ref={ref}
      style={reduced ? undefined : { opacity }}
      className="w-[300px] flex-shrink-0 snap-none sm:w-[380px]"
    >
      <div className="overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-panel)]">
        <motion.img
          src={`/landing/services/${block.id}.webp`}
          alt={block.imageAlt}
          width={1200}
          height={800}
          loading="lazy"
          draggable={false}
          style={reduced ? undefined : { x }}
          // Scaled slightly wider than its frame so the offset travel never
          // exposes an edge.
          className="w-[112%] max-w-none -translate-x-[6%]"
        />
      </div>

      <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-[var(--lp-green)]">
        {block.kicker}
      </p>
      <h3 className="mt-3 font-display text-xl text-[var(--lp-ink)]">{block.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">{block.body}</p>
    </motion.article>
  );
}

export function ServicesCarousel() {
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0 });

  // Mouse only. Touch already has momentum scrolling, and hijacking pointer
  // events there would replace it with something worse.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !stripRef.current) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startScroll: stripRef.current.scrollLeft,
    };
    stripRef.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || !stripRef.current) return;
    stripRef.current.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || !stripRef.current) return;
    drag.current.active = false;
    stripRef.current.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="relative mt-20">
      <div
        ref={stripRef}
        role="region"
        aria-label="What you get with Stampd"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // No scroll-snap: this is a free-scroll strip, and snap points would
        // fight the offset animation by quantising where cards come to rest.
        // `[scrollbar-width:none]` hides the bar without hiding the overflow.
        className="flex cursor-grab gap-6 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
      >
        {FEATURES.blocks.map((block) => (
          <ServiceCard key={block.id} block={block} container={stripRef} />
        ))}
        {/* Trailing spacer so the last card can clear the right fade. */}
        <div aria-hidden="true" className="w-6 flex-shrink-0" />
      </div>

      {/* Edge fades, so the strip reads as continuing past the viewport rather
          than ending. pointer-events-none keeps them out of the drag. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[var(--lp-bg)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[var(--lp-bg)] to-transparent" />
    </div>
  );
}
```

- [ ] **Step 2: Swap it into the section**

In `frontend/src/routes/platform/landing/SectionsFeatures.tsx`, replace the entire `<div className="mt-20 grid …">…</div>` block (lines 22–43) with:

```tsx
        <ServicesCarousel />
```

Then update the imports at the top of the file to:

```tsx
import { FEATURES } from "./data";
import { Eyebrow } from "./primitives";
import { ServicesCarousel } from "./ServicesCarousel";
import { WordReveal } from "./motion/WordReveal";
```

`motion` and `useReducedMotion` are no longer used in this file — remove line 1 entirely. The six per-block `id`s go with the old grid: nothing links to them after Task 5, and an anchor into an element inside a horizontal scroller yanks the strip sideways on load.

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors. An unused-import error on `motion` means step 2's import cleanup was missed.

- [ ] **Step 4: Verify in the browser**

On `http://localhost:3000/`, scroll to the Services section and confirm:

1. Six cards sit in one horizontal row, each showing its screenshot above its kicker, title and body.
2. The strip scrolls **freely** — with a trackpad, a shift-wheel, and by dragging with the mouse. It does **not** snap to card boundaries.
3. Each card's image drifts against the scroll direction, and cards fade as they approach either edge.
4. No horizontal scrollbar appears on the strip, and **the page itself never scrolls sideways**.
5. Tab to the strip and press the arrow keys — it scrolls.
6. With `prefers-reduced-motion: reduce` in devtools, the images sit still and the cards stay at full opacity, but the strip still scrolls.
7. On a 375px-wide viewport the cards are 300px and the strip still scrolls.

- [ ] **Step 5: Full verification**

```bash
npm test -w backend && npm run lint
```

Expected: the whole backend chain passes and the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/platform/landing/ServicesCarousel.tsx frontend/src/routes/platform/landing/SectionsFeatures.tsx
git commit -m "feat: replace features grid with free-scroll services carousel"
```

---

## Deployment note

The tool ships working on the paste path with no configuration. To turn on business search, the platform owner must, outside this codebase:

1. Create or reuse a Google Cloud project and enable **Places API (New)** — `reviewsController.js` uses the *legacy* Places API, so if one key serves both, **both** APIs must be enabled on it.
2. Attach billing and restrict the key to those APIs.
3. Set `GOOGLE_PLACES_API_KEY` on the Render service.

Autocomplete is billed at roughly $2.83 per 1,000 requests. The 350ms debounce, the 3-character minimum, TanStack Query's 5-minute cache, and the 30-per-5-minute limiter are the only things bounding that spend.

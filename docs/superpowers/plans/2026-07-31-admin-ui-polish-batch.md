# Admin UI Polish Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship create-with-live-preview modals for rewards/campaigns/events, move uploaded images out of hot documents into a cacheable `Image` collection, restyle the points program as toggle rows, and port four kokonutui components into the design system.

**Architecture:** The backend gains one new collection (`Image`) modelled directly on the existing `CustomerAvatar` pipeline — base64 string in its own row, sniffed content type, one public cache-immutable read endpoint. The frontend gains five shared primitives and a `CreatePreviewModal` shell whose previews render the *real* customer-facing card components, extracted from the three places they are currently inlined.

**Tech Stack:** Node/Express + mongoose (in-memory mock DB in dev/test), React 19 + Vite + TS + Tailwind v4, TanStack Query, `motion`, Radix primitives, multer, plain `node tests/*.js` suites.

**Spec:** `docs/superpowers/specs/2026-07-30-admin-ui-polish-batch-design.md`

## Global Constraints

- **Every loyalty/tenant record carries `organizationId`, and every query filters on it.** A query without it leaks across tenants.
- **Mock DB limits:** query matching supports top-level equality, `$or`, `$lte`, `$gte` **only** — anything else throws. No nested-path queries. No `findById` (use `findOne({ _id })`). No `updateMany`, no aggregation, no real transactions. `.sort()` takes a single key. `deleteOne`/`deleteMany` **are** implemented. Indexes are **not** enforced — uniqueness must be checked explicitly in the service.
- **New test suites MUST be added to the `test` chain in `backend/package.json`** or they never run.
- **`xlsx` is banned** (unpatched CVEs). Spreadsheet work uses ExcelJS.
- Points are integer centipoints; centipoints never leave the backend.
- **Image content type is decided by the bytes, never by the client's declared Content-Type.** Closed list: PNG, JPEG, WebP. **SVG must stay excluded** — it is a document that executes script in the serving origin.
- Frontend colors come from tokens (`--ink`, `--muted`, `--soft`, `--line`, `--surface`, `--surface-2`, `--primary`, `--brand`). No raw Tailwind greys in ported components.
- Radii: 8 field / 12 button / 18 card / pill. Use `var(--radius-field)`, `var(--radius-btn)`, `var(--radius-card)`.
- All animation resolves through `useMotion()` from `frontend/src/lib/motion.ts` — no component hand-rolls a spring, and reduced motion must be respected.
- `--primary` green means value and action; `--brand` means tenant identity. They never swap jobs.
- Toasts are neutral — no green/red success/error colouring.
- Run `npm run lint` (which is `tsc --noEmit`) from the repo root before each frontend commit.

---

## Task 1: Extract `sniffImageType` into a shared util

The image type check is a security control. Two copies would drift; one copy serves both the avatar pipeline and the new image pipeline.

**Files:**
- Create: `backend/utils/imageBytes.js`
- Modify: `backend/services/customerAccountService.js` (remove the local `sniffImageType`, import it instead)
- Test: `backend/tests/customer-avatar.js` (existing — must still pass unchanged)

**Interfaces:**
- Consumes: nothing
- Produces: `require("../utils/imageBytes")` → `{ sniffImageType(buffer): "image/png" | "image/jpeg" | "image/webp" | null }`

- [ ] **Step 1: Run the existing avatar suite to establish a green baseline**

```bash
node backend/tests/customer-avatar.js
```

Expected: every line `PASS …`, process exits 0. If this is already failing, stop and report — do not start refactoring on a red baseline.

- [ ] **Step 2: Create the shared util**

Create `backend/utils/imageBytes.js`:

```js
/**
 * The stored type is decided by the BYTES, never by the multipart part's
 * declared Content-Type — that header is written by the uploader and proves
 * nothing. Since a served response echoes this type back with the image,
 * trusting the label would let anyone store arbitrary content and have us
 * hand it back under a type of their choosing.
 *
 * Deliberately a closed list of three raster formats. SVG is absent and must
 * stay absent: it is a document, not an image, and it executes script in the
 * origin that serves it.
 *
 * Shared by customerAccountService (profile pictures) and imageService
 * (outlet logos, banners, reward and event photos). One copy on purpose —
 * two divergent copies of a security check is the failure worth avoiding.
 */
const sniffImageType = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  // PNG: \x89PNG\r\n\x1a\n
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // WebP: "RIFF" .... "WEBP"
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
};

module.exports = { sniffImageType };
```

- [ ] **Step 3: Point `customerAccountService` at the util**

In `backend/services/customerAccountService.js`, delete the local `sniffImageType` function (and the long comment block above it, which now lives in the util) and add to the imports at the top of the file:

```js
const { sniffImageType } = require("../utils/imageBytes");
```

Leave `MAX_AVATAR_BYTES` where it is — the avatar's 256KB ceiling is an avatar policy, not a shared one.

- [ ] **Step 4: Re-run the avatar suite**

```bash
node backend/tests/customer-avatar.js
```

Expected: identical output to Step 1 — all `PASS`, exit 0. The behaviour must not have changed.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/imageBytes.js backend/services/customerAccountService.js
git commit -m "refactor: extract sniffImageType into a shared util"
```

---

## Task 2: `Image` model and service

**Files:**
- Create: `backend/models/Image.js`
- Create: `backend/services/imageService.js`
- Test: `backend/tests/images.js` (created in Task 3, which is where the HTTP surface exists to test through)

**Interfaces:**
- Consumes: `sniffImageType` from Task 1
- Produces:
  - `MAX_IMAGE_BYTES` = `512 * 1024`
  - `createImage({ organizationId, ownerType, buffer })` → `{ id, mimeType, byteSize }`
  - `getImage(id)` → `{ mimeType, buffer, byteSize } | null`
  - `claimImage({ id, organizationId, ownerId })` → `boolean`
  - `deleteImage({ id, organizationId })` → `boolean`
  - `OWNER_TYPES` = `["branding_logo", "branding_banner", "reward", "event"]`

- [ ] **Step 1: Create the model**

Create `backend/models/Image.js`:

```js
const mongoose = require("mongoose");

// An uploaded picture — an outlet logo, a banner, a reward photo, an event
// photo — deliberately in its own collection rather than as a base64 field on
// the document that uses it.
//
// resolveTenant fetches the Organization document on EVERY public request
// (tenant lookup, menu load, claim page). A base64 logo stored on that
// document rides along on all of them. Here the bytes are only ever touched
// by the one endpoint that serves them, and that response is cached
// immutably.
//
// Stored base64 rather than as a Buffer, matching CustomerAvatar: the
// in-memory mock DB used in dev/test round-trips plain JSON values, and a
// string needs no special handling from it. The ~33% overhead is charged
// against an image the client has already resized and WebP-encoded.
//
// Rows are never updated in place. Replacing an image writes a new row and
// deletes the old one, which is what makes `immutable` caching safe without
// a version query parameter — an id always means the same bytes.
const ImageSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  ownerType: { type: String, required: true },
  // Null until the form that uploaded this image is actually saved. An
  // unclaimed row is an abandoned upload — see the sweep in imageService.
  ownerId: { type: String, default: null },
  mimeType: { type: String, required: true },
  dataBase64: { type: String, required: true },
  byteSize: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Image", ImageSchema);
```

- [ ] **Step 2: Create the service**

Create `backend/services/imageService.js`:

```js
const Image = require("../models/Image");
const { sniffImageType } = require("../utils/imageBytes");

// 512KB. A 800px WebP banner lands far under this, so anything above it is a
// client bug or an attack, not a legitimate photo.
const MAX_IMAGE_BYTES = 512 * 1024;

const OWNER_TYPES = ["branding_logo", "branding_banner", "reward", "event"];

// An upload that is never claimed by a save is an abandoned upload: the admin
// picked a file and then cancelled the modal. Swept opportunistically on the
// next upload from the same outlet rather than by a cron — there is no cron
// anywhere in this codebase and none is being added. Scoped to the uploading
// outlet, so it can never touch another tenant's rows.
const ABANDONED_MS = 24 * 60 * 60 * 1000;

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sweepAbandoned = async (organizationId) => {
  await Image.deleteMany({
    organizationId,
    ownerId: null,
    createdAt: { $lte: new Date(Date.now() - ABANDONED_MS) }
  });
};

const createImage = async ({ organizationId, ownerType, buffer }) => {
  if (!organizationId) throw createHttpError("An outlet is required.", 400);
  if (!OWNER_TYPES.includes(ownerType)) {
    throw createHttpError("Unknown image type.", 400);
  }
  if (!buffer || !buffer.length) throw createHttpError("An image file is required.", 400);
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw createHttpError("That image is too large — pick one under 512KB.", 400);
  }
  const mimeType = sniffImageType(buffer);
  if (!mimeType) {
    throw createHttpError("Images must be a WebP, JPEG, or PNG file.", 400);
  }

  await sweepAbandoned(organizationId);

  const row = await Image.create({
    organizationId,
    ownerType,
    ownerId: null,
    mimeType,
    dataBase64: buffer.toString("base64"),
    byteSize: buffer.length,
    createdAt: new Date()
  });

  return { id: row._id.toString(), mimeType, byteSize: buffer.length };
};

// Unscoped on purpose — the read endpoint is public and has no tenant
// context. See the controller for why that is safe here.
const getImage = async (id) => {
  const row = await Image.findOne({ _id: id });
  if (!row) return null;
  return {
    mimeType: row.mimeType,
    buffer: Buffer.from(row.dataBase64, "base64"),
    byteSize: row.byteSize
  };
};

// Scoped: an outlet can only claim an image it uploaded.
const claimImage = async ({ id, organizationId, ownerId }) => {
  if (!id) return false;
  const row = await Image.findOne({ _id: id, organizationId });
  if (!row) return false;
  row.ownerId = String(ownerId);
  await row.save();
  return true;
};

// Scoped: an outlet can only delete its own images. This is what stops one
// tenant's admin deleting another tenant's reward photo by guessing an id.
const deleteImage = async ({ id, organizationId }) => {
  if (!id) return false;
  const row = await Image.findOne({ _id: id, organizationId });
  if (!row) return false;
  await Image.deleteOne({ _id: row._id });
  return true;
};

module.exports = {
  MAX_IMAGE_BYTES,
  OWNER_TYPES,
  createImage,
  getImage,
  claimImage,
  deleteImage
};
```

- [ ] **Step 3: Verify the module loads and the mock DB accepts the schema**

```bash
cd backend && node -e "process.env.MONGODB_URI=''; require('./utils/mockMongoose'); const s=require('./services/imageService'); console.log(s.MAX_IMAGE_BYTES, s.OWNER_TYPES.join(','))"
```

Expected: `524288 branding_logo,branding_banner,reward,event`

- [ ] **Step 4: Commit**

```bash
git add backend/models/Image.js backend/services/imageService.js
git commit -m "feat: add Image model and service"
```

---

## Task 3: Image upload and serve endpoints

**Files:**
- Create: `backend/controllers/imageController.js`
- Create: `backend/routes/imageRoutes.js`
- Modify: `backend/routes/adminRoutes.js` (add the upload route)
- Modify: `backend/server.js` (mount `/api/images`)
- Create: `backend/tests/images.js`
- Modify: `backend/package.json` (add the suite to the `test` chain)

**Interfaces:**
- Consumes: `imageService` from Task 2
- Produces:
  - `POST /api/admin/images` (multipart field `file`, body field `ownerType`) → `201 { success: true, id, url, mimeType, byteSize }`
  - `GET /api/images/:id` → raw image bytes, or `404 { message }`
  - `url` is always `/api/images/<id>` — a root-relative path, so it works across the split frontend/backend origins once the frontend prefixes it with `VITE_API_BASE_URL`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/images.js`:

```js
/**
 * Uploaded-image suite. Self-contained: boots its own server on a dedicated
 * port against the in-memory mock DB.
 *
 * The read is intentionally unauthenticated (an <img> tag cannot send an
 * Authorization header), so what is worth asserting is the blast radius: a
 * public GET serves ONLY the image, a malformed id 404s rather than 500s, and
 * one outlet's admin can never delete or claim another outlet's row.
 *
 * Run directly: `node tests/images.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

// A real 1x1 PNG — genuinely the type it claims, so the sniff check is
// exercised against a true file rather than noise.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
// A real lossless WebP — RIFF....WEBP, a genuinely different format from the
// PNG, so "does the stored type follow the bytes" means something.
const WEBP_1X1 = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5056 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  // Multipart, so no JSON Content-Type — fetch sets the boundary itself.
  const upload = (bytes, { token, ownerType = "reward", type = "image/png", filename = "a.png" } = {}) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), filename);
    form.append("ownerType", ownerType);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}/api/admin/images`, { method: "POST", headers, body: form })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const outletA = await makeSiblingOutlet(baseUrl, { label: `imgA${Date.now()}` });
    const outletB = await makeSiblingOutlet(baseUrl, { label: `imgB${Date.now()}` });

    // --- upload + round-trip ---
    const up = await upload(PNG_1X1, { token: outletA.adminToken });
    check("upload returns 201", up.status === 201, up);
    check("upload returns an id and url", Boolean(up.body?.id) && up.body?.url === `/api/images/${up.body.id}`, up.body);
    check("type follows the bytes", up.body?.mimeType === "image/png", up.body);

    const fetched = await fetch(`${baseUrl}/api/images/${up.body.id}`);
    const fetchedBytes = Buffer.from(await fetched.arrayBuffer());
    check("public GET returns 200", fetched.status === 200);
    check("bytes round-trip exactly", fetchedBytes.equals(PNG_1X1));
    check("content type is served", fetched.headers.get("content-type") === "image/png");
    check(
      "cached immutably",
      fetched.headers.get("cache-control") === "public, max-age=31536000, immutable",
      fetched.headers.get("cache-control")
    );
    check("nosniff is set", fetched.headers.get("x-content-type-options") === "nosniff");

    // --- the declared type is ignored; the bytes decide ---
    const lying = await upload(WEBP_1X1, { token: outletA.adminToken, type: "image/png", filename: "lie.png" });
    check("a lying Content-Type does not win", lying.body?.mimeType === "image/webp", lying.body);

    // --- rejections ---
    const noAuth = await upload(PNG_1X1, {});
    check("upload requires an admin", noAuth.status === 401 || noAuth.status === 403, noAuth.status);

    const badType = await upload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), {
      token: outletA.adminToken, type: "image/svg+xml", filename: "x.svg",
    });
    check("SVG is rejected", badType.status === 400, badType);

    const tooBig = await upload(Buffer.alloc(600 * 1024, 1), { token: outletA.adminToken });
    check("oversize is rejected", tooBig.status === 400, tooBig.status);

    const badOwnerType = await upload(PNG_1X1, { token: outletA.adminToken, ownerType: "nonsense" });
    check("unknown ownerType is rejected", badOwnerType.status === 400, badOwnerType);

    const malformed = await fetch(`${baseUrl}/api/images/not-an-id`);
    check("malformed id 404s rather than 500s", malformed.status === 404, malformed.status);

    const missing = await fetch(`${baseUrl}/api/images/aaaaaaaaaaaaaaaaaaaaaaaa`);
    check("unknown id 404s", missing.status === 404, missing.status);

    // --- cross-tenant isolation ---
    const delByB = await api(`/api/admin/images/${up.body.id}`, { method: "DELETE", token: outletB.adminToken });
    check("outlet B cannot delete outlet A's image", delByB.status === 404, delByB.status);

    const stillThere = await fetch(`${baseUrl}/api/images/${up.body.id}`);
    check("outlet A's image survived B's attempt", stillThere.status === 200, stillThere.status);

    const delByA = await api(`/api/admin/images/${up.body.id}`, { method: "DELETE", token: outletA.adminToken });
    check("outlet A can delete its own image", delByA.status === 200, delByA.status);

    const gone = await fetch(`${baseUrl}/api/images/${up.body.id}`);
    check("deleted image is gone", gone.status === 404, gone.status);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll image checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node backend/tests/images.js
```

Expected: FAIL — the upload returns 404 because `/api/admin/images` does not exist yet.

- [ ] **Step 3: Write the controller**

Create `backend/controllers/imageController.js`:

```js
const multer = require("multer");
const {
  MAX_IMAGE_BYTES, createImage, getImage, deleteImage
} = require("../services/imageService");

// Same memoryStorage + error-wrapping pattern customerAccountController and
// menuController already use. The limit is multer's own first line of
// defence so an oversized body is rejected before it is ever base64'd; the
// service re-checks the real byte length rather than trusting this.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES }
});

const uploadImageFile = (req, res, next) => {
  imageUpload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.statusCode = 400;
        if (error.code === "LIMIT_FILE_SIZE") {
          error.message = "That image is too large — pick one under 512KB.";
        }
        // multer's own code would otherwise be echoed to the client as an
        // app-level error code and read like one.
        delete error.code;
      }
      return next(error);
    }
    next();
  });
};

const uploadImageController = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("An image file is required.");
      error.statusCode = 400;
      throw error;
    }
    // req.file.mimetype is deliberately NOT passed on — the service decides
    // the type from the bytes. See utils/imageBytes.js.
    const result = await createImage({
      organizationId: req.user.organizationId,
      ownerType: req.body.ownerType,
      buffer: req.file.buffer
    });
    res.status(201).json({ success: true, ...result, url: `/api/images/${result.id}` });
  } catch (error) {
    next(error);
  }
};

const deleteImageController = async (req, res, next) => {
  try {
    const removed = await deleteImage({
      id: req.params.id,
      organizationId: req.user.organizationId
    });
    if (!removed) {
      const error = new Error("Image not found.");
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Served unauthenticated on purpose: this is an <img src>, and an image tag
// cannot carry an Authorization header. Everything reachable here is already
// public-facing content — outlet logos, banners, reward and event photos, all
// of which are served today to unauthenticated visitors of the public tenant
// page. There is no endpoint that enumerates ids.
const getImageController = async (req, res, next) => {
  try {
    // Shape-checked here rather than left to the driver: a malformed id
    // reaches a real mongoose as a CastError and surfaces as a 500, which
    // this endpoint would hit constantly from stale or hand-edited URLs.
    // Regex, not mongoose.isValidObjectId — the mock DB replaces the whole
    // mongoose module in dev/test.
    if (!/^[a-f\d]{24}$/i.test(req.params.id || "")) {
      const error = new Error("Image not found.");
      error.statusCode = 404;
      throw error;
    }
    const image = await getImage(req.params.id);
    if (!image) {
      const error = new Error("Image not found.");
      error.statusCode = 404;
      throw error;
    }
    // Immutable is safe without a version parameter because rows are never
    // updated in place — replacing an image mints a new id.
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    // The stored type was sniffed from the bytes, but nosniff is what stops a
    // browser second-guessing it and rendering the response as something else
    // entirely. Belt and braces on an endpoint that serves user-supplied
    // bytes back verbatim.
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Type", image.mimeType);
    res.send(image.buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadImageFile,
  uploadImage: uploadImageController,
  deleteImage: deleteImageController,
  getImage: getImageController
};
```

- [ ] **Step 4: Create the public route file**

Create `backend/routes/imageRoutes.js`:

```js
const express = require("express");
const { getImage } = require("../controllers/imageController");

const router = express.Router();

// Public, unauthenticated, and deliberately NOT behind resolveTenant — an
// <img> tag sends neither an Authorization header nor tenant slug headers.
router.get("/:id", getImage);

module.exports = router;
```

- [ ] **Step 5: Add the admin routes**

In `backend/routes/adminRoutes.js`, add to the imports:

```js
const { uploadImageFile, uploadImage, deleteImage } = require("../controllers/imageController");
```

and register the two routes alongside the other admin routes (the router already applies `verifyToken` + `isBusinessAdmin`, so the tenant comes from the JWT, never the URL):

```js
router.post("/images", uploadImageFile, uploadImage);
router.delete("/images/:id", deleteImage);
```

- [ ] **Step 6: Mount the public route group in `server.js`**

In `backend/server.js`, alongside the other `app.use("/api/...")` mounts:

```js
app.use("/api/images", require("./routes/imageRoutes"));
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
node backend/tests/images.js
```

Expected: every line `PASS …`, then `All image checks passed.`, exit 0.

- [ ] **Step 8: Add the suite to the test chain**

In `backend/package.json`, append to the `test` script (after `node tests/tier-system.js`):

```
 && node tests/images.js
```

- [ ] **Step 9: Run the whole backend suite**

```bash
npm test -w backend
```

Expected: every suite passes, including `images.js`. If any pre-existing suite fails, stop and report which — do not proceed.

- [ ] **Step 10: Commit**

```bash
git add backend/controllers/imageController.js backend/routes/imageRoutes.js backend/routes/adminRoutes.js backend/server.js backend/tests/images.js backend/package.json
git commit -m "feat: add image upload and public cached serve endpoints"
```

---

## Task 4: Frontend image client helpers

**Files:**
- Create: `frontend/src/lib/images.ts`
- Test: none (verified through the components that consume it, Tasks 5–6)

**Interfaces:**
- Consumes: `apiUrl` and the auth token selection from `frontend/src/lib/api.ts`
- Produces:
  - `resizeImageToBlob(file, maxWidth, maxHeight, mode): Promise<Blob>` — WebP with JPEG fallback
  - `uploadImage(file, ownerType): Promise<{ id: string; url: string }>`
  - `resolveImageUrl(imageId, fallbackUrl): string` — the `imageId` → `/api/images/<id>` → legacy value resolution order
  - `type ImageOwnerType = "branding_logo" | "branding_banner" | "reward" | "event"`

- [ ] **Step 1: Create the helper module**

Create `frontend/src/lib/images.ts`:

```ts
import { apiUrl } from "./api";

export type ImageOwnerType = "branding_logo" | "branding_banner" | "reward" | "event";

const TARGETS: Record<ImageOwnerType, { w: number; h: number; mode: "square" | "aspect" }> = {
  branding_logo: { w: 256, h: 256, mode: "square" },
  branding_banner: { w: 800, h: 300, mode: "aspect" },
  reward: { w: 800, h: 800, mode: "aspect" },
  event: { w: 800, h: 800, mode: "aspect" },
};

/**
 * Resize on the client and hand back a Blob rather than a data URI.
 *
 * WebP first: typically 25-35% smaller than JPEG at the same visual quality,
 * and the backend accepts it. JPEG is the fallback for any browser whose
 * canvas returns null for the webp type — toBlob does not throw, it just
 * yields null, so the fallback has to be explicit.
 */
export async function resizeImageToBlob(
  file: File,
  maxWidth: number,
  maxHeight: number,
  mode: "square" | "aspect",
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let width = maxWidth;
  let height = maxHeight;
  if (mode === "aspect") {
    const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
    width = Math.round(bitmap.width * scale);
    height = Math.round(bitmap.height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");

  if (mode === "square") {
    // Cover-crop to the square rather than squashing it.
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, width, height);
  } else {
    ctx.drawImage(bitmap, 0, 0, width, height);
  }
  bitmap.close();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  const webp = await toBlob("image/webp", 0.85);
  if (webp) return webp;
  const jpeg = await toBlob("image/jpeg", 0.85);
  if (jpeg) return jpeg;
  throw new Error("Could not read that image.");
}

/**
 * Resize, encode and upload in one call. Returns the id to store on the
 * owning document and the URL to render immediately.
 */
export async function uploadImage(
  file: File,
  ownerType: ImageOwnerType,
): Promise<{ id: string; url: string }> {
  const target = TARGETS[ownerType];
  const blob = await resizeImageToBlob(file, target.w, target.h, target.mode);

  const form = new FormData();
  form.append("file", blob, "upload.webp");
  form.append("ownerType", ownerType);

  const token = localStorage.getItem("admin_auth_token");
  const res = await fetch(apiUrl("/api/admin/images"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Couldn't upload that image — try again.");
  return { id: body.id as string, url: body.url as string };
}

/**
 * Resolution order, matching the backend's read contract: a stored imageId
 * wins, otherwise whatever legacy value the document already carries (an
 * external URL, or a base64 data URI written before this collection existed).
 *
 * Goes through apiUrl so it resolves against the backend origin in
 * production, where the frontend is served from a different host.
 */
export function resolveImageUrl(
  imageId: string | null | undefined,
  fallbackUrl: string | null | undefined,
): string {
  if (imageId) return apiUrl(`/api/images/${imageId}`);
  return fallbackUrl || "";
}
```

- [ ] **Step 2: Confirm `apiUrl` is exported with this signature**

```bash
grep -n "export function apiUrl\|export const apiUrl" frontend/src/lib/api.ts
```

Expected: one match. If the export does not exist or takes different arguments, adapt the two call sites above to the real signature before continuing.

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/images.ts
git commit -m "feat: add client image resize, upload and URL resolution helpers"
```

---

## Task 5: `FileDrop` component

**Files:**
- Create: `frontend/src/components/shared/FileDrop.tsx`
- Test: none directly — verified in Task 6 through Branding

**Interfaces:**
- Consumes: `uploadImage`, `ImageOwnerType` from Task 4; `useMotion` from `lib/motion.ts`; `cn` from `lib/utils.ts`
- Produces: `<FileDrop />` with props
  ```ts
  {
    mode: "image" | "file";
    ownerType?: ImageOwnerType;       // required when mode="image"
    accept?: string;                   // defaults: image/* or .xlsx
    maxBytes?: number;                 // default 512*1024
    previewUrl?: string | null;
    onImageUploaded?: (r: { id: string; url: string }) => void;
    onFilePicked?: (file: File) => void;
    onRemove?: () => void;
    label?: string;
    disabled?: boolean;
  }
  ```

- [ ] **Step 1: Vendor the kokonutui source for reference**

```bash
curl -sL https://kokonutui.com/r/file-upload.json -o /tmp/ku-file-upload.json && node -e "const j=require('/tmp/ku-file-upload.json');require('fs').writeFileSync('/tmp/ku-file-upload.tsx',j.files[0].content);console.log('wrote', j.files[0].content.length, 'chars; deps:', j.dependencies.join(','))"
```

Expected: `wrote 20437 chars; deps: lucide-react,motion`

Read `/tmp/ku-file-upload.tsx`. It is MIT-licensed. Take from it: the drag-state handling, the `UploadIllustration` SVG, the `formatBytes` helper, and the `AnimatePresence` entrance/exit structure. Do **not** take: `"use client"`, its `uploadDelay` fake-progress simulation (we do a real upload), or any `text-gray-*` / `dark:*` class.

- [ ] **Step 2: Write the component**

Create `frontend/src/components/shared/FileDrop.tsx`. It wraps a hidden `<input type="file">` in a drop zone, and in `image` mode does the real upload through `uploadImage`:

```tsx
import { useCallback, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { UploadCloud, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useMotion } from "../../lib/motion";
import { uploadImage, type ImageOwnerType } from "../../lib/images";

type Status = "idle" | "dragging" | "working" | "error";

interface FileDropProps {
  mode: "image" | "file";
  ownerType?: ImageOwnerType;
  accept?: string;
  maxBytes?: number;
  previewUrl?: string | null;
  onImageUploaded?: (result: { id: string; url: string }) => void;
  onFilePicked?: (file: File) => void;
  onRemove?: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 KB";
  const units = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export function FileDrop({
  mode,
  ownerType,
  accept,
  maxBytes = 512 * 1024,
  previewUrl,
  onImageUploaded,
  onFilePicked,
  onRemove,
  label = "Click to choose, or drag a file here",
  disabled,
  className,
}: FileDropProps) {
  const m = useMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handle = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);

      if (mode === "file") {
        // Raw passthrough — the xlsx import must stay a real multipart upload
        // to its own preview/confirm endpoints, not the image pipeline.
        if (file.size > maxBytes) {
          setStatus("error");
          setError(`That file is over ${formatBytes(maxBytes)}.`);
          return;
        }
        setStatus("idle");
        onFilePicked?.(file);
        return;
      }

      if (!ownerType) throw new Error("FileDrop in image mode needs an ownerType.");
      setStatus("working");
      try {
        // Size is checked AFTER resizing, not before: a 4MB phone photo is a
        // perfectly normal input that resizes down to well under the ceiling.
        const result = await uploadImage(file, ownerType);
        setStatus("idle");
        onImageUploaded?.(result);
      } catch (err) {
        setStatus("error");
        setError((err as Error).message || "Couldn't upload that image — try again.");
      }
    },
    [mode, ownerType, maxBytes, onFilePicked, onImageUploaded],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setStatus("idle");
    const file = e.dataTransfer.files?.[0];
    if (file && !disabled) void handle(file);
  };

  const defaultAccept = mode === "image" ? "image/png,image/jpeg,image/webp" : ".xlsx";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setStatus("dragging"); }}
        onDragLeave={() => setStatus((s) => (s === "dragging" ? "idle" : s))}
        onDrop={onDrop}
        className={cn(
          "relative flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed px-4 py-5 text-center transition-colors",
          status === "dragging"
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--primary)]",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <AnimatePresence mode="wait">
          {previewUrl ? (
            <motion.div
              key="preview"
              initial={m.pick({ opacity: 0, scale: 0.96 }, false)}
              animate={{ opacity: 1, scale: 1 }}
              exit={m.pick({ opacity: 0, scale: 0.96 }, { opacity: 0 })}
              transition={m.spring("coinPop")}
              className="flex flex-col items-center gap-2"
            >
              <img
                src={previewUrl}
                alt=""
                className="max-h-[92px] rounded-[var(--radius-field)] object-cover"
              />
              <span className="text-[11px] text-[var(--muted)]">Click to replace</span>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={m.pick({ opacity: 0, y: 6 }, false)}
              animate={{ opacity: 1, y: 0 }}
              exit={m.pick({ opacity: 0, y: -6 }, { opacity: 0 })}
              transition={m.ease("standard")}
              className="flex flex-col items-center gap-2"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--primary-deep)]">
                <UploadCloud className="h-5 w-5" />
              </span>
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {status === "working" ? "Uploading…" : label}
              </span>
              {fileName && status !== "error" && (
                <span className="text-[11px] text-[var(--soft)]">{fileName}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {previewUrl && onRemove && (
          <button
            type="button"
            aria-label="Remove image"
            onClick={(e) => { e.stopPropagation(); onRemove(); setFileName(null); }}
            className="absolute right-2 top-2 rounded-full bg-[var(--surface)] p-1.5 text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept || defaultAccept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
          // Reset so picking the same file twice still fires a change.
          e.target.value = "";
        }}
      />

      {error && <p className="text-[12px] text-[var(--err)]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Confirm the motion names used above actually exist**

```bash
grep -n "coinPop\|standard" frontend/src/lib/motion.ts
```

Expected: both appear as keys in `SPRINGS` / `EASES`. If either name does not exist, substitute a real key from that file — do not invent one, and do not inline a spring config.

- [ ] **Step 4: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared/FileDrop.tsx
git commit -m "feat: add FileDrop upload component"
```

---

## Task 6: Wire `FileDrop` into Branding, and store `imageId`

**Files:**
- Modify: `backend/models/Organization.js` (add `branding.logoImageId`, `branding.bannerImageId`)
- Modify: `backend/services/platformService.js` **or** wherever branding is saved — locate with the grep in Step 1
- Modify: `frontend/src/routes/admin/Branding.tsx`
- Modify: `backend/tests/images.js` (add the claim/replace assertions)

**Interfaces:**
- Consumes: `FileDrop` (Task 5), `resolveImageUrl` (Task 4), `claimImage`/`deleteImage` (Task 2)
- Produces: branding payloads that carry `logoImageId` / `bannerImageId` alongside the legacy `logoUrl` / `bannerUrl`

- [ ] **Step 1: Find where branding is persisted and served**

```bash
grep -rn "logoUrl" backend/models backend/services backend/controllers | head -20
```

Note every file that reads or writes `branding.logoUrl`. Each one needs the parallel `logoImageId` treatment. Do not guess — the tenant payload, the admin settings payload and the branding update service are all likely hits.

- [ ] **Step 2: Add the fields to the Organization schema**

In `backend/models/Organization.js`, inside the `branding` sub-schema, alongside `logoUrl` and `bannerUrl`:

```js
    // Points at an Image row. When set it wins over the legacy inline value,
    // which stays readable so existing base64 branding keeps working.
    logoImageId: { type: String, default: null },
    bannerImageId: { type: String, default: null },
```

- [ ] **Step 3: Claim on save, delete the replaced row**

In the service that updates branding, after the organization is saved, for each of the two slots:

```js
const { claimImage, deleteImage } = require("../services/imageService");

// ... inside the branding update, once per slot:
if (nextImageId && nextImageId !== previousImageId) {
  await claimImage({ id: nextImageId, organizationId: organization._id, ownerId: organization._id });
  // The replaced row is now unreachable — delete it rather than leaving it to
  // accumulate. This is what makes the new scheme an optimisation instead of
  // a slower leak.
  if (previousImageId) {
    await deleteImage({ id: previousImageId, organizationId: organization._id });
  }
}
```

- [ ] **Step 4: Extend the test with claim-and-replace assertions**

In `backend/tests/images.js`, before the `finally`, add:

```js
    // --- replacing a branding image deletes the row it replaced ---
    const first = await upload(PNG_1X1, { token: outletA.adminToken, ownerType: "branding_logo" });
    await api("/api/admin/settings", {
      method: "PATCH", token: outletA.adminToken,
      body: { branding: { logoImageId: first.body.id } },
    });
    const second = await upload(WEBP_1X1, { token: outletA.adminToken, ownerType: "branding_logo", type: "image/webp", filename: "b.webp" });
    await api("/api/admin/settings", {
      method: "PATCH", token: outletA.adminToken,
      body: { branding: { logoImageId: second.body.id } },
    });
    const replaced = await fetch(`${baseUrl}/api/images/${first.body.id}`);
    check("the replaced branding image is deleted", replaced.status === 404, replaced.status);
    const current = await fetch(`${baseUrl}/api/images/${second.body.id}`);
    check("the current branding image survives", current.status === 200, current.status);
```

Confirm the settings endpoint path and method first:

```bash
grep -n "settings" backend/routes/adminRoutes.js
```

Adjust the two `api("/api/admin/settings", …)` calls to the real path and verb.

- [ ] **Step 5: Run the test to verify it fails**

```bash
node backend/tests/images.js
```

Expected: FAIL on "the replaced branding image is deleted" until Step 3 is wired correctly.

- [ ] **Step 6: Run it again after wiring**

```bash
node backend/tests/images.js
```

Expected: all `PASS`.

- [ ] **Step 7: Replace the two pickers in `Branding.tsx`**

Delete the local `resizeImageToBase64` function (lines around 13-60) and both hidden `<input type="file">` blocks. Replace each picker with:

```tsx
<FileDrop
  mode="image"
  ownerType="branding_logo"
  previewUrl={resolveImageUrl(form.logoImageId, form.logoUrl)}
  onImageUploaded={({ id }) => set("logoImageId", id)}
  onRemove={() => { set("logoImageId", null); set("logoUrl", ""); }}
  label="Click to choose a logo, or drag one here"
/>
```

and the banner equivalent with `ownerType="branding_banner"`, `form.bannerImageId` / `form.bannerUrl`, and label "Click to choose a banner, or drag one here". Add the imports:

```tsx
import { FileDrop } from "../../components/shared/FileDrop";
import { resolveImageUrl } from "../../lib/images";
```

- [ ] **Step 8: Typecheck and verify in the browser**

```bash
npm run lint
```

Then start the preview and check the Branding page renders both drop zones, an upload succeeds, and the network tab shows a `POST /api/admin/images` returning 201 followed by an `<img>` hitting `/api/images/<id>`:

```bash
MONGODB_URI="" npm run dev
```

- [ ] **Step 9: Write the one-shot migration for existing base64 branding**

Create `backend/scripts/migrate-branding-images.js`:

```js
/**
 * Moves branding images that were stored as inline base64 data URIs into
 * Image rows, one row per outlet slot.
 *
 * Safe to run more than once: an outlet that already has an imageId for a
 * slot is skipped, so a re-run is a no-op rather than a duplicate.
 *
 * Run against a real database with:
 *   MONGODB_URI="<uri>" node scripts/migrate-branding-images.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const { createImage, claimImage } = require("../services/imageService");

const DATA_URI = /^data:(image\/[a-z+]+);base64,(.+)$/i;

const migrateSlot = async (org, urlField, idField, ownerType) => {
  if (org.branding?.[idField]) return false;
  const value = org.branding?.[urlField];
  const match = typeof value === "string" && value.match(DATA_URI);
  if (!match) return false;

  const buffer = Buffer.from(match[2], "base64");
  const { id } = await createImage({
    organizationId: org._id,
    ownerType,
    buffer
  });
  await claimImage({ id, organizationId: org._id, ownerId: org._id });
  org.branding[idField] = id;
  return true;
};

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is required — this script is for real databases only.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const orgs = await Organization.find({});
  let moved = 0;
  for (const org of orgs) {
    const a = await migrateSlot(org, "logoUrl", "logoImageId", "branding_logo");
    const b = await migrateSlot(org, "bannerUrl", "bannerImageId", "branding_banner");
    if (a || b) {
      await org.save();
      moved++;
      console.log(`migrated ${org.slug}${a ? " logo" : ""}${b ? " banner" : ""}`);
    }
  }
  console.log(`\nDone. ${moved} outlet(s) updated of ${orgs.length}.`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

The legacy `logoUrl` / `bannerUrl` values are deliberately left in place — `resolveImageUrl` prefers the id, so the old value is harmless, and keeping it means a failed migration can be re-run rather than having destroyed the only copy.

- [ ] **Step 10: Verify the script is a no-op without a database**

```bash
node backend/scripts/migrate-branding-images.js
```

Expected: `MONGODB_URI is required — this script is for real databases only.` and exit 1. It must refuse rather than silently target the in-memory mock, which would migrate seed data into a database that disappears.

- [ ] **Step 11: Commit**

```bash
git add backend/models/Organization.js backend/services backend/scripts/migrate-branding-images.js backend/tests/images.js frontend/src/routes/admin/Branding.tsx
git commit -m "feat: store branding images as Image rows and upload via FileDrop"
```

---

## Task 7: `Switch` primitive

kokonutui's `switch-button` is a `next-themes` light/dark button, not a generic toggle — it cannot serve this. Use the standard shadcn/Radix switch, matching the existing kit.

**Files:**
- Create: `frontend/src/components/ui/switch.tsx`
- Modify: `frontend/package.json` (add `@radix-ui/react-switch`)

**Interfaces:**
- Produces: `<Switch checked={boolean} onCheckedChange={(v: boolean) => void} disabled? aria-label? />`

- [ ] **Step 1: Install the dependency**

```bash
npm install @radix-ui/react-switch -w frontend
```

- [ ] **Step 2: Create the component**

Create `frontend/src/components/ui/switch.tsx`:

```tsx
import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "../../lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // On is the action colour; off is a neutral track. Never the tenant hue
      // — a toggle is a control, not tenant identity.
      "data-[state=checked]:bg-[var(--primary)] data-[state=unchecked]:bg-[var(--surface-2)]",
      className,
    )}
    {...props}
    ref={ref}
  />
));
Switch.displayName = SwitchPrimitives.Root.displayName;

const SwitchThumb = SwitchPrimitives.Thumb;

export { Switch, SwitchThumb };
```

Add the thumb inside `Root` — Radix requires it as a child:

```tsx
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
```

placed as the only child of `<SwitchPrimitives.Root>`, before the closing tag.

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/switch.tsx frontend/package.json package-lock.json
git commit -m "feat: add Switch primitive"
```

---

## Task 8: `SettingRow` and the points program restyle

**Files:**
- Create: `frontend/src/components/shared/SettingRow.tsx`
- Modify: `frontend/src/routes/admin/PointsProgram.tsx`

**Interfaces:**
- Consumes: `Switch` (Task 7)
- Produces: `<SettingRow label description>{control}</SettingRow>`

- [ ] **Step 1: Create `SettingRow`**

Create `frontend/src/components/shared/SettingRow.tsx`:

```tsx
import type { ReactNode } from "react";

interface SettingRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

/**
 * One settings line: what it is on the left, the control hard right, a
 * hairline between rows. The description carries the meaning so the control
 * never has to be self-explanatory.
 */
export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] py-4 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-[var(--ink)]">{label}</div>
        {description && (
          <div className="mt-0.5 text-[13px] text-[var(--muted)]">{description}</div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Convert the birthday trigger to a `Switch`**

In `PointsProgram.tsx`, replace the birthday `<input type="checkbox">` block (around line 280-290) with:

```tsx
<SettingRow label="Birthday" description="Send a birthday email.">
  <Switch
    checked={triggersForm.birthday.enabled}
    onCheckedChange={(v) =>
      setTriggersForm((t) => (t ? { ...t, birthday: { enabled: v } } : t))
    }
    aria-label="Send a birthday email"
  />
</SettingRow>
```

- [ ] **Step 3: Convert the milestone and inactivity triggers**

Replace the milestone block with a switch that controls null-ness, plus the number field only when on:

```tsx
<SettingRow
  label="Milestone"
  description="Celebrate a customer's Nth visit."
>
  <Switch
    checked={triggersForm.milestone.visitCount !== null}
    onCheckedChange={(v) =>
      setTriggersForm((t) => (t ? { ...t, milestone: { visitCount: v ? 10 : null } } : t))
    }
    aria-label="Milestone trigger"
  />
  {triggersForm.milestone.visitCount !== null && (
    <input
      type="number"
      min={1}
      step="1"
      value={triggersForm.milestone.visitCount}
      onChange={(e) =>
        setTriggersForm((t) =>
          t ? { ...t, milestone: { visitCount: e.target.value === "" ? 1 : Number(e.target.value) } } : t,
        )
      }
      className="w-24 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
      aria-label="Visit count"
    />
  )}
</SettingRow>
```

and the inactivity block identically, with `inactivity.days`, a default of `30` when switched on, label "Inactivity", and description "Reach out after a customer has been away this long."

- [ ] **Step 4: Add the imports**

```tsx
import { SettingRow } from "../../components/shared/SettingRow";
import { Switch } from "../../components/ui/switch";
```

- [ ] **Step 5: Leave Inherit/Override alone**

Do **not** convert `inheritRow`'s `SegmentedControl` to a `Switch`. It is three-state — inherit, override, and a real configured `0` — and `pointsExpiryDays: 0` legitimately means "never expire". A two-state toggle cannot express that, and collapsing it would silently change program behaviour.

- [ ] **Step 6: Typecheck and verify**

```bash
npm run lint
```

Then load `/[company]/[outlet]/admin/program` in the preview browser and confirm: three toggle rows render, switching Milestone off then saving writes `null` (check the network payload), and switching it on restores the number field.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/shared/SettingRow.tsx frontend/src/routes/admin/PointsProgram.tsx
git commit -m "feat: restyle points program triggers as toggle rows"
```

---

## Task 9: `Loader` component

**Files:**
- Create: `frontend/src/components/ui/loader.tsx`
- Modify: `frontend/src/components/admin/AdminGuard.tsx:74`
- Modify: `frontend/src/routes/AdminVerifyEmail.tsx:68`, `frontend/src/routes/VerifyEmail.tsx:57`, `frontend/src/routes/GlobalVerifyEmail.tsx:68`

**Interfaces:**
- Produces: `<Loader title? subtitle? size="sm"|"md"|"lg" />`

- [ ] **Step 1: Vendor the source**

```bash
curl -sL https://kokonutui.com/r/loader.json -o /tmp/ku-loader.json && node -e "const j=require('/tmp/ku-loader.json');require('fs').writeFileSync('/tmp/ku-loader.tsx',j.files[0].content);console.log('wrote', j.files[0].content.length)"
```

Expected: `wrote 9768`

- [ ] **Step 2: Port it**

Create `frontend/src/components/ui/loader.tsx` from `/tmp/ku-loader.tsx` with these changes:

1. Drop `"use client"`.
2. Change `import { cn } from "@/lib/utils"` to `import { cn } from "../../lib/utils"`.
3. The rings are drawn with `conic-gradient(... rgb(0, 0, 0) ...)` hardcoded black. Replace every `rgb(0, 0, 0)` with `var(--primary)` and every `rgba(0, 0, 0, 0.5)` / `rgba(0, 0, 0, 0.6)` with `color-mix(in srgb, var(--primary) 50%, transparent)` and `... 60%, transparent)` respectively.
4. Replace any `text-gray-*` / `dark:text-gray-*` on the title and subtitle with `text-[var(--ink)]` and `text-[var(--muted)]`.
5. Guard the animation. Add at the top of the component body:

```tsx
const m = useMotion();
```

with `import { useMotion } from "../../lib/motion";`, and wrap each `transition={{ ... repeat: Number.POSITIVE_INFINITY ... }}` so a reduced-motion user gets a still ring:

```tsx
transition={m.prefersReduced ? { duration: 0 } : { duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
```

and set `animate={m.pick({ rotate: [0, 360] }, { rotate: 0 })}` on each rotating ring.

6. Change the default props to something this app would actually say:

```tsx
title = "One moment",
subtitle = "Getting things ready",
```

- [ ] **Step 3: Swap it into `AdminGuard`**

In `frontend/src/components/admin/AdminGuard.tsx`, replace the "Verifying credentials..." markup with:

```tsx
<Loader title="One moment" subtitle="Checking you in" size="md" />
```

Leave the surrounding logout-and-redirect logic untouched — that is what stops a stale token stranding staff in a permanent loop.

- [ ] **Step 4: Swap it into the three verify pages**

In each of `AdminVerifyEmail.tsx`, `VerifyEmail.tsx` and `GlobalVerifyEmail.tsx`, replace the `<p …>Verifying…</p>` line with:

```tsx
<Loader title="Verifying your email" subtitle="This only takes a second" size="sm" />
```

- [ ] **Step 5: Typecheck and verify**

```bash
npm run lint
```

Then load `/admin-login`, sign in as `durbarmarg@coffesarowar.com` / `password`, and confirm the loader appears briefly instead of the old text.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/loader.tsx frontend/src/components/admin/AdminGuard.tsx frontend/src/routes/AdminVerifyEmail.tsx frontend/src/routes/VerifyEmail.tsx frontend/src/routes/GlobalVerifyEmail.tsx
git commit -m "feat: replace loading text with animated Loader"
```

---

## Task 10: `DynamicText` greeting

**Files:**
- Create: `frontend/src/components/shared/DynamicText.tsx`
- Modify: `frontend/src/routes/CustomerDashboard.tsx:134`

**Interfaces:**
- Produces: `<DynamicText words={string[]} settled={string} className? />` — cycles `words` once, then rests on `settled`

- [ ] **Step 1: Vendor the source**

```bash
curl -sL https://kokonutui.com/r/dynamic-text.json -o /tmp/ku-dynamic-text.json && node -e "const j=require('/tmp/ku-dynamic-text.json');require('fs').writeFileSync('/tmp/ku-dynamic-text.tsx',j.files[0].content);console.log('wrote', j.files[0].content.length)"
```

Expected: `wrote 2876`

The original hardcodes a greeting list and its own layout. We keep its mechanism — cycle once at 300ms, then stop — and make the content a prop.

- [ ] **Step 2: Write the component**

Create `frontend/src/components/shared/DynamicText.tsx`:

```tsx
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";

interface DynamicTextProps {
  /** Cycled through once, quickly, on mount. */
  words: string[];
  /** What it comes to rest on and stays as. */
  settled: string;
  className?: string;
}

/**
 * Runs through a handful of greetings and lands on the real one. The cycle
 * happens once per mount, never loops — a permanently animating greeting is
 * a distraction on a page whose actual job is showing a balance.
 */
export function DynamicText({ words, settled, className }: DynamicTextProps) {
  const m = useMotion();
  const sequence = [...words, settled];
  // A reduced-motion user gets the final text immediately, with no cycle.
  const [index, setIndex] = useState(m.prefersReduced ? sequence.length - 1 : 0);

  useEffect(() => {
    if (m.prefersReduced) return;
    if (index >= sequence.length - 1) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), 300);
    return () => clearTimeout(timer);
  }, [index, sequence.length, m.prefersReduced]);

  return (
    <span className={className}>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={index}
          initial={m.pick({ y: 16, opacity: 0 }, false)}
          animate={{ y: 0, opacity: 1 }}
          exit={m.pick({ y: -16, opacity: 0 }, { opacity: 0 })}
          transition={m.ease("standard")}
          className="inline-block"
        >
          {sequence[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
```

- [ ] **Step 3: Use it in the dashboard greeting**

In `frontend/src/routes/CustomerDashboard.tsx`, replace the greeting at line 134:

```tsx
Welcome back{firstName ? `, ${firstName}` : ""}
```

with:

```tsx
<DynamicText
  words={["नमस्ते", "Hello", "Namaste"]}
  settled={`Welcome back${firstName ? `, ${firstName}` : ""}`}
/>
```

Nepali first — this is a Nepali-market product and the customer console is the one surface a customer actually reads.

- [ ] **Step 4: Typecheck and verify**

```bash
npm run lint
```

Sign in as `asha@example.com` / `password`, open an outlet dashboard, confirm the greeting cycles once and rests on "Welcome back, Asha". Then enable "Reduce motion" in macOS System Settings → Accessibility → Display and reload: the final text must appear immediately with no cycle.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/shared/DynamicText.tsx frontend/src/routes/CustomerDashboard.tsx
git commit -m "feat: animate the customer dashboard greeting"
```

---

## Task 11: `AccountMenu` restyle

One file, three consoles — `AdminLayout`, `PlatformLayout` and `CompanyLayout` all render it.

**Files:**
- Modify: `frontend/src/components/shared/AccountMenu.tsx`

**Interfaces:**
- Consumes: the existing `components/ui/dropdown-menu` primitive (present, currently unused)
- Produces: the same props as today — `{ initial, name, email?, compact?, settingsPath, onLogout, accent?, dropUp? }`. **Do not change the prop surface**; three layouts pass it.

- [ ] **Step 1: Vendor the reference**

```bash
curl -sL https://kokonutui.com/r/profile-dropdown.json -o /tmp/ku-profile.json && node -e "const j=require('/tmp/ku-profile.json');require('fs').writeFileSync('/tmp/ku-profile.tsx',j.files[0].content);console.log(j.registryDependencies.join(','))"
```

Expected: `dropdown-menu`

- [ ] **Step 2: Confirm the local `dropdown-menu` primitive exports what is needed**

```bash
grep -n "^export\|DropdownMenuTrigger\|DropdownMenuContent\|DropdownMenuItem\|DropdownMenuSeparator" frontend/src/components/ui/dropdown-menu.tsx | head
```

Expected: all four names present. If the file is a stub, install `@radix-ui/react-dropdown-menu` and fill it from the shadcn source before continuing.

- [ ] **Step 3: Rewrite `AccountMenu` on the primitive**

Replace the hand-rolled `useState` + `useRef` + `mousedown` outside-click handling with `DropdownMenu`. Keep the trigger's avatar-tile-plus-name shape (it fits a 248px rail), and take from the reference: the rounded-2xl surface, the two-line trigger, the separated destructive sign-out row.

Adapt these from the reference, which is Next-flavoured and off-palette:
- `next/link` → `react-router-dom`'s `Link`
- `next/image` → the existing initial-tile `<span>`; there is no avatar URL in this prop surface
- every `zinc-*` / `dark:*` class → `--line`, `--surface`, `--ink`, `--muted`, `--bg`
- the destructive row's `bg-red-500/10` / `text-red-500` → `bg-[var(--err-soft)]` / `text-[var(--err)]`
- drop the "bending line" SVG indicator, the Gemini icon, the Model and Subscription rows, and `SAMPLE_PROFILE_DATA` — none of them have a counterpart here

Preserve the `dropUp` behaviour by passing `side={dropUp ? "top" : "bottom"}` to `DropdownMenuContent`, and `compact` by keeping the `hidden xl:block` wrapper on the name column.

- [ ] **Step 4: Typecheck**

```bash
npm run lint
```

- [ ] **Step 5: Verify in all three consoles**

Confirm the menu opens, Settings navigates, and Log out works in each:
- outlet console: sign in as `durbarmarg@coffesarowar.com` / `password`
- company console: sign in as `owner@coffesarowar.com` / `password`
- platform console: sign in as `admin@stampd.co` / `password`

The outlet console's rail passes `dropUp` — confirm the menu opens upward there and does not clip.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/shared/AccountMenu.tsx
git commit -m "feat: rebuild AccountMenu on the dropdown-menu primitive"
```

---

## Task 12: Extract the customer reward and event cards

A preview that reimplements a card is a preview that lies the first time the real card changes. Extract first, then the modals render the real thing.

**Files:**
- Create: `frontend/src/components/customer/RewardCard.tsx`
- Create: `frontend/src/components/customer/EventCard.tsx`
- Modify: `frontend/src/routes/RedeemLanding.tsx:202-257`
- Modify: `frontend/src/routes/CustomerDashboard.tsx:321-358`

**Interfaces:**
- Produces:
  ```ts
  <RewardCard item={{ id, name, description, imageUrl, pointsPrice }} balance={number} disabled?={boolean} onSelect?={() => void} />
  <EventCard event={{ id, title, date, time, location, description, imageUrl }} />
  ```

- [ ] **Step 1: Create `RewardCard` from the existing markup**

Create `frontend/src/components/customer/RewardCard.tsx` containing exactly the markup currently at `RedeemLanding.tsx:206-257`, parameterised. The affordability logic moves in with it:

```tsx
import { Gift } from "lucide-react";
import { Progress } from "../ui/progress";
import { formatPoints } from "../../hooks/usePoints";

export interface RewardCardItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  pointsPrice: number;
}

interface RewardCardProps {
  item: RewardCardItem;
  /** The customer's balance, in points. */
  balance: number;
  disabled?: boolean;
  onSelect?: () => void;
}

export function RewardCard({ item, balance, disabled, onSelect }: RewardCardProps) {
  const canAfford = item.pointsPrice <= balance;
  const short = item.pointsPrice - balance;
  return (
    <button
      onClick={onSelect}
      disabled={!canAfford || disabled}
      className="stamp-interactive flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 text-left disabled:cursor-not-allowed disabled:opacity-70"
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            background: canAfford ? "var(--primary-soft)" : "var(--surface-2)",
            color: canAfford ? "var(--primary-deep)" : "var(--soft)",
          }}
        >
          <Gift className="h-4.5 w-4.5" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--ink)]">{item.name}</span>
        <span className="block truncate text-[13px] text-[var(--muted)]">
          {canAfford ? item.description || "Ready to redeem" : `${formatPoints(short)} more points needed`}
        </span>
        {/* How close they are, for anything they can't afford yet. An
            out-of-reach reward is a reason to come back, not a dead row — but
            it must never look redeemable. */}
        {!canAfford && <Progress value={(balance / item.pointsPrice) * 100} className="mt-2 h-1.5" />}
      </span>

      <span
        className="flex-shrink-0 font-numeral text-2xl leading-none"
        style={{ color: canAfford ? "var(--primary)" : "var(--soft)" }}
      >
        {formatPoints(item.pointsPrice)}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Use it in `RedeemLanding`**

Replace the `catalog.map(...)` body with:

```tsx
{catalog.map((item) => (
  <RewardCard
    key={item.id}
    item={item}
    balance={balance}
    disabled={Boolean(redeeming)}
    onSelect={() => setPending(item)}
  />
))}
```

- [ ] **Step 3: Create `EventCard` from the dashboard markup**

Create `frontend/src/components/customer/EventCard.tsx` containing the markup at `CustomerDashboard.tsx:325-357`, parameterised. Move `formatEventDate` (currently `CustomerDashboard.tsx:41`) into this file and export it, then import it back into the dashboard if anything else there still needs it.

- [ ] **Step 4: Use it in `CustomerDashboard`**

```tsx
<ul className="flex flex-col gap-3.5">
  {upcomingEvents.map((event) => (
    <li key={event.id}>
      <EventCard event={event} />
    </li>
  ))}
</ul>
```

- [ ] **Step 5: Typecheck and verify nothing changed visually**

```bash
npm run lint
```

Load the customer dashboard and the redeem landing page. Both must look **identical** to before — this task is a pure extraction, and any visual difference means the markup drifted during the move.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/customer/RewardCard.tsx frontend/src/components/customer/EventCard.tsx frontend/src/routes/RedeemLanding.tsx frontend/src/routes/CustomerDashboard.tsx
git commit -m "refactor: extract customer reward and event cards"
```

---

## Task 13: `CreatePreviewModal` shell

**Files:**
- Create: `frontend/src/components/shared/CreatePreviewModal.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `components/ui/dialog`
- Produces:
  ```tsx
  <CreatePreviewModal
    open onOpenChange title
    form={<>…</>} preview={<>…</>}
    saveLabel busy onSave onCancel
  />
  ```
  It holds **no** field state and knows nothing about rewards, campaigns or events.

- [ ] **Step 1: Write the shell**

Create `frontend/src/components/shared/CreatePreviewModal.tsx`:

```tsx
import type { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

interface CreatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: ReactNode;
  preview: ReactNode;
  saveLabel?: string;
  busy?: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Layout only: fields on the left, a live preview on the right.
 *
 * On a phone the preview stacks ABOVE the form (`order` flips it), so it
 * stays on screen while the admin types rather than sitting below the fold —
 * a preview you have to scroll to is a preview nobody looks at.
 */
export function CreatePreviewModal({
  open, onOpenChange, title, form, preview,
  saveLabel = "Save", busy, onSave, onCancel,
}: CreatePreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[880px] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-ambient">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-[var(--ink)]">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="order-2 flex flex-col gap-3 md:order-1">{form}</div>
          <div className="order-1 md:order-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--soft)]">
              Preview
            </div>
            <div className="mt-2 rounded-[var(--radius-card)] bg-[var(--surface-2)] p-4">
              {preview}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold text-[var(--muted)]"
          >
            Cancel
          </button>
          <Button onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/shared/CreatePreviewModal.tsx
git commit -m "feat: add CreatePreviewModal layout shell"
```

---

## Task 14: Reward create/edit modal

**Files:**
- Create: `frontend/src/components/admin/RewardFormModal.tsx`
- Modify: `frontend/src/routes/admin/AdminRewards.tsx`
- Modify: backend reward service — claim the image on save, delete the replaced one (find with the grep in Step 1)

**Interfaces:**
- Consumes: `CreatePreviewModal` (13), `RewardCard` (12), `FileDrop` (5), `resolveImageUrl` (4)
- Produces: `<RewardFormModal open onOpenChange initial?={RewardItem} onSaved={() => void} />`

- [ ] **Step 1: Find the reward write path**

```bash
grep -n "imageUrl" backend/services/rewardService.js backend/models/RewardItem.js
```

Add to `backend/models/RewardItem.js`:

```js
  imageId: { type: String, default: null },
```

In `backend/services/rewardService.js`, add the import and a shared helper:

```js
const { claimImage, deleteImage } = require("./imageService");

// An uploaded image starts unowned. Saving the row that uses it claims it,
// and the row it replaced becomes unreachable — delete it rather than leave
// it to accumulate, which is what makes this an optimisation instead of a
// slower leak.
const applyImage = async ({ organizationId, ownerId, nextImageId, previousImageId }) => {
  if (nextImageId === previousImageId) return;
  if (nextImageId) {
    await claimImage({ id: nextImageId, organizationId, ownerId });
  }
  if (previousImageId) {
    await deleteImage({ id: previousImageId, organizationId });
  }
};
```

Call it after the reward is created (`previousImageId: null`), after an update (`previousImageId` read before the write), and on delete (`nextImageId: null`, `previousImageId: reward.imageId`) so removing a reward removes its image too.

- [ ] **Step 2: Write the modal**

Create `frontend/src/components/admin/RewardFormModal.tsx`. It owns the draft state, renders four fields (name, points price, description, image), and renders `RewardCard` as the preview with a balance high enough that it always shows the affordable state:

```tsx
const previewItem = {
  id: "preview",
  name: draft.name || "Reward name",
  description: draft.description || "Reward description will appear here…",
  imageUrl: resolveImageUrl(draft.imageId, draft.imageUrl),
  pointsPrice: draft.pointsPrice,
};
```

```tsx
<RewardCard item={previewItem} balance={Number.MAX_SAFE_INTEGER} />
```

`Number.MAX_SAFE_INTEGER` because the preview is showing the admin what the reward looks like, not simulating one customer's balance — the "N more points needed" state depends on who is looking and has no meaning here.

- [ ] **Step 3: Replace the inline form in `AdminRewards`**

Delete `RewardFields`, the `adding` / `draft` / `editingId` / `editDraft` state and both inline form blocks. Add one piece of modal state:

```tsx
const [modal, setModal] = useState<{ open: boolean; initial: RewardItem | null }>({
  open: false,
  initial: null,
});
```

Point the "New reward" button at `setModal({ open: true, initial: null })` and each row's edit pencil at `setModal({ open: true, initial: r })`, then render once at the bottom of the component:

```tsx
<RewardFormModal
  open={modal.open}
  onOpenChange={(open) => setModal((s) => ({ ...s, open }))}
  initial={modal.initial}
  onSaved={() => { setModal({ open: false, initial: null }); invalidate(); }}
/>
```

Keep the existing `ConfirmDialog` delete flow exactly as it is — the modal replaces create and edit, not delete.

- [ ] **Step 4: Typecheck and verify**

```bash
npm run lint
```

Then in the preview browser: open Rewards, click New reward, type a name and points price, upload an image, and confirm the preview card updates live and matches the card on the customer redeem page after saving.

- [ ] **Step 5: Run the backend suite**

```bash
npm test -w backend
```

Expected: all pass, including `rewards-catalog.js`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/RewardFormModal.tsx frontend/src/routes/admin/AdminRewards.tsx backend/models/RewardItem.js backend/services/rewardService.js
git commit -m "feat: create and edit rewards in a modal with a live preview"
```

---

## Task 15: Campaign create/edit modal

**Files:**
- Create: `frontend/src/components/admin/CampaignFormModal.tsx`
- Modify: `frontend/src/routes/admin/AdminCampaigns.tsx`

**Interfaces:**
- Consumes: `CreatePreviewModal` (13); `useAdminSettings` for the resolved `earnPercent`
- Produces: `<CampaignFormModal open onOpenChange initial? onSaved />`

- [ ] **Step 1: Read the current campaign form to get the exact field set**

```bash
grep -n "multiplier\|startAt\|endAt\|daysOfWeek\|name" frontend/src/routes/admin/AdminCampaigns.tsx | head -20
```

Use exactly those fields — do not invent new ones.

- [ ] **Step 2: Write the preview**

The preview shows the campaign banner plus a worked example. The math mirrors what a claim does: `earnCenti = round(bill × earnPercent × multiplier)`, rendered in points.

```tsx
const SAMPLE_BILL = 500;
const base = (SAMPLE_BILL * resolvedEarnPercent) / 100;
const boosted = base * draft.multiplier;
```

```tsx
<p className="text-[13px] text-[var(--muted)]">
  A Rs {SAMPLE_BILL} bill earns{" "}
  <span className="font-numeral text-[var(--primary)]">{boosted}</span> points
  instead of <span className="font-numeral">{base}</span>.
</p>
<p className="mt-2 text-[11px] text-[var(--soft)]">
  An estimate. The multiplier is worked out when the customer claims, not now —
  another campaign running at the same time can change it.
</p>
```

That caveat is not optional copy. The multiplier resolves at claim time in `campaignService`, and `CAMPAIGN_STACKING = "max"` means an overlapping campaign gives the higher of the two, not the product — so a preview stated as fact would be wrong the moment two campaigns overlap.

- [ ] **Step 3: Render the active window in Kathmandu time**

`daysOfWeek` is judged in `Asia/Kathmandu`, never UTC — Nepal is UTC+5:45, so a "Thursday" campaign judged in UTC actually runs Wednesday 18:15 → Thursday 18:15 local. Format the preview's window with an explicit time zone:

```tsx
new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date(draft.startAt))
```

- [ ] **Step 4: Replace the inline form in `AdminCampaigns`**

Delete the inline expand-in-place form block, its draft state and its edit state from `AdminCampaigns.tsx`. Add a single piece of modal state:

```tsx
const [modal, setModal] = useState<{ open: boolean; initial: Campaign | null }>({
  open: false,
  initial: null,
});
```

Point the "New campaign" button at `setModal({ open: true, initial: null })` and each row's edit control at `setModal({ open: true, initial: row })`, then render once at the bottom of the component:

```tsx
<CampaignFormModal
  open={modal.open}
  onOpenChange={(open) => setModal((s) => ({ ...s, open }))}
  initial={modal.initial}
  onSaved={() => { setModal({ open: false, initial: null }); invalidate(); }}
/>
```

Create and edit are the same modal seeded differently — they must not be two different UIs.

- [ ] **Step 5: Typecheck, verify, and run the campaign suite**

```bash
npm run lint && node backend/tests/campaigns.js
```

Expected: lint clean, all campaign checks pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/CampaignFormModal.tsx frontend/src/routes/admin/AdminCampaigns.tsx
git commit -m "feat: create and edit campaigns in a modal with a live preview"
```

---

## Task 16: Event create/edit modal

**Files:**
- Create: `frontend/src/components/admin/EventFormModal.tsx`
- Modify: `frontend/src/routes/admin/AdminEvents.tsx`
- Modify: `backend/models/Event.js`, `backend/services/eventService.js` (add `imageId`, claim on save, delete the replaced row)

**Interfaces:**
- Consumes: `CreatePreviewModal` (13), `EventCard` (12), `FileDrop` (5)
- Produces: `<EventFormModal open onOpenChange initial? onSaved />`

- [ ] **Step 1: Add `imageId` to the Event model and service**

Add to `backend/models/Event.js`:

```js
  imageId: { type: String, default: null },
```

In `backend/services/eventService.js`, add the same claim-and-delete-replaced helper the reward service uses:

```js
const { claimImage, deleteImage } = require("./imageService");

const applyImage = async ({ organizationId, ownerId, nextImageId, previousImageId }) => {
  if (nextImageId === previousImageId) return;
  if (nextImageId) {
    await claimImage({ id: nextImageId, organizationId, ownerId });
  }
  if (previousImageId) {
    await deleteImage({ id: previousImageId, organizationId });
  }
};
```

Call it after create (`previousImageId: null`), after update (`previousImageId` read before the write), and on delete (`nextImageId: null`, `previousImageId: event.imageId`).

- [ ] **Step 2: Write the modal**

Fields are exactly the existing draft shape — `title`, `date`, `time`, `location`, `description`, plus the image via `FileDrop`. The preview is `<EventCard event={previewEvent} />` where `previewEvent` fills each empty field with placeholder text ("Event title", "Where it happens", …) so the card never renders blank.

- [ ] **Step 3: Replace the inline form in `AdminEvents`**

Delete the inline form block and its `EMPTY_DRAFT` draft state from `AdminEvents.tsx`. Add one piece of modal state:

```tsx
const [modal, setModal] = useState<{ open: boolean; initial: EventItem | null }>({
  open: false,
  initial: null,
});
```

Point the "New event" button at `setModal({ open: true, initial: null })` and each row's edit control at `setModal({ open: true, initial: row })`, then render once:

```tsx
<EventFormModal
  open={modal.open}
  onOpenChange={(open) => setModal((s) => ({ ...s, open }))}
  initial={modal.initial}
  onSaved={() => { setModal({ open: false, initial: null }); invalidate(); }}
/>
```

- [ ] **Step 4: Typecheck, verify, and run the events suite**

```bash
npm run lint && node backend/tests/upcoming-events.js
```

Expected: lint clean, all checks pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/EventFormModal.tsx frontend/src/routes/admin/AdminEvents.tsx backend/models/Event.js backend/services/eventService.js
git commit -m "feat: create and edit events in a modal with a live preview"
```

---

## Task 17: `FileDrop` on the menu spreadsheet import

**Files:**
- Modify: `frontend/src/routes/admin/MenuManagement.tsx`

- [ ] **Step 1: Replace the spreadsheet picker**

Find the existing `<input type="file">` for the import and replace it with:

```tsx
<FileDrop
  mode="file"
  accept=".xlsx"
  maxBytes={5 * 1024 * 1024}
  onFilePicked={(file) => void runImportPreview(file)}
  label="Click to choose a spreadsheet, or drag one here"
/>
```

`mode="file"` matters: the import is a real multipart upload to `/api/admin/menu/import/preview`, which returns the new/changed/unchanged diff. It must **not** go through the image pipeline.

- [ ] **Step 2: Typecheck and verify the import still works end to end**

```bash
npm run lint && node backend/tests/menu-import.js
```

Then in the browser, upload a spreadsheet and confirm `MenuImportPreviewModal` still opens with the diff.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/admin/MenuManagement.tsx
git commit -m "feat: use FileDrop for the menu spreadsheet import"
```

---

## Task 18: Full verification pass

- [ ] **Step 1: Run the entire backend suite**

```bash
npm test -w backend
```

Expected: every suite passes, `images.js` included.

- [ ] **Step 2: Typecheck the frontend**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Confirm the tenant-colour invariants still hold**

```bash
npx tsx frontend/scripts/verify-tenant-color.ts
```

Expected: passes. The extracted cards render `--brand`, so this guards that the tenant hue and the value green still have not swapped jobs.

- [ ] **Step 4: Confirm no base64 data URI is written on a fresh upload**

Start the app, upload a new outlet logo, then check the stored branding:

```bash
grep -rn "data:image" frontend/src/routes/admin/Branding.tsx
```

Expected: no matches — the old `resizeImageToBase64` path is gone.

- [ ] **Step 5: Commit any straggling fixes**

```bash
git status --short
```

Expected: clean, or only intentional changes.

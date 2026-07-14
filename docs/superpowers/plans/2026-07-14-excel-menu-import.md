# Epic C1 — Excel Menu Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A business admin uploads an Excel file and the menu items in it get bulk-added; a downloadable template shows the expected columns.

**Architecture:** `xlsx` parses/generates workbooks in-memory; `multer` (memoryStorage) receives the upload with no disk writes. One backend task wires schema-free service logic + controller + routes + multer together (mirrors how Epic B1's backend gate was built as a single cohesive task). A second task adds the admin UI. Append-only import, skip-and-report validation, backend as the sole enforcement point for file type/size/row-count limits.

**Tech Stack:** Node/Express, Mongoose (+ in-memory mock in dev), `xlsx` (SheetJS), `multer`, React 19 + Vite + TS, TanStack Query.

## Global Constraints

- Every user/loyalty query includes `organizationId` — tenant isolation is the core invariant.
- Backend layering: `routes/ → controllers/ (thin) → services/ (logic) → models/`.
- No schema changes — imported rows are ordinary `MenuItem` docs via the existing model.
- Column mapping: `Name` (required), `Price`, `Category` (defaults `"General"`), `Description` (all optional except Name) — matched case-insensitively.
- Import is append-only: never deletes or matches/updates existing items.
- Invalid rows (missing/blank Name) are skipped, not fatal — response reports `{ imported, skipped }`.
- Limits: 5MB max file size, `.xlsx`/`.xls` only, 500-row cap (rows beyond 500 valid rows count as skipped).
- Uploaded file is never written to disk — parsed from the in-memory buffer only.
- Use `MenuItem.create(arrayOfDocs)` for bulk insert, not `insertMany` — the array form of `.create()` is supported by both real Mongoose and this project's in-memory mock (`backend/utils/mockMongoose.js`); `insertMany` is not implemented in the mock.
- Commit with explicit file paths (`git add <path>`) — never `git add -A`.

---

### Task 1: Backend — import + template service, controller, routes, multer

**Files:**
- Modify: `backend/services/menuService.js`
- Modify: `backend/controllers/menuController.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/package.json`
- Create: `backend/tests/menu-import.js`

**Interfaces:**
- Produces: `menuService.parseMenuWorkbook(buffer): { rows: Array<{name, price, category, description}>, skipped: number }`
- Produces: `menuService.importMenuItems(organizationId, buffer): Promise<{ imported: number, skipped: number }>`
- Produces: `menuService.buildMenuTemplate(): Buffer`
- Produces routes: `POST /api/admin/menu/import` (multipart, field name `file`) → `{ success: true, imported, skipped }`; `GET /api/admin/menu/template` → `.xlsx` file download.

- [ ] **Step 1: Install the new dependencies**

Run: `cd backend && npm install xlsx multer`
Expected: both packages appear in `backend/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/menu-import.js`:

```js
/**
 * Excel menu import suite (Epic C1).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Builds a small .xlsx buffer in-process (via xlsx) with
 * a mix of valid/invalid rows, POSTs it as multipart form data, and checks
 * the import counts, the resulting menu, and the template download.
 *
 * Run directly: `node tests/menu-import.js`
 */

const XLSX = require("xlsx");
const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

function buildTestWorkbook() {
  const aoa = [
    ["Name", "Price", "Category", "Description"],
    ["Cappuccino", "₹150", "Coffee", "Rich and creamy espresso with steamed milk"],
    ["Croissant", "", "", ""],
    ["", "₹50", "Bakery", "Missing name, should be skipped"],
    ["", "", "", ""],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Menu");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5015 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body, headers = {} } = {}) => {
    const h = { ...headers };
    if (slug) h["X-Tenant-Slug"] = slug;
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined && !(body instanceof FormData)) {
      h["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    return fetch(`${baseUrl}${path}`, { method, headers: h, body }).then(async (r) => ({
      status: r.status,
      body: await r.json().catch(() => null),
      raw: r,
    }));
  };

  try {
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    // 1. Import a mixed valid/invalid workbook.
    const buf = buildTestWorkbook();
    const form = new FormData();
    form.append(
      "file",
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "menu.xlsx",
    );
    const importRes = await api("/api/admin/menu/import", { method: "POST", token: adminToken, body: form });
    check("import -> 200", importRes.status === 200);
    check("imported 2 valid rows", importRes.body?.imported === 2);
    check("skipped 2 invalid rows", importRes.body?.skipped === 2);

    // 2. The imported items now show up in the admin menu list.
    const listRes = await api("/api/admin/menu", { token: adminToken });
    const names = (listRes.body?.items || []).map((i) => i.name);
    check("Cappuccino imported", names.includes("Cappuccino"));
    check("Croissant imported", names.includes("Croissant"));
    const cappuccino = (listRes.body?.items || []).find((i) => i.name === "Cappuccino");
    check("imported item is available by default", cappuccino?.isAvailable === true);
    check("blank category defaults to General", (listRes.body?.items || []).find((i) => i.name === "Croissant")?.category === "General");

    // 3. Wrong file type is rejected.
    const badForm = new FormData();
    badForm.append("file", new Blob(["not a spreadsheet"], { type: "text/plain" }), "notes.txt");
    const badTypeRes = await api("/api/admin/menu/import", { method: "POST", token: adminToken, body: badForm });
    check("wrong file type -> 400", badTypeRes.status === 400);

    // 4. No file attached is rejected.
    const noFileRes = await api("/api/admin/menu/import", { method: "POST", token: adminToken, body: new FormData() });
    check("no file -> 400", noFileRes.status === 400);

    // 5. Template download round-trips through xlsx.
    const templateRes = await fetch(`${baseUrl}/api/admin/menu/template`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Tenant-Slug": SLUG },
    });
    check("template -> 200", templateRes.status === 200);
    const templateBuf = Buffer.from(await templateRes.arrayBuffer());
    const templateWb = XLSX.read(templateBuf, { type: "buffer" });
    const templateSheet = templateWb.Sheets[templateWb.SheetNames[0]];
    const templateRows = XLSX.utils.sheet_to_json(templateSheet, { header: 1 });
    check(
      "template has the right header row",
      JSON.stringify(templateRows[0]) === JSON.stringify(["Name", "Price", "Category", "Description"]),
    );

    // 6. Tenant isolation: importing into coffesarowar doesn't touch another tenant.
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
    const secondLogin = await api("/api/auth/login", {
      method: "POST",
      slug: secondSlug,
      body: { email: secondAdminEmail, password: "password" },
    });
    const secondList = await api("/api/admin/menu", { slug: secondSlug, token: secondLogin.body.token });
    check(
      "second tenant's menu unaffected by coffesarowar's import",
      Array.isArray(secondList.body?.items) && secondList.body.items.length === 0,
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`menu-import: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("menu-import: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run: `cd backend && node tests/menu-import.js`
Expected: FAIL — `/api/admin/menu/import` and `/api/admin/menu/template` don't exist yet (404s), so most `check()` calls fail.

- [ ] **Step 3: Implement the service functions**

In `backend/services/menuService.js`, add near the top:

```js
const XLSX = require("xlsx");

const MAX_IMPORT_ROWS = 500;

const normalizeHeader = (h) => String(h || "").trim().toLowerCase();

// Reads an uploaded workbook buffer and returns the valid rows plus a count
// of skipped ones (missing/blank Name, or beyond the 500-row cap). Headers
// are matched case-insensitively; column order doesn't matter.
const parseMenuWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  const rows = [];
  let skipped = 0;

  for (const record of records) {
    const fieldByHeader = {};
    for (const [key, value] of Object.entries(record)) {
      fieldByHeader[normalizeHeader(key)] = value;
    }

    const name = String(fieldByHeader.name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    if (rows.length >= MAX_IMPORT_ROWS) {
      skipped += 1;
      continue;
    }

    rows.push({
      name,
      price: String(fieldByHeader.price || "").trim(),
      category: String(fieldByHeader.category || "").trim() || "General",
      description: String(fieldByHeader.description || "").trim()
    });
  }

  return { rows, skipped };
};
```

Then add two more functions to the same file:

```js
const importMenuItems = async (organizationId, buffer) => {
  const { rows, skipped } = parseMenuWorkbook(buffer);

  if (rows.length > 0) {
    await MenuItem.create(
      rows.map((row) => ({
        organizationId,
        name: row.name,
        description: row.description,
        price: row.price,
        category: row.category,
        isAvailable: true,
        sortOrder: 0
      }))
    );
  }

  return { imported: rows.length, skipped };
};

const buildMenuTemplate = () => {
  const aoa = [
    ["Name", "Price", "Category", "Description"],
    ["Cappuccino", "₹150", "Coffee", "Rich and creamy espresso with steamed milk"]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Menu");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};
```

Update `module.exports` at the bottom of the file to also export `parseMenuWorkbook`, `importMenuItems`, `buildMenuTemplate`:

```js
module.exports = {
  createHttpError,
  listForOrg,
  createItem,
  updateItem,
  deleteItem,
  parseMenuWorkbook,
  importMenuItems,
  buildMenuTemplate
};
```

- [ ] **Step 4: Implement the controller + multer wiring**

In `backend/controllers/menuController.js`, replace the existing:

```js
const {
  listForOrg,
  createItem,
  updateItem,
  deleteItem
} = require("../services/menuService");
```

with:

```js
const multer = require("multer");
const {
  listForOrg,
  createItem,
  updateItem,
  deleteItem,
  importMenuItems,
  buildMenuTemplate
} = require("../services/menuService");
```

Add the multer instance and an error-normalizing wrapper (so a rejected file always reaches the client as 400, not a raw 500):

```js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okType =
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel";
    if (!okType) {
      const error = new Error("Only .xlsx or .xls files are accepted.");
      error.statusCode = 400;
      return cb(error);
    }
    cb(null, true);
  }
});

// Wraps upload.single so multer's own errors (wrong type, too large) reach
// the app's error-handling middleware as 400s instead of defaulting to 500.
const uploadMenuFile = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        error.statusCode = 400;
      }
      return next(error);
    }
    next();
  });
};

const importMenuItemsController = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("An Excel file is required.");
      error.statusCode = 400;
      throw error;
    }
    const result = await importMenuItems(req.user.organizationId, req.file.buffer);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const downloadMenuTemplate = (req, res) => {
  const buffer = buildMenuTemplate();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=\"menu-template.xlsx\"");
  res.send(buffer);
};
```

Add `uploadMenuFile`, `importMenuItemsController`, `downloadMenuTemplate` to `module.exports`.

- [ ] **Step 5: Wire the routes**

In `backend/routes/adminRoutes.js`, add to the destructured import from `../controllers/menuController`:

```js
const {
  listMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuFile,
  importMenuItemsController,
  downloadMenuTemplate
} = require("../controllers/menuController");
```

Add two routes near the existing menu routes:

```js
router.post("/menu/import", verifyToken, isBusinessAdmin, uploadMenuFile, importMenuItemsController);
router.get("/menu/template", verifyToken, isBusinessAdmin, downloadMenuTemplate);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && node tests/menu-import.js`
Expected: `menu-import: all PASS`.

- [ ] **Step 7: Add to the test suite**

In `backend/package.json`, change the `test` script:

```
"test": "node tests/integration-qa.js && node tests/run-voucher-test.js && node tests/multi-tenant-isolation.js && node tests/auth-email-flow.js && node tests/min-bill-amount.js && node tests/menu-import.js",
```

Run: `cd backend && npm test`
Expected: all six suites pass, exit 0.

- [ ] **Step 8: Commit**

```bash
git add backend/services/menuService.js backend/controllers/menuController.js backend/routes/adminRoutes.js backend/tests/menu-import.js backend/package.json backend/package-lock.json
git commit -m "feat(menu): Excel import + template download for admin menu"
```

---

### Task 2: Frontend — import + template UI in Menu Management

**Files:**
- Modify: `frontend/src/routes/admin/MenuManagement.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/menu/import` (multipart, field `file`) → `{ success, imported, skipped }`; `GET /api/admin/menu/template` → `.xlsx` binary (Task 1).
- Consumes: existing `apiRequest` (already passes `FormData` bodies through untouched — see `frontend/src/lib/api.ts:32` and `:69-70` — no changes needed there).

- [ ] **Step 1: Add the import/template block**

In `frontend/src/routes/admin/MenuManagement.tsx`, add near the top (with the other imports):

```tsx
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
```

(`useState` is already imported — merge into the existing `import { useState } from "react";` line so `useRef` joins it: `import { useState, useRef } from "react";`.)

Add `getTenantSlug` to the existing import from `../../lib/api`: change `import { apiRequest } from "../../lib/api";` to `import { apiRequest, getTenantSlug } from "../../lib/api";`.

Inside the `MenuManagement` component, add state and handlers right after the existing `useMenu()` call:

```tsx
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const downloadTemplate = async () => {
    const token = localStorage.getItem("admin_auth_token");
    const slug = getTenantSlug();
    const res = await fetch("/api/admin/menu/template", {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(slug ? { "X-Tenant-Slug": slug } : {}),
      },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu-template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiRequest<{ success: boolean; imported: number; skipped: number }>(
        "/api/admin/menu/import",
        { method: "POST", role: "admin", body: form },
      );
      const suffix = res.skipped ? `, skipped ${res.skipped} row(s)` : "";
      toast.success(`Imported ${res.imported} item(s)${suffix}`);
      invalidate();
    } catch (err) {
      toast.error((err as Error).message || "Import failed.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
```

Add the UI block in the JSX, right after the "Show menu to customers" toggle card and before the "Add an item" card:

```tsx
      {/* Import from Excel */}
      <div className="mb-6 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 text-sm font-bold">Import from Excel</div>
        <p className="mb-3 text-[13px] text-[var(--muted)]">
          Columns: Name (required), Price, Category, Description.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm font-bold"
          >
            <Download className="h-4 w-4" /> Download template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
            className="text-sm"
          />
          {importing && <span className="text-sm text-[var(--muted)]">Importing…</span>}
        </div>
      </div>
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify in the browser**

Start the backend (`cd backend && MONGODB_URI= node server.js`) and the frontend (`cd frontend && npm run dev`). Log in to `/coffesarowar/admin/login` as `barista@mansarowar.cafe` / `password`, go to Menu:
- Click "Download template" — a `menu-template.xlsx` file downloads.
- Open it, add a row or two (or use it as-is), save.
- Select that file via the file input — a toast shows "Imported N item(s)" and the new items appear in the list below without a manual reload.
- Re-select the same file — items are duplicated (append-only, as designed) and can be removed individually via the existing delete button.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/admin/MenuManagement.tsx
git commit -m "feat(admin-fe): Excel menu import + template download UI"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suite green**

Run: `cd backend && npm test`
Expected: all six suites (`integration-qa`, `run-voucher-test`, `multi-tenant-isolation`, `auth-email-flow`, `min-bill-amount`, `menu-import`) PASS, exit 0.

- [ ] **Step 2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end browser walkthrough**

With `npm run dev` running, on tenant `coffesarowar`: download the template, fill in 3-4 rows with varying completeness (one missing a description, one missing a category), upload it, confirm the toast reports the right imported/skipped counts and every valid row appears in the menu list with the correct category fallback (`"General"` where blank).

- [ ] **Step 4: Commit any final fixes, then finish**

```bash
git add -A
git commit -m "chore(menu-import): verification pass fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** `xlsx`+`multer` deps (Task 1), case-insensitive column mapping + Name-required (Task 1), append-only via `MenuItem.create(array)` (Task 1, Global Constraints), skip-and-report counts (Task 1), 5MB/.xlsx-.xls/500-row limits (Task 1), template generation+download (Task 1), admin UI for both actions (Task 2), tenant isolation test (Task 1's test case 6). No gaps against the spec.
- **Resolved both spec-flagged unknowns concretely:** `insertMany` → uses `MenuItem.create(array)` instead (works on both real Mongoose and the mock); `apiRequest` multipart handling → confirmed already correct in `lib/api.ts` (skips JSON content-type and passes `FormData` through untouched), so the import call needs no special-casing — only the binary template *download* needs a raw `fetch` (since `apiRequest` always calls `response.json()`).
- **Type consistency:** `{ imported: number, skipped: number }` is the shape used consistently from `importMenuItems` (Task 1) through the controller response through the frontend's `handleImport` (Task 2).
- **Mock-DB safety:** `MenuItem.create(arrayOfDocs)` — confirmed via Global Constraints that array-form `create` (not `insertMany`) is what the mock supports, matching the pattern already used elsewhere in this codebase (e.g. `stampService.js`'s `StampCard.create([...], { session })`).

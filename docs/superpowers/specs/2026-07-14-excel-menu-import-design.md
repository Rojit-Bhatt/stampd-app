# Epic C1 — Excel Menu Import

**Date:** 2026-07-14
**Status:** Approved design, ready for implementation plan
**Scope:** First of two specs decomposed from the original "Epic C" (Excel menu import + customer menu tab). This spec covers only the admin-side Excel import. The customer-facing menu tab (C2) is a separate, independent spec — pure frontend, consumes the already-existing public `GET /api/menu` endpoint, no overlap with this one.

## Context

Multi-tenant loyalty SaaS ("Stampd"). A business admin manages a display-only menu (`MenuItem` model, tenant-scoped) via `MenuManagement.tsx` — today, items are added one at a time through a manual form (`POST /api/admin/menu`). The ask: let the admin upload an Excel spreadsheet and bulk-add items in one step, instead of typing each one in.

**Explicitly deferred:** visual/UI redesign. This spec covers functional wiring only — the import UI matches the existing plain input/button styling in `MenuManagement.tsx`. Full frontend design work happens in a later pass (per user direction).

## Decisions locked during brainstorming

1. **Parser: `xlsx` (SheetJS community edition).** Pure JS, no native deps, reads `.xlsx`/`.xls`, and can also generate a workbook (needed for the template download) — one library covers both directions.
2. **Upload mechanism: `multer` with `memoryStorage`.** The file buffer is parsed directly in memory and never written to disk — nothing to clean up, works identically in this app's dev (mock DB, no persistent filesystem assumptions) and prod setups.
3. **Column mapping: `Name` (required) / `Price` / `Category` / `Description` (all optional except Name)** — mirrors `MenuItem`'s existing fields exactly (minus `isAvailable`, which always defaults `true` on import, matching the manual add-item form's default). Header row required; column names matched **case-insensitively**.
4. **Import behavior: append only.** Every valid row becomes a new `MenuItem`. Existing items are never deleted or matched/updated — same as how the manual "Add an item" form already behaves (always creates new). Re-importing the same file twice will duplicate items; the admin can delete duplicates via the existing delete button.
5. **Row validation: skip-and-report, not all-or-nothing.** Rows missing `Name` (or entirely blank) are skipped, not imported; every valid row is still imported. The response reports `{ imported, skipped }` counts so one bad row doesn't block the rest of the file.
6. **Upload limits (defense against an untrusted file): 5MB max size, `.xlsx`/`.xls` file type only, 500-row cap.** Rows beyond 500 (after the header) are also counted as skipped, not processed.
7. **Downloadable `.xlsx` template.** A "Download template" action in the admin UI produces a starter file with the correct headers (`Name | Price | Category | Description`) plus one example row, generated in-memory via the same `xlsx` library (no new dependency).

## Data Model

**No schema changes.** Imported rows become ordinary `MenuItem` docs via the existing model (`backend/models/MenuItem.js`) — `organizationId`, `name`, `description`, `price` (string, e.g. `"₹120"`), `category` (defaults `"General"` if the column is blank for a row), `isAvailable: true`, `sortOrder: 0` (same default the manual-add path already uses).

## Backend

### `backend/services/menuService.js` — two new functions

- **`parseMenuWorkbook(buffer)`**
  - Reads the buffer with `xlsx.read(buffer, { type: "buffer" })`, takes the first sheet, converts to an array of row objects via `xlsx.utils.sheet_to_json`.
  - Matches headers case-insensitively to `name` / `price` / `category` / `description` (e.g. a column literally titled `"Name"`, `"NAME"`, or `"name"` all map to the same field).
  - A row is **valid** iff its resolved `name` is a non-empty trimmed string. Invalid/blank rows are dropped and counted.
  - Caps at the first 500 valid rows; any further valid rows beyond that are also dropped and counted as skipped.
  - Returns `{ rows: Array<{ name, price, category, description }>, skipped: number }`. `price`/`category`/`description` default to `""` / `"General"` / `""` respectively when the column is missing/blank for a row (matching `createItem`'s existing defaults).

- **`importMenuItems(organizationId, buffer)`**
  - Calls `parseMenuWorkbook(buffer)`.
  - Bulk-creates one `MenuItem` per valid row via `MenuItem.insertMany` (all rows get `organizationId`, `isAvailable: true`, `sortOrder: 0`).
  - Returns `{ imported: number, skipped: number }`.
  - **Note on the mock DB:** `insertMany` is not in the documented list of mock Mongoose methods (`create`, `find`, `findOne`, `findOneAndUpdate`) — the implementation task must verify it works against the mock or fall back to a loop of individual `MenuItem.create()` calls if `insertMany` isn't supported. Either way the *return contract* (`{ imported, skipped }`) stays the same.

- **`buildMenuTemplate()`**
  - Builds a workbook in-memory via `xlsx.utils.book_new()` / `xlsx.utils.aoa_to_sheet()` with a header row (`Name`, `Price`, `Category`, `Description`) and one example row (e.g. `Cappuccino`, `₹150`, `Coffee`, `Rich and creamy espresso with steamed milk`).
  - Returns a `Buffer` via `xlsx.write(workbook, { type: "buffer", bookType: "xlsx" })` — nothing persisted to disk.

### Routes/controller

- **`POST /api/admin/menu/import`** (`verifyToken`, `isBusinessAdmin`, then a `multer` middleware configured with `storage: multer.memoryStorage()`, `limits: { fileSize: 5 * 1024 * 1024 }`, and a `fileFilter` rejecting anything whose mimetype isn't one of the standard `.xlsx`/`.xls` MIME types) → controller calls `importMenuItems(req.user.organizationId, req.file.buffer)`, responds `200 { success: true, imported, skipped }`. If no file is attached, `400` "An Excel file is required." Multer's own size/type rejections are surfaced through the existing centralized error-handling middleware (they arrive as errors with a `statusCode`-compatible shape, or are normalized to 400 in the controller/error handler — the implementation task confirms which and handles it explicitly, not silently).
- **`GET /api/admin/menu/template`** (`verifyToken`, `isBusinessAdmin`) → controller calls `buildMenuTemplate()`, sets `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="menu-template.xlsx"`, sends the buffer.

Both routes added to `backend/routes/adminRoutes.js` alongside the existing `/menu` routes.

## Frontend

### `frontend/src/routes/admin/MenuManagement.tsx`

New block inserted between the "Show menu to customers" toggle and the existing "Add an item" card:

- A "Download template" link/button — plain `<a>` pointing at the template endpoint (through `apiRequest`'s base URL + auth, since it's an authed route) or a click handler that fetches the endpoint and triggers a browser download via a Blob + temporary `<a download>`.
- A file picker (`<input type="file" accept=".xlsx,.xls">`) + "Import" button.
- On Import: builds a `FormData` with the selected file, `POST`s to `/api/admin/menu/import` (note: this call does **not** go through `apiRequest`'s default `Content-Type: application/json` — it needs `FormData`'s own multipart boundary, so the implementation task must confirm `apiRequest` supports omitting/overriding the JSON content-type, or issue this one call with a raw `fetch` carrying the same auth header pattern).
- On success: toast `Imported {imported} item(s)${skipped ? \`, skipped ${skipped} row(s)\` : ""}`; invalidates the `["adminMenu"]` query so the list refreshes immediately (same invalidation pattern the existing mutations already use).
- Plain text near the file picker states the expected columns: "Columns: Name (required), Price, Category, Description." No new visual design — reuses the existing card/input/button classes already in this file.

## New Dependencies (approved)

- Backend: **`xlsx`** (parse + generate), **`multer`** (multipart upload handling).

## Testing / Verification

1. **Backend**, self-contained via `tests/helpers/bootServer.js`, following the established pattern (`tests/min-bill-amount.js`, `tests/auth-email-flow.js`):
   - Build a small `.xlsx` buffer in-process (via `xlsx.utils.aoa_to_sheet` + `xlsx.write`) with: 2 valid rows (one with all four columns, one with only Name), 1 row missing Name, 1 entirely blank row.
   - `POST /api/admin/menu/import` as multipart form data with that buffer → `200`, `{ imported: 2, skipped: 2 }`.
   - Confirm the 2 items now appear in `GET /api/admin/menu` for that tenant, `isAvailable: true` on both.
   - Wrong file type (e.g. a `.txt` buffer) → `400`.
   - No file attached → `400`.
   - `GET /api/admin/menu/template` → `200`, response parses back via `xlsx.read` into a sheet with header row `["Name", "Price", "Category", "Description"]`.
   - Tenant isolation: importing into tenant A does not create items visible to tenant B (mirrors the existing per-tenant menu scoping already implicit in `listForOrg`).
2. **Frontend:** `npx tsc --noEmit` clean.
3. **Browser**, tenant `coffesarowar`: download the template, fill in a couple of rows, upload it back through the admin Menu screen, confirm the toast shows correct counts and the items appear in the list without a page reload.

## Out of scope

C2 (customer menu tab) is unaffected. Visual/UI redesign of the admin menu screen is explicitly deferred to a later pass. Upsert-by-name and replace-entire-menu import modes are not built (decision 4).

# Redemption Table: Clickable Customer Name — Spec & Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every customer name in the Redemption history table (Redeem report page) a clickable link to that customer's detail page, and prove it can never silently break again with a regression test.

**Architecture:** The frontend (`frontend/src/routes/admin/AdminReportsRedeems.tsx`) already renders a `<Link>` to `admin/customers/:id` whenever the row carries a `customerId`. The backend redeem-report row builder (`getRedeemStats` in `backend/services/reportService.js`) resolves the customer name via `t.userId` but never copies the id into the row, so the frontend falls back to plain text. Fix: emit `customerId: t.userId.toString()` on every redeem row. The `userId` field is a required, scoped field (every redeem transaction is owned by a user), so this is always a real, valid, same-outlet customer id — no null/undefined edge case exists in current data.

**Tech Stack:** Node.js/Express backend, Mongoose, React frontend, Node backend test suites (node --test style runners), GitHub Actions CI.

## Spec (agreed behavior)

1. `GET /api/admin/reports/redeem` must return each row in `rows[]` with a `customerId` string equal to the owning customer's User id (hex ObjectId) — every row, never `null`, never missing, never a different outlet's id.
2. `GET /api/admin/reports/redeem/download` (the Excel export) must keep its existing 5-column layout unchanged (`When`, `Customer`, `Item / Reward`, `Points Redeemed`, `Value (Rs)`) — the fix is JSON-only, the download must not regress.
3. On the Redeem report page, every redemption row with a known customer shows the name as a blue underline link to that customer's detail page; rows with no customer (staff-attributed, e.g., "Unknown") stay plain text exactly as today.
4. A regression test must assert the redeem report JSON row carries `customerId` for customer-owned redemptions — and a second assertion must confirm the Excel download's 5 columns stay intact so nobody later adds a "CustomerId" column to the export.

**Out of scope:** backfilling the Value (Rs) column (separate data/configuration matter), any changes to other report pages, any database writes.

## File map

| File | Action | Responsibility |
|---|---|---|
| `backend/services/reportService.js` (line ~351–359) | Modify | Add `customerId: t.userId.toString()` to each row in `getRedeemStats` |
| `backend/tests/backfill-redeem-values.js` (lines 147–180) | Modify | Regression: assert `customerId` on a known customer's redeem row in the JSON report, and assert the Excel export still has exactly 5 columns |

## Global constraints (from project instructions)

- No production database writes; this fix touches reporting code only.
- Run `node` on `backend/tests/*.js` locally before pushing; CI must be green.
- Never commit secrets. CI runs on every push to main (lockfile check, frontend build, backend tests, live smoke test).
- Commit messages follow the repo's conventional style (`feat:`/`fix:`/`docs:`).

---

### Task 1: Regression test for `customerId` in redeem report rows

**Files:**
- Modify: `backend/tests/backfill-redeem-values.js:147-180`

**Interfaces:**
- Consumes: existing test boot (server + mock DB + seeded redeem rows from `/__test__/seed-backfill-rows`), `GET /api/admin/reports/redeem` JSON response with `rows[]`.
- Produces: two new assertions inside the existing redeem-report check section.

- [ ] **Step 1: Add the failing assertions**

Inside the existing redeem-report check block (where `report.body.rows` is already inspected), add:

```js
const knownRow = report.body.rows.find((row) => row.customer === expectedCustomerName);
check(
  "the redeem report row carries the owning customer's id",
  typeof knownRow?.customerId === "string" && knownRow.customerId.length === 24,
  knownRow,
);
```

and in the Excel download check that follows (where the workbook is parsed with the existing `parseXlsx` helper):

```js
check(
  "the redeem export keeps exactly the 5 documented columns (no CustomerId column)",
  Array.isArray(headerRow) && headerRow.length === 5 && headerRow.join("|") === "When|Customer|Item / Reward|Points Redeemed|Value (Rs)",
  headerRow,
);
```

`expectedCustomerName` is the customer name the existing test already knows (the verified customer created earlier in the suite — reuse the same literal string used by that test's existing assertions, not a helper that recomputes it).

- [ ] **Step 2: Run the suite and confirm RED**

```bash
cd backend && node tests/backfill-redeem-values.js
```

Expected: suite runs, the `customerId` assertion FAILS (row has no such field → `undefined` fails the `typeof === "string"` check). Confirm the failure is the expected missing-field reason, not a boot or network error.

### Task 2: Minimal implementation — emit `customerId` in report rows

**Files:**
- Modify: `backend/services/reportService.js:351-359`

**Interfaces:**
- Consumes: existing `txns` array (PointsTransaction docs with required `userId`), existing `escapeFormula`/`toPoints` helpers.
- Produces: the same row shape plus `customerId` — no other field changes, export path (`buildRedeemsWorkbook`) untouched.

- [ ] **Step 3: Add the field**

Change the row mapping inside `getRedeemStats` from:

```js
const rows = txns
  .map((t) => ({
    date: new Date(t.createdAt).toISOString().slice(0, 16).replace("T", " "),
    customer: escapeFormula(nameById.get(t.userId.toString()) || t.performedByName || "Unknown"),
    item: escapeFormula(t.rewardName || ""),
    points: toPoints(-t.pointsCenti),
    value: t.rewardValueNpr ?? null
  }))
```

to:

```js
const rows = txns
  .map((t) => ({
    date: new Date(t.createdAt).toISOString().slice(0, 16).replace("T", " "),
    customer: escapeFormula(nameById.get(t.userId.toString()) || t.performedByName || "Unknown"),
    customerId: t.userId.toString(),
    item: escapeFormula(t.rewardName || ""),
    points: toPoints(-t.pointsCenti),
    value: t.rewardValueNpr ?? null
  }))
```

(`userId` is schema-required on every redeem row, so `.toString()` is safe here; the `nameById.get()` lookup above it uses the identical expression, so both stay consistent.)

- [ ] **Step 4: Run the suite and confirm GREEN**

```bash
cd backend && node tests/backfill-redeem-values.js
```

Expected: all checks pass, including the two new ones.

### Task 3: Full regression sweep + commit

**Files:**
- Modify: (none — existing `AdminReportsRedeems.tsx` already consumes `customerId` correctly)

- [ ] **Step 5: Run the full backend test suite**

```bash
cd backend && node --test tests/*.js   # or the repo's documented test command
```

Expected: every suite passes, pristine output, no warnings. Verify the Excel export suite (`business-reports` etc.) still passes since `buildRedeemsWorkbook` was not touched.

- [ ] **Step 6: Verify the frontend consumes the new field**

Read `frontend/src/routes/admin/AdminReportsRedeems.tsx:194-216` — confirm `{r.customerId ? <Link ...> : <span>...</span>}` renders the link when `customerId` is a non-empty string. No frontend change needed; this is a read-verification, not an edit.

- [ ] **Step 7: Commit**

```bash
git add backend/services/reportService.js backend/tests/backfill-redeem-values.js
git commit -m "fix(reports): include customerId in redeem report rows so the history table links to customers
The frontend's redeem-history table already renders customer names as links when the API row carries a customerId, but getRedeemStats never emitted one. A regression test asserts the field on a known customer row and that the Excel export keeps its documented 5-column layout."
```

### Task 4: Push, CI, and live verification

- [ ] **Step 8: Push to main and watch CI**

```bash
git push
```

CI (lockfile check, frontend build, backend suite, live smoke test) must go green. If CI fails, stop and diagnose — no work is considered done while CI is failing.

- [ ] **Step 9: Verify live** — hit the Redeem report page on the live site (admin view); the reporter confirms in their browser whether names are now linked.

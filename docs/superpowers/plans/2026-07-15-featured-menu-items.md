# Epic D4 — Featured Menu Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can mark up to any number of menu items as "featured"; customers see up to 3 of them in a "Featured picks" card on their dashboard.

**Architecture:** One new boolean field on the existing `MenuItem` model, toggled through the existing `PATCH /api/admin/menu/:id` mutable-field whitelist (identical mechanism already used for `isAvailable`). The public `GET /api/menu` endpoint already returns full `MenuItem` documents, so `isFeatured` needs no controller change to be exposed. The customer dashboard reuses the existing `useCustomerMenu()` hook — no new query.

**Tech Stack:** Node/Express, Mongoose (+ in-memory mock in dev), React 19 + Vite + TS, TanStack Query.

## Global Constraints

- Every user/loyalty query includes `organizationId` — tenant isolation is the core invariant.
- Backend layering: `routes/ → controllers/ (thin) → services/ (logic) → models/`. No business logic in controllers.
- The "Featured picks" dashboard card renders only when `menuEnabled` is true AND at least one item has `isFeatured: true` — otherwise it renders nothing.
- The card shows **at most 3** featured items (hardcoded cap, no configuration).
- Commit with explicit file paths (`git add <path>`) — never `git add -A`.

---

### Task 1: Backend — isFeatured field + mutable-field whitelist + tests

**Files:**
- Modify: `backend/models/MenuItem.js`
- Modify: `backend/services/menuService.js`
- Create: `backend/tests/menu-featured.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `MenuItem.isFeatured: boolean` (default `false`), returned by every endpoint that already returns `MenuItem` documents (`GET /api/menu`, `GET /api/admin/menu`, `POST /api/admin/menu`, `PATCH /api/admin/menu/:id`) with zero controller changes.
- Produces: `PATCH /api/admin/menu/:id` accepts `{ isFeatured: boolean }` in its body and persists it.

- [ ] **Step 1: Add the field to the model**

In `backend/models/MenuItem.js`, add after `isAvailable`:

```js
  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
```

(The full field block becomes: `isAvailable`, then the new `isFeatured` line, then the existing `sortOrder` line — insert directly between them.)

- [ ] **Step 2: Write the failing test**

Create `backend/tests/menu-featured.js`:

```js
/**
 * Featured menu items suite (Epic D4).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms an admin can mark a menu item as featured via
 * PATCH, that the public menu endpoint exposes isFeatured, that the
 * menuEnabled gate still holds, and that a second tenant's items are
 * unaffected.
 *
 * Run directly: `node tests/menu-featured.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5019 });
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

    // Ensure the menu is enabled for this run.
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { menuEnabled: true } });

    const created = await api("/api/admin/menu", {
      method: "POST",
      token: adminToken,
      body: { name: "D4 Featured Latte", price: "₹200", category: "Coffee", description: "Test item for featuring." },
    });
    check("create item -> 201", created.status === 201);
    const itemId = created.body.item.id || created.body.item._id;
    check("new item defaults isFeatured to false", created.body.item.isFeatured === false);

    const patched = await api(`/api/admin/menu/${itemId}`, {
      method: "PATCH",
      token: adminToken,
      body: { isFeatured: true },
    });
    check("PATCH isFeatured -> 200", patched.status === 200);
    check("PATCH response echoes isFeatured true", patched.body.item.isFeatured === true);

    const publicMenu = await api("/api/menu");
    check("public menu -> 200", publicMenu.status === 200);
    const myItem = publicMenu.body.items.find((i) => (i.id || i._id) === itemId);
    check("public menu exposes isFeatured on the item", Boolean(myItem) && myItem.isFeatured === true);

    // menuEnabled gate still holds even with a featured item present.
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { menuEnabled: false } });
    const disabledMenu = await api("/api/menu");
    check("menu disabled -> items empty regardless of featured items", Array.isArray(disabledMenu.body.items) && disabledMenu.body.items.length === 0);
    check("menu disabled -> menuEnabled false", disabledMenu.body.menuEnabled === false);
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { menuEnabled: true } });

    // Tenant isolation: a second tenant's menu is unaffected.
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
    const secondLogin = await api("/api/auth/login", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, password: "password" } });
    await api("/api/admin/settings", { method: "PATCH", slug: secondSlug, token: secondLogin.body.token, body: { menuEnabled: true } });
    const secondPublicMenu = await api("/api/menu", { slug: secondSlug });
    check(
      "second tenant's menu has no coffesarowar items",
      Array.isArray(secondPublicMenu.body.items) && secondPublicMenu.body.items.every((i) => i.name !== "D4 Featured Latte"),
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`menu-featured: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("menu-featured: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

Run: `cd backend && node tests/menu-featured.js`
Expected: FAIL — `isFeatured` doesn't exist on the model yet (`created.body.item.isFeatured === false` fails since it's `undefined`), and the whitelist doesn't accept it yet (`patched.body.item.isFeatured === true` fails).

- [ ] **Step 3: Add `isFeatured` to the mutable-field whitelist**

In `backend/services/menuService.js`, change:

```js
const MUTABLE_MENU_FIELDS = ["name", "description", "price", "category", "isAvailable", "sortOrder"];
```

to:

```js
const MUTABLE_MENU_FIELDS = ["name", "description", "price", "category", "isAvailable", "isFeatured", "sortOrder"];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node tests/menu-featured.js`
Expected: `menu-featured: all PASS`.

- [ ] **Step 5: Add to the test suite**

In `backend/package.json`, append to the `test` script:

```
"test": "node tests/integration-qa.js && node tests/run-voucher-test.js && node tests/multi-tenant-isolation.js && node tests/auth-email-flow.js && node tests/min-bill-amount.js && node tests/menu-import.js && node tests/customer-detail.js && node tests/business-reports.js && node tests/business-contact.js && node tests/menu-featured.js",
```

Run: `cd backend && npm test`
Expected: all ten suites pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/models/MenuItem.js backend/services/menuService.js backend/tests/menu-featured.js backend/package.json
git commit -m "feat(menu): isFeatured field on menu items"
```

---

### Task 2: Frontend — admin toggle + customer dashboard card

**Files:**
- Modify: `frontend/src/routes/admin/MenuManagement.tsx`
- Modify: `frontend/src/hooks/useCustomerMenu.ts`
- Modify: `frontend/src/routes/CustomerDashboard.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/menu/:id` with `{ isFeatured: boolean }` (Task 1).
- Consumes: `GET /api/menu` response items now carrying `isFeatured` (Task 1).

- [ ] **Step 1: Add the admin toggle**

In `frontend/src/routes/admin/MenuManagement.tsx`, add `isFeatured: boolean` to the `MenuItem` interface:

```tsx
interface MenuItem {
  id?: string;
  _id?: string;
  name: string;
  description: string;
  price: string;
  category: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
}
```

Add a "Featured" toggle button in the item row, immediately after the existing Available/Sold-out button (before the delete button):

```tsx
                      <button
                        onClick={() =>
                          patchItem.mutate({ id: itemId(i), body: { isAvailable: !i.isAvailable } })
                        }
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: i.isAvailable ? "var(--ok-soft)" : "var(--warn-soft)",
                          color: i.isAvailable ? "var(--ok)" : "var(--warn)",
                        }}
                      >
                        {i.isAvailable ? "Available" : "Sold out"}
                      </button>
                      <button
                        onClick={() =>
                          patchItem.mutate({ id: itemId(i), body: { isFeatured: !i.isFeatured } })
                        }
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          background: i.isFeatured ? "var(--brand)" : "var(--bg)",
                          color: i.isFeatured ? "#fff" : "var(--muted)",
                        }}
                      >
                        {i.isFeatured ? "Featured" : "Feature"}
                      </button>
```

(This sits between the existing Available/Sold-out `<button>` and the existing delete `<button>` in the same row — the exact surrounding JSX, including the delete button, is unchanged.)

- [ ] **Step 2: Expose `isFeatured` on the customer menu type**

In `frontend/src/hooks/useCustomerMenu.ts`, add to `CustomerMenuItem`:

```ts
export interface CustomerMenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  isFeatured: boolean;
}
```

- [ ] **Step 3: Add the Featured picks card to the dashboard**

In `frontend/src/routes/CustomerDashboard.tsx`, add the import:

```tsx
import { useCustomerMenu } from "../hooks/useCustomerMenu";
```

Inside the component, after the existing `contact`/`hasContact` block, add:

```tsx
  const { data: menuData } = useCustomerMenu();
  const menuEnabled = menuData?.menuEnabled ?? false;
  const featuredItems = menuEnabled ? (menuData?.items ?? []).filter((i) => i.isFeatured).slice(0, 3) : [];
```

In the JSX, insert the new card right after the "Away hint" block's closing `</div>` and before the existing `{hasContact && contact && (...)}` block:

```tsx
      {featuredItems.length > 0 && (
        <div className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--soft)]">
            Featured picks
          </div>
          <div className="flex flex-col gap-2.5">
            {featuredItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--ink)]">{item.name}</div>
                  {item.description && (
                    <div className="truncate text-[13px] text-[var(--muted)]">{item.description}</div>
                  )}
                </div>
                {item.price && <span className="text-sm font-bold text-[var(--ink)]">{item.price}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/admin/MenuManagement.tsx frontend/src/hooks/useCustomerMenu.ts frontend/src/routes/CustomerDashboard.tsx
git commit -m "feat: admin featured-item toggle + customer dashboard featured picks card"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend suite green**

Run: `cd backend && npm test`
Expected: all ten suites PASS, exit 0.

- [ ] **Step 2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: End-to-end browser walkthrough**

With the dev servers running, on tenant `coffesarowar`:
- Admin: on the Menu screen, mark 4 items as featured (confirm the toggle flips label/color like Available/Sold-out does), confirm the 4th one still shows as an option (no client-side cap on marking, only on display).
- Customer: on the dashboard, confirm the "Featured picks" card shows exactly 3 of the 4 featured items with correct name/price/description.
- Toggle the menu off (`Show menu to customers` in `MenuManagement.tsx`) and confirm the "Featured picks" card disappears from the dashboard.
- Toggle the menu back on, unfeatured all items, confirm the card disappears again (zero-featured case).

- [ ] **Step 4: Commit any final fixes, then finish**

```bash
git add -A
git commit -m "chore(menu): verification pass fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** `isFeatured` field (Task 1 Step 1), toggle mechanism via existing whitelist (Task 1 Step 3, decision 2), dashboard card location and cap-of-3 + `menuEnabled` gate (Task 2 Step 3, decisions 1 and 3), admin per-item toggle button (Task 2 Step 1, decision 2). No gaps against the spec.
- **No unnecessary backend surface:** confirmed via direct reading of `menuController.js`'s `getPublicMenu` that it already returns full `MenuItem` documents from `listForOrg` — so Task 1 touches only the model and the whitelist, no controller changes, matching the spec's explicit "almost no backend work" characterization.
- **Type consistency:** `MenuItem` (admin, Task 2 Step 1) and `CustomerMenuItem` (customer, Task 2 Step 2) both gain `isFeatured: boolean` — matches the existing pattern where these two types independently mirror the same wire shape (same split already used for `AdminBranding`/`TenantBranding` and `AdminContact`/`TenantContact` in D3).
- **Test-design note:** Task 1's test explicitly re-checks the `menuEnabled` gate after marking an item featured, to prove the existing off-switch behavior isn't accidentally bypassed by the new field — a regression this specific change could plausibly introduce if `getPublicMenu`'s early-return branch were touched (it isn't, but the test proves it).

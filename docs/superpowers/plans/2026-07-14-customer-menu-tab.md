# Epic C2 — Customer Menu Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers can browse the tenant's display-only menu from a new Menu tab in the app's bottom nav, with distinct empty states for "no menu" vs. "menu enabled but empty."

**Architecture:** Pure frontend. A new read-only hook (`useCustomerMenu`) calls the already-existing public `GET /api/menu` endpoint; a new screen (`CustomerMenu.tsx`) renders loading/empty/populated states and groups items by category; the bottom nav and customer layout get a third tab wired in alongside the existing Card/Wallet tabs. No backend changes.

**Tech Stack:** React 19 + Vite + TS, TanStack Query, react-router-dom, lucide-react.

## Global Constraints

- No backend changes — this consumes the existing, already-tested public `GET /api/menu` endpoint (`backend/routes/menuRoutes.js` → `getPublicMenu`) unmodified.
- Nav order: Card → Menu → [Scan FAB] → Wallet (Menu sits between Card and the center scan button).
- Two distinct empty-state messages, not one generic one: `menuEnabled: false` → "This business hasn't added a menu yet."; `menuEnabled: true` with zero items → "Menu coming soon."
- Items grouped by `category` (same pattern already used in `frontend/src/routes/admin/MenuManagement.tsx`).
- The Menu tab lives inside the existing `CustomerLayout` (authenticated-customer gate, phone-shell wrapper) — not a public screen.
- No visual/UI redesign — match the existing styling conventions already in `CustomerDashboard.tsx`/`CustomerWallet.tsx` (loading spinner, empty-state block layout, `--brand`/`--muted`/`--soft`/`--line` CSS variables, `font-display` headings).
- Commit with explicit file paths (`git add <path>`) — never `git add -A`.

---

### Task 1: Menu hook + customer screen

**Files:**
- Create: `frontend/src/hooks/useCustomerMenu.ts`
- Create: `frontend/src/routes/CustomerMenu.tsx`

**Interfaces:**
- Produces: `useCustomerMenu(): UseQueryResult<{ menuEnabled: boolean; items: CustomerMenuItem[] }>` where `CustomerMenuItem = { id: string; name: string; description: string; price: string; category: string }`.
- Produces: `CustomerMenu` default export — a content-only component (no its own shell) meant to render inside `CustomerLayout`'s `<Outlet />`, matching `CustomerDashboard`/`CustomerWallet`'s existing pattern.

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useCustomerMenu.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface CustomerMenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
}

export function useCustomerMenu() {
  return useQuery<{ menuEnabled: boolean; items: CustomerMenuItem[] }>({
    queryKey: ["customerMenu"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; menuEnabled: boolean; items: CustomerMenuItem[] }>(
        "/api/menu",
      );
      return { menuEnabled: res.menuEnabled, items: res.items || [] };
    },
    staleTime: 1000 * 30,
  });
}
```

- [ ] **Step 2: Create the screen**

Create `frontend/src/routes/CustomerMenu.tsx`:

```tsx
import { UtensilsCrossed } from "lucide-react";
import { useCustomerMenu } from "../hooks/useCustomerMenu";
import { useTenant } from "../context/TenantContext";

// Rendered inside CustomerLayout (phone shell + bottom nav). Content only.
export default function CustomerMenu() {
  const { tenant } = useTenant();
  const { data, isLoading } = useCustomerMenu();

  const menuEnabled = data?.menuEnabled ?? false;
  const items = data?.items ?? [];
  const categories = Array.from(new Set(items.map((i) => i.category || "General")));

  return (
    <div className="px-5 py-6">
      <h1 className="font-display text-2xl font-extrabold text-[var(--ink)]">Menu</h1>
      <p className="mb-5 text-[13px] text-[var(--muted)]">{tenant?.name}</p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
        </div>
      ) : !menuEnabled ? (
        <EmptyState message="This business hasn't added a menu yet." />
      ) : items.length === 0 ? (
        <EmptyState message="Menu coming soon." />
      ) : (
        <div className="flex flex-col gap-6">
          {categories.map((cat) => (
            <div key={cat}>
              <h3 className="mb-2.5 font-display text-base font-bold" style={{ color: "var(--brand)" }}>
                {cat}
              </h3>
              <div className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--surface)]">
                {items
                  .filter((i) => (i.category || "General") === cat)
                  .map((i) => (
                    <div
                      key={i.id}
                      className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--ink)]">{i.name}</div>
                        {i.description && (
                          <div className="truncate text-[13px] text-[var(--muted)]">{i.description}</div>
                        )}
                      </div>
                      {i.price && <span className="text-sm font-bold text-[var(--ink)]">{i.price}</span>}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-[var(--line)] bg-[var(--bg)]">
        <UtensilsCrossed className="h-7 w-7 text-[var(--soft)]" />
      </div>
      <p className="mx-auto max-w-[240px] text-sm font-bold text-[var(--ink)]">{message}</p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useCustomerMenu.ts frontend/src/routes/CustomerMenu.tsx
git commit -m "feat(customer-fe): menu hook + screen with distinct empty states"
```

---

### Task 2: Nav wiring + route + verification

**Files:**
- Modify: `frontend/src/components/customer/BottomNav.tsx`
- Modify: `frontend/src/components/customer/CustomerLayout.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `CustomerMenu` (Task 1, default export from `../routes/CustomerMenu`).

- [ ] **Step 1: Widen BottomNav and add the Menu link**

In `frontend/src/components/customer/BottomNav.tsx`, change the props interface:

```tsx
interface BottomNavProps {
  slug: string;
  activeTab: "dashboard" | "wallet" | "menu" | "none";
  onScanClick: () => void;
}
```

Add `UtensilsCrossed` to the existing lucide-react import: change `import { Coffee, QrCode, Ticket } from "lucide-react";` to `import { Coffee, QrCode, Ticket, UtensilsCrossed } from "lucide-react";`.

Insert a new link between the existing Card `<Link>` and the "Center scan FAB" `<div>` (i.e. right after the Card link's closing `</Link>`, before `{/* Center scan FAB */}`):

```tsx
        <Link
          to={`/${slug}/menu`}
          className={`flex min-h-[44px] flex-col items-center justify-center gap-1 p-2 transition-colors ${
            activeTab === "menu"
              ? "text-[var(--brand)]"
              : "text-[var(--soft)] hover:text-[var(--brand)]"
          }`}
          aria-label="Menu"
        >
          <UtensilsCrossed className="h-5 w-5" strokeWidth={activeTab === "menu" ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Menu</span>
        </Link>
```

- [ ] **Step 2: Add the /menu branch to CustomerLayout's activeTab derivation**

In `frontend/src/components/customer/CustomerLayout.tsx`, change:

```tsx
  const activeTab = location.pathname.endsWith("/wallet")
    ? "wallet"
    : location.pathname.endsWith("/dashboard")
      ? "dashboard"
      : "none";
```

to:

```tsx
  const activeTab = location.pathname.endsWith("/wallet")
    ? "wallet"
    : location.pathname.endsWith("/dashboard")
      ? "dashboard"
      : location.pathname.endsWith("/menu")
        ? "menu"
        : "none";
```

- [ ] **Step 3: Add the route**

In `frontend/src/App.tsx`, add the lazy import alongside the existing customer route imports:

```tsx
const CustomerMenu = lazy(() => import('./routes/CustomerMenu'));
```

Add the route inside the existing `<Route element={<CustomerLayout />}>` block:

```tsx
                    <Route element={<CustomerLayout />}>
                      <Route path="dashboard" element={<CustomerDashboard />} />
                      <Route path="wallet" element={<CustomerWallet />} />
                      <Route path="menu" element={<CustomerMenu />} />
                    </Route>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Browser verification — all three states**

Start the backend (`cd backend && MONGODB_URI= node server.js`) and the frontend (`cd frontend && npm run dev`). Log in as the seeded customer (`customer@mansarowar.cafe` / `password`) at `/coffesarowar/login`.

- Confirm bottom nav shows Card, Menu, [Scan FAB], Wallet in that order.
- With the tenant's default `menuEnabled: false`: navigate to `/coffesarowar/menu` — shows "This business hasn't added a menu yet." Menu tab highlights as active.
- Log in as the business admin (`barista@mansarowar.cafe` / `password`, `/coffesarowar/admin/login`), go to Menu Management, toggle "Show menu to customers" on with zero items — log back in as the customer, reload `/coffesarowar/menu` — shows "Menu coming soon."
- As the admin, add or import (reusing the Excel import from Epic C1) at least 2 items across 2 different categories — reload the customer's `/coffesarowar/menu` — items appear grouped under their category headers, correct name/description/price, no interaction controls.
- As the admin, toggle "Show menu to customers" back off (leaves the tenant in its default state).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/customer/BottomNav.tsx frontend/src/components/customer/CustomerLayout.tsx frontend/src/App.tsx
git commit -m "feat(customer-fe): wire Menu tab into bottom nav, layout, and routing"
```

---

## Self-Review Notes

- **Spec coverage:** nav order Card→Menu→[Scan]→Wallet (Task 2 Step 1 — link inserted before the FAB div), two distinct empty-state messages (Task 1 Step 2), category grouping (Task 1 Step 2), authenticated/phone-shell placement (Task 2 — route added inside the existing `CustomerLayout` block, not a public route), no backend changes (confirmed — no `backend/` files touched anywhere in this plan), matches existing styling conventions (Task 1 Step 2 code lifted directly from `CustomerWallet.tsx`'s loading/empty-state pattern and `MenuManagement.tsx`'s category-grouping pattern). No gaps against the spec.
- **Type consistency:** `CustomerMenuItem` (Task 1) fields (`id, name, description, price, category`) are exactly what `CustomerMenu.tsx` (Task 1) destructures and renders; `activeTab`'s `"menu"` value (Task 2 Step 1's prop type) matches the string `CustomerLayout` (Task 2 Step 2) computes and passes down.
- **No backend test additions** — correctly out of scope per the spec (pure frontend consuming an already-tested endpoint); verification is typecheck + browser only, matching this codebase's convention (no frontend unit-test framework exists here — all other frontend tasks in this project were verified the same way).

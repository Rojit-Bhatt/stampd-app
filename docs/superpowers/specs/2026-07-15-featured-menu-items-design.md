# Epic D4 — Featured Menu Items

**Date:** 2026-07-15
**Status:** Approved design, ready for implementation plan
**Scope:** Fourth of five specs decomposed from the original "Epic D" (customer drill-in [D1, merged], Excel reports [D2, merged], contact/maps config [D3, merged], featured menu items [this spec], upcoming events [D5]). This spec covers only marking menu items as featured and showing them on the customer dashboard. D5 (a brand-new "events" subsystem — no `Event` model exists at all) is a separate, independent spec.

## Context

The existing menu (`MenuItem` model, `MenuManagement.tsx` admin screen, `CustomerMenu.tsx` customer screen) is a flat, unranked list. There's no way for a business to highlight a few standout items to customers without them digging through the full menu. The ask: featured/highlighted menu items.

## Decisions locked during brainstorming

1. **Display location:** a "Featured picks" card on the customer dashboard (`CustomerDashboard.tsx`), styled like Epic D3's "Visit us" card — not a section on the Menu screen itself. Higher visibility since every customer sees the dashboard first.
2. **Marking mechanism:** a "Featured" toggle button per item row in `MenuManagement.tsx`, next to the existing Available/Sold-out toggle — same interaction pattern, not a checkbox only available at creation time (so existing items can be (un)featured too).
3. **Cap and gating:** the dashboard card shows at most 3 featured items, and only renders when `menuEnabled` is true (consistent with the menu being a fully toggle-able feature — if the admin has hidden the menu entirely, featured picks stay hidden too) and at least one item is featured.

## Data Model

One new field on `MenuItem`:

```js
isFeatured: { type: Boolean, default: false }
```

No new model, no migration — same pattern as `isAvailable`.

## Backend

**Almost no backend work.** `getPublicMenu` (`backend/controllers/menuController.js`) already returns full `MenuItem` documents via `listForOrg`, so `isFeatured` is present in the response automatically once it's on the schema — no controller change needed there.

The only functional change: `backend/services/menuService.js`'s `MUTABLE_MENU_FIELDS` whitelist (currently `["name", "description", "price", "category", "isAvailable", "sortOrder"]`) gains `"isFeatured"`, so `PATCH /api/admin/menu/:id` can toggle it — identical mechanism already used for `isAvailable`. No new endpoints.

## Frontend

### Admin: `frontend/src/routes/admin/MenuManagement.tsx`

- `MenuItem` interface gains `isFeatured: boolean`.
- Each item row gains a second toggle button next to the existing Available/Sold-out pill: a "Featured" pill, same visual pattern (colored background when on, neutral when off), calling `patchItem.mutate({ id: itemId(i), body: { isFeatured: !i.isFeatured } })`.

### Customer: `frontend/src/hooks/useCustomerMenu.ts` + `frontend/src/routes/CustomerDashboard.tsx`

- `CustomerMenuItem` interface gains `isFeatured: boolean`.
- `CustomerDashboard.tsx` calls the existing `useCustomerMenu()` hook (already used by the Menu tab — no new query) and computes `featuredItems = menuEnabled ? items.filter(i => i.isFeatured).slice(0, 3) : []`.
- If `featuredItems.length > 0`, render a "Featured picks" card (visually mirroring D3's "Visit us" card: same border/background/heading style) listing each item's name, price, and description, placed on the dashboard alongside the existing reward card / away-hint / Visit-us sections.

## Testing / Verification

1. **Backend**, self-contained via `tests/helpers/bootServer.js` (`backend/tests/menu-featured.js`):
   - Create a menu item, `PATCH` it with `{ isFeatured: true }` → `200`, response echoes `isFeatured: true`.
   - `GET /api/menu` (public, `menuEnabled` on) → the item's `isFeatured: true` is present in the response.
   - `GET /api/menu` with `menuEnabled` off → `items: []` regardless of any featured items (existing behavior, unaffected — just confirms the gate still holds with featured data present).
   - Tenant isolation: a second tenant's menu items are unaffected by the first tenant's featured toggling.
2. **Frontend:** `npx tsc --noEmit` clean.
3. **Browser**, tenant `coffesarowar`: mark 1–4 items as featured in the admin Menu screen (confirm the toggle behaves like Available/Sold-out), confirm the customer dashboard's "Featured picks" card shows at most 3 of them with correct name/price/description, confirm the card disappears when the menu is toggled off, confirm it doesn't appear when zero items are featured.

## Out of scope

D5 (upcoming events) is unaffected and remains a separate spec. No featured-items limit configuration (hardcoded cap of 3), no drag-to-reorder of featured items, no separate "Featured" section on the Menu screen itself (per decision 1).

# Implementation plan — Horizontally scrollable data tables on mobile/tablet

**Date:** 2026-08-13 · **Branch:** `feature/table-horizontal-scroll` · **Author:** Manus AI

## Shared building block

Create `frontend/src/components/shared/ScrollableTable.tsx`: a wrapper around a table card.

```tsx
// Props: children (the header + rows), minContentWidth: string (e.g. "640px"),
// stickyFirst: boolean (default true), className override.
```

Structure:

1. Outer card: `overflow-x-auto rounded-[var(--radius-card)] bg-[var(--surface)] shadow-ambient` with `touch-pan-x` semantics (native, nothing extra needed).
2. Scroll-fade hint: a `div` pinned on the right inside the scroll container, ~44 px wide, `background: linear-gradient(to right, transparent, var(--surface))`, pointer-events none, visible only while `scrollLeft + clientWidth < scrollWidth - 4` (class toggled by a `useEffect` scroll listener). Desktop (`md:` and up, or `matchMedia`) → hidden. Gradient uses `var(--surface)` so dark mode reads correctly (the card bg is `--surface`).
3. Inner strip: `min-w-[<minContentWidth>]`. When the viewport is narrower than the min-width, the strip forces overflow and the outer container scrolls; when wider, the strip is inert (min-width is a *minimum*).
4. Sticky first column: rows are flex/grid; give each row's first cell `sticky left-0 z-[1] bg-[var(--surface)]` and the header cell the same. Because rows use `grid` with fixed column tracks, `sticky` inside a grid cell works if the cell spans no more than one column (it does). Caveat: grid `sticky` works only when the cell's column track is bounded — it is, so this works. Add a thin right border (`border-r border-[var(--line)]`) so the pinned column reads as separated. Ensure `z-index` layering: pinned cells above plain cells but below hover overlays (hover uses `hover:bg-[var(--surface-2)]` on the row — since the pinned cell sits inside the row, row-hover still paints it; verify visually).

Usage pattern: wrap each existing table card's inner grid(s) with `<ScrollableTable minContentWidth="640px">…</ScrollableTable>`, removing the card's own `overflow-hidden` (the wrapper owns `overflow-x-auto`).

Why per-table `minContentWidth` instead of one global: grids use different `fr` tracks and paddings (`px-5` vs `px-4`, `gap-4` vs `gap-3`); computing a safe width per table is trivial and avoids over- or under-scrolling.

## Per-page edits

For each page, wrap the table (header row + body rows) in `ScrollableTable` with a measured `minContentWidth`. Keep ALL existing classes on header/rows untouched — only the wrapper changes + sticky classes on first cells.

| File | Wrapper width | First-cell selector |
|---|---|---|
| `routes/admin/MenuManagement.tsx` (the bespoke flex rows around L359–422) | `640px` (measure: name col + price + pts + status + featured + delete ≈ 400 + gaps + padding) | first child `div` inside each row `flex` — add `sticky left-0 z-[1] bg-[var(--surface)]` + right border. Header: there is no header row on Menu — add a thin uppercase header strip matching the other pages for consistency? **Decision: YES** — the menu list currently has no column header (that is part of why admins can't parse it); add a `border-b` header row with columns: ITEM, PRICE, POINTS, STATUS, FEATURED, (delete icon column). |
| `routes/admin/AdminCustomers.tsx` L118–175 | `760px` (6 cols, `gap-4`, `px-5`) | header `<span>` "Customer"; body first `<span>` |
| `routes/admin/AdminTransactions.tsx` L147–210 | `700px` (5 cols, `gap-3`, `px-5`) | header first `<span>`; body first `<span>` |
| `routes/company/CompanyReports.tsx` L78–110 | already has `overflow-x-auto` + `min-w-[650px]`; replace the manual min-width div with `ScrollableTable minContentWidth="650px"` and add sticky first col + fade |
| `routes/platform/Companies.tsx` L221 region | `600px` |
| `routes/platform/CompanyDetail.tsx` L224 | `600px` |
| `routes/platform/Plans.tsx` L206–214 | `700px` |
| `routes/platform/PlatformAuditLog.tsx` L59–81 (fixed px tracks 140/110/1fr/1.5fr → use `560px`) |
| `routes/platform/PlatformTeam.tsx` L72–89 | `600px` |
| `routes/platform/SubscriptionKeys.tsx` L116–137 | `760px` |

Menu skeleton rows (L343–353) get the same treatment so loading state matches.

## Measurements

`minContentWidth` values are provisional; after the first render at desktop width I'll measure each table's actual rendered width with `getBoundingClientRect` and tune so the scroll range is just wide enough to reveal the last column without huge dead space.

## Verification loop

1. TypeScript/lint clean (`npm run lint -w frontend`).
2. Dev server on port 3000; sandbox browser + user's Brave at the exposed preview URL.
3. Desktop (1440): screenshot every affected page before/after — must be visually identical.
4. Mobile (390 px, also 768 px portrait tablet): confirm horizontal scroll, sticky first column, fade hint, full content readable, row actions still work (delete confirm on Menu, row link to customer detail, type buttons).
5. Dark theme on mobile: confirm fade gradient blends into dark surface, pinned column matches row background.
6. Iterate until desktop parity holds and mobile reveals full content.

## Delivery

Single commit (docs + impl), push, PR against `main`, squash merge on user confirmation.

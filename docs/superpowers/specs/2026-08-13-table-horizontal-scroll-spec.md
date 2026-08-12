# Spec — Horizontally scrollable data tables on mobile/tablet

**Date:** 2026-08-13
**Author:** Manus AI
**Branch:** `feature/table-horizontal-scroll`

## Problem

Several data-table pages in the Stampd consoles render multi-column grids that collapse on phone and tablet widths. Columns are squeezed until their text is truncated ("C…" instead of "Cappuccino", "Co…" instead of "Cold coffee"), pill buttons stack or wrap, and the admin cannot read the full content of a row without guessing. The user reported this on the outlet admin's **Menu** configuration page and asked for the same treatment on the **Customers** and **Transactions** tables.

The company console's **Reports** page already solves this with a proven pattern: the table card is `overflow-x-auto` and the grid inside has a `min-w-[650px]` so columns never shrink below their desktop widths — the whole table slides sideways instead of squashing. The task is to standardise on that pattern, add a **sticky first column** so the item/customer name stays visible while scrolling sideways, and add a **subtle scroll hint** so the sideways scrolling is discoverable.

The user also asked for a codebase-wide sweep; the same problem exists on every platform-console table page.

## Scope (confirmed by user)

| Console | Page | Grid | Included |
|---|---|---|---|
| Outlet admin | Menu | 6-col flex row list | Yes |
| Outlet admin | Customers | 6-col grid | Yes |
| Outlet admin | Transactions | 5-col grid | Yes |
| Company console | Reports (outlet summary) | 5-col grid | Yes (already scrollable; add sticky first col + hint for consistency) |
| Platform console | Companies | 4-col grid | Yes |
| Platform console | CompanyDetail (outlets list) | 4-col grid | Yes |
| Platform console | Plans | 5-col grid | Yes |
| Platform console | Audit Log | 4-col grid | Yes |
| Platform console | Team | 4-col grid | Yes |
| Platform console | Subscription Keys | 5-col grid | Yes |

Pages excluded: AdminRewards, AdminCampaigns, AdminEvents, AdminBroadcasts, AdminSubscription, AdminImpact, AdminContact, Branding, PointsProgram, AdminOverview, AdminReportsSummary (the last two use fixed 2-col summary grids that wrap fine on mobile).

## Requirements

1. **Horizontal scroll.** On screens where the table is narrower than its natural width (phones and portrait tablets), the table card becomes horizontally scrollable while columns keep their desktop widths. The same markup must keep the existing desktop appearance untouched (no minimum width applies when the viewport is wide enough).
2. **Sticky first column.** While scrolling sideways, the first data column (Item name / Customer / Outlet / Company / When / Key owner) stays pinned to the left edge, sitting above a subtle divider/shadow, exactly like spreadsheet sticky columns. On desktop (viewport wide enough that nothing overflows) the sticky behaviour stays harmless — no visible change.
3. **Scroll hint.** A right-edge fade gradient (fading surface colour → transparent over ~40 px) appears on the table while scrollable, so the user immediately knows the table slides. The fade stays while overflow exists; it disappears on desktop widths or when the content fits. Implementation must not rely on `overscroll` JS polling of an untrusted source — use CSS `background` on the scroll container combined with a scroll-listener that toggles a class only while `scrollLeft + clientWidth < scrollWidth`. Desktop: no fade, no listener overhead (hide via `md:` class or by not attaching when `matchMedia("(min-width: 768px)")` matches).
4. **No layout shift on desktop.** Desktop rows must render exactly as before: same paddings, same gaps, same header, same hover states.
5. **Dark mode compatibility.** The fade gradient must be expressed against CSS variables so it renders correctly in dark theme (user's consoles run in dark mode).
6. **Accessibility.** Scroll must work with touch drag and also be keyboard-scrollable (native horizontal scroll of a focusable container is keyboard-accessible by default); do not capture pointer events in a way that blocks one-finger scroll.

## Non-goals

- No new components beyond one small shared `ScrollableTable` wrapper (or per-file local usage if simpler) — this is a styling/layout task, not a data model change.
- No column visibility toggles, no column reordering, no row-level redesign.
- No backend changes.

## Acceptance

- On a 390 px-wide viewport (iPhone 14), every listed table shows its full header and full row content, reachable by swiping/scrolling horizontally; the first column stays pinned while scrolling.
- On a 1440 px desktop viewport, each table looks pixel-identical to today.
- Lint/TypeScript clean; existing functionality (row click-throughs, action buttons, links) unchanged.

# Dashboard & Analytics Charts (bklit) — Design

## Goal

Replace the 5 Recharts chart instances in the outlet admin overview and the platform cross-tenant analytics page with bklit's shadcn-registry chart components (`@bklit/line-chart`, `@bklit/bar-chart`, `@bklit/composed-chart`), matching the visual reference at bklit.com/docs/components/{composed-chart,line-chart,bar-chart}. Frontend-only — no backend or API changes, since existing data shapes already fit.

## Scope

| # | File | Panel | Today | Becomes |
|---|---|---|---|---|
| 1 | `frontend/src/routes/admin/AdminOverview.tsx` | Points velocity | Recharts `LineChart` | bklit `LineChart` |
| 2 | `frontend/src/routes/admin/AdminOverview.tsx` | Points activity (earned vs redeemed) | 2 grouped Recharts `Bar`s | bklit `ComposedChart` — 2 bars (earned, redeemed) + a net-points line |
| 3 | `frontend/src/routes/admin/AdminOverview.tsx` | Tier distribution | single Recharts `Bar` | bklit `BarChart` |
| 4 | `frontend/src/routes/platform/PlatformAnalytics.tsx` | Points velocity (cross-tenant) | Recharts `LineChart` | bklit `LineChart` |
| 5 | `frontend/src/routes/platform/PlatformAnalytics.tsx` | Tier distribution (cross-tenant) | single Recharts `Bar` | bklit `BarChart` |

Recharts is removed from `frontend/package.json` once the swap lands — nothing else in the app uses it.

## Installing bklit

The bklit registry (`pnpm dlx shadcn@latest add @bklit/...`) is a free, open shadcn-registry component collection (Visx + D3 + Motion under the hood), confirmed via `npx shadcn@latest view @bklit/line-chart` etc. — not a paid product like the motion.dev/21st.dev references used earlier in this project's redesign.

This repo's `components/ui/` kit was hand-copied, so there's no `components.json` yet. Steps:

1. Create `frontend/components.json` by hand, matching the project's existing conventions:
   - `aliases.components: "@/components"`, `aliases.utils: "@/lib/utils"`
   - `tailwind.css: "src/index.css"`, `tailwind.config: ""` (Tailwind v4, CSS-first, no JS config file)
   - `tsx: true`, `rsc: false`, `iconLibrary: "lucide"`
2. Run non-interactively:
   ```bash
   cd frontend
   npx shadcn@latest add @bklit/line-chart @bklit/bar-chart @bklit/composed-chart -y
   ```
   This resolves and writes the shared chain (`chart-context`, `chart-animation`, `chart-series`, `chart-tooltip`, `grid`, `x-axis`, `y-axis`, `shimmering-text`, `area-chart`, `utils`) under `frontend/src/components/charts/`, and adds npm deps: `@visx/curve`, `@visx/shape`, `@visx/gradient`, `@visx/pattern`, `@visx/scale`, `@visx/responsive`, `@visx/event`, `d3-array` (`motion` is already a dependency).
3. Remove `recharts` from `frontend/package.json` after the last consumer is swapped.

## Theming

bklit's components read chart-specific CSS variables (`--chart-line-primary`, `--chart-grid`, `--chart-1`..`--chart-4`), not Stampd's existing tokens. Rather than introduce a second color system, add direct aliases in `frontend/src/index.css` next to the existing token block:

```css
--chart-grid: var(--line);
--chart-line-primary: var(--primary);
--chart-line-secondary: var(--soft);
```

- Panel 1, 4 (points velocity, single line): `--chart-line-primary` (green, matches today).
- Panel 2 (composed): earned bar = `--primary`, redeemed bar = `--chart-line-secondary`, net line = `--ink` (a third, neutral tone — net isn't itself an "earn" or "redeem" color).
- Panel 3, 5 (tier distribution, single bar series): `--chart-line-primary`.

Tooltips use bklit's custom-renderer prop to render a card styled with the same `--surface`/`--ink`/`--line` tokens every other card in the app uses (`rounded-[var(--radius-card)]`, `border-[var(--line)]`, `bg-[var(--surface)]`) — same look as today's Recharts tooltips, with bklit's animated crosshair/dot behavior driving it instead of Recharts' default.

## Net-points line (panel 2)

Computed client-side from the already-fetched `pointsActivity` array (no API change): for each week, `net = earned - redeemed`. Passed as a third series to `ComposedChart`'s `Line` child alongside the two `Bar` children.

## Per-panel behavior notes

- All 5 panels keep their existing `Panel`/card wrapper, title, and subtitle text unchanged — only the chart body inside swaps.
- `aspectRatio="2 / 1"` (bklit's default) roughly matches the current `height={220}` `ResponsiveContainer` sizing; adjust per-panel if it visually mismatches the fixed-height card grid once rendered.
- Loading state: both pages already gate chart render behind `isLoading || !stats` with a `Skeleton` — bklit's own `status="loading"` shimmer skeleton is not needed since the existing skeleton gate already covers the loading case; charts render only once real data is present.
- Empty state (e.g., a fresh outlet with no `pointsActivity` yet): pass an empty array — bklit's charts render an empty axis grid rather than erroring, matching Recharts' current behavior.

## Testing

- `npm run lint` (tsc --noEmit) in `frontend/` after each file's swap.
- Browser-verify both dashboards with real seeded data:
  - Admin console as `durbarmarg@coffesarowar.com` → Overview tab: points velocity, points activity (composed), tier distribution.
  - Platform console as `admin@stampd.co` → Analytics: points velocity, tier distribution.
- Confirm: charts render, tooltips show correct values on hover, no console errors, responsive at mobile width (resize check), and that the net-points line in panel 2 is mathematically correct against the earned/redeemed bars for at least one visible data point.

## Risks

- bklit's chart components are more complex than Recharts (Visx primitives composed by hand) — if a needed prop/behavior isn't in the docs-preview text already fetched, the actual registry file content (fetched via `npx shadcn@latest view`) is the source of truth, not the docs page prose.
- `components.json` is new to this repo; a wrong alias/path setting would make `shadcn add` write files to the wrong location. Verify with `--dry-run` before the real `add`.

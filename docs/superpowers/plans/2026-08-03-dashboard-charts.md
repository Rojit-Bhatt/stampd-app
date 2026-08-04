# Dashboard & Analytics Charts (bklit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (single-mode inline execution — no subagent dispatch for this plan). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 Recharts chart instances in the outlet admin overview and the platform cross-tenant analytics page with bklit's shadcn-registry chart components (`@bklit/line-chart`, `@bklit/bar-chart`, `@bklit/composed-chart`), then remove the now-unused `recharts` dependency.

**Architecture:** Install bklit's vendored component source under `frontend/src/components/charts/` via the shadcn CLI (a real, free, open registry — confirmed via `npx shadcn@latest view @bklit/...`). Swap each of the 5 chart instances in place, keeping every existing `Panel`/card wrapper, title, subtitle, and data-fetching hook unchanged. No backend or API changes — all 5 panels already receive the data shape the new charts need. Both files (`AdminOverview.tsx`, `PlatformAnalytics.tsx`) import Recharts and bklit under colliding names (`LineChart`, `BarChart`, `XAxis`, `YAxis`), and each file's charts share one import statement — so each file's charts swap in a single atomic task, not one task per chart, to avoid an unused-import / naming-collision state mid-file.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (CSS-first, no JS config), `@visx/*` + `d3-array` + `motion` (bklit's dependencies), TanStack Query (unchanged, already in place).

## Global Constraints

- Frontend-only. No backend/API changes — `pointsVelocity`, `pointsActivity`, `tierDistribution` shapes are unchanged.
- `recharts` is removed from `frontend/package.json` only once no file imports from it (last task).
- Chart colors read Stampd's design tokens where they're generic (grid, primary line); the two fixed earned/redeemed hex colors (`#A8632E` / `#1A6E99`, chosen for chroma/CVD separation — see `AdminOverview.tsx:80-84`) are passed as literal `fill`/`stroke` props unchanged, not rerouted through a new CSS variable.
- Tooltip panels use `--surface`/`--ink`/`--muted` (the same card look every other floating panel in the app uses, e.g. `NotificationBell`'s dropdown) — not bklit's default dark-glass tooltip.
- No dark-mode work: CLAUDE.md confirms dark tokens exist but no toggle ships. Only `:root` chart-token overrides are needed.
- `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters` — every import added in a step must be used by that same step, or `npm run lint` fails.

---

### Task 1: Install the bklit chart registry

**Files:**
- Create: `frontend/components.json`
- Modify: `frontend/package.json` (CLI adds `@visx/curve`, `@visx/shape`, `@visx/gradient`, `@visx/pattern`, `@visx/scale`, `@visx/responsive`, `@visx/event`, `d3-array` — `motion` is already a dependency)
- Create (written by CLI, not by hand): `frontend/src/components/charts/*.tsx`, `frontend/src/components/charts/tooltip/*.tsx` — the full chain (`line-chart`, `bar-chart`, `composed-chart`, `chart-context`, `chart-animation`, `chart-series`, `chart-tooltip`, `grid`, `x-axis`, `y-axis`, `shimmering-text`, `area-chart`, `utils`, and their internal helper files)
- Modify: `frontend/src/index.css` (CLI appends the `chart-context` item's `cssVars` block — `--chart-1`..`--chart-5`, `--chart-line-primary`, `--chart-grid`, `--chart-tooltip-*`, etc. — to `:root` and `.dark`)

**Interfaces:**
- Produces: `LineChart`/`Line` from `@/components/charts/line-chart` (and `@/components/charts/line`), `BarChart`/`Bar` from `@/components/charts/bar-chart` (and `@/components/charts/bar`), `BarXAxis` from `@/components/charts/bar-x-axis`, `BarYAxis` from `@/components/charts/bar-y-axis`, `ComposedChart` from `@/components/charts/composed-chart`, `SeriesBar` from `@/components/charts/series-bar`, `Grid` from `@/components/charts/grid`, `XAxis`/`YAxis` from `@/components/charts/x-axis`/`@/components/charts/y-axis`, `ChartTooltip` + `TooltipRow` type from `@/components/charts/tooltip`. All confirmed real exports via `npx shadcn@latest view @bklit/<name>` — this is the source of truth if any name below doesn't match what actually lands on disk.

- [ ] **Step 1: Write `frontend/components.json`**

This repo's `components/ui/` kit was hand-copied rather than CLI-scaffolded, so there's no `components.json` yet — the `shadcn add` command requires one. Written by hand to match this project's actual conventions (verified: `@/*` alias in `tsconfig.json`/`vite.config.ts`, `cn()` in `src/lib/utils.ts`, Tailwind v4 CSS-first setup with no JS config file, `src/index.css` as the token file, `lucide-react` already the icon library):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

`style` and `baseColor` don't affect bklit's charts (they ship fixed source, not style-variant templates) — they're only here because the schema requires them.

- [ ] **Step 2: Dry-run the install to preview what will be written**

```bash
cd frontend
npx shadcn@latest add @bklit/line-chart @bklit/bar-chart @bklit/composed-chart --dry-run
```

Expected: a file list under `src/components/charts/...` with no errors about missing aliases or an invalid `components.json`. If it errors on alias resolution, fix `components.json` before proceeding — do not run the real install against a broken config.

- [ ] **Step 3: Run the real install**

```bash
npx shadcn@latest add @bklit/line-chart @bklit/bar-chart @bklit/composed-chart -y
```

This writes every file listed in Step 2, merges the `chart-context` item's `cssVars` block into `frontend/src/index.css`, and installs the new npm dependencies listed above into `frontend/package.json`.

- [ ] **Step 4: Verify the install compiles**

```bash
npm run lint
```

Run from `frontend/`. Expected: PASS (no new type errors). The installed files are unused by any of our own code yet, so this only proves the vendored source itself type-checks against this project's TS config.

- [ ] **Step 5: Commit**

```bash
git add frontend/components.json frontend/package.json frontend/package-lock.json frontend/src/components/charts frontend/src/index.css
git commit -m "chore: install bklit chart components"
```

---

### Task 2: Chart theme tokens + shared legend

**Files:**
- Modify: `frontend/src/index.css` (add Stampd overrides for the chart tokens the CLI just installed)
- Create: `frontend/src/components/shared/ChartLegend.tsx`

**Interfaces:**
- Consumes: none (pure presentational).
- Produces: `ChartLegend` component — `export function ChartLegend({ items }: { items: { label: string; color: string }[] })`. Used by Task 3 (the 3-series composed chart needs a legend; the other 4 panels are single-series and don't).

- [ ] **Step 1: Override the chart CSS tokens in `frontend/src/index.css`**

Find the existing `:root { ... }` token block (the one documented in `CLAUDE.md` — `--bg`, `--surface`, `--ink`, `--primary`, etc.) and add, inside that same block, right after the CLI's newly-appended `--chart-*` block from Task 1:

```css
/* Stampd overrides for bklit's chart tokens — keep chart visuals on the same
   design system as the rest of the app instead of bklit's own defaults. */
--chart-line-primary: var(--primary);
--chart-grid: var(--line);
--chart-tooltip-background: var(--surface);
--chart-tooltip-foreground: var(--ink);
--chart-tooltip-muted: var(--muted);
```

Do not touch the `.dark` block — CLAUDE.md confirms dark tokens exist but no toggle ships, so it's out of scope.

- [ ] **Step 2: Create `frontend/src/components/shared/ChartLegend.tsx`**

```tsx
interface ChartLegendItem {
  label: string;
  color: string;
}

export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4">
      {items.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]"
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npm run lint
```

Run from `frontend/`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css frontend/src/components/shared/ChartLegend.tsx
git commit -m "feat: add Stampd chart theming and a shared chart legend"
```

---

### Task 3: AdminOverview — swap all 3 charts to bklit

**Files:**
- Modify: `frontend/src/routes/admin/AdminOverview.tsx:17-28` (imports), add one `useMemo` inside `AdminOverview()`, `:330-427` (all 3 chart panel bodies)

**Interfaces:**
- Consumes: everything Task 1 produced, plus `ChartLegend` (Task 2). Reads `dashboardStats?.pointsVelocity` (`{ date: string; points: number }[]`, `AdminOverview.tsx:68`), `dashboardStats?.pointsActivity` (`{ weekStart: string; earned: number; redeemed: number }[]`, `AdminOverview.tsx:69`), the inline `tierDistribution ? [...] : []` array (unchanged), and the existing `CHART_EARNED_COLOR` / `CHART_REDEEMED_COLOR` consts (`AdminOverview.tsx:83-84`).
- Produces: nothing new for later tasks. This is the only Recharts consumer in this file, so its import line is fully replaced in this same task — no intermediate state where both libraries are partially imported.

All 3 panels move together because they share one import statement, and Recharts/bklit export colliding names (`LineChart`, `BarChart`, `XAxis`, `YAxis`) — a partial swap would leave the file either not compiling (duplicate imports) or referencing the wrong library's component under a shared name.

- [ ] **Step 1: Replace the Recharts import with bklit imports**

Replace `AdminOverview.tsx:17-28`:

```tsx
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
```

with:

```tsx
import { LineChart, Line } from "@/components/charts/line-chart";
import { ComposedChart } from "@/components/charts/composed-chart";
import { SeriesBar } from "@/components/charts/series-bar";
import { BarChart, Bar } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { BarYAxis } from "@/components/charts/bar-y-axis";
import { Grid } from "@/components/charts/grid";
import { XAxis, YAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import { ChartLegend } from "../../components/shared/ChartLegend";
```

If any of these paths don't match what Task 1 actually installed (registry file layout can differ slightly from the `view` preview), fix the import path to match — the installed files under `frontend/src/components/charts/` are the source of truth.

- [ ] **Step 2: Add the net-points derivation**

Inside `export default function AdminOverview()`, after the `dashboardStats` `useQuery` call (it depends on `dashboardStats`) and before the JSX `return`:

```tsx
const pointsActivityWithNet = useMemo(
  () =>
    (dashboardStats?.pointsActivity ?? []).map((row) => ({
      ...row,
      net: row.earned - row.redeemed,
    })),
  [dashboardStats?.pointsActivity],
);
```

`useMemo` is already imported at the top of the file (`AdminOverview.tsx:1`).

- [ ] **Step 3: Replace the "Points velocity" panel body**

Replace `AdminOverview.tsx:332-362` (the `<ResponsiveContainer>...</ResponsiveContainer>` block) with:

```tsx
<LineChart data={dashboardStats?.pointsVelocity ?? []} xDataKey="date">
  <Grid />
  <XAxis />
  <YAxis />
  <Line dataKey="points" stroke="var(--chart-line-primary)" strokeWidth={2} />
  <ChartTooltip
    rows={(point) => [
      { color: "var(--chart-line-primary)", label: "Points", value: point.points as number },
    ]}
  />
</LineChart>
```

`Grid`/`XAxis`/`YAxis` are used with no props — their defaults (horizontal-only dashed grid, 5 evenly-spaced date ticks, large-number-formatted y-axis) already match what the old `CartesianGrid`/`XAxis`/`YAxis` combination was hand-configured to do.

- [ ] **Step 4: Replace the "Points activity" panel**

Replace the whole `<Panel title="Points activity" ...>...</Panel>` block (`AdminOverview.tsx:365-395`) with:

```tsx
<Panel title="Points activity" subtitle="Earned vs. redeemed per week, last 8 weeks.">
  <ChartLegend
    items={[
      { label: "Earned", color: CHART_EARNED_COLOR },
      { label: "Redeemed", color: CHART_REDEEMED_COLOR },
      { label: "Net", color: "var(--ink)" },
    ]}
  />
  <ComposedChart data={pointsActivityWithNet} xDataKey="weekStart">
    <Grid />
    <XAxis />
    <YAxis />
    <SeriesBar dataKey="earned" fill={CHART_EARNED_COLOR} />
    <SeriesBar dataKey="redeemed" fill={CHART_REDEEMED_COLOR} />
    <Line dataKey="net" stroke="var(--ink)" strokeWidth={2} />
    <ChartTooltip
      rows={(point) => [
        { color: CHART_EARNED_COLOR, label: "Earned", value: point.earned as number },
        { color: CHART_REDEEMED_COLOR, label: "Redeemed", value: point.redeemed as number },
        { color: "var(--ink)", label: "Net", value: point.net as number },
      ]}
    />
  </ComposedChart>
</Panel>
```

- [ ] **Step 5: Replace the "Tier distribution" panel body**

Replace `AdminOverview.tsx:399-426` (the `<ResponsiveContainer>...</ResponsiveContainer>` block) with:

```tsx
<BarChart
  data={
    tierDistribution
      ? [
          { label: "Bronze", count: tierDistribution.Bronze },
          { label: "Silver", count: tierDistribution.Silver },
          { label: "Gold", count: tierDistribution.Gold },
          { label: "Platinum", count: tierDistribution.Platinum },
          { label: "Untiered", count: tierDistribution.untiered },
        ]
      : []
  }
  xDataKey="label"
>
  <Grid />
  <BarXAxis />
  <BarYAxis />
  <Bar dataKey="count" fill="var(--chart-line-primary)" />
  <ChartTooltip
    rows={(point) => [
      { color: "var(--chart-line-primary)", label: "Customers", value: point.count as number },
    ]}
  />
</BarChart>
```

The inline data-array construction is unchanged from the current code — only the chart wrapper and its children swap.

- [ ] **Step 6: Verify**

```bash
grep -n "recharts" frontend/src/routes/admin/AdminOverview.tsx
```

Expected: no output.

```bash
npm run lint
```

Run from `frontend/`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/admin/AdminOverview.tsx
git commit -m "feat: swap AdminOverview's 3 charts to bklit, add a net-points line"
```

---

### Task 4: PlatformAnalytics — swap both charts to bklit

**Files:**
- Modify: `frontend/src/routes/platform/PlatformAnalytics.tsx:4` (imports), `:193-235` (both panel bodies)

**Interfaces:**
- Consumes: `LineChart`, `Line`, `BarChart`, `Bar`, `BarXAxis`, `BarYAxis`, `Grid`, `XAxis`, `YAxis`, `ChartTooltip` (all from Task 1). Reads `stats.pointsVelocity` (`{ date: string; points: number }[]`) and `stats.tierDistribution` (`TierDistribution`, already destructured inline — `PlatformAnalytics.tsx:14-19`, `:219-225`).
- Produces: nothing new for later tasks. This is the only Recharts consumer in this file, so its import line is fully removable in this same task.

- [ ] **Step 1: Replace the Recharts import**

Replace `PlatformAnalytics.tsx:4`:

```tsx
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
```

with:

```tsx
import { LineChart, Line } from "@/components/charts/line-chart";
import { BarChart, Bar } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { BarYAxis } from "@/components/charts/bar-y-axis";
import { Grid } from "@/components/charts/grid";
import { XAxis, YAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
```

- [ ] **Step 2: Replace the "Points velocity" panel body**

Replace `PlatformAnalytics.tsx:199-207` (the `<ResponsiveContainer>...</ResponsiveContainer>` block) with:

```tsx
<LineChart data={stats.pointsVelocity} xDataKey="date">
  <Grid />
  <XAxis />
  <YAxis />
  <Line dataKey="points" stroke="var(--chart-line-primary)" strokeWidth={2} />
  <ChartTooltip
    rows={(point) => [
      { color: "var(--chart-line-primary)", label: "Points", value: point.points as number },
    ]}
  />
</LineChart>
```

This drops the `.map((d) => ({ ...d, label: shortDate(d.date) }))` the old Recharts version needed on the `data` prop — bklit's `XAxis` formats the `date` field itself, so the raw `stats.pointsVelocity` array is passed directly. The file-level `shortDate` helper (`PlatformAnalytics.tsx:34`) stays defined (still unused-check-safe, since nothing else in this task removes it) — leave it as-is; it's not this task's job to hunt for other consumers of a shared helper.

- [ ] **Step 3: Replace the "Tier distribution" panel body**

Replace `PlatformAnalytics.tsx:217-233` (the `<ResponsiveContainer>...</ResponsiveContainer>` block) with:

```tsx
<BarChart
  data={[
    { label: "Bronze", count: stats.tierDistribution.Bronze },
    { label: "Silver", count: stats.tierDistribution.Silver },
    { label: "Gold", count: stats.tierDistribution.Gold },
    { label: "Platinum", count: stats.tierDistribution.Platinum },
    { label: "Untiered", count: stats.tierDistribution.untiered },
  ]}
  xDataKey="label"
>
  <Grid />
  <BarXAxis />
  <BarYAxis />
  <Bar dataKey="count" fill="var(--chart-line-primary)" />
  <ChartTooltip
    rows={(point) => [
      { color: "var(--chart-line-primary)", label: "Businesses", value: point.count as number },
    ]}
  />
</BarChart>
```

- [ ] **Step 4: Verify**

```bash
grep -n "recharts" frontend/src/routes/platform/PlatformAnalytics.tsx
```

Expected: no output.

```bash
npm run lint
```

Run from `frontend/`. Expected: PASS. If it fails on `shortDate` being unused, that means nothing else in this file references it — delete the now-dead `const shortDate = ...` line (`PlatformAnalytics.tsx:34`) and its now-unused caller-side leftovers, then re-run.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/platform/PlatformAnalytics.tsx
git commit -m "feat: swap PlatformAnalytics charts to bklit"
```

---

### Task 5: Remove Recharts and do full verification

**Files:**
- Modify: `frontend/package.json` (drop the `recharts` dependency), `frontend/package-lock.json` (regenerated)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — this is the final task.

- [ ] **Step 1: Confirm no file imports Recharts anymore**

```bash
grep -rl "recharts" frontend/src --include="*.tsx" --include="*.ts"
```

Expected: no output. If anything matches, that panel wasn't actually swapped in Task 3 or 4 — go fix it before continuing.

- [ ] **Step 2: Remove the dependency**

```bash
cd frontend
npm uninstall recharts
```

- [ ] **Step 3: Full lint pass**

```bash
npm run lint
```

Run from `frontend/`. Expected: PASS.

- [ ] **Step 4: Browser-verify AdminOverview**

Using the browser tools (`preview_start` against the `npm run dev` config, or an already-running dev server):
1. Log in at `/admin-login` as `durbarmarg@coffesarowar.com` / `password`.
2. On the outlet overview page, confirm all 3 panels render: "Points velocity" (line), "Points activity" (bars + net line + 3-item legend reading "Earned"/"Redeemed"/"Net"), "Tier distribution" (bars).
3. Hover over a data point in each chart — confirm the tooltip shows a `--surface`/`--ink` card (not bklit's dark-glass default) with the correct label/value.
4. Pick one visible week in "Points activity" and confirm the net line's value equals `earned - redeemed` for that week (read both bar heights via hover, then the net line's tooltip value).
5. Check the browser console for errors (`read_console_messages`).
6. Resize to mobile width (`resize_window`) and confirm all 3 charts remain legible (no overflow, no broken layout).

- [ ] **Step 5: Browser-verify PlatformAnalytics**

1. Log in at `/admin-login` as `admin@stampd.co` / `password`.
2. Navigate to the platform analytics page.
3. Confirm both panels render: "Points velocity" (line), "Tier distribution" (bars).
4. Hover to confirm tooltips show correct values with the `--surface`/`--ink` styling.
5. Check the browser console for errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: remove recharts, fully replaced by bklit charts"
```

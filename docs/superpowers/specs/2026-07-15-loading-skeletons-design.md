# Epic E3: Loading Skeletons — Design

## Context

Epic E's remaining items (E3, E4) are being executed autonomously in one pass per explicit user instruction — all scoping decisions were locked via `AskUserQuestion` before starting; no further approval gates until both epics are merged.

Locked decisions:
- **Scope:** every in-page data-loading state, across all 3 apps (customer, business-admin, platform), gets a skeleton. Full-screen auth-gate spinners (`AdminGuard`, layout mount checks in `CustomerLayout`/`PlatformLayout`) stay as spinners — sub-second, a skeleton would just flash.
- **Style:** content-shaped per screen — each skeleton mimics its own real layout (row grid, form fields, stat cards), not one generic shimmer block reused everywhere.

## Inventory (grep-verified against current code)

**Excluded (button/action-pending states, not data-fetch loading):** `AdminLogin.tsx`, `PlatformLogin.tsx` (`toast.loading` + disabled button during submit), `GenerateQr.tsx` (`loading` state on the generate button).

**Excluded (auth-gate full-screen spinners, per locked decision):** `AdminGuard.tsx`, `CustomerLayout.tsx`, `PlatformLayout.tsx`.

**In scope — form-style pages** (single "Loading…" text guard before the whole form renders):
`AccountSettingsForm.tsx` (shared, single-column), `StampProgram.tsx` (single-column), `AdminContact.tsx` (two-column with live preview), `Branding.tsx` (two-column with live preview), `PlatformContact.tsx` (single-column).

**In scope — table-row pages** (grid-column rows: avatar+name cell + N stat cells):
`AdminCustomers.tsx` (5-col grid), `Businesses.tsx` (5-col grid, plus 4 stat cards above the table).

**In scope — flex-list pages** (icon/thumbnail + 2 lines per row, no grid alignment):
`AdminEvents.tsx`, `MenuManagement.tsx`, `CustomerMenu.tsx`.

**In scope — detail/stat pages:**
`BusinessDetail.tsx` (avatar + title line + 4 stat cards, single "Loading…" guard today), `AdminReportsSummary.tsx` (5 stat cards, only the number is loading-gated today).

**In scope — spinner-to-skeleton swap:**
`CustomerWallet.tsx` (centered spinner → voucher-card-shaped skeleton), `CustomerDashboard.tsx` (the `cardLoading ? "—"` numeric readout on the reward card → a skeleton block matching the number's size).

## Approach

One base primitive, already present but unused in the shadcn kit: `components/ui/skeleton.tsx`. Retrofit its color to the Stampd token (`bg-[var(--line)]`, matching the neutral divider color already used throughout the retrofit) instead of the default shadcn `bg-primary/10`, so it reads correctly against every screen's `--surface`/`--bg` backgrounds.

No new shared "SkeletonRow"/"SkeletonTable" abstraction — each screen composes its own skeleton JSX directly from `<Skeleton>` blocks, copying its own real wrapper structure (same grid-cols, same flex layout, same border/padding classes) so the skeleton occupies exactly the space and shape the real content will. This is what "content-shaped per screen" means concretely, and avoids inventing a one-size-fits-all component that the style decision explicitly rejected.

Each skeleton renders a fixed small count of placeholder rows/cards (3-5, screen-dependent) — count doesn't need to match real data length since it's only shown before any data is known.

## Out of scope

- Skeletons for button/mutation-pending states (Save, Generate, Login) — those already have adequate text/disabled feedback and aren't "loading" in the initial-fetch sense this epic addresses.
- Auth-gate full-screen spinners — explicitly excluded per the locked scope decision.
- Any change to data-fetching logic, query keys, or loading semantics — this is purely the visual placeholder shown while `isLoading` is true.

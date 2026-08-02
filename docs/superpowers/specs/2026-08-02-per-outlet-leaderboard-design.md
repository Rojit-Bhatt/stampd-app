# Per-Outlet Customer Leaderboard — Design

**Date:** 2026-08-02
**Status:** Approved, ready for planning
**Roadmap source:** `2026-07-30-samparka-parity-roadmap-design.md`, sub-project 5

## Decisions carried over from the brief (not re-litigated here)

- Ranked by points **earned** within a date window, summed from `PointsTransaction` rows with `type: "earn"` — never from `PointsBalance`, which is spend-adjusted.
- Window options: **All Time / This Month / This Week**, selectable on both the admin and customer views.
- Admin view lives inside the existing `AdminCustomers.tsx` page, as a new section — no new nav item.
- Customer view lives inside `CustomerHistory.tsx`, as a new section.
- Privacy rule on the customer-facing view: the signed-in customer's own row shows their full name; every other row shows first name + last initial (`"Bikash T."`). No opt-in, no setting — a formatting rule applied at read time.
- Single-outlet only: every query is scoped by `organizationId`, exactly like every other loyalty read in this codebase. No cross-outlet or cross-company aggregation.
- `role !== "customer"` rows excluded. Ties broken by name, stable sort.
- Top N, N = 10 to start. No CSV export, no admin nav item.

## What's actually being decided here

The brief leaves four things open: what "This Month"/"This Week" mean precisely, the exact aggregation query against the mock DB, the exact response shapes, and where the privacy formatting happens. Each is resolved below.

### Window semantics: rolling, not calendar

"This Week" = the trailing 7 days from now; "This Month" = the trailing 30 days from now. Not calendar-aligned (not "since the 1st" / "since Monday").

This matches the codebase's existing precedent rather than inventing a new one:

- `reportService.js`'s `getDashboardStats` already computes "current week" as `now - WEEK_MS`, a rolling window, for its week-over-week trend tiles.
- `tierService.js` resolves tier progress over a trailing 365-day rolling window (see `tests/tier-system.js`, which backdates a transaction 400 days to prove the boundary).
- `backend/routes/testHookRoutes.js` already has a `/create-dated-transaction` test hook whose own comment says it exists for **"testing rolling windows that exclude old data"** — pre-existing infrastructure for exactly this shape of test, from the tier-thresholds work. Reusing it here means no new test hook is needed.

A calendar-aligned "This Month" would need `PLATFORM_TIMEZONE`-aware local-midnight-of-the-1st math (the machinery `utils/dateRange.js` has for explicit `startDate`/`endDate` report ranges). That machinery answers a different question — "what did the user type as a date range" — not "how recently." Rolling windows need none of it: just `now - N days`, matching every other "how recently has this customer been active" computation already in the codebase.

### Aggregation query

The mock DB has no aggregation pipeline (see CLAUDE.md), so grouping happens in JS, following the exact shape `reportService.js`'s `getDashboardStats`/`getSummaryStats` already use (`find()` the range, reduce in JS):

```js
const query = { organizationId, type: "earn" };
if (windowStartMs !== null) query.createdAt = { $gte: new Date(Date.now() - windowStartMs) };
const earns = await PointsTransaction.find(query);
```

`$gte` on a top-level field is supported by the mock (confirmed in `utils/mockMongoose.js`), so the date filter is a real query, not a post-fetch JS filter — cheaper, and consistent with how the rest of the codebase already narrows by `createdAt` range (`getSummaryStats`, `getDashboardStats`).

Grouping: reduce the fetched rows into a `Map<userId, totalCenti>`. Then resolve every user id that has an earn row against `User.findOne({ _id, organizationId })` (organization-scoped — an id that somehow belonged to a different outlet's user simply resolves to nothing, never leaks), filter to `role === "customer"`, sort by `(pointsEarned desc, name asc)`, slice to N, attach `rank = index + 1`.

A customer with zero earns in the window has no row in the ledger for that window and is simply absent from the result — no zero-point placeholder rows. This is the same posture `getCustomerDetailRows` explicitly rejects ("every customer row is returned, including ones with no earn/redeem yet") — but a leaderboard is a ranking of activity, not a membership roster, so the two surfaces are allowed to disagree here without contradicting each other.

### Where privacy formatting happens

Entirely on the backend, not the frontend. One shared internal function computes the ranked rows (full names, unformatted) for a given `organizationId` + window. Two thin callers wrap it:

- **Admin controller**: returns the rows as-is — admins already see full names everywhere else in this console (the customer list itself, the customer detail drill-in).
- **Customer controller**: takes the same rows, and for every row except the one matching the caller's own `req.user.id`, replaces `name` with `firstName + " " + lastInitial + "."`. The caller's own row keeps its full name. This keeps the redaction on the only side that can get it wrong safely — the backend already knows which row is "self" from the verified JWT, so there's no risk of a frontend bug flashing an unredacted name before a re-render.

This mirrors the enforcement-lives-on-the-backend posture the customer-info-toggles design used for `customerInfo` — the frontend renders what it's given, it doesn't reason about what to redact.

Name formatting (`formatDisplayName`):
- Split on whitespace, drop empty segments.
- Zero segments (should not happen — `User.name` is required) → falls back to `"Customer"`.
- One segment (a mononym) → the segment as-is. No fabricated initial.
- Two or more segments → `first + " " + last[0].toUpperCase() + "."`. Only the first and last segments matter (a middle name, if present, is dropped) — consistent with "first name + last initial" as stated in the brief, not "first + all-but-last-initialed."

## Backend surface

No schema changes — this reads existing `PointsTransaction` and `User` data only.

### `backend/services/leaderboardService.js` (new)

```js
const getLeaderboard = async (organizationId, { window = "all", limit = 10 } = {})
// -> [{ userId, name, pointsEarned, rank }, ...]   (full names, always)
```

- Throws 400 (`createHttpError`) for `organizationId` missing, or `window` outside `["all", "week", "month"]` — the same "throw rather than silently do something else" posture `CAMPAIGN_STACKING` and `consumeDynamicQrToken`'s purpose check already use in this codebase, rather than quietly defaulting to "all" on a typo'd query param.
- `pointsEarned` is already converted via `toPoints()` — centipoints never leave the backend, matching every other read in `pointsService.js`.

### `GET /api/admin/leaderboard` (new)

- `verifyToken`, `isBusinessAdmin` guarded, wired in `backend/routes/adminRoutes.js`.
- Controller added to `backend/controllers/reportController.js` (it's a read of aggregate outlet activity, the same shape as `getDashboard`/`getTierDistribution`, which already live there — not `pointsController.js`, which is claim/redeem/balance/history for one customer's own loyalty actions).
- Query param `?window=all|month|week`, defaults to `all` when absent.
- Response: `{ success: true, data: { window: "all", rows: [{ rank, userId, name, pointsEarned }] } }`.

### `GET /api/points/leaderboard` (new)

- `verifyToken` guarded (any authenticated tenant role can technically call it, but only a `customer` token is ever issued to hit it from the app — the route sits under `/api/points` per CLAUDE.md's placement rule: tenant loyalty reads, not admin config). Wired in `backend/routes/pointsRoutes.js`, controller added to `backend/controllers/pointsController.js` alongside `getBalance`/`getHistory`.
- Same `?window=` param, same default.
- Response: `{ success: true, data: { window: "all", rows: [{ rank, userId, name, pointsEarned, isSelf }] } }` — `name` is redacted per the rule above; `isSelf` is `true` for exactly the row whose `userId` equals `req.user.id`, letting the frontend highlight it without doing any string-matching of its own.
- The caller's own row is included only if they're genuinely in the top 10 for that window. There is no "show my rank even if I'm not in the top N" fallback — that's the roadmap doc's rejected "everyone sees only their own position" option, and adding it now would be scope the brief didn't ask for.

## Frontend surface

### `frontend/src/hooks/usePoints.ts`

Add, next to the existing `PointsTransaction`/`usePointsHistory` pair:

```ts
export type LeaderboardWindow = "all" | "month" | "week";

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  pointsEarned: number;
  isSelf: boolean;
}

export function useLeaderboard(window: LeaderboardWindow) { ... }
```

`useQuery` keyed on `["leaderboard", companySlug, outletSlug, window]` (mirrors every other tenant-scoped hook in this file, which key on both slugs), hitting `` `/api/points/leaderboard?window=${window}` ``.

### `CustomerHistory.tsx`

A new section below the existing history list (not a separate route — the brief says "a leaderboard section," and this page is already the customer's one-stop points view). Local `useState<LeaderboardWindow>("all")` drives a `SegmentedControl`/`SegmentedControlItem` pair (reused from `components/ui/segmented-control.tsx`, the same primitive `PointsProgram.tsx` already uses for its inherit/override toggle — not a new control). Below it, a ranked list: rank number, name (already redacted server-side), `formatPoints(row.pointsEarned)` — reusing the `formatPoints` helper already exported from this same file and already used for every other points figure on this page. The caller's own row (`isSelf`) gets a visual highlight (the `--primary-soft` wash already used elsewhere for "this is about you" emphasis, e.g. the earn row tone in `TYPE_META`) rather than a new color.

Empty state (no earns in the selected window): a short line, same voice as the existing "Nothing here yet" empty state on this page — `"No one's earned points here yet this {window}."`

Kept inline in `CustomerHistory.tsx` rather than extracted to its own component file: it's used in exactly one place, and extracting a two-consumer (admin + customer) shared component would be premature — the two views render different data shapes (`isSelf` highlighting vs. plain full-name rows in a table grid) inside different layout contexts (a card-list page vs. a table page), so there isn't enough shared markup to justify a shared component yet.

### `AdminCustomers.tsx`

A new "Top Customer Leaderboard" card added below the existing customer table (same `shadow-ambient` / `rounded-[var(--radius-card)]` / `bg-[var(--surface)]` card treatment already used for the table above it). Local `useState<LeaderboardWindow>("all")` + the same `SegmentedControl` pattern. A `useQuery` inline in the component (matching how the existing `customers` query is already written inline here, rather than in a shared hook file — this page doesn't import from a dedicated admin-hooks module for its other reads either), keyed `["adminLeaderboard", orgId, window]`, hitting `/api/admin/leaderboard?window=${window}` with `{ role: "admin" }` (matching the existing `apiRequest` call in this file). Rows render rank, full name (never redacted — this is the admin console), and `pointsEarned` as a plain number (matching how `pointsBalance`/`redemptionCount` are already rendered raw in the table above, with no `formatPoints` call — this page doesn't use that helper anywhere today).

No new nav item — reachable only by scrolling the existing Customers page, per the brief.

## Data flow

**Admin opens Customers, leaderboard defaults to All Time.** `AdminCustomers` mounts → the existing customer-list query and the new leaderboard query both fire → `GET /api/admin/leaderboard?window=all` → `reportController.getLeaderboard` → `leaderboardService.getLeaderboard(orgId, {window: "all"})` → sums every `earn` transaction for the outlet, groups by user, returns top 10 with full names → renders under the table.

**Customer switches to "This Week" on their points page.** `CustomerHistory` re-fires the query with the new window (React Query re-keys on `window`) → `GET /api/points/leaderboard?window=week` → `pointsController` calls the same service, then walks the rows and rewrites every `name` except the one matching `req.user.id` → the customer sees themselves by full name and everyone else as `"First L."`, and the list re-sorts/re-populates for the trailing-7-day window, possibly dropping rows (including their own) if nobody in the previous top 10 earned anything this week.

**A customer who visits two outlets of the same company.** Two independent leaderboard reads, one per outlet's `organizationId` — nothing about the query, response, or redaction logic ever compares across outlets, so there is no path by which outlet B's leaderboard could reveal that a name appearing on it also appears on outlet A's.

## Error handling

- Invalid `?window=` value (anything outside `all`/`month`/`week`) → 400, same `createHttpError` pattern every other service in this codebase uses; the frontend never sends anything but one of the three `SegmentedControlItem` values, so this only fires on a hand-crafted request.
- No `organizationId` (should be structurally impossible behind `verifyToken`/`isBusinessAdmin`, both of which require a resolved tenant JWT) → 400, same defensive guard `loadOrganizationOrThrow` and friends already use elsewhere in `pointsService.js`.
- Empty result (nobody has earned anything in the window) → `200` with `rows: []`, not an error — both frontends render their existing empty-state treatment, not a toast.

## Testing

**Backend** — new `backend/tests/leaderboard.js`, added to the `test` chain in `backend/package.json`:

- an outlet with three customers earning different amounts ranks them highest-to-lowest by summed `earn` points
- a `redeem` transaction never changes the ranking (only `earn` rows count) — proves the "never `PointsBalance`" rule by construction: a customer who earned the most and then redeemed everything still ranks first
- a transaction backdated 40 days (via the existing `/__test__/create-dated-transaction` hook) counts in `window=all` only — it's outside both the 30-day `month` and 7-day `week` windows; one backdated 10 days counts in `month` and `all` but not `week`
- a registered customer who has never earned anything never appears in any window's leaderboard (no zero-point placeholder rows) — the role/earn filter is otherwise only exercisable through real earn/redeem calls, which already refuse a non-`customer` role at 403 (`claimPoints`), so there's no code path available to a test that could produce a staff-owned `PointsTransaction` to assert against directly
- a second outlet's top earner never appears in the first outlet's leaderboard (the standard isolation check, `makeSiblingOutlet`)
- an invalid `?window=nonsense` 400s on both the admin and customer routes
- the customer-facing route redacts every row except the caller's own: register two customers, have both earn, confirm one customer's response shows their own full name with `isSelf: true` and the other's row as `"First L."` with `isSelf: false` — then confirm the second customer's own request shows the redaction flipped
- a mononym (`name: "Cher"`) round-trips unredacted-shaped (no trailing space, no fabricated initial) — the one edge case in `formatDisplayName` worth a direct assertion since it's not exercised by the seeded demo names

**Frontend** — `npm run lint` clean; live verification of: the leaderboard section rendering on `AdminCustomers.tsx` with the three window options, the same section on `CustomerHistory.tsx` showing the signed-in customer's own name in full and other rows abbreviated, and the empty state when a fresh outlet has no earns yet.

## Out of scope

CSV/Excel export of the leaderboard (the brief explicitly excludes it — `reportService.js`'s Excel builders are untouched). A public/unauthenticated leaderboard view. Any change to how `PointsBalance` or the ranking-adjacent tier system work. Cross-outlet or cross-company rollups (`platformAnalyticsService.js` and `companyReportService.js` are untouched). A "your rank even if outside the top N" affordance. Real-time/live-updating leaderboard (it's a plain `useQuery`, refetched on window change or page revisit, like every other admin/customer read in this app — no websocket, no polling interval added). Suspended or inactive customers being excluded from ranking — the brief doesn't ask for this, and no other read in the codebase (including `getCustomerDetailRows`) filters on any such status today, so inventing one here would be a new, unrequested rule.

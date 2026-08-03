# Impact insights — design

Date: 2026-08-03
Status: approved, ready for implementation planning

## Purpose

Answer one question for the person paying for Stampd: **has this been worth it?**

Today the console reports *activity* — points issued, transactions, revenue over a window. It never states *value*: did customers come back, is repeat business real, is the reward programme cheaper than the discount it replaces, and does the subscription pay for itself. This adds an **Impact** page to the outlet admin console and the company owner console.

The reference for the layout is a competitor page (Samparka's "Your Impact") the user shared. It is a reference for *shape*, not for content: three of its figures are invented and one of its formulas is wrong. Those are corrected below and the reasoning recorded, because the corrections will otherwise look like omissions to whoever reads this next.

## Non-goals

- **No invented metrics.** Samparka's "operations cost avoided Rs 17", "+1 staff hours saved", and "staff time value recovered Rs 350" have no source in any data Stampd holds — they are a coefficient someone picked. They are dropped entirely. This follows the rule the codebase already holds elsewhere (`Explore.tsx` sorts by real stamp volume, "never a fabricated rating or deal").
- **No platform console page.** Cross-company impact is not in scope; `platformAnalyticsService` already covers the platform admin's needs.
- **No cron, no stored aggregates.** Everything is derived at read time, consistent with how expiry, subscription status and every existing report already work.
- **No date picker.** Impact is cumulative by definition (see "Time window").

## Time window

**All-time, no picker.** Impact answers "has this been worth it since I started", which is inherently cumulative; a 30-day default would make every new outlet look like a failure. The page states the period explicitly — "since 12 Mar 2026" — from `firstActivityAt`, the earliest transaction, falling back to the outlet's `createdAt` when there are none. First activity, not creation: an outlet configured in March that opened in June should not be told its results span four months of nothing.

The range-filtered view of the same underlying flows already exists on the Reports pages. Impact deliberately does not duplicate it.

The one exception is the ROI block, which is measured over the subscription's lifetime rather than the outlet's — see "ROI".

## Schema change

One field on `PointsTransaction`:

```js
// What this reward was worth in rupees, snapshotted at redemption. Only a
// MenuItem has a cash price; a RewardItem is points-only by definition
// (a tote bag is never sold), so it stays null and is excluded from every
// rupee figure rather than counted as zero.
//
// Snapshotted, not looked up live, for the same reason earnPercent and
// multiplier are: repricing the menu next month must not rewrite what last
// month's redemptions cost.
rewardValueNpr: { type: Number, default: null }
```

Written in `pointsService.redeemPoints` from `item.doc.price` when `item.kind === "menu"`. The merged catalog entry already carries `doc`, so no extra read.

**Historical rows stay null.** Every rupee figure derived from this field therefore reports its own coverage:

```js
rewardValueCoverage: { valued: 34, total: 51 }
```

The UI states "based on 34 of 51 redemptions" rather than silently under-reporting. When `valued === total` the disclosure is omitted. When `valued === 0` the whole reward-cost section renders its empty state instead of a row of zeros.

## Service

New `backend/services/impactService.js`, two exports:

- `getOutletImpact(organizationId)`
- `getCompanyImpact(companyId)` — runs the outlet computation per outlet, then sums, the same shape `companyReportService.getCompanyRollup` already uses

Both fetch and reduce in JS. The mock DB has no aggregation pipeline, and the existing report services all take this approach; matching them matters more than efficiency at this data size.

Layering is unchanged: `routes/ → controllers/ → services/ → models/`. Controllers parse and format only.

### Who counts as a customer

`/explore` auto-provisions a `User` membership the moment someone opens an outlet's page. Counting all memberships would let browsers who never bought anything drag retention toward zero.

So, for every metric on this page:

- **customer** = a membership with **≥1 `earn` row** — someone who has actually transacted
- **repeat customer** = a membership with **≥2 `earn` rows**, all-time

Two bills in one afternoon count as two earns and therefore as a repeat. That is deliberate: each earn is a distinct bill the customer chose to pay, and de-duplicating by day would understate outlets whose regulars buy twice a day.

`Retention = repeatCustomers / customers`.

### Outlet metrics

All scoped by `organizationId`, all-time.

| Metric | Derivation |
|---|---|
| `customers` | memberships with ≥1 earn |
| `repeatCustomers` | memberships with ≥2 earns |
| `retentionPercent` | `repeatCustomers / customers`, `null` when `customers === 0` |
| `revenueTracked` | Σ `billAmount` over all earn rows |
| `repeatRevenue` | Σ `billAmount` over earn rows belonging to repeat customers |
| `repeatRevenuePercent` | `repeatRevenue / revenueTracked` |
| `avgSpendPerRepeatCustomer` | `repeatRevenue / repeatCustomers` |
| `redemptionCount` | count of redeem rows |
| `rewardValueRedeemed` | Σ `rewardValueNpr` over redeem rows (nulls skipped) |
| `pointsOutstanding` | reuses `reportService.getPointsOutstandingCenti`, reported in points |
| `firstActivityAt` | earliest transaction, for the "since —" line; `null` when there are none |

`repeatRevenue` counts **all** revenue from a repeat customer, not only their second visit onward. The claim being made is "this share of your revenue comes from people who come back", and their first visit is part of that relationship.

`pointsOutstanding` is a liability in **points**, never converted to rupees. There is no honest points-to-rupee rate — what a point is worth depends entirely on which reward it is spent on.

### Dropped: "total rewards issued (value)"

The reference page shows this as Rs 1,101, identical to its revenue-tracked figure. Points issued are not rupees, and no conversion exists. The honest pair is *what you actually gave away* (`rewardValueRedeemed`) against *what a flat discount would have cost* — which is the comparison below.

### Flat-discount comparison

Client-side, from two real numbers already in the payload:

```
wouldHaveCost = revenueTracked × pct     // pct ∈ {5, 10, 15, 20}, default 10
actualCost    = rewardValueRedeemed
```

No backend work. Presented as a hypothetical in its own words ("a flat 10% on all sales would have cost …"), never as a measured saving. Suppressed entirely when `rewardValueCoverage.valued === 0`, since the comparison would be against a number that is missing rather than zero.

### Milestones

Derived live on every read from the numbers already computed. No stored state, no write hooks, no achievement dates — only achieved / not-yet.

| Milestone | Condition |
|---|---|
| 10 / 50 / 100 / 500 / 1000 customers joined | `customers >= n` |
| First reward redeemed | `redemptionCount >= 1` |
| First campaign run | ≥1 `Campaign` exists for the outlet |
| 50% retention rate | `retentionPercent >= 50` |
| Rs 1 lakh revenue tracked | `revenueTracked >= 100000` |
| Rs 5 lakh revenue tracked | `revenueTracked >= 500000` |

Returned in display order as `{ key, label, sublabel, achieved }`. The rendered order interleaves customer-count and event milestones so a new outlet sees a reachable next step rather than five locked count thresholds in a row.

"First campaign run" reads `Campaign`, not `Broadcast` — a campaign changes what a bill is worth, which is the thing this page is about. A broadcast is a message.

### Company metrics

Every outlet metric summed across the company's outlets, plus:

- `perOutlet[]` — the same metrics per outlet, so an owner can see which location is actually retaining, sorted by `revenueTracked` descending
- `customers` at company level counts **distinct `CustomerAccount`s** with ≥1 earn anywhere in the company, never summed per-outlet `User` rows — one person loyal to two of your outlets is one customer. Same reasoning `companyReportService` and `platformAnalyticsService` already apply.
- `retentionPercent` at company level is likewise computed on distinct accounts: someone with one earn at each of two outlets is **not** a repeat customer, because they have not come back anywhere. Per-outlet retention still reads them as single-visit at each.
- the ROI block

`getCompanyImpact` stays reachable only through `/api/company` (`verifyCompanySession`). No outlet console can see a sibling's numbers — the same boundary `getCompanyRollup` already holds.

### ROI

Company console only. The subscription is a company-level fact; exposing it to an outlet console would be a deliberate crack in the isolation boundary for no real gain.

The reference page divides all-time revenue (Rs 1,101) by a **monthly** cost (Rs 2,000) and prints "1X". That is not a ratio — it compares a cumulative flow to one month of cost, and 1,101 / 2,000 is 0.55 regardless. Both sides must be measured over the same window.

```
monthlyCost   = plan.priceNpr / (plan.billingIntervalDays / 30)
monthsElapsed = max(1, (now − subscription.createdAt) / 30 days)
costToDate    = monthlyCost × monthsElapsed
roiMultiple   = revenueTrackedSinceSubscriptionStart / costToDate
```

`subscription.createdAt` is the correct window start: `subscriptionService` keeps **one** `Subscription` document per company and updates it in place on renewal, so `createdAt` is genuinely when they started paying, not when they last renewed.

`revenueTrackedSinceSubscriptionStart` is a separate sum from the all-time `revenueTracked` — earn rows filtered to `createdAt >= subscription.createdAt`. Both appear on the page, labelled distinctly, because a company that ran outlets before subscribing will otherwise see two different revenue numbers with no explanation.

`monthsElapsed` is floored at 1 so a company three days into its first month does not divide by ~0.1 and read as 30X.

**Reported to two significant figures, including when it is below 1.** 0.55X is shown as 0.55X. An owner who catches one inflated number stops trusting the whole page.

Returns `null` (block hidden) when the company has no subscription — a platform-onboarded company with none has nothing to compare against.

## API

| Endpoint | Guard | Returns |
|---|---|---|
| `GET /api/admin/impact` | `isBusinessAdmin`, org from JWT | `getOutletImpact` |
| `GET /api/company/impact` | `verifyCompanySession` | `getCompanyImpact` |

Tenant for the admin route comes from the JWT, never from a URL slug — the existing rule for every authenticated loyalty route.

No new controllers. The admin handler goes in the existing `reportController.js` — Impact lives under the Reports nav group and is a report — and the company handler alongside `getRollup` in `companyController.js`.

## Frontend

New pages:

- `frontend/src/routes/admin/AdminImpact.tsx` — nav entry `{ to: "reports/impact", label: "Impact" }` added to the existing **Reports** group in `AdminLayout.tsx`, third after Summary and Customer report
- `frontend/src/routes/company/CompanyImpact.tsx` — new `{ to: "impact", label: "Impact", Icon: … }` entry in `CompanyLayout.tsx`'s `NAV`, between Reports and Subscription

Both fetch through `apiRequest` with TanStack Query.

### Visual

Existing "editorial ledger" system, no new tokens:

- Hero retention band in `--primary` green (value and action), DM Serif (`--font-numeral`) on the percentage
- Card-level containers: `rounded-3xl bg-[var(--surface)]` + `.shadow-ambient`
- Section entrances through `useMotion()`; no hand-rolled springs
- Numerals in `--font-numeral`, prose in `--font-sans` — never the reverse
- No red/green scoring, no gauge dials, no traffic lights. A low retention number is stated plainly, not accused.
- Copy stays light and chill, matching the rest of the app

### Empty and thin states

- **No customers with an earn yet** — the whole page collapses to a single card: what Impact will show once people start earning. No 0% hero.
- **Fewer than 5 customers** — retention still renders, with an explicit "1 of 1 customers" line under it so a 100% off one person is visibly one person, not a trend.
- **No valued redemptions** — reward-cost section and flat-discount comparison both hidden, replaced by one line explaining they populate as rewards are redeemed.
- **No subscription** (company) — ROI block absent.

## Testing

New `backend/tests/impact.js`, **added to `backend/package.json`'s `test` chain** — a suite not in that chain never runs.

Covers:

1. Retention denominator excludes zero-earn memberships (provision a membership with no earn; retention unaffected)
2. `repeatCustomers` counts ≥2 earns; two earns in one day still count as repeat
3. `repeatRevenue` attributes all of a repeat customer's revenue, first visit included
4. `rewardValueNpr` is snapshotted on a MenuItem redemption and stays null on a RewardItem redemption
5. `rewardValueCoverage` reports valued/total honestly with a mix of both
6. `rewardValueRedeemed` skips nulls rather than treating them as zero
7. Company rollup equals the sum of its outlets for additive metrics
8. Company-level `customers` de-duplicates one `CustomerAccount` active at two outlets of the same company
9. Company-level retention treats one earn at each of two outlets as non-repeat
10. ROI window: revenue is filtered to on/after `subscription.createdAt`; `monthsElapsed` floors at 1; a below-1 multiple is reported as-is, not floored to 1
11. Milestones flip at their exact thresholds
12. **Cross-tenant isolation** — outlet A's impact never includes outlet B's rows, including for two outlets sharing a customer; `/api/company/impact` for company X never returns company Y's outlets

Test 12 is the one that matters most; it is the invariant the whole product depends on.

Seed note: any fixture that changes earn math must not land on `coffesarowar/durbarmarg`, which the existing suite earns against ~30 times.

## Files

**New**
- `backend/services/impactService.js`
- `backend/tests/impact.js`
- `frontend/src/routes/admin/AdminImpact.tsx`
- `frontend/src/routes/company/CompanyImpact.tsx`

**Modified**
- `backend/models/PointsTransaction.js` — `rewardValueNpr`
- `backend/services/pointsService.js` — snapshot the value in `redeemPoints`
- `backend/routes/adminRoutes.js`, `backend/routes/companyRoutes.js` — one route each
- `backend/controllers/reportController.js` — outlet impact handler
- `backend/controllers/companyController.js` — company impact handler
- `backend/package.json` — test chain
- `frontend/src/App.tsx` — two routes
- `frontend/src/components/admin/AdminLayout.tsx`, `frontend/src/components/company/CompanyLayout.tsx` — nav entries

## Decisions recorded

| Decision | Why |
|---|---|
| Drop invented value metrics | No data source; contradicts the codebase's existing no-fabricated-data rule |
| All-time, no date picker | Impact is cumulative; a 30-day window makes every new outlet look failed |
| Customer = ≥1 earn | `/explore` auto-provisions memberships; counting them makes retention meaningless |
| Snapshot `rewardValueNpr` at redeem | Same discipline as `earnPercent`; a menu reprice must not rewrite history |
| Points outstanding stays in points | No honest points-to-rupee rate exists |
| ROI company-only | The subscription is company-level; exposing it to outlets breaks isolation for nothing |
| ROI over the subscription's lifetime | Comparing all-time revenue to one month of cost is not a ratio |
| ROI shown below 1 when it is below 1 | One inflated number costs the credibility of the whole page |
| Milestones derived, never stored | No cron exists in this codebase and none is needed |

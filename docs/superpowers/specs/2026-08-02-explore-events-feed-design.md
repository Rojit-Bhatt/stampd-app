# Explore Events Feed — Design

**Date:** 2026-08-02
**Status:** Approved, ready for planning
**Roadmap source:** sub-project 7 of a multi-part request (parallel to sub-project 6,
customer-info collection toggles)

## What this is

A cross-tenant events feed on `/explore` — a new `/explore/events` page,
reachable from a new bottom-nav tab in `GlobalCustomerLayout.tsx` — listing
upcoming events from **every active outlet on the platform**, soonest-first,
each card linking straight into that outlet. It is the events equivalent of
the existing "Discover" grid: same slug-less surface, same
`verifyGlobalSession`-only auth, same reason cross-tenant aggregation is
allowed here and nowhere else in the product.

## Why this is safe to aggregate cross-tenant

CLAUDE.md's isolation invariant ("every loyalty record carries
`organizationId`; every query must filter on it") governs **loyalty data** —
balances, transactions, customer identity. `Event` is not loyalty data; it's
the same kind of display-only public listing `discoveryService.js` already
aggregates for the Discover grid (`getDiscoverBusinesses`, no
`organizationId` filter, deliberate). An event's title/date/location/photo is
information the outlet already chose to publish to the public tenant page
(`GET /api/tenant` → `upcomingEvents`) — this feed does not expose anything a
customer couldn't already see by visiting that outlet directly. Nothing
loyalty-scoped (points, balances, program config, customer PII) appears
anywhere in this feed's payload.

## Decisions carried over from the brief (final, not re-litigated)

- Sort: soonest-upcoming first. No past events.
- No distance-based sorting — that's Discover's job; this is date-only.
- Cap at 50 events for v1. No pagination, no infinite scroll.
- New bottom-nav tab alongside Home / My businesses / Profile.
- Clicking an event card routes into that outlet exactly the way
  `Explore.tsx`'s business cards do — `tenantPath(companySlug, slug,
  "dashboard")` — so `TenantSessionSync` auto-provisions on arrival like
  every other cross-tenant entry point.
- Reuse `EventCard.tsx` for the event content; reuse
  `eventService.getUpcomingForOrg`'s date filter, generalized.
- No new npm dependency.

## Backend

### `eventService.js` — generalize the date filter

Today `getUpcomingForOrg(organizationId, limit)` inlines "start of today, in
the future or today, soonest-first" as a query scoped to one org. Extract the
"start of today" computation into a helper and add an unscoped sibling so
both variants share exactly one filter:

```js
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const getUpcomingForOrg = async (organizationId, limit = 3) =>
  Event.find({ organizationId, date: { $gte: startOfToday() } })
    .sort({ date: 1 })
    .limit(limit);

// No organizationId filter and no limit — the cross-tenant feed applies its
// own cap AFTER filtering out events whose outlet/company turned out to be
// inactive, so limiting here would be premature.
const getUpcomingAllOrgs = async () =>
  Event.find({ date: { $gte: startOfToday() } }).sort({ date: 1 });
```

`getUpcomingAllOrgs` is exported alongside the existing functions.

### `discoveryService.js` — the aggregation, following `getDiscoverBusinesses`'s pattern exactly

`getDiscoverBusinesses` is the existing "loop over orgs, join Company,
aggregate in JS" cross-tenant read — no `$in`, no aggregation pipeline,
because the mock DB doesn't support either. The new function follows the
same shape:

```js
const EVENTS_FEED_LIMIT = 50;

const getUpcomingEventsFeed = async (limit = EVENTS_FEED_LIMIT) => {
  const [events, organizations] = await Promise.all([
    getUpcomingAllOrgs(),
    Organization.find({ status: "active" })
  ]);

  const orgsById = new Map(organizations.map((org) => [org._id.toString(), org]));
  const companyCache = new Map();
  const getCompany = async (companyId) => {
    const key = companyId.toString();
    if (!companyCache.has(key)) {
      companyCache.set(key, await Company.findOne({ _id: companyId }));
    }
    return companyCache.get(key);
  };

  const feed = [];
  for (const event of events) {
    // events is already sorted soonest-first, so the first `limit` that
    // survive the active-org/active-company filter ARE the soonest `limit`
    // — no need to walk the rest once the cap is hit.
    if (feed.length >= limit) break;

    const org = orgsById.get(event.organizationId.toString());
    if (!org) continue; // suspended/deleted outlet
    const company = await getCompany(org.companyId);
    if (!company || company.status !== "active") continue; // suspended company

    feed.push({
      id: event._id.toString(),
      title: event.title,
      date: event.date,
      time: event.time,
      location: event.location,
      description: event.description,
      imageUrl: event.imageUrl,
      organizationId: org._id.toString(),
      slug: org.slug,
      companySlug: company.slug,
      businessName: org.name,
      branding: {
        logoUrl: org.branding.logoUrl,
        primaryColor: org.branding.primaryColor
      }
    });
  }

  return { success: true, events: feed };
};
```

Matches `TenantEvent`'s own field set (`id`/`title`/`date`/`time`/`location`/
`description`/`imageUrl`) exactly, plus the same outlet-attribution fields
`DiscoverBusiness` already carries (`slug`, `companySlug`, and a
`branding.{logoUrl,primaryColor}` pair) — nothing new invented, everything
borrowed from an existing payload shape. `imageId` is deliberately **not**
resolved into `imageUrl` here, matching the exact gap `getUpcomingForOrg`
already has today on the per-outlet dashboard (`CustomerDashboard.tsx` passes
the raw event straight to `EventCard`) — not a regression this feature
introduces, and out of scope to fix here.

`limit` stays a function parameter (not hardcoded inline) purely so the test
suite can exercise the cap without creating 51+ events through the seeded
default — the route itself never accepts a query-string override; v1 has no
pagination UI to drive one.

### Controller + route

`discoveryController.js` gains one more thin action beside `discover`:

```js
const events = async (req, res, next) => {
  try {
    const result = await getUpcomingEventsFeed();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { discover, events };
```

`customerAccountRoutes.js`, in the existing "cross-tenant customer surface
(/explore)" block, right beside `/discover` and `/my-tenants`:

```js
const { discover, events: exploreEvents } = require("../controllers/discoveryController");
...
router.get("/discover", verifyGlobalSession, discover);
router.get("/events", verifyGlobalSession, exploreEvents);
router.get("/my-tenants", verifyGlobalSession, getMyTenants);
```

`GET /api/customer-auth/events` — `verifyGlobalSession` only, no tenant
resolution, no rate limiter (matches `/discover`/`/my-tenants`: this is an
authenticated read, not one of the abuse-prone unauthenticated endpoints
`authLimiter`/`registrationLimiter` are reserved for).

## Frontend

### `hooks/useExploreEvents.ts` — new, mirrors `useDiscover.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";

export interface ExploreEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  organizationId: string;
  /** The OUTLET slug. Unique only within its company — never a path on its own. */
  slug: string;
  companySlug: string;
  businessName: string;
  branding: {
    logoUrl: string;
    primaryColor: string;
  };
}

export function useExploreEvents() {
  return useQuery<ExploreEvent[]>({
    queryKey: ["exploreEvents"],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; events: ExploreEvent[] }>(
        "/api/customer-auth/events",
        { role: "customer-global" },
      );
      return res.events || [];
    },
  });
}
```

### `routes/ExploreEvents.tsx` — new

Same shell conventions as `Explore.tsx`/`ExploreMine.tsx`: a `max-w-3xl`
centered column (matching `ExploreMine`'s single-list layout, since this is
also a flat list rather than a filterable grid), a `Skeleton` loading state,
an empty state with a lucide icon + neutral copy, then the list.

Each row is a local `EventListingCard` — NOT a new shared component; it's a
thin wrapper that adds the one thing `EventCard` intentionally doesn't know
about (which business this is), then delegates the actual event content to
`EventCard` unchanged:

```tsx
function EventListingCard({ event }: { event: ExploreEvent }) {
  const initial = event.businessName.charAt(0).toUpperCase();
  return (
    <Link
      to={tenantPath(event.companySlug, event.slug, "dashboard")}
      className="stamp-interactive flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-ambient"
    >
      <div className="flex items-center gap-2">
        {event.branding.logoUrl ? (
          <img
            src={event.branding.logoUrl}
            alt=""
            className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: event.branding.primaryColor }}
          >
            {initial}
          </div>
        )}
        <span className="truncate text-xs font-bold text-[var(--muted)]">{event.businessName}</span>
      </div>
      <EventCard event={event} />
    </Link>
  );
}
```

The business row is necessary here (and absent on the per-outlet dashboard's
own use of `EventCard`) because this feed mixes many outlets on one screen —
without it, a customer has no way to tell which business an event belongs
to before tapping in.

`EventCard`'s hardcoded `var(--brand-ink)` accent (the date badge) is safe to
reuse outside `TenantScope`: `index.css`'s `:root` already defines a default
`--brand-ink` (`#0B7A4B`, the platform green) for exactly this situation —
no tenant theme is active on `/explore`, so every card shows the same
neutral green accent rather than a broken/unset color. This matches how
every other `/explore` surface already behaves (no tenant theming anywhere
on this route tree).

### `App.tsx` — routing

```tsx
const ExploreEvents = lazy(() => import('./routes/ExploreEvents'));
...
<Route path="/explore/events" element={<ExploreEvents />} />
```

Added inside the existing `<Route element={<GlobalCustomerLayout />}>` block,
beside `/explore`, `/explore/mine`, `/explore/profile`.

### `GlobalCustomerLayout.tsx` — the new nav tab

A fourth `Tab`, in both the desktop top nav and the mobile bottom nav, using
`CalendarDays` from `lucide-react` (already a transitive dependency via
`lucide-react`'s icon set — no new package). Placed second, between Home and
My businesses — it's a discovery surface like Home, not an account surface
like Profile, so it belongs on that side of the nav:

```tsx
<Tab to="/explore" icon={Compass} label="Home" variant="top" />
<Tab to="/explore/events" icon={CalendarDays} label="Events" variant="top" />
<Tab to="/explore/mine" icon={Store} label="My businesses" variant="top" />
<Tab to="/explore/profile" icon={CircleUser} label="Profile" variant="top" />
```

(and the mirrored `variant="bottom"` block in the footer.) No other change
to the shell — `Tab` already takes `to`/`icon`/`label`/`variant` as props,
so this is purely additive.

## Data flow

Customer opens `/explore/events` → `useExploreEvents()` fires
`GET /api/customer-auth/events` with the global session token →
`getUpcomingEventsFeed()` fetches every future-or-today `Event` across all
outlets in one query, fetches every active `Organization` in one query,
joins them in JS (with a per-company-id memoized lookup so a company with
several outlets each running events isn't re-fetched per event), drops
anything whose outlet or company isn't active, keeps the first 50 (already
sorted soonest-first by the query) → customer sees a flat list, taps a card
→ `tenantPath` builds `/[company]/[outlet]/dashboard` → `TenantScope` mounts
→ `TenantSessionSync` auto-provisions the membership exactly as it does from
Discover.

## Error handling

Nothing new: `useQuery`'s default error state renders through the same
loading/empty scaffold every other `/explore` list uses (no dedicated error
UI in `Explore.tsx`/`ExploreMine.tsx` today, so this doesn't invent one
either — `isLoading` false + `events` empty just shows the empty state,
matching existing behavior for a failed `useDiscover`/`useMyTenants` fetch).

## Testing

**Backend** — new `backend/tests/explore-events.js`, added to the `test`
chain in `backend/package.json`:

- `GET /api/customer-auth/events` without a global session → 401
- events from two different outlets (one seeded, one freshly onboarded) both
  appear, ordered soonest-first regardless of creation order
- a past event never appears
- an event at an outlet that gets suspended (`PATCH
  /api/platform/outlets/:id {status: "suspended"}`) disappears from the feed
  on the next fetch
- the feed never exceeds `EVENTS_FEED_LIMIT` (50): a dedicated outlet gets 55
  future events seeded at ascending offsets; the response contains exactly
  50, and it's the 50 soonest of the 55 (the earliest-dated 48 plus the two
  earlier events from prior steps) — the latest 7 are excluded

**Frontend** — `npm run lint` (tsc --noEmit) clean. No new frontend test
framework is introduced (there isn't one in this repo); this matches how
`Explore.tsx`/`ExploreMine.tsx` were verified when built.

## Out of scope

Pagination or infinite scroll (YAGNI per the brief — 50 is enough for v1).
Filtering/search on the events feed (Discover already owns
search/category/distance for businesses; this is a distinct, simpler
surface). Fixing `EventCard`'s pre-existing `imageId`-not-resolved gap.
Per-outlet event RSVP/ticketing (out of scope for the whole `Event` model,
per CLAUDE.md). Any change to the tenant-scoped `AdminEvents.tsx`,
`CustomerLayout.tsx`, or `AdminLayout.tsx` — this feature touches only the
slug-less `/explore` surface.

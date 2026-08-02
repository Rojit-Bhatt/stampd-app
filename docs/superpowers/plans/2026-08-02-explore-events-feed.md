# Explore Events Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cross-tenant, soonest-first events feed at `/explore/events`, aggregating every active outlet's upcoming `Event`s, capped at 50, reusing `EventCard` for content and `tenantPath` for navigation into the owning outlet.

**Architecture:** `eventService.getUpcomingForOrg`'s date filter (future-or-today, sorted soonest-first) is generalized into a shared `startOfToday()` helper plus a new unscoped `getUpcomingAllOrgs()`. `discoveryService.js` gains `getUpcomingEventsFeed()`, following `getDiscoverBusinesses`'s exact "loop over active orgs, join Company, aggregate in JS" pattern — no `$in`, no aggregation pipeline (mock DB doesn't support either). A new `GET /api/customer-auth/events` route (`verifyGlobalSession` only, no tenant) serves it. The frontend gets one new hook, one new route component, one new nav tab — no new shared component beyond a small local card wrapper around the existing `EventCard`.

**Tech Stack:** Node/Express + mongoose (in-memory mock DB in dev/test), React 19 + Vite + TS, TanStack Query, `node tests/*.js` suites.

**Spec:** `docs/superpowers/specs/2026-08-02-explore-events-feed-design.md`

## Global Constraints

- **Mock DB limits:** query matching supports top-level equality, `$or`, `$lte`, `$gte` **only**. No `$in`, no aggregation pipeline. Cross-org joins are done by fetching each collection separately and merging in JS (see `discoveryService.getDiscoverBusinesses`, `platformAnalyticsService.js`).
- **New test suites MUST be added to the `test` chain in `backend/package.json`** or they never run.
- This feed aggregates **display-only listing data** (event title/date/location/photo), never loyalty data — no points, balances, or program config anywhere in its payload. That's what makes the missing `organizationId` filter deliberate here, exactly as it already is in `getDiscoverBusinesses`.
- Every card must route into its outlet through `tenantPath(companySlug, slug, sub)` — never a hand-built string.
- Don't touch `AdminLayout.tsx`, `CustomerLayout.tsx`, `AdminEvents.tsx`, or any other tenant-scoped file — this is purely the slug-less `/explore` surface.
- No new npm dependency.
- Run `npm run lint` (`tsc --noEmit`) from the repo root before each frontend commit.

---

## Task 1: Backend — cross-tenant events feed endpoint

**Files:**
- Modify: `backend/services/eventService.js`
- Modify: `backend/services/discoveryService.js`
- Modify: `backend/controllers/discoveryController.js`
- Modify: `backend/routes/customerAccountRoutes.js`
- Modify: `backend/package.json` (test chain)
- Test: `backend/tests/explore-events.js` (new)

**Interfaces:**
- Consumes: `Event` model, `Organization.find({status})`, `Company.findOne({_id})` — all existing
- Produces: `eventService.getUpcomingAllOrgs()`; `discoveryService.getUpcomingEventsFeed(limit = 50)` → `{success, events: [{id, title, date, time, location, description, imageUrl, organizationId, slug, companySlug, businessName, branding: {logoUrl, primaryColor}}]}`; `GET /api/customer-auth/events`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/explore-events.js`:

```js
/**
 * Cross-tenant events feed (/explore/events). Self-contained: boots its own
 * server on a dedicated port against the in-memory mock DB.
 *
 * Covers: auth gate, cross-outlet aggregation sorted soonest-first, past
 * events excluded, a suspended outlet's events disappearing from the feed,
 * and the 50-event cap keeping the soonest events when more exist.
 *
 * Run directly: `node tests/explore-events.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d) {
  return d.toISOString();
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5058 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);
  const now = new Date();
  const runSuffix = Date.now();

  try {
    // --- auth gate ---
    const noAuth = await api("/api/customer-auth/events");
    check("events feed without a global session -> 401", noAuth.status === 401);

    // --- a global customer session to read the feed with ---
    const email = `explore-events-${runSuffix}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Events Tester", email, password: "password123", phone: "9811110098" },
    });
    const mint = await api("/__test__/mint-global-token", {
      method: "POST",
      body: { email, type: "email_verify" },
    });
    await api(`/api/customer-auth/verify-email?token=${mint.body.token}`);
    const login = await api("/api/customer-auth/login", {
      method: "POST",
      body: { email, password: "password123" },
    });
    const globalToken = login.body.token;
    check("global customer login -> token issued", Boolean(globalToken));

    // --- two outlets, two events, out-of-order creation, must sort by date ---
    const adminLoginA = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const tokenA = adminLoginA.body.token;

    const outletB = await makeSiblingOutlet(baseUrl, { label: `ev${runSuffix}`, category: "bakery" });
    const tokenB = outletB.adminToken;

    // A is created first but dated LATER than B, which is created second —
    // proves the feed sorts by date, not creation order.
    const eventA = await api("/api/admin/events", {
      method: "POST",
      token: tokenA,
      company: COMPANY,
      outlet: SLUG,
      body: { title: `Later Event ${runSuffix}`, date: isoDate(new Date(now.getTime() + 3 * DAY_MS)) },
    });
    check("create later event at outlet A -> 201", eventA.status === 201);

    const eventB = await api("/api/admin/events", {
      method: "POST",
      token: tokenB,
      company: COMPANY,
      outlet: outletB.outletSlug,
      body: { title: `Sooner Event ${runSuffix}`, date: isoDate(new Date(now.getTime() + 1 * DAY_MS)) },
    });
    check("create sooner event at outlet B -> 201", eventB.status === 201);

    // --- a past event at outlet A, must never appear ---
    const pastEvent = await api("/api/admin/events", {
      method: "POST",
      token: tokenA,
      company: COMPANY,
      outlet: SLUG,
      body: { title: `Past Event ${runSuffix}`, date: isoDate(new Date(now.getTime() - 1 * DAY_MS)) },
    });
    check("create past event -> 201", pastEvent.status === 201);

    const feed1 = await api("/api/customer-auth/events", { token: globalToken });
    check("events feed -> 200", feed1.status === 200);
    const titles1 = (feed1.body.events || []).map((e) => e.title);
    check("feed includes outlet A's event", titles1.includes(`Later Event ${runSuffix}`));
    check("feed includes outlet B's event", titles1.includes(`Sooner Event ${runSuffix}`));
    check("feed excludes the past event", !titles1.includes(`Past Event ${runSuffix}`));
    const idxSooner = titles1.indexOf(`Sooner Event ${runSuffix}`);
    const idxLater = titles1.indexOf(`Later Event ${runSuffix}`);
    check("sooner event sorts before the later one despite being created second", idxSooner < idxLater, { idxSooner, idxLater });
    check("outlet attribution present", (feed1.body.events || []).every((e) => e.slug && e.companySlug && e.businessName));

    // --- a suspended outlet's event disappears from the feed ---
    const outletC = await makeSiblingOutlet(baseUrl, { label: `evc${runSuffix}`, category: "cafe" });
    const eventC = await api("/api/admin/events", {
      method: "POST",
      token: outletC.adminToken,
      company: COMPANY,
      outlet: outletC.outletSlug,
      body: { title: `Suspendable Event ${runSuffix}`, date: isoDate(new Date(now.getTime() + 2 * DAY_MS)) },
    });
    check("create event at outlet C -> 201", eventC.status === 201);

    const feedBeforeSuspend = await api("/api/customer-auth/events", { token: globalToken });
    check("feed includes outlet C's event before suspension",
      (feedBeforeSuspend.body.events || []).some((e) => e.title === `Suspendable Event ${runSuffix}`));

    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const suspend = await api(`/api/platform/outlets/${outletC.outletId}`, {
      method: "PATCH",
      token: platformToken,
      body: { status: "suspended" },
    });
    check("platform suspends outlet C -> 200", suspend.status === 200);

    const feedAfterSuspend = await api("/api/customer-auth/events", { token: globalToken });
    check("feed excludes outlet C's event after suspension",
      !(feedAfterSuspend.body.events || []).some((e) => e.title === `Suspendable Event ${runSuffix}`));

    // --- cap at 50: 55 future events at a dedicated outlet, only the
    // soonest 50 across the whole platform come back ---
    const outletD = await makeSiblingOutlet(baseUrl, { label: `evd${runSuffix}`, category: "gym" });
    const CAP_TOTAL = 55;
    await Promise.all(
      Array.from({ length: CAP_TOTAL }, (_, i) =>
        api("/api/admin/events", {
          method: "POST",
          token: outletD.adminToken,
          company: COMPANY,
          outlet: outletD.outletSlug,
          // Offsets start well past the 1-3 day events above, so none of the
          // capped-out events can displace an earlier one already counted.
          body: { title: `CapEvent-${i + 1}`, date: isoDate(new Date(now.getTime() + (100 + i) * DAY_MS)) },
        })
      )
    );

    const feed2 = await api("/api/customer-auth/events", { token: globalToken });
    check("feed never exceeds the 50-event cap", (feed2.body.events || []).length === 50, feed2.body.events?.length);
    const titles2 = feed2.body.events.map((e) => e.title);
    // Two pre-existing, still-active future events (Later Event, Sooner
    // Event) occupy 2 of the 50 slots, leaving room for exactly the 48
    // soonest CapEvents (1..48); 49..55 fall outside the cap.
    check("CapEvent-1 (soonest of the batch) is included", titles2.includes("CapEvent-1"));
    check("CapEvent-48 is included", titles2.includes("CapEvent-48"));
    check("CapEvent-49 is excluded by the cap", !titles2.includes("CapEvent-49"));
    check("CapEvent-55 (furthest out) is excluded by the cap", !titles2.includes("CapEvent-55"));
    const dates2 = feed2.body.events.map((e) => new Date(e.date).getTime());
    const sorted = dates2.every((d, i) => i === 0 || dates2[i - 1] <= d);
    check("capped feed stays sorted soonest-first", sorted);
  } finally {
    stop();
  }

  if (failures) { console.error(`explore-events: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("explore-events: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node backend/tests/explore-events.js
```

Expected: FAIL on "events feed without a global session -> 401" (or a
connection-level error) — the route doesn't exist yet, so the request 404s
instead of 401.

- [ ] **Step 3: Generalize the date filter in `eventService.js`**

Replace the two inline `startOfToday` computations (in `getUpcomingForOrg`)
with a shared helper, and add the unscoped sibling. In
`backend/services/eventService.js`:

```js
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const getUpcomingForOrg = async (organizationId, limit = 3) => {
  return Event.find({ organizationId, date: { $gte: startOfToday() } })
    .sort({ date: 1 })
    .limit(limit);
};

// No organizationId filter, no limit — the cross-tenant events feed
// (discoveryService.getUpcomingEventsFeed) applies its own cap AFTER
// dropping events whose outlet/company turns out to be inactive, so a limit
// here would be premature.
const getUpcomingAllOrgs = async () => {
  return Event.find({ date: { $gte: startOfToday() } }).sort({ date: 1 });
};
```

Update the exports at the bottom of the file to include `getUpcomingAllOrgs`
alongside the existing four.

- [ ] **Step 4: Add the aggregation to `discoveryService.js`**

In `backend/services/discoveryService.js`, add the import and the new
function (keep everything already in the file unchanged):

```js
const { getUpcomingAllOrgs } = require("./eventService");

const EVENTS_FEED_LIMIT = 50;

// The events-feed counterpart to getDiscoverBusinesses above: same
// deliberate lack of an organizationId filter, same reason (display-only
// public listing data, not loyalty data), same "loop and join in JS"
// pattern the mock DB's lack of $in/aggregation forces on every cross-tenant
// read in this codebase.
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
    // events is already sorted soonest-first, so the first `limit` survivors
    // of the active-org/active-company filter ARE the soonest `limit` — no
    // need to keep scanning once the cap is hit.
    if (feed.length >= limit) break;

    const org = orgsById.get(event.organizationId.toString());
    if (!org) continue; // suspended or deleted outlet
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

Add `getUpcomingEventsFeed` to the file's `module.exports` alongside
`getDiscoverBusinesses`.

- [ ] **Step 5: Controller action**

In `backend/controllers/discoveryController.js`:

```js
const { getDiscoverBusinesses, getUpcomingEventsFeed } = require("../services/discoveryService");

const discover = async (req, res, next) => {
  try {
    const result = await getDiscoverBusinesses();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

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

- [ ] **Step 6: Route**

In `backend/routes/customerAccountRoutes.js`, change the discovery import
and add the route right beside `/discover`:

```js
const { discover, events: exploreEvents } = require("../controllers/discoveryController");
```

```js
// Cross-tenant customer surface (/explore) — global session only, no tenant.
router.get("/discover", verifyGlobalSession, discover);
router.get("/events", verifyGlobalSession, exploreEvents);
router.get("/my-tenants", verifyGlobalSession, getMyTenants);
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
node backend/tests/explore-events.js
```

Expected: every check `PASS`.

- [ ] **Step 8: Add to the test chain**

In `backend/package.json`, append `&& node tests/explore-events.js` to the
end of the `test` script (after `node tests/places-tool.js`).

- [ ] **Step 9: Run the full backend suite**

```bash
cd backend && npm test
```

Expected: 0 failures across every suite, including the new one and
`upcoming-events.js` (proving `getUpcomingForOrg`'s behavior is unchanged by
the refactor).

- [ ] **Step 10: Commit**

```bash
git add backend/services/eventService.js backend/services/discoveryService.js backend/controllers/discoveryController.js backend/routes/customerAccountRoutes.js backend/package.json backend/tests/explore-events.js
git commit -m "feat: add cross-tenant events feed endpoint for /explore"
```

---

## Task 2: Frontend — `/explore/events` page and nav tab

**Files:**
- Create: `frontend/src/hooks/useExploreEvents.ts`
- Create: `frontend/src/routes/ExploreEvents.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/customer/GlobalCustomerLayout.tsx`

**Interfaces:**
- Consumes: `GET /api/customer-auth/events` (Task 1); `EventCard` (existing,
  unchanged); `tenantPath` (existing, unchanged)
- Produces: `useExploreEvents()` hook; `ExploreEvents` route component at
  `/explore/events`; a fourth nav tab in `GlobalCustomerLayout`

This task has no backend test to fail first — it's a read-only frontend
consumer of an endpoint Task 1 already proved correct. Verification here is
`npm run lint` plus the manual checks in Step 5.

- [ ] **Step 1: The hook**

Create `frontend/src/hooks/useExploreEvents.ts`:

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

- [ ] **Step 2: The route component**

Create `frontend/src/routes/ExploreEvents.tsx`:

```tsx
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";

import { useExploreEvents, type ExploreEvent } from "../hooks/useExploreEvents";
import { tenantPath } from "../lib/tenantPath";
import { EventCard } from "../components/customer/EventCard";
import { Skeleton } from "../components/ui/skeleton";

// The events counterpart to ExploreMine: a flat, slug-less list rather than
// a filterable grid, because date is the only ordering this surface offers
// (see the design doc — Discover already owns search/category/distance).
export default function ExploreEvents() {
  const { data: events = [], isLoading } = useExploreEvents();

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Events</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          Upcoming events from every business on Stampd.
        </p>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px] w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-12 text-center shadow-ambient">
          <CalendarDays className="mx-auto h-7 w-7 text-[var(--soft)]" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-[var(--muted)]">
            No upcoming events yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <EventListingCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

// Local, not a shared component: the only thing this adds beyond EventCard
// itself is "which business is this" — necessary here because the feed
// mixes many outlets on one screen, unlike EventCard's other caller
// (CustomerDashboard, already inside one outlet's context).
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

- [ ] **Step 3: Wire the route in `App.tsx`**

Add the lazy import beside the other `Explore*` ones:

```tsx
const ExploreEvents = lazy(() => import('./routes/ExploreEvents'));
```

Add the route inside the existing `<Route element={<GlobalCustomerLayout />}>`
block, beside `/explore/mine`:

```tsx
<Route path="/explore" element={<Explore />} />
<Route path="/explore/events" element={<ExploreEvents />} />
<Route path="/explore/mine" element={<ExploreMine />} />
<Route path="/explore/profile" element={<ExploreProfile />} />
```

- [ ] **Step 4: The nav tab in `GlobalCustomerLayout.tsx`**

Add `CalendarDays` to the existing lucide-react import:

```tsx
import { QrCode, Compass, CalendarDays, Store, CircleUser } from "lucide-react";
```

Add the tab to BOTH the desktop nav (`variant="top"`) and the mobile footer
nav (`variant="bottom"`), in each case right after Home:

```tsx
<Tab to="/explore" icon={Compass} label="Home" variant="top" />
<Tab to="/explore/events" icon={CalendarDays} label="Events" variant="top" />
<Tab to="/explore/mine" icon={Store} label="My businesses" variant="top" />
<Tab to="/explore/profile" icon={CircleUser} label="Profile" variant="top" />
```

```tsx
<Tab to="/explore" icon={Compass} label="Home" variant="bottom" />
<Tab to="/explore/events" icon={CalendarDays} label="Events" variant="bottom" />
<Tab to="/explore/mine" icon={Store} label="My businesses" variant="bottom" />
<Tab to="/explore/profile" icon={CircleUser} label="Profile" variant="bottom" />
```

- [ ] **Step 5: Verify**

```bash
npm run lint
```

Expected: clean (`tsc --noEmit`, no errors).

Manual/local-server spot check (optional but recommended if a dev server is
available): sign in as a customer at `/explore`, confirm a new "Events" tab
appears in both the desktop and mobile nav, navigate to it, confirm events
created across different seeded outlets (`durbarmarg@coffesarowar.com` etc.
via `AdminEvents.tsx`) appear soonest-first with correct business
attribution, and that tapping a card lands on that outlet's dashboard.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useExploreEvents.ts frontend/src/routes/ExploreEvents.tsx frontend/src/App.tsx frontend/src/components/customer/GlobalCustomerLayout.tsx
git commit -m "feat: add cross-tenant events feed to /explore"
```

---

## Task 3: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite**

```bash
cd backend && npm test
```

Expected: 0 failures across all suites (including `explore-events.js` and
`upcoming-events.js`).

- [ ] **Step 2: Frontend typecheck**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 3: Confirm scope**

```bash
git diff main --stat
```

Expected: only the files listed in Tasks 1–2, plus the two docs from this
plan's own spec/plan authoring — nothing under `AdminLayout.tsx`,
`CustomerLayout.tsx`, or `AdminEvents.tsx`.

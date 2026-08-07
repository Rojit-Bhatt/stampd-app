# Image Pipeline Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix uploaded branding logos/banners, reward images, and event images not appearing in the customer-facing app, despite uploading correctly through the admin console.

**Architecture:** This app has two parallel image systems: legacy string URLs (`logoUrl`/`bannerUrl`/`imageUrl`) and the current id-based system (`logoImageId`/`bannerImageId`/`imageId` → served from `/api/images/:id`, resolved via `lib/images.ts`'s `resolveImageUrl(imageId, fallbackUrl)`, id wins if present). Uploads correctly write the id fields. The bug is entirely on the **read** side: 4 backend response-shaping functions strip the id fields out before they reach the client, and 5 frontend render sites read the legacy string field directly instead of calling `resolveImageUrl`. Every fix follows the same two-line pattern — no new architecture.

**Tech Stack:** Express/Node backend (`node tests/*.js` against the in-memory mock DB), React/TypeScript frontend.

## Global Constraints
- `resolveImageUrl(imageId, fallbackUrl)` in `frontend/src/lib/images.ts` is the ONLY way to turn an id + legacy URL into a render-ready URL — never hand-roll `/api/images/${id}` elsewhere.
- Backend query matching only supports top-level equality, `$or`, `$lte`, `$gte` (in-memory mock DB).
- Every new/changed backend behavior needs a covering test added to `backend/tests/`, and any new test file must be added to `backend/package.json`'s `test` script chain or it never runs.
- `MenuItem` has no image field — `fromMenu` catalog entries' `imageUrl: ""` in `pointsService.js` is correct as-is and must NOT be touched.

---

### Task 1: Backend — pass `imageId` fields through in all 4 response shapers

**Files:**
- Modify: `backend/services/pointsService.js:461-469` (`getRedeemCatalog`'s `fromRewards` map)
- Modify: `backend/services/discoveryService.js:37-58` (`getDiscoverBusinesses`)
- Modify: `backend/services/discoveryService.js:86-115` (`getUpcomingEventsFeed`)
- Modify: `backend/services/customerAccountService.js:684-701` (`getMyTenants`)
- Test: `backend/tests/rewards-catalog.js` (extend existing catalog test)
- Test: `backend/tests/explore-events.js` if it exists, else `backend/tests/global-directory.js` — check which file covers `/api/customer-auth/discover` and `/api/customer-auth/events` before choosing (see Step 5)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: response shapes that Tasks 2-5's frontend fixes depend on — `RewardItem.imageId`, discovery `branding.logoImageId`/`branding.bannerImageId`, events `imageId`, `MyTenantMembership.branding.logoImageId`/`bannerImageId`. Task 1 must land before Tasks 2-5's frontend changes can show anything (the frontend fixes are inert without the backend sending the field), though each frontend task can still be written/reviewed independently.

- [x] **Step 1: Extend `rewards-catalog.js` to assert `imageId` passes through**

Open `backend/tests/rewards-catalog.js`. Find:

```javascript
    const rw = await api("/api/admin/rewards", {
      method: "POST", token: adminToken,
      body: { name: "Enamel Pin", description: "Small, ours.", pointsPrice: 50 },
    });
    check("a standalone reward is created -> 201", rw.status === 201, rw.body);
    check("its price comes back in points, not centi", rw.body.reward.pointsPrice === 50, rw.body.reward);

    const cat = await api("/api/points/catalog", { token: customerToken });
    const byName = Object.fromEntries((cat.body.data || []).map((i) => [i.name, i]));
    check("a priced menu item is in the catalog", byName["House Coffee"]?.kind === "menu", cat.body.data);
    check("the standalone reward is in the catalog", byName["Enamel Pin"]?.kind === "reward", cat.body.data);
```

Replace with (adds a fake-but-valid-shaped ObjectId string as `imageId` on creation, then asserts it survives into the catalog read):

```javascript
    const FAKE_IMAGE_ID = "64b1f0c9a1b2c3d4e5f60789";
    const rw = await api("/api/admin/rewards", {
      method: "POST", token: adminToken,
      body: { name: "Enamel Pin", description: "Small, ours.", pointsPrice: 50, imageId: FAKE_IMAGE_ID },
    });
    check("a standalone reward is created -> 201", rw.status === 201, rw.body);
    check("its price comes back in points, not centi", rw.body.reward.pointsPrice === 50, rw.body.reward);

    const cat = await api("/api/points/catalog", { token: customerToken });
    const byName = Object.fromEntries((cat.body.data || []).map((i) => [i.name, i]));
    check("a priced menu item is in the catalog", byName["House Coffee"]?.kind === "menu", cat.body.data);
    check("the standalone reward is in the catalog", byName["Enamel Pin"]?.kind === "reward", cat.body.data);
    check(
      "the reward's imageId survives into the catalog response",
      byName["Enamel Pin"]?.imageId === FAKE_IMAGE_ID,
      byName["Enamel Pin"],
    );
```

- [x] **Step 2: Run the test to verify the new check fails against the OLD code**

Run: `cd backend && node tests/rewards-catalog.js`
Expected: FAIL on "the reward's imageId survives into the catalog response" — the current `fromRewards` map never includes `imageId`.

- [x] **Step 3: Add `imageId` to `getRedeemCatalog`'s reward mapping**

Open `backend/services/pointsService.js`. Find:

```javascript
  const fromRewards = rewardItems.map((item) => ({
    id: item._id.toString(),
    kind: "reward",
    name: item.name,
    description: item.description || "",
    category: "Rewards",
    imageUrl: item.imageUrl || "",
    pointsPrice: toPoints(item.pointsPriceCenti)
  }));
```

Replace with:

```javascript
  const fromRewards = rewardItems.map((item) => ({
    id: item._id.toString(),
    kind: "reward",
    name: item.name,
    description: item.description || "",
    category: "Rewards",
    imageUrl: item.imageUrl || "",
    imageId: item.imageId || null,
    pointsPrice: toPoints(item.pointsPriceCenti)
  }));
```

- [x] **Step 4: Run the catalog test to verify it passes**

Run: `cd backend && node tests/rewards-catalog.js`
Expected: `rewards-catalog: all PASS`.

- [x] **Step 5: Find (or write) the tests covering `/api/customer-auth/discover`, `/api/customer-auth/events`, and `/api/customer-auth/my-tenants`**

Run: `cd backend && grep -rl "customer-auth/discover\|customer-auth/events\|customer-auth/my-tenants" tests/*.js`

Note whichever file(s) it prints — you'll extend them in Step 6. If none is found for one of the three endpoints, add a minimal new check to the closest related existing file (e.g. `tests/global-directory.js` if it covers `/discover`) rather than creating a whole new test file, unless truly none of the three endpoints are covered anywhere, in which case create `backend/tests/image-passthrough.js` following the exact `bootServer`/`api`/`check` pattern used in `backend/tests/rewards-catalog.js` (copy its top-of-file structure), and add it to `backend/package.json`'s `test` chain.

- [x] **Step 6: Add `imageId`/`logoImageId`/`bannerImageId` assertions to the discovered test file(s)**

For whichever file(s) Step 5 found, add checks of this shape (adapt endpoint path, auth headers, and variable names to match that file's existing conventions — do not guess field names, read the surrounding code for the exact request pattern first):

```javascript
    // Discovery businesses carry logoImageId/bannerImageId, not just the
    // legacy logoUrl/bannerUrl string fields.
    const discover = await api("/api/customer-auth/discover", { token: globalToken });
    const org = (discover.body.businesses || []).find((b) => b.slug === "durbarmarg");
    check(
      "discovery response includes branding.logoImageId (or null) as a key",
      org && Object.prototype.hasOwnProperty.call(org.branding, "logoImageId"),
      org?.branding,
    );
    check(
      "discovery response includes branding.bannerImageId (or null) as a key",
      org && Object.prototype.hasOwnProperty.call(org.branding, "bannerImageId"),
      org?.branding,
    );
```

```javascript
    // Events feed carries the event's imageId, not just imageUrl.
    const events = await api("/api/customer-auth/events", { token: globalToken });
    check(
      "events feed items include an imageId key",
      (events.body.events || []).every((e) => Object.prototype.hasOwnProperty.call(e, "imageId")),
      events.body.events,
    );
```

```javascript
    // my-tenants carries branding.logoImageId/bannerImageId too.
    const mine = await api("/api/customer-auth/my-tenants", { token: globalToken });
    check(
      "my-tenants response includes branding.logoImageId key on each membership",
      (mine.body.tenants || mine.body || []).every === undefined ||
        (mine.body.tenants || mine.body).every((t) => Object.prototype.hasOwnProperty.call(t.branding, "logoImageId")),
      mine.body,
    );
```

(The exact response envelope for `/my-tenants` — whether it's `{tenants: [...]}` or a bare array — must be confirmed by reading `customerAccountController.js`'s `getMyTenantsController` before writing this assertion; adjust the property access accordingly rather than guessing.)

- [x] **Step 7: Run the extended test(s) to verify they fail against the OLD code**

Run whatever command Step 5/6 targeted (e.g. `cd backend && node tests/<file>.js`).
Expected: FAIL on the new `hasOwnProperty` checks — none of these fields exist in the current responses.

- [x] **Step 8: Add the missing fields in `discoveryService.js` and `customerAccountService.js`**

Open `backend/services/discoveryService.js`. In `getDiscoverBusinesses`, find:

```javascript
        branding: {
          bannerUrl: org.branding.bannerUrl,
          logoUrl: org.branding.logoUrl,
          primaryColor: org.branding.primaryColor
        },
```

Replace with:

```javascript
        branding: {
          bannerUrl: org.branding.bannerUrl,
          logoUrl: org.branding.logoUrl,
          bannerImageId: org.branding.bannerImageId || null,
          logoImageId: org.branding.logoImageId || null,
          primaryColor: org.branding.primaryColor
        },
```

In the same file, `getUpcomingEventsFeed`, find:

```javascript
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
```

Replace with:

```javascript
      imageUrl: event.imageUrl,
      imageId: event.imageId || null,
      organizationId: org._id.toString(),
      slug: org.slug,
      companySlug: company.slug,
      businessName: org.name,
      branding: {
        logoUrl: org.branding.logoUrl,
        logoImageId: org.branding.logoImageId || null,
        primaryColor: org.branding.primaryColor
      }
    });
```

Open `backend/services/customerAccountService.js`. In `getMyTenants`, find:

```javascript
        branding: {
          logoUrl: org.branding.logoUrl,
          bannerUrl: org.branding.bannerUrl,
          primaryColor: org.branding.primaryColor
        },
```

Replace with:

```javascript
        branding: {
          logoUrl: org.branding.logoUrl,
          bannerUrl: org.branding.bannerUrl,
          logoImageId: org.branding.logoImageId || null,
          bannerImageId: org.branding.bannerImageId || null,
          primaryColor: org.branding.primaryColor
        },
```

- [x] **Step 9: Run the extended test(s) to verify they pass**

Run the same command as Step 7.
Expected: all PASS.

- [x] **Step 10: Run the full backend suite to check for regressions**

Run: `cd backend && npm test 2>&1 | tail -30`
Expected: all suites pass.

- [x] **Step 11: Commit**

```bash
git add backend/services/pointsService.js backend/services/discoveryService.js backend/services/customerAccountService.js backend/tests/
git commit -m "$(cat <<'EOF'
fix: pass imageId fields through in catalog/discovery/my-tenants responses

Reward catalog, cross-tenant discovery, the events feed, and my-tenants
all stripped the id-based image fields (logoImageId/bannerImageId/
imageId) before sending, leaving only the legacy string URL fields.
Uploaded images never appeared in the customer app as a result — the
frontend's resolveImageUrl() had nothing to resolve. This is the
backend half of the fix; frontend read sites are fixed in follow-up
commits.
EOF
)"
```

---

### Task 2: Frontend — outlet branding logo/banner (CustomerLayout + BusinessLanding)

**Files:**
- Modify: `frontend/src/context/TenantContext.tsx:8-13` (`TenantBranding` interface)
- Modify: `frontend/src/components/customer/CustomerLayout.tsx:100-106`
- Modify: `frontend/src/routes/BusinessLanding.tsx:17-27`

**Interfaces:**
- Consumes: Task 1's backend change is a prerequisite for this to show anything real, but this task's own diff and tests don't depend on Task 1 landing first — it can be written and typechecked independently.
- Produces: nothing consumed by later tasks.

**Context:** `tenant.branding` is typed without `logoImageId`/`bannerImageId` even though the backend's `Organization.branding` model has always had them (`backend/models/Organization.js:29-35`) and `tenantController.js` returns the full `organization.branding` object. Both `CustomerLayout.tsx` (the outlet header logo) and `BusinessLanding.tsx` (a company's outlet landing card) read `branding.logoUrl`/`branding.bannerUrl` directly, ignoring the id fields entirely.

- [x] **Step 1: Add the id fields to `TenantBranding`**

Open `frontend/src/context/TenantContext.tsx`. Find:

```typescript
export interface TenantBranding {
  tagline: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
}
```

Replace with:

```typescript
export interface TenantBranding {
  tagline: string;
  logoUrl: string;
  bannerUrl: string;
  logoImageId: string | null;
  bannerImageId: string | null;
  primaryColor: string;
}
```

- [x] **Step 2: Fix `CustomerLayout.tsx`'s logo render**

Open `frontend/src/components/customer/CustomerLayout.tsx`. Add the import at the top of the file, alongside the other `lib/` imports:

```typescript
import { resolveImageUrl } from "../../lib/images";
```

Find:

```typescript
            {tenant?.branding?.logoUrl ? (
              <img
                src={tenant.branding.logoUrl}
                alt=""
                className="h-9 w-9 flex-shrink-0 rounded-[var(--radius-field)] object-cover"
              />
            ) : (
```

Replace with:

```typescript
            {resolveImageUrl(tenant?.branding?.logoImageId, tenant?.branding?.logoUrl) ? (
              <img
                src={resolveImageUrl(tenant?.branding?.logoImageId, tenant?.branding?.logoUrl)}
                alt=""
                className="h-9 w-9 flex-shrink-0 rounded-[var(--radius-field)] object-cover"
              />
            ) : (
```

- [x] **Step 3: Fix `BusinessLanding.tsx`'s logo and banner render**

Open `frontend/src/routes/BusinessLanding.tsx`. Add the import:

```typescript
import { resolveImageUrl } from "../lib/images";
```

Find:

```typescript
            branding?.bannerUrl
              ? { backgroundImage: `url(${branding.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
```

Replace with:

```typescript
            resolveImageUrl(branding?.bannerImageId, branding?.bannerUrl)
              ? { backgroundImage: `url(${resolveImageUrl(branding?.bannerImageId, branding?.bannerUrl)})`, backgroundSize: "cover", backgroundPosition: "center" }
```

Find:

```typescript
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
```

Replace with:

```typescript
          {resolveImageUrl(branding?.logoImageId, branding?.logoUrl) ? (
            <img
              src={resolveImageUrl(branding?.logoImageId, branding?.logoUrl)}
```

- [x] **Step 4: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (the `TenantBranding` fields are additive — every existing consumer that only reads `logoUrl`/`bannerUrl`/`primaryColor` is unaffected).

- [x] **Step 5: Commit**

```bash
git add frontend/src/context/TenantContext.tsx frontend/src/components/customer/CustomerLayout.tsx frontend/src/routes/BusinessLanding.tsx
git commit -m "$(cat <<'EOF'
fix: outlet logo/banner resolve through resolveImageUrl, not raw legacy fields

CustomerLayout (outlet header) and BusinessLanding (company outlet card)
read branding.logoUrl/bannerUrl directly, ignoring the id-based
logoImageId/bannerImageId fields a fresh upload actually writes to.
EOF
)"
```

---

### Task 3: Frontend — reward catalog images (CustomerDashboard)

**Files:**
- Modify: `frontend/src/hooks/usePoints.ts:49-56` (`RewardItem` interface)
- Modify: `frontend/src/routes/CustomerDashboard.tsx:241-250`

**Interfaces:**
- Consumes: Task 1's backend `imageId` field on catalog reward entries.
- Produces: nothing consumed by later tasks.

- [x] **Step 1: Add `imageId` to `RewardItem`**

Open `frontend/src/hooks/usePoints.ts`. Find:

```typescript
export interface RewardItem {
  id: string;
  name: string;
  description: string;
  category: string;
  pointsPrice: number;
  imageUrl?: string;
}
```

Replace with:

```typescript
export interface RewardItem {
  id: string;
  name: string;
  description: string;
  category: string;
  pointsPrice: number;
  imageUrl?: string;
  imageId?: string | null;
}
```

- [x] **Step 2: Fix the reward tile image render**

Open `frontend/src/routes/CustomerDashboard.tsx`. Add the import alongside the other `lib/` imports:

```typescript
import { resolveImageUrl } from "../lib/images";
```

Find:

```typescript
                {catalog.slice(0, 4).map((item) => {
                  const canAfford = item.pointsPrice <= balance;
                  return (
                    <li key={item.id} className="flex items-center gap-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                        />
                      ) : (
```

Replace with:

```typescript
                {catalog.slice(0, 4).map((item) => {
                  const canAfford = item.pointsPrice <= balance;
                  const itemImageUrl = resolveImageUrl(item.imageId, item.imageUrl);
                  return (
                    <li key={item.id} className="flex items-center gap-3">
                      {itemImageUrl ? (
                        <img
                          src={itemImageUrl}
                          alt={item.name}
                          className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                        />
                      ) : (
```

- [x] **Step 3: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [x] **Step 4: Commit**

```bash
git add frontend/src/hooks/usePoints.ts frontend/src/routes/CustomerDashboard.tsx
git commit -m "$(cat <<'EOF'
fix: reward catalog tiles resolve image through resolveImageUrl

CustomerDashboard's redeem-preview tiles read item.imageUrl directly;
an uploaded reward image (stored via imageId) never rendered there.
EOF
)"
```

---

### Task 4: Frontend — event images (EventCard, shared by CustomerDashboard and ExploreEvents)

**Files:**
- Modify: `frontend/src/context/TenantContext.tsx:32-40` (`TenantEvent` interface)
- Modify: `frontend/src/hooks/useExploreEvents.ts:4-21` (`ExploreEvent` interface)
- Modify: `frontend/src/components/customer/EventCard.tsx`

**Interfaces:**
- Consumes: Task 1's backend `imageId` field on both the outlet-scoped `upcomingEvents` and the cross-tenant events feed.
- Produces: nothing consumed by later tasks.

**Context:** `EventCard.tsx` is shared by `CustomerDashboard.tsx` (outlet-scoped `upcomingEvents`, typed `TenantEvent`) and `ExploreEvents.tsx` (cross-tenant feed, typed `ExploreEvent`) — fixing it once fixes both call sites, provided both types carry `imageId`.

- [x] **Step 1: Add `imageId` to `TenantEvent`**

Open `frontend/src/context/TenantContext.tsx`. Find:

```typescript
export interface TenantEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
}
```

Replace with:

```typescript
export interface TenantEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
}
```

- [x] **Step 2: Add `imageId` to `ExploreEvent`**

Open `frontend/src/hooks/useExploreEvents.ts`. Find:

```typescript
export interface ExploreEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  organizationId: string;
```

Replace with:

```typescript
export interface ExploreEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  organizationId: string;
```

- [x] **Step 3: Fix `EventCard.tsx`'s image render**

Open `frontend/src/components/customer/EventCard.tsx` in full first (it's small) to see its exact current prop-destructure and `img` JSX before editing — the `Pick<TenantEvent, ...>` type parameter list must gain `"imageId"` and the render logic must switch to `resolveImageUrl`. Add the import:

```typescript
import { resolveImageUrl } from "../../lib/images";
```

Find the prop type:

```typescript
  event: Pick<TenantEvent, "title" | "date" | "time" | "location" | "description" | "imageUrl">;
```

Replace with:

```typescript
  event: Pick<TenantEvent, "title" | "date" | "time" | "location" | "description" | "imageUrl" | "imageId">;
```

Find:

```typescript
      {event.imageUrl && (
        <img
          src={event.imageUrl}
```

Replace with (compute once, reuse for both the truthiness check and the `src`):

```typescript
      {resolveImageUrl(event.imageId, event.imageUrl) && (
        <img
          src={resolveImageUrl(event.imageId, event.imageUrl)}
```

- [x] **Step 4: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors. If `ExploreEvents.tsx` passes an `ExploreEvent` into `EventCard`'s `event` prop and TypeScript complains about a structural mismatch, confirm `ExploreEvent` now has `imageId: string | null` matching `TenantEvent`'s — the two must have exactly the same type for this field for structural assignability to hold.

- [x] **Step 5: Commit**

```bash
git add frontend/src/context/TenantContext.tsx frontend/src/hooks/useExploreEvents.ts frontend/src/components/customer/EventCard.tsx
git commit -m "$(cat <<'EOF'
fix: event images resolve through resolveImageUrl in shared EventCard

EventCard (used by both the outlet dashboard's upcoming events and the
cross-tenant Explore events feed) read event.imageUrl directly; an
uploaded event image never rendered in either place.
EOF
)"
```

---

### Task 5: Frontend — discovery listings (Explore, ExploreMine)

**Files:**
- Modify: `frontend/src/hooks/useDiscover.ts:18-22` (`DiscoverBusiness.branding`)
- Modify: `frontend/src/hooks/useMyTenants.ts:10-14` (`MyTenantMembership.branding`)
- Modify: `frontend/src/routes/Explore.tsx:221-234`
- Modify: `frontend/src/routes/ExploreMine.tsx:66-68`

**Interfaces:**
- Consumes: Task 1's backend `logoImageId`/`bannerImageId` fields on `getDiscoverBusinesses` and `getMyTenants`.
- Produces: nothing consumed by later tasks.

- [x] **Step 1: Add the id fields to `DiscoverBusiness.branding`**

Open `frontend/src/hooks/useDiscover.ts`. Find:

```typescript
  branding: {
    bannerUrl: string;
    logoUrl: string;
    primaryColor: string;
  };
```

Replace with:

```typescript
  branding: {
    bannerUrl: string;
    logoUrl: string;
    bannerImageId: string | null;
    logoImageId: string | null;
    primaryColor: string;
  };
```

- [x] **Step 2: Add the id fields to `MyTenantMembership.branding`**

Open `frontend/src/hooks/useMyTenants.ts`. Find:

```typescript
  branding: {
    logoUrl: string;
    bannerUrl: string;
    primaryColor: string;
  };
```

Replace with:

```typescript
  branding: {
    logoUrl: string;
    bannerUrl: string;
    logoImageId: string | null;
    bannerImageId: string | null;
    primaryColor: string;
  };
```

- [x] **Step 3: Fix `Explore.tsx`'s banner and logo render**

Open `frontend/src/routes/Explore.tsx`. Add the import:

```typescript
import { resolveImageUrl } from "../lib/images";
```

Find:

```typescript
          business.branding.bannerUrl
```

and the block it's part of:

```typescript
                backgroundImage: `url(${business.branding.bannerUrl})`,
```

Replace both occurrences (the truthiness check and the `backgroundImage` value) so they read through `resolveImageUrl(business.branding.bannerImageId, business.branding.bannerUrl)` instead of `business.branding.bannerUrl` directly — read the surrounding ~15 lines first to see the exact conditional structure (a ternary building a `style` object) before editing, since the plan can't show the full block without risking a stale line match if unrelated formatting shifted.

Find:

```typescript
        {business.branding.logoUrl ? (
          <img
            src={business.branding.logoUrl}
```

Replace with:

```typescript
        {resolveImageUrl(business.branding.logoImageId, business.branding.logoUrl) ? (
          <img
            src={resolveImageUrl(business.branding.logoImageId, business.branding.logoUrl)}
```

- [x] **Step 4: Fix `ExploreMine.tsx`'s logo render**

Open `frontend/src/routes/ExploreMine.tsx`. Add the import:

```typescript
import { resolveImageUrl } from "../lib/images";
```

Find:

```typescript
        {m.branding.logoUrl ? (
          <img
            src={m.branding.logoUrl}
```

Replace with:

```typescript
        {resolveImageUrl(m.branding.logoImageId, m.branding.logoUrl) ? (
          <img
            src={resolveImageUrl(m.branding.logoImageId, m.branding.logoUrl)}
```

- [x] **Step 5: Run frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [x] **Step 6: Commit**

```bash
git add frontend/src/hooks/useDiscover.ts frontend/src/hooks/useMyTenants.ts frontend/src/routes/Explore.tsx frontend/src/routes/ExploreMine.tsx
git commit -m "$(cat <<'EOF'
fix: Explore/ExploreMine logos and banners resolve through resolveImageUrl

Discovery listings (the /explore grid and "My Places") read
branding.logoUrl/bannerUrl directly, ignoring logoImageId/bannerImageId.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** all image sites named in the spec are covered — branding logo/banner (Task 2), reward tiles (Task 3), event images (Task 4), discovery listings (Task 5) — plus the backend passthrough gap that makes all four possible (Task 1). `MenuItem`'s deliberate lack of an image field is explicitly called out as NOT a bug (Global Constraints) so no task touches it.
- **Type consistency:** `resolveImageUrl(imageId, fallbackUrl)` signature used identically everywhere it's called across all 5 tasks; `TenantEvent.imageId` and `ExploreEvent.imageId` both typed `string | null` for `EventCard`'s shared `Pick<>` to stay structurally valid.
- **No placeholders:** every step has literal code; Task 1 Step 5-6 and Task 5 Step 3 are the only steps that ask the implementer to read a small amount of surrounding code before an edit (rather than giving a guessable-wrong exact line match) — both explain exactly why and what to look for, which is a deliberate call, not a placeholder.

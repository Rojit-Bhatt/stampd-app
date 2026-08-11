# Event Card Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make event cards informative and interactive — relative dates ("Today"/"Tomorrow"), a tap-to-open detail sheet, a clickable Google Maps link, a full-size zoomable poster image, and an optional structured rewards list admins can attach to an event.

**Architecture:** Backend adds a `rewards` array field to the existing `Event` model and threads it through the existing create/update/list/feed code paths (no new endpoints). Frontend adds two small pure utilities (relative date, maps link), makes `EventCard` itself own a tap-to-open bottom-sheet modal (`EventDetailModal`) with a fullscreen zoom viewer (`EventImageViewer`) for the poster image, and extends the admin `EventFormModal` with a toggleable rewards editor.

**Tech Stack:** Backend: Node.js + Express + Mongoose, plain-Node integration test scripts (no test framework — each `backend/tests/*.js` file boots its own server and asserts with a local `check()` helper; run via `node tests/<file>.js` or the full `npm test` chain in `backend/package.json`). Frontend: React + TypeScript + Vite, Tailwind (CSS variables for theming), `motion/react` for animation, Radix UI primitives (`@radix-ui/react-switch` via `frontend/src/components/ui/switch.tsx`), `lucide-react` icons. **No frontend test framework exists in this repo** — frontend tasks are verified with `cd frontend && npm run lint` (which runs `tsc --noEmit`) plus manual verification in the browser preview, not unit tests.

## Global Constraints

- Events remain **display-only** — no RSVP/ticketing/capacity fields (per the existing comment in `backend/models/Event.js`).
- `location` stays free text — no geocoding, no coordinate storage, no exact-pin Maps URL field. The Maps link is built from the free-text string via a URL-encoded search query.
- Rewards are a structured `{ rank, reward }` list, not free text folded into `description`. Empty array = no rewards section rendered anywhere.
- Every event card, on every page (outlet dashboard, cross-outlet Explore feed), opens the same `EventDetailModal` on tap. The Explore feed's existing "go to this outlet" navigation becomes a "Visit {business}" link/button *inside* the modal, not the card's default tap action.
- Follow the codebase's established relative-date pattern (`isToday` same-calendar-day check in `frontend/src/components/admin/NotificationStack.tsx`) rather than introducing a date library — no `date-fns` or similar is present in `frontend/package.json`, so don't add one.
- Follow the codebase's established customer-facing modal pattern (`motion`/`AnimatePresence` bottom sheet, as in `frontend/src/components/customer/GlobalScannerModal.tsx`) rather than the shadcn `Dialog`/`Sheet` primitives, which are only used in the admin console.

---

## File Structure

**Backend (new/modified):**
- Modify `backend/models/Event.js` — add `rewards` schema field.
- Modify `backend/services/eventService.js` — accept/persist `rewards` on create and update.
- Modify `backend/controllers/eventController.js` — pass `rewards` through on create.
- Modify `backend/services/discoveryService.js` — include `rewards` in the cross-tenant events feed mapping.
- Modify `backend/tests/upcoming-events.js` — cover `rewards` on create/admin-list/public-tenant paths.
- Modify `backend/tests/explore-events.js` — cover `rewards` on the cross-tenant feed path.

**Frontend (new):**
- Create `frontend/src/lib/formatEventDate.ts` — relative date label ("Today"/"Tomorrow"/"This {Weekday}"/short date).
- Create `frontend/src/lib/googleMapsLink.ts` — builds a Google Maps search URL from free-text location.
- Create `frontend/src/components/customer/EventDetailModal.tsx` — bottom-sheet detail view (image, full description, rewards, maps link, optional "Visit business" link).
- Create `frontend/src/components/customer/EventImageViewer.tsx` — fullscreen tap-to-zoom image viewer.

**Frontend (modified):**
- Modify `frontend/src/components/customer/EventCard.tsx` — tappable root opens `EventDetailModal`; relative date; clickable maps link; defines and exports `EventReward`, `EventCardEventData`, `EventBusinessLink` types.
- Modify `frontend/src/routes/ExploreEvents.tsx` — drop the wrapping `<Link>`; pass a `businessLink` prop to `EventCard` instead.
- Modify `frontend/src/context/TenantContext.tsx` — add `rewards: EventReward[]` to `TenantEvent`.
- Modify `frontend/src/hooks/useExploreEvents.ts` — add `rewards: EventReward[]` to `ExploreEvent`.
- Modify `frontend/src/components/admin/EventFormModal.tsx` — multi-line description, better location placeholder, rewards toggle + repeatable row editor.

---

### Task 1: Backend — `rewards` field end to end

**Files:**
- Modify: `backend/models/Event.js`
- Modify: `backend/services/eventService.js`
- Modify: `backend/controllers/eventController.js`
- Modify: `backend/services/discoveryService.js:100-118`
- Test: `backend/tests/upcoming-events.js`, `backend/tests/explore-events.js`

**Interfaces:**
- Produces: `Event` documents (and everywhere they're serialized: admin CRUD responses, `/api/tenant`'s `upcomingEvents`, the `/api/customer-auth/events` cross-tenant feed) now carry `rewards: [{ rank: string, reward: string }]`, defaulting to `[]`.

- [ ] **Step 1: Write the failing assertions in `backend/tests/upcoming-events.js`**

Add a `rewards` array to the first created event's body, and assert it round-trips through create, admin list, and the public tenant endpoint. Edit the `created1` block and the checks that follow it:

```js
    const created1 = await api("/api/admin/events", {
      method: "POST",
      token: adminToken,
      body: {
        title: "Live Jazz Night",
        date: tomorrow,
        time: "7:00 PM",
        location: "Main hall",
        description: "Local jazz trio.",
        rewards: [
          { rank: "1st Place", reward: "NPR 5,000 + Trophy" },
          { rank: "2nd Place", reward: "NPR 2,000" },
        ],
      },
    });
    check("create tomorrow event -> 201", created1.status === 201);
    check(
      "create response includes the rewards list",
      Array.isArray(created1.body.event.rewards) && created1.body.event.rewards.length === 2,
      created1.body.event.rewards,
    );
```

Then, immediately after the existing `check("create yesterday event -> 201", ...)` block (an event created with no `rewards` key at all), add:

```js
    check(
      "event created without rewards defaults to an empty array",
      Array.isArray(created2.body.event.rewards) && created2.body.event.rewards.length === 0,
      created2.body.event.rewards,
    );
```

And after the existing `check("public tenant -> 200", ...)` block, add:

```js
    const jazzInFeed = upcoming.find((e) => e.title === "Live Jazz Night");
    check(
      "public tenant upcomingEvents carries the rewards list",
      Boolean(jazzInFeed) && Array.isArray(jazzInFeed.rewards) && jazzInFeed.rewards.length === 2
        && jazzInFeed.rewards[0].rank === "1st Place" && jazzInFeed.rewards[0].reward === "NPR 5,000 + Trophy",
      jazzInFeed?.rewards,
    );
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd backend && node tests/upcoming-events.js`
Expected: `FAIL create response includes the rewards list` (and the two other new checks) — the schema silently drops the unknown `rewards` key today, so `created1.body.event.rewards` is `undefined`.

- [ ] **Step 3: Add `rewards` to the `Event` model**

In `backend/models/Event.js`, add the field before `createdAt`:

```js
  // Optional structured prize list — e.g. [{ rank: "1st Place", reward: "NPR 5,000 + Trophy" }].
  // Empty array means "no rewards for this event" (a dance night has none).
  rewards: {
    type: [{
      rank: { type: String, required: true, trim: true },
      reward: { type: String, required: true, trim: true }
    }],
    default: []
  },
  createdAt: { type: Date, default: Date.now }
```

- [ ] **Step 4: Thread `rewards` through `eventService.js`**

In `backend/services/eventService.js`, update `createEvent`'s destructuring and the `Event.create` call:

```js
const createEvent = async (
  organizationId,
  { title, date, time, location, description, imageUrl, imageId, rewards }
) => {
  if (!title) {
    throw createHttpError("Event title is required.", 400);
  }
  if (!date) {
    throw createHttpError("Event date is required.", 400);
  }

  const event = await Event.create({
    organizationId,
    title: title.trim(),
    date: new Date(date),
    time: time !== undefined ? time : "",
    location: location !== undefined ? location : "",
    description: description !== undefined ? description : "",
    imageUrl: imageUrl !== undefined ? imageUrl : "",
    imageId: imageId || null,
    rewards: rewards !== undefined ? rewards : []
  });
```

And add `"rewards"` to `MUTABLE_EVENT_FIELDS` so `updateEvent` accepts it (it already forwards `req.body` verbatim from the controller):

```js
const MUTABLE_EVENT_FIELDS = ["title", "date", "time", "location", "description", "imageUrl", "imageId", "rewards"];
```

- [ ] **Step 5: Pass `rewards` through the create controller**

In `backend/controllers/eventController.js`, update `createEventController`'s destructuring and the call to `createEvent`:

```js
const createEventController = async (req, res, next) => {
  try {
    const { title, date, time, location, description, imageUrl, imageId, rewards } = req.body;
    const event = await createEvent(req.user.organizationId, {
      title,
      date,
      time,
      location,
      description,
      imageUrl,
      imageId,
      rewards
    });
    res.status(201).json({ success: true, event });
  } catch (error) {
    next(error);
  }
};
```

(`updateEventController` already forwards `req.body` as-is — no change needed there.)

- [ ] **Step 6: Include `rewards` in the cross-tenant events feed**

In `backend/services/discoveryService.js`, add `rewards` to the object pushed in `getUpcomingEventsFeed` (around line 100-118):

```js
    feed.push({
      id: event._id.toString(),
      title: event.title,
      date: event.date,
      time: event.time,
      location: event.location,
      description: event.description,
      imageUrl: event.imageUrl,
      imageId: event.imageId || null,
      rewards: event.rewards || [],
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

- [ ] **Step 7: Run the test to confirm it passes**

Run: `cd backend && node tests/upcoming-events.js`
Expected: `upcoming-events: all PASS`

- [ ] **Step 8: Write the failing assertion in `backend/tests/explore-events.js`**

Add a `rewards` list to `eventA`'s body:

```js
    const eventA = await api("/api/admin/events", {
      method: "POST",
      token: tokenA,
      company: COMPANY,
      outlet: SLUG,
      body: {
        title: `Later Event ${runSuffix}`,
        date: isoDate(new Date(now.getTime() + 3 * DAY_MS)),
        rewards: [{ rank: "Winner", reward: "Free espresso for a month" }],
      },
    });
```

And after the existing `"feed branding includes a logoImageId key"` check, add:

```js
    const laterInFeed = (feed1.body.events || []).find((e) => e.title === `Later Event ${runSuffix}`);
    check(
      "feed item carries the rewards list",
      Boolean(laterInFeed) && Array.isArray(laterInFeed.rewards) && laterInFeed.rewards.length === 1
        && laterInFeed.rewards[0].rank === "Winner",
      laterInFeed?.rewards,
    );
```

- [ ] **Step 9: Run test to verify it fails, then passes**

Run: `cd backend && node tests/explore-events.js`
Expected first: FAIL on the new check (feed doesn't carry `rewards` yet from `eventB`... it does from Step 6 — actually this should already PASS since Step 6 is already applied). Re-run after confirming Step 6 landed:
Expected: `explore-events: all PASS` (or equivalent all-PASS summary printed by the script).

- [ ] **Step 10: Run the full backend suite**

Run: `cd backend && npm test`
Expected: every suite prints its own all-PASS summary; process exits 0.

- [ ] **Step 11: Commit**

```bash
git add backend/models/Event.js backend/services/eventService.js backend/controllers/eventController.js backend/services/discoveryService.js backend/tests/upcoming-events.js backend/tests/explore-events.js
git commit -m "feat(events): add optional structured rewards list to events"
```

---

### Task 2: Frontend — relative date and Google Maps link utilities

**Files:**
- Create: `frontend/src/lib/formatEventDate.ts`
- Create: `frontend/src/lib/googleMapsLink.ts`

**Interfaces:**
- Produces: `formatRelativeEventDate(iso: string): string` and `buildMapsSearchUrl(location: string): string`, both used by Task 3.

- [ ] **Step 1: Create the relative date utility**

Create `frontend/src/lib/formatEventDate.ts`:

```ts
// "Today" / "Tomorrow" / "This {Weekday}" close in, exact date further out —
// so an event card reads at a glance without making customers do date math,
// while it still shows correctly once an event is more than a week away.
// Same calendar-day comparison approach as the admin's isToday check
// (components/admin/NotificationStack.tsx) — local time zone, date only.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatRelativeEventDate(iso: string): string {
  const eventDate = new Date(iso);
  const diffDays = Math.round(
    (startOfDay(eventDate).getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays >= 2 && diffDays <= 6) return `This ${WEEKDAYS[eventDate.getDay()]}`;
  return eventDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Create the Maps link utility**

Create `frontend/src/lib/googleMapsLink.ts`:

```ts
// Building a Maps search link from free-text location rather than storing
// coordinates or a pasted URL — the event location field is just a string
// ("Magic Cups Cafe, Pimbahal, Lalitpur"), and a search query resolves named
// places well enough without adding a geocoding step to event creation.
export function buildMapsSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run lint`
Expected: no errors (two new, currently-unused-by-anything files with no type issues).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/formatEventDate.ts frontend/src/lib/googleMapsLink.ts
git commit -m "feat(events): add relative-date and Google Maps link utilities"
```

---

### Task 3: Frontend — tappable `EventCard`, `EventDetailModal`, `EventImageViewer`

**Files:**
- Modify: `frontend/src/components/customer/EventCard.tsx`
- Create: `frontend/src/components/customer/EventDetailModal.tsx`
- Create: `frontend/src/components/customer/EventImageViewer.tsx`
- Modify: `frontend/src/routes/ExploreEvents.tsx`

**Interfaces:**
- Consumes: `formatRelativeEventDate` and `buildMapsSearchUrl` from Task 2; `resolveImageUrl` from `frontend/src/lib/images.ts` (existing); `useMotion` from `frontend/src/lib/motion.ts` (existing).
- Produces: `EventReward`, `EventCardEventData`, `EventBusinessLink` types exported from `EventCard.tsx` — `rewards` on `EventCardEventData` is **optional** (`rewards?: EventReward[]`) so existing callers (which don't have a `rewards` field on their event objects until Task 4) keep typechecking. `EventCard`'s props: `{ event: EventCardEventData; businessLink?: EventBusinessLink }`.

- [ ] **Step 1: Rewrite `EventCard.tsx`**

Replace the full contents of `frontend/src/components/customer/EventCard.tsx`:

```tsx
import { useState } from "react";
import { Calendar, MapPin, CalendarDays } from "lucide-react";
import { resolveImageUrl } from "../../lib/images";
import { formatRelativeEventDate } from "../../lib/formatEventDate";
import { buildMapsSearchUrl } from "../../lib/googleMapsLink";
import { EventDetailModal } from "./EventDetailModal";

export interface EventReward {
  rank: string;
  reward: string;
}

export interface EventCardEventData {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  rewards?: EventReward[];
}

export interface EventBusinessLink {
  label: string;
  to: string;
}

interface EventCardProps {
  event: EventCardEventData;
  businessLink?: EventBusinessLink;
}

// Image on top, details below — a poster, not a list row. Nothing here
// truncates: a description that's too long to show whole is worse than a
// card that grows to fit it (see the menu-card truncation bug this was
// modelled to avoid). Tapping the card (anywhere but the location link)
// opens the full detail sheet.
export function EventCard({ event, businessLink }: EventCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const eventImageUrl = resolveImageUrl(event.imageId, event.imageUrl);
  const mapsUrl = event.location ? buildMapsSearchUrl(event.location) : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDetailOpen(true);
          }
        }}
        className="cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient"
      >
        {eventImageUrl ? (
          <img src={eventImageUrl} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div
            className="flex h-36 w-full items-center justify-center"
            style={{ background: "var(--surface-2)" }}
          >
            <CalendarDays className="h-8 w-8 text-[var(--soft)]" strokeWidth={1.5} />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-caption" style={{ color: "var(--brand-ink)" }}>
            <Calendar className="h-3.5 w-3.5" />
            {formatRelativeEventDate(event.date)}
            {event.time ? ` · ${event.time}` : ""}
          </div>
          <div className="mt-1 text-subhead text-[var(--ink)]">{event.title}</div>
          {event.location && (
            <div className="mt-1 flex items-center gap-1.5 text-footnote text-[var(--muted)]">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="underline-offset-2 hover:underline"
                >
                  {event.location}
                </a>
              ) : (
                <span>{event.location}</span>
              )}
            </div>
          )}
          {event.description && (
            <div className="mt-1.5 whitespace-pre-line text-footnote leading-relaxed text-[var(--muted)]">
              {event.description}
            </div>
          )}
        </div>
      </div>
      <EventDetailModal
        event={event}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        businessLink={businessLink}
      />
    </>
  );
}
```

- [ ] **Step 2: Create `EventImageViewer.tsx`**

Create `frontend/src/components/customer/EventImageViewer.tsx`:

```tsx
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";

interface EventImageViewerProps {
  imageUrl: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

// Single-tap zoom rather than true pinch: the app has no gesture library on
// board, and a tap toggling 1x/2.2x scale (panned via native scroll on the
// zoomed container) reads a printed poster's fine print well enough on a
// phone without pulling one in.
export function EventImageViewer({ imageUrl, alt, open, onClose }: EventImageViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("center");
  const m = useMotion();

  const handleClose = () => {
    setZoomed(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — full size`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={m.ease("ui")}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
          onClick={() => !zoomed && handleClose()}
        >
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-[var(--radius-btn)] border border-[#3A3A3C] bg-[#1C1C1E] text-white transition-colors hover:bg-white hover:text-black"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
          <div className="h-full w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrl}
              alt={alt}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                setOrigin(`${x}% ${y}%`);
                setZoomed((z) => !z);
              }}
              style={{ transformOrigin: origin }}
              className={`mx-auto min-h-full cursor-zoom-in object-contain transition-transform duration-200 ${
                zoomed ? "scale-[2.2] cursor-zoom-out" : "scale-100"
              }`}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Create `EventDetailModal.tsx`**

Create `frontend/src/components/customer/EventDetailModal.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { X, Calendar, MapPin, CalendarDays, Trophy, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMotion } from "../../lib/motion";
import { resolveImageUrl } from "../../lib/images";
import { formatRelativeEventDate } from "../../lib/formatEventDate";
import { buildMapsSearchUrl } from "../../lib/googleMapsLink";
import { EventImageViewer } from "./EventImageViewer";
import type { EventCardEventData, EventBusinessLink } from "./EventCard";

interface EventDetailModalProps {
  event: EventCardEventData;
  open: boolean;
  onClose: () => void;
  businessLink?: EventBusinessLink;
}

export function EventDetailModal({ event, open, onClose, businessLink }: EventDetailModalProps) {
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const m = useMotion();
  const eventImageUrl = resolveImageUrl(event.imageId, event.imageUrl);
  const mapsUrl = event.location ? buildMapsSearchUrl(event.location) : null;
  const rewards = event.rewards ?? [];
  const exactDate = new Date(event.date).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={event.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={m.ease("ui")}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
            onClick={onClose}
          >
            <motion.div
              initial={m.pick({ y: "100%" }, { opacity: 0 })}
              animate={m.pick({ y: 0 }, { opacity: 1 })}
              exit={m.pick({ y: "100%" }, { opacity: 0 })}
              transition={m.spring("settle")}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-t-[var(--radius-card)] bg-[var(--surface)] sm:rounded-[var(--radius-card)]"
            >
              <div className="relative">
                {eventImageUrl ? (
                  <img
                    src={eventImageUrl}
                    alt=""
                    onClick={() => setImageViewerOpen(true)}
                    className="h-56 w-full cursor-zoom-in object-cover"
                  />
                ) : (
                  <div
                    className="flex h-56 w-full items-center justify-center"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <CalendarDays className="h-10 w-10 text-[var(--soft)]" strokeWidth={1.5} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>

              <div className="p-5">
                <div className="flex items-center gap-1.5 text-caption" style={{ color: "var(--brand-ink)" }}>
                  <Calendar className="h-3.5 w-3.5" />
                  {formatRelativeEventDate(event.date)}
                  {event.time ? ` · ${event.time}` : ""}
                </div>
                <div className="mt-0.5 text-footnote text-[var(--soft)]">{exactDate}</div>
                <div className="mt-2 text-title-2 text-[var(--ink)]">{event.title}</div>

                {event.location && (
                  <div className="mt-2 flex items-center gap-1.5 text-footnote text-[var(--muted)]">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    {mapsUrl ? (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {event.location}
                      </a>
                    ) : (
                      <span>{event.location}</span>
                    )}
                  </div>
                )}

                {event.description && (
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--muted)]">
                    {event.description}
                  </div>
                )}

                {rewards.length > 0 && (
                  <div className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface-2)] p-3.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--soft)]">
                      <Trophy className="h-3.5 w-3.5" />
                      Rewards
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {rewards.map((r, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-semibold text-[var(--ink)]">{r.rank}</span>
                          <span className="text-right text-[var(--muted)]">{r.reward}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {businessLink && (
                  <Link
                    to={businessLink.to}
                    onClick={onClose}
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-[var(--primary)] py-2.5 text-sm font-bold text-white"
                  >
                    Visit {businessLink.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {eventImageUrl && (
        <EventImageViewer
          imageUrl={eventImageUrl}
          alt={event.title}
          open={imageViewerOpen}
          onClose={() => setImageViewerOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Wire `businessLink` into `ExploreEvents.tsx`**

In `frontend/src/routes/ExploreEvents.tsx`, replace the `EventListingCard` function (the `<Link>`-wrapping one) with:

```tsx
function EventListingCard({ event }: { event: ExploreEvent }) {
  const initial = event.businessName.charAt(0).toUpperCase();
  return (
    <div className="relative">
      {/* Overlaid on the card's own image, top-left — which business, without
          wrapping EventCard in a second card. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 py-1 pl-1 pr-2.5 backdrop-blur-sm">
        {event.branding.logoUrl ? (
          <img
            src={event.branding.logoUrl}
            alt=""
            className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: event.branding.primaryColor }}
          >
            {initial}
          </div>
        )}
        <span className="truncate text-[11px] font-bold text-white">{event.businessName}</span>
      </div>
      <EventCard
        event={event}
        businessLink={{ label: event.businessName, to: tenantPath(event.companySlug, event.slug, "dashboard") }}
      />
    </div>
  );
}
```

Remove the now-unused `import { Link } from "react-router-dom";` at the top of the file (the `Link` import is no longer used directly in this file — `tenantPath` is still used, `EventCard` is still used).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification in the browser**

Start the dev servers (backend + frontend), open the customer app:
- An event card shows "Today"/"Tomorrow"/"This {Weekday}"/a short date depending on how the seeded event's date compares to today.
- Tapping the card body opens the bottom sheet with image, date, title, location (as a link), description.
- Tapping the location link opens Google Maps in a new tab and does **not** open/close the sheet.
- Tapping the poster image inside the sheet opens the fullscreen viewer; tapping the image again zooms in; tapping outside the image (when not zoomed) or the X or Escape closes the viewer.
- On the `/explore/events` page, tapping a card opens the same sheet (not outlet navigation), and the sheet shows a "Visit {business}" link that navigates to that outlet's dashboard.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/customer/EventCard.tsx frontend/src/components/customer/EventDetailModal.tsx frontend/src/components/customer/EventImageViewer.tsx frontend/src/routes/ExploreEvents.tsx
git commit -m "feat(events): tap-to-open event detail sheet with maps link and zoomable image"
```

---

### Task 4: Frontend — rewards editor in the admin form, and wiring `rewards` into shared types

**Files:**
- Modify: `frontend/src/context/TenantContext.tsx`
- Modify: `frontend/src/hooks/useExploreEvents.ts`
- Modify: `frontend/src/components/admin/EventFormModal.tsx`

**Interfaces:**
- Consumes: `EventReward` type from `frontend/src/components/customer/EventCard.tsx` (Task 3); `Switch` from `frontend/src/components/ui/switch.tsx` (existing).
- Produces: `TenantEvent.rewards: EventReward[]` and `ExploreEvent.rewards: EventReward[]` (both required, matching what the backend now always returns per Task 1); admin can create/edit an event's rewards list end to end.

- [ ] **Step 1: Add `rewards` to `TenantEvent`**

In `frontend/src/context/TenantContext.tsx`, add the import and extend the interface:

```ts
import type { EventReward } from "../components/customer/EventCard";
```

```ts
export interface TenantEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  rewards: EventReward[];
}
```

- [ ] **Step 2: Add `rewards` to `ExploreEvent`**

In `frontend/src/hooks/useExploreEvents.ts`, add the import and field:

```ts
import type { EventReward } from "../components/customer/EventCard";
```

```ts
export interface ExploreEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  rewards: EventReward[];
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
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run lint`
Expected: no errors — `TenantEvent` and `ExploreEvent` objects are only ever produced from API responses (already typed as `any`-ish through `apiRequest<T>`), and `EventCard`'s `rewards` field stayed optional in Task 3, so nothing breaks yet.

- [ ] **Step 4: Rewrite `EventFormModal.tsx`**

Replace the full contents of `frontend/src/components/admin/EventFormModal.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import toast from "@/lib/toast";
import { apiRequest } from "../../lib/api";
import { resolveImageUrl } from "../../lib/images";
import { CreatePreviewModal } from "../shared/CreatePreviewModal";
import { FileDrop } from "../shared/FileDrop";
import { TimePicker } from "../ui/TimePicker";
import { Switch } from "../ui/switch";
import { EventCard, type EventReward } from "../customer/EventCard";

export interface AdminEventItem {
  id?: string;
  _id?: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  rewards: EventReward[];
}

export const eventId = (e: AdminEventItem) => e.id || (e._id as string);

interface Draft {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  imageUrl: string;
  imageId: string | null;
  rewards: EventReward[];
}

const emptyDraft = (): Draft => ({
  title: "", date: "", time: "", location: "", description: "", imageUrl: "", imageId: null, rewards: [],
});

const draftFrom = (e: AdminEventItem): Draft => ({
  title: e.title,
  date: e.date.slice(0, 10),
  time: e.time,
  location: e.location,
  description: e.description,
  imageUrl: e.imageUrl,
  imageId: e.imageId,
  rewards: e.rewards || [],
});

interface EventFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdminEventItem | null;
  onSaved: () => void;
}

export function EventFormModal({ open, onOpenChange, initial, onSaved }: EventFormModalProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  useEffect(() => {
    if (open) setDraft(initial ? draftFrom(initial) : emptyDraft());
  }, [open, initial]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminEvents"] });

  const create = useMutation({
    mutationFn: (body: Draft) => apiRequest("/api/admin/events", { method: "POST", role: "admin", body }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Draft }) =>
      apiRequest(`/api/admin/events/${id}`, { method: "PATCH", role: "admin", body }),
    onSuccess: invalidate,
  });

  const busy = create.isPending || update.isPending;

  const updateReward = (index: number, field: keyof EventReward, value: string) => {
    setDraft((d) => ({
      ...d,
      rewards: d.rewards.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }));
  };
  const addReward = () => setDraft((d) => ({ ...d, rewards: [...d.rewards, { rank: "", reward: "" }] }));
  const removeReward = (index: number) =>
    setDraft((d) => ({ ...d, rewards: d.rewards.filter((_, i) => i !== index) }));

  const save = async () => {
    if (!draft.title.trim() || !draft.date) {
      toast.error("An event needs a title and a date.");
      return;
    }
    if (draft.rewards.some((r) => !r.rank.trim() || !r.reward.trim())) {
      toast.error("Fill in both fields for every reward, or remove the empty row.");
      return;
    }
    try {
      if (initial) {
        await update.mutateAsync({ id: eventId(initial), body: draft });
        toast.success("Event updated!");
      } else {
        await create.mutateAsync(draft);
        toast.success("Event added!");
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const previewEvent = {
    title: draft.title || "Event title",
    date: draft.date || new Date().toISOString(),
    time: draft.time,
    location: draft.location || "Where it happens",
    description: draft.description || "A short description customers will see.",
    imageUrl: resolveImageUrl(draft.imageId, draft.imageUrl),
    imageId: null,
    rewards: draft.rewards,
  };

  return (
    <CreatePreviewModal
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit event" : "New event"}
      saveLabel={initial ? "Save changes" : "Save event"}
      busy={busy}
      onCancel={() => onOpenChange(false)}
      onSave={save}
      preview={<EventCard event={previewEvent} />}
      form={
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Title"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <TimePicker value={draft.time} onChange={(time) => setDraft({ ...draft, time })} />
          <input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="e.g. Magic Cups Cafe, Pimbahal, Lalitpur"
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Description, rules, what to expect…"
            rows={3}
            className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <FileDrop
              mode="image"
              ownerType="event"
              previewUrl={resolveImageUrl(draft.imageId, draft.imageUrl)}
              onImageUploaded={({ id }) => setDraft((d) => ({ ...d, imageId: id }))}
              onRemove={() => setDraft((d) => ({ ...d, imageId: null, imageUrl: "" }))}
              label="Click to choose a photo, or drag one here"
            />
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between rounded-[11px] border border-[var(--line)] px-3.5 py-2.5">
              <span className="text-sm font-semibold text-[var(--ink)]">This event has rewards</span>
              <Switch
                checked={draft.rewards.length > 0}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({ ...d, rewards: checked ? [{ rank: "", reward: "" }] : [] }))
                }
              />
            </div>
            {draft.rewards.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {draft.rewards.map((reward, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={reward.rank}
                      onChange={(e) => updateReward(index, "rank", e.target.value)}
                      placeholder="1st Place"
                      className="w-1/3 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                    />
                    <input
                      value={reward.reward}
                      onChange={(e) => updateReward(index, "reward", e.target.value)}
                      placeholder="NPR 5,000 + Trophy"
                      className="flex-1 rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeReward(index)}
                      aria-label="Remove reward"
                      className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[11px] border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addReward}
                  className="flex items-center gap-1.5 self-start text-sm font-semibold text-[var(--primary-deep)]"
                >
                  <Plus className="h-4 w-4" />
                  Add another reward
                </button>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 6: Manual verification in the browser (admin console)**

- Create a new event, leave "This event has rewards" off, save — confirm it saves with no rewards section shown on the customer-facing card/sheet.
- Create a second event (e.g. "Chess Competition"), toggle rewards on, add "1st Place" / "NPR 5,000 + Trophy" and "2nd Place" / "NPR 2,000", save — confirm the customer-facing detail sheet shows both rows under "Rewards" in order.
- Edit that event, remove a reward row, save — confirm the change persists.
- Try saving with a reward row that has one empty field — confirm the toast error appears and nothing saves.
- Confirm the description textarea accepts multiple lines and the admin preview grows to fit (no truncation), matching the existing card behavior.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/context/TenantContext.tsx frontend/src/hooks/useExploreEvents.ts frontend/src/components/admin/EventFormModal.tsx
git commit -m "feat(events): admin rewards editor, multi-line description, better location placeholder"
```

---

## Self-Review Notes

- **Spec coverage:** relative date labels → Task 2 + 3; tap-to-open detail view → Task 3; clickable Maps link → Task 2 + 3; full poster image with zoom → Task 3 (`EventImageViewer`); admin-configurable structured rewards with an on/off toggle → Task 1 (backend) + Task 4 (admin UI); Explore-page "Visit business" affordance → Task 3 Step 4. All six spec decisions have a task.
- **Type consistency checked:** `EventReward { rank, reward }` is defined once (`EventCard.tsx`) and imported everywhere else (`EventDetailModal.tsx`, `TenantContext.tsx`, `useExploreEvents.ts`, `EventFormModal.tsx`). `formatRelativeEventDate` and `buildMapsSearchUrl` signatures match between their Task 2 definitions and every Task 3 call site. `EventCardEventData.rewards` is optional so Task 3 (UI) and Task 4 (data wiring) can land as independently green commits.
- **No placeholders:** every step has runnable code or an exact manual-check list; no "add validation" or "similar to Task N" hand-waving.

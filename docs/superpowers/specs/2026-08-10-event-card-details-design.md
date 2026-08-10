# Event Card Details — Design

## Context

An outlet is running a Chess Competition this Saturday at Magic Cups Cafe, Pimbahal, Lalitpur, with 1st/2nd/other-place prizes. The current event feature can't represent this well:

- `EventCard` (customer-facing) is a static poster — image + title + plain date + one-line location + description. No tap/click interaction at all.
- The admin `EventFormModal` only offers single-line inputs for location and description, and has no concept of prizes/rewards.
- There's no shared "Today / Tomorrow" relative-date formatting anywhere in the codebase.
- `location` is free text with no link to a map.

This spec covers making event cards informative and interactive: relative dates, a tap-to-open detail view, a clickable maps link, a full-size viewable poster image, and an optional structured rewards list admins can fill in when configuring an event.

## Current State (for reference)

- `frontend/src/components/customer/EventCard.tsx` — poster card, non-interactive `<div>` root, inline `formatEventDate` (month/day only), optional `time`, `location` (plain text + `MapPin` icon), `description` (never truncated).
- `backend/models/Event.js` — `title`, `date`, `time` (free string), `location` (free string), `description` (free string), `imageUrl`/`imageId`. Explicitly "display-only... no RSVP/ticketing."
- `frontend/src/components/admin/EventFormModal.tsx` — create/edit modal with a live `EventCard` preview; text input for location, single-line input for description.
- `frontend/src/routes/CustomerDashboard.tsx` — renders `EventCard` inside a single outlet's context.
- `frontend/src/routes/ExploreEvents.tsx` — renders `EventCard` wrapped in a `<Link>` to the outlet's dashboard (multi-outlet browse page), with a business-name badge overlaid on the card image.
- No shared relative-date utility exists; closest precedent is an inline `isToday` same-calendar-day check in `frontend/src/components/admin/NotificationStack.tsx`.
- No detail/expand pattern exists for events. Precedent for customer-facing overlays: `frontend/src/components/customer/GlobalScannerModal.tsx`, a custom `motion`/`AnimatePresence`-based bottom-sheet-style modal (not the shadcn `Sheet` primitive, which is currently only used in `AdminLayout.tsx`).

## Decisions

1. **Rewards are structured, not free text.** A repeatable list of `{ rank, reward }` pairs (e.g. "1st Place" / "NPR 5000 + Trophy"), toggled on/off in the admin form. Off/empty by default — events without prizes (e.g. a dance party) simply show no rewards section. This renders as a clean formatted list automatically and keeps `description` for general info (rules, what to expect).
2. **Detail view is a bottom-sheet-style modal**, not a dedicated route. Matches the app's existing mobile-first customer UI conventions and needs no new routing/back-button handling.
3. **Relative date scheme:** 0 days out → "Today", 1 day → "Tomorrow", 2–6 days → "This {Weekday}" (e.g. "This Saturday"), else (past or >6 days out) → short date (e.g. "Sat, Aug 16").
4. **Maps link is auto-built from the existing free-text `location` field** — no new schema field. `https://www.google.com/maps/search/?api=1&query=<encoded location>`. The admin location input gets a placeholder nudging a full address (`"e.g. Magic Cups Cafe, Pimbahal, Lalitpur"`) so the search resolves well.
5. **Event photo gets a fullscreen pinch-zoom viewer** inside the detail modal, since admins may upload a poster image that already has printed details.
6. **Tapping any event card, on any page, opens the same detail modal.** On the Explore (multi-outlet) page, which currently uses the card as a navigation link to the outlet's dashboard, the modal additionally shows a "Visit {business}" link so that navigation path is preserved from inside the modal instead of being the card's default action.

## Architecture

### Backend — `backend/models/Event.js`

Add:
```js
rewards: [{
  rank: { type: String, required: true, trim: true },
  reward: { type: String, required: true, trim: true },
}]
```
Default `[]`. No change to `location` or `description` (already unrestricted free strings). The event create/update route(s) need to accept and persist `rewards` as part of the existing event payload.

### Frontend — shared date utility

New file (exact location to follow existing `frontend/src/lib/` conventions), e.g. `frontend/src/lib/formatEventDate.ts`:

- Computes a calendar-day difference between the event's `date` and "now," using local dates only (ignoring time-of-day), consistent with the existing `isToday` check in `NotificationStack.tsx`.
- Returns "Today" / "Tomorrow" / "This {Weekday}" / short date per the scheme in Decision 3.
- Replaces the inline `formatEventDate` currently defined in `EventCard.tsx`; `time` continues to be appended separately, unchanged.

### `EventCard.tsx` (customer-facing, compact)

Visual size/crop unchanged. Behavior changes only:

- Root becomes tappable: keyboard-accessible (`role="button"`, `tabIndex={0}`, `onClick`/`onKeyDown`) rather than a plain `<div>`, opening the new `EventDetailModal`.
- Date display uses the new relative-date utility.
- `location` renders as an `<a>` to the Maps search URL (Decision 4), `target="_blank" rel="noopener noreferrer"`, with `stopPropagation` on click so it opens Maps instead of triggering the card's modal-open handler.
- No rewards preview on the compact card — rewards appear only in the modal, keeping the card visually unchanged otherwise.
- Prop shape (`Pick<TenantEvent, ...>`) extends to include `rewards`.

### New `EventDetailModal.tsx` (customer-facing)

Bottom-sheet-style modal following the `GlobalScannerModal` motion/`AnimatePresence` convention. Contents:

- Full-width, uncropped event image (tap opens the fullscreen zoom viewer).
- Title, relative date + time.
- Full description (unrestricted length, as today).
- Rewards list, only rendered when `rewards.length > 0`.
- Clickable maps link (same target as the card's).
- `businessLink` (optional prop): when present (Explore page context), renders a "Visit {business}" link/button to the outlet dashboard.

### New fullscreen image viewer

Small component for pinch/tap-to-zoom over the event image, dismissible via tap-outside or swipe-down, consistent with existing sheet/modal dismiss conventions in the app. May be shared/generic if a suitable primitive doesn't already exist elsewhere.

### `frontend/src/routes/ExploreEvents.tsx`

Remove the wrapping `<Link>` around `EventCard`; `EventListingCard` renders `EventCard` directly so it opens the shared detail modal like everywhere else. The business-name badge overlay is unaffected. The modal is given a `businessLink` prop (derived from `event.companySlug`/`event.slug`) so the "Visit {business}" affordance appears only in this multi-outlet context.

### `frontend/src/components/admin/EventFormModal.tsx`

- `description`: single-line input → `<textarea>`.
- `location`: same input, placeholder updated to nudge a full address.
- New "Rewards" section: toggle switch ("This event has rewards"), off by default. When on, repeatable rank/reward text-row inputs with add/remove controls. Toggling off clears the array before save.
- Live preview continues to render the actual `EventCard`, now reflecting relative date and (implicitly) tap affordance styling if any is added to the card.

## Testing

- Manual verification in the browser: create an event dated today, tomorrow, 4 days out, and 10 days out; confirm labels ("Today", "Tomorrow", "This {Weekday}", short date).
- Create one event with rewards toggled on (multiple rows) and one without; confirm the card and modal both reflect presence/absence correctly.
- Confirm location tap opens Google Maps search in a new tab without opening the detail modal.
- Confirm image tap in the modal opens the fullscreen zoom viewer, and that it's dismissible.
- Confirm Explore page: card tap opens the modal (not outlet navigation), and the "Visit {business}" link inside the modal correctly navigates to that outlet's dashboard.
- Existing event flows (creation, edit, admin preview) still work for events with no rewards and short descriptions (regression check on the textarea change).

## Out of scope

- RSVP/ticketing/capacity limits (model comment already states events are display-only).
- Geocoding, coordinate storage, or an exact-pin Maps URL field — search-query link is sufficient per Decision 4.
- Reordering/drag-and-drop of reward rows — array order is just row-creation order.

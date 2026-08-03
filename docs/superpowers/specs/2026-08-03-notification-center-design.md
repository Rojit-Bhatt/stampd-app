# Notification center (outlet admin console)

Date: 2026-08-03
Status: approved, not implemented

## Scope

Sub-project 3c — the last piece of the UI improvements batch (3a org
switcher and 3b profile redesign already shipped). A persistent,
read/unread-tracked notification bell for the **outlet admin console
only** — not the company owner, platform, or customer surfaces, and not a
restyle of the existing `react-hot-toast` system, which stays exactly as
it is for ephemeral action feedback ("Name updated!", "Couldn't sign you
in"). This is a genuinely new subsystem: a backend model, two write
triggers, and a read API.

Two trigger events only, both already flow through existing service code:

1. A **redemption** at this outlet.
2. A customer's **first-ever arrival** at this outlet (new membership row).

Deliberately excludes every routine earn (happens dozens of times a shift —
would flood the bell into noise), campaign start/end, and the customer-facing
push/email/SMS trigger system (`messagingService.js`'s `sendTrigger` —
unrelated: that's outbound to customers, this is inbound to staff).

## Design

### `Notification` model

New `backend/models/Notification.js`, append-only like `PointsTransaction`/
`MessageLog`:

```js
{
  organizationId: ObjectId,  // required, ref Organization — the isolation
                              // boundary; every query and every create MUST
                              // scope on this
  type: "redemption" | "new_customer",
  message: String,           // pre-rendered text, not a template ref — this
                              // app has exactly two message shapes, so a
                              // second templating layer (messagingService.js's
                              // renderTemplate) would be pure overhead here
  readAt: Date | null,
  createdAt: Date
}
```

Index on `{ organizationId: 1, createdAt: -1 }` (list ordering) and
`{ organizationId: 1, readAt: 1 }` (unread-count queries).

### Two creation points

Both fire-and-forget after their transaction commits — the exact pattern
`checkMilestoneTrigger`/`evaluateBroadcasts` already use inside `claimPoints`
(`backend/services/pointsService.js:423-427`): call, `.catch(err => console.error(...))`,
never awaited into the response path, because a notification-write failure
must never be why an earn/redeem/signup itself fails.

- **`redeemPoints`** (`pointsService.js:508`), after `session.withTransaction`
  commits, alongside where the response payload is built:
  ```js
  createNotification({
    organizationId,
    type: "redemption",
    message: `${redeemer.name} redeemed ${item.name}.`
  }).catch((err) => console.error("Notification create failed:", err.message));
  ```
- **`ensureMembership`** (`backend/services/customerAccountService.js:143`),
  only on the branch that runs `User.create(...)` — never on the "found
  existing membership" branch, since a returning customer isn't a new-customer
  event:
  ```js
  createNotification({
    organizationId,
    type: "new_customer",
    message: `${account.name} joined.`
  }).catch((err) => console.error("Notification create failed:", err.message));
  ```

`createNotification` lives in a new `backend/services/notificationService.js`
— small and focused, the create/list/mark-read logic in one place rather than
scattered into `pointsService.js`/`customerAccountService.js` beyond the two
call sites above.

### API

Mounted under the existing `/api/admin` group, `isBusinessAdmin`-guarded —
no new middleware:

```
GET  /api/admin/notifications?unreadOnly=true&limit=20
POST /api/admin/notifications/:id/read
POST /api/admin/notifications/read-all
```

Every query and the mark-read update scope on `req.user.organizationId` from
the tenant JWT (never a client-supplied value) — the same isolation rule
every other outlet-scoped model in this app follows. `GET` returns
`{ notifications: [...], unreadCount }` — the badge count comes from the same
call the panel's list uses, not a second round trip.

### Frontend

A `Bell` icon button (`lucide-react`, already a dependency) in
`AdminLayout.tsx`'s rail bottom row, next to `ThemeToggle` (`AdminLayout.tsx:255-263`)
— the one row that renders in both the desktop sidebar and the mobile
drawer, since this console has no separate always-visible desktop header to
put a bell in otherwise. A small red dot badge shows when `unreadCount > 0`
(no number — a chosen minimalism at two event types, matching this app's
"no green/red noise, calm chrome" toast philosophy elsewhere).

Clicking opens a dropdown panel using the same `DropdownMenu` primitive
`AccountMenu`/`OrgSwitcher` already use (`components/ui/dropdown-menu`) —
so a third dropdown doesn't introduce a third visual language. Lists recent
notifications (message + relative time), unread ones with a subtle
background tint, a "Mark all read" action at the top.

**Polling**, not real-time: `useQuery` with `refetchInterval: 30_000` —
matching this codebase's established pattern (no websockets, no SSE
anywhere in the app) rather than introducing real-time infrastructure for
two low-frequency event types. Opening the panel also marks visible
notifications read after a short dwell (2s) rather than requiring an
explicit per-item click — matching how a notification bell conventionally
behaves (seeing it counts as reading it), with "Mark all read" still
available for clearing without opening.

## Testing

New `backend/tests/notifications.js`, added to `backend/package.json`'s test
chain. Covers:

- A redemption creates a `type: "redemption"` notification scoped to the
  redeeming outlet's `organizationId`.
- A customer's first membership creation at an outlet creates a
  `type: "new_customer"` notification; a **second** earn/visit by the same
  customer at the same outlet does **not** create a second one.
- The same customer's first visit to a **different** outlet of the same
  company **does** create a new-customer notification there too (the event
  is "new to this outlet," not "new to the platform").
- `GET /api/admin/notifications` never returns another outlet's rows — the
  key isolation check, mirroring `tests/multi-tenant-isolation.js`'s own
  cross-tenant assertions.
- `unreadCount` reflects only unread rows; `POST .../read-all` zeroes it.
- `POST .../:id/read` on an id belonging to a different organization 404s
  rather than marking it read — the isolation boundary applies to writes,
  not just reads.

Frontend: `npm run lint` plus manual browser checks — trigger a redemption
and a new customer signup, confirm the bell badge appears, the panel lists
both with correct copy, and the badge clears after the dwell/mark-all-read.

## Risks

- **`readAt`/badge state is per-organization, not per-admin.** Two staff
  logged into the same outlet share one read state — one marking a
  notification read clears it for the other too. Accepted: this app has no
  per-staff-member identity distinct from the outlet's shared login today
  (an outlet's `AdminAccount` can be shared among staff at the counter), so
  per-admin read state would track an identity this product doesn't
  otherwise track.
- **Notification creation failure is silently swallowed** (`console.error`
  only) by design, matching the existing `checkMilestoneTrigger`/
  `evaluateBroadcasts` hooks — a missed notification is a lesser cost than a
  broken redemption.

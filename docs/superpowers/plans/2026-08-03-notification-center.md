# Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A persistent, read/unread-tracked notification bell in the outlet admin console, triggered by redemptions and new-customer arrivals at that outlet.

**Architecture:** One new append-only `Notification` model, created via two fire-and-forget hooks inside existing service functions (`redeemPoints`, `ensureMembership`) — the exact pattern `checkMilestoneTrigger`/`evaluateBroadcasts` already use. A small read API under the existing `isBusinessAdmin` guard. A `NotificationBell` component polling every 30s, in `AdminLayout`'s rail footer.

**Tech Stack:** Express + Mongoose (backend); React 19 + TS + TanStack Query + `lucide-react` (frontend).

**Spec:** `docs/superpowers/specs/2026-08-03-notification-center-design.md`

## Global Constraints

- **Every query and every create scopes on `organizationId`** — the isolation invariant this whole app depends on. Read it from `req.user.organizationId` (the tenant JWT) in controllers, never from a client-supplied value.
- **Notification creation is fire-and-forget**, `.catch(err => console.error(...))`, never awaited into the caller's response — a notification-write failure must never fail a redemption or a signup.
- **`type: "new_customer"` fires only on the branch of `ensureMembership` that creates a new `User` row** — never on the "found existing membership" branch.
- New backend test suites **must be added to `backend/package.json`'s `test` chain** or they never run.
- No websockets, no SSE, no cron — polling via `refetchInterval`, matching this codebase's existing style everywhere else.
- Frontend has no test runner. Verification is `npm run lint` plus manual browser checks.
- `MONGODB_URI="" npm run dev -w backend` (not plain `npm run dev`) for local verification.

---

### Task 1: Backend — `Notification` model, service, API, and the two write hooks

**Files:**
- Create: `backend/models/Notification.js`
- Create: `backend/services/notificationService.js`
- Create: `backend/controllers/notificationController.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `backend/services/pointsService.js` (`redeemPoints`, ~line 508-610)
- Modify: `backend/services/customerAccountService.js` (`ensureMembership`, ~line 136-156)
- Create: `backend/tests/notifications.js`
- Modify: `backend/package.json` (add `tests/notifications.js` to the `test` chain)

**Interfaces:**
- Produces:
  - `createNotification({ organizationId, type, message }) -> Promise<void>` from `notificationService.js`.
  - `listNotifications(organizationId, { unreadOnly, limit }) -> Promise<{ notifications: Array<{id, type, message, readAt, createdAt}>, unreadCount: number }>`.
  - `markRead(organizationId, notificationId) -> Promise<boolean>` (false if no matching row — wrong org or bad id).
  - `markAllRead(organizationId) -> Promise<void>`.
  - Routes: `GET /api/admin/notifications`, `POST /api/admin/notifications/:id/read`, `POST /api/admin/notifications/read-all`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/notifications.js`:

```js
/**
 * Notification center (outlet admin console).
 *
 * Covers: a redemption and a customer's first-ever arrival at an outlet
 * each create exactly one notification, scoped to that outlet; a second
 * visit by the same customer does not create a second new_customer
 * notification; the same customer's first visit to a DIFFERENT outlet
 * does; the read API never leaks another outlet's rows; mark-read and
 * mark-all-read update readAt correctly, scoped to the caller's org.
 *
 * Run directly: `node tests/notifications.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5048 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra ?? ""); failures++; }
  };
  const api = (path, { method = "GET", body, token } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const login = async (email, password = "password") => {
    const res = await api("/api/admin-auth/login", { method: "POST", body: { email, password } });
    return res.body.token;
  };

  try {
    // durbarmarg admin/customer — seeded, verified, no earn history needed
    // beyond what this test itself creates.
    const durbarmargToken = await login("durbarmarg@coffesarowar.com");
    check("logged in as durbarmarg admin", Boolean(durbarmargToken));

    const patanToken = await login("patan@coffesarowar.com");
    check("logged in as patan admin", Boolean(patanToken));

    // Baseline: no notifications yet for either outlet in this fresh server.
    const before = await api("/api/admin/notifications", { token: durbarmargToken });
    check("durbarmarg starts with zero notifications", before.body?.notifications?.length === 0, before.body);
    check("durbarmarg starts with zero unread", before.body?.unreadCount === 0);

    // --- New customer at durbarmarg -------------------------------------
    const stamp = Date.now();
    const custEmail = `notif-cust-${stamp}@test.com`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Notif Customer", email: custEmail, password: "password123", phone: "9800000000" },
    });
    const custLogin = await api("/api/customer-auth/login", {
      method: "POST", body: { email: custEmail, password: "password123" },
    });
    const enterDurbarmarg = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      body: {},
      token: custLogin.body.token,
    }).catch(() => null);
    // enter-tenant needs tenant headers (resolveTenant), not just a token —
    // set them explicitly since this test's api() helper doesn't carry them.
    const enterDurbarmargReal = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${custLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "durbarmarg",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    check("customer entered durbarmarg -> 200", enterDurbarmargReal.status === 200, enterDurbarmargReal.body);

    await new Promise((r) => setTimeout(r, 200));

    const afterFirstVisit = await api("/api/admin/notifications", { token: durbarmargToken });
    check("one new_customer notification after first visit", afterFirstVisit.body?.notifications?.length === 1, afterFirstVisit.body);
    check("it's type new_customer", afterFirstVisit.body?.notifications?.[0]?.type === "new_customer");
    check("unreadCount is 1", afterFirstVisit.body?.unreadCount === 1);

    // A second visit (re-entering the same outlet) must NOT create a second
    // new_customer notification — ensureMembership's "found existing" branch.
    const enterDurbarmargAgain = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${custLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "durbarmarg",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    check("customer re-entered durbarmarg -> 200", enterDurbarmargAgain.status === 200);

    await new Promise((r) => setTimeout(r, 200));
    const afterSecondVisit = await api("/api/admin/notifications", { token: durbarmargToken });
    check("still exactly one notification after a second visit", afterSecondVisit.body?.notifications?.length === 1, afterSecondVisit.body);

    // The SAME customer's first visit to a DIFFERENT outlet (patan) DOES
    // create a new_customer notification there — "new to this outlet."
    const enterPatan = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${custLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "patan",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    check("customer entered patan -> 200", enterPatan.status === 200, enterPatan.body);

    await new Promise((r) => setTimeout(r, 200));
    const patanNotifs = await api("/api/admin/notifications", { token: patanToken });
    check("patan has its own new_customer notification", patanNotifs.body?.notifications?.length === 1, patanNotifs.body);

    // Isolation: durbarmarg's list must still show only its own row, never
    // patan's.
    const durbarmargStillOne = await api("/api/admin/notifications", { token: durbarmargToken });
    check("durbarmarg's list is unaffected by patan's notification", durbarmargStillOne.body?.notifications?.length === 1, durbarmargStillOne.body);

    // --- Mark read --------------------------------------------------------
    const notifId = afterFirstVisit.body.notifications[0].id;
    const markRead = await api(`/api/admin/notifications/${notifId}/read`, { method: "POST", token: durbarmargToken });
    check("mark-read -> 200", markRead.status === 200, markRead.body);

    const afterMarkRead = await api("/api/admin/notifications", { token: durbarmargToken });
    check("unreadCount is 0 after marking the only notification read", afterMarkRead.body?.unreadCount === 0, afterMarkRead.body);
    check("the notification's readAt is now set", Boolean(afterMarkRead.body?.notifications?.[0]?.readAt), afterMarkRead.body);

    // Marking an id that belongs to patan, using durbarmarg's token, must
    // fail rather than silently succeed.
    const patanNotifId = patanNotifs.body.notifications[0].id;
    const crossOrgMarkRead = await api(`/api/admin/notifications/${patanNotifId}/read`, { method: "POST", token: durbarmargToken });
    check("marking another outlet's notification read -> 404", crossOrgMarkRead.status === 404, crossOrgMarkRead.body);

    const patanStillUnread = await api("/api/admin/notifications", { token: patanToken });
    check("patan's notification is still unread after the cross-org attempt", patanStillUnread.body?.unreadCount === 1, patanStillUnread.body);

    // --- Redemption ---------------------------------------------------
    // Use bikash, a seeded verified customer already a member of durbarmarg
    // (per demoSeed.js), and thamel's admin to redeem a real reward — thamel
    // rather than durbarmarg because thamel already has campaign/reward
    // fixtures other suites rely on; a fresh redemption here doesn't disturb
    // anything else's expected figures. bikash is already a durbarmarg
    // member too, so his redemption there is used instead — no fixture
    // dependency on thamel's campaign multiplier is wanted for this earn.
    const bikashLogin = await api("/api/customer-auth/login", {
      method: "POST", body: { email: "bikash@example.com", password: "password" },
    });
    const bikashEnter = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bikashLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "durbarmarg",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const bikashTenantToken = bikashEnter.body.token;

    const catalog = await api("/api/points/catalog", { token: bikashTenantToken });
    const cheapest = (catalog.body?.data?.items || []).slice().sort((a, b) => a.pointsPrice - b.pointsPrice)[0];
    check("durbarmarg has a redeemable item", Boolean(cheapest), catalog.body);

    if (cheapest) {
      // Give bikash enough balance via a real earn first — a redeem QR
      // needs sufficient funds, and this test must not assume a prior
      // suite already left bikash with points at durbarmarg.
      const qr = await api("/api/admin/generate-qr", {
        method: "POST", token: durbarmargToken, body: { billAmount: 100000 },
      });
      const earn = await api("/api/points/claim", {
        method: "POST", token: bikashTenantToken, body: { token: qr.body?.data?.token },
      });
      check("bikash earned enough to redeem", earn.status === 200, earn.body);

      const redeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: durbarmargToken });
      const redeem = await api("/api/points/redeem", {
        method: "POST",
        token: bikashTenantToken,
        body: { token: redeemQr.body?.data?.token, itemId: cheapest.id, kind: cheapest.kind },
      });
      check("redemption -> 200", redeem.status === 200, redeem.body);

      await new Promise((r) => setTimeout(r, 200));
      const afterRedeem = await api("/api/admin/notifications", { token: durbarmargToken });
      const redemptionNotif = afterRedeem.body?.notifications?.find((n) => n.type === "redemption");
      check("a redemption notification was created", Boolean(redemptionNotif), afterRedeem.body);
      check("its message names the reward", redemptionNotif?.message?.includes(cheapest.name), redemptionNotif);
    }

    // --- Mark all read ------------------------------------------------
    const markAll = await api("/api/admin/notifications/read-all", { method: "POST", token: durbarmargToken });
    check("mark-all-read -> 200", markAll.status === 200, markAll.body);
    const afterMarkAll = await api("/api/admin/notifications", { token: durbarmargToken });
    check("unreadCount is 0 after mark-all-read", afterMarkAll.body?.unreadCount === 0, afterMarkAll.body);

    if (failures === 0) console.log("\nAll notification checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && node tests/notifications.js
```

Expected: FAIL almost everywhere — `/api/admin/notifications` doesn't exist yet (404s), so every response body is empty/undefined.

- [ ] **Step 3: Create the model**

Create `backend/models/Notification.js`:

```js
const mongoose = require("mongoose");

// One row per notification-worthy event at an outlet — append-only, like
// PointsTransaction/MessageLog. Two event types today (see
// notificationService.js): a redemption, and a customer's first-ever
// arrival at THIS outlet. Deliberately excludes routine earns, which
// happen dozens of times a shift and would flood this into noise.
const NotificationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  type: { type: String, enum: ["redemption", "new_customer"], required: true },
  message: { type: String, required: true },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

NotificationSchema.index({ organizationId: 1, createdAt: -1 });
NotificationSchema.index({ organizationId: 1, readAt: 1 });

module.exports = mongoose.model("Notification", NotificationSchema);
```

- [ ] **Step 4: Write the service**

Create `backend/services/notificationService.js`:

```js
const Notification = require("../models/Notification");

// Fire-and-forget by design — every caller wraps this in `.catch(...)` and
// never awaits it into a response path. A notification-write failure must
// never be why a redemption or a signup itself fails.
const createNotification = async ({ organizationId, type, message }) => {
  await Notification.create({ organizationId, type, message });
};

const formatNotification = (doc) => ({
  id: doc._id.toString(),
  type: doc.type,
  message: doc.message,
  readAt: doc.readAt,
  createdAt: doc.createdAt
});

const listNotifications = async (organizationId, { unreadOnly = false, limit = 20 } = {}) => {
  const query = unreadOnly
    ? { organizationId, readAt: null }
    : { organizationId };

  const docs = await Notification.find(query).sort({ createdAt: -1 }).limit(limit);
  const unreadCount = (await Notification.find({ organizationId, readAt: null })).length;

  return {
    notifications: docs.map(formatNotification),
    unreadCount
  };
};

const markRead = async (organizationId, notificationId) => {
  const doc = await Notification.findOne({ _id: notificationId, organizationId });
  if (!doc) return false;
  doc.readAt = new Date();
  await doc.save();
  return true;
};

const markAllRead = async (organizationId) => {
  const unread = await Notification.find({ organizationId, readAt: null });
  const now = new Date();
  for (const doc of unread) {
    doc.readAt = now;
    await doc.save();
  }
};

module.exports = { createNotification, listNotifications, markRead, markAllRead };
```

`Notification.find({ organizationId, readAt: null })` for the unread count matches this codebase's mock-DB constraint (`$eq`/equality only — `readAt: null` is a plain equality match, not an operator the mock would reject).

- [ ] **Step 5: Write the controller**

Create `backend/controllers/notificationController.js`:

```js
const { listNotifications, markRead, markAllRead } = require("../services/notificationService");

const getNotifications = async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await listNotifications(req.user.organizationId, { unreadOnly, limit });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postMarkRead = async (req, res, next) => {
  try {
    const ok = await markRead(req.user.organizationId, req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Notification not found." });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

const postMarkAllRead = async (req, res, next) => {
  try {
    await markAllRead(req.user.organizationId);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getNotifications, postMarkRead, postMarkAllRead };
```

- [ ] **Step 6: Wire the routes**

In `backend/routes/adminRoutes.js`, add to the imports near the other controller requires:

```js
const { getNotifications, postMarkRead, postMarkAllRead } = require("../controllers/notificationController");
```

and before `module.exports = router;` at the end of the file:

```js
router.get("/notifications", verifyToken, isBusinessAdmin, getNotifications);
router.post("/notifications/:id/read", verifyToken, isBusinessAdmin, postMarkRead);
router.post("/notifications/read-all", verifyToken, isBusinessAdmin, postMarkAllRead);
```

- [ ] **Step 7: Add the redemption hook**

In `backend/services/pointsService.js`, add the import near the other service imports at the top:

```js
const { createNotification } = require("./notificationService");
```

Then, in `redeemPoints`, immediately after `return responsePayload;` inside the `try` block (right after the `session.withTransaction` call closes, before `} finally {`):

```js
    createNotification({
      organizationId,
      type: "redemption",
      message: `${redeemer.name} redeemed ${item.name}.`
    }).catch((err) => console.error("Notification create failed:", err.message));

    return responsePayload;
```

`redeemer` and `item` are already in scope from earlier in the function (`const redeemer = await User.findOne(...)` and `const item = await resolveRedeemable(...)`).

- [ ] **Step 8: Add the new-customer hook**

In `backend/services/customerAccountService.js`, add the import near the top:

```js
const { createNotification } = require("./notificationService");
```

Then in `ensureMembership`, inside the `if (!user) { ... }` branch, immediately after `await ensureUserPointsBalance(user._id, organizationId);` and before `return user;`:

```js
    createNotification({
      organizationId,
      type: "new_customer",
      message: `${account.name} joined.`
    }).catch((err) => console.error("Notification create failed:", err.message));

    return user;
```

This branch only runs when `User.create(...)` just ran (a genuinely new membership row) — the "found existing membership" branch below it is untouched, so a returning customer never re-fires this.

- [ ] **Step 9: Add the suite to the test chain**

In `backend/package.json`, append ` && node tests/notifications.js` to the end of the `"test"` script string.

- [ ] **Step 10: Run the test to verify it passes**

```bash
cd backend && node tests/notifications.js
```

Expected: PASS on every check, ending with `All notification checks passed.`

If the redemption section fails because `durbarmarg` has no redeemable items in the seed, check `seed/demoSeed.js` for what reward/menu items exist at `coffesarowar/durbarmarg` and adjust the test's assumption — do not weaken the assertion, find the real catalog entry.

- [ ] **Step 11: Run the full backend chain**

```bash
npm test -w backend
```

Expected: every suite passes.

- [ ] **Step 12: Commit**

```bash
git add backend/models/Notification.js backend/services/notificationService.js backend/controllers/notificationController.js backend/routes/adminRoutes.js backend/services/pointsService.js backend/services/customerAccountService.js backend/tests/notifications.js backend/package.json
git commit -m "feat: add notification center backend (model, API, redemption + new-customer hooks)"
```

---

### Task 2: Frontend — `NotificationBell` in `AdminLayout`

**Files:**
- Create: `frontend/src/components/admin/NotificationBell.tsx`
- Modify: `frontend/src/components/admin/AdminLayout.tsx` (import + render, near `ThemeToggle`, `AdminLayout.tsx:255-263`)

**Interfaces:**
- Consumes: `apiRequest` from `frontend/src/lib/api`; `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` from `../ui/dropdown-menu` (the same primitive `AccountMenu.tsx`/`OrgSwitcher.tsx` already use).
- Produces: `NotificationBell()` — no props, reads its own tenant context via the already-authenticated `apiRequest` (role defaults to `"admin"` for any `/api/admin/*` path per `apiRequest`'s existing path-based role selection).

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../lib/api";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";

interface NotificationItem {
  id: string;
  type: "redemption" | "new_customer";
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const MARK_READ_DWELL_MS = 2000;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["admin-notifications"],
    queryFn: () => apiRequest<NotificationsResponse>("/api/admin/notifications"),
    refetchInterval: 30_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markAllRead = async () => {
    await apiRequest("/api/admin/notifications/read-all", { method: "POST" });
    queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  };

  // Opening the panel counts as reading it, after a short dwell — matching
  // how a notification bell conventionally behaves, rather than requiring a
  // click per item. "Mark all read" stays available for clearing without
  // opening at all.
  useEffect(() => {
    if (open && unreadCount > 0) {
      dwellTimer.current = setTimeout(markAllRead, MARK_READ_DWELL_MS);
    }
    return () => {
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-[280px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--soft)]">
            Notifications
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-[11px] font-semibold text-[var(--primary-deep)] hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="px-2 py-4 text-center text-[13px] text-[var(--muted)]">
            Nothing yet.
          </div>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem key={n.id} className={!n.readAt ? "bg-[var(--primary-soft)]" : undefined}>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px]">{n.message}</span>
                <span className="text-[11px] text-[var(--soft)]">{relativeTime(n.createdAt)}</span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Wire it into `AdminLayout.tsx`**

Add the import next to `ThemeToggle`'s:

```tsx
import { NotificationBell } from "./NotificationBell";
```

Then in the rail bottom row (`AdminLayout.tsx:255-263`), add it next to `ThemeToggle`:

```tsx
        <div className="mt-2 flex items-center gap-2 border-t border-[var(--line)] pt-3">
          <div className="min-w-0 flex-1">
            <AccountMenu
              initial={(account?.name || user?.name || "?").charAt(0).toUpperCase()}
              name={account?.name || user?.name || ""}
              settingsPath={staffOnly ? undefined : "settings"}
              onLogout={handleLogout}
              dropUp
            />
          </div>
          <NotificationBell />
          <ThemeToggle className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]" />
        </div>
```

- [ ] **Step 3: Typecheck**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Start the backend on the mock DB (`MONGODB_URI="" npm run dev -w backend`) and the frontend. Sign in as an outlet admin (`durbarmarg@coffesarowar.com` / `password`):

1. The bell renders in the rail footer, next to the theme toggle, with no red dot initially (or a dot if Task 1's test run left unread rows — restart the backend for a clean seed if so).
2. From another tab, trigger a redemption or a new customer's first visit at this outlet (via the customer app, or by re-running the relevant portion of `backend/tests/notifications.js` against this same running server on port 5001 — adjust its `baseUrl`/port for a manual check, or simply perform the actions through the UI: register a new customer, have them scan into this outlet, then redeem).
3. Within 30s (or after a manual refresh), the badge appears.
4. Click the bell — the panel lists the notification(s), unread ones tinted.
5. Wait 2s with the panel open — the badge clears; re-opening shows all as read (no tint).
6. "Mark all read" clears the badge immediately without waiting.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/NotificationBell.tsx frontend/src/components/admin/AdminLayout.tsx
git commit -m "feat: add NotificationBell to the outlet admin console"
```

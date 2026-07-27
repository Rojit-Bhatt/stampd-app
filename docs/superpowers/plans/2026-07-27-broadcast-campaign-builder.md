# Phase 4: Broadcast Campaign Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an outlet admin create an ongoing, automated "Broadcast" — a segment (a tier label, or all customers) plus a plain-text message on one channel (email or push) — that the system sends to each matching customer exactly once, the moment they're first observed to match, with no manual send button and no scheduling.

**Architecture:** Two new models (`Broadcast`, `BroadcastLog`) and one new service (`broadcastService.js`) plumb straight into the existing post-earn fire-and-forget hook in `pointsService.claimPoints` (the same spot `checkMilestoneTrigger` already runs from) — no new cron job. `BroadcastLog` is both the audit trail and the idempotency guard: a row's mere existence for `{broadcastId, userId}` means "already evaluated, never touch again." Every new outlet gets two prebuilt starter broadcasts seeded at creation.

**Tech Stack:** Express/Mongoose (mock DB in dev/test) backend; React 19 + TanStack Query frontend. No new npm dependencies.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-07-27-broadcast-campaign-builder-design.md` — every decision below traces back to a numbered decision there.
- **Mock DB limits** (see root `CLAUDE.md`): no `findById` (`findOne({_id})` only), no `updateMany`, `findOneAndUpdate`'s update argument MUST be wrapped in `$set`, uniqueness is NOT enforced by indexes and must be checked in application code before every write, `.sort()` takes one key only, no aggregation pipeline (compute in JS).
- **Multi-tenant isolation:** every `Broadcast`/`BroadcastLog` query MUST include `organizationId`.
- **`BroadcastLog` row = idempotency guard.** A row is written ONLY when a customer actually matches a broadcast's segment. A non-matching customer gets no row and is simply re-checked on their next earn.
- **No `earns` pre-loading.** `pointsService.claimPoints` does not hold a loaded `PointsTransaction` array in scope (unlike `getCustomerDetailRows`/`getBalance`), so `evaluateBroadcasts` calls `resolveTier(organizationId, userId, {org})` without an `earns` param, letting it fetch fresh.
- **No content snapshotting.** `BroadcastLog` does not store the subject/body actually sent — editing a broadcast's copy affects only future sends (spec's explicit accepted limitation).

---

### Task 1: `Broadcast`/`BroadcastLog` models + CRUD service, controller, routes

**Files:**
- Create: `backend/models/Broadcast.js`
- Create: `backend/models/BroadcastLog.js`
- Create: `backend/services/broadcastService.js`
- Create: `backend/controllers/broadcastController.js`
- Modify: `backend/routes/adminRoutes.js`
- Create: `backend/tests/broadcasts.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `Broadcast` model (`organizationId, channel, segmentType, segmentTier, subject, body, active, createdAt`); `BroadcastLog` model (`broadcastId, organizationId, userId, status, sentAt`); `broadcastService.{createBroadcast, listBroadcasts, getBroadcastDetail, updateBroadcast, deleteBroadcast}` — all `(organizationId, ...)`-scoped, all used by Task 2's `evaluateBroadcasts` (via the two models directly) and by Task 4's frontend hook (via the routes below).
- Consumes: `config/platform.js`'s `TIER_LABELS` (`["Bronze", "Silver", "Gold", "Platinum"]`), `middleware/authMiddleware.js`'s `verifyToken`/`isBusinessAdmin`.

- [ ] **Step 1: Create the `Broadcast` model**

```js
// backend/models/Broadcast.js
const mongoose = require("mongoose");
const { TIER_LABELS } = require("../config/platform");

// An ongoing messaging rule, not a one-off blast: the admin sets a segment
// and a message once, and evaluateBroadcasts (services/broadcastService.js)
// sends it automatically the moment a customer is first observed to match —
// no send button, no scheduledAt. segmentTier is required only when
// segmentType is "tier"; "all" ignores it (kept null).
const BroadcastSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  channel: { type: String, enum: ["email", "push"], required: true },
  segmentType: { type: String, enum: ["tier", "all"], required: true },
  segmentTier: { type: String, enum: TIER_LABELS, default: null },
  subject: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  // Pausing stops all future evaluation (no new BroadcastLog rows) without
  // deleting history; reactivating does not retroactively catch up on
  // matches that would have fired while paused (evaluation only happens at
  // the moment of an earn).
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

BroadcastSchema.index({ organizationId: 1, active: 1 });

module.exports = mongoose.model("Broadcast", BroadcastSchema);
```

- [ ] **Step 2: Create the `BroadcastLog` model**

```js
// backend/models/BroadcastLog.js
const mongoose = require("mongoose");

// One row per (broadcast, customer), ever — written ONLY once a customer
// actually matches the broadcast's segment. The row's mere existence IS the
// idempotency guard: evaluateBroadcasts checks for one before doing
// anything else, and skips immediately if found. A customer who has never
// matched has no row and is simply re-checked on their next earn.
const BroadcastLogSchema = new mongoose.Schema({
  broadcastId: { type: mongoose.Schema.Types.ObjectId, ref: "Broadcast", required: true },
  // Denormalized from the broadcast so isolation-safe queries never need a
  // join — same reasoning as MessageLog.organizationId.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // "no_consent" is a permanent outcome, never retried later even if the
  // customer subsequently grants consent — matches sendTrigger's existing
  // {sent:false, reason:"no_consent"} behavior, which also never retries.
  status: { type: String, enum: ["sent", "failed", "no_consent"], required: true },
  sentAt: { type: Date, default: Date.now }
});

// The mock DB does not enforce this uniqueness — broadcastService MUST
// check-before-write in application code (see evaluateBroadcasts's own
// findOne guard). This index is real-Mongo insurance, not the enforcement
// mechanism itself.
BroadcastLogSchema.index({ broadcastId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("BroadcastLog", BroadcastLogSchema);
```

- [ ] **Step 3: Create `broadcastService.js` (CRUD only — `evaluateBroadcasts` and `seedDefaultBroadcasts` come in Tasks 2 and 3)**

```js
// backend/services/broadcastService.js
const Broadcast = require("../models/Broadcast");
const BroadcastLog = require("../models/BroadcastLog");
const User = require("../models/User");
const { TIER_LABELS } = require("../config/platform");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const CHANNELS = ["email", "push"];
const SEGMENT_TYPES = ["tier", "all"];

const parseInput = (input) => {
  const channel = String(input.channel || "");
  if (!CHANNELS.includes(channel)) {
    throw createHttpError("Pick a channel: email or push.", 400);
  }

  const segmentType = String(input.segmentType || "");
  if (!SEGMENT_TYPES.includes(segmentType)) {
    throw createHttpError("Pick a segment: a tier, or all customers.", 400);
  }

  let segmentTier = null;
  if (segmentType === "tier") {
    segmentTier = String(input.segmentTier || "");
    if (!TIER_LABELS.includes(segmentTier)) {
      throw createHttpError("Pick a valid tier label.", 400);
    }
  }

  const subject = String(input.subject || "").trim();
  if (!subject) throw createHttpError("Give it a subject or title.", 400);

  const body = String(input.body || "").trim();
  if (!body) throw createHttpError("Write the message.", 400);

  return { channel, segmentType, segmentTier, subject, body };
};

const getCounts = async (broadcastId) => {
  const logs = await BroadcastLog.find({ broadcastId });
  return {
    sentCount: logs.filter((l) => l.status === "sent").length,
    failedCount: logs.filter((l) => l.status === "failed").length,
    noConsentCount: logs.filter((l) => l.status === "no_consent").length
  };
};

const format = (b, counts) => ({
  id: b._id.toString(),
  channel: b.channel,
  segmentType: b.segmentType,
  segmentTier: b.segmentTier,
  subject: b.subject,
  body: b.body,
  active: b.active,
  createdAt: b.createdAt,
  sentCount: counts.sentCount,
  failedCount: counts.failedCount,
  noConsentCount: counts.noConsentCount
});

const listBroadcasts = async (organizationId) => {
  const rows = await Broadcast.find({ organizationId }).sort({ createdAt: -1 });
  return Promise.all(rows.map(async (b) => format(b, await getCounts(b._id))));
};

const createBroadcast = async (organizationId, input) => {
  const parsed = parseInput(input);
  const created = await Broadcast.create({ organizationId, ...parsed, active: true });
  return format(created, await getCounts(created._id));
};

// Segment/channel are NOT editable — changing them after some evaluation
// has already happened would make existing BroadcastLog rows describe a
// different rule retroactively (see design spec Decision 9's neighbor note
// on updateBroadcast). Delete and recreate to change segment or channel.
const updateBroadcast = async (organizationId, id, input) => {
  const broadcast = await Broadcast.findOne({ _id: id, organizationId });
  if (!broadcast) throw createHttpError("Broadcast not found.", 404);

  if (input.active !== undefined) {
    broadcast.active = Boolean(input.active);
  }
  if (input.subject !== undefined) {
    const subject = String(input.subject).trim();
    if (!subject) throw createHttpError("Give it a subject or title.", 400);
    broadcast.subject = subject;
  }
  if (input.body !== undefined) {
    const body = String(input.body).trim();
    if (!body) throw createHttpError("Write the message.", 400);
    broadcast.body = body;
  }

  await broadcast.save();
  return format(broadcast, await getCounts(broadcast._id));
};

const deleteBroadcast = async (organizationId, id) => {
  const broadcast = await Broadcast.findOne({ _id: id, organizationId });
  if (!broadcast) throw createHttpError("Broadcast not found.", 404);
  await Broadcast.deleteOne({ _id: broadcast._id });
  await BroadcastLog.deleteMany({ broadcastId: broadcast._id });
  return { success: true };
};

// Per-recipient drill-down: the broadcast plus every BroadcastLog row for
// it, each enriched with the customer's name/email off the User membership
// row (not a Mongoose populate — CLAUDE.md notes populate only reliably
// covers the userId path elsewhere in this codebase; a direct lookup here
// keeps this independent of that).
const getBroadcastDetail = async (organizationId, id) => {
  const broadcast = await Broadcast.findOne({ _id: id, organizationId });
  if (!broadcast) throw createHttpError("Broadcast not found.", 404);

  const logs = await BroadcastLog.find({ broadcastId: broadcast._id, organizationId }).sort({ sentAt: -1 });
  const recipients = await Promise.all(
    logs.map(async (log) => {
      const member = await User.findOne({ _id: log.userId, organizationId });
      return {
        userId: log.userId.toString(),
        name: member ? member.name : "(deleted customer)",
        email: member ? member.email : "",
        status: log.status,
        sentAt: log.sentAt
      };
    })
  );

  return { ...format(broadcast, await getCounts(broadcast._id)), recipients };
};

module.exports = {
  listBroadcasts,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  getBroadcastDetail
};
```

- [ ] **Step 4: Create `broadcastController.js`**

```js
// backend/controllers/broadcastController.js
const {
  listBroadcasts,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  getBroadcastDetail
} = require("../services/broadcastService");

const list = async (req, res, next) => {
  try {
    const data = await listBroadcasts(req.user.organizationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const broadcast = await createBroadcast(req.user.organizationId, req.body);
    res.status(201).json({ success: true, broadcast });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const broadcast = await updateBroadcast(req.user.organizationId, req.params.id, req.body);
    res.status(200).json({ success: true, broadcast });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await deleteBroadcast(req.user.organizationId, req.params.id);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

const detail = async (req, res, next) => {
  try {
    const data = await getBroadcastDetail(req.user.organizationId, req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { list, create, update, remove, detail };
```

- [ ] **Step 5: Wire routes into `adminRoutes.js`**

In `backend/routes/adminRoutes.js`, add near the top alongside the other controller imports:

```js
const broadcastController = require("../controllers/broadcastController");
```

Add near the bottom, alongside the existing `rewards`/`campaigns` route blocks (right before `module.exports = router;`):

```js
router.get("/broadcasts", verifyToken, isBusinessAdmin, broadcastController.list);
router.post("/broadcasts", verifyToken, isBusinessAdmin, broadcastController.create);
router.get("/broadcasts/:id", verifyToken, isBusinessAdmin, broadcastController.detail);
router.patch("/broadcasts/:id", verifyToken, isBusinessAdmin, broadcastController.update);
router.delete("/broadcasts/:id", verifyToken, isBusinessAdmin, broadcastController.remove);
```

- [ ] **Step 6: Create `backend/tests/broadcasts.js` covering CRUD + isolation**

```js
/**
 * Broadcast campaign builder suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. This first pass covers CRUD, validation, and cross-
 * tenant isolation. evaluateBroadcasts matching/idempotency (Task 2) and
 * prebuilt seeding (Task 3) are appended to this same file in later tasks.
 *
 * Run directly: `node tests/broadcasts.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5054 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const emptyList = await api("/api/admin/broadcasts", { token: adminToken });
    check("GET /broadcasts starts as an array (may already hold prebuilts once Task 3 lands)", Array.isArray(emptyList.body.data));

    const badChannel = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "carrier-pigeon", segmentType: "all", subject: "Hi", body: "Hi there" },
    });
    check("invalid channel is rejected", badChannel.status === 400);

    const badSegment = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "planet", subject: "Hi", body: "Hi there" },
    });
    check("invalid segmentType is rejected", badSegment.status === 400);

    const missingTier = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "tier", subject: "Hi", body: "Hi there" },
    });
    check("segmentType tier without a valid segmentTier is rejected", missingTier.status === 400);

    const created = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "tier", segmentTier: "Gold", subject: "Welcome to Gold", body: "You made it!" },
    });
    check("create broadcast -> 201", created.status === 201);
    check("created broadcast is active by default", created.body.broadcast.active === true);
    check("created broadcast has zeroed counts", created.body.broadcast.sentCount === 0 && created.body.broadcast.failedCount === 0 && created.body.broadcast.noConsentCount === 0);

    const broadcastId = created.body.broadcast.id;

    const listed = await api("/api/admin/broadcasts", { token: adminToken });
    check("listed broadcasts includes the new one", listed.body.data.some((b) => b.id === broadcastId));

    const paused = await api(`/api/admin/broadcasts/${broadcastId}`, {
      method: "PATCH", token: adminToken, body: { active: false },
    });
    check("PATCH active:false pauses the broadcast", paused.body.broadcast.active === false);

    const editedContent = await api(`/api/admin/broadcasts/${broadcastId}`, {
      method: "PATCH", token: adminToken, body: { subject: "Congrats on Gold!", body: "New copy." },
    });
    check("PATCH edits subject/body", editedContent.body.broadcast.subject === "Congrats on Gold!" && editedContent.body.broadcast.body === "New copy.");
    check("segment/channel are unaffected by a content-only PATCH", editedContent.body.broadcast.segmentTier === "Gold" && editedContent.body.broadcast.channel === "email");

    const detail = await api(`/api/admin/broadcasts/${broadcastId}`, { token: adminToken });
    check("detail view returns an empty recipients list before any evaluation", Array.isArray(detail.body.data.recipients) && detail.body.data.recipients.length === 0);

    // Cross-tenant isolation: a sibling outlet must never see this broadcast.
    const sibling = await makeSiblingOutlet(baseUrl, { label: `bc${Date.now()}` });
    const siblingList = await api("/api/admin/broadcasts", { token: sibling.adminToken, slug: sibling.outletSlug });
    check("a sibling outlet's broadcast list never includes another outlet's broadcast", !siblingList.body.data.some((b) => b.id === broadcastId));

    const siblingDetailAttempt = await api(`/api/admin/broadcasts/${broadcastId}`, { token: sibling.adminToken, slug: sibling.outletSlug });
    check("a sibling outlet cannot fetch another outlet's broadcast detail by id", siblingDetailAttempt.status === 404);

    const deleted = await api(`/api/admin/broadcasts/${broadcastId}`, { method: "DELETE", token: adminToken });
    check("DELETE removes the broadcast", deleted.status === 200);

    const afterDelete = await api("/api/admin/broadcasts", { token: adminToken });
    check("deleted broadcast no longer appears in the list", !afterDelete.body.data.some((b) => b.id === broadcastId));
  } finally {
    stop();
  }

  if (failures) { console.error(`broadcasts: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("broadcasts: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 7: Add the suite to `backend/package.json`'s test chain**

Append ` && node tests/broadcasts.js` to the end of the existing `"test"` script string in `backend/package.json` (after `node tests/push-notifications.js`).

- [ ] **Step 8: Run the suite**

Run: `cd backend && MONGODB_URI="" node tests/broadcasts.js`
Expected: `broadcasts: all PASS`, no FAIL lines.

- [ ] **Step 9: Commit**

```bash
git add backend/models/Broadcast.js backend/models/BroadcastLog.js backend/services/broadcastService.js backend/controllers/broadcastController.js backend/routes/adminRoutes.js backend/tests/broadcasts.js backend/package.json
git commit -m "feat: add Broadcast/BroadcastLog models and CRUD API"
```

---

### Task 2: `evaluateBroadcasts` — segment matching, consent, idempotency, wired into the earn path

**Files:**
- Modify: `backend/services/messagingService.js`
- Modify: `backend/services/broadcastService.js`
- Modify: `backend/services/pointsService.js`
- Modify: `backend/tests/broadcasts.js`

**Interfaces:**
- Consumes: `tierService.resolveTier(organizationId, userId, {org})` (Phase 1); `emailService.sendEmail({to, subject, html})` (throws on failure, resolves `{ok:true}` on success — confirmed at `backend/services/emailService.js`); `PushSubscription` model (Phase 3b); `CustomerAccount.marketingConsent.{email,push}.granted`.
- Produces: `broadcastService.evaluateBroadcasts({organization, membership})` — called fire-and-forget from `pointsService.claimPoints` right after `checkMilestoneTrigger`, same shape.

- [ ] **Step 1: Extend `sendPushToSubscription` to report success/failure**

In `backend/services/messagingService.js`, change:

```js
const sendPushToSubscription = async (sub, payload) => {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await PushSubscription.deleteOne({ _id: sub._id });
    } else {
      console.error("Failed to send push notification:", err.message);
    }
  }
};
```

to:

```js
// Never rejects — every failure path (dead subscription or anything else)
// is handled internally, so callers can fire this without a .catch().
// Returns {ok} so a caller that needs real delivery status (broadcastService's
// evaluateBroadcasts) can tell success from failure; existing trigger callers
// (sendTrigger below) ignore the return value exactly as before.
const sendPushToSubscription = async (sub, payload) => {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await PushSubscription.deleteOne({ _id: sub._id });
    } else {
      console.error("Failed to send push notification:", err.message);
    }
    return { ok: false };
  }
};
```

No other change needed in this file — `sendTrigger`'s existing call site doesn't use the return value, so this is purely additive.

- [ ] **Step 2: Add `evaluateBroadcasts` to `broadcastService.js`**

Add these requires to the top of `backend/services/broadcastService.js` (alongside the existing ones):

```js
const CustomerAccount = require("../models/CustomerAccount");
const PushSubscription = require("../models/PushSubscription");
const { resolveTier } = require("./tierService");
const { sendEmail } = require("./emailService");
const { sendPushToSubscription } = require("./messagingService");
```

Add this function (and export it) at the bottom of the file, before `module.exports`:

```js
// The evaluation entrypoint, called fire-and-forget from
// pointsService.claimPoints right after checkMilestoneTrigger. A customer's
// tier can only change as a RESULT of an earn (it's a trailing-12-month
// window recomputed from PointsTransaction rows), so post-earn is the only
// point a "tier reached" event can newly become true — no cron needed.
const evaluateBroadcasts = async ({ organization, membership }) => {
  const broadcasts = await Broadcast.find({ organizationId: organization._id, active: true });
  if (broadcasts.length === 0) return;

  for (const broadcast of broadcasts) {
    // The row's mere existence IS the guard — skip before even checking
    // segment match, so a customer who has already been handled (sent,
    // failed, or no_consent) is never re-evaluated for this broadcast again.
    const existing = await BroadcastLog.findOne({ broadcastId: broadcast._id, userId: membership._id });
    if (existing) continue;

    let matches = false;
    if (broadcast.segmentType === "all") {
      matches = true;
    } else if (broadcast.segmentType === "tier") {
      const tier = await resolveTier(organization._id, membership._id, { org: organization });
      matches = tier === broadcast.segmentTier;
    }

    // Not yet matched — no log row, so this customer is simply re-checked
    // on their next earn (or forever, if they never reach the segment).
    if (!matches) continue;

    // A membership with no linked CustomerAccount has no consent record and
    // no email/push channel to reach — same guard as checkMilestoneTrigger.
    if (!membership.customerAccountId) continue;
    const customer = await CustomerAccount.findOne({ _id: membership.customerAccountId });
    if (!customer) continue;

    const consented = customer.marketingConsent?.[broadcast.channel]?.granted;
    if (!consented) {
      await BroadcastLog.create({
        broadcastId: broadcast._id,
        organizationId: organization._id,
        userId: membership._id,
        status: "no_consent"
      });
      continue;
    }

    let status;
    if (broadcast.channel === "email") {
      try {
        await sendEmail({ to: customer.email, subject: broadcast.subject, html: `<p>${broadcast.body}</p>` });
        status = "sent";
      } catch (err) {
        console.error(`Broadcast email failed for ${customer.email}:`, err.message);
        status = "failed";
      }
    } else {
      const subscriptions = await PushSubscription.find({ customerAccountId: customer._id });
      let anySucceeded = false;
      for (const sub of subscriptions) {
        const result = await sendPushToSubscription(sub, { title: broadcast.subject, body: broadcast.body });
        if (result.ok) anySucceeded = true;
      }
      status = anySucceeded ? "sent" : "failed";
    }

    await BroadcastLog.create({
      broadcastId: broadcast._id,
      organizationId: organization._id,
      userId: membership._id,
      status
    });
  }
};
```

Add `evaluateBroadcasts` to the `module.exports` object at the bottom of the file.

- [ ] **Step 3: Wire `evaluateBroadcasts` into `pointsService.claimPoints`**

In `backend/services/pointsService.js`, add the import near the top alongside `checkMilestoneTrigger`:

```js
const { checkMilestoneTrigger } = require("./messagingService");
const { evaluateBroadcasts } = require("./broadcastService");
```

Right after the existing fire-and-forget call (`backend/services/pointsService.js:408-409`):

```js
    checkMilestoneTrigger({ organization: org, membership: claimer })
      .catch((err) => console.error("Milestone trigger check failed:", err.message));
```

add:

```js
    evaluateBroadcasts({ organization: org, membership: claimer })
      .catch((err) => console.error("Broadcast evaluation failed:", err.message));
```

Both calls stay un-awaited and fire before `return responsePayload;` — the atomic earn transaction has already committed by this point, so neither call can affect the award itself.

- [ ] **Step 4: Append matching/idempotency/consent/pause/isolation tests to `backend/tests/broadcasts.js`**

Add this helper near the top of the file (same shape as `messaging-triggers.js`'s, reused verbatim):

```js
async function provisionTenantCustomer(api, label, phoneSuffix, slug = SLUG) {
  const email = `${label}_${Date.now()}@test.co`;
  const reg = await api("/api/customer-auth/register", {
    method: "POST",
    slug: null,
    body: { name: label, email, password: "password123", phone: `98111100${phoneSuffix}` },
  });
  const globalToken = reg.body.token;
  const entered = await api("/api/customer-auth/enter-tenant", {
    method: "POST",
    token: globalToken,
    slug,
    body: {},
  });
  return { email, globalToken, tenantToken: entered.body.token, userId: entered.body.user.id };
}

async function getOrgId(baseUrl, companySlug, outletSlug) {
  const resp = await fetch(`${baseUrl}/__test__/get-organization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companySlug, outletSlug }),
  });
  const body = await resp.json();
  return body.organizationId;
}
```

Add these assertions inside `main()`, right before the `} finally { stop(); }` block (after the existing CRUD/isolation assertions from Task 1 — note the earlier Task 1 test already deleted its own broadcast, so these start clean):

```js
    const orgId = await getOrgId(baseUrl, COMPANY, SLUG);

    // Configure Gold thresholds low enough that a single earn crosses them.
    await api("/api/admin/settings", {
      method: "PATCH", token: adminToken,
      body: { tierThresholds: { Gold: { minVisits: 1, minSpend: 0 } } },
    });

    const goldBroadcast = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "tier", segmentTier: "Gold", subject: "Welcome to Gold!", body: "You made it." },
    });
    const goldBroadcastId = goldBroadcast.body.broadcast.id;

    const goldCustomer = await provisionTenantCustomer(api, "GoldReacher", "20");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: goldCustomer.globalToken, slug: null, body: { emailOptIn: true } });

    const gen1 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen1.body.data.token } });

    const goldDetailAfterFirst = await api(`/api/admin/broadcasts/${goldBroadcastId}`, { token: adminToken });
    check("tier broadcast fires exactly once, the earn that reaches Gold", goldDetailAfterFirst.body.data.sentCount === 1);
    check("the sent recipient is the customer who just reached Gold", goldDetailAfterFirst.body.data.recipients.some((r) => r.userId === goldCustomer.userId && r.status === "sent"));

    const gen2 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen2.body.data.token } });
    const goldDetailAfterSecond = await api(`/api/admin/broadcasts/${goldBroadcastId}`, { token: adminToken });
    check("idempotency: a further earn after already matching does not re-send or re-log", goldDetailAfterSecond.body.data.sentCount === 1 && goldDetailAfterSecond.body.data.recipients.length === 1);

    // A customer without email consent who also reaches Gold gets logged
    // no_consent, not sent, and no email is attempted.
    const noConsentGold = await provisionTenantCustomer(api, "GoldNoConsent", "21");
    const gen3 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: noConsentGold.tenantToken, body: { token: gen3.body.data.token } });
    const goldDetailAfterNoConsent = await api(`/api/admin/broadcasts/${goldBroadcastId}`, { token: adminToken });
    check("a matching customer without consent is logged no_consent", goldDetailAfterNoConsent.body.data.recipients.some((r) => r.userId === noConsentGold.userId && r.status === "no_consent"));
    check("no_consent does not count as sent", goldDetailAfterNoConsent.body.data.sentCount === 1);

    // An "all customers" broadcast fires once for an EXISTING customer (one
    // who already had activity before the broadcast existed) on their next
    // earn, and not again after that.
    const allBroadcast = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "all", subject: "Hey there", body: "Thanks for being here." },
    });
    const allBroadcastId = allBroadcast.body.broadcast.id;

    const gen4 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen4.body.data.token } });
    const allDetailAfterFirst = await api(`/api/admin/broadcasts/${allBroadcastId}`, { token: adminToken });
    check("all-segment broadcast fires once for an existing customer on their next earn", allDetailAfterFirst.body.data.sentCount === 1);

    const gen5 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen5.body.data.token } });
    const allDetailAfterSecond = await api(`/api/admin/broadcasts/${allBroadcastId}`, { token: adminToken });
    check("all-segment broadcast does not re-fire for the same customer", allDetailAfterSecond.body.data.sentCount === 1);

    // Pausing stops future matches; reactivating does not retroactively
    // catch up on a match that occurred while paused.
    const pauseBroadcast = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "all", subject: "Pause test", body: "Should not fire while paused." },
    });
    const pauseBroadcastId = pauseBroadcast.body.broadcast.id;
    await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { method: "PATCH", token: adminToken, body: { active: false } });

    const pausedCustomer = await provisionTenantCustomer(api, "PausedRule", "22");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: pausedCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const genPaused = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: pausedCustomer.tenantToken, body: { token: genPaused.body.data.token } });

    const pauseDetailWhilePaused = await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { token: adminToken });
    check("a paused broadcast does not fire for a newly matching customer", pauseDetailWhilePaused.body.data.sentCount === 0);

    await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { method: "PATCH", token: adminToken, body: { active: true } });
    const pauseDetailAfterReactivate = await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { token: adminToken });
    check("reactivating does NOT retroactively catch up a match that occurred while paused", pauseDetailAfterReactivate.body.data.sentCount === 0);

    const genReactivated = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: pausedCustomer.tenantToken, body: { token: genReactivated.body.data.token } });
    const pauseDetailAfterFurtherEarn = await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { token: adminToken });
    check("a further earn AFTER reactivating fires normally", pauseDetailAfterFurtherEarn.body.data.sentCount === 1);

    // Cross-tenant isolation: an earn at a sibling outlet must never feed a
    // broadcast that belongs to this outlet.
    const sibling2 = await makeSiblingOutlet(baseUrl, { label: `bceval${Date.now()}` });
    const siblingCustomer = await provisionTenantCustomer(api, "SiblingEval", "23", sibling2.outletSlug);
    await api("/api/customer-auth/preferences", { method: "PATCH", token: siblingCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const genSibling = await api("/api/admin/generate-qr", { method: "POST", token: sibling2.adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: siblingCustomer.tenantToken, body: { token: genSibling.body.data.token } });

    const allDetailAfterSiblingEarn = await api(`/api/admin/broadcasts/${allBroadcastId}`, { token: adminToken });
    check("an earn at a sibling outlet never feeds this outlet's broadcast", !allDetailAfterSiblingEarn.body.data.recipients.some((r) => r.userId === siblingCustomer.userId));
```

- [ ] **Step 5: Run the suite**

Run: `cd backend && MONGODB_URI="" node tests/broadcasts.js`
Expected: `broadcasts: all PASS`, no FAIL lines.

- [ ] **Step 6: Run the full backend regression suite**

Run: `cd backend && MONGODB_URI="" npm test`
Expected: every suite passes, including the existing `tier-system`, `tier-distribution`, and `messaging-triggers` suites (broadcast evaluation must not perturb their existing assertions).

- [ ] **Step 7: Commit**

```bash
git add backend/services/messagingService.js backend/services/broadcastService.js backend/services/pointsService.js backend/tests/broadcasts.js
git commit -m "feat: add evaluateBroadcasts segment matching wired into the earn path"
```

---

### Task 3: Prebuilt starter broadcasts, seeded at outlet creation

**Files:**
- Modify: `backend/services/broadcastService.js`
- Modify: `backend/services/companyService.js`
- Modify: `backend/tests/broadcasts.js`

**Interfaces:**
- Consumes: `Broadcast.create(...)` (Task 1).
- Produces: `broadcastService.seedDefaultBroadcasts(organizationId)`, called once at the end of `companyService.createOutlet`.

- [ ] **Step 1: Add `seedDefaultBroadcasts` to `broadcastService.js`**

Add this function (and export it) in `backend/services/broadcastService.js`, above `module.exports`:

```js
// Every new outlet gets these two, active by default, freely editable or
// deletable like any other broadcast. "Gold tier congrats" is inert until
// the admin configures tierThresholds — resolveTier returns null with none
// configured, which never equals "Gold", so it simply never matches until
// then (no error, no special-casing needed).
const seedDefaultBroadcasts = async (organizationId) => {
  await Broadcast.create({
    organizationId,
    channel: "email",
    segmentType: "all",
    segmentTier: null,
    subject: "Welcome!",
    body: "Thanks for joining us — every visit earns points you can redeem for rewards. See you soon!",
    active: true
  });

  await Broadcast.create({
    organizationId,
    channel: "email",
    segmentType: "tier",
    segmentTier: "Gold",
    subject: "You've reached Gold status!",
    body: "Thanks for being a regular — you've hit Gold tier. We appreciate you.",
    active: true
  });
};
```

Add `seedDefaultBroadcasts` to the `module.exports` object.

- [ ] **Step 2: Call it from `companyService.createOutlet`**

In `backend/services/companyService.js`, add the import near the top alongside the other requires:

```js
const { seedDefaultBroadcasts } = require("./broadcastService");
```

In `createOutlet` (`backend/services/companyService.js:149`), right after the `Organization.create(...)` call and before the `AdminAccount.create(...)` call, add:

```js
  await seedDefaultBroadcasts(organization._id);
```

- [ ] **Step 3: Append a seeding test to `backend/tests/broadcasts.js`**

Add this assertion inside `main()`, right before the `} finally { stop(); }` block:

```js
    // demoSeed.js's outlets get these too, automatically, by virtue of also
    // calling createOutlet — no separate demo-seed-only code path exists.
    const freshOutlet = await makeSiblingOutlet(baseUrl, { label: `prebuilt${Date.now()}` });
    const freshOutletBroadcasts = await api("/api/admin/broadcasts", { token: freshOutlet.adminToken, slug: freshOutlet.outletSlug });
    check("a newly created outlet gets exactly 2 prebuilt broadcasts", freshOutletBroadcasts.body.data.length === 2);
    check("both prebuilts are active by default", freshOutletBroadcasts.body.data.every((b) => b.active === true));
    check("one prebuilt targets all customers on email", freshOutletBroadcasts.body.data.some((b) => b.segmentType === "all" && b.channel === "email"));
    check("one prebuilt targets Gold tier on email", freshOutletBroadcasts.body.data.some((b) => b.segmentType === "tier" && b.segmentTier === "Gold" && b.channel === "email"));
```

- [ ] **Step 4: Run the suite, then the full backend regression suite**

Run: `cd backend && MONGODB_URI="" node tests/broadcasts.js`
Expected: `broadcasts: all PASS`.

Run: `cd backend && MONGODB_URI="" npm test`
Expected: every suite passes — in particular `company-outlets.js` (which already exercises `createOutlet` heavily) must be unaffected by the new seeding call.

- [ ] **Step 5: Commit**

```bash
git add backend/services/broadcastService.js backend/services/companyService.js backend/tests/broadcasts.js
git commit -m "feat: seed prebuilt starter broadcasts at outlet creation"
```

---

### Task 4: Admin frontend — Broadcasts page

**Files:**
- Create: `frontend/src/hooks/useBroadcasts.ts`
- Create: `frontend/src/routes/admin/AdminBroadcasts.tsx`
- Modify: `frontend/src/components/admin/AdminLayout.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/admin/broadcasts[/:id]` (Task 1); `lib/api.ts`'s `apiRequest`; `context/AdminAuthContext`'s `useAdminAuth`; `config/platform.js`'s `TIER_LABELS` mirrored as a frontend constant (same pattern already used for `DAY_LABELS` in `useCampaigns.ts` — hardcode the four labels here since no endpoint currently exposes `TIER_LABELS` to the frontend, and `PointsProgram.tsx`'s existing tier-threshold form already hardcodes them the same way).
- Produces: nothing consumed by a later task — this is the last task.

- [ ] **Step 1: Check how `PointsProgram.tsx` already hardcodes the four tier labels**

Run: `grep -n "Bronze\|Silver\|Gold\|Platinum" frontend/src/routes/admin/PointsProgram.tsx`
Confirm the exact casing/array literal used there, and reuse the identical spelling in `useBroadcasts.ts` (`TIER_LABELS` below) so the dropdown values line up byte-for-byte with what `segmentTier` validates against on the backend (`config/platform.js`'s `TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"]`).

- [ ] **Step 2: Create `useBroadcasts.ts`**

```ts
// frontend/src/hooks/useBroadcasts.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import { useAdminAuth } from "../context/AdminAuthContext";

export const TIER_LABELS = ["Bronze", "Silver", "Gold", "Platinum"] as const;
export type TierLabel = (typeof TIER_LABELS)[number];

export interface Broadcast {
  id: string;
  channel: "email" | "push";
  segmentType: "tier" | "all";
  segmentTier: TierLabel | null;
  subject: string;
  body: string;
  active: boolean;
  createdAt: string;
  sentCount: number;
  failedCount: number;
  noConsentCount: number;
}

export interface BroadcastRecipient {
  userId: string;
  name: string;
  email: string;
  status: "sent" | "failed" | "no_consent";
  sentAt: string;
}

export interface BroadcastDetail extends Broadcast {
  recipients: BroadcastRecipient[];
}

export interface BroadcastDraft {
  channel: "email" | "push";
  segmentType: "tier" | "all";
  segmentTier: TierLabel | null;
  subject: string;
  body: string;
}

export function useBroadcasts() {
  const { user } = useAdminAuth();
  const orgId = user?.organizationId ?? null;
  return useQuery<Broadcast[]>({
    queryKey: ["adminBroadcasts", orgId],
    queryFn: async () => {
      const res = await apiRequest<{ success: boolean; data: Broadcast[] }>("/api/admin/broadcasts", {
        role: "admin",
      });
      return res.data || [];
    },
  });
}

export function useBroadcastDetail(id: string | null) {
  return useQuery<BroadcastDetail | null>({
    queryKey: ["adminBroadcastDetail", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await apiRequest<{ success: boolean; data: BroadcastDetail }>(`/api/admin/broadcasts/${id}`, {
        role: "admin",
      });
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useBroadcastMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["adminBroadcasts"] });
  const invalidateDetail = (id: string) => qc.invalidateQueries({ queryKey: ["adminBroadcastDetail", id] });

  const create = useMutation({
    mutationFn: (draft: BroadcastDraft) =>
      apiRequest<{ success: boolean; broadcast: Broadcast }>("/api/admin/broadcasts", {
        method: "POST", role: "admin", body: draft,
      }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Broadcast, "active" | "subject" | "body">> }) =>
      apiRequest<{ success: boolean; broadcast: Broadcast }>(`/api/admin/broadcasts/${id}`, {
        method: "PATCH", role: "admin", body: patch,
      }),
    onSuccess: (_data, variables) => {
      invalidate();
      invalidateDetail(variables.id);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/broadcasts/${id}`, { method: "DELETE", role: "admin" }),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
```

- [ ] **Step 3: Create `AdminBroadcasts.tsx`**

```tsx
// frontend/src/routes/admin/AdminBroadcasts.tsx
import { useState } from "react";
import { Plus, Trash2, X, Check, Megaphone } from "lucide-react";
import toast from "react-hot-toast";
import {
  useBroadcasts,
  useBroadcastDetail,
  useBroadcastMutations,
  TIER_LABELS,
  type Broadcast,
  type BroadcastDraft,
} from "../../hooks/useBroadcasts";
import { Skeleton } from "../../components/ui/skeleton";
import { ConfirmDialog } from "../../components/shared/ConfirmDialog";

const emptyDraft = (): BroadcastDraft => ({
  channel: "email",
  segmentType: "all",
  segmentTier: null,
  subject: "",
  body: "",
});

function segmentLabel(b: Pick<Broadcast, "segmentType" | "segmentTier">): string {
  return b.segmentType === "all" ? "All customers" : `Reaches ${b.segmentTier}`;
}

function BroadcastFields({ draft, onChange }: { draft: BroadcastDraft; onChange: (next: BroadcastDraft) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <select
          value={draft.channel}
          onChange={(e) => onChange({ ...draft, channel: e.target.value as BroadcastDraft["channel"] })}
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="email">Email</option>
          <option value="push">Push notification</option>
        </select>
        <select
          value={draft.segmentType === "all" ? "all" : draft.segmentTier || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "all") onChange({ ...draft, segmentType: "all", segmentTier: null });
            else onChange({ ...draft, segmentType: "tier", segmentTier: v as BroadcastDraft["segmentTier"] });
          }}
          className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          <option value="all">All customers</option>
          {TIER_LABELS.map((label) => (
            <option key={label} value={label}>Reaches {label}</option>
          ))}
        </select>
      </div>

      <input
        value={draft.subject}
        onChange={(e) => onChange({ ...draft, subject: e.target.value })}
        placeholder="Subject / title"
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
      <textarea
        value={draft.body}
        onChange={(e) => onChange({ ...draft, body: e.target.value })}
        placeholder="Message"
        rows={4}
        className="rounded-[11px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus:border-[var(--primary)] focus:outline-none"
      />
    </div>
  );
}

function BroadcastDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useBroadcastDetail(id);

  return (
    <div className="shadow-ambient mb-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-[var(--ink)]">{data?.subject || "Loading…"}</h2>
        <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-24 rounded-[var(--radius-card)]" />
      ) : data.recipients.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No one has matched this broadcast yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.recipients.map((r) => (
            <div key={r.userId} className="flex items-center justify-between rounded-[11px] border border-[var(--line)] px-3.5 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-bold text-[var(--ink)]">{r.name}</div>
                <div className="truncate text-[var(--muted)]">{r.email}</div>
              </div>
              <span
                className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                style={
                  r.status === "sent"
                    ? { background: "var(--ok-soft)", color: "var(--ok)" }
                    : r.status === "failed"
                      ? { background: "var(--err-soft)", color: "var(--err)" }
                      : { background: "var(--surface-2)", color: "var(--soft)" }
                }
              >
                {r.status === "no_consent" ? "No consent" : r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBroadcasts() {
  const { data: broadcasts = [], isLoading } = useBroadcasts();
  const { create, update, remove } = useBroadcastMutations();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<BroadcastDraft>(emptyDraft());
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Broadcast | null>(null);

  const submitNew = async () => {
    try {
      await create.mutateAsync(draft);
      toast.success("Broadcast is live!");
      setDraft(emptyDraft());
      setAdding(false);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save that — try again.");
    }
  };

  const toggle = async (b: Broadcast) => {
    try {
      await update.mutateAsync({ id: b.id, patch: { active: !b.active } });
      toast.success(b.active ? "Broadcast paused." : "Broadcast is back on!");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't update that — try again.");
    }
  };

  return (
    <div className="max-w-[760px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold text-[var(--ink)]">Broadcasts</h1>
          <p className="text-[var(--muted)]">
            An ongoing message that sends itself the moment a customer matches — no scheduling, nothing to click.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="stamp-interactive flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-bold text-white"
            style={{ background: "var(--primary)" }}
          >
            <Plus className="h-4 w-4" />
            New broadcast
          </button>
        )}
      </div>

      {adding && (
        <div className="shadow-ambient mb-4 rounded-[var(--radius-card)] bg-[var(--surface)] p-5">
          <BroadcastFields draft={draft} onChange={setDraft} />
          <div className="mt-3 flex gap-2">
            <button
              onClick={submitNew}
              disabled={create.isPending}
              className="stamp-interactive rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {create.isPending ? "Saving…" : "Save broadcast"}
            </button>
            <button
              onClick={() => { setAdding(false); setDraft(emptyDraft()); }}
              className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-card)]" />)}
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-ambient px-5 py-10 text-center text-sm text-[var(--muted)]">
          No broadcasts yet. Create one to reach customers automatically as they hit a tier or join.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {broadcasts.map((b) => (
            <div key={b.id}>
              <div
                className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-ambient"
                style={{ opacity: b.active ? 1 : 0.6 }}
              >
                <span
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[var(--radius-btn)]"
                  style={{ background: "var(--surface-2)", color: "var(--soft)" }}
                >
                  <Megaphone className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setOpenDetailId(openDetailId === b.id ? null : b.id)}>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-[var(--ink)]">{b.subject}</span>
                    <span className="flex-shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--soft)]">
                      {b.channel}
                    </span>
                    {!b.active && (
                      <span className="flex-shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--soft)]">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[13px] text-[var(--muted)]">{segmentLabel(b)}</div>
                  <div className="mt-1 flex gap-3 text-[12px] text-[var(--soft)]">
                    <span>{b.sentCount} sent</span>
                    <span>{b.failedCount} failed</span>
                    <span>{b.noConsentCount} no consent</span>
                  </div>
                </div>

                <button
                  onClick={() => toggle(b)}
                  className="flex-shrink-0 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg)]"
                >
                  {b.active ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => setConfirmDelete(b)}
                  aria-label={`Delete ${b.subject}`}
                  className="flex-shrink-0 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {openDetailId === b.id && <BroadcastDetailPanel id={b.id} onClose={() => setOpenDetailId(null)} />}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.subject}"?`}
        description="This removes its send history too. Pause it instead if you might want it again."
        confirmLabel="Delete"
        confirmColor="var(--err)"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete.id);
            toast.success("Broadcast deleted.");
          } catch (err) {
            toast.error((err as Error).message || "Couldn't delete that — try again.");
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}
```

Note: `Check` is imported but unused in the snippet above — remove it from the `lucide-react` import line (keep only `Plus, Trash2, X, Megaphone`) since this component has no inline-edit-and-save affordance (content edits are out of scope for this task's UI; `updateBroadcast`'s subject/body path is exercised by the backend test suite and remains available for a future UI pass).

- [ ] **Step 4: Add the nav entry in `AdminLayout.tsx`**

Add `Megaphone` to the `lucide-react` import list at the top of `frontend/src/components/admin/AdminLayout.tsx` (alongside `Zap`, `Gift`, etc.).

In the `BASE_MANAGEMENT_NAV` array, add a new entry right after the `campaigns` line:

```ts
  { to: "campaigns", label: "Campaigns", Icon: Zap },
  { to: "broadcasts", label: "Broadcasts", Icon: Megaphone },
```

- [ ] **Step 5: Register the route in `App.tsx`**

Add the lazy import near the other admin route imports:

```ts
const AdminBroadcasts = lazy(() => import('./routes/admin/AdminBroadcasts'));
```

Add the route inside the same `<Route>` block that holds `campaigns`/`rewards`:

```tsx
              <Route path="broadcasts" element={<AdminBroadcasts />} />
```

- [ ] **Step 6: Run the frontend typecheck**

Run: `cd frontend && npm run lint`
Expected: no errors (in particular, confirm the `Check` import was actually removed per Step 3's note — an unused import fails `tsc --noEmit` under this project's strict settings the same way it would for any other file).

- [ ] **Step 7: Manual verification in the browser**

Start the backend (`MONGODB_URI="" node server.js` from `backend/`) and the frontend (`npm run dev` from `frontend/`, or a production build + `vite preview` if HMR isn't needed) in the worktree, matching the manual-server-start pattern used for Phase 3b's browser verification (`preview_start({name:...})` launches from the harness's main checkout, not this worktree, so a raw `preview_start({url:...})` against the manually-started server is required).

Sign in as `durbarmarg@coffesarowar.com` / `password` and navigate to the new Broadcasts nav item.

The seeded demo outlets (`coffesarowar/durbarmarg` and its siblings) were created by `demoSeed.js` before this feature existed, so this outlet's list starts empty — the prebuilt-seeding behavior only applies to outlets created after Task 3 lands, and is already covered by Task 3's automated test against a freshly created outlet. For this manual pass: create a broadcast via the "New broadcast" form, confirm it appears in the list with 0/0/0 counts, click it to open the (empty) recipient detail panel, toggle Pause/Resume, and delete it via the confirm dialog.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useBroadcasts.ts frontend/src/routes/admin/AdminBroadcasts.tsx frontend/src/components/admin/AdminLayout.tsx frontend/src/App.tsx
git commit -m "feat: add admin Broadcasts page"
```

---

## After all tasks

Run the full backend regression suite once more (`cd backend && MONGODB_URI="" npm test`) and the frontend typecheck (`cd frontend && npm run lint`), then invoke `superpowers:finishing-a-development-branch`.

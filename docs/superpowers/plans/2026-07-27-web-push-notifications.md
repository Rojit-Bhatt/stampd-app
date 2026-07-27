# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Web Push as a second, independent delivery channel for the three existing triggers (milestone, birthday, inactivity) — subscription storage, VAPID keys, a restructured `sendTrigger` that fires email and push independently, and the customer-facing subscribe/unsubscribe flow.

**Architecture:** A new `PushSubscription` model (one row per browser/device), VAPID keys resolved once at config load (env vars, ephemeral dev fallback), `messagingService.js`'s `sendTrigger` restructured so email and push are two independent, separately-gated sends rather than one consent check gating everything. The PWA's service worker moves from `vite-plugin-pwa`'s `generateSW` mode to `injectManifest` mode so a custom `push` event listener can be added.

**Tech Stack:** `web-push` (new backend dependency), `workbox-precaching` (new frontend dependency, used inside the custom service worker), existing Node/Express + mock-Mongoose backend, React 19 + TS frontend.

## Global Constraints

- Mock DB query support is **top-level equality, `$or`, `$lte`, `$gte` only** — no other operators.
- **No `findById`** — use `findOne({ _id })`.
- `bootServer` spawns the test server as a **separate OS process** — anything a test needs with no real HTTP endpoint (creating a subscription row directly, stubbing `web-push`'s send) goes through a `/__test__/*` test-hook, not a direct `require()`.
- Every outbound send (`sendEmail`, and now push) is **fire-and-forget** — a slow or failed send must never block the response it's attached to.
- **Real browser push delivery cannot be tested in this harness.** Tests cover subscription CRUD and `sendTrigger`'s branching logic against a stubbed `web-push`, never actual delivery.
- New backend test suites must be **added to `backend/package.json`'s `test` chain** or they never run.
- Business logic lives in `services/`; controllers stay thin.
- No code comments except where a genuinely non-obvious constraint or invariant needs explaining.

---

## Task 1: Push send path — model, VAPID config, `sendTrigger` restructure

**Files:**
- Create: `backend/models/PushSubscription.js`
- Modify: `backend/config/platform.js`
- Modify: `backend/services/messagingService.js`
- Modify: `backend/routes/testHookRoutes.js`
- Create: `backend/tests/push-notifications.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `PushSubscription` model `{customerAccountId, endpoint, keys: {p256dh, auth}, createdAt}`. `config/platform.js` exports `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. `messagingService.js`'s `sendTrigger` now sends to email and push independently — `{sent: true}` if either fires, `{sent: false, reason: "no_consent"}` only if neither channel is consented.

- [ ] **Step 1: Add the `web-push` dependency**

Run: `cd backend && npm install web-push`

- [ ] **Step 2: Create `backend/models/PushSubscription.js`**

```js
const mongoose = require("mongoose");

// One row per browser/device — a customer can have several. Endpoint is
// unique: the same device re-subscribing (e.g. after clearing storage)
// updates its existing row instead of accumulating duplicates.
const PushSubscriptionSchema = new mongoose.Schema({
  customerAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomerAccount", required: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now }
});

PushSubscriptionSchema.index({ customerAccountId: 1 });
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);
```

- [ ] **Step 3: Add VAPID keys to `backend/config/platform.js`**

Add near the top of the file, after the existing requires (there are none currently, so this is the first):

```js
const webpush = require("web-push");
```

Add before `module.exports` (after the existing `isReservedSlug` function):

```js
// If real VAPID keys aren't configured, generate an ephemeral pair at
// startup — safe for dev/test (no real browser ever subscribes against it
// across restarts), and forces a deliberate real pair in production the
// same way JWT_SECRET's own dev fallback does.
let vapidPublicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.PUSH_VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  const generated = webpush.generateVAPIDKeys();
  vapidPublicKey = generated.publicKey;
  vapidPrivateKey = generated.privateKey;
  console.log("[dev] PUSH_VAPID keys not set — generated an ephemeral dev-only pair.");
}

const VAPID_SUBJECT = process.env.PUSH_VAPID_SUBJECT || "mailto:support@stampd.co";
const VAPID_PUBLIC_KEY = vapidPublicKey;
const VAPID_PRIVATE_KEY = vapidPrivateKey;
```

Add `VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,` to the `module.exports` object (alongside the existing `TIER_LABELS` etc.).

- [ ] **Step 4: Write the failing test**

Create `backend/tests/push-notifications.js`:

```js
/**
 * Web Push notifications suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms sendTrigger's independent email/push
 * branching, and the 410-prune behavior, using test-hooks to create
 * subscription rows and stub web-push's send call directly — real browser
 * push delivery is not testable in this harness. Grows in Task 2 to cover
 * the subscribe/unsubscribe endpoints.
 *
 * Run directly: `node tests/push-notifications.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function getOrgId(baseUrl, companySlug, outletSlug) {
  const resp = await fetch(`${baseUrl}/__test__/get-organization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companySlug, outletSlug }),
  });
  const body = await resp.json();
  return body.organizationId;
}

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
  return {
    email,
    globalToken,
    tenantToken: entered.body.token,
    userId: entered.body.user.id,
    accountId: reg.body.account.id,
  };
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5033 });
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
    const orgId = await getOrgId(baseUrl, COMPANY, SLUG);

    // Push-only consent: no email, still sends via push alone.
    const pushOnlyCustomer = await provisionTenantCustomer(api, "PushOnly", "20");
    await fetch(`${baseUrl}/__test__/create-push-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerAccountId: pushOnlyCustomer.accountId,
        endpoint: `https://push.example/${Date.now()}`,
        keys: { p256dh: "p", auth: "a" },
        grantConsent: true,
      }),
    });

    const sendResp1 = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: pushOnlyCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("push-only consent still sends (email skipped, push used)", sendResp1.body.sent === true);

    // Neither channel consented: refuses to send.
    const noConsentCustomer = await provisionTenantCustomer(api, "PushNoConsent", "21");
    const sendResp2 = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: noConsentCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("no consent on either channel refuses to send", sendResp2.body.sent === false && sendResp2.body.reason === "no_consent");

    // Email-only consent still works after the restructure (regression
    // against Phase 3a's original behavior).
    const emailOnlyCustomer = await provisionTenantCustomer(api, "PushEmailOnly", "24");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: emailOnlyCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const sendResp3 = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: emailOnlyCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("email-only consent still sends (unaffected by the push restructure)", sendResp3.body.sent === true);

    // A dead subscription (web-push returns 410) gets pruned.
    await fetch(`${baseUrl}/__test__/stub-webpush-behavior`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behavior: "gone" }),
    });

    const pruneCustomer = await provisionTenantCustomer(api, "PushPrune", "22");
    await fetch(`${baseUrl}/__test__/create-push-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerAccountId: pruneCustomer.accountId,
        endpoint: `https://push.example/prune-${Date.now()}`,
        keys: { p256dh: "p", auth: "a" },
        grantConsent: true,
      }),
    });

    await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: pruneCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    });

    // The push send is fire-and-forget (matching this codebase's email
    // convention), so the prune happens asynchronously — a short wait lets
    // it land before asserting, same tradeoff any fire-and-forget send
    // makes for testability.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const subsCountResp = await fetch(`${baseUrl}/__test__/push-subscription-count?customerAccountId=${pruneCustomer.accountId}`).then((r) => r.json());
    check("a 410 response prunes the dead subscription", subsCountResp.count === 0);
  } finally {
    stop();
  }

  if (failures) { console.error(`push-notifications: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("push-notifications: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 5: Wire the new suite into `backend/package.json`**

Append ` && node tests/push-notifications.js` to the end of the `"test"` script string (currently ends with `... && node tests/messaging-triggers.js`).

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/push-notifications.js`
Expected: FAIL on every check — `/__test__/create-push-subscription`, `/__test__/stub-webpush-behavior`, and `/__test__/push-subscription-count` don't exist yet (404s), and `sendTrigger` hasn't been restructured yet so push-only consent still returns `{sent: false}`.

- [ ] **Step 7: Restructure `sendTrigger` in `backend/services/messagingService.js`**

Add these requires to the top of the file:

```js
const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");
const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = require("../config/platform");

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
```

Add a small helper right before `sendTrigger`:

```js
const stripHtml = (html) => html.replace(/<[^>]+>/g, "");

// Never rejects — every failure path (dead subscription or anything else)
// is handled internally, so callers can fire this without a .catch().
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

Replace the existing `sendTrigger` function body:

```js
const sendTrigger = async (type, { organization, customer, membership, context = {} }) => {
  const { subject, html } = renderTemplate(type, { organization, customer, context });
  let sent = false;

  if (customer.marketingConsent?.email?.granted) {
    sendEmail({ to: customer.email, subject, html })
      .catch((err) => console.error(`Failed to send ${type} trigger to ${customer.email}:`, err.message));
    sent = true;
  }

  if (customer.marketingConsent?.push?.granted) {
    const subscriptions = await PushSubscription.find({ customerAccountId: customer._id });
    for (const sub of subscriptions) {
      sendPushToSubscription(sub, { title: subject, body: stripHtml(html) });
    }
    if (subscriptions.length > 0) sent = true;
  }

  if (!sent) {
    return { sent: false, reason: "no_consent" };
  }

  await MessageLog.create({ organizationId: organization._id, userId: membership._id, triggerType: type });
  return { sent: true };
};
```

Add `sendPushToSubscription` to `module.exports` (alongside `sendTrigger`, `checkMilestoneTrigger`, `runDailyTriggers`) — not required by any other file yet, but exported for consistency and possible future direct use.

- [ ] **Step 8: Add the three new test-hook endpoints**

In `backend/routes/testHookRoutes.js`, add near the other model-touching hooks:

```js
router.post("/create-push-subscription", async (req, res, next) => {
  try {
    const { customerAccountId, endpoint, keys, grantConsent } = req.body;
    const PushSubscription = require("../models/PushSubscription");

    await PushSubscription.create({ customerAccountId, endpoint, keys });

    if (grantConsent) {
      const account = await CustomerAccount.findOne({ _id: customerAccountId });
      account.marketingConsent.push = { granted: true, updatedAt: new Date() };
      await account.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get("/push-subscription-count", async (req, res, next) => {
  try {
    const PushSubscription = require("../models/PushSubscription");
    const count = await PushSubscription.countDocuments({ customerAccountId: req.query.customerAccountId });
    res.status(200).json({ success: true, count });
  } catch (error) {
    next(error);
  }
});

router.post("/stub-webpush-behavior", async (req, res, next) => {
  try {
    const webpush = require("web-push");
    const { behavior } = req.body;
    webpush.sendNotification = async () => {
      if (behavior === "gone") {
        const err = new Error("Subscription gone");
        err.statusCode = 410;
        throw err;
      }
      return { statusCode: 201 };
    };
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});
```

(`CustomerAccount` is already required at the top of this file — reuse it, don't re-require inside the handler.)

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/push-notifications.js`
Expected: all checks pass.

- [ ] **Step 10: Run regression suites**

Run: `cd backend && MONGODB_URI="" node tests/messaging-triggers.js && MONGODB_URI="" node tests/points-earn.js`
Expected: both pass unchanged — confirms the `sendTrigger` restructure didn't break Phase 3a's email-only behavior or the milestone real-time hook.

- [ ] **Step 11: Commit**

```bash
git add backend/models/PushSubscription.js backend/config/platform.js backend/services/messagingService.js backend/routes/testHookRoutes.js backend/tests/push-notifications.js backend/package.json
git commit -m "feat: add push send path with independent email/push consent"
```

---

## Task 2: Subscribe/unsubscribe endpoints

**Files:**
- Modify: `backend/services/customerAccountService.js`
- Modify: `backend/controllers/customerAccountController.js`
- Modify: `backend/routes/customerAccountRoutes.js`
- Modify: `backend/tests/push-notifications.js`

**Interfaces:**
- Produces: `POST /api/customer-auth/push-subscription` (`verifyGlobalSession`, body `{endpoint, keys}`) — upserts a `PushSubscription` row and grants `marketingConsent.push`. `DELETE /api/customer-auth/push-subscription` (`verifyGlobalSession`, body `{endpoint}`) — removes one row, and revokes `marketingConsent.push` only if it was the customer's last subscription.

- [ ] **Step 1: Write the failing test — extend `backend/tests/push-notifications.js`**

Add after the existing checks, still inside the `try` block:

```js
    const subsCustomer = await provisionTenantCustomer(api, "SubsFlow", "23");

    const saveResp = await api("/api/customer-auth/push-subscription", {
      method: "POST",
      token: subsCustomer.globalToken,
      slug: null,
      body: { endpoint: "https://push.example/subs-1", keys: { p256dh: "p1", auth: "a1" } },
    });
    check("POST push-subscription grants push consent", saveResp.body.account?.marketingConsent?.push?.granted === true);

    const saveResp2 = await api("/api/customer-auth/push-subscription", {
      method: "POST",
      token: subsCustomer.globalToken,
      slug: null,
      body: { endpoint: "https://push.example/subs-1", keys: { p256dh: "p1-updated", auth: "a1" } },
    });
    check("POSTing the same endpoint again succeeds (updates, not a duplicate)", saveResp2.status === 200);

    const countAfterUpsert = await fetch(`${baseUrl}/__test__/push-subscription-count?customerAccountId=${subsCustomer.accountId}`).then((r) => r.json());
    check("upserting the same endpoint results in exactly one row", countAfterUpsert.count === 1);

    const deleteResp = await api("/api/customer-auth/push-subscription", {
      method: "DELETE",
      token: subsCustomer.globalToken,
      slug: null,
      body: { endpoint: "https://push.example/subs-1" },
    });
    check("DELETE revokes push consent when it was the last device", deleteResp.body.account?.marketingConsent?.push?.granted === false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && MONGODB_URI="" node tests/push-notifications.js`
Expected: FAIL on all four new checks — `/api/customer-auth/push-subscription` doesn't exist yet (404).

- [ ] **Step 3: Add `savePushSubscription`/`removePushSubscription` to `backend/services/customerAccountService.js`**

Add this require near the top of the file:

```js
const PushSubscription = require("../models/PushSubscription");
```

Add, alongside `updatePreferences`:

```js
const savePushSubscription = async ({ customerAccountId, endpoint, keys }) => {
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { customerAccountId, endpoint, keys },
    { upsert: true, new: true }
  );

  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);
  account.marketingConsent.push = { granted: true, updatedAt: new Date() };
  await account.save();

  return formatAccountPayload(account);
};

const removePushSubscription = async ({ customerAccountId, endpoint }) => {
  await PushSubscription.deleteOne({ endpoint, customerAccountId });

  const remaining = await PushSubscription.countDocuments({ customerAccountId });
  const account = await CustomerAccount.findOne({ _id: customerAccountId });
  if (!account) throw createHttpError("Account not found.", 404);

  if (remaining === 0) {
    account.marketingConsent.push = { granted: false, updatedAt: new Date() };
    await account.save();
  }

  return formatAccountPayload(account);
};
```

Add `savePushSubscription, removePushSubscription,` to this file's `module.exports`.

- [ ] **Step 4: Add the controllers**

In `backend/controllers/customerAccountController.js`, add `savePushSubscription, removePushSubscription` to the existing destructured import from `../services/customerAccountService`.

Add:

```js
const savePushSubscriptionController = async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;
    const result = await savePushSubscription({ customerAccountId: req.customerAccount.id, endpoint, keys });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const removePushSubscriptionController = async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    const result = await removePushSubscription({ customerAccountId: req.customerAccount.id, endpoint });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

Add `savePushSubscription: savePushSubscriptionController, removePushSubscription: removePushSubscriptionController,` to this file's `module.exports`.

- [ ] **Step 5: Wire the routes**

In `backend/routes/customerAccountRoutes.js`, add `savePushSubscription, removePushSubscription` to the existing destructured import from `../controllers/customerAccountController`.

Add, alongside the existing `/preferences` route:

```js
router.post("/push-subscription", verifyGlobalSession, savePushSubscription);
router.delete("/push-subscription", verifyGlobalSession, removePushSubscription);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && MONGODB_URI="" node tests/push-notifications.js`
Expected: all checks pass.

- [ ] **Step 7: Run regression suites**

Run: `cd backend && MONGODB_URI="" node tests/customer-profile.js && MONGODB_URI="" node tests/global-customer-identity.js`
Expected: both pass unchanged.

- [ ] **Step 8: Commit**

```bash
git add backend/services/customerAccountService.js backend/controllers/customerAccountController.js backend/routes/customerAccountRoutes.js backend/tests/push-notifications.js
git commit -m "feat: add push subscription save/remove endpoints"
```

---

## Task 3: Service worker — `generateSW` → `injectManifest`

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/sw.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: a custom-source service worker (`frontend/src/sw.ts`) handling `push` and `notificationclick`, built by `vite-plugin-pwa`'s `injectManifest` strategy. No backend interface — this task is frontend build tooling only.

- [ ] **Step 1: Add the `workbox-precaching` dependency**

Run: `cd frontend && npm install workbox-precaching`

- [ ] **Step 2: Create `frontend/src/sw.ts`**

```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Stampd", { body: data.body ?? "" })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
```

- [ ] **Step 3: Switch `frontend/vite.config.ts`'s `VitePWA` config to `injectManifest` mode**

Modify the `VitePWA({...})` call — add `strategies: "injectManifest"`, `srcDir: "src"`, `filename: "sw.ts"` as new top-level keys inside the existing config object (the `manifest: {...}` block and `includeAssets` stay exactly as they are):

```ts
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Stampd",
        short_name: "Stampd",
        description: "Your points at every place you visit — scan, earn, redeem.",
        theme_color: "#14201C",
        background_color: "#F7F8F7",
        display: "standalone",
        start_url: "/explore",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
```

- [ ] **Step 4: Verify the build succeeds and the service worker still registers**

This is frontend build tooling — not something the backend test harness can verify, and not something to assert confidently without checking. Run:

Run: `npm run build` from repo root
Expected: build succeeds, and the output includes a built `sw.js` (or equivalent) in `frontend/dist` alongside the precache manifest.

Then run the dev server and confirm registration actually happens: `npm run dev` from repo root, open the app in a browser, open DevTools → Application → Service Workers, and confirm a service worker is registered and activated (the plugin's default `injectRegister: "auto"` setting should keep auto-injecting the registration script the same way it did in `generateSW` mode — confirm this holds after the strategy switch rather than assuming it). If no service worker registers, add an explicit registration call (`import { registerSW } from "virtual:pwa-register"; registerSW({ immediate: true });` in `frontend/src/main.tsx`) and re-verify.

- [ ] **Step 5: Commit**

```bash
git add frontend/vite.config.ts frontend/src/sw.ts frontend/package.json
git commit -m "feat: switch service worker to injectManifest mode for push support"
```

---

## Task 4: Customer push opt-in UI

**Files:**
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx`
- Modify: `frontend/.env` or equivalent build-time env config (documented, not committed if it contains a real key)

**Interfaces:**
- Consumes: `POST`/`DELETE /api/customer-auth/push-subscription` (Task 2); `VITE_VAPID_PUBLIC_KEY` build-time env var, same pattern as `AuthView.tsx`'s existing `VITE_GOOGLE_CLIENT_ID`.

- [ ] **Step 1: Add the "Push notifications" card to `CustomerProfilePanel.tsx`**

Read the current file first to confirm the exact line numbers around the existing "Email updates" card (per this plan's reconnaissance, currently lines ~193-203) — the new card goes immediately after it, before the "Birthday" card.

Add near the top of the file, alongside other module-scope constants:

```tsx
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
};
```

Add state, alongside `emailOptIn`/`savingEmailOptIn`:

```tsx
const [pushEnabled, setPushEnabled] = useState(false);
const [savingPush, setSavingPush] = useState(false);
```

Add an effect to read the browser's actual subscription state on mount (the browser, not the server, is the source of truth for "is THIS device subscribed"):

```tsx
useEffect(() => {
  navigator.serviceWorker?.ready
    .then((reg) => reg.pushManager.getSubscription())
    .then((sub) => setPushEnabled(!!sub))
    .catch(() => setPushEnabled(false));
}, []);
```

Add the handler, alongside `saveEmailOptIn`:

```tsx
const savePushOptIn = async (next: boolean) => {
  setSavingPush(true);
  try {
    if (next) {
      if (!VAPID_PUBLIC_KEY) throw new Error("Push isn't set up for this app yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission wasn't granted.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = subscription.toJSON();
      await apiRequest("/api/customer-auth/push-subscription", {
        method: "POST",
        role: "customer-global",
        body: { endpoint: json.endpoint, keys: json.keys },
      });
      setPushEnabled(true);
      toast.success("Push notifications on!");
    } else {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await apiRequest("/api/customer-auth/push-subscription", {
          method: "DELETE",
          role: "customer-global",
          body: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
      toast.success("Push notifications off.");
    }
  } catch (err) {
    toast.error((err as Error).message || "Couldn't update that — try again.");
  } finally {
    setSavingPush(false);
  }
};
```

Add the card, immediately after the existing "Email updates" `<Card>` closes and before the "Birthday" `<Card>` opens:

```tsx
<Card title="Push notifications">
  <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
    <input
      type="checkbox"
      checked={pushEnabled}
      disabled={savingPush}
      onChange={(e) => savePushOptIn(e.target.checked)}
    />
    Send me updates as push notifications
  </label>
</Card>
```

- [ ] **Step 2: Set the `VITE_VAPID_PUBLIC_KEY` build-time env var**

Add `VITE_VAPID_PUBLIC_KEY=<the public key printed by the backend's dev-fallback log, or the real one if `PUSH_VAPID_PUBLIC_KEY` is set>` to `frontend/.env` (or `.env.local`, matching wherever `VITE_GOOGLE_CLIENT_ID` already lives in this repo — check that file first). This is a public key, safe to expose to the frontend build, same trust level as the Google client ID already there.

- [ ] **Step 3: Run `npm run lint`**

Run: `npm run lint` from repo root.
Expected: no new TypeScript errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev` from repo root (backend with `MONGODB_URI=""`), sign in as a customer, open profile settings, toggle "Push notifications" on — confirm the browser's permission prompt appears and, once granted, the checkbox stays checked after a page reload (reading the real `pushManager.getSubscription()` state). This cannot be verified any other way — there is no backend-test substitute for confirming a real browser subscription flow works.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/customer/CustomerProfilePanel.tsx frontend/.env
git commit -m "feat: add push notification opt-in to customer profile settings"
```

(If `frontend/.env` is gitignored in this repo — check first — commit only the code changes and note the env var in the PR/commit description instead.)

---

## Explicitly out of scope for this plan

- SMS/WhatsApp (later phases, pending budget).
- Any campaign/`Broadcast` builder or per-channel-per-trigger selection (Phase 4).
- Rich push notification actions, images, or custom icons beyond title+body.
- iOS Safari-specific push UX/detection — the existing PWA install-to-homescreen requirement for iOS push is a genuine platform limitation, not addressed here.

# Web Push notifications (Phase 3b)

**Date:** 2026-07-27
**Status:** Approved design, ready for implementation plan
**Scope:** Phase 3b of `docs/superpowers/specs/2026-07-22-loyalty-growth-suite-roadmap-design.md` — the push half of Phase 3's messaging foundation, split out from Phase 3a (email, shipped) because it needs a real PWA architecture change rather than just a new channel adapter. Adds Web Push as a second delivery channel for the three existing triggers (milestone, birthday, inactivity) — no new trigger types, no campaign builder, no SMS/WhatsApp.

## Context

Phase 3a shipped consent (all four channels scoped on `CustomerAccount.marketingConsent`, only `email` wired), a `messagingService.js` with `sendTrigger`/`checkMilestoneTrigger`/`runDailyTriggers`, and the first cron job in this codebase. Zero push infrastructure exists yet: no VAPID keys, no `web-push` dependency, no subscription storage, and the PWA's service worker is built in `vite-plugin-pwa`'s `generateSW` mode, which auto-generates the whole file and gives no way to add a custom `push` event listener. Wiring push in means switching to `injectManifest` mode and writing a real service worker source file for the first time.

## Decisions locked during brainstorming

1. **Every consented channel fires independently.** A trigger sends to email if `marketingConsent.email.granted`, and separately to push if `marketingConsent.push.granted` — both, either, or neither, never one replacing the other. No per-trigger channel picker (that's Phase 4 campaign-builder territory).
2. **Push opt-in lives in `CustomerProfilePanel.tsx`**, right next to the existing "Email updates" toggle from Phase 3a. Turning it on is what grants consent — there's no separate confirmation step, since requesting OS/browser notification permission and successfully subscribing already is the explicit, informed action NTA-style consent requires.
3. **Service worker: `generateSW` → `injectManifest`.** A new `frontend/src/sw.ts` becomes the real source of truth for the service worker; `vite-plugin-pwa` injects the build's precache manifest into it via `self.__WB_MANIFEST`. Existing behavior (precache the static shell only, never cache `/api` responses) is preserved — this is additive (add `push`/`notificationclick` handlers), not a redesign of what's cached.
4. **VAPID keys via env vars, with a dev fallback matching `JWT_SECRET`'s existing pattern**: `PUSH_VAPID_PUBLIC_KEY`/`PUSH_VAPID_PRIVATE_KEY`. If unset, the server generates an ephemeral pair at boot (logged once, not persisted) — safe for this test harness (no real browser ever subscribes against a dev keypair across restarts) and forces a real, deliberate pair in production the same way `JWT_SECRET` does.
5. **Subscriptions are their own model, `PushSubscription`** — not an array field on `CustomerAccount`. One row per browser/device (`{customerAccountId, endpoint, keys: {p256dh, auth}, createdAt}`), matching this codebase's preference for small dedicated models (like `MessageLog`) over an unboundedly-growing embedded array.
6. **Dead subscriptions self-prune.** A `410 Gone`/`404` response from a push send (the browser telling us that endpoint is dead) deletes that `PushSubscription` row immediately — standard push hygiene, keeps the table from accumulating rows nobody can send to.
7. **Testing is bounded by what's actually testable without a real browser**: subscription save/delete round-trips through real endpoints, and `sendTrigger`'s push branch against a stubbed `webpush.sendNotification` (mirroring how `emailService`'s dev stub already lets email triggers be tested without a real provider). Real end-to-end push delivery is not testable in this harness and isn't attempted.

## Explicitly out of scope

- SMS/WhatsApp (Phases 5/6, pending budget — unaffected by this phase).
- Any campaign/`Broadcast` builder or per-channel-per-trigger selection UI (Phase 4).
- Rich push actions/images — a title + body notification only, matching the plain-`<p>`-tag minimalism of the existing email templates.
- iOS Safari's partial/limited Web Push support beyond "it works when the PWA is installed to homescreen on 16.4+" — no iOS-specific fallback or detection UI, consistent with this being a genuine platform limitation, not a bug to work around.

## Data model

### New model: `backend/models/PushSubscription.js`

```js
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
```

`endpoint` is unique — the same browser/device re-subscribing (e.g. after clearing storage) updates its existing row rather than accumulating duplicates.

No changes to `CustomerAccount.marketingConsent.push` — the field already exists from Phase 1.

## Backend

### `backend/config/platform.js` — VAPID keys

New exported constants, resolved once at module load: read `PUSH_VAPID_PUBLIC_KEY`/`PUSH_VAPID_PRIVATE_KEY` from env; if either is missing, call `web-push`'s `generateVAPIDKeys()` and log a clear one-time warning that this is a dev-only ephemeral pair.

### `backend/services/messagingService.js` — push branch

Phase 3a's `sendTrigger` currently short-circuits entirely if email consent is missing (`if (!customer.marketingConsent?.email?.granted) return {sent: false, reason: "no_consent"};`) — that single early-return has to go, since a push-only customer would otherwise never get anything. It's replaced by two independent per-channel checks, each firing (or not) on its own, with the function returning `{sent: true}` if either one actually sent and `{sent: false, reason: "no_consent"}` only if neither channel is consented:

```js
if (customer.marketingConsent?.push?.granted) {
  const subscriptions = await PushSubscription.find({ customerAccountId: customer._id });
  for (const sub of subscriptions) {
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify({ title: subject, body: bodyText })
    ).catch(async (err) => {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await PushSubscription.deleteOne({ _id: sub._id });
      } else {
        console.error(`Failed to push ${type} trigger to ${customer.email}:`, err.message);
      }
    });
  }
}
```

`bodyText` is a plain-text derivation of each template's existing HTML body (the same copy, stripped of markup) — no separate push-specific copy to maintain. `sendTrigger` returns `{sent: true}` if EITHER channel actually sent (matches the "every consented channel fires independently" decision — a customer with only push consent still counts as a successful send even though email was skipped).

### New routes: subscription save/remove

- `POST /api/customer-auth/push-subscription` (`verifyGlobalSession`) — body `{endpoint, keys}`, upserts a `PushSubscription` row for `req.customerAccount.id`, sets `marketingConsent.push = {granted: true, updatedAt: now}` on the account.
- `DELETE /api/customer-auth/push-subscription` (`verifyGlobalSession`) — body `{endpoint}`, deletes that one row. Does NOT flip `marketingConsent.push.granted` to false by itself if other devices still have live subscriptions — consent reflects "this customer wants push somewhere," not "this specific device is subscribed." If it was their last subscription, the endpoint also sets `granted: false`.

## Frontend

### `frontend/vite.config.ts` + `frontend/src/sw.ts` (new)

Switch `VitePWA({...})` to `strategies: "injectManifest"`, `srcDir: "src"`, `filename: "sw.ts"`. `sw.ts` calls `precacheAndRoute(self.__WB_MANIFEST)` (same precache-only behavior as today), plus:

```ts
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(self.registration.showNotification(data.title ?? "Stampd", { body: data.body ?? "" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
```

### `CustomerProfilePanel.tsx`

New "Push notifications" toggle, same card pattern as "Email updates": turning it on calls `Notification.requestPermission()` → if granted, `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: <public key>})` → POSTs the resulting subscription to the new endpoint. The VAPID public key is fetched from a small existing-pattern public config endpoint (or embedded via a build-time env var, whichever the plan's file-structure review finds cleaner — both are viable, neither needs a new architectural decision). Turning it off calls `subscription.unsubscribe()` locally, then the DELETE endpoint.

## Testing

New `backend/tests/push-notifications.js` (added to `package.json`'s test chain):
- `POST /api/customer-auth/push-subscription` creates a row and sets `marketingConsent.push.granted`; a second POST with the same `endpoint` updates rather than duplicates.
- `DELETE` removes the row; when it was the only subscription, `marketingConsent.push.granted` flips back to `false`.
- `sendTrigger`'s push branch, driven through a test-hook that stubs `webpush.sendNotification` (via dependency injection or a swappable module reference — the plan decides the exact mechanism) to confirm it's called with the right payload shape, and that a stubbed `410` response deletes the subscription row.
- Consent independence: a customer with only push consent (no email) still gets `{sent: true}` from a trigger; a customer with neither gets `{sent: false}`.

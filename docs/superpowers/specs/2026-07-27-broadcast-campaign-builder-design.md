# Phase 4: Broadcast campaign builder

**Date:** 2026-07-27
**Status:** Approved design, ready for implementation plan
**Scope:** Phase 4 of the loyalty growth suite roadmap (`docs/superpowers/specs/2026-07-22-loyalty-growth-suite-roadmap-design.md`). Builds an admin-authored, segment-targeted messaging rule — called `Broadcast`, distinct from the existing bill-multiplier `Campaign` model (roadmap decision 4) — on top of Phase 1 (tiers) and Phase 3 (email/push channel adapters, consent model).

## Context

The roadmap's Phase 4 line originally described a manual "segmentation UI, custom message authoring, manual send" builder. During this phase's brainstorm, the requirement changed: the admin should not pick a send time or click "send" per blast. Instead, a `Broadcast` is an **ongoing rule** — the admin defines an audience segment and a message once, and the system sends it automatically, exactly once per matching customer, the moment that customer is observed to match. This generalizes the existing milestone/birthday/inactivity triggers (Phase 3a) — same fire-and-forget, once-only philosophy — but with admin-authored content and admin-chosen segments instead of three fixed canned templates.

## Decisions

1. **`Broadcast` is a new model, not the existing `Campaign`.** Confirmed per roadmap decision 4 — `Campaign` already means bill-multiplier in this codebase.
2. **A broadcast is an ongoing rule, not a one-off blast.** No `scheduledAt`, no "send now" button, no draft state. Admin picks channel + segment + content and the broadcast is live (or paused) from creation.
3. **Evaluation happens post-earn only, reusing the existing hook.** `pointsService.claimPoints` already fires `checkMilestoneTrigger(...)` fire-and-forget after the atomic earn transaction resolves (`backend/services/pointsService.js:408`). A new `evaluateBroadcasts(...)` call goes right alongside it, same fire-and-forget shape. **No new cron job** — a customer's tier can only change as a result of an earn (it's a trailing-12-month window recomputed from `PointsTransaction` rows), so post-earn is the only point a "tier reached" event can newly become true. This keeps `runDailyTriggers` untouched.
4. **Segment types for v1: `"tier"` (a specific label) or `"all"` (every customer).** `"tier"` matches when `tierService.resolveTier(...)` returns exactly the configured label. `"all"` always matches — meaning an "all customers" broadcast reaches every existing customer once, spread across their next visits, not instantly; this is accepted (matches the "resolves live, no backfill sweep" philosophy already used for tiers and campaigns).
5. **One send per (broadcast, customer), ever — enforced by a unique log row, not a separate flag.** A `BroadcastLog` row is the idempotency guard itself: if one exists for `{broadcastId, userId}`, evaluation skips immediately, before even checking segment match. A row is only written once a customer actually matches and the send is attempted — a non-matching customer is simply re-checked on their next earn, forever, until they match or the broadcast is paused/deleted.
6. **Consent is checked per channel exactly like existing triggers**, no retries. If a matching customer hasn't granted consent for the broadcast's channel at match time, that's logged as `"no_consent"` and never re-attempted later even if they grant consent afterward — this mirrors `sendTrigger`'s existing `{sent: false, reason: "no_consent"}` behavior, which also never retries. Documented as an accepted limitation, not a bug.
7. **One broadcast = one channel** (email or push for v1 — SMS/WhatsApp arrive in Phases 5/6 per the roadmap). Consistent with roadmap decision 6, "no multi-channel fan-out from a single campaign."
8. **Content is plain subject + body text**, no rich HTML editor, no personalization tokens beyond what the existing trigger templates already interpolate server-side (customer name, organization name) — kept out of admin-authored text to avoid a token-syntax UI; the copy itself is what the admin writes, no `{name}`-style substitution in v1.
9. **A broadcast has an active/paused toggle.** Pausing stops all future evaluation (no new log rows written) without deleting history. Reactivating resumes evaluation from that point forward — it does not retroactively catch up on matches that would have fired while paused.
10. **Every new outlet gets 2 prebuilt broadcasts, seeded at outlet creation, freely editable/deletable.** Hooked into `companyService.createOutlet` (`backend/services/companyService.js:149`) — confirmed to be the single place any real `Organization` is ever created (both a company's first outlet and every subsequent one go through this same function; `createCompany` itself creates no outlet). `demoSeed.js`'s outlets get them too, automatically, by virtue of also calling `createOutlet`.
    - **Welcome** — `segmentType: "all"`, channel `email`, active. Fires once per customer, on their first evaluated earn after the outlet exists.
    - **Gold tier congrats** — `segmentType: "tier"`, `segmentTier: "Gold"`, channel `email`, active. Inert until the admin configures `tierThresholds` (matches existing behavior: `resolveTier` returns `null` with no thresholds configured, so it simply never matches until then — no error, no special-casing needed).

## Data model

### `Broadcast` (new model, `backend/models/Broadcast.js`)

```js
{
  organizationId: ObjectId,       // required, ref Organization
  channel: String,                 // enum ["email", "push"], required
  segmentType: String,             // enum ["tier", "all"], required
  segmentTier: String,              // enum TIER_LABELS, required iff segmentType === "tier", else null
  subject: String,                  // required, trimmed (email subject / push title)
  body: String,                     // required, trimmed (plain text; stripped of HTML for push same as existing sendTrigger)
  active: Boolean,                  // default true
  createdAt: Date                   // default now
}
```

Index: `{ organizationId: 1, active: 1 }` — evaluation loads only this outlet's active broadcasts per earn.

### `BroadcastLog` (new model, `backend/models/BroadcastLog.js`)

```js
{
  broadcastId: ObjectId,   // required, ref Broadcast
  organizationId: ObjectId, // required, ref Organization — denormalized for isolation-safe queries without a join
  userId: ObjectId,        // required, ref User (the tenant membership row, same convention as MessageLog)
  status: String,          // enum ["sent", "failed", "no_consent"], required
  sentAt: Date              // default now
}
```

Unique index: `{ broadcastId: 1, userId: 1 }` — this is the idempotency guard described in Decision 5, enforced at the data layer (mock DB does not enforce uniqueness, so `broadcastService` must still check-before-write in application code, matching the existing project-wide convention for mock-DB uniqueness).

## Backend

### `services/broadcastService.js` (new)

- `createBroadcast({organizationId, channel, segmentType, segmentTier, subject, body})` — validates channel/segmentType/segmentTier against the enums, creates the row (`active: true`).
- `listBroadcasts(organizationId)` — returns all broadcasts for the outlet plus aggregated counts (`sentCount`, `failedCount`, `noConsentCount`) computed from `BroadcastLog` (mock DB has no aggregation pipeline — computed in JS from `BroadcastLog.find({broadcastId})`, consistent with how `getTierDistributionStats` and similar reporting functions already work around the same limitation).
- `getBroadcastDetail(organizationId, broadcastId)` — the broadcast plus its full per-recipient log, each row enriched with the customer's name/email (join `User`/`CustomerAccount` in JS, same pattern `getCustomerDetailRows` already uses).
- `updateBroadcast(organizationId, broadcastId, {active, subject, body})` — toggle/edit. Segment/channel are NOT editable after creation (changing them mid-flight would make existing `BroadcastLog` rows mean something different retroactively) — to change segment or channel, delete and recreate.
- `deleteBroadcast(organizationId, broadcastId)` — deletes the broadcast and its log rows.
- `evaluateBroadcasts({organization, membership, earns})` — the evaluation entrypoint called from `pointsService.claimPoints`:
  1. `Broadcast.find({organizationId: organization._id, active: true})`.
  2. For each: check `BroadcastLog.findOne({broadcastId, userId: membership._id})` — skip if found.
  3. Determine match: `segmentType === "all"` → always; `segmentType === "tier"` → `resolveTier(organization._id, membership._id, {org: organization, earns}) === segmentTier` (reuses the same `{org, earns}` optimization Phase 1 already added to `resolveTier`, avoiding a redundant `PointsTransaction` query — `earns` is threaded through from `claimPoints`, which already has them loaded for the just-completed award).
  4. If no match: do nothing (no log row — eligible for re-evaluation on the customer's next earn).
  5. If matched: skip entirely if `membership.customerAccountId` is null (same guard as `checkMilestoneTrigger`/birthday/inactivity — a membership with no linked `CustomerAccount` has no consent record and no email/push channel to reach). Otherwise load the `CustomerAccount`, check consent for the broadcast's channel:
     - Not granted → write `BroadcastLog` with `status: "no_consent"`. Done.
     - Granted, channel `"email"` → `await sendEmail({to: customer.email, subject: broadcast.subject, html: `<p>${broadcast.body}</p>`})` inside a try/catch (this call site is a background fire-and-forget hook already, like `checkMilestoneTrigger`'s caller — awaiting here does not block any HTTP response, unlike a controller). Success → `status: "sent"`; catch → `status: "failed"`.
     - Granted, channel `"push"` → find `PushSubscription`s for the customer, attempt `sendPushToSubscription` on each. `sendPushToSubscription` is extended to return `{ok: boolean}` instead of void (a small, backward-compatible change — existing trigger callers already ignore its return value) so the broadcast path can tell whether at least one device succeeded. Zero subscriptions or all failed → `status: "failed"`; at least one success → `status: "sent"`.
  6. Write exactly one `BroadcastLog` row per evaluated match (steps 5's three branches each write exactly one).

### Prebuilt broadcast seeding

A new small helper, `seedDefaultBroadcasts(organizationId)` in `broadcastService.js`, called once at the end of `companyService.createOutlet` (right after the `Organization.create(...)` call, alongside where the `AdminAccount`/`User` rows are created — same transaction-less fire order the rest of that function already uses). Creates the two rows from Decision 10 directly via `Broadcast.create(...)`.

### `pointsService.js` change

`claimPoints` currently does:
```js
checkMilestoneTrigger({ organization: org, membership: claimer })
  .catch((err) => console.error("Milestone trigger check failed:", err.message));
```
A parallel line is added right after it:
```js
evaluateBroadcasts({ organization: org, membership: claimer })
  .catch((err) => console.error("Broadcast evaluation failed:", err.message));
```
`claimPoints` does not itself load an `earns` array (the two existing `resolveTier` call sites that pass `earns` — `pointsService.js:602` and `:696` — are in the balance/customer-detail read paths, not in `claimPoints`), so `evaluateBroadcasts` calls `resolveTier(organizationId, membership._id, {org: organization})` without `earns`, letting it fetch fresh via its existing fallback. This is one extra `PointsTransaction` query per active tier-segment broadcast per earn — acceptable, since outlets are expected to have a handful of broadcasts at most, not dozens.

### Routes (`/api/admin/broadcasts`, `isBusinessAdmin`, new `backend/routes/` additions or extending existing admin routes file)

- `POST /` → `createBroadcast`
- `GET /` → `listBroadcasts`
- `GET /:id` → `getBroadcastDetail`
- `PATCH /:id` → `updateBroadcast`
- `DELETE /:id` → `deleteBroadcast`

## Frontend

- New `frontend/src/routes/admin/AdminBroadcasts.tsx` + nav entry in `AdminLayout.tsx` (e.g. `{ to: "broadcasts", label: "Broadcasts", Icon: Megaphone }`), placed near the existing `Campaigns` entry but visually distinct (different icon, different label) so the Campaign/Broadcast naming split reads clearly in the UI, not just in code.
- **List view**: table of broadcasts — channel badge, segment description ("All customers" / "Reaches Gold"), subject, active/paused toggle switch, three count badges (sent/failed/no-consent). Row click navigates to detail.
- **Detail view**: broadcast's own content (read-only unless editing) plus the per-recipient log table (customer name, status badge, sent-at timestamp) from `getBroadcastDetail`.
- **Create form**: channel select (Email/Push), segment select (a tier-label dropdown sourced from `TIER_LABELS`, or "All customers"), subject input, body textarea, submit → `createBroadcast`.
- **Edit**: subject/body/active editable inline from the detail view; segment/channel shown read-only with a note that changing them requires delete-and-recreate (Decision: `updateBroadcast` doesn't accept them).

## Testing

New `backend/tests/broadcasts.js` (added to `backend/package.json`'s test chain):

1. A `"tier"`-segment broadcast (targeting Gold) fires exactly once, the first earn where the customer's resolved tier reaches Gold — verified via `BroadcastLog` containing exactly one `"sent"` row for that customer, and the seeded/consented test email being sent.
2. The same broadcast does not re-fire or re-log on a subsequent earn once already matched (idempotency).
3. An `"all"`-segment broadcast fires once for an existing customer on their next earn after the broadcast is created, and not again on a further earn.
4. Pausing a broadcast (`active: false`) stops it from firing for a customer who newly matches while paused; reactivating does not retroactively catch them up (Decision 9) — confirmed by checking no log row exists until a further earn happens after reactivation.
5. A customer without channel consent produces a `"no_consent"` log row, not a `"sent"` one, and no email/push attempt is made.
6. Cross-tenant isolation: a broadcast created for outlet A never fires for a matching customer whose earn happened at outlet B.
7. `createOutlet` seeds exactly the two prebuilt broadcasts from Decision 10, both `active: true`.
8. `getBroadcastDetail` returns per-recipient rows with correct customer name/status/timestamp after a mixed batch of sent/failed/no-consent evaluations.

## Explicitly out of scope

- Scheduling, draft state, or a manual "send now" action (Decision 2).
- Multi-channel fan-out per broadcast (Decision 7 / roadmap decision 6).
- Rich HTML authoring or `{name}`-style personalization tokens in admin-authored content (Decision 8).
- Retrying `"no_consent"` sends after a customer later grants consent (Decision 6).
- Segment dimensions beyond tier/all (e.g. inactivity-days, balance-range) — deferred; the schema's `segmentType` enum can grow later without a migration since nothing is stored beyond the type/tier fields already modeled.
- SMS/WhatsApp channels (Phases 5/6 per roadmap).
- **Snapshotting sent content onto `BroadcastLog`.** Unlike `Campaign`'s multiplier/campaignId snapshot onto the points ledger (which exists because a ledger must justify a monetary award forever), a `BroadcastLog` row does not store the subject/body actually sent — editing a broadcast's copy after some sends changes what future matches receive but does not retroactively describe what past recipients got. Acceptable for a messaging log, not a financial record; revisit only if audit requirements emerge.

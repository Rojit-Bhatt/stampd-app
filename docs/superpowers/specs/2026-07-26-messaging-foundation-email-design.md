# Messaging foundation: consent, birthday, email triggers (Phase 3a)

**Date:** 2026-07-26
**Status:** Approved design, ready for implementation plan
**Scope:** Phase 3a of `docs/superpowers/specs/2026-07-22-loyalty-growth-suite-roadmap-design.md` — the email-only half of Phase 3's "messaging foundation." Consent model (all four channels, only `email` wired), birthday field, an email channel adapter, both trigger mechanisms (real-time milestone, daily-cron birthday/inactivity), and three fixed canned templates. Does NOT include Web Push (split out to its own Phase 3b spec — zero push infra exists today, and adding it means reconfiguring the PWA's service worker from `generateSW` to `injectManifest` mode, a materially different piece of work). Does NOT include SMS/WhatsApp (later phases, pending budget). Does NOT include a campaign/`Broadcast` builder (Phase 4) — these are fixed, non-editable templates.

## Context

Nothing in this codebase sends marketing messages today — every `sendEmail()` call is transactional (verify-email, password reset, subscription reminders). This phase adds the first messaging that isn't a direct response to a customer action: a birthday greeting, an inactivity nudge, and a milestone-visit thank-you. It also adds the first cron job in this codebase (`CLAUDE.md` currently states none exists or is needed anywhere) and the first per-channel consent model, which Nepal's NTA requires to be explicit, documented, and revocable (established during Phase 1's brainstorming).

## Decisions locked during brainstorming

1. **Consent is captured at registration** as one new unchecked checkbox ("Send me offers and updates by email") — zero extra friction since it's a single checkbox, unlike the birthday field which needs real thought and stays profile-settings-only. Revocable any time from profile settings.
2. **`CustomerAccount.marketingConsent` covers all four channels** (`email`/`sms`/`whatsapp`/`push`) now, per Phase 1's roadmap decision, even though only `email` does anything in this phase — avoids a schema migration when SMS/WhatsApp/push ship later.
3. **Trigger control mirrors Phase 1's tier-threshold pattern exactly**: each outlet admin sets its own thresholds on the same Points Program settings page, `null`/`false` meaning "off," no inheritance from company or platform (matching how tiers are outlet-scoped only).
4. **Milestone fires on exact equality, not `>=`.** A customer's lifetime visit count at that outlet is checked right after a successful earn; it fires only the instant it equals the configured `visitCount`, never retroactively for someone who already blew past it before the admin configured the number.
5. **Idempotency lives in a new `MessageLog` model**, not ad-hoc flags scattered across other models — one row per send (`organizationId`, `userId`, `triggerType`, `sentAt`). This is what stops the birthday cron from re-sending the same year's greeting on every daily run, and what stops the inactivity nudge from firing every single day a customer stays inactive (next possible nudge is no sooner than the configured `days` after the last one). It also becomes the audit trail Phase 4/5's send-count analytics will eventually read.
6. **Cron runs once daily at 9am Asia/Kathmandu** — a reasonable, unsurprising local hour, consistent with the existing `PLATFORM_TIMEZONE` convention used for campaign day-of-week judging.
7. **Canned copy is written into this spec directly** (not left to the plan or the implementer) — three fixed templates, neutral and on-voice, swapped for admin-authored copy once Phase 4 ships.

## Explicitly out of scope

- Web Push (Phase 3b — separate spec, separate PWA architecture change).
- SMS/WhatsApp sending (Phases 5/6, pending budget).
- Any campaign builder / custom message authoring (Phase 4) — these three templates are fixed.
- A "purchase milestone by total spend" variant — visit-count only, per Phase 1's decision.
- Any change to `tierService.resolveTier` or the tier system.

## Data model

### `backend/models/CustomerAccount.js` — two additions

```js
marketingConsent: {
  email: {
    granted: { type: Boolean, default: false },
    updatedAt: { type: Date, default: null }
  },
  sms: {
    granted: { type: Boolean, default: false },
    updatedAt: { type: Date, default: null }
  },
  whatsapp: {
    granted: { type: Boolean, default: false },
    updatedAt: { type: Date, default: null }
  },
  push: {
    granted: { type: Boolean, default: false },
    updatedAt: { type: Date, default: null }
  }
},
birthdayMonth: { type: Number, min: 1, max: 12, default: null },
birthdayDay: { type: Number, min: 1, max: 31, default: null }
```

### `backend/models/Organization.js` — one addition, sibling to `tierThresholds`

```js
messagingTriggers: {
  milestone: {
    // null = off. Fires once, the instant lifetime visits at THIS outlet
    // equal this number — not >=, so a customer who already passed it
    // before the admin configured it never retroactively triggers.
    visitCount: { type: Number, min: 1, default: null }
  },
  inactivity: {
    // null = off. Days since last activity before a nudge fires; also the
    // minimum gap before the SAME customer can be nudged again.
    days: { type: Number, min: 1, default: null }
  },
  birthday: {
    enabled: { type: Boolean, default: false }
  }
}
```

### New model: `backend/models/MessageLog.js`

```js
const MessageLogSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  triggerType: { type: String, enum: ["milestone", "birthday", "inactivity"], required: true },
  sentAt: { type: Date, default: Date.now }
});
MessageLogSchema.index({ organizationId: 1, userId: 1, triggerType: 1, sentAt: -1 });
```

One row per successful send. Never edited, only appended — same append-only philosophy as `PointsTransaction`.

## Consent capture

**Registration**: one new unchecked checkbox on the customer registration form — "Send me offers and updates by email." Stored as `marketingConsent.email = {granted: true, updatedAt: now}` if checked, otherwise left at the schema default (`granted: false`, `updatedAt: null`) — an unchecked box is simply never touched, not an explicit "false" write, since nothing was actually consented to.

**Revoking/re-granting**: a toggle on `CustomerProfilePanel.tsx` (the same page Phase 1's research placed the birthday field on), updating the same field, always stamping `updatedAt` on change — this timestamp is the "documented consent" NTA requires.

## Birthday field

Two optional number inputs (`birthdayMonth` 1–12, `birthdayDay` 1–31) on `CustomerProfilePanel.tsx`, not at registration — matching Phase 1's progressive-profiling research. No cross-field validation against real days-per-month (e.g. day 31 in a 30-day month) — the birthday cron only fires on an exact month+day match against today's real calendar date, so a customer who enters a genuinely impossible date (Feb 30) simply never matches and never gets a birthday email; no special-cased rejection needed.

## Backend

### `backend/services/messagingService.js` (new)

One exported function:

```js
const sendTrigger = async (type, { organization, customer, membership, context = {} }) => {
  if (!customer.marketingConsent?.email?.granted) return { sent: false, reason: "no_consent" };

  const { subject, html } = renderTemplate(type, { organization, customer, membership, context });

  sendEmail({ to: customer.email, subject, html })
    .catch((err) => console.error(`Failed to send ${type} trigger to ${customer.email}:`, err.message));

  await MessageLog.create({ organizationId: organization._id, userId: membership._id, triggerType: type });

  return { sent: true };
};
```

`customer` here is the `CustomerAccount` document (owns `email`/`marketingConsent`); `membership` is the outlet-scoped `User` document (owns `organizationId`, and is what `MessageLog.userId` references, matching every other outlet-scoped model in this codebase). `renderTemplate` is a private, non-exported function holding the three fixed templates below — switched on `type`.

The `MessageLog.create` call is **awaited**, not fire-and-forget — the email send itself is fire-and-forget (matching the codebase's established pattern), but the log row is the idempotency guard the cron and the milestone check both depend on, so it must be committed before the caller can trust it happened.

### Templates (fixed, written here — not left ambiguous for the plan)

**Milestone** (`context.visitCount` = the configured threshold just reached):
- Subject: `You've visited {organization.name} {visitCount} times!`
- Body: `Hi {customer.name}, that's {visitCount} visits to {organization.name} — thanks for being a regular. See you again soon.`

**Birthday**:
- Subject: `Happy birthday from {organization.name}!`
- Body: `Hi {customer.name}, happy birthday from all of us at {organization.name}. Hope it's a good one — come by and treat yourself.`

**Inactivity** (`context.balance` = current points balance, `context.days` = the configured inactivity threshold crossed):
- Subject: `We miss you at {organization.name}`
- Body: `Hi {customer.name}, it's been a while since your last visit to {organization.name}. You've still got {balance} points waiting — come say hi.`

All three are plain, unstyled HTML paragraphs matching the existing transactional emails' minimalism (`emailService.js`'s current templates are plain `<p>` tags, no branded HTML layout) — no new email-styling work in this phase.

### Milestone trigger — real-time

In `backend/services/pointsService.js`, right after `claimPoints`'s successful atomic write resolves (the point the codebase's own reconnaissance identified as line ~407, immediately before the function returns its response payload): a non-blocking check —

```js
checkMilestoneTrigger({ organization, userId, organizationId })
  .catch((err) => console.error("Milestone trigger check failed:", err.message));
```

`checkMilestoneTrigger` (new, in `messagingService.js` or a small sibling `triggerService.js` — the plan decides which, per its own file-structure judgment) does: if `organization.messagingTriggers.milestone.visitCount` is null, return immediately. Otherwise count this customer's lifetime `earn`-type `PointsTransaction` rows at this outlet; if the count now exactly equals the configured number, load the `CustomerAccount` (via the `User.customerAccountId` link) and call `sendTrigger("milestone", ...)`.

This call is fire-and-forget from `claimPoints`'s perspective — a slow or failed milestone check must never delay or fail the customer's actual earn response, the same reasoning that already governs every `sendEmail()` call in this codebase.

### Birthday + inactivity trigger — daily cron

New dependency: `node-cron`. Registered once in `server.js` at startup (mirroring how every other cross-cutting concern in this codebase is wired at boot), scheduled for `0 9 * * *` in `Asia/Kathmandu`.

The cron handler calls one new exported function, `runDailyTriggers()` (in `messagingService.js` or the sibling trigger file) — **this must be a plain exported async function, not inline in the cron callback**, specifically so tests can call it directly without waiting for a real cron tick. This is the only way to test cron-driven logic in this codebase's existing style (no test framework, no clock-mocking library) — `bootServer`-based tests call `runDailyTriggers()` directly and assert on its effects (emails sent, `MessageLog` rows created), never on whether `node-cron` itself fired.

`runDailyTriggers()`:
1. `Organization.find({})` — every outlet (matches the platform-analytics precedent of scanning without a tenant filter when the aggregation itself is the point, though this one loops synchronously per outlet rather than aggregating).
2. For each outlet with `messagingTriggers.birthday.enabled`: find its customers (`User.find({role: "customer", organizationId})`), for each one whose linked `CustomerAccount.birthdayMonth`/`birthdayDay` matches today's real month/day (computed in `Asia/Kathmandu`, not UTC — same reasoning as campaign day-of-week judging), check `MessageLog` for an existing `birthday` row this calendar year; if none, send.
3. For each outlet with `messagingTriggers.inactivity.days` set: for each customer whose `PointsBalance.lastActivityAt` is at least that many days old, check `MessageLog` for an `inactivity` row within the last `days`; if none, send.

Registering the cron at every server boot is harmless in this codebase's test harness — each test process boots a real server via `bootServer` and exits within seconds, far shorter than any cron interval, so a registered-but-never-fired schedule costs nothing.

## Frontend

### `AuthView.tsx` (registration mode)

One new unchecked checkbox, wired into the existing Zod `registerSchema`/form state, sent as `marketingEmailConsent: boolean` in the register request body.

### `CustomerProfilePanel.tsx`

Two new sections below the existing name/password/avatar blocks:
- **Email updates** toggle, reflecting/updating `marketingConsent.email.granted`.
- **Birthday** — two number inputs (month/day), same `useState`+save pattern the panel already uses for `name`.

### `PointsProgram.tsx` (outlet admin settings)

New "Triggers" section, sibling to Phase 1's "Tiers" section: three rows —
- **Milestone**: a single number input (visit count; empty = off).
- **Inactivity**: a single number input (days; empty = off).
- **Birthday**: a plain on/off toggle (no threshold).

Same `useState`+`useEffect`-seed+save pattern as the Tiers section, PATCHed through the same `/api/admin/settings` endpoint (extending `tenantController.js`'s `getMySettings`/`updateMySettings` the same way `tierThresholds` was extended in Phase 1).

## Backend routes/controllers touched

- `backend/controllers/tenantController.js` — `getMySettings`/`updateMySettings` gain `messagingTriggers`, same pattern as `tierThresholds`.
- `backend/services/authService.js` (or wherever customer registration is handled) — accepts and stores `marketingEmailConsent` on the new `CustomerAccount`.
- `backend/controllers/customerAccountController.js` / `customerAccountService.js`'s `updateAccountProfile` — extended to accept `marketingConsent.email` toggle and `birthdayMonth`/`birthdayDay`, following the exact pattern Phase 1 already established there for other optional profile fields.

## Testing

New `backend/tests/messaging-triggers.js` (added to `package.json`'s test chain):
- Milestone: configure `visitCount`, drive a customer to exactly that many earns, confirm exactly one `MessageLog` row and one email attempt; drive one more earn past it, confirm no second send.
- Birthday: set a customer's `birthdayMonth`/`birthdayDay` to today's real date, enable the trigger, call `runDailyTriggers()` directly, confirm a send; call it again same day, confirm no duplicate (idempotency via `MessageLog`).
- Inactivity: backdate a `PointsBalance.lastActivityAt` past the configured threshold, call `runDailyTriggers()`, confirm a send; call it again, confirm no duplicate until the configured `days` have passed since the logged send.
- Consent gate: a customer with `marketingConsent.email.granted: false` never gets sent to, regardless of matching any trigger condition.
- Per-outlet isolation: a sibling outlet with `messagingTriggers` unconfigured never fires for its own matching customers.

# Phase 5: SMS provider integration

**Date:** 2026-07-27
**Status:** Approved design, ready for implementation plan
**Scope:** Phase 5 of the loyalty growth suite roadmap (`docs/superpowers/specs/2026-07-22-loyalty-growth-suite-roadmap-design.md`). Adds SMS as a third messaging channel alongside email (Phase 3a) and push (Phase 3b) — both the canned triggers (milestone/birthday/inactivity) and the admin-authored `Broadcast` (Phase 4) gain SMS. Introduces a per-company monthly spend cap, since SMS (unlike email/push) has a real per-message cost billed to the company.

## Context

Roadmap decision 11 named **Sparrow SMS** (a Nepal-local aggregator) as the candidate provider, at an estimated NPR 0.70–1.50 per SMS, with the explicit caveat "no account exists yet... confirm live rate before committing." Decision 10 requires the cost be billed to each company as a usage-based add-on with a configurable per-company cap, not absorbed by the platform.

**No Sparrow SMS account exists at the time of this design.** The real API integration is built against Sparrow's publicly documented request/response shape, mirroring exactly how `emailService.js` already handles Brevo (a real API call path, gated on an env var, with a working stub fallback for dev/test) — but **the exact request/response shape and the per-message price must both be verified against a live account before this ships to production.** This is the same caveat the roadmap already carries for price, extended here to cover the API shape too.

## Decisions

1. **Provider integration mirrors `emailService.js`'s precedence pattern**: `SPARROW_SMS_API_KEY` (plus `SPARROW_SMS_FROM`, the registered sender identity) set → real HTTPS call to Sparrow's API; unset → dev/test stub that console-logs the message and returns `{stubbed: true}`. No secondary fallback tier (unlike email's Brevo→SMTP→stub) — there is only one aggregator, not two.
2. **SMS is billed to the company, not the platform.** `Company.smsMonthlyCapPaisa` (integer paisa, nullable) is the enablement + cap mechanism in one field: `null` means SMS is not enabled for that company at all (no budget approved), matching the "no payment API — platform admin confirms out-of-band" pattern `SubscriptionKey` already established. A non-null value is the calendar-month spend ceiling.
3. **Monthly spend is derived at read time from a new `SmsSendLog`, never a running counter field.** Same reasoning as `PointsBalance`/`Subscription.currentPeriodEnd`: a stored running total could drift from what was actually sent, and "derived from the log" makes drift structurally impossible. Reset is calendar-month, judged in `PLATFORM_TIMEZONE` (Nepal-only platform, same convention `campaignService.localDayOfWeek` already uses) — no cron needed, since "is this month capped" is answered fresh on every send attempt.
4. **`SmsSendLog` is company-scoped (not outlet-scoped) and shared across both trigger and broadcast sends.** A company's cap must account for SMS sent from every one of its outlets combined, and from both sending paths (canned triggers, Broadcast) — a single log written by one shared `smsService.sendSms(...)` function, called by both `messagingService.sendTrigger` and `broadcastService.evaluateBroadcasts`, is what makes "check the cap once, in one place" possible instead of duplicating cap logic in two callers.
5. **Cap enforcement is a hard stop**, per the interview: once this month's logged spend plus one more message's cost would exceed the cap, `sendSms` returns a non-sent result without calling the real API (so no cost is incurred beyond the cap) and does not write a chargeable `SmsSendLog` row for the skipped attempt.
6. **`MessageLog` (canned triggers) stays schema-unchanged.** It has always been an existence-only idempotency log — `sendTrigger` already doesn't distinguish *why* nothing was sent (no consent vs. genuinely nothing to send), it just never sets `sent = true`. SMS being capped or not-enabled is one more reason `sent` stays `false` for that channel; this needs no new field, since the codebase already accepts this coarseness at the trigger layer (see `messagingService.sendTrigger`'s existing `{sent: false, reason: "no_consent"}` shape, which likewise doesn't distinguish sub-reasons within "wasn't sent" beyond the one it already names).
7. **`BroadcastLog.status` gains a fourth value: `"cap_reached"`.** Unlike triggers, `Broadcast`'s whole purpose is granular per-recipient diagnosis (Phase 4's `sentCount`/`failedCount`/`noConsentCount` tiles) — collapsing "hit the monthly cap" into `"failed"` would read as a delivery problem to the admin when it's actually a budget one. `Broadcast.channel` enum grows to include `"sms"`.
8. **SMS consent capture UI is added wherever email consent already is** — `AuthView.tsx`'s register form and `CustomerProfilePanel.tsx` each get an SMS opt-in checkbox alongside the existing email one, same component shape, writing to the already-existing (but currently unused) `CustomerAccount.marketingConsent.sms`. No new phone-collection UI is needed: `CustomerAccount.phone` has been mandatory at registration since Phase 1 of this codebase's auth work, so every customer already has a real number on file.
9. **SMS templates are short, plain-text, ASCII-only** — the existing email trigger templates' copy is reused verbatim, stripped of HTML (the same `stripHtml` helper `messagingService.js` already uses for push). No Devanagari/Unicode SMS support in v1 — Sparrow (like most gateways) prices Unicode segments at roughly a quarter the character count of GSM7 ASCII, so mixing scripts would silently multiply cost; English-only keeps the single-segment cost model in Decision 3's `SMS_COST_PAISA_PER_MESSAGE` constant accurate. Revisit if Nepali-script SMS is specifically requested later.
10. **Phone numbers are sent to Sparrow in local 10-digit format** (e.g. `98XXXXXXXX`), stripping any leading `+977`/`977`/`0` the customer might have entered — this matches Sparrow's publicly documented examples, but **must be confirmed against a live account**, per this design's opening caveat.

## Data model

### `Company` (modify — add one field)

```js
// backend/models/Company.js — add alongside the existing top-level fields
smsMonthlyCapPaisa: { type: Number, min: 0, default: null }
```

`null` = SMS not enabled for this company. A non-null value is the calendar-month spend ceiling in paisa (1 rupee = 100 paisa — same integer-money reasoning `pointsMath.js` already applies to points, avoiding float drift across many accumulated sends).

### `SmsSendLog` (new model, `backend/models/SmsSendLog.js`)

```js
{
  companyId: ObjectId,       // required, ref Company — the cap is billed at this level
  organizationId: ObjectId, // required, ref Organization — which outlet triggered the send
  sentAt: Date,              // default now
  costPaisa: Number          // required — snapshotted from SMS_COST_PAISA_PER_MESSAGE at send time,
                             // so a later price change doesn't retroactively rewrite this month's
                             // already-logged spend (same snapshotting reasoning Campaign's
                             // multiplier/campaignId already applies to the points ledger)
}
```

Index: `{ companyId: 1, sentAt: -1 }` — the monthly-spend query's shape.

### `config/platform.js` (add one constant)

```js
// Paisa (1/100 rupee) per SMS, single GSM7 segment. THIS IS A PLACEHOLDER —
// Sparrow SMS quotes NPR 0.70–1.50/SMS depending on volume; confirm the
// actual contracted rate against a live account before this goes to
// production, then update this constant to match.
const SMS_COST_PAISA_PER_MESSAGE = 100; // NPR 1.00
```

## Backend

### `services/smsService.js` (new)

```
sendSms({ companyId, organizationId, to, text }) → { sent: boolean, reason?: "sms_not_enabled" | "cap_reached" }
```

1. Load the `Company`. If `smsMonthlyCapPaisa` is `null` → return `{sent: false, reason: "sms_not_enabled"}` immediately, no log written.
2. Sum `costPaisa` from `SmsSendLog.find({companyId, sentAt: {$gte: <start of current calendar month in PLATFORM_TIMEZONE>}})`.
3. If `spend + SMS_COST_PAISA_PER_MESSAGE > smsMonthlyCapPaisa` → return `{sent: false, reason: "cap_reached"}`, no log written, no API call made (so no cost is ever incurred beyond the cap).
4. Otherwise: normalize `to` to Sparrow's local 10-digit format (strip a leading `+977`, `977`, or `0`), call the real API if `SPARROW_SMS_API_KEY` is set (else console-log stub, `{stubbed: true}`), write one `SmsSendLog` row with `costPaisa: SMS_COST_PAISA_PER_MESSAGE`, return `{sent: true}`.

### `messagingService.sendTrigger` (modify)

Add a third branch alongside the existing email/push ones, gated on `customer.marketingConsent.sms.granted`, calling `smsService.sendSms({companyId: organization.companyId, organizationId: organization._id, to: customer.phone, text: stripHtml(html)})`. `sent` flips `true` only if `sendSms` returns `{sent: true}` — mirrors how push already only counts as attempted when a subscription actually exists. `MessageLog` is written exactly as today, unchanged shape.

### `broadcastService.evaluateBroadcasts` (modify)

Add an `sms` branch alongside the existing `email`/`push` dispatch: on consent granted, call `smsService.sendSms(...)`; if it returns `{sent: true}` → `BroadcastLog.status = "sent"`; if `{reason: "cap_reached"}` → `status = "cap_reached"`; if `{reason: "sms_not_enabled"}` → treat the same as `"cap_reached"` from the admin's perspective (both mean "this company can't send SMS right now") — collapsed into the same status value rather than a 5th enum member, since the admin's actionable response is identical either way ("talk to the platform about your SMS budget").

### `services/platformService.updateCompany` (modify)

Accept an optional `smsMonthlyCapPaisa` in the existing PATCH body, validated as a non-negative integer or `null`, alongside the existing `name`/`status`/`programDefaults` fields it already handles. Appended to the same audit-log `changeParts` array the function already builds.

## Frontend

- **`CompanyDetail.tsx`** (platform admin's company edit page): add an "SMS budget" field next to the existing earn-percent input — a number input for the monthly cap in whole rupees (converted to/from paisa at the API boundary, same `toPoints`/`toCenti`-style conversion `pointsMath.js` already establishes for points), with `null`/empty meaning "not enabled," shown as a clear "SMS disabled" state rather than a blank/zero that reads as a misconfiguration.
- **`AdminBroadcasts.tsx`** (Phase 4): the channel `<select>` gains a "SMS" option. The per-recipient detail table's status badge gains a fourth visual state for `"cap_reached"` (reuses the existing warn-colored badge styling already established for non-`"sent"` states, distinct copy: "Budget reached").
- **`AuthView.tsx`** register form and **`CustomerProfilePanel.tsx`**: an SMS opt-in checkbox, identical shape to the existing email one, wired to `marketingConsent.sms` the same way `emailOptIn` already wires to `marketingConsent.email`.

## Testing

New `backend/tests/sms-provider.js` (added to `backend/package.json`'s test chain):

1. A company with `smsMonthlyCapPaisa: null` never sends SMS regardless of consent — `sendSms` returns `sms_not_enabled`, no `SmsSendLog` row.
2. A company with a cap sends successfully while under it, and each successful send writes exactly one `SmsSendLog` row with the snapshotted cost.
3. Once accumulated spend for the current calendar month would exceed the cap, the next attempt returns `cap_reached` and writes no further log row (cost never exceeds the cap).
4. A `SmsSendLog` row from last calendar month does not count against this month's cap (calendar-month boundary, not rolling 30-day).
5. Two outlets of the same company share one cap (a send from outlet A counts against outlet B's remaining budget) — company-level, not outlet-level.
6. A milestone trigger with SMS consent granted sends via SMS and `MessageLog` behaves exactly as it does for email/push today (existence-only, no schema change) — extends the existing `messaging-triggers.js` coverage rather than duplicating it.
7. A Broadcast on the `"sms"` channel: successful sends log `"sent"`; a capped company logs `"cap_reached"` for every subsequent match that calendar month; consent-withheld customers still log `"no_consent"` exactly as they do for email/push today.
8. Phone normalization: `+977981...`, `977981...`, `0981...`, and bare `981...` all normalize to the same 10-digit value passed to the (stubbed) API call.

## Explicitly out of scope

- **A real, verified Sparrow SMS account and confirmed live pricing** — this design builds the integration against their publicly documented shape; going live requires manually confirming both the request/response format and `SMS_COST_PAISA_PER_MESSAGE` against a real account (this design's opening caveat, and roadmap decision 11's own explicit caveat).
- **Unicode/Devanagari-script SMS** (Decision 9) — English-only templates in v1.
- **Multi-segment SMS cost accounting** — `SMS_COST_PAISA_PER_MESSAGE` assumes every message fits one GSM7 segment (160 chars); a message that overflows into multiple segments is not specially priced or truncated in v1 (templates are short enough in practice, but no enforcement guards this).
- **A rolling or per-send spend warning UI for the company owner** (e.g. "80% of budget used") — only the platform admin sees/sets the cap in v1; the company owner's own console gets no SMS-budget visibility yet.
- **WhatsApp** (Phase 6, gated on this phase landing and a BSP decision per the roadmap).

# Phase 5: SMS Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SMS as a third messaging channel (alongside email and push) on both the canned triggers (milestone/birthday/inactivity) and the admin-authored `Broadcast`, billed to the company via a platform-admin-configured monthly cap.

**Architecture:** A new `smsService.js` centralizes the cap check and the Sparrow SMS API call in one place, called by both `messagingService.sendTrigger` and `broadcastService.evaluateBroadcasts`. `Company.smsMonthlyCapPaisa` (nullable) is both the enablement flag and the cap; a new `SmsSendLog` derives current-month spend at read time, never a stored running total.

**Tech Stack:** Express/Mongoose (mock DB in dev/test) backend; React 19 + TanStack Query frontend. No new npm dependencies — Sparrow's API is plain HTTP, reachable via the built-in `fetch` exactly like `emailService.js`'s Brevo call.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-07-27-sms-provider-integration-design.md` — every decision below traces back to a numbered decision there.
- **This design builds against Sparrow SMS's publicly documented API shape and an estimated price. Neither is verified against a live account.** Before this goes to production: confirm the real request/response shape and the real per-message price, then update `SMS_COST_PAISA_PER_MESSAGE` and `smsService.sendViaSparrowApi` if either differs. Nothing in this plan blocks on that confirmation — the dev/test stub path (unset `SPARROW_SMS_API_KEY`) is what every test in this plan exercises.
- **Mock DB limits** (see root `CLAUDE.md`): no `findById` (`findOne({_id})` only), `findOneAndUpdate`'s update argument MUST be wrapped in `$set`, uniqueness is NOT enforced by indexes and must be checked in application code, `.sort()` takes one key only, no aggregation pipeline (compute in JS).
- **Multi-tenant isolation:** every `SmsSendLog` query MUST include `companyId` (this collection is company-scoped, not outlet-scoped — see design Decision 4).
- **Money is integer paisa, never a float** — `smsMonthlyCapPaisa`/`costPaisa`/`SMS_COST_PAISA_PER_MESSAGE` are all integers (1 rupee = 100 paisa), same reasoning `pointsMath.js` already applies to points.
- **No new cron job.** Current-month spend is derived at read time from `SmsSendLog`, exactly like `Subscription.currentPeriodEnd` expiry is derived at read time — never a stored counter, never a scheduled reset.

---

### Task 1: Data model + `smsService.js` (cap check + Sparrow API + dev stub)

**Files:**
- Modify: `backend/models/Company.js`
- Create: `backend/models/SmsSendLog.js`
- Modify: `backend/config/platform.js`
- Create: `backend/services/smsService.js`
- Create: `backend/tests/sms-provider.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `smsService.sendSms({companyId, organizationId, to, text}) → Promise<{sent: boolean, reason?: "sms_not_enabled" | "cap_reached"}>` — consumed by Task 2 (`messagingService.sendTrigger`) and Task 3 (`broadcastService.evaluateBroadcasts`).
- Consumes: `config/platform.js`'s `PLATFORM_TIMEZONE` (already exported); `Company` model.

- [ ] **Step 1: Add the cap field to `Company`**

In `backend/models/Company.js`, add alongside the existing top-level fields (right after `programDefaults`, before `status`):

```js
  // Nullable — null means SMS is not enabled for this company at all (no
  // budget approved yet). A non-null value is the calendar-month spend
  // ceiling in paisa (1 rupee = 100 paisa, same integer-money reasoning
  // pointsMath.js already applies to points, avoiding float drift across
  // many accumulated sends). Set by the platform admin only — see
  // platformService.updateCompany.
  smsMonthlyCapPaisa: { type: Number, min: 0, default: null },
```

- [ ] **Step 2: Create the `SmsSendLog` model**

```js
// backend/models/SmsSendLog.js
const mongoose = require("mongoose");

// Company-scoped (not outlet-scoped): a company's SMS budget covers every
// one of its outlets combined, and both sending paths (canned triggers,
// Broadcast) share this one log — see design Decision 4. Current-month
// spend is SUMMED from this at read time, never a stored running counter
// (same reasoning Subscription.currentPeriodEnd's expiry is always derived
// at read time rather than a scheduled reset).
const SmsSendLogSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  sentAt: { type: Date, default: Date.now },
  // Snapshotted from SMS_COST_PAISA_PER_MESSAGE at send time, so a later
  // price change doesn't retroactively rewrite this month's already-logged
  // spend — same snapshotting reasoning Campaign's multiplier/campaignId
  // already applies to the points ledger.
  costPaisa: { type: Number, required: true, min: 0 }
});

SmsSendLogSchema.index({ companyId: 1, sentAt: -1 });

module.exports = mongoose.model("SmsSendLog", SmsSendLogSchema);
```

- [ ] **Step 3: Add the cost constant to `config/platform.js`**

Add near the other platform-wide constants (alongside `CAMPAIGN_STACKING`/`TIER_LABELS`):

```js
// Paisa (1/100 rupee) per SMS, assuming one GSM7 segment (160 ASCII chars).
// THIS IS A PLACEHOLDER — Sparrow SMS quotes NPR 0.70-1.50/SMS depending on
// volume; confirm the actual contracted rate against a live account before
// this goes to production, then update this constant to match.
const SMS_COST_PAISA_PER_MESSAGE = 100; // NPR 1.00
```

Add `SMS_COST_PAISA_PER_MESSAGE` to the `module.exports` object.

- [ ] **Step 4: Create `smsService.js`**

```js
// backend/services/smsService.js
const Company = require("../models/Company");
const SmsSendLog = require("../models/SmsSendLog");
const { PLATFORM_TIMEZONE, SMS_COST_PAISA_PER_MESSAGE } = require("../config/platform");

// Start of the current calendar month, judged in PLATFORM_TIMEZONE — a
// Nepal-only platform, same convention campaignService.localDayOfWeek
// already uses for day-of-week judging. No cron: "is this month capped" is
// answered fresh on every send attempt, exactly like subscription expiry.
const startOfCurrentMonth = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLATFORM_TIMEZONE,
    year: "numeric",
    month: "numeric"
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  return new Date(Date.UTC(year, month - 1, 1));
};

// Sparrow accepts a local 10-digit number (e.g. 98XXXXXXXX) — strip any
// leading +977/977/0 a customer's stored number might carry. THIS FORMAT IS
// UNVERIFIED against a live account — confirm before production (see this
// plan's Global Constraints).
const normalizePhone = (raw) => {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("977")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  return digits;
};

const apiConfigured = () => Boolean(process.env.SPARROW_SMS_API_KEY);

// THE REQUEST/RESPONSE SHAPE HERE IS UNVERIFIED against a live Sparrow
// account — built against their publicly documented API. Confirm before
// production (see this plan's Global Constraints).
const sendViaSparrowApi = async ({ to, text }) => {
  const params = new URLSearchParams({
    token: process.env.SPARROW_SMS_API_KEY,
    from: process.env.SPARROW_SMS_FROM || "",
    to,
    text
  });
  const res = await fetch(`https://api.sparrowsms.com/v2/sms/?${params.toString()}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.response_code !== 200) {
    throw new Error(`Sparrow SMS API responded ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
};

// The single entrypoint for every SMS send in the app, from either the
// canned-trigger path or Broadcast — centralizing the cap check here is
// what makes "check the cap once" possible instead of duplicating it in
// both callers (design Decision 4).
const sendSms = async ({ companyId, organizationId, to, text }) => {
  const company = await Company.findOne({ _id: companyId });
  if (!company || company.smsMonthlyCapPaisa === null || company.smsMonthlyCapPaisa === undefined) {
    return { sent: false, reason: "sms_not_enabled" };
  }

  const monthStart = startOfCurrentMonth();
  const logsThisMonth = await SmsSendLog.find({ companyId, sentAt: { $gte: monthStart } });
  const spentPaisa = logsThisMonth.reduce((sum, l) => sum + l.costPaisa, 0);

  if (spentPaisa + SMS_COST_PAISA_PER_MESSAGE > company.smsMonthlyCapPaisa) {
    return { sent: false, reason: "cap_reached" };
  }

  const normalized = normalizePhone(to);
  if (apiConfigured()) {
    await sendViaSparrowApi({ to: normalized, text });
  } else {
    console.log(`[sms:stub] to=${normalized} text="${text}"`);
  }

  await SmsSendLog.create({ companyId, organizationId, costPaisa: SMS_COST_PAISA_PER_MESSAGE });
  return { sent: true };
};

module.exports = { sendSms };
```

- [ ] **Step 5: Add test-hook routes for direct `smsService` testing**

In `backend/routes/testHookRoutes.js`, add near the other DEV/TEST ONLY routes (`Company` is already imported at the top of this file — no new import needed for it):

```js
// DEV/TEST ONLY. Get a company's id by slug, for tests that need to
// directly configure company-level settings (e.g. the SMS cap).
router.post("/get-company", async (req, res, next) => {
  try {
    const { companySlug } = req.body;
    const company = await Company.findOne({ slug: String(companySlug || "").toLowerCase() });
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });
    res.json({ success: true, companyId: company._id.toString() });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Set (or clear, with null) a company's SMS monthly cap.
router.post("/set-sms-cap", async (req, res, next) => {
  try {
    const { companyId, smsMonthlyCapPaisa } = req.body;
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { $set: { smsMonthlyCapPaisa } },
      { new: true }
    );
    if (!company) return res.status(404).json({ success: false, message: "Company not found" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Call smsService.sendSms directly, decoupled from the
// trigger/broadcast callers, for cap/enablement assertions.
router.post("/send-sms", async (req, res, next) => {
  try {
    const { companyId, organizationId, to, text } = req.body;
    const { sendSms } = require("../services/smsService");
    const result = await sendSms({ companyId, organizationId, to, text });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// DEV/TEST ONLY. Read back this-calendar-month SmsSendLog count for a
// company, for cap assertions.
router.get("/sms-send-log-count", async (req, res, next) => {
  try {
    const SmsSendLog = require("../models/SmsSendLog");
    const count = await SmsSendLog.countDocuments({ companyId: req.query.companyId });
    res.status(200).json({ success: true, count });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 6: Create `backend/tests/sms-provider.js`**

```js
/**
 * SMS provider integration suite (Phase 5).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Covers the cap/enablement logic in smsService directly
 * via test-hook routes — Tasks 2/3 append trigger/Broadcast-specific
 * assertions to this same file.
 *
 * Run directly: `node tests/sms-provider.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeCompanyWithOutlet } = require("./helpers/makeOutlet");

async function getCompanyId(baseUrl, companySlug) {
  const resp = await fetch(`${baseUrl}/__test__/get-company`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companySlug }),
  });
  const body = await resp.json();
  return body.companyId;
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

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5055 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", body } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  try {
    const co = await makeCompanyWithOutlet(baseUrl, { label: `smsco${Date.now()}` });
    const companyId = await getCompanyId(baseUrl, co.companySlug);
    const organizationId = await getOrgId(baseUrl, co.companySlug, co.outletSlug);

    // No cap configured yet — SMS is not enabled for this company at all.
    const notEnabled = await api("/__test__/send-sms", {
      method: "POST",
      body: { companyId, organizationId, to: "+9779812345678", text: "hello" },
    });
    check("a company with no cap configured returns sms_not_enabled", notEnabled.body.sent === false && notEnabled.body.reason === "sms_not_enabled");

    const countAfterNotEnabled = await api(`/__test__/sms-send-log-count?companyId=${companyId}`);
    check("no SmsSendLog row is written when not enabled", countAfterNotEnabled.body.count === 0);

    // Configure a cap covering exactly 3 messages at the placeholder rate
    // (SMS_COST_PAISA_PER_MESSAGE = 100 paisa = NPR 1.00).
    await api("/__test__/set-sms-cap", { method: "POST", body: { companyId, smsMonthlyCapPaisa: 300 } });

    const send1 = await api("/__test__/send-sms", { method: "POST", body: { companyId, organizationId, to: "+9779812345671", text: "one" } });
    check("send 1 of 3 succeeds under the cap", send1.body.sent === true);
    const send2 = await api("/__test__/send-sms", { method: "POST", body: { companyId, organizationId, to: "+9779812345672", text: "two" } });
    check("send 2 of 3 succeeds under the cap", send2.body.sent === true);
    const send3 = await api("/__test__/send-sms", { method: "POST", body: { companyId, organizationId, to: "+9779812345673", text: "three" } });
    check("send 3 of 3 succeeds, exactly reaching the cap", send3.body.sent === true);

    const countAfterThree = await api(`/__test__/sms-send-log-count?companyId=${companyId}`);
    check("exactly 3 SmsSendLog rows exist after 3 successful sends", countAfterThree.body.count === 3);

    const send4 = await api("/__test__/send-sms", { method: "POST", body: { companyId, organizationId, to: "+9779812345674", text: "four" } });
    check("send 4 is refused: it would exceed the cap", send4.body.sent === false && send4.body.reason === "cap_reached");

    const countAfterFourth = await api(`/__test__/sms-send-log-count?companyId=${companyId}`);
    check("the refused 4th attempt writes no additional log row", countAfterFourth.body.count === 3);

    // Two outlets of the SAME company share one cap — a send at outlet B
    // counts against outlet A's remaining budget (company-level, not
    // outlet-level; design Decision 4). The cap is already exhausted from
    // the 3 sends above, so a send "at" this new second outlet must also
    // be refused.
    const secondOutletSlug = `second-${Date.now()}`;
    const secondOutlet = await fetch(`${baseUrl}/api/company/outlets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${co.ownerToken}` },
      body: JSON.stringify({
        name: "Second Outlet",
        slug: secondOutletSlug,
        category: "cafe",
        adminName: "Second Admin",
        adminEmail: `second-admin-${Date.now()}@test.com`,
        adminPassword: "password",
      }),
    }).then((r) => r.json());
    const secondOrgId = secondOutlet.outlet.id;

    const sendFromSecondOutlet = await api("/__test__/send-sms", {
      method: "POST",
      body: { companyId, organizationId: secondOrgId, to: "+9779812345675", text: "five" },
    });
    check("a second outlet of the SAME company shares the already-exhausted cap", sendFromSecondOutlet.body.sent === false && sendFromSecondOutlet.body.reason === "cap_reached");
  } finally {
    stop();
  }

  if (failures) { console.error(`sms-provider: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("sms-provider: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 7: Add the suite to `backend/package.json`'s test chain**

Append ` && node tests/sms-provider.js` to the end of the existing `"test"` script string in `backend/package.json` (after `node tests/broadcasts.js`).

- [ ] **Step 8: Run the suite**

Run: `cd backend && MONGODB_URI="" node tests/sms-provider.js`
Expected: `sms-provider: all PASS`, no FAIL lines.

- [ ] **Step 9: Commit**

```bash
git add backend/models/Company.js backend/models/SmsSendLog.js backend/config/platform.js backend/services/smsService.js backend/routes/testHookRoutes.js backend/tests/sms-provider.js backend/package.json
git commit -m "feat: add SMS provider integration core (Company cap, SmsSendLog, smsService)"
```

---

### Task 2: SMS as a third trigger channel

**Files:**
- Modify: `backend/services/messagingService.js`
- Modify: `backend/tests/sms-provider.js`

**Interfaces:**
- Consumes: `smsService.sendSms({companyId, organizationId, to, text})` (Task 1).
- Produces: nothing new — `sendTrigger`'s existing `{sent, reason}` return shape is unchanged.

- [ ] **Step 1: Add the `require` and the SMS branch to `sendTrigger`**

In `backend/services/messagingService.js`, add near the top:

```js
const { sendSms } = require("./smsService");
```

Change `sendTrigger` from:

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

to:

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

  // Awaited (unlike email/push above) because smsService's cap check must
  // resolve before this function can know whether to count it as sent —
  // there's no fire-and-forget shortcut for "was this within budget."
  if (customer.marketingConsent?.sms?.granted) {
    const result = await sendSms({
      companyId: organization.companyId,
      organizationId: organization._id,
      to: customer.phone,
      text: stripHtml(html)
    });
    if (result.sent) sent = true;
  }

  if (!sent) {
    return { sent: false, reason: "no_consent" };
  }

  await MessageLog.create({ organizationId: organization._id, userId: membership._id, triggerType: type });
  return { sent: true };
};
```

`MessageLog`'s shape is untouched — this matches design Decision 6: it stays existence-only, and a capped/not-enabled SMS attempt is simply one more reason `sent` might stay `false`, exactly like a withheld consent already is.

- [ ] **Step 2: Append trigger-SMS assertions to `backend/tests/sms-provider.js`**

Add near the top of the file, alongside the existing helpers:

```js
async function provisionTenantCustomer(baseUrl, label, phoneSuffix, company, outlet) {
  const email = `${label}_${Date.now()}@test.co`;
  const reg = await fetch(`${baseUrl}/api/customer-auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: label, email, password: "password123", phone: `+97798111100${phoneSuffix}` }),
  }).then((r) => r.json());
  const globalToken = reg.token;
  const entered = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Company-Slug": company, "X-Outlet-Slug": outlet, Authorization: `Bearer ${globalToken}` },
    body: JSON.stringify({}),
  }).then((r) => r.json());
  return { email, globalToken, tenantToken: entered.token, userId: entered.user.id };
}

async function getMessageLogCount(baseUrl, organizationId, userId, triggerType) {
  const resp = await fetch(`${baseUrl}/__test__/message-log-count`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, userId, triggerType }),
  });
  const body = await resp.json();
  return body.count;
}
```

Add this block inside `main()`'s `try`, right after the shared-cap assertion added in Task 1 Step 7 (before the `} finally { stop(); }` line):

```js
    // Trigger-path SMS: same company, cap already exhausted from the 3
    // sends earlier in this file — a milestone trigger with SMS consent
    // must be refused for the SMS channel, but the trigger overall still
    // reports sent:false/no_consent since SMS was its only granted channel.
    const smsCustomer = await provisionTenantCustomer(baseUrl, "SmsTrigger", "1", co.companySlug, co.outletSlug);
    await fetch(`${baseUrl}/api/customer-auth/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${smsCustomer.globalToken}` },
      body: JSON.stringify({ smsOptIn: true }),
    });

    const sendTriggerCapped = await api("/__test__/send-trigger", {
      method: "POST",
      body: { organizationId, userId: smsCustomer.userId, type: "milestone", context: { visitCount: 3 } },
    });
    check("a milestone trigger with only SMS consent, over a capped company, reports no_consent", sendTriggerCapped.body.sent === false && sendTriggerCapped.body.reason === "no_consent");

    const messageLogAfterCapped = await getMessageLogCount(baseUrl, organizationId, smsCustomer.userId, "milestone");
    check("no MessageLog row is written when the only granted channel was capped", messageLogAfterCapped === 0);

    // Raise the cap so the next attempt has room, then confirm a genuinely
    // successful SMS trigger send DOES write MessageLog, matching email/push.
    await api("/__test__/set-sms-cap", { method: "POST", body: { companyId, smsMonthlyCapPaisa: 100000 } });

    const sendTriggerSuccess = await api("/__test__/send-trigger", {
      method: "POST",
      body: { organizationId, userId: smsCustomer.userId, type: "milestone", context: { visitCount: 3 } },
    });
    check("a milestone trigger with SMS consent sends once the cap allows it", sendTriggerSuccess.body.sent === true);

    const messageLogAfterSuccess = await getMessageLogCount(baseUrl, organizationId, smsCustomer.userId, "milestone");
    check("MessageLog gets exactly one row for the successful SMS trigger send", messageLogAfterSuccess === 1);
```

- [ ] **Step 3: Run the suite, then the full backend regression suite**

Run: `cd backend && MONGODB_URI="" node tests/sms-provider.js`
Expected: `sms-provider: all PASS`.

Run: `cd backend && MONGODB_URI="" npm test`
Expected: every suite passes, in particular `messaging-triggers.js` (SMS being added must not change any of its existing email/push assertions).

- [ ] **Step 4: Commit**

```bash
git add backend/services/messagingService.js backend/tests/sms-provider.js
git commit -m "feat: add SMS as a third canned-trigger channel"
```

---

### Task 3: SMS as a `Broadcast` channel

**Files:**
- Modify: `backend/models/Broadcast.js`
- Modify: `backend/models/BroadcastLog.js`
- Modify: `backend/services/broadcastService.js`
- Modify: `backend/tests/sms-provider.js`

**Interfaces:**
- Consumes: `smsService.sendSms(...)` (Task 1).
- Produces: `Broadcast.channel` now accepts `"sms"`; `BroadcastLog.status` now accepts `"cap_reached"`.

- [ ] **Step 1: Widen the `Broadcast.channel` enum**

In `backend/models/Broadcast.js`, change:

```js
  channel: { type: String, enum: ["email", "push"], required: true },
```

to:

```js
  channel: { type: String, enum: ["email", "push", "sms"], required: true },
```

- [ ] **Step 2: Widen the `BroadcastLog.status` enum**

In `backend/models/BroadcastLog.js`, change:

```js
  status: { type: String, enum: ["sent", "failed", "no_consent"], required: true },
```

to:

```js
  // "cap_reached" covers BOTH a company with no SMS budget configured at
  // all and one that's exhausted its monthly cap — the admin's actionable
  // response is identical either way ("talk to the platform about your SMS
  // budget"), so these are collapsed into one status rather than a 5th
  // enum member (design Decision 7).
  status: { type: String, enum: ["sent", "failed", "no_consent", "cap_reached"], required: true },
```

- [ ] **Step 3: Widen `broadcastService.js`'s channel validation and dispatch**

Change:

```js
const CHANNELS = ["email", "push"];
```

to:

```js
const CHANNELS = ["email", "push", "sms"];
```

Change the error message in `parseInput` from `"Pick a channel: email or push.", 400` to `"Pick a channel: email, push, or SMS.", 400`.

Add the import near the top of `broadcastService.js`:

```js
const { sendSms } = require("./smsService");
```

Change `evaluateBroadcasts`'s channel dispatch from:

```js
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
```

to:

```js
    let status;
    if (broadcast.channel === "email") {
      try {
        await sendEmail({ to: customer.email, subject: broadcast.subject, html: `<p>${broadcast.body}</p>` });
        status = "sent";
      } catch (err) {
        console.error(`Broadcast email failed for ${customer.email}:`, err.message);
        status = "failed";
      }
    } else if (broadcast.channel === "push") {
      const subscriptions = await PushSubscription.find({ customerAccountId: customer._id });
      let anySucceeded = false;
      for (const sub of subscriptions) {
        const result = await sendPushToSubscription(sub, { title: broadcast.subject, body: broadcast.body });
        if (result.ok) anySucceeded = true;
      }
      status = anySucceeded ? "sent" : "failed";
    } else {
      const result = await sendSms({
        companyId: organization.companyId,
        organizationId: organization._id,
        to: customer.phone,
        text: broadcast.body
      });
      if (result.sent) status = "sent";
      else if (result.reason === "cap_reached" || result.reason === "sms_not_enabled") status = "cap_reached";
      else status = "failed";
    }
```

- [ ] **Step 4: Append Broadcast-SMS assertions to `backend/tests/sms-provider.js`**

Add this block inside `main()`'s `try`, right after Task 2's assertions (before `} finally { stop(); }`):

```js
    // Broadcast on the sms channel: a company with no cap configured logs
    // cap_reached (collapsed from sms_not_enabled), matching the admin's
    // "talk to the platform" framing regardless of which of the two
    // reasons actually applied.
    const noCapCo = await makeCompanyWithOutlet(baseUrl, { label: `smsbc${Date.now()}` });
    const noCapOrgId = await getOrgId(baseUrl, noCapCo.companySlug, noCapCo.outletSlug);

    const smsBroadcast = await fetch(`${baseUrl}/api/admin/broadcasts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${noCapCo.adminToken}` },
      body: JSON.stringify({ channel: "sms", segmentType: "all", subject: "SMS blast", body: "Hey via SMS." }),
    }).then((r) => r.json());
    const smsBroadcastId = smsBroadcast.broadcast.id;

    const smsBroadcastCustomer = await provisionTenantCustomer(baseUrl, "SmsBroadcast", "2", noCapCo.companySlug, noCapCo.outletSlug);
    await fetch(`${baseUrl}/api/customer-auth/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${smsBroadcastCustomer.globalToken}` },
      body: JSON.stringify({ smsOptIn: true }),
    });

    const genSmsBc = await fetch(`${baseUrl}/api/admin/generate-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${noCapCo.adminToken}` },
      body: JSON.stringify({ billAmount: 100 }),
    }).then((r) => r.json());
    await fetch(`${baseUrl}/api/points/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${smsBroadcastCustomer.tenantToken}` },
      body: JSON.stringify({ token: genSmsBc.data.token }),
    });

    const smsBroadcastDetail = await fetch(`${baseUrl}/api/admin/broadcasts/${smsBroadcastId}`, {
      headers: { Authorization: `Bearer ${noCapCo.adminToken}` },
    }).then((r) => r.json());
    check("an sms Broadcast for a company with no cap logs cap_reached (not failed)", smsBroadcastDetail.data.recipients.some((r) => r.userId === smsBroadcastCustomer.userId && r.status === "cap_reached"));

    // Now give this second company a cap and confirm a genuinely successful
    // SMS broadcast send logs "sent".
    const noCapCompanyId = await getCompanyId(baseUrl, noCapCo.companySlug);
    await api("/__test__/set-sms-cap", { method: "POST", body: { companyId: noCapCompanyId, smsMonthlyCapPaisa: 100000 } });

    const smsBroadcastCustomer2 = await provisionTenantCustomer(baseUrl, "SmsBroadcast2", "3", noCapCo.companySlug, noCapCo.outletSlug);
    await fetch(`${baseUrl}/api/customer-auth/preferences`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${smsBroadcastCustomer2.globalToken}` },
      body: JSON.stringify({ smsOptIn: true }),
    });
    const genSmsBc2 = await fetch(`${baseUrl}/api/admin/generate-qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${noCapCo.adminToken}` },
      body: JSON.stringify({ billAmount: 100 }),
    }).then((r) => r.json());
    await fetch(`${baseUrl}/api/points/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${smsBroadcastCustomer2.tenantToken}` },
      body: JSON.stringify({ token: genSmsBc2.data.token }),
    });

    const smsBroadcastDetail2 = await fetch(`${baseUrl}/api/admin/broadcasts/${smsBroadcastId}`, {
      headers: { Authorization: `Bearer ${noCapCo.adminToken}` },
    }).then((r) => r.json());
    check("an sms Broadcast for a capped-but-enabled company logs sent once budget allows it", smsBroadcastDetail2.data.recipients.some((r) => r.userId === smsBroadcastCustomer2.userId && r.status === "sent"));
```

- [ ] **Step 5: Run the suite, then the full backend regression suite**

Run: `cd backend && MONGODB_URI="" node tests/sms-provider.js`
Expected: `sms-provider: all PASS`.

Run: `cd backend && MONGODB_URI="" npm test`
Expected: every suite passes, in particular `broadcasts.js` (the widened enums must not change any of its existing email/push assertions).

- [ ] **Step 6: Commit**

```bash
git add backend/models/Broadcast.js backend/models/BroadcastLog.js backend/services/broadcastService.js backend/tests/sms-provider.js
git commit -m "feat: add SMS as a Broadcast channel"
```

---

### Task 4: Platform admin sets the per-company SMS cap

**Files:**
- Modify: `backend/services/platformService.js`
- Modify: `backend/controllers/platformController.js`
- Modify: `frontend/src/routes/platform/Companies.tsx`
- Modify: `frontend/src/routes/platform/CompanyDetail.tsx`
- Modify: `backend/tests/sms-provider.js`

**Interfaces:**
- Consumes: `PATCH /api/platform/companies/:id` (already exists — extended, not replaced).
- Produces: `Company.smsMonthlyCapPaisa` becomes settable/readable through the existing platform company-edit surface.

- [ ] **Step 1: Accept `smsMonthlyCapPaisa` in `updateCompany`**

In `backend/services/platformService.js`, change the function signature from:

```js
const updateCompany = async (id, { name, status, ownerEmail, programDefaults, actorId, actorName }) => {
```

to:

```js
const updateCompany = async (id, { name, status, ownerEmail, programDefaults, smsMonthlyCapPaisa, actorId, actorName }) => {
```

Add validation right after the existing `status` validation block:

```js
  if (smsMonthlyCapPaisa !== undefined && smsMonthlyCapPaisa !== null) {
    const cap = Number(smsMonthlyCapPaisa);
    if (!Number.isFinite(cap) || cap < 0) {
      throw createHttpError("smsMonthlyCapPaisa must be a non-negative number, or null.", 400);
    }
  }
```

Add the field to the `updates` object, right after the existing `if (status !== undefined) updates.status = status;` line:

```js
  if (smsMonthlyCapPaisa !== undefined) {
    updates.smsMonthlyCapPaisa = smsMonthlyCapPaisa === null ? null : Number(smsMonthlyCapPaisa);
  }
```

Add to the audit-log `changeParts` array, right after the existing `name` line:

```js
  if (updates.smsMonthlyCapPaisa !== undefined) {
    changeParts.push(`SMS cap → ${updates.smsMonthlyCapPaisa === null ? "disabled" : `${updates.smsMonthlyCapPaisa} paisa/month`}`);
  }
```

- [ ] **Step 2: Expose `smsMonthlyCapPaisa` in `buildCompanyStats`**

In `backend/services/platformService.js`'s `buildCompanyStats`, add right after the existing `programDefaults: company.programDefaults,` line:

```js
    smsMonthlyCapPaisa: company.smsMonthlyCapPaisa ?? null,
```

- [ ] **Step 3: Pass the field through `patchCompany`**

In `backend/controllers/platformController.js`, change:

```js
const patchCompany = async (req, res, next) => {
  try {
    const { name, status, ownerEmail, programDefaults } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await updateCompany(req.params.id, {
      name,
      status,
      ownerEmail,
      programDefaults,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

to:

```js
const patchCompany = async (req, res, next) => {
  try {
    const { name, status, ownerEmail, programDefaults, smsMonthlyCapPaisa } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await updateCompany(req.params.id, {
      name,
      status,
      ownerEmail,
      programDefaults,
      smsMonthlyCapPaisa,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

- [ ] **Step 4: Add the field to the frontend `Company` type**

In `frontend/src/routes/platform/Companies.tsx`, add to the `Company` interface right after `programDefaults`:

```ts
  /** Paisa (1/100 rupee), the monthly SMS spend ceiling. Null = SMS not enabled for this company. */
  smsMonthlyCapPaisa: number | null;
```

- [ ] **Step 5: Add the SMS budget field to `CompanyDetail.tsx`**

Add a new piece of state right after the existing `earnPercent` state:

```ts
  const [smsCapRupees, setSmsCapRupees] = useState<string>("");
```

In the `useEffect` that seeds form state from `company`, add right after the existing `setEarnPercent(...)` line:

```ts
      setSmsCapRupees(company.smsMonthlyCapPaisa === null ? "" : String(company.smsMonthlyCapPaisa / 100));
```

Change the `update` mutation's type parameter and the `saveDetails` function's `patch` type to include `smsMonthlyCapPaisa?: number | null` alongside the existing fields (both the `useMutation<...>` generic and the local `patch` variable's inline type in `saveDetails`).

In `saveDetails`, add right after the existing `earnPercent` diff-check block:

```ts
    const currentCapRupees = company.smsMonthlyCapPaisa === null ? "" : String(company.smsMonthlyCapPaisa / 100);
    if (smsCapRupees !== currentCapRupees) {
      patch.smsMonthlyCapPaisa = smsCapRupees.trim() === "" ? null : Math.round(Number(smsCapRupees) * 100);
    }
```

Add a new field block in the JSX, right after the existing "Loyalty program" `<div>` block (still inside the `{isOwner && (...)}` guard it lives in, as its own sibling card):

```tsx
      {isOwner && (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-ambient">
          <h3 className="font-display text-lg font-bold text-[var(--ink)]">SMS budget</h3>
          <p className="mb-3 text-[13px] text-[var(--muted)]">
            Leave blank to keep SMS disabled for this company. A monthly rupee ceiling covers every
            outlet under it combined — once spend for the current month reaches it, further SMS
            sends are skipped until next month.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--muted)]">Rs</span>
            <input
              value={smsCapRupees}
              onChange={(e) => setSmsCapRupees(e.target.value)}
              type="number"
              min={0}
              placeholder="Disabled"
              className="w-28 rounded-[var(--radius-btn)] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
            <span className="text-sm text-[var(--muted)]">per month</span>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Append a platform-cap-config test to `backend/tests/sms-provider.js`**

Add this block inside `main()`'s `try`, right after Task 3's assertions (before `} finally { stop(); }`) — logs in as the seeded platform admin and confirms the PATCH endpoint itself works end-to-end (the earlier steps in this file used the `/__test__/set-sms-cap` shortcut; this step proves the real admin-facing path too):

```js
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    const capViaPlatformApi = await fetch(`${baseUrl}/api/platform/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${platformToken}` },
      body: JSON.stringify({ smsMonthlyCapPaisa: 5000 }),
    }).then((r) => r.json());
    check("PATCH /api/platform/companies/:id sets smsMonthlyCapPaisa", capViaPlatformApi.company.smsMonthlyCapPaisa === 5000);

    const capViaPlatformApiCleared = await fetch(`${baseUrl}/api/platform/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${platformToken}` },
      body: JSON.stringify({ smsMonthlyCapPaisa: null }),
    }).then((r) => r.json());
    check("PATCH /api/platform/companies/:id can clear the cap back to disabled (null)", capViaPlatformApiCleared.company.smsMonthlyCapPaisa === null);
```

- [ ] **Step 7: Run the suite, the full backend regression suite, and the frontend typecheck**

Run: `cd backend && MONGODB_URI="" node tests/sms-provider.js`
Expected: `sms-provider: all PASS`.

Run: `cd backend && MONGODB_URI="" npm test`
Expected: every suite passes, in particular `platform-company-edit.js`.

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/services/platformService.js backend/controllers/platformController.js frontend/src/routes/platform/Companies.tsx frontend/src/routes/platform/CompanyDetail.tsx backend/tests/sms-provider.js
git commit -m "feat: let the platform admin set a per-company SMS budget"
```

---

### Task 5: SMS consent capture UI + `AdminBroadcasts` sms channel option + manual verification

**Files:**
- Modify: `backend/services/customerAccountService.js`
- Modify: `backend/controllers/customerAccountController.js`
- Modify: `frontend/src/context/CustomerAuthContext.tsx`
- Modify: `frontend/src/components/customer/AuthView.tsx`
- Modify: `frontend/src/routes/ClaimLanding.tsx`
- Modify: `frontend/src/components/customer/CustomerProfilePanel.tsx`
- Modify: `frontend/src/hooks/useBroadcasts.ts`
- Modify: `frontend/src/routes/admin/AdminBroadcasts.tsx`
- Modify: `backend/tests/sms-provider.js`

**Interfaces:**
- Consumes: `CustomerAccount.marketingConsent.sms` (already exists in the schema, unused until this task).
- Produces: nothing consumed by a later task — this is the last task.

- [ ] **Step 1: Backend — accept `marketingSmsConsent` at registration**

In `backend/services/customerAccountService.js`, change `registerAccount`'s destructured params from:

```js
const registerAccount = async ({ name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent }) => {
```

to:

```js
const registerAccount = async ({ name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent, marketingSmsConsent }) => {
```

Change the `CustomerAccount.create(...)` call from:

```js
  const account = await CustomerAccount.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone.trim(),
    emailVerified: false,
    ...(marketingEmailConsent ? { marketingConsent: { email: { granted: true, updatedAt: new Date() } } } : {})
  });
```

to:

```js
  const marketingConsent = {};
  if (marketingEmailConsent) marketingConsent.email = { granted: true, updatedAt: new Date() };
  if (marketingSmsConsent) marketingConsent.sms = { granted: true, updatedAt: new Date() };

  const account = await CustomerAccount.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    phone: phone.trim(),
    emailVerified: false,
    ...(Object.keys(marketingConsent).length ? { marketingConsent } : {})
  });
```

In `backend/controllers/customerAccountController.js`, change the `register` controller from:

```js
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent } = req.body;
    const result = await registerAccount({ name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
```

to:

```js
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent, marketingSmsConsent } = req.body;
    const result = await registerAccount({ name, email, password, phone, pendingClaimId, claimSecret, marketingEmailConsent, marketingSmsConsent });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
```

- [ ] **Step 2: Backend — accept `smsOptIn` in `updatePreferences`**

In `backend/services/customerAccountService.js`, change `updatePreferences`'s destructured params from:

```js
const updatePreferences = async ({ customerAccountId, emailOptIn, birthdayMonth, birthdayDay }) => {
```

to:

```js
const updatePreferences = async ({ customerAccountId, emailOptIn, smsOptIn, birthdayMonth, birthdayDay }) => {
```

Add, right after the existing `emailOptIn` block:

```js
  if (smsOptIn !== undefined) {
    account.marketingConsent.sms = { granted: Boolean(smsOptIn), updatedAt: new Date() };
  }
```

In `backend/controllers/customerAccountController.js`, change `updatePreferencesController` from:

```js
const updatePreferencesController = async (req, res, next) => {
  try {
    const { emailOptIn, birthdayMonth, birthdayDay } = req.body;
    const result = await updatePreferences({
      customerAccountId: req.customerAccount.id,
      emailOptIn,
      birthdayMonth,
      birthdayDay
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

to:

```js
const updatePreferencesController = async (req, res, next) => {
  try {
    const { emailOptIn, smsOptIn, birthdayMonth, birthdayDay } = req.body;
    const result = await updatePreferences({
      customerAccountId: req.customerAccount.id,
      emailOptIn,
      smsOptIn,
      birthdayMonth,
      birthdayDay
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
```

- [ ] **Step 3: Frontend — `CustomerAuthContext.tsx`'s `registerUser` gains `marketingSmsConsent`**

Change the `registerUser` type in the context interface from:

```ts
  registerUser: (
    name: string,
    email: string,
    password: string,
    phone: string,
    marketingEmailConsent?: boolean,
    pendingClaimId?: string,
    claimSecret?: string,
  ) => Promise<void>;
```

to:

```ts
  registerUser: (
    name: string,
    email: string,
    password: string,
    phone: string,
    marketingEmailConsent?: boolean,
    marketingSmsConsent?: boolean,
    pendingClaimId?: string,
    claimSecret?: string,
  ) => Promise<void>;
```

Change the `registerUser` implementation from:

```ts
  const registerUser = async (
    name: string,
    email: string,
    password: string,
    phone: string,
    marketingEmailConsent?: boolean,
    pendingClaimId?: string,
    claimSecret?: string,
  ) => {
    const res = await apiRequest<{ success: boolean; token?: string; account?: GlobalAccount; message: string }>(
      "/api/customer-auth/register",
      { method: "POST", body: { name, email, password, phone, marketingEmailConsent, pendingClaimId, claimSecret } },
    );
```

to:

```ts
  const registerUser = async (
    name: string,
    email: string,
    password: string,
    phone: string,
    marketingEmailConsent?: boolean,
    marketingSmsConsent?: boolean,
    pendingClaimId?: string,
    claimSecret?: string,
  ) => {
    const res = await apiRequest<{ success: boolean; token?: string; account?: GlobalAccount; message: string }>(
      "/api/customer-auth/register",
      { method: "POST", body: { name, email, password, phone, marketingEmailConsent, marketingSmsConsent, pendingClaimId, claimSecret } },
    );
```

- [ ] **Step 4: Frontend — `ClaimLanding.tsx`'s call site gains the new positional arg**

Change:

```tsx
      await registerUser(
        name, email, password, phone,
        undefined,
        pendingClaimId ?? undefined,
        claimSecret ?? undefined,
      );
```

to:

```tsx
      await registerUser(
        name, email, password, phone,
        undefined,
        undefined,
        pendingClaimId ?? undefined,
        claimSecret ?? undefined,
      );
```

- [ ] **Step 5: Frontend — `AuthView.tsx`'s register form gains an SMS checkbox**

In the `registerSchema`, add right after the existing `emailOptIn: z.boolean().default(false),` line:

```ts
  smsOptIn: z.boolean().default(false),
```

In the `registerForm`'s `defaultValues`, add `smsOptIn: false` alongside the existing `emailOptIn: false`.

In `onRegisterSubmit` (the function calling `registerUser`), change:

```tsx
      await registerUser(data.name, data.email, data.password, `+977${local}`, data.emailOptIn);
```

to:

```tsx
      await registerUser(data.name, data.email, data.password, `+977${local}`, data.emailOptIn, data.smsOptIn);
```

Add a second checkbox in the JSX, right after the existing email opt-in `<label>` block:

```tsx
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={registerForm.watch("smsOptIn")}
              onChange={(e) => registerForm.setValue("smsOptIn", e.target.checked)}
            />
            Send me offers and updates by SMS
          </label>
```

- [ ] **Step 6: Frontend — `CustomerProfilePanel.tsx` gains an SMS opt-in card**

Add state right after the existing `emailOptIn`/`savingEmailOptIn` lines:

```tsx
  const [smsOptIn, setSmsOptIn] = useState(globalAccount?.marketingConsent?.sms?.granted ?? false);
  const [savingSmsOptIn, setSavingSmsOptIn] = useState(false);
```

Add a handler right after the existing `saveEmailOptIn` function:

```tsx
  const saveSmsOptIn = async (next: boolean) => {
    setSmsOptIn(next);
    setSavingSmsOptIn(true);
    try {
      const res = await apiRequest<{ success: boolean; account: GlobalAccount }>(
        "/api/customer-auth/preferences",
        { method: "PATCH", role: "customer-global", body: { smsOptIn: next } },
      );
      setGlobalAccountData(res.account);
      toast.success(next ? "You're opted in!" : "Opted out.");
    } catch (err) {
      setSmsOptIn(!next);
      toast.error((err as Error).message || "Couldn't update that — try again.");
    } finally {
      setSavingSmsOptIn(false);
    }
  };
```

Add a new `<Card>` in the JSX, right after the existing "Email updates" card:

```tsx
      <Card title="SMS updates">
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={smsOptIn}
            disabled={savingSmsOptIn}
            onChange={(e) => saveSmsOptIn(e.target.checked)}
          />
          Send me offers and updates by SMS
        </label>
      </Card>
```

- [ ] **Step 7: Frontend — `useBroadcasts.ts` and `AdminBroadcasts.tsx` gain the sms channel option**

In `frontend/src/hooks/useBroadcasts.ts`, change every `"email" | "push"` channel type occurrence (in `Broadcast`, `BroadcastDraft`, and `BroadcastRecipient["status"]`'s sibling `Broadcast["channel"]`) to `"email" | "push" | "sms"`. Also widen `BroadcastRecipient["status"]` from `"sent" | "failed" | "no_consent"` to `"sent" | "failed" | "no_consent" | "cap_reached"`.

In `frontend/src/routes/admin/AdminBroadcasts.tsx`'s `BroadcastFields` component, add a third `<option>` to the channel `<select>`, right after the existing "Push notification" one:

```tsx
          <option value="sms">SMS</option>
```

In `BroadcastDetailPanel`'s status badge rendering, change the ternary from:

```tsx
                style={
                  r.status === "sent"
                    ? { background: "var(--ok-soft)", color: "var(--ok)" }
                    : r.status === "failed"
                      ? { background: "var(--err-soft)", color: "var(--err)" }
                      : { background: "var(--surface-2)", color: "var(--soft)" }
                }
              >
                {r.status === "no_consent" ? "No consent" : r.status}
```

to:

```tsx
                style={
                  r.status === "sent"
                    ? { background: "var(--ok-soft)", color: "var(--ok)" }
                    : r.status === "failed"
                      ? { background: "var(--err-soft)", color: "var(--err)" }
                      : r.status === "cap_reached"
                        ? { background: "var(--warn-soft)", color: "var(--warn)" }
                        : { background: "var(--surface-2)", color: "var(--soft)" }
                }
              >
                {r.status === "no_consent" ? "No consent" : r.status === "cap_reached" ? "Budget reached" : r.status}
```

- [ ] **Step 8: Run the frontend typecheck**

Run: `cd frontend && npm run lint`
Expected: no errors.

- [ ] **Step 9: Run the full backend regression suite**

Run: `cd backend && MONGODB_URI="" npm test`
Expected: every suite passes.

- [ ] **Step 10: Manual verification in the browser**

Start the backend (`MONGODB_URI="" node server.js` from `backend/`) and the frontend (`npm run dev` from `frontend/`) in the worktree, then `preview_start({url:...})` against the manually-started servers (the harness's `preview_start({name:...})` launches from the main checkout, not this worktree — the same workaround used in Phases 3b and 4).

1. Register a new customer at `/coffesarowar/durbarmarg/customer-register`: confirm the SMS opt-in checkbox appears alongside the email one.
2. Sign in as that customer, open Profile: confirm the "SMS updates" card appears between "Email updates" and "Push notifications", toggle it, confirm the toast and persisted state after reload.
3. Sign in as `durbarmarg@coffesarowar.com` / `password`, open Broadcasts: confirm "SMS" appears in the channel dropdown when creating a broadcast. Since `coffesarowar` has no SMS cap configured, create an sms-channel broadcast, trigger a match (an earn), and confirm its detail view shows a "Budget reached" badge rather than "Failed" for the matched customer.
4. Sign in as the platform admin (`admin@stampd.co` / `password`), open the Coffesarowar company detail page: confirm the "SMS budget" field appears, set it to a small rupee value, save, and confirm it persists on reload.

- [ ] **Step 11: Commit**

```bash
git add backend/services/customerAccountService.js backend/controllers/customerAccountController.js frontend/src/context/CustomerAuthContext.tsx frontend/src/components/customer/AuthView.tsx frontend/src/routes/ClaimLanding.tsx frontend/src/components/customer/CustomerProfilePanel.tsx frontend/src/hooks/useBroadcasts.ts frontend/src/routes/admin/AdminBroadcasts.tsx
git commit -m "feat: add SMS consent capture UI and Broadcast sms channel option"
```

---

## After all tasks

Run the full backend regression suite once more (`cd backend && MONGODB_URI="" npm test`) and the frontend typecheck (`cd frontend && npm run lint`), then invoke `superpowers:finishing-a-development-branch`.

**Before this ships to real customers:** get a real Sparrow SMS (or alternative aggregator) account, verify `smsService.sendViaSparrowApi`'s request/response shape against it, and update `SMS_COST_PAISA_PER_MESSAGE` to the actual contracted rate. Every test in this plan passes using the dev/test stub path and does not touch the real API.

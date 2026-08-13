/**
 * SMS provider integration suite (Phase 5).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Covers the cap/enablement logic in smsService directly
 * via test-hook routes, plus trigger-path, Broadcast-path, and platform-cap
 * config assertions.
 *
 * Run directly: `node tests/sms-provider.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeCompanyWithOutlet, makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

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

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
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
    const companyId = await getCompanyId(baseUrl, COMPANY);
    const organizationId = await getOrgId(baseUrl, COMPANY, SLUG);

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
    // outlet-level). The cap is already exhausted from the 3 sends above,
    // so a send "at" this new second outlet must also be refused. Uses
    // makeSiblingOutlet (the seeded coffesarowar company's comped plan has
    // slots to spare) rather than a freshly-registered company, whose
    // default plan only allows 1 outlet.
    const sibling = await makeSiblingOutlet(baseUrl, { label: `sms${Date.now()}` });
    const secondOrgId = await getOrgId(baseUrl, COMPANY, sibling.outletSlug);

    const sendFromSecondOutlet = await api("/__test__/send-sms", {
      method: "POST",
      body: { companyId, organizationId: secondOrgId, to: "+9779812345675", text: "five" },
    });
    check("a second outlet of the SAME company shares the already-exhausted cap", sendFromSecondOutlet.body.sent === false && sendFromSecondOutlet.body.reason === "cap_reached");

    // --- trigger-path SMS ---

    const smsCustomer = await provisionTenantCustomer(baseUrl, "SmsTrigger", "1", COMPANY, SLUG);
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

    // --- Broadcast-path SMS ---

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

    void noCapOrgId;

    // --- platform admin cap config ---

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
  } finally {
    stop();
  }

  if (failures) { console.error(`sms-provider: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("sms-provider: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

/**
 * Messaging foundation (email) suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms new schema fields default correctly, then
 * grows across later tasks to cover consent, preferences, trigger config,
 * and the two trigger mechanisms.
 *
 * Run directly: `node tests/messaging-triggers.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function getMessageLogCount(baseUrl, organizationId, userId, triggerType) {
  const resp = await fetch(`${baseUrl}/__test__/message-log-count`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, userId, triggerType }),
  });
  const body = await resp.json();
  return body.count;
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

// The real flow for a customer with BOTH a CustomerAccount (owns consent/
// birthday) and a working outlet membership (owns earn/redeem history) —
// tenant-scoped /api/auth/register does NOT set customerAccountId, so a
// customer registered that way has no linked CustomerAccount at all.
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

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5032 });
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

    const settings = await api("/api/admin/settings", { token: adminToken });
    check(
      "messagingTriggers defaults to off (milestone/inactivity null, birthday false)",
      settings.body.settings.messagingTriggers?.milestone?.visitCount === null &&
        settings.body.settings.messagingTriggers?.inactivity?.days === null &&
        settings.body.settings.messagingTriggers?.birthday?.enabled === false
    );

    const emailOptedIn = `msg_optin_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      slug: null,
      body: { name: "Opted In", email: emailOptedIn, password: "password123", phone: "9811110001", marketingEmailConsent: true },
    });
    const optedInLogin = await api("/api/customer-auth/login", { method: "POST", slug: null, body: { email: emailOptedIn, password: "password123" } });
    check("registering with marketingEmailConsent:true grants email consent", optedInLogin.body.account?.marketingConsent?.email?.granted === true);

    const emailOptedOut = `msg_optout_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      slug: null,
      body: { name: "Opted Out", email: emailOptedOut, password: "password123", phone: "9811110002" },
    });
    const optedOutLogin = await api("/api/customer-auth/login", { method: "POST", slug: null, body: { email: emailOptedOut, password: "password123" } });
    check("registering without marketingEmailConsent leaves email consent false", optedOutLogin.body.account?.marketingConsent?.email?.granted === false);

    const prefsToken = optedOutLogin.body.token;
    const setEmailOn = await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: prefsToken,
      slug: null,
      body: { emailOptIn: true },
    });
    check("PATCH preferences turns email consent on", setEmailOn.body.account?.marketingConsent?.email?.granted === true);

    const setBirthday = await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: prefsToken,
      slug: null,
      body: { birthdayMonth: 5, birthdayDay: 20 },
    });
    check("PATCH preferences sets birthday", setBirthday.body.account?.birthdayMonth === 5 && setBirthday.body.account?.birthdayDay === 20);
    check("PATCH preferences with only birthday leaves email consent untouched", setBirthday.body.account?.marketingConsent?.email?.granted === true);

    const patchTriggers = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { messagingTriggers: { milestone: { visitCount: 3 }, inactivity: { days: 30 }, birthday: { enabled: true } } },
    });
    check("PATCH settings sets milestone visitCount", patchTriggers.body.settings.messagingTriggers?.milestone?.visitCount === 3);
    check("PATCH settings sets inactivity days", patchTriggers.body.settings.messagingTriggers?.inactivity?.days === 30);
    check("PATCH settings sets birthday enabled", patchTriggers.body.settings.messagingTriggers?.birthday?.enabled === true);

    const orgId = await getOrgId(baseUrl, COMPANY, SLUG);

    const consentedCustomer = await provisionTenantCustomer(api, "SendConsented", "10");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: consentedCustomer.globalToken, slug: null, body: { emailOptIn: true } });

    const sendTriggerResp = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: consentedCustomer.userId, type: "milestone", context: { visitCount: 3 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("test-hook send-trigger -> 200", sendTriggerResp.status === 200);
    check("sendTrigger sends when consent is granted", sendTriggerResp.body.sent === true);

    const noConsentCustomer = await provisionTenantCustomer(api, "SendNoConsent", "11");
    const sendTriggerNoConsent = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: noConsentCustomer.userId, type: "milestone", context: { visitCount: 3 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("sendTrigger refuses when consent is not granted", sendTriggerNoConsent.body.sent === false && sendTriggerNoConsent.body.reason === "no_consent");

    const milestoneCustomer = await provisionTenantCustomer(api, "Milestone", "12");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: milestoneCustomer.globalToken, slug: null, body: { emailOptIn: true } });

    for (let i = 0; i < 3; i += 1) {
      const gen = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
      await api("/api/points/claim", { method: "POST", token: milestoneCustomer.tenantToken, body: { token: gen.body.data.token } });
    }
    const countAfterThree = await getMessageLogCount(baseUrl, orgId, milestoneCustomer.userId, "milestone");
    check("milestone trigger fires exactly once at the 3rd visit", countAfterThree === 1);

    const gen4 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: milestoneCustomer.tenantToken, body: { token: gen4.body.data.token } });
    const countAfterFour = await getMessageLogCount(baseUrl, orgId, milestoneCustomer.userId, "milestone");
    check("milestone trigger does not re-fire on the 4th visit", countAfterFour === 1);

    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { messagingTriggers: { birthday: { enabled: true } } } });

    const today = new Date();
    const birthdayCustomer = await provisionTenantCustomer(api, "Birthday", "13");
    await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: birthdayCustomer.globalToken,
      slug: null,
      body: { emailOptIn: true, birthdayMonth: today.getMonth() + 1, birthdayDay: today.getDate() },
    });

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const birthdayCountAfterFirstRun = await getMessageLogCount(baseUrl, orgId, birthdayCustomer.userId, "birthday");
    check("birthday trigger fires on a matching real date", birthdayCountAfterFirstRun === 1);

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const birthdayCountAfterSecondRun = await getMessageLogCount(baseUrl, orgId, birthdayCustomer.userId, "birthday");
    check("birthday trigger does not re-fire the same day (idempotent)", birthdayCountAfterSecondRun === 1);

    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { messagingTriggers: { inactivity: { days: 10 } } } });

    const inactiveCustomer = await provisionTenantCustomer(api, "Inactive", "14");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: inactiveCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const genI = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 200 } });
    await api("/api/points/claim", { method: "POST", token: inactiveCustomer.tenantToken, body: { token: genI.body.data.token } });

    await fetch(`${baseUrl}/__test__/backdate-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: inactiveCustomer.userId, days: 15 }),
    });

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const inactivityCountAfterFirstRun = await getMessageLogCount(baseUrl, orgId, inactiveCustomer.userId, "inactivity");
    check("inactivity trigger fires once past the configured threshold", inactivityCountAfterFirstRun === 1);

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const inactivityCountAfterSecondRun = await getMessageLogCount(baseUrl, orgId, inactiveCustomer.userId, "inactivity");
    check("inactivity trigger does not re-fire within the cooldown window", inactivityCountAfterSecondRun === 1);

    // Per-outlet isolation: a sibling outlet with NEITHER trigger configured
    // must never fire, even for a customer whose birthday/inactivity would
    // otherwise match.
    const sibling = await makeSiblingOutlet(baseUrl, { label: `msg${Date.now()}` });
    const siblingOrgId = await getOrgId(baseUrl, COMPANY, sibling.outletSlug);
    const siblingCustomer = await provisionTenantCustomer(api, "SiblingBirthday", "15", sibling.outletSlug);
    await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: siblingCustomer.globalToken,
      slug: null,
      body: { emailOptIn: true, birthdayMonth: today.getMonth() + 1, birthdayDay: today.getDate() },
    });

    await api("/__test__/run-daily-triggers", { method: "POST", body: {} });
    const siblingBirthdayCount = await getMessageLogCount(baseUrl, siblingOrgId, siblingCustomer.userId, "birthday");
    check("a sibling outlet with birthday trigger unconfigured never fires, even for a matching birthday", siblingBirthdayCount === 0);
  } finally {
    stop();
  }

  if (failures) { console.error(`messaging-triggers: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("messaging-triggers: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

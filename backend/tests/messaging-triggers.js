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

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

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
  } finally {
    stop();
  }

  if (failures) { console.error(`messaging-triggers: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("messaging-triggers: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

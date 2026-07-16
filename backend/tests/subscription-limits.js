/**
 * Subscription outlet-limit + lazy expiry/grace suite. Self-contained: boots
 * its own server on a dedicated port against the in-memory mock DB.
 *
 * Covers: a newly registered company gets a 14-day/1-outlet trial; it can
 * create exactly one outlet, then a second is blocked with
 * OUTLET_LIMIT_REACHED; within the grace window (past currentPeriodEnd but
 * before GRACE_PERIOD_DAYS) adding still works; past grace it's blocked with
 * SUBSCRIPTION_EXPIRED; the reminder appears only within
 * EXPIRY_REMINDER_DAYS.
 *
 * Run directly: `node tests/subscription-limits.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeCompanyWithOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5029 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const addOutlet = (token, label) =>
    api("/api/company/outlets", {
      method: "POST",
      token,
      body: {
        name: `Outlet ${label}`,
        slug: `o-${label}`,
        category: "cafe",
        adminName: `Admin ${label}`,
        adminEmail: `a-${label}@test.com`,
        adminPassword: "password",
      },
    });

  try {
    // 1. A fresh company is on a trial, with no outlets yet.
    const stamp = Date.now();
    const a = await makeCompanyWithOutlet(baseUrl, { label: `lim-a-${stamp}`, withOutlet: false });
    const subA = await api("/api/company/subscription", { token: a.ownerToken });
    check("company A subscription reachable -> 200", subA.status === 200);
    check("company A is trialing", subA.body?.subscription?.effectiveStatus === "trialing");
    check("company A trial limit is 1 outlet", subA.body?.subscription?.outletLimitAtPurchase === 1);
    check("company A starts with 0 outlets", subA.body?.subscription?.outletCount === 0);

    // 2. It can create its one allowed outlet...
    const first = await addOutlet(a.ownerToken, `a1-${stamp}`);
    check("company A creates its 1st outlet -> 201", first.status === 201);

    // 3. ...and no more.
    const second = await addOutlet(a.ownerToken, `a2-${stamp}`);
    check("company A blocked from a 2nd outlet -> 402", second.status === 402);
    check("...with OUTLET_LIMIT_REACHED", second.body?.code === "OUTLET_LIMIT_REACHED");

    // 4. Grace: push company B 2 days past its period end (grace is 5).
    const b = await makeCompanyWithOutlet(baseUrl, { label: `lim-b-${stamp}`, withOutlet: false });
    const decodeJwt = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64").toString());
    const companyBId = decodeJwt(b.ownerToken).companyId;

    const graceExpire = await api("/__test__/expire-subscription", {
      method: "POST",
      body: { companyId: companyBId, daysAgo: 2 },
    });
    check("test hook pushes company B 2 days past period end", graceExpire.status === 200);

    const subBGrace = await api("/api/company/subscription", { token: b.ownerToken });
    check("company B's effective status is 'grace'", subBGrace.body?.subscription?.effectiveStatus === "grace");

    const duringGrace = await addOutlet(b.ownerToken, `b1-${stamp}`);
    check("company B CAN still create an outlet during grace -> 201", duringGrace.status === 201);

    // 5. Past grace: blocked, and the code proves it's expiry that fired
    // rather than the (also-reached) outlet limit.
    const pastGrace = await api("/__test__/expire-subscription", {
      method: "POST",
      body: { companyId: companyBId, daysAgo: 10 },
    });
    check("test hook pushes company B 10 days past period end", pastGrace.status === 200);

    const subBExpired = await api("/api/company/subscription", { token: b.ownerToken });
    check("company B's effective status is 'expired'", subBExpired.body?.subscription?.effectiveStatus === "expired");
    check("company B's reminder shows (past due)", subBExpired.body?.reminder?.show === true);

    const afterExpiry = await addOutlet(b.ownerToken, `b2-${stamp}`);
    check("company B blocked after real expiry -> 402", afterExpiry.status === 402);
    check("...with SUBSCRIPTION_EXPIRED, not the limit code", afterExpiry.body?.code === "SUBSCRIPTION_EXPIRED");

    // 6. A fresh trial (14 days out) is well outside the reminder window.
    const subAReminder = await api("/api/company/subscription", { token: a.ownerToken });
    check("company A (14 days left) shows no reminder yet", subAReminder.body?.reminder?.show === false);

    // 7. Billing is the company owner's job alone: an OUTLET ADMIN's tenant
    // JWT must not reach the company's subscription.
    const outletAdminEmail = `a-a1-${stamp}@test.com`;
    const mintAdmin = await api("/__test__/mint-admin-token", {
      method: "POST",
      body: { email: outletAdminEmail, type: "email_verify" },
    });
    await api(`/api/admin-auth/verify-email?token=${mintAdmin.body.token}`);
    const outletAdminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: outletAdminEmail, password: "password" },
    });
    check("the new outlet's admin can sign in once verified", outletAdminLogin.status === 200);
    const outletAdminProbe = await api("/api/company/subscription", { token: outletAdminLogin.body.token });
    check("an outlet admin cannot read the company's subscription -> 401", outletAdminProbe.status === 401);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll subscription-limits checks passed.");
  }
}

main();

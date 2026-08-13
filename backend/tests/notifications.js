/**
 * Notification center (outlet admin console).
 *
 * Covers: a redemption and a customer's first-ever arrival at an outlet
 * each create exactly one notification, scoped to that outlet; a second
 * visit by the same customer does not create a second new_customer
 * notification; the same customer's first visit to a DIFFERENT outlet
 * does; the read API never leaks another outlet's rows; mark-read and
 * mark-all-read update readAt correctly, scoped to the caller's org.
 *
 * Run directly: `node tests/notifications.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra ?? ""); failures++; }
  };
  const api = (path, { method = "GET", body, token } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const login = async (email, password = "password") => {
    const res = await api("/api/admin-auth/login", { method: "POST", body: { email, password } });
    return res.body.token;
  };

  try {
    // durbarmarg admin/customer — seeded, verified, no earn history needed
    // beyond what this test itself creates.
    const durbarmargToken = await login("durbarmarg@coffesarowar.com");
    check("logged in as durbarmarg admin", Boolean(durbarmargToken));

    const patanToken = await login("patan@coffesarowar.com");
    check("logged in as patan admin", Boolean(patanToken));

    // Baseline: no notifications yet for either outlet in this fresh server.
    const before = await api("/api/admin/notifications", { token: durbarmargToken });
    check("durbarmarg starts with zero notifications", before.body?.notifications?.length === 0, before.body);
    check("durbarmarg starts with zero unread", before.body?.unreadCount === 0);

    // --- New customer at durbarmarg -------------------------------------
    const stamp = Date.now();
    const custEmail = `notif-cust-${stamp}@test.com`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Notif Customer", email: custEmail, password: "password123", phone: "9800000000" },
    });
    const custLogin = await api("/api/customer-auth/login", {
      method: "POST", body: { email: custEmail, password: "password123" },
    });
    const enterDurbarmargReal = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${custLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "durbarmarg",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    check("customer entered durbarmarg -> 200", enterDurbarmargReal.status === 200, enterDurbarmargReal.body);

    await new Promise((r) => setTimeout(r, 200));

    const afterFirstVisit = await api("/api/admin/notifications", { token: durbarmargToken });
    check("one new_customer notification after first visit", afterFirstVisit.body?.notifications?.length === 1, afterFirstVisit.body);
    check("it's type new_customer", afterFirstVisit.body?.notifications?.[0]?.type === "new_customer");
    check("unreadCount is 1", afterFirstVisit.body?.unreadCount === 1);

    // A second visit (re-entering the same outlet) must NOT create a second
    // new_customer notification — ensureMembership's "found existing" branch.
    const enterDurbarmargAgain = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${custLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "durbarmarg",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    check("customer re-entered durbarmarg -> 200", enterDurbarmargAgain.status === 200);

    await new Promise((r) => setTimeout(r, 200));
    const afterSecondVisit = await api("/api/admin/notifications", { token: durbarmargToken });
    check("still exactly one notification after a second visit", afterSecondVisit.body?.notifications?.length === 1, afterSecondVisit.body);

    // The SAME customer's first visit to a DIFFERENT outlet (patan) DOES
    // create a new_customer notification there — "new to this outlet."
    const enterPatan = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${custLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "patan",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    check("customer entered patan -> 200", enterPatan.status === 200, enterPatan.body);

    await new Promise((r) => setTimeout(r, 200));
    const patanNotifs = await api("/api/admin/notifications", { token: patanToken });
    check("patan has its own new_customer notification", patanNotifs.body?.notifications?.length === 1, patanNotifs.body);

    // Isolation: durbarmarg's list must still show only its own row, never
    // patan's.
    const durbarmargStillOne = await api("/api/admin/notifications", { token: durbarmargToken });
    check("durbarmarg's list is unaffected by patan's notification", durbarmargStillOne.body?.notifications?.length === 1, durbarmargStillOne.body);

    // --- Mark read --------------------------------------------------------
    const notifId = afterFirstVisit.body.notifications[0].id;
    const markRead = await api(`/api/admin/notifications/${notifId}/read`, { method: "POST", token: durbarmargToken });
    check("mark-read -> 200", markRead.status === 200, markRead.body);

    const afterMarkRead = await api("/api/admin/notifications", { token: durbarmargToken });
    check("unreadCount is 0 after marking the only notification read", afterMarkRead.body?.unreadCount === 0, afterMarkRead.body);
    check("the notification's readAt is now set", Boolean(afterMarkRead.body?.notifications?.[0]?.readAt), afterMarkRead.body);

    // Marking an id that belongs to patan, using durbarmarg's token, must
    // fail rather than silently succeed.
    const patanNotifId = patanNotifs.body.notifications[0].id;
    const crossOrgMarkRead = await api(`/api/admin/notifications/${patanNotifId}/read`, { method: "POST", token: durbarmargToken });
    check("marking another outlet's notification read -> 404", crossOrgMarkRead.status === 404, crossOrgMarkRead.body);

    const patanStillUnread = await api("/api/admin/notifications", { token: patanToken });
    check("patan's notification is still unread after the cross-org attempt", patanStillUnread.body?.unreadCount === 1, patanStillUnread.body);

    // --- Redemption ---------------------------------------------------
    // Use bikash, a seeded verified customer already a member of durbarmarg
    // (per demoSeed.js), and durbarmarg's own admin to redeem a real
    // reward there.
    const bikashLogin = await api("/api/customer-auth/login", {
      method: "POST", body: { email: "bikash@example.com", password: "password" },
    });
    const bikashEnter = await fetch(`${baseUrl}/api/customer-auth/enter-tenant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bikashLogin.body.token}`,
        "X-Company-Slug": "coffesarowar",
        "X-Outlet-Slug": "durbarmarg",
      },
      body: JSON.stringify({}),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const bikashTenantToken = bikashEnter.body.token;

    const catalog = await api("/api/points/catalog", { token: bikashTenantToken });
    const cheapest = (catalog.body?.data || []).slice().sort((a, b) => a.pointsPrice - b.pointsPrice)[0];
    check("durbarmarg has a redeemable item", Boolean(cheapest), catalog.body);

    if (cheapest) {
      // Give bikash enough balance via a real earn first — a redeem QR
      // needs sufficient funds, and this test must not assume a prior
      // suite already left bikash with points at durbarmarg.
      const qr = await api("/api/admin/generate-qr", {
        method: "POST", token: durbarmargToken, body: { billAmount: 100000 },
      });
      const earn = await api("/api/points/claim", {
        method: "POST", token: bikashTenantToken, body: { token: qr.body?.data?.token },
      });
      check("bikash earned enough to redeem", earn.status === 200, earn.body);

      const redeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: durbarmargToken });
      const redeem = await api("/api/points/redeem", {
        method: "POST",
        token: bikashTenantToken,
        body: { token: redeemQr.body?.data?.token, itemId: cheapest.id, kind: cheapest.kind },
      });
      check("redemption -> 200", redeem.status === 200, redeem.body);

      await new Promise((r) => setTimeout(r, 200));
      const afterRedeem = await api("/api/admin/notifications", { token: durbarmargToken });
      const redemptionNotif = afterRedeem.body?.notifications?.find((n) => n.type === "redemption");
      check("a redemption notification was created", Boolean(redemptionNotif), afterRedeem.body);
      check("its message names the reward", redemptionNotif?.message?.includes(cheapest.name), redemptionNotif);
    }

    // --- Mark all read ------------------------------------------------
    const markAll = await api("/api/admin/notifications/read-all", { method: "POST", token: durbarmargToken });
    check("mark-all-read -> 200", markAll.status === 200, markAll.body);
    const afterMarkAll = await api("/api/admin/notifications", { token: durbarmargToken });
    check("unreadCount is 0 after mark-all-read", afterMarkAll.body?.unreadCount === 0, afterMarkAll.body);

    if (failures === 0) console.log("\nAll notification checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

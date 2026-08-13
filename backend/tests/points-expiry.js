/**
 * Points expiry suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Expiry is ROLLING INACTIVITY derived from
 * lastActivityAt at read time and materialized on the next write — there is
 * no cron job, so this drives it via the mock-DB-only /__test__/expire-points
 * hook, which just drags lastActivityAt into the past. Ageing the row IS the
 * production path; nothing here is stubbed.
 *
 * Run directly: `node tests/points-expiry.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const makeCustomer = async (label) => {
    const email = `${label}_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST", body: { name: `${label} Tester`, email, password: "password", phone: "+9779800004444" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const login = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    return { email, token: login.body.token, organizationId: login.body.user.organizationId };
  };

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST", body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;
    const earn = async (customerToken, billAmount) => {
      const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount } });
      return api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
    };
    const age = (customer, daysAgo) => api("/__test__/expire-points", {
      method: "POST", body: { email: customer.email, organizationId: customer.organizationId, daysAgo },
    });

    console.log("\n== 0 days = never expires (the default) ==");
    const never = await makeCustomer("never");
    await earn(never.token, 300);
    await age(never, 3650);
    const neverBal = await api("/api/points/balance", { token: never.token });
    check("a decade-old balance survives when expiry is off", neverBal.body?.data?.balance === 300, neverBal.body);
    check("no expiry date is advertised when expiry is off", neverBal.body?.data?.expiresAt === null, neverBal.body);

    console.log("\n== Turning expiry on ==");
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { pointsExpiryDays: 30 } } });
    const c = await makeCustomer("expiry");
    await earn(c.token, 400);

    const fresh = await api("/api/points/balance", { token: c.token });
    check("a fresh balance is alive", fresh.body?.data?.balance === 400, fresh.body);
    check("it advertises when it will expire", typeof fresh.body?.data?.expiresAt === "string", fresh.body);
    check("the program's expiry window comes back", fresh.body?.data?.pointsExpiryDays === 30, fresh.body);

    console.log("\n== Inside the window ==");
    await age(c, 29);
    const inside = await api("/api/points/balance", { token: c.token });
    check("29 days idle, 30-day window: still alive", inside.body?.data?.balance === 400, inside.body);

    console.log("\n== Past the window ==");
    await age(c, 31);
    const expired = await api("/api/points/balance", { token: c.token });
    check("31 days idle: reads 0, derived at read time", expired.body?.data?.balance === 0, expired.body);

    // Reading is not writing: the read above must not have been the thing
    // that zeroed it, or a report would disagree with a dashboard.
    const expiredAgain = await api("/api/points/balance", { token: c.token });
    check("re-reading is stable", expiredAgain.body?.data?.balance === 0, expiredAgain.body);

    console.log("\n== Activity restarts the clock (rolling, not fixed) ==");
    const roll = await makeCustomer("roll");
    await earn(roll.token, 200);
    await age(roll, 29);
    // Activity inside the window: the earn itself resets lastActivityAt to
    // now, which is what makes the window rolling rather than fixed.
    await earn(roll.token, 50);
    const rolled = await api("/api/points/balance", { token: roll.token });
    check("earning inside the window keeps the WHOLE balance alive (250)", rolled.body?.data?.balance === 250, rolled.body);

    console.log("\n== The loss is materialized on the next write ==");
    const after = await earn(c.token, 60);
    check("an earn after expiry starts from 0, not from the dead balance", after.body?.data?.balance === 60, after.body);

    const history = await api("/api/points/history", { token: c.token });
    const expireRow = (history.body?.data || []).find((r) => r.type === "expire");
    check("the expiry is written to the ledger", Boolean(expireRow), history.body?.data);
    check("it records the full loss as negative", expireRow?.points === -400, expireRow);
    check("it lands the balance on 0", expireRow?.balanceAfter === 0, expireRow);

    // The ledger must still reconcile with the balance after an expiry.
    const rows = history.body?.data || [];
    const ledgerSum = rows.reduce((sum, r) => sum + r.points, 0);
    check("the balance still equals the sum of the ledger", ledgerSum === 60, { ledgerSum });

    console.log("\n== An expired balance can't be spent ==");
    const spend = await makeCustomer("spend");
    await earn(spend.token, 500);
    await age(spend, 40);
    const catalog = await api("/api/points/catalog", { token: spend.token });
    const coffee = (catalog.body?.data || []).find((i) => i.name === "House Coffee");
    const rqr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });
    const blocked = await api("/api/points/redeem", {
      method: "POST", token: spend.token, body: { token: rqr.body.data.token, itemId: coffee.id },
    });
    check("redeeming an expired 500-point balance -> 400", blocked.status === 400, blocked.body);
    const spendBal = await api("/api/points/balance", { token: spend.token });
    check("and it stays at 0, not negative", spendBal.body?.data?.balance === 0, spendBal.body);

    console.log("\n== Reports apply the same expiry ==");
    // This check used to assert only `typeof value === "number"`, which would
    // have passed if outstanding included every expired balance or were
    // hardcoded to 0 — the one assertion that should have caught the
    // reconciliation gap below, and it caught nothing. Assert the delta.
    const ghost = await makeCustomer("ghost");
    const before = (await api("/api/admin/dashboard-stats", { token: adminToken })).body.pointsOutstanding.value;
    await earn(ghost.token, 1000);
    const withGhost = (await api("/api/admin/dashboard-stats", { token: adminToken })).body.pointsOutstanding.value;
    check("a fresh 1000-point balance shows as outstanding", withGhost === before + 1000, { before, withGhost });

    await age(ghost, 40);
    const afterGhostExpired = (await api("/api/admin/dashboard-stats", { token: adminToken })).body.pointsOutstanding.value;
    check(
      "outstanding drops by exactly the expired 1000",
      afterGhostExpired === withGhost - 1000,
      { withGhost, afterGhostExpired },
    );

    console.log("\n== The summary report reconciles ==");
    // issued - redeemed - expired must equal outstanding. It didn't: expired
    // counted only MATERIALIZED ledger rows, while outstanding was derived,
    // so a customer who aged out and never came back left a gap that grew
    // forever. `ghost` above is exactly that customer.
    const summary = await api(
      `/api/admin/reports/summary?startDate=2000-01-01&endDate=2100-01-01`,
      { token: adminToken },
    );
    const { pointsIssued, pointsRedeemed, pointsExpired, pointsOutstanding } = summary.body;
    check(
      "expired counts the aged-out-but-unmaterialized balance",
      pointsExpired >= 1000,
      { pointsIssued, pointsRedeemed, pointsExpired, pointsOutstanding },
    );
    check(
      "issued - redeemed - expired === outstanding",
      Math.abs(pointsIssued - pointsRedeemed - pointsExpired - pointsOutstanding) < 0.001,
      {
        pointsIssued, pointsRedeemed, pointsExpired, pointsOutstanding,
        gap: pointsIssued - pointsRedeemed - pointsExpired - pointsOutstanding,
      },
    );

    console.log("\n== A policy change does NOT rewrite history ==");
    // Both directions used to be live, because expiry was re-derived from the
    // program on every read.
    const frozen = await makeCustomer("frozen");
    await earn(frozen.token, 500);
    await age(frozen, 40);
    check(
      "the balance is expired under the 30-day window",
      (await api("/api/points/balance", { token: frozen.token })).body.data.balance === 0,
    );

    // Loosening the policy must not RESURRECT points the customer was already
    // told were gone (and must certainly not make them spendable again).
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { pointsExpiryDays: 0 } } });
    const afterLoosen = await api("/api/points/balance", { token: frozen.token });
    check(
      "turning expiry OFF does not resurrect an expired balance",
      afterLoosen.body.data.balance === 0,
      afterLoosen.body.data,
    );

    // Tightening must not VAPORIZE an idle balance that was alive under the
    // window it was actually given.
    const settled = await makeCustomer("settled");
    await earn(settled.token, 700);           // stamped with "never expires"
    await age(settled, 45);
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { pointsExpiryDays: 30 } } });
    const afterTighten = await api("/api/points/balance", { token: settled.token });
    check(
      "tightening the window does not vaporize an existing balance",
      afterTighten.body.data.balance === 700,
      afterTighten.body.data,
    );

    // ...but the NEXT visit adopts the new window.
    await earn(settled.token, 1);
    const restamped = await api("/api/points/balance", { token: settled.token });
    check(
      "the next visit adopts the new window",
      typeof restamped.body.data.expiresAt === "string",
      restamped.body.data,
    );

    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { pointsExpiryDays: 0 } } });
  } finally {
    stop();
  }

  if (failures) { console.error(`\npoints-expiry: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\npoints-expiry: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

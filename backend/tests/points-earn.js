/**
 * Points earn suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Covers the earn half of the loyalty loop — the
 * mandatory bill, the earnPercent math (including the fractional case that
 * centipoints exist for), the single-use guard, the absence of a cooldown,
 * and the earn/redeem purpose split.
 *
 * Run directly: `node tests/points-earn.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5035 });
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

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const email = `earn_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Earn Tester", email, password: "password", phone: "+9779800001111" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    console.log("\n== A bill is mandatory ==");
    const noBill = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: {} });
    check("no bill at all -> 400", noBill.status === 400, noBill.body);
    const zeroBill = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 0 } });
    check("a zero bill -> 400", zeroBill.status === 400, zeroBill.body);
    const negBill = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: -50 } });
    check("a negative bill -> 400", negBill.status === 400, negBill.body);
    const junkBill = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: "abc" } });
    check("a non-numeric bill -> 400", junkBill.status === 400, junkBill.body);

    console.log("\n== Earning at the default 100% ==");
    const start = await api("/api/points/balance", { token: customerToken });
    check("a new customer starts at 0 points", start.body?.data?.balance === 0, start.body);
    check("the balance read reports the resolved earn rate", start.body?.data?.earnPercent === 100, start.body);

    const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 250 } });
    check("an earn QR is issued for a real bill", qr.status === 201, qr.body);
    check("the QR echoes its purpose", qr.body?.data?.purpose === "earn", qr.body);

    const claim = await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
    check("Rs 250 at 100% earns 250 points", claim.body?.data?.pointsEarned === 250, claim.body);
    check("the earn echoes the bill paid, for the animation", claim.body?.data?.billAmount === 250, claim.body);
    check("the balance comes back on the earn", claim.body?.data?.balance === 250, claim.body);

    console.log("\n== The single-use guard ==");
    const replay = await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
    check("the same QR can't be claimed twice", replay.status === 400, replay.body);
    const afterReplay = await api("/api/points/balance", { token: customerToken });
    check("the rejected replay didn't move the balance", afterReplay.body?.data?.balance === 250, afterReplay.body);

    const bogus = await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: "not-a-real-token" } });
    check("an invented token -> 400", bogus.status === 400, bogus.body);

    console.log("\n== No cooldown: every bill earns ==");
    // The old program had an 18h cooldown. It's gone: the token's single-use
    // guard already serializes claimers, and two genuine bills an hour apart
    // are two genuine earns.
    for (const bill of [100, 100, 100]) {
      const q = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: bill } });
      await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: q.body.data.token } });
    }
    const rapid = await api("/api/points/balance", { token: customerToken });
    check("three back-to-back bills all earn (250 + 300 = 550)", rapid.body?.data?.balance === 550, rapid.body);

    console.log("\n== Fractional points survive (why centipoints exist) ==");
    // 10% of Rs 105 is 10.5 points — not representable as an integer number
    // of points, which is the whole reason the balance is stored in centi.
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { earnPercent: 10 } } });
    const fracQr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 105 } });
    const fracClaim = await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: fracQr.body.data.token } });
    check("Rs 105 at 10% earns exactly 10.5 points", fracClaim.body?.data?.pointsEarned === 10.5, fracClaim.body);
    check("the fraction lands on the balance (550 + 10.5)", fracClaim.body?.data?.balance === 560.5, fracClaim.body);

    // Repeated fractional adds are exactly where float drift would show up.
    for (let i = 0; i < 10; i += 1) {
      const q = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 105 } });
      await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: q.body.data.token } });
    }
    const drift = await api("/api/points/balance", { token: customerToken });
    check("ten more fractional earns land exactly on 665.5, no drift", drift.body?.data?.balance === 665.5, drift.body);

    // A bill with paisa rounds to 2dp once, at the token, and stays put.
    const paisaQr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 99.994 } });
    check("a bill is rounded to 2dp at the token", paisaQr.body?.data?.billAmount === 99.99, paisaQr.body);

    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { earnPercent: 100 } } });

    console.log("\n== Earn and redeem tokens are not interchangeable ==");
    const redeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });
    check("a redeem QR is issued", redeemQr.status === 201, redeemQr.body);
    check("it carries no bill", redeemQr.body?.data?.billAmount === undefined, redeemQr.body);
    const wrongWay = await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: redeemQr.body.data.token } });
    check("a redeem QR is rejected on the earn path", wrongWay.status === 400, wrongWay.body);

    // Earning is deliberately open to an unverified customer: they are at the
    // counter with a 30-second QR and a bill they have already paid, and
    // sending them to their inbox at that moment loses a genuine earn.
    // Verification is enforced on the REDEEM side instead — see
    // points-redeem.js, which owns the other half of this pair.
    console.log("\n== An unverified customer can still EARN ==");
    const unverifiedEmail = `unverified_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Unverified", email: unverifiedEmail, password: "password", phone: "+9779800002222" },
    });
    const unverifiedLogin = await api("/api/auth/login", { method: "POST", body: { email: unverifiedEmail, password: "password" } });
    check("an unverified customer can log in", Boolean(unverifiedLogin.body?.token), unverifiedLogin.body);
    check("and is still flagged unverified", unverifiedLogin.body?.user?.emailVerified === false, unverifiedLogin.body);
    const unverifiedQr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    const allowed = await api("/api/points/claim", {
      method: "POST", token: unverifiedLogin.body.token, body: { token: unverifiedQr.body.data.token },
    });
    check("an unverified customer CAN earn (200)", allowed.status === 200, allowed.body);
    check("and the points actually land", allowed.body?.data?.pointsEarned === 100, allowed.body);

    console.log("\n== Staff can't earn on their own QR ==");
    const staffQr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 100 } });
    const staffClaim = await api("/api/points/claim", { method: "POST", token: adminToken, body: { token: staffQr.body.data.token } });
    check("a business_admin token is refused on the earn path (403)", staffClaim.status === 403, staffClaim.body);
  } finally {
    stop();
  }

  if (failures) { console.error(`\npoints-earn: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\npoints-earn: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

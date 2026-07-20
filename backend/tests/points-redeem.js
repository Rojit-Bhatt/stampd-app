/**
 * Points redeem suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Covers the redeem half of the loyalty loop — the
 * catalog, the staff-initiated redeem QR, the atomic sufficient-funds guard
 * that stops a balance going negative, and the ledger rows both halves write.
 *
 * Run directly: `node tests/points-redeem.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5036 });
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
  const earn = async (adminToken, customerToken, billAmount) => {
    const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount } });
    return api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
  };
  const redeemQr = (adminToken) => api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const email = `redeem_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Redeem Tester", email, password: "password", phone: "+9779800003333" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    console.log("\n== The catalog ==");
    const catalog = await api("/api/points/catalog", { token: customerToken });
    check("the catalog resolves", catalog.status === 200, catalog.body);
    const coffee = (catalog.body?.data || []).find((i) => i.name === "House Coffee");
    check("a priced item is in the catalog", Boolean(coffee), catalog.body);
    check("its points price comes back in points, not centi", coffee?.pointsPrice === 180, coffee);
    check(
      "a menu-only item (no points price) is left out",
      (catalog.body?.data || []).every((i) => i.name !== "Seasonal Special"),
      catalog.body,
    );

    console.log("\n== Not enough points ==");
    const brokeRedeemQr = await redeemQr(adminToken);
    const broke = await api("/api/points/redeem", {
      method: "POST", token: customerToken, body: { token: brokeRedeemQr.body.data.token, itemId: coffee.id },
    });
    check("redeeming on a 0 balance -> 400", broke.status === 400, broke.body);
    check("the refusal says what it costs and what you have", /180/.test(broke.body?.message || ""), broke.body);
    const stillZero = await api("/api/points/balance", { token: customerToken });
    check("the failed redeem left the balance at 0, not negative", stillZero.body?.data?.balance === 0, stillZero.body);

    console.log("\n== A real redemption ==");
    await earn(adminToken, customerToken, 500);
    const redeem = await api("/api/points/redeem", {
      method: "POST", token: customerToken, body: { token: (await redeemQr(adminToken)).body.data.token, itemId: coffee.id },
    });
    check("redeeming a 180-point coffee off 500 -> 200", redeem.status === 200, redeem.body);
    check("the balance is 320", redeem.body?.data?.balance === 320, redeem.body);
    check("the reward is named back, for the animation", redeem.body?.data?.rewardName === "House Coffee", redeem.body);
    check("the points spent are reported", redeem.body?.data?.pointsSpent === 180, redeem.body);

    console.log("\n== The redeem QR is single-use too ==");
    const oneShot = await redeemQr(adminToken);
    await api("/api/points/redeem", { method: "POST", token: customerToken, body: { token: oneShot.body.data.token, itemId: coffee.id } });
    const reuse = await api("/api/points/redeem", {
      method: "POST", token: customerToken, body: { token: oneShot.body.data.token, itemId: coffee.id },
    });
    check("the same redeem QR can't be spent twice", reuse.status === 400, reuse.body);
    const afterReuse = await api("/api/points/balance", { token: customerToken });
    check("only one deduction landed (320 - 180 = 140)", afterReuse.body?.data?.balance === 140, afterReuse.body);

    console.log("\n== Bad requests ==");
    const noItem = await api("/api/points/redeem", {
      method: "POST", token: customerToken, body: { token: (await redeemQr(adminToken)).body.data.token },
    });
    check("no item picked -> 400", noItem.status === 400, noItem.body);

    const badItem = await api("/api/points/redeem", {
      method: "POST", token: customerToken,
      body: { token: (await redeemQr(adminToken)).body.data.token, itemId: "aaaaaaaaaaaaaaaaaaaaaaaa" },
    });
    check("an unknown item -> 404", badItem.status === 404, badItem.body);

    // The Seasonal Special exists on this outlet's menu but carries no points
    // price — adding points to an outlet must not put its whole menu up for
    // redemption.
    const menu = await api("/api/admin/menu", { token: adminToken });
    const menuOnly = (menu.body?.data || menu.body?.items || []).find((i) => i.name === "Seasonal Special");
    if (menuOnly) {
      const notRedeemable = await api("/api/points/redeem", {
        method: "POST", token: customerToken,
        body: { token: (await redeemQr(adminToken)).body.data.token, itemId: menuOnly._id || menuOnly.id },
      });
      check("a menu-only item can't be redeemed -> 404", notRedeemable.status === 404, notRedeemable.body);
    } else {
      check("a menu-only item can't be redeemed -> 404 (item not found in menu payload)", false, menu.body);
    }

    console.log("\n== The ledger ==");
    const history = await api("/api/points/history", { token: customerToken });
    const rows = history.body?.data || [];
    check("history is newest-first", rows[0]?.type === "redeem", rows.slice(0, 2));
    check("a redeem row is stored negative", rows[0]?.points === -180, rows[0]);
    check("a redeem row names the reward", rows[0]?.rewardName === "House Coffee", rows[0]);
    check("a redeem row carries the running balance", rows[0]?.balanceAfter === 140, rows[0]);
    const earnRow = rows.find((r) => r.type === "earn");
    check("an earn row is stored positive", earnRow?.points === 500, earnRow);
    check("an earn row keeps the bill that produced it", earnRow?.billAmount === 500, earnRow);

    // The ledger must reconcile with the balance — that's the invariant that
    // makes a drifted balance detectable rather than merely wrong.
    const ledgerSum = rows.reduce((sum, r) => sum + r.points, 0);
    const balance = await api("/api/points/balance", { token: customerToken });
    check("the balance equals the sum of the ledger", ledgerSum === balance.body?.data?.balance, { ledgerSum, balance: balance.body?.data?.balance });

    // A redeem token is consumed at the moment the customer confirms a
    // reward, so its life has to cover scanning, reading the catalog,
    // choosing and confirming — on a phone, at a counter. An earn token only
    // has to survive being scanned, because it converts to a 15-minute
    // PendingClaim the instant it is. Same 30s for both is what made the
    // redeem window expire mid-choice.
    console.log("\n== Redeem tokens outlive earn tokens ==");
    const redeemWindow = await redeemQr(adminToken);
    const earnWindow = await api("/api/admin/generate-qr", {
      method: "POST",
      token: adminToken,
      body: { billAmount: 100 },
    });
    check(
      "an earn code still expires in 30s",
      earnWindow.body?.data?.expiresInSeconds === 30,
      earnWindow.body?.data,
    );
    check(
      "a redeem code gets a longer window than an earn code",
      redeemWindow.body?.data?.expiresInSeconds > earnWindow.body?.data?.expiresInSeconds,
      { redeem: redeemWindow.body?.data?.expiresInSeconds, earn: earnWindow.body?.data?.expiresInSeconds },
    );
    check(
      "long enough to browse a catalog and confirm",
      redeemWindow.body?.data?.expiresInSeconds >= 120,
      redeemWindow.body?.data,
    );

    // The other half of the pair points-earn.js sets up: earning is open to an
    // unverified customer, spending is not. This is the only gate on
    // emailVerified left in the loyalty loop, so it is the only thing standing
    // between an unreachable account and a free reward — and a test that only
    // checked the earn side would pass with the gate removed entirely.
    console.log("\n== An unverified customer earns but cannot redeem ==");
    const unverifiedEmail = `unverified_redeem_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Unverified Redeemer", email: unverifiedEmail, password: "password", phone: "+9779800004444" },
    });
    const unverifiedLogin = await api("/api/auth/login", {
      method: "POST", body: { email: unverifiedEmail, password: "password" },
    });
    const unverifiedToken = unverifiedLogin.body?.token;
    check("an unverified customer gets a session", Boolean(unverifiedToken), unverifiedLogin.body);

    const unverifiedEarn = await earn(adminToken, unverifiedToken, 1000);
    check("they can earn (200)", unverifiedEarn.status === 200, unverifiedEarn.body);
    check("with a balance well past the reward's price", unverifiedEarn.body?.data?.balance >= 180, unverifiedEarn.body);

    const blockedQr = await redeemQr(adminToken);
    const blocked = await api("/api/points/redeem", {
      method: "POST", token: unverifiedToken,
      body: { token: blockedQr.body.data.token, itemId: coffee.id },
    });
    check("but redeeming is refused (403)", blocked.status === 403, blocked.body);
    // The frontend branches on this code to offer "resend verification"
    // rather than showing a generic failure toast.
    check("tagged EMAIL_NOT_VERIFIED, not a bare 403", blocked.body?.code === "EMAIL_NOT_VERIFIED", blocked.body);

    // Refusing must not have consumed the single-use redeem token — otherwise
    // verifying and coming straight back would need staff to re-issue a QR.
    const unverifiedMint = await api("/__test__/mint-token", {
      method: "POST", body: { email: unverifiedEmail, type: "email_verify" },
    });
    await api(`/api/auth/verify-email?token=${unverifiedMint.body.token}`);
    const nowAllowed = await api("/api/points/redeem", {
      method: "POST", token: unverifiedToken,
      body: { token: blockedQr.body.data.token, itemId: coffee.id },
    });
    check("after verifying, the same code still works (200)", nowAllowed.status === 200, nowAllowed.body);

    // Regression. The legacy tenant-scoped verify link used to set the User
    // membership row ONLY, leaving CustomerAccount.emailVerified false — and
    // ensureMembership re-syncs the membership DOWN from the account on every
    // enter-tenant. So a customer verified, could redeem, navigated once, and
    // silently could not redeem again, with nothing on screen to explain it.
    // The assertion that matters is the one AFTER enter-tenant.
    console.log("\n== Verifying survives the next page load ==");
    const globalEmail = `verify_sticks_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Sticky Verify", email: globalEmail, password: "password", phone: "+9779800005555" },
    });
    const globalLogin = await api("/api/customer-auth/login", {
      method: "POST", body: { email: globalEmail, password: "password" },
    });
    // Provision the membership first, so the tenant-scoped verify has a User
    // row to find — exactly the order a real customer hits it in.
    await api("/api/customer-auth/enter-tenant", { method: "POST", token: globalLogin.body.token });
    const tenantMint = await api("/__test__/mint-token", {
      method: "POST", body: { email: globalEmail, type: "email_verify" },
    });
    const tenantVerify = await api(`/api/auth/verify-email?token=${tenantMint.body.token}`);
    check("the tenant-scoped verify link works", tenantVerify.status === 200, tenantVerify.body);

    // The write-through: the GLOBAL account must have been verified too.
    const afterVerify = await api("/api/customer-auth/login", {
      method: "POST", body: { email: globalEmail, password: "password" },
    });
    check("it verifies the global account, not just the outlet's row",
      afterVerify.body?.account?.emailVerified === true, afterVerify.body?.account);

    // The step that used to undo it.
    const reEnter = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: globalLogin.body.token,
    });
    check("and re-entering the tenant does NOT revert it",
      reEnter.body?.user?.emailVerified === true, reEnter.body?.user);

    console.log("\n== The admin ledger ==");
    const txns = await api("/api/admin/transactions", { token: adminToken });
    const mine = (txns.body?.data || []).filter((t) => t.customerName === "Redeem Tester");
    check("the outlet ledger includes this customer's rows", mine.length >= 2, txns.body?.data?.slice(0, 3));
    check("it names the customer", mine[0]?.customerName === "Redeem Tester", mine[0]);
  } finally {
    stop();
  }

  if (failures) { console.error(`\npoints-redeem: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\npoints-redeem: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

/**
 * Impact insights.
 *
 * Covers: rewardValueNpr is snapshotted from MenuItem.price at redemption
 * and stays null for a points-only RewardItem.
 *
 * Later tasks extend this suite with the outlet and company impact
 * endpoints. Run directly: `node tests/impact.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5049 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra ?? ""); failures++; }
  };
  // /api/auth/* is the legacy tenant-scoped identity and needs both slugs to
  // resolve an outlet — one slug alone can never identify one.
  const COMPANY = "coffesarowar";
  const OUTLET = "patan";
  const api = (path, { method = "GET", body, token, slug = OUTLET } = {}) => {
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
    // patan, not durbarmarg: the existing suite earns against durbarmarg ~30
    // times and asserts on the resulting figures.
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "patan@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;
    check("logged in as patan admin", Boolean(adminToken), adminLogin.body);

    // A verified customer at patan.
    const email = `impact_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Impact Tester", email, password: "password", phone: "+9779800004444" },
    });
    const mint = await api("/__test__/mint-token", {
      method: "POST",
      body: { email, type: "email_verify" },
    });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const customerLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "password" },
    });
    const customerToken = customerLogin.body.token;

    const earn = async (billAmount) => {
      const qr = await api("/api/admin/generate-qr", {
        method: "POST", token: adminToken, body: { billAmount },
      });
      return api("/api/points/claim", {
        method: "POST", token: customerToken, body: { token: qr.body.data.token },
      });
    };
    const redeem = async (itemId, kind) => {
      const qr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });
      return api("/api/points/redeem", {
        method: "POST", token: customerToken,
        body: { token: qr.body.data.token, itemId, kind },
      });
    };

    console.log("\n== A menu redemption snapshots its rupee value ==");

    // Enough balance to buy House Coffee (180 points) twice over.
    await earn(20000);

    const catalog = await api("/api/points/catalog", { token: customerToken });
    const coffee = (catalog.body?.data || []).find((i) => i.name === "House Coffee");
    check("House Coffee is redeemable", Boolean(coffee), catalog.body);

    const done = await redeem(coffee.id, coffee.kind);
    check("the redemption succeeds", done.status === 200, done.body);

    const history = await api("/api/points/history", { token: customerToken });
    const redeemRow = (history.body?.data || []).find((r) => r.type === "redeem");
    check("the redeem row exists", Boolean(redeemRow), history.body);
    check(
      "it carries the menu item's rupee price, snapshotted",
      redeemRow?.rewardValueNpr === 180,
      redeemRow,
    );

    console.log("\n== A points-only reward has no rupee value ==");

    // A RewardItem has no cash price by design, so its ledger row must stay
    // null rather than record it as free.
    const created = await api("/api/admin/rewards", {
      method: "POST",
      token: adminToken,
      body: { name: `Tote ${Date.now()}`, pointsPrice: 50 },
    });
    check("the reward was created", created.status === 201, created.body);
    const rewardId = created.body?.reward?.id;

    const toteDone = await redeem(rewardId, "reward");
    check("the reward redemption succeeds", toteDone.status === 200, toteDone.body);

    const history2 = await api("/api/points/history", { token: customerToken });
    const toteRow = (history2.body?.data || []).find((r) => r.rewardName?.startsWith("Tote"));
    check("the reward row exists", Boolean(toteRow), history2.body);
    check(
      "a points-only reward records no rupee value",
      toteRow?.rewardValueNpr === null,
      toteRow,
    );
  } finally {
    stop();
  }

  console.log(failures === 0 ? "\nAll impact checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });

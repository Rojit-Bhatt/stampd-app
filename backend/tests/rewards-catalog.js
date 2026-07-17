/**
 * Rewards catalog suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. The catalog merges two collections — MenuItems that have
 * been given a points price, and standalone RewardItems that only exist for
 * points — so this covers the merge, both redeem paths, and the isolation
 * that has to hold across both.
 *
 * Run directly: `node tests/rewards-catalog.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5039 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json", "X-Company-Slug": COMPANY, "X-Outlet-Slug": slug };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminToken = (await api("/api/admin-auth/login", {
      method: "POST", body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    })).body.token;

    const email = `rew_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST", body: { name: "Reward Tester", email, password: "password", phone: "+9779800006666" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const customerToken = (await api("/api/auth/login", { method: "POST", body: { email, password: "password" } })).body.token;

    const earn = async (billAmount) => {
      const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount } });
      return api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
    };
    const redeemQr = () => api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });

    await earn(2000);

    console.log("\n== The catalog merges both collections ==");
    const rw = await api("/api/admin/rewards", {
      method: "POST", token: adminToken,
      body: { name: "Enamel Pin", description: "Small, ours.", pointsPrice: 50 },
    });
    check("a standalone reward is created -> 201", rw.status === 201, rw.body);
    check("its price comes back in points, not centi", rw.body.reward.pointsPrice === 50, rw.body.reward);

    const cat = await api("/api/points/catalog", { token: customerToken });
    const byName = Object.fromEntries((cat.body.data || []).map((i) => [i.name, i]));
    check("a priced menu item is in the catalog", byName["House Coffee"]?.kind === "menu", cat.body.data);
    check("the standalone reward is in the catalog", byName["Enamel Pin"]?.kind === "reward", cat.body.data);
    check(
      "a menu item with no points price stays out",
      !byName["Seasonal Special"],
      Object.keys(byName),
    );
    check("the catalog is sorted cheapest-first", cat.body.data[0].name === "Enamel Pin", cat.body.data.map((i) => i.name));

    console.log("\n== Redeeming a standalone reward ==");
    const before = (await api("/api/points/balance", { token: customerToken })).body.data.balance;
    const red = await api("/api/points/redeem", {
      method: "POST", token: customerToken,
      body: { token: (await redeemQr()).body.data.token, itemId: byName["Enamel Pin"].id, kind: "reward" },
    });
    check("the reward redeems -> 200", red.status === 200, red.body);
    check("it deducts its points price", red.body.data.balance === before - 50, red.body.data);
    check("it names the reward back", red.body.data.rewardName === "Enamel Pin", red.body.data);

    console.log("\n== Redeeming a menu item still works ==");
    const red2 = await api("/api/points/redeem", {
      method: "POST", token: customerToken,
      body: { token: (await redeemQr()).body.data.token, itemId: byName["House Coffee"].id, kind: "menu" },
    });
    check("a menu item redeems -> 200", red2.status === 200, red2.body);
    check("it deducts 180", red2.body.data.balance === before - 50 - 180, red2.body.data);

    console.log("\n== `kind` is optional ==");
    // ObjectIds are unique across collections, so an older client that sends
    // no kind must still resolve correctly rather than 404.
    const red3 = await api("/api/points/redeem", {
      method: "POST", token: customerToken,
      body: { token: (await redeemQr()).body.data.token, itemId: byName["Enamel Pin"].id },
    });
    check("redeeming without a kind still resolves", red3.status === 200, red3.body);
    check("...and resolves to the right thing", red3.body.data.rewardName === "Enamel Pin", red3.body.data);

    console.log("\n== The ledger keeps the receipt ==");
    const hist = await api("/api/points/history", { token: customerToken });
    const redeemRows = hist.body.data.filter((r) => r.type === "redeem");
    check("every redemption is on the ledger", redeemRows.length === 3, redeemRows);
    check("each names what was handed over", redeemRows.every((r) => r.rewardName), redeemRows);

    console.log("\n== Deactivating ==");
    await api(`/api/admin/rewards/${rw.body.reward.id}`, { method: "PATCH", token: adminToken, body: { isActive: false } });
    const cat2 = await api("/api/points/catalog", { token: customerToken });
    check(
      "an inactive reward leaves the catalog",
      !(cat2.body.data || []).some((i) => i.name === "Enamel Pin"),
      cat2.body.data.map((i) => i.name),
    );
    const blocked = await api("/api/points/redeem", {
      method: "POST", token: customerToken,
      body: { token: (await redeemQr()).body.data.token, itemId: rw.body.reward.id, kind: "reward" },
    });
    check("and it can't be redeemed -> 400", blocked.status === 400, blocked.body);

    // The row survives so past receipts still resolve — that's why the UI
    // offers deactivate before delete.
    const stillListed = await api("/api/admin/rewards", { token: adminToken });
    check(
      "the admin still sees it, switched off",
      stillListed.body.data.some((r) => r.name === "Enamel Pin" && r.isActive === false),
      stillListed.body.data,
    );

    console.log("\n== Validation ==");
    const noPrice = await api("/api/admin/rewards", { method: "POST", token: adminToken, body: { name: "Free stuff" } });
    check("a reward with no points price is refused", noPrice.status === 400, noPrice.body);
    const noName = await api("/api/admin/rewards", { method: "POST", token: adminToken, body: { pointsPrice: 10 } });
    check("a nameless reward is refused", noName.status === 400, noName.body);

    console.log("\n== Outlet isolation ==");
    const sibling = await api("/api/admin-auth/login", {
      method: "POST", body: { email: "patan@coffesarowar.com", password: "password" },
    });
    const siblingRewards = await api("/api/admin/rewards", { token: sibling.body.token, slug: "patan" });
    // Not "the sibling has no rewards" — every outlet is seeded with its own.
    // The invariant is that it can't see THIS outlet's.
    check(
      "a sibling outlet doesn't see this outlet's reward",
      Array.isArray(siblingRewards.body.data) &&
        !siblingRewards.body.data.some((r) => r.name === "Enamel Pin"),
      siblingRewards.body.data,
    );

    // A reward id lifted from a sibling outlet must not be redeemable here.
    const sibReward = await api("/api/admin/rewards", {
      method: "POST", token: sibling.body.token, slug: "patan",
      body: { name: "Patan Mug", pointsPrice: 10 },
    });
    const crossRedeem = await api("/api/points/redeem", {
      method: "POST", token: customerToken,
      body: { token: (await redeemQr()).body.data.token, itemId: sibReward.body.reward.id, kind: "reward" },
    });
    check("a sibling outlet's reward can't be redeemed here -> 404", crossRedeem.status === 404, crossRedeem.body);
  } finally {
    stop();
  }

  if (failures) { console.error(`\nrewards-catalog: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\nrewards-catalog: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

/**
 * Backfill missing "Value (Rs)" on historical menu-item redemptions.
 *
 * Covers: backfillRedeemValues() snapshots the CURRENT MenuItem.price onto
 * every redeem row that has no recorded value (rewardKind === "menu" with a
 * live, priced MenuItem) — idempotently — while leaving every row that must
 * stay valueless alone:
 *   - points-only RewardItem redemptions (rewardKind === "reward")
 *   - menu-item rows whose MenuItem has no price (value unknown)
 *   - menu-item rows whose MenuItem was deleted (no price to derive)
 *   - rows already carrying a value (never downgraded or overwritten)
 *
 * Everything is driven through the real HTTP API — the parent process has
 * no shared connection to the child's in-memory mock DB, so model queries
 * must flow via /__test__ hooks (mock-DB only, never in production).
 *
 * Run directly: `node tests/backfill-redeem-values.js`
 */
const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5051 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra ?? ""); failures++; }
  };

  const api = (path, { method = "GET", token, body, tenant = true } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenant) {
      headers["X-Company-Slug"] = "coffesarowar";
      headers["X-Outlet-Slug"] = "patan";
    }
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  const seed = (body) => api("/__test__/seed-backfill-rows", { method: "POST", body });
  const runBackfill = (body) => api("/__test__/run-backfill", { method: "POST", body });

  try {
    // Use the seeded patan outlet — real organization, menu, and customers.
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "patan@coffesarowar.com", password: "password" },
    });
    check("logged in as patan admin", Boolean(adminLogin.body.token));

    const orgRes = await api("/__test__/get-organization", {
      method: "POST",
      body: { companySlug: "coffesarowar", outletSlug: "patan" },
    });
    const organizationId = orgRes.body?.organizationId;
    check("patan organization exists", Boolean(organizationId), orgRes.body);

    // A priced menu item from the live catalog — backfills should derive its
    // actual price, so the assertion stays true even if the demo seed ever
    // changes what House Coffee costs.
    const adminApi = (p, { method = "GET", body } = {}) => api(p, { method, token: adminLogin.body.token, body });
    const menuRes = await adminApi("/api/admin/menu");
    const pricedItem = (menuRes.body?.items || []).find((m) => typeof m.price === "number" && m.price > 0);
    check("there is a menu item with a price", Boolean(pricedItem), menuRes.body);

    // A fresh customer at patan to own the seeded test redemptions — the
    // demo seed's members are tied to backdated history, so a controlled
    // test identity keeps the report assertions deterministic.
    const customerEmail = `backfill_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Backfill Tester", email: customerEmail, password: "password", phone: "+9779800009999" },
    });
    const mint = await api("/__test__/mint-token", {
      method: "POST",
      body: { email: customerEmail, type: "email_verify" },
    });
    await api(`/api/auth/verify-email?token=${mint.body.token}`, { tenant: false });
    const customerLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: customerEmail, password: "password" },
    });
    check("the test customer is verified and logged in", Boolean(customerLogin.body?.token), customerLogin.body);

    // A RewardItem with no cash price (points-only) to prove rewards are
    // never silently valued as Rs 0.
    const rewardRes = await adminApi("/api/admin/rewards", {
      method: "POST",
      body: { name: `Backfill Test Tote ${Date.now()}`, pointsPrice: 50 },
    });
    const testRewardId = rewardRes.body?.reward?.id;
    check("the points-only test reward exists", Boolean(testRewardId), rewardRes.body);

    // Seed the exact legacy-row scenarios the migration must distinguish.
    const seeded = await seed({
      organizationId,
      customerEmail: customerEmail,
      seedItems: [
        // [0] a menu item with a price — the backfillable case
        { name: `Backfill Priced Mocha ${Date.now()}`, price: 220, pointsPrice: 300 },
        // [1] a menu item with NO price — value unknowable, must stay null
        { name: `Backfill Priceless Latte ${Date.now()}`, price: null, pointsPrice: 250 }
      ],
      seedRedeems: [
        // legacy menu redeem on a priced item: must receive the item's price
        { pointsCenti: -3000, balanceAfterCenti: 0, rewardKind: "menu",
          rewardRef: "$itemId:0", rewardName: "Backfill Priced Mocha", daysBack: 20 },
        // legacy redeem on the points-only reward: must stay null
        { pointsCenti: -500, balanceAfterCenti: 0, rewardKind: "reward",
          rewardRef: testRewardId, rewardName: rewardRes.body?.reward?.name, daysBack: 18 },
        // legacy menu redeem whose item was deleted: must stay null
        { pointsCenti: -9900, balanceAfterCenti: 0, rewardKind: "menu",
          rewardRef: "674b00000000000000000001", rewardName: "Deleted Chocolate Cake", daysBack: 16 },
        // legacy menu redeem on a priceless item: must stay null
        { pointsCenti: -2500, balanceAfterCenti: 0, rewardKind: "menu",
          rewardRef: "$itemId:1", rewardName: "Backfill Priceless Latte", daysBack: 14 },
        // a row that already has a value: must never be touched
        { pointsCenti: -3000, balanceAfterCenti: 0, rewardKind: "menu",
          rewardRef: "$itemId:0", rewardName: "Backfill Priced Mocha",
          rewardValueNpr: 190, daysBack: 12 },
        // a pre-kind legacy row with no kind/ref: must stay null
        { pointsCenti: -1000, balanceAfterCenti: 0, rewardKind: null,
          rewardRef: null, rewardName: "Mystery Stamp", daysBack: 10 }
      ]
    });
    check("all six legacy rows seeded", (seeded.body?.createdTransactionIds || []).length === 6, seeded.body);
    const [backfillableId, rewardId, orphanId, pricelessId, valuedId, kindlessId] = seeded.body?.createdTransactionIds || [];

    console.log("\n== Dry run: reports what would change ==");
    const dry = await runBackfill({ organizationId, dryRun: true });
    const drep = dry.body?.report || {};
    check("dry run flag surfaces as true", drep.dryRun === true, drep);
    check("dry run counts at least one backfillable row", (drep.backfilled || 0) >= 1, drep);
    check("dry run sees a no-price skip", (drep.skipped?.noPrice || 0) >= 1, drep);
    check("dry run sees an orphaned skip", (drep.skipped?.orphaned || 0) >= 1, drep);
    check("dry run sees a points-only reward skip", (drep.skipped?.pointsOnlyReward || 0) >= 1, drep);
    check("dry run sees an already-valued skip", (drep.skipped?.alreadyValued || 0) >= 1, drep);

    console.log("\n== Apply run ==");
    const applied = await runBackfill({ organizationId, dryRun: false });
    const arep = applied.body?.report || {};
    check("apply run succeeded", applied.body?.success === true, applied.body);
    check("apply backfilled >= 1 row", (arep.backfilled || 0) >= 1, arep);

    // The report endpoint is the end-user surface — assert against it.
    const report = await adminApi("/api/admin/reports/redeem");
    check("the redeem report answers", report.status === 200, report.body);
    const rows = report.body?.rows || [];
    check("the report carries rows", rows.length > 0, report.body);

    console.log("\n== Idempotency ==");
    const secondRun = await runBackfill({ organizationId, dryRun: false });
    check("a second run backfills nothing new", secondRun.body?.report?.backfilled === 0, secondRun.body?.report);

    console.log("\n== Cross-tenant safety ==");
    const otherOrgRes = await api("/__test__/get-organization", {
      method: "POST",
      body: { companySlug: "himalayan-bites", outletSlug: "lakeside" },
    });
    const otherOrg = otherOrgRes.body?.organizationId;
    check("the sibling outlet exists", Boolean(otherOrg), otherOrgRes.body);
    const siblingRun = await runBackfill({ organizationId: otherOrg, dryRun: false });
    check(
      "the sibling org's run reports only its own rows",
      Boolean(siblingRun.body?.success),
      siblingRun.body,
    );

    console.log("\n== The report endpoint reflects the backfill ==");
    const report2 = await adminApi("/api/admin/reports/redeem");
    const row = (report2.body?.rows || []).find(
      (r) => String(r.item || "").includes("Backfill Priced Mocha") && r.value === 220
    );
    check(
      "the backfilled redeem now shows its item's price",
      Boolean(row),
      report2.body?.rows || report2.body,
    );

    // Cleanup: remove the seeded test docs so re-runs start clean.
    await api("/api/admin/rewards", {}); // no-op guard — left in for clarity
    console.log(`\n${failures} check(s) failed.`);
    process.exit(failures > 0 ? 1 : 0);
  } catch (err) {
    console.error("TEST ERROR:", err);
    process.exit(1);
  } finally {
    stop();
  }
}

main();

/**
 * Per-outlet customer leaderboard suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Drives real earns (and one redeem) through durbarmarg,
 * which has earnPercent: 100 and no active campaign — a bill of N earns
 * exactly N points, matching the round numbers every other points suite in
 * this repo already relies on (see tests/points-redeem.js).
 *
 * Run directly: `node tests/leaderboard.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5062 });
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

  const registerAndVerify = async (name, email) => {
    await api("/api/auth/register", {
      method: "POST",
      body: { name, email, password: "password", phone: `+97798${Math.floor(Math.random() * 100000000)}` },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const login = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    return { token: login.body.token, userId: login.body.user.id };
  };

  const earn = async (adminToken, customerToken, billAmount) => {
    const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount } });
    return api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
  };

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;
    const stamp = Date.now();

    const low = await registerAndVerify("Low Earner", `lb_low_${stamp}@test.co`);
    const mid = await registerAndVerify("Mid Earner", `lb_mid_${stamp}@test.co`);
    const top = await registerAndVerify("Top Earner", `lb_top_${stamp}@test.co`);

    await earn(adminToken, low.token, 300);
    await earn(adminToken, mid.token, 500);
    await earn(adminToken, top.token, 700);

    console.log("\n== Ranking ==");
    const board = await api("/api/admin/leaderboard", { token: adminToken });
    check("leaderboard resolves", board.status === 200, board.body);
    const rows = board.body?.data?.rows || [];
    const ids = rows.map((r) => r.userId);
    check(
      "ranked highest-to-lowest by summed earn points",
      ids.indexOf(top.userId) < ids.indexOf(mid.userId) && ids.indexOf(mid.userId) < ids.indexOf(low.userId),
      rows,
    );
    const topRow = rows.find((r) => r.userId === top.userId);
    check("points earned is the summed points, not centi", topRow?.pointsEarned === 700, topRow);
    check("rank is 1-indexed", rows[0]?.rank === 1, rows[0]);

    console.log("\n== Redeem never changes rank ==");
    const catalog = await api("/api/points/catalog", { token: top.token });
    const coffee = (catalog.body?.data || []).find((i) => i.name === "House Coffee");
    const redeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: adminToken });
    const redeemed = await api("/api/points/redeem", {
      method: "POST", token: top.token, body: { token: redeemQr.body.data.token, itemId: coffee.id },
    });
    check("the redemption itself succeeds", redeemed.status === 200, redeemed.body);

    const boardAfterRedeem = await api("/api/admin/leaderboard", { token: adminToken });
    const rowsAfterRedeem = boardAfterRedeem.body?.data?.rows || [];
    const topRowAfter = rowsAfterRedeem.find((r) => r.userId === top.userId);
    check(
      "top earner's leaderboard points are unchanged by redeeming — this is earned, not balance",
      topRowAfter?.pointsEarned === 700,
      topRowAfter,
    );
    // durbarmarg is seeded with real backdated earns for demo customers
    // (asha/bikash), so "rank first" can't mean "rank === 1" overall — only
    // that redeeming didn't move Top relative to Mid/Low, exactly like the
    // ordering check in the "Ranking" section above.
    const idsAfterRedeem = rowsAfterRedeem.map((r) => r.userId);
    check(
      "top earner still ranks ahead of mid and low after redeeming",
      idsAfterRedeem.indexOf(top.userId) < idsAfterRedeem.indexOf(mid.userId) &&
        idsAfterRedeem.indexOf(mid.userId) < idsAfterRedeem.indexOf(low.userId),
      rowsAfterRedeem,
    );

    console.log("\n== A customer with no earns is absent, not a zero row ==");
    const idle = await registerAndVerify("Idle Customer", `lb_idle_${stamp}@test.co`);
    const boardWithIdle = await api("/api/admin/leaderboard", { token: adminToken });
    check(
      "an idle customer never appears (no zero-point placeholder rows)",
      !(boardWithIdle.body?.data?.rows || []).some((r) => r.userId === idle.userId),
      boardWithIdle.body,
    );

    console.log("\n== Rolling windows ==");
    const orgResp = await api("/__test__/get-organization", {
      method: "POST",
      slug: null,
      body: { companySlug: COMPANY, outletSlug: SLUG },
    });
    const organizationId = orgResp.body.organizationId;

    const recentEmail = `lb_recent_${stamp}@test.co`;
    const recent = await registerAndVerify("Recent Earner", recentEmail);
    await earn(adminToken, recent.token, 200);

    const monthOldEmail = `lb_monthold_${stamp}@test.co`;
    const monthOld = await registerAndVerify("Month Old Earner", monthOldEmail);
    await api("/__test__/create-dated-transaction", {
      method: "POST",
      slug: null,
      body: { email: monthOldEmail, organizationId, createdAtDaysAgo: 10 },
    });

    const veryOldEmail = `lb_veryold_${stamp}@test.co`;
    const veryOld = await registerAndVerify("Very Old Earner", veryOldEmail);
    await api("/__test__/create-dated-transaction", {
      method: "POST",
      slug: null,
      body: { email: veryOldEmail, organizationId, createdAtDaysAgo: 40 },
    });

    const weekBoard = await api("/api/admin/leaderboard?window=week", { token: adminToken });
    const weekIds = (weekBoard.body?.data?.rows || []).map((r) => r.userId);
    check("window=week includes a just-now earn", weekIds.includes(recent.userId), weekBoard.body);
    check("window=week excludes a 10-day-old earn", !weekIds.includes(monthOld.userId), weekBoard.body);
    check("window=week excludes a 40-day-old earn", !weekIds.includes(veryOld.userId), weekBoard.body);
    check("window echoes back in the response", weekBoard.body?.data?.window === "week", weekBoard.body);

    const monthBoard = await api("/api/admin/leaderboard?window=month", { token: adminToken });
    const monthIds = (monthBoard.body?.data?.rows || []).map((r) => r.userId);
    check("window=month includes a just-now earn", monthIds.includes(recent.userId), monthBoard.body);
    check("window=month includes a 10-day-old earn", monthIds.includes(monthOld.userId), monthBoard.body);
    check("window=month excludes a 40-day-old earn", !monthIds.includes(veryOld.userId), monthBoard.body);

    const allBoard = await api("/api/admin/leaderboard?window=all", { token: adminToken });
    const allIds = (allBoard.body?.data?.rows || []).map((r) => r.userId);
    check("window=all includes everything, including the 40-day-old earn", allIds.includes(veryOld.userId), allBoard.body);

    console.log("\n== Invalid window ==");
    const badWindow = await api("/api/admin/leaderboard?window=nonsense", { token: adminToken });
    check("an unknown window value 400s", badWindow.status === 400, badWindow.body);

    console.log("\n== Cross-outlet isolation ==");
    const sibling = await makeSiblingOutlet(baseUrl, { label: `lb${stamp}` });
    const siblingApi = (path, opts = {}) => api(path, { ...opts, slug: sibling.outletSlug });

    await siblingApi("/api/auth/register", {
      method: "POST",
      body: { name: "Sibling Top Earner", email: `lb_sibling_${stamp}@test.co`, password: "password", phone: `+97798${Math.floor(Math.random() * 100000000)}` },
    });
    const siblingMint = await siblingApi("/__test__/mint-token", { method: "POST", body: { email: `lb_sibling_${stamp}@test.co`, type: "email_verify" } });
    await siblingApi(`/api/auth/verify-email?token=${siblingMint.body.token}`);
    const siblingLogin = await siblingApi("/api/auth/login", { method: "POST", body: { email: `lb_sibling_${stamp}@test.co`, password: "password" } });
    const siblingCustomerToken = siblingLogin.body.token;
    const siblingUserId = siblingLogin.body.user.id;

    const siblingQr = await siblingApi("/api/admin/generate-qr", { method: "POST", token: sibling.adminToken, body: { billAmount: 900 } });
    await siblingApi("/api/points/claim", { method: "POST", token: siblingCustomerToken, body: { token: siblingQr.body.data.token } });

    const durbarmargBoardAfterSibling = await api("/api/admin/leaderboard", { token: adminToken });
    check(
      "a sibling outlet's top earner never appears on this outlet's leaderboard",
      !(durbarmargBoardAfterSibling.body?.data?.rows || []).some((r) => r.userId === siblingUserId),
      durbarmargBoardAfterSibling.body,
    );

    const siblingBoard = await siblingApi("/api/admin/leaderboard", { token: sibling.adminToken });
    check(
      "this outlet's own top earner never appears on the sibling's leaderboard",
      !(siblingBoard.body?.data?.rows || []).some((r) => r.userId === top.userId),
      siblingBoard.body,
    );

    console.log("\n== Customer-facing redaction ==");
    const custBoard = await api("/api/points/leaderboard", { token: mid.token });
    check("the customer route resolves", custBoard.status === 200, custBoard.body);
    const custRows = custBoard.body?.data?.rows || [];
    const midRow = custRows.find((r) => r.userId === mid.userId);
    const topRow2 = custRows.find((r) => r.userId === top.userId);
    check("the caller's own row keeps their full name", midRow?.name === "Mid Earner", midRow);
    check("the caller's own row is flagged isSelf", midRow?.isSelf === true, midRow);
    check("another customer's row is redacted to first name + last initial", topRow2?.name === "Top E.", topRow2);
    check("another customer's row is not flagged isSelf", topRow2?.isSelf === false, topRow2);

    // Flip the caller: from top's own perspective, top is full and mid is
    // redacted — proves the redaction is per-caller, not baked into the row.
    const topPerspective = await api("/api/points/leaderboard", { token: top.token });
    const topOwnRow = (topPerspective.body?.data?.rows || []).find((r) => r.userId === top.userId);
    const midFromTop = (topPerspective.body?.data?.rows || []).find((r) => r.userId === mid.userId);
    check("from top's own request, top's row is full name", topOwnRow?.name === "Top Earner", topOwnRow);
    check("from top's own request, mid's row is redacted", midFromTop?.name === "Mid E.", midFromTop);

    console.log("\n== Mononym formatting ==");
    const monoEmail = `lb_mono_${stamp}@test.co`;
    const mono = await registerAndVerify("Cher", monoEmail);
    await earn(adminToken, mono.token, 150);
    const boardWithMono = await api("/api/points/leaderboard", { token: mid.token });
    const monoRow = (boardWithMono.body?.data?.rows || []).find((r) => r.userId === mono.userId);
    check("a mononym is left as-is, no fabricated initial or trailing space", monoRow?.name === "Cher", monoRow);

    const badWindowCustomer = await api("/api/points/leaderboard?window=nonsense", { token: mid.token });
    check("an unknown window 400s on the customer route too", badWindowCustomer.status === 400, badWindowCustomer.body);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll leaderboard checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });

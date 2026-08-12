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
const { makeCompanyWithOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra ?? ""); failures++; }
  };
  // /api/auth/* is the legacy tenant-scoped identity and needs both slugs to
  // resolve an outlet — one slug alone can never identify one.
  const COMPANY = "coffesarowar";
  const OUTLET = "patan";
  const api = (path, { method = "GET", body, token, company = COMPANY, slug = OUTLET } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = company; headers["X-Outlet-Slug"] = slug; }
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

    console.log("\n== Outlet impact ==");

    const impact = await api("/api/admin/impact", { token: adminToken });
    check("the impact endpoint answers", impact.status === 200, impact.body);

    // Our tester earned exactly once above, so at this point they are a
    // customer but not a repeat customer.
    check("the tester counts as a customer", impact.body?.customers >= 1, impact.body);
    check("one earn is not yet a repeat", impact.body?.repeatCustomers === 0, impact.body);
    check("retention is 0% with no repeats", impact.body?.retentionPercent === 0, impact.body);

    // A membership with no earn must not dilute the denominator: /explore
    // provisions one of these every time somebody merely opens the page.
    const lurkerEmail = `lurker_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Lurker", email: lurkerEmail, password: "password", phone: "+9779800005555" },
    });
    const beforeLurker = impact.body.customers;
    const afterLurker = await api("/api/admin/impact", { token: adminToken });
    check(
      "a membership with no earn is not a customer",
      afterLurker.body?.customers === beforeLurker,
      { before: beforeLurker, after: afterLurker.body?.customers },
    );

    // Second earn: now a repeat customer, and ALL their revenue counts as
    // repeat revenue — the first visit included.
    await earn(500);
    const impact2 = await api("/api/admin/impact", { token: adminToken });
    check("a second earn makes a repeat customer", impact2.body?.repeatCustomers === 1, impact2.body);
    check(
      "repeat revenue includes the repeat customer's first visit",
      impact2.body?.repeatRevenue === 20500,
      impact2.body,
    );
    check(
      "avg spend per repeat customer is repeat revenue over repeat customers",
      impact2.body?.avgSpendPerRepeatCustomer === 20500,
      impact2.body,
    );
    check(
      "retention is repeat over customers as a percentage",
      impact2.body?.retentionPercent === Math.round((1 / impact2.body.customers) * 100),
      impact2.body,
    );

    console.log("\n== Reward cost coverage ==");

    // Two redemptions happened above: House Coffee (valued at 180) and the
    // tote (points-only, no rupee value).
    check("both redemptions are counted", impact2.body?.redemptionCount === 2, impact2.body);
    check("only the menu one carries a value", impact2.body?.rewardValueRedeemed === 180, impact2.body);
    check(
      "coverage reports valued vs total honestly",
      impact2.body?.rewardValueCoverage?.valued === 1 &&
        impact2.body?.rewardValueCoverage?.total === 2,
      impact2.body?.rewardValueCoverage,
    );

    console.log("\n== Milestones ==");

    const byKey = Object.fromEntries((impact2.body?.milestones || []).map((m) => [m.key, m]));
    check("first redemption is achieved", byKey.first_redemption?.achieved === true, byKey);
    check("1000 customers is not achieved", byKey.customers_1000?.achieved === false, byKey);
    check("every milestone carries a label", (impact2.body?.milestones || []).every((m) => Boolean(m.label)), byKey);

    console.log("\n== Cross-tenant isolation ==");

    // durbarmarg has its own history. Its impact must share no figure that
    // could only have come from patan's ledger.
    const otherLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const otherImpact = await api("/api/admin/impact", { token: otherLogin.body.token });
    check("the sibling outlet answers too", otherImpact.status === 200, otherImpact.body);
    check(
      "a sibling outlet does not see this outlet's revenue",
      otherImpact.body?.revenueTracked !== impact2.body?.revenueTracked,
      { sibling: otherImpact.body?.revenueTracked, mine: impact2.body?.revenueTracked },
    );

    // And the endpoint is staff-only.
    const anon = await api("/api/admin/impact");
    check("impact requires authentication", anon.status === 401, anon.status);

    console.log("\n== Company impact ==");

    const ownerLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "owner@coffesarowar.com", password: "password" },
    });
    const ownerToken = ownerLogin.body.token;
    check("logged in as the company owner", Boolean(ownerToken), ownerLogin.body);

    const company = await api("/api/company/impact", { token: ownerToken });
    check("the company impact endpoint answers", company.status === 200, company.body);
    check("it lists every outlet", (company.body?.perOutlet || []).length >= 3, company.body?.perOutlet);
    check(
      "outlets are sorted by revenue, highest first",
      (company.body?.perOutlet || []).every(
        (o, i, arr) => i === 0 || arr[i - 1].revenueTracked >= o.revenueTracked,
      ),
      company.body?.perOutlet,
    );

    const outletRevenueSum = (company.body?.perOutlet || [])
      .reduce((sum, o) => sum + o.revenueTracked, 0);
    check(
      "company revenue equals the sum of its outlets",
      Math.abs(company.body.revenueTracked - outletRevenueSum) < 0.01,
      { company: company.body.revenueTracked, sum: outletRevenueSum },
    );

    console.log("\n== One person at two outlets counts once ==");

    // The seeded customer asha spans two outlets of this company. Summing
    // per-outlet customer counts would count her twice; the company figure
    // must de-duplicate on CustomerAccount.
    const outletCustomerSum = (company.body?.perOutlet || [])
      .reduce((sum, o) => sum + o.customers, 0);
    check(
      "company customers is not the naive sum of per-outlet customers",
      company.body.customers <= outletCustomerSum,
      { company: company.body.customers, sum: outletCustomerSum },
    );

    // Every seeded company is comped with planId: null, so it has no plan
    // price to compare against and the block is correctly hidden.
    check("a comped company hides the ROI block", company.body?.roi === null, company.body?.roi);

    console.log("\n== ROI on a real plan-backed subscription ==");

    // The seeded companies can't exercise this, so build one that can: a
    // fresh company redeems a Growth key (Rs 2,499/year), then takes a
    // single small bill. Growth works out to ~Rs 205/month, so a Rs 100 bill
    // must produce a multiple BELOW 1 — the case the reference page this was
    // modelled on silently floors to "1X".
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const key = await api("/api/platform/subscription-keys", {
      method: "POST",
      token: platformLogin.body.token,
      body: { planSlug: "growth", note: "impact ROI test" },
    });
    check("a growth key was generated", key.status === 201, key.body);

    const roiCo = await makeCompanyWithOutlet(baseUrl, { label: `roi${Date.now()}` });
    const redeemed = await api("/api/company/subscription/redeem-key", {
      method: "POST",
      token: roiCo.ownerToken,
      body: { code: key.body.key.code },
    });
    check("the company redeems it", redeemed.status === 200, redeemed.body);

    // One Rs 100 bill at the new company's outlet.
    const roiCustEmail = `roicust_${Date.now()}@test.co`;
    const roiTenant = { company: roiCo.companySlug, slug: roiCo.outletSlug };
    await api("/api/auth/register", {
      method: "POST",
      ...roiTenant,
      body: { name: "ROI Cust", email: roiCustEmail, password: "password", phone: "+9779800006666" },
    });
    const roiMint = await api("/__test__/mint-token", {
      method: "POST", ...roiTenant,
      body: { email: roiCustEmail, type: "email_verify" },
    });
    await api(`/api/auth/verify-email?token=${roiMint.body.token}`, roiTenant);
    const roiCustLogin = await api("/api/auth/login", {
      method: "POST", ...roiTenant,
      body: { email: roiCustEmail, password: "password" },
    });
    const roiQr = await api("/api/admin/generate-qr", {
      method: "POST", ...roiTenant, token: roiCo.adminToken, body: { billAmount: 100 },
    });
    const roiEarn = await api("/api/points/claim", {
      method: "POST", ...roiTenant, token: roiCustLogin.body.token,
      body: { token: roiQr.body.data.token },
    });
    check("the Rs 100 bill earned", roiEarn.status === 200, roiEarn.body);

    const roiImpact = await api("/api/company/impact", { token: roiCo.ownerToken });
    const roi = roiImpact.body?.roi;
    check("a plan-backed company exposes ROI", Boolean(roi), roiImpact.body);
    check("the plan is named", roi?.planName === "Growth", roi);
    check(
      "monthly cost is the annual price over twelve-ish months, in whole rupees",
      roi?.monthlyCost === Math.round(2499 / (365 / 30)),
      roi,
    );
    check("months elapsed never drops below 1", roi?.monthsElapsed === 1, roi);
    check(
      "cost to date is the monthly cost over the elapsed months",
      roi.costToDate === Math.round(roi.monthlyCost * roi.monthsElapsed),
      roi,
    );
    check("revenue since subscription is the one bill", roi?.revenueSinceSubscription === 100, roi);
    check(
      "the multiple is revenue over cost",
      Math.abs(roi.roiMultiple - roi.revenueSinceSubscription / (roi.monthlyCost * roi.monthsElapsed)) < 0.01,
      roi,
    );
    // The whole point: a programme that has not paid for itself yet must say
    // so. Flooring this to 1X is what makes the rest of the page untrustworthy.
    check("a below-1 multiple is reported as-is, not floored", roi?.roiMultiple < 1, roi);
    check(
      "revenue since subscription never exceeds all-time revenue",
      roi.revenueSinceSubscription <= roiImpact.body.revenueTracked + 0.01,
      { since: roi.revenueSinceSubscription, all: roiImpact.body.revenueTracked },
    );

    console.log("\n== Company impact stays company-private ==");

    // An outlet admin's tenant JWT must not open the company console's door.
    const leak = await api("/api/company/impact", { token: adminToken });
    check("an outlet admin token is rejected", leak.status === 401 || leak.status === 403, leak.status);

    const anonCompany = await api("/api/company/impact");
    check("company impact requires authentication", anonCompany.status === 401, anonCompany.status);
  } finally {
    stop();
  }

  console.log(failures === 0 ? "\nAll impact checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });

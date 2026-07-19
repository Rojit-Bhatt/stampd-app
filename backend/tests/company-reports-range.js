/**
 * Date-range filtering on the company owner's cross-outlet rollup
 * (GET /api/company/reports/rollup). Self-contained: boots its own server
 * on a dedicated port against the in-memory mock DB.
 *
 * demoSeed.js backdates real earn transactions on durbarmarg (asha/bikash's
 * visits), so this can't assert on an absolute revenue figure without also
 * hardcoding the seed's numbers. Instead it asserts on the DELTA a single
 * fresh, dated earn makes: a range ending yesterday must be unaffected by an
 * earn created today; the same range widened to include today must go up by
 * exactly that bill's revenue. That holds regardless of whatever the seed
 * already put in the ledger.
 *
 * Also covers: an omitted range still resolves (the trailing-30-days
 * default) rather than 400ing or silently returning the company's entire
 * history; customer counts are never range-filtered, since they're a
 * snapshot of who exists, not a flow.
 *
 * Run directly: `node tests/company-reports-range.js`
 */

const { bootServer } = require("./helpers/bootServer");

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (d) => d.toISOString().slice(0, 10);
const BILL = 400;

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5049 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, company, outlet, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (company) headers["X-Company-Slug"] = company;
    if (outlet) headers["X-Outlet-Slug"] = outlet;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  const durbarmarg = (rollup) => (rollup?.outlets || []).find((o) => o.slug === "durbarmarg");

  try {
    // Coffesarowar Group's owner, per demoSeed.js.
    const ownerLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "owner@coffesarowar.com", password: "password" },
    });
    const companyToken = ownerLogin.body.token;
    check("company owner signs in", ownerLogin.status === 200 && Boolean(companyToken), ownerLogin.body);

    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const email = `range_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      company: "coffesarowar",
      outlet: "durbarmarg",
      body: { name: "Range Tester", email, password: "password", phone: "+9779800004444" },
    });
    const mint = await api("/__test__/mint-token", {
      method: "POST",
      company: "coffesarowar",
      outlet: "durbarmarg",
      body: { email, type: "email_verify" },
    });
    const verify = await api(`/api/auth/verify-email?token=${mint.body.token}`, {
      company: "coffesarowar",
      outlet: "durbarmarg",
    });
    check("the test customer's email verifies", verify.status === 200, verify.body);
    const custLogin = await api("/api/auth/login", {
      method: "POST",
      company: "coffesarowar",
      outlet: "durbarmarg",
      body: { email, password: "password" },
    });
    const custToken = custLogin.body.token;

    // A long historical window, cut off at "yesterday" — wide enough to
    // catch every backdated seed visit, but strictly before today.
    const historyStart = isoDate(new Date(Date.now() - 90 * DAY_MS));
    const yesterday = isoDate(new Date(Date.now() - DAY_MS));
    const today = isoDate(new Date());

    console.log("\n== Baseline, before today's earn ==");
    const before = await api(
      `/api/company/reports/rollup?startDate=${historyStart}&endDate=${yesterday}`,
      { token: companyToken },
    );
    check("the range request succeeds", before.status === 200, before.body);
    const baselineRevenue = durbarmarg(before.body)?.revenue;
    const baselineCustomers = durbarmarg(before.body)?.customersCount;
    check("durbarmarg has a baseline revenue figure", typeof baselineRevenue === "number", before.body);

    // Earn a fresh, dated bill right now — the flow event the range filter
    // has to include or exclude correctly.
    const qr = await api("/api/admin/generate-qr", {
      method: "POST",
      token: adminToken,
      body: { billAmount: BILL },
    });
    const earn = await api("/api/points/claim", {
      method: "POST",
      token: custToken,
      body: { token: qr.body.data.token },
    });
    check("the test earn succeeds", earn.status === 200, earn.body);

    console.log("\n== Same range, unaffected by today's earn ==");
    const excluding = await api(
      `/api/company/reports/rollup?startDate=${historyStart}&endDate=${yesterday}`,
      { token: companyToken },
    );
    const excludingRevenue = durbarmarg(excluding.body)?.revenue;
    check(
      "a range ending yesterday is untouched by an earn created today",
      excludingRevenue === baselineRevenue,
      { baselineRevenue, excludingRevenue },
    );

    console.log("\n== Same range widened to include today ==");
    const including = await api(
      `/api/company/reports/rollup?startDate=${historyStart}&endDate=${today}`,
      { token: companyToken },
    );
    const includingRevenue = durbarmarg(including.body)?.revenue;
    check(
      "widening the range to include today adds exactly this bill's revenue",
      Math.round((includingRevenue - excludingRevenue) * 100) / 100 === BILL,
      { excludingRevenue, includingRevenue, expectedDelta: BILL },
    );
    check(
      "the company total moved by the same amount",
      Math.round((including.body.totals.revenue - before.body.totals.revenue) * 100) / 100 === BILL,
      { before: before.body.totals.revenue, after: including.body.totals.revenue },
    );
    check(
      "the response echoes back the resolved range",
      Boolean(including.body?.range?.start) && Boolean(including.body?.range?.end),
      including.body?.range,
    );

    console.log("\n== No range given at all ==");
    const noRange = await api("/api/company/reports/rollup", { token: companyToken });
    check("an unfiltered request still succeeds (defaults, doesn't 400)", noRange.status === 200, noRange.body);
    check(
      "the default (trailing 30 days) window catches today's earn",
      durbarmarg(noRange.body)?.revenue >= includingRevenue,
      durbarmarg(noRange.body),
    );

    console.log("\n== Customer counts are never range-filtered ==");
    check(
      "durbarmarg's customer count is identical whether the earn is in-range or not",
      durbarmarg(excluding.body)?.customersCount === durbarmarg(including.body)?.customersCount &&
        durbarmarg(excluding.body)?.customersCount === baselineCustomers,
      {
        baselineCustomers,
        excluding: durbarmarg(excluding.body)?.customersCount,
        including: durbarmarg(including.body)?.customersCount,
      },
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`\ncompany-reports-range: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\ncompany-reports-range: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

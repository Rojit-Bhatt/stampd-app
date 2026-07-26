/**
 * Tier distribution analytics suite (outlet-level).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Configures tier thresholds on durbarmarg, drives two
 * customers to different tiers plus one untiered customer, and confirms
 * the distribution tallies correctly.
 *
 * Run directly: `node tests/tier-distribution.js`
 */

const { bootServer } = require("./helpers/bootServer");
const ExcelJS = require("exceljs");

async function readSheetAsObjects(buffer, sheetIndex = 0) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[sheetIndex];
  const rows = [];
  sheet.eachRow((row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => values.push(cell.value));
    rows.push(values);
  });
  const header = rows[0] || [];
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5031 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
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
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { tierThresholds: { Bronze: { minVisits: 1, minSpend: 100 }, Silver: { minVisits: 2, minSpend: 700 } } },
    });

    // durbarmarg carries real seeded customers (asha, bikash) with their own
    // earn history, so tier counts are never 0 at baseline — capture the
    // baseline right after configuring thresholds and assert on the DELTA
    // this test's own three customers introduce, not on absolute counts.
    const baseline = await api("/api/admin/tier-distribution", { token: adminToken });

    // Customer A: two earns (800 total) -> Silver.
    const emailA = `dist_a_${Date.now()}@test.co`;
    await api("/api/auth/register", { method: "POST", body: { name: "Dist A", email: emailA, password: "password123", phone: "9811111111" } });
    const mintA = await api("/__test__/mint-token", { method: "POST", body: { email: emailA, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mintA.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const loginA = await api("/api/auth/login", { method: "POST", body: { email: emailA, password: "password123" } });
    const tokenA = loginA.body.token;
    const genA1 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 500 } });
    await api("/api/points/claim", { method: "POST", token: tokenA, body: { token: genA1.body.data.token } });
    const genA2 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 300 } });
    await api("/api/points/claim", { method: "POST", token: tokenA, body: { token: genA2.body.data.token } });

    // Customer B: one earn (500) -> Bronze.
    const emailB = `dist_b_${Date.now()}@test.co`;
    await api("/api/auth/register", { method: "POST", body: { name: "Dist B", email: emailB, password: "password123", phone: "9811111112" } });
    const mintB = await api("/__test__/mint-token", { method: "POST", body: { email: emailB, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mintB.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const loginB = await api("/api/auth/login", { method: "POST", body: { email: emailB, password: "password123" } });
    const tokenB = loginB.body.token;
    const genB1 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 500 } });
    await api("/api/points/claim", { method: "POST", token: tokenB, body: { token: genB1.body.data.token } });

    // Customer C: no earns at all -> untiered.
    const emailC = `dist_c_${Date.now()}@test.co`;
    await api("/api/auth/register", { method: "POST", body: { name: "Dist C", email: emailC, password: "password123", phone: "9811111113" } });
    const mintC = await api("/__test__/mint-token", { method: "POST", body: { email: emailC, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mintC.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const tokenC = (await api("/api/auth/login", { method: "POST", body: { email: emailC, password: "password123" } })).body.token;
    // C earns nothing but still needs at least one earn to appear in the
    // customer list at all (getCustomerDetailRows returns every customer
    // now, per the production-readiness fix — so C is visible with 0
    // earns and correctly falls under "untiered").

    const dist = await api("/api/admin/tier-distribution", { token: adminToken });
    check("tier-distribution -> 200", dist.status === 200);
    check("Bronze count increases by exactly 1 (customer B)", dist.body.Bronze === baseline.body.Bronze + 1);
    check("Silver count increases by exactly 1 (customer A)", dist.body.Silver === baseline.body.Silver + 1);
    check("Gold count is unaffected (unconfigured)", dist.body.Gold === baseline.body.Gold && dist.body.Gold === 0);
    check("Platinum count is unaffected (unconfigured)", dist.body.Platinum === baseline.body.Platinum && dist.body.Platinum === 0);
    check("untiered count increases by exactly 1 (customer C)", dist.body.untiered === baseline.body.untiered + 1);

    const customersDownloadRaw = await fetch(`${baseUrl}/api/admin/reports/customers/download`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG },
    });
    check("customers download -> 200", customersDownloadRaw.status === 200);
    const customersBuf = Buffer.from(await customersDownloadRaw.arrayBuffer());
    const customersRows = await readSheetAsObjects(customersBuf);
    const rowA = customersRows.find((r) => r.Email === emailA);
    const rowC = customersRows.find((r) => r.Email === emailC);
    check("customers workbook has a Tier column with the right value for a Silver customer", rowA?.Tier === "Silver");
    check("customers workbook shows an em-dash for an untiered customer", rowC?.Tier === "—");
  } finally {
    stop();
  }

  if (failures) { console.error(`tier-distribution: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("tier-distribution: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

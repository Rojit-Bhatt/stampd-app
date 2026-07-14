/**
 * Excel business reports suite (Epic D2).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Drives a claim with a bill amount, then confirms the
 * summary stats are correctly scoped to a date range (inclusion via a range
 * covering today, exclusion via a range entirely in the future), and that
 * both report downloads parse back with the right shape.
 *
 * Run directly: `node tests/business-reports.js`
 */

const XLSX = require("xlsx");
const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5017 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) headers["X-Tenant-Slug"] = slug;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const email = `d2_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "D2 Tester", email, password: "password", phone: "+9779813334444", address: "45 Report Rd" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Tenant-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    const gen = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 400 } });
    const claim = await api("/api/stamps/claim", { method: "POST", token: customerToken, body: { token: gen.body.data.token } });
    check("claim with bill amount succeeds", claim.status === 200);

    const today = new Date();
    const todayStart = isoDate(today);
    const todayEnd = isoDate(new Date(today.getTime() + 24 * 60 * 60 * 1000));

    // Inclusive range: covers today, so the claim above must be counted.
    const included = await api(
      `/api/admin/reports/summary?startDate=${todayStart}&endDate=${todayEnd}`,
      { token: adminToken },
    );
    check("inclusive range -> 200", included.status === 200);
    check("inclusive range counts the new customer", included.body.newCustomers >= 1);
    check("inclusive range counts the stamp claim", included.body.stampsIssued >= 1);
    check("inclusive range includes the revenue", included.body.totalRevenue >= 400);

    // Exclusive range: entirely in the future, must exclude everything.
    const future = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000);
    const futureStart = isoDate(future);
    const futureEnd = isoDate(new Date(future.getTime() + 24 * 60 * 60 * 1000));
    const excluded = await api(
      `/api/admin/reports/summary?startDate=${futureStart}&endDate=${futureEnd}`,
      { token: adminToken },
    );
    check("exclusive (future) range -> 200", excluded.status === 200);
    check("exclusive range shows 0 new customers", excluded.body.newCustomers === 0);
    check("exclusive range shows 0 stamps issued", excluded.body.stampsIssued === 0);
    check("exclusive range shows 0 revenue", excluded.body.totalRevenue === 0);

    // No params -> defaults to last 30 days, must not error and must include today's activity.
    const defaulted = await api("/api/admin/reports/summary", { token: adminToken });
    check("default range -> 200", defaulted.status === 200);
    check("default range includes today's claim", defaulted.body.stampsIssued >= 1);

    // Summary download parses back with the right values.
    const summaryDownload = await fetch(
      `${baseUrl}/api/admin/reports/summary/download?startDate=${todayStart}&endDate=${todayEnd}`,
      { headers: { Authorization: `Bearer ${adminToken}`, "X-Tenant-Slug": SLUG } },
    );
    check("summary download -> 200", summaryDownload.status === 200);
    const summaryBuf = Buffer.from(await summaryDownload.arrayBuffer());
    const summaryWb = XLSX.read(summaryBuf, { type: "buffer" });
    const summaryRows = XLSX.utils.sheet_to_json(summaryWb.Sheets[summaryWb.SheetNames[0]], { header: 1 });
    const summaryFlat = summaryRows.flat().join(" ");
    check("summary workbook mentions stamps issued", summaryFlat.toLowerCase().includes("stamps issued"));

    // Customers download parses back with the right columns and the new customer's row.
    const customersDownload = await fetch(`${baseUrl}/api/admin/reports/customers/download`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Tenant-Slug": SLUG },
    });
    check("customers download -> 200", customersDownload.status === 200);
    const customersBuf = Buffer.from(await customersDownload.arrayBuffer());
    const customersWb = XLSX.read(customersBuf, { type: "buffer" });
    const customersRows = XLSX.utils.sheet_to_json(customersWb.Sheets[customersWb.SheetNames[0]]);
    const myRow = customersRows.find((r) => r.Email === email);
    check("customers workbook has a row for the new customer", Boolean(myRow));
    check("customers row has correct phone", myRow?.Phone === "+9779813334444");
    check("customers row has correct total spent", myRow?.["Total Spent"] === 400);

    // Tenant isolation.
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const runSuffix = Date.now();
    const secondSlug = `brewhaven-${runSuffix}`;
    const secondAdminEmail = `boss+${runSuffix}@brewhaven.test`;
    await api("/api/platform/businesses", {
      method: "POST",
      slug: undefined,
      token: platformToken,
      body: {
        name: "Brew Haven",
        slug: secondSlug,
        adminName: "Haven Boss",
        adminEmail: secondAdminEmail,
        adminPassword: "password",
      },
    });
    const secondLogin = await api("/api/auth/login", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, password: "password" } });
    const secondSummary = await api(
      `/api/admin/reports/summary?startDate=${todayStart}&endDate=${todayEnd}`,
      { slug: secondSlug, token: secondLogin.body.token },
    );
    check("second tenant's summary shows 0 (unaffected by coffesarowar's activity)", secondSummary.body.stampsIssued === 0);
  } finally {
    stop();
  }

  if (failures) { console.error(`business-reports: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("business-reports: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

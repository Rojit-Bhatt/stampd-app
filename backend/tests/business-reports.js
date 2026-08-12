/**
 * Excel business reports suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Drives an earn with a bill amount, then confirms the
 * summary stats are correctly scoped to a date range (inclusion via a range
 * covering today, exclusion via a range entirely in the future), that every
 * report download parses back with the right shape, and that the dashboard
 * stats endpoint returns real (non-fabricated) numbers.
 *
 * Run directly: `node tests/business-reports.js`
 */

const ExcelJS = require("exceljs");
const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function readSheetRows(buffer, sheetIndex = 0) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[sheetIndex];
  const rows = [];
  sheet.eachRow((row) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell) => values.push(cell.value));
    rows.push(values);
  });
  return rows;
}

async function readSheetAsObjects(buffer, sheetIndex = 0) {
  const rows = await readSheetRows(buffer, sheetIndex);
  const header = rows[0] || [];
  return rows.slice(1).map((row) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
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

    const email = `d2_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "D2 Tester", email, password: "password", phone: "+9779813334444", address: "45 Report Rd" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    const gen = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 400 } });
    const claim = await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: gen.body.data.token } });
    check("earn on a 400 bill succeeds", claim.status === 200);

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
    check("inclusive range counts the points issued", included.body.pointsIssued >= 400);
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
    check("exclusive range shows 0 points issued", excluded.body.pointsIssued === 0);
    check("exclusive range shows 0 revenue", excluded.body.totalRevenue === 0);

    // No params -> defaults to last 30 days, must not error and must include today's activity.
    const defaulted = await api("/api/admin/reports/summary", { token: adminToken });
    check("default range -> 200", defaulted.status === 200);
    check("default range includes today's earn", defaulted.body.pointsIssued >= 400);

    // Summary download parses back with the right values (now via ExcelJS).
    const summaryDownload = await fetch(
      `${baseUrl}/api/admin/reports/summary/download?startDate=${todayStart}&endDate=${todayEnd}`,
      { headers: { Authorization: `Bearer ${adminToken}`, "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } },
    );
    check("summary download -> 200", summaryDownload.status === 200);
    const summaryBuf = Buffer.from(await summaryDownload.arrayBuffer());
    const summaryRows = await readSheetRows(summaryBuf);
    const summaryFlat = summaryRows.flat().join(" ");
    check("summary workbook mentions points issued", summaryFlat.toLowerCase().includes("points issued"));

    // Customers download parses back with the right columns and the new customer's row.
    const customersDownload = await fetch(`${baseUrl}/api/admin/reports/customers/download`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG },
    });
    check("customers download -> 200", customersDownload.status === 200);
    const customersBuf = Buffer.from(await customersDownload.arrayBuffer());
    const customersRows = await readSheetAsObjects(customersBuf);
    const myRow = customersRows.find((r) => r.Email === email);
    check("customers workbook has a row for the new customer", Boolean(myRow));
    check("customers row has correct phone", myRow?.Phone === "+9779813334444");
    check("customers row has correct total spent", myRow?.["Total Spent"] === 400);

    // Dashboard stats: real numbers, not fabricated. The snapshot metric
    // (points outstanding) must carry no trend; flow metrics must.
    const dashboard = await api("/api/admin/dashboard-stats", { token: adminToken });
    check("dashboard-stats -> 200", dashboard.status === 200);
    check("dashboard newCustomers has a numeric value", typeof dashboard.body?.newCustomers?.value === "number");
    check("dashboard newCustomers reflects today's signup", dashboard.body?.newCustomers?.value >= 1);
    check("dashboard pointsIssued reflects today's earn", dashboard.body?.pointsIssued?.value >= 400);
    check("dashboard revenue reflects today's bill amount", dashboard.body?.revenue?.value >= 400);
    check("dashboard pointsOutstanding has no trend (snapshot metric)", dashboard.body?.pointsOutstanding?.trend === null);
    check("dashboard pointsOutstanding counts the balance just earned", dashboard.body?.pointsOutstanding?.value >= 400);
    check("dashboard pointsVelocity covers 14 days", Array.isArray(dashboard.body?.pointsVelocity) && dashboard.body.pointsVelocity.length === 14);
    check("dashboard pointsActivity covers 8 weeks", Array.isArray(dashboard.body?.pointsActivity) && dashboard.body.pointsActivity.length === 8);
    const todayVelocity = dashboard.body.pointsVelocity.find((d) => d.date === todayStart);
    check("today's earn appears in the velocity series", Boolean(todayVelocity) && todayVelocity.points >= 400);

    // The transactions export is the ledger as a spreadsheet.
    const txnDownload = await fetch(`${baseUrl}/api/admin/reports/transactions/download`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG },
    });
    check("transactions download -> 200", txnDownload.status === 200);
    const txnBuf = Buffer.from(await txnDownload.arrayBuffer());
    const txnRows = await readSheetAsObjects(txnBuf);
    const myTxn = txnRows.find((r) => r.Customer === "D2 Tester");
    check("transactions workbook has this customer's earn row", Boolean(myTxn));
    check("transactions row records the bill", myTxn?.["Bill Amount"] === 400);
    check("transactions row records the points", myTxn?.Points === 400);

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
    const sibling = await makeSiblingOutlet(baseUrl, { label: `sib${Date.now()}` });
    const secondLogin = { status: 200, body: { token: sibling.adminToken } };
    const secondSummary = await api(
      `/api/admin/reports/summary?startDate=${todayStart}&endDate=${todayEnd}`,
      { slug: sibling.outletSlug, token: secondLogin.body.token },
    );
    check("second tenant's summary shows 0 (unaffected by coffesarowar's activity)", secondSummary.body.pointsIssued === 0);

    const secondDashboard = await api("/api/admin/dashboard-stats", { slug: sibling.outletSlug, token: secondLogin.body.token });
    check("second tenant's dashboard shows 0 points (unaffected)", secondDashboard.body?.pointsIssued?.value === 0);
  } finally {
    stop();
  }

  if (failures) { console.error(`business-reports: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("business-reports: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

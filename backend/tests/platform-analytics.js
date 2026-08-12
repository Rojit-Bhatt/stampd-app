/**
 * Platform-wide analytics suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * Covers: the rollup includes activity from BOTH the seeded coffesarowar
 * tenant and a freshly onboarded second tenant (i.e. it's genuinely
 * cross-tenant, not scoped to one business), and the KPI numbers move by
 * the expected amount when new activity is driven on the 2nd tenant.
 *
 * Run directly: `node tests/platform-analytics.js`
 */

const ExcelJS = require("exceljs");
const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet, makeCompanyWithOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";

async function readSheetAsObjects(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
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

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    const before = await api("/api/platform/analytics", { token: platformToken });
    check("analytics reachable -> 200", before.status === 200);
    check("outletsTotal >= 1 (seeded coffesarowar)", before.body.outletsTotal >= 1);
    check("companiesTotal >= 1 (seeded coffesarowar)", before.body.companiesTotal >= 1);
    check(
      "companiesTotal is genuinely counting companies, not outlets (the bug this fixes)",
      before.body.companiesTotal !== before.body.outletsTotal || before.body.companiesTotal === 0,
    );
    check("customersTotal is a real number", typeof before.body.customersTotal === "number" && before.body.customersTotal >= 1);
    check(
      "companiesTotal is strictly fewer than outletsTotal — proves it's counting Company docs, not re-counting outlets under the old field name",
      before.body.companiesTotal < before.body.outletsTotal,
    );
    const pointsBefore = before.body.pointsIssued.value;
    const companiesBefore = before.body.companiesTotal;
    const customersBefore = before.body.customersTotal;

    // Onboard a second tenant and drive an earn on it.
    const runSuffix = Date.now();
    const sibling = await makeSiblingOutlet(baseUrl, { label: `pa${runSuffix}` });
    const slug = sibling.outletSlug;
    check("2nd outlet stood up", Boolean(sibling.outletId));
    const adminToken = sibling.adminToken;

    const custEmail = `cust+${runSuffix}@rollup.test`;
    await api("/api/auth/register", {
      method: "POST",
      slug,
      body: { name: "Rollup Customer", email: custEmail, phone: "+9779812340000", password: "password" },
    });
    const mint = await api("/__test__/mint-token", {
      method: "POST",
      slug,
      body: { email: custEmail, type: "email_verify" },
    });
    await api(`/api/auth/verify-email?token=${mint.body.token}`, { slug });
    const custLogin = await api("/api/auth/login", { method: "POST", slug, body: { email: custEmail, password: "password" } });
    const custToken = custLogin.body.token;

    const gen = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 500 } });
    const claim = await api("/api/points/claim", { method: "POST", token: custToken, body: { token: gen.body?.data?.token } });
    check("points earned on 2nd tenant -> 200", claim.status === 200);

    const after = await api("/api/platform/analytics", { token: platformToken });
    check("outletsTotal grew by 1", after.body.outletsTotal === before.body.outletsTotal + 1);
    check(
      "companiesTotal is UNCHANGED — a sibling outlet joined an existing company, no new company",
      after.body.companiesTotal === companiesBefore,
    );
    check(
      "platform-wide pointsIssued (current-week window) grew by the 500 just earned — rollup includes the new tenant's activity",
      after.body.pointsIssued.value === pointsBefore + 500,
    );
    check("revenue is a real number reflecting the 500 bill", typeof after.body.revenue.value === "number" && after.body.revenue.value >= 500);
    check("pointsVelocity is a 14-entry day-bucketed series", Array.isArray(after.body.pointsVelocity) && after.body.pointsVelocity.length === 14);

    // A business_admin (not platform) cannot read this endpoint.
    const forbidden = await api("/api/platform/analytics", { token: adminToken });
    check("business_admin token rejected -> 403", forbidden.status === 403);

    console.log("\n== Company report: two brand-new companies, isolated numbers ==");
    const companyA = await makeCompanyWithOutlet(baseUrl, { platformToken, label: `repA${runSuffix}` });
    const companyB = await makeCompanyWithOutlet(baseUrl, { platformToken, label: `repB${runSuffix}` });

    const afterCompanies = await api("/api/platform/analytics", { token: platformToken });
    check("companiesTotal grew by 2 (two brand-new companies)", afterCompanies.body.companiesTotal === companiesBefore + 2);

    // enter-tenant/generate-qr/claim need to hit company A's / company B's
    // own slug pair, not the shared COMPANY const this file's `api()`
    // defaults to — a one-off request builder scoped to each company.
    const apiFor = (companySlug) => (path, { method = "GET", token, slug, body } = {}) => {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (slug) { headers["X-Company-Slug"] = companySlug; headers["X-Outlet-Slug"] = slug; }
      return fetch(`${baseUrl}${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    };

    const earnAndCustomer = async (company, label, billAmount) => {
      const apiC = apiFor(company.companySlug);
      const email = `${label}@rollup.test`;
      await apiC("/api/customer-auth/register", {
        method: "POST",
        body: { name: label, email, phone: "+9779812349999", password: "password" },
      });
      const mint = await apiC("/__test__/mint-global-token", {
        method: "POST", body: { email, type: "email_verify" },
      });
      await apiC(`/api/customer-auth/verify-email?token=${mint.body.token}`);
      const login = await apiC("/api/customer-auth/login", { method: "POST", body: { email, password: "password" } });
      const enter = await apiC("/api/customer-auth/enter-tenant", {
        method: "POST", token: login.body.token, slug: company.outletSlug,
      });
      const tenantToken = enter.body.token;
      const gen = await apiC("/api/admin/generate-qr", {
        method: "POST", token: company.adminToken, body: { billAmount }, slug: company.outletSlug,
      });
      return apiC("/api/points/claim", {
        method: "POST", token: tenantToken, body: { token: gen.body?.data?.token }, slug: company.outletSlug,
      });
    };

    const earnA = await earnAndCustomer(companyA, `custA${runSuffix}`, 400);
    check("company A: earn -> 200", earnA.status === 200, earnA.body);
    const earnB = await earnAndCustomer(companyB, `custB${runSuffix}`, 250);
    check("company B: earn -> 200", earnB.status === 200, earnB.body);

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const isoDate = (d) => d.toISOString().slice(0, 10);

    const downloadCurrent = await fetch(
      `${baseUrl}/api/platform/analytics/companies-report/download?startDate=${isoDate(yesterday)}&endDate=${isoDate(tomorrow)}`,
      { headers: { Authorization: `Bearer ${platformToken}` } },
    );
    check("company report download -> 200", downloadCurrent.status === 200);
    const currentRows = await readSheetAsObjects(Buffer.from(await downloadCurrent.arrayBuffer()));
    const rowA = currentRows.find((r) => r.Company === `Company repA${runSuffix}`);
    const rowB = currentRows.find((r) => r.Company === `Company repB${runSuffix}`);
    check("company A's row exists", Boolean(rowA), currentRows.map((r) => r.Company));
    check("company B's row exists", Boolean(rowB));
    check("company A's row shows exactly its own 400 points issued, not B's", rowA?.["Points Issued"] === 400, rowA);
    check("company B's row shows exactly its own 250 points issued, not A's", rowB?.["Points Issued"] === 250, rowB);
    check("company A's revenue is its own 400 bill", rowA?.Revenue === 400, rowA);
    check("company A's New Customers is 1, not leaking company B's", rowA?.["New Customers"] === 1, rowA);
    check("company A's Outlets column is 1", rowA?.Outlets === 1, rowA);

    const farPast = new Date(today.getTime() - 400 * 24 * 60 * 60 * 1000);
    const downloadPast = await fetch(
      `${baseUrl}/api/platform/analytics/companies-report/download?startDate=${isoDate(farPast)}&endDate=${isoDate(farPast)}`,
      { headers: { Authorization: `Bearer ${platformToken}` } },
    );
    const pastRows = await readSheetAsObjects(Buffer.from(await downloadPast.arrayBuffer()));
    const pastRowA = pastRows.find((r) => r.Company === `Company repA${runSuffix}`);
    check(
      "a range with no activity still lists the company, with zeroed flow columns (not omitted)",
      Boolean(pastRowA) && pastRowA["Points Issued"] === 0 && pastRowA.Revenue === 0,
      pastRowA,
    );

    const forbiddenDownload = await fetch(
      `${baseUrl}/api/platform/analytics/companies-report/download?startDate=${isoDate(yesterday)}&endDate=${isoDate(tomorrow)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    check("business_admin token rejected on the download too -> 403", forbiddenDownload.status === 403);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll platform-analytics checks passed.");
  }
}

main();

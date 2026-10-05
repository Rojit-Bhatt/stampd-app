/**
 * Database query-efficiency suite.
 *
 * Every database read is a network round trip in production (Render ->
 * MongoDB Atlas), so the hot customer path is pinned by read count:
 *
 *   - GET /api/points/balance used to re-read the outlet and company the
 *     auth middleware had just loaded, then run its remaining reads one
 *     after another (8 reads total). It must now reuse them: 6 reads —
 *     membership, outlet, company (auth) + balance, campaigns, tier earns.
 *   - User must carry an index led by customerAccountId: every
 *     "all memberships of this account" query (My Places, profile sync,
 *     export, delete) filters on it alone, and the existing compound
 *     indexes all lead with organizationId, so they couldn't serve it.
 *   - The admin ledger now filters and limits in the query instead of
 *     loading the outlet's whole history; its results must be unchanged.
 *
 * Run directly: `node tests/db-query-efficiency.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
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

  try {
    // --- Index on User.customerAccountId (schema-level). ---
    const User = require("../models/User");
    const leadsWithAccount = User.schema
      .indexes()
      .some(([fields]) => Object.keys(fields)[0] === "customerAccountId");
    check("User has an index led by customerAccountId", leadsWithAccount, User.schema.indexes());

    // --- A customer with a couple of earns at the outlet. ---
    const email = `dbq-${Date.now()}@test.co`;
    const password = "password123";
    await api("/api/customer-auth/register", {
      method: "POST", slug: null, body: { name: "DB Query", email, password, phone: "9800005555" },
    });
    const globalToken = (await api("/api/customer-auth/login", {
      method: "POST", slug: null, body: { email, password },
    })).body?.token;
    const tenantToken = (await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: globalToken, body: {},
    })).body?.token;
    const adminToken = (await api("/api/admin-auth/login", {
      method: "POST", slug: null, body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    })).body?.token;

    for (const billAmount of [300, 200]) {
      const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount } });
      await api("/api/points/claim", { method: "POST", token: tenantToken, body: { token: qr.body?.data?.token } });
    }

    // --- Balance read count. ---
    await api("/__test__/reset-db-op-stats", { method: "POST", slug: null });
    const balance = await api("/api/points/balance", { token: tenantToken });
    const stats = (await api("/__test__/db-op-stats", { slug: null })).body;
    check("balance endpoint still returns the right figure", balance.status === 200 && balance.body?.data?.balance === 500, balance.body);
    check(
      "balance endpoint does at most 6 database reads (no duplicate outlet/company reads)",
      Number.isInteger(stats?.findOps) && stats.findOps <= 6,
      stats
    );
    check("balance payload keeps lastActivityAt as a value, not missing", "lastActivityAt" in (balance.body?.data || {}), balance.body?.data);

    // --- Admin ledger: same rows, now filtered/limited in the query. ---
    const ledger = await api("/api/admin/transactions", { token: adminToken });
    const mine = (ledger.body?.data || []).filter((t) => t.customerName === "DB Query");
    check("ledger lists this customer's two earns", mine.length === 2, ledger.body?.data?.slice(0, 3));
    check(
      "ledger is newest-first",
      (ledger.body?.data || []).every((t, i, all) => i === 0 || new Date(all[i - 1].createdAt) >= new Date(t.createdAt))
    );
    check("ledger caps the unranged view at 100 rows", (ledger.body?.data || []).length <= 100);

    const today = new Date().toISOString().slice(0, 10);
    const ranged = await api(`/api/admin/transactions?startDate=${today}&endDate=${today}`, { token: adminToken });
    check(
      "a range covering today includes both earns",
      (ranged.body?.data || []).filter((t) => t.customerName === "DB Query").length === 2,
      ranged.body
    );
    const past = await api("/api/admin/transactions?startDate=2020-01-01&endDate=2020-01-02", { token: adminToken });
    check(
      "a range in the past excludes them",
      past.status === 200 && (past.body?.data || []).filter((t) => t.customerName === "DB Query").length === 0,
      past.body
    );
    const firstEarn = mine[mine.length - 1];
    check("ledger rows keep billAmount", firstEarn && firstEarn.billAmount === 300, firstEarn);
  } catch (err) {
    console.error("Suite crashed:", err);
    failures++;
  } finally {
    await stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll database query-efficiency checks passed.");
}

main();

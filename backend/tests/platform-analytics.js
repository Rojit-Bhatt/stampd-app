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

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5025 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (slug) headers["X-Tenant-Slug"] = slug;
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
    check("businessesTotal >= 1 (seeded coffesarowar)", before.body.businessesTotal >= 1);
    const stampsBefore = before.body.stampsIssued.value;

    // Onboard a second tenant and drive a stamp claim on it.
    const runSuffix = Date.now();
    const slug = `rollup-${runSuffix}`;
    const create = await api("/api/platform/businesses", {
      method: "POST",
      token: platformToken,
      body: {
        name: "Rollup Test Cafe",
        slug,
        adminName: "Owner",
        adminEmail: `owner+${runSuffix}@rollup.test`,
        adminPassword: "password",
      },
    });
    check("2nd tenant onboarded -> 201", create.status === 201);

    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      slug,
      body: { email: `owner+${runSuffix}@rollup.test`, password: "password" },
    });
    const adminToken = adminLogin.body.token;

    await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { program: { cooldownHours: 0, minBillAmount: 0 } },
    });

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
    const claim = await api("/api/stamps/claim", { method: "POST", token: custToken, body: { token: gen.body?.data?.token } });
    check("stamp claimed on 2nd tenant -> 200", claim.status === 200);

    const after = await api("/api/platform/analytics", { token: platformToken });
    check("businessesTotal grew by 1", after.body.businessesTotal === before.body.businessesTotal + 1);
    check(
      "platform-wide stampsIssued (current-week window) grew — rollup includes the new tenant's activity",
      after.body.stampsIssued.value === stampsBefore + 1,
    );
    check("revenue is a real number reflecting the 500 bill", typeof after.body.revenue.value === "number" && after.body.revenue.value >= 500);
    check("stampVelocity is a 14-entry day-bucketed series", Array.isArray(after.body.stampVelocity) && after.body.stampVelocity.length === 14);

    // A business_admin (not platform) cannot read this endpoint.
    const forbidden = await api("/api/platform/analytics", { token: adminToken });
    check("business_admin token rejected -> 403", forbidden.status === 403);
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

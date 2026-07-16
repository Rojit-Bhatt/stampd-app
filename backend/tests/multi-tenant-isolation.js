/**
 * Multi-tenant isolation test suite.
 *
 * Formalizes the ad-hoc smoke test used while converting the single-cafe
 * loyalty app into a multi-tenant white-label SaaS. Exercises, against a
 * running server (BASE):
 *   - platform admin login (no tenant header)
 *   - onboarding a fresh 2nd tenant (unique slug per run)
 *   - per-tenant public info + program-config isolation between tenants
 *   - the full customer stamp -> voucher loop on the seeded "coffesarowar"
 *     tenant, asserting the per-tenant "COFF-" voucher prefix
 *   - cross-tenant isolation: a 2nd tenant's admin cannot redeem
 *     coffesarowar's voucher, and each tenant's customer list is scoped to
 *     its own customers
 *
 * Plain CommonJS, uses global fetch (Node 18+). Not a framework test —
 * run directly: `node tests/multi-tenant-isolation.js`.
 */

const { bootServer } = require("./helpers/bootServer");

let BASE = process.env.TEST_BASE_URL || "http://localhost:5001";
let pass = 0;
let fail = 0;

const ok = (condition, message) => {
  if (condition) {
    pass++;
    console.log("  ✓", message);
  } else {
    fail++;
    console.log("  ✗ FAIL:", message);
  }
};

async function api(path, { method = "GET", token, slug, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (slug) headers["X-Tenant-Slug"] = slug;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    // non-JSON response body; leave json as null
  }
  return { status: res.status, json };
}

async function run() {
  const runSuffix = Date.now();
  const secondTenantSlug = `brewhaven-${runSuffix}`;
  const aliceEmail = `alice+${runSuffix}@x.test`;

  console.log("\n== Platform admin ==");
  const plogin = await api("/api/platform/login", {
    method: "POST",
    body: { email: "admin@stampd.co", password: "password" },
  });
  ok(plogin.status === 200 && !!plogin.json?.token, "platform admin logs in");
  const pToken = plogin.json?.token;

  console.log("\n== Onboard a 2nd tenant (unique slug, different config) ==");
  const create = await api("/api/platform/businesses", {
    method: "POST",
    token: pToken,
    body: {
      name: "Brew Haven",
      slug: secondTenantSlug,
      adminName: "Haven Boss",
      adminEmail: `boss+${runSuffix}@brewhaven.test`,
      adminPassword: "password",
    },
  });
  ok(create.status === 201 || create.status === 200, "platform creates 2nd business");
  ok(
    create.json?.tenantPath === `/${secondTenantSlug}/admin`,
    "onboarding hand-off link points at the admin login, not the customer app",
  );

  const list = await api("/api/platform/businesses", { token: pToken });
  const brew = list.json?.businesses?.find((b) => b.slug === secondTenantSlug);
  ok(!!brew?.id, "2nd business appears in businesses list with an id");

  console.log("\n== Tenant public info ==");
  const t1 = await api("/api/tenant", { slug: "coffesarowar" });
  ok(t1.status === 200 && t1.json?.tenant?.name === "Coffesarowar", "coffesarowar public info resolves");
  ok(t1.json?.tenant?.program?.stampsRequired === 5, "coffesarowar requires 5 stamps");

  const tbad = await api("/api/tenant", { slug: "does-not-exist" });
  ok(tbad.status === 404, "unknown tenant slug -> 404");

  console.log("\n== 2nd tenant admin sets its own program (isolation check) ==");
  const blogin = await api("/api/auth/login", {
    method: "POST",
    slug: secondTenantSlug,
    body: { email: `boss+${runSuffix}@brewhaven.test`, password: "password" },
  });
  ok(blogin.status === 200 && !!blogin.json?.token, "2nd tenant admin logs in via tenant login");
  const brewAdmin = blogin.json?.token;

  const setCfg = await api("/api/admin/settings", {
    method: "PATCH",
    token: brewAdmin,
    body: { program: { stampsRequired: 8, rewardTitle: "Free Pastry" } },
  });
  ok(setCfg.status === 200, "2nd tenant admin updates its program to 8 stamps / Free Pastry");

  const t2 = await api("/api/tenant", { slug: secondTenantSlug });
  ok(
    t2.json?.tenant?.program?.stampsRequired === 8 && t2.json?.tenant?.program?.rewardTitle === "Free Pastry",
    "2nd tenant now 8 stamps / Free Pastry"
  );
  const t1Again = await api("/api/tenant", { slug: "coffesarowar" });
  ok(t1Again.json?.tenant?.program?.stampsRequired === 5, "coffesarowar program unaffected by 2nd tenant's change");

  console.log("\n== Customer stamp -> voucher loop on coffesarowar ==");
  await api("/api/auth/register", {
    method: "POST",
    slug: "coffesarowar",
    body: { name: "Alice", email: aliceEmail, phone: "+9779812345678", password: "password" },
  });
  // Alice registers unverified; stamping is gated on emailVerified. Mint +
  // consume an email-verify token via the dev-only hook to verify her.
  const aliceMint = await api("/__test__/mint-token", {
    method: "POST",
    slug: "coffesarowar",
    body: { email: aliceEmail, type: "email_verify" },
  });
  const aliceVerify = await api(`/api/auth/verify-email?token=${aliceMint.json?.token}`, {
    slug: "coffesarowar",
  });
  ok(aliceVerify.status === 200, "Alice verifies her email before collecting stamps");
  const clogin = await api("/api/auth/login", {
    method: "POST",
    slug: "coffesarowar",
    body: { email: aliceEmail, password: "password" },
  });
  ok(clogin.status === 200 && !!clogin.json?.token, "customer Alice registers + logs in on coffesarowar");
  const aliceToken = clogin.json?.token;

  const bal0 = await api("/api/stamps/balance", { token: aliceToken });
  ok(bal0.json?.data?.stampsEarned === 0 && bal0.json?.data?.stampsRequired === 5, "Alice starts at 0/5 stamps");

  const baristaLogin = await api("/api/auth/login", {
    method: "POST",
    slug: "coffesarowar",
    body: { email: "barista@mansarowar.cafe", password: "password" },
  });
  ok(baristaLogin.status === 200 && !!baristaLogin.json?.token, "coffesarowar barista logs in");
  const barista = baristaLogin.json?.token;

  // Remove the 18h cooldown so the claim loop below isn't blocked by it.
  const cooldownReset = await api("/api/admin/settings", {
    method: "PATCH",
    token: barista,
    body: { program: { cooldownHours: 0 } },
  });
  ok(cooldownReset.status === 200, "barista sets cooldownHours to 0 for the test run");

  let voucherCode = null;
  for (let i = 1; i <= 5; i++) {
    const qr = await api("/api/admin/generate-qr", { method: "POST", token: barista });
    const claim = await api("/api/stamps/claim", {
      method: "POST",
      token: aliceToken,
      body: { token: qr.json?.data?.token },
    });
    if (claim.json?.data?.rewardTriggered) {
      voucherCode = claim.json.data.voucherCode;
    }
  }
  ok(!!voucherCode, `Alice earned a voucher after 5 stamps: ${voucherCode}`);
  ok(!!voucherCode && voucherCode.startsWith("COFF-"), "voucher uses coffesarowar's per-tenant prefix COFF-");

  console.log("\n== ISOLATION: 2nd tenant admin cannot redeem coffesarowar's voucher ==");
  const crossRedeem = await api("/api/admin/redeem-voucher", {
    method: "POST",
    token: brewAdmin,
    body: { voucherCode },
  });
  ok(crossRedeem.status >= 400, "cross-tenant redeem is rejected");

  const properRedeem = await api("/api/admin/redeem-voucher", {
    method: "POST",
    token: barista,
    body: { voucherCode },
  });
  ok(properRedeem.status === 200, "coffesarowar barista redeems its own voucher");

  console.log("\n== ISOLATION: customer lists are scoped per tenant ==");
  const brewCustomers = await api("/api/admin/customers", { token: brewAdmin });
  ok(
    Array.isArray(brewCustomers.json?.data) && brewCustomers.json.data.every((c) => c.email !== aliceEmail),
    "2nd tenant's customer list has no coffesarowar customers"
  );
  const coffCustomers = await api("/api/admin/customers", { token: barista });
  ok(
    Array.isArray(coffCustomers.json?.data) && coffCustomers.json.data.some((c) => c.email === aliceEmail),
    "coffesarowar's customer list includes Alice"
  );
  ok(
    Array.isArray(coffCustomers.json?.data) &&
      coffCustomers.json.data.every((c) => c.email !== `boss+${runSuffix}@brewhaven.test`),
    "coffesarowar's customer list has no 2nd-tenant users"
  );

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
  return fail ? 1 : 0;
}

(async () => {
  // Self-contained unless a base URL is supplied (TEST_BASE_URL) — boot our
  // own server on a dedicated port so `npm test` needs no running server.
  let server = null;
  if (!process.env.TEST_BASE_URL) {
    server = await bootServer({ port: 5012 });
    BASE = server.baseUrl;
  }
  let code = 1;
  try {
    code = await run();
  } catch (err) {
    console.error("Test run crashed:", err);
    code = 1;
  }
  if (server) server.stop();
  process.exit(code);
})();

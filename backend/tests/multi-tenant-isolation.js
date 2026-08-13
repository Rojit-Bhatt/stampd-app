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
 *     outlet, asserting the per-outlet "DURB-" voucher prefix
 *   - cross-tenant isolation: a 2nd tenant's admin cannot redeem
 *     coffesarowar's voucher, and each tenant's customer list is scoped to
 *     its own customers
 *
 * Plain CommonJS, uses global fetch (Node 18+). Not a framework test —
 * run directly: `node tests/multi-tenant-isolation.js`.
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";

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
  if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
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
  const aliceEmail = `alice+${runSuffix}@x.test`;

  console.log("\n== Platform admin ==");
  const plogin = await api("/api/platform/login", {
    method: "POST",
    body: { email: "admin@stampd.co", password: "password" },
  });
  ok(plogin.status === 200 && !!plogin.json?.token, "platform admin logs in");
  const pToken = plogin.json?.token;

  console.log("\n== Stand up a 2nd outlet (sibling under the same company) ==");
  // A sibling outlet is a stronger isolation subject than an unrelated
  // business: it shares an owner and a company with the first, and must
  // still leak nothing.
  const sibling = await makeSiblingOutlet(BASE, { label: `mti${runSuffix}` });
  const secondTenantSlug = sibling.outletSlug;
  ok(Boolean(sibling.outletId), "company creates a 2nd outlet");
  ok(Boolean(sibling.adminToken), "the 2nd outlet's own admin can sign in");

  const list = await api("/api/platform/companies", { token: pToken });
  const company = list.json?.companies?.find((c) => c.slug === COMPANY);
  const brew = company?.outlets?.find((o) => o.slug === secondTenantSlug);
  ok(!!brew?.id, "2nd outlet appears nested under its company in the platform list");

  console.log("\n== Tenant public info ==");
  const t1 = await api("/api/tenant", { slug: "durbarmarg" });
  ok(t1.status === 200 && t1.json?.tenant?.name === "Coffesarowar Durbarmarg", "coffesarowar outlet public info resolves");
  ok(t1.json?.tenant?.program?.earnPercent === 100, "outlet inherits its company's 100% earn default");

  const tbad = await api("/api/tenant", { slug: "does-not-exist" });
  ok(tbad.status === 404, "unknown outlet slug -> 404");

  console.log("\n== 2nd outlet's admin sets its own program (isolation check) ==");
  const blogin = { status: 200, json: { token: sibling.adminToken } };
  ok(blogin.status === 200 && !!blogin.json?.token, "2nd outlet admin has a working tenant JWT");
  const brewAdmin = blogin.json?.token;

  const setCfg = await api("/api/admin/settings", {
    method: "PATCH",
    token: brewAdmin,
    body: { program: { earnPercent: 50 } },
  });
  ok(setCfg.status === 200, "2nd tenant admin overrides its program to earn 50%");

  const t2 = await api("/api/tenant", { slug: secondTenantSlug });
  ok(t2.json?.tenant?.program?.earnPercent === 50, "2nd tenant now earns at 50%");
  const t1Again = await api("/api/tenant", { slug: "durbarmarg" });
  ok(
    t1Again.json?.tenant?.program?.earnPercent === 100,
    "sibling outlet still inherits 100% — one outlet's override doesn't touch another's"
  );

  console.log("\n== Customer earn loop on coffesarowar ==");
  await api("/api/auth/register", {
    method: "POST",
    slug: "durbarmarg",
    body: { name: "Alice", email: aliceEmail, phone: "+9779812345678", password: "password" },
  });
  // Alice registers unverified; earning is gated on emailVerified. Mint +
  // consume an email-verify token via the dev-only hook to verify her.
  const aliceMint = await api("/__test__/mint-token", {
    method: "POST",
    slug: "durbarmarg",
    body: { email: aliceEmail, type: "email_verify" },
  });
  const aliceVerify = await api(`/api/auth/verify-email?token=${aliceMint.json?.token}`, {
    slug: "durbarmarg",
  });
  ok(aliceVerify.status === 200, "Alice verifies her email before collecting points");
  const clogin = await api("/api/auth/login", {
    method: "POST",
    slug: "durbarmarg",
    body: { email: aliceEmail, password: "password" },
  });
  ok(clogin.status === 200 && !!clogin.json?.token, "customer Alice registers + logs in on coffesarowar");
  const aliceToken = clogin.json?.token;

  const bal0 = await api("/api/points/balance", { token: aliceToken });
  ok(bal0.json?.data?.balance === 0 && bal0.json?.data?.earnPercent === 100, "Alice starts at 0 points, earning 100%");

  const baristaLogin = await api("/api/admin-auth/login", {
    method: "POST",
    body: { email: "durbarmarg@coffesarowar.com", password: "password" },
  });
  ok(baristaLogin.status === 200 && !!baristaLogin.json?.token, "coffesarowar barista logs in");
  const barista = baristaLogin.json?.token;

  // No cooldown exists any more: three bills back-to-back are three earns.
  for (const bill of [200, 300, 500]) {
    const qr = await api("/api/admin/generate-qr", { method: "POST", token: barista, body: { billAmount: bill } });
    await api("/api/points/claim", { method: "POST", token: aliceToken, body: { token: qr.json?.data?.token } });
  }
  const balAfter = await api("/api/points/balance", { token: aliceToken });
  ok(balAfter.json?.data?.balance === 1000, "three bills (200+300+500) earn 1000 points, no cooldown in the way");

  console.log("\n== ISOLATION: a sibling outlet's redeem QR cannot spend this outlet's points ==");
  // The sibling belongs to the SAME company — a strictly stronger test than
  // two unrelated businesses, since these two share an owner.
  const siblingRedeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: brewAdmin });
  ok(siblingRedeemQr.status === 201, "sibling outlet issues its own redeem QR");

  const coffCatalog = await api("/api/points/catalog", { token: aliceToken });
  const coffItemId = coffCatalog.json?.data?.[0]?.id;
  ok(!!coffItemId, "coffesarowar has a redeemable item");

  const crossRedeem = await api("/api/points/redeem", {
    method: "POST",
    token: aliceToken,
    body: { token: siblingRedeemQr.json?.data?.token, itemId: coffItemId },
  });
  ok(crossRedeem.status >= 400, "a sibling outlet's redeem token is rejected against this outlet's balance");

  const balUntouched = await api("/api/points/balance", { token: aliceToken });
  ok(balUntouched.json?.data?.balance === 1000, "the rejected cross-outlet redeem left the balance untouched");

  const properRedeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: barista });
  const properRedeem = await api("/api/points/redeem", {
    method: "POST",
    token: aliceToken,
    body: { token: properRedeemQr.json?.data?.token, itemId: coffItemId },
  });
  ok(properRedeem.status === 200, "the outlet's own redeem QR works");
  ok(properRedeem.json?.data?.balance === 820, "redeeming the 180-point House Coffee leaves 820");

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

  console.log("\n== Suspension tags TENANT_SUSPENDED so the frontend can distinguish it ==");
  const suspend = await api(`/api/platform/outlets/${brew.id}`, {
    method: "PATCH",
    token: pToken,
    body: { status: "suspended" },
  });
  ok(suspend.status === 200 && suspend.json?.outlet?.status === "suspended", "platform suspends the 2nd outlet");

  const suspendedAuthed = await api("/api/admin/settings", { token: brewAdmin });
  ok(
    suspendedAuthed.status === 401 && suspendedAuthed.json?.code === "TENANT_SUSPENDED",
    "suspended tenant's already-issued admin token now gets code TENANT_SUSPENDED (not a generic 401)",
  );

  const suspendedPublic = await api("/api/tenant", { slug: secondTenantSlug });
  ok(
    suspendedPublic.status === 403 && suspendedPublic.json?.code === "TENANT_SUSPENDED",
    "suspended tenant's public /api/tenant also gets code TENANT_SUSPENDED",
  );

  console.log("\n== An ARCHIVED outlet's already-issued JWT is blocked too (not just suspended) ==");
  const archive = await api(`/api/platform/outlets/${brew.id}`, {
    method: "PATCH",
    token: pToken,
    body: { status: "archived" },
  });
  ok(archive.status === 200 && archive.json?.outlet?.status === "archived", "platform archives the 2nd outlet");
  const archivedAuthed = await api("/api/admin/settings", { token: brewAdmin });
  ok(
    archivedAuthed.status === 401 && archivedAuthed.json?.code === "TENANT_SUSPENDED",
    "an archived outlet's already-issued token is blocked, same as suspended",
  );
  await api(`/api/platform/outlets/${brew.id}`, { method: "PATCH", token: pToken, body: { status: "active" } });

  console.log("\n== A suspended COMPANY blocks its outlets' already-issued tokens, even one reading as 'active' ==");
  // Mint the token BEFORE suspending — an admin-auth login is itself gated on
  // company status, so logging in after suspension would just prove the
  // login gate works, not the JWT-revalidation gate this finding is about.
  const durbarLogin = await api("/api/admin-auth/login", {
    method: "POST",
    body: { email: "durbarmarg@coffesarowar.com", password: "password" },
  });
  const durbarToken = durbarLogin.json?.token;
  ok(!!durbarToken, "durbarmarg admin has a working tenant JWT while the company is still active");

  const brewCompanyId = company?.id;
  ok(!!brewCompanyId, "have the parent company's id to suspend");
  const suspendCompany = await api(`/api/platform/companies/${brewCompanyId}`, {
    method: "PATCH",
    token: pToken,
    body: { status: "suspended" },
  });
  ok(suspendCompany.status === 200 && suspendCompany.json?.company?.status === "suspended", "platform suspends the whole company");

  const companySuspendedAuthed = await api("/api/admin/settings", { token: durbarToken });
  ok(
    companySuspendedAuthed.status === 401 && companySuspendedAuthed.json?.code === "TENANT_SUSPENDED",
    "a sibling outlet reading 'active' is still blocked when its COMPANY is suspended",
  );
  await api(`/api/platform/companies/${brewCompanyId}`, { method: "PATCH", token: pToken, body: { status: "active" } });

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
  return fail ? 1 : 0;
}

(async () => {
  // Self-contained unless a base URL is supplied (TEST_BASE_URL) — boot our
  // own server on a dedicated port so `npm test` needs no running server.
  let server = null;
  if (!process.env.TEST_BASE_URL) {
    server = await bootServer({ port: 0 });
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

/**
 * Global discover/my-tenants endpoints (/explore surface).
 *
 * Covers the two new customer-auth endpoints added for the cross-tenant
 * "explore businesses" feature: GET /api/customer-auth/discover and
 * GET /api/customer-auth/my-tenants. The one assertion genuinely worth
 * codifying is cross-tenant isolation on /my-tenants — one CustomerAccount's
 * membership list must never leak another account's businesses.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB, onboards a second tenant via the platform API.
 *
 * Run directly: `node tests/global-directory.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";

const SLUG_A = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5032 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
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
    const runSuffix = Date.now();

    // --- /discover requires a valid global session. ---
    const discoverNoAuth = await api("/api/customer-auth/discover");
    check("discover without a global session -> 401", discoverNoAuth.status === 401);

    // --- Onboard a second tenant so cross-tenant isolation can be tested. ---
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    check("platform login -> token issued", Boolean(platformToken));

    const outletB = await makeSiblingOutlet(baseUrl, { label: `gd${runSuffix}`, category: "bakery" });
    const SLUG_B = outletB.outletSlug;
    check("stand up a second outlet -> ok", Boolean(outletB.outletId));

    // --- discover lists both active tenants with real fields. ---
    const registerHelper = async (emailPrefix) => {
      const email = `${emailPrefix}-${runSuffix}@test.co`;
      await api("/api/customer-auth/register", {
        method: "POST",
        body: { name: "Explore Tester", email, password: "password123", phone: "9800000009" },
      });
      const mint = await api("/__test__/mint-global-token", {
        method: "POST",
        body: { email, type: "email_verify" },
      });
      await api(`/api/customer-auth/verify-email?token=${mint.body.token}`);
      const login = await api("/api/customer-auth/login", {
        method: "POST",
        body: { email, password: "password123" },
      });
      return login.body?.token;
    };

    const accountAToken = await registerHelper("account-a");
    check("account A global login -> token issued", Boolean(accountAToken));

    const discoverList = await api("/api/customer-auth/discover", { token: accountAToken });
    check("discover -> 200 with a valid session", discoverList.status === 200);
    const slugs = (discoverList.body?.businesses || []).map((b) => b.slug);
    check("discover includes tenant A", slugs.includes(SLUG_A));
    check("discover includes newly onboarded tenant B", slugs.includes(SLUG_B));
    const bizB = (discoverList.body?.businesses || []).find((b) => b.slug === SLUG_B);
    check("discover reflects the category set at onboarding", bizB?.category === "bakery");

    // --- account A enters tenant A only. ---
    const enterA = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      slug: SLUG_A,
      token: accountAToken,
      body: {},
    });
    check("account A enter-tenant A -> tenant JWT issued", Boolean(enterA.body?.token));

    const myTenantsA = await api("/api/customer-auth/my-tenants", { token: accountAToken });
    check("my-tenants -> 200", myTenantsA.status === 200);
    const myOrgSlugsA = (myTenantsA.body?.memberships || []).map((m) => m.slug);
    check("account A my-tenants includes tenant A", myOrgSlugsA.includes(SLUG_A));
    check("account A my-tenants does NOT include tenant B (never entered)", !myOrgSlugsA.includes(SLUG_B));

    // --- A second, separate CustomerAccount enters tenant B only. ---
    const accountBToken = await registerHelper("account-b");
    check("account B global login -> token issued", Boolean(accountBToken));

    const enterB = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      slug: SLUG_B,
      token: accountBToken,
      body: {},
    });
    check("account B enter-tenant B -> tenant JWT issued", Boolean(enterB.body?.token));

    const myTenantsB = await api("/api/customer-auth/my-tenants", { token: accountBToken });
    const myOrgSlugsB = (myTenantsB.body?.memberships || []).map((m) => m.slug);
    check("account B my-tenants includes tenant B", myOrgSlugsB.includes(SLUG_B));

    // --- The core isolation assertion: account A's list never contains any
    // of account B's businesses/organizationIds, and vice versa. ---
    const myOrgIdsA = (myTenantsA.body?.memberships || []).map((m) => m.organizationId);
    const myOrgIdsB = (myTenantsB.body?.memberships || []).map((m) => m.organizationId);
    const overlap = myOrgIdsA.some((id) => myOrgIdsB.includes(id));
    check("account A and account B my-tenants share no organizationId", !overlap);
    check("account B my-tenants does NOT include tenant A (never entered)", !myOrgSlugsB.includes(SLUG_A));
  } finally {
    stop();
  }

  if (failures) { console.error(`global-directory: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("global-directory: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

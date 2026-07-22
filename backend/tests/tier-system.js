/**
 * Tier system suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Configures tier thresholds on durbarmarg, drives a
 * customer through several earns, and confirms resolveTier picks the
 * right label.
 *
 * Run directly: `node tests/tier-system.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5030 });
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

    const email = `tier_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Tier Tester", email, password: "password", phone: "+9779811112222", address: "1 Test Lane" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    // Get the organization ID via the test endpoint
    const getOrgResp = await api("/__test__/get-organization", {
      method: "POST",
      slug: null,
      body: { companySlug: COMPANY, outletSlug: SLUG }
    });
    const organizationId = getOrgResp.body.organizationId;
    const userId = customerLogin.body.user.id;

    // Test 1: no tier when thresholds unconfigured
    const tier1 = await api("/__test__/resolve-tier", {
      method: "POST",
      slug: null,
      body: { organizationId, userId }
    });
    check("no tier when thresholds unconfigured", tier1.body.tier === null);

    // Configure Bronze and Silver
    await api("/__test__/set-tier-thresholds", {
      method: "POST",
      slug: null,
      body: {
        organizationId,
        tierThresholds: {
          Bronze: { minVisits: 1, minSpend: 100 },
          Silver: { minVisits: 2, minSpend: 700 },
          Gold: { minVisits: null, minSpend: null },
          Platinum: { minVisits: null, minSpend: null }
        }
      }
    });

    // Generate and claim first earn (500)
    const gen1 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 500 } });
    await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: gen1.body.data.token } });

    // Test 2: one 500 earn meets Bronze
    const tier2 = await api("/__test__/resolve-tier", {
      method: "POST",
      slug: null,
      body: { organizationId, userId }
    });
    check("one 500 earn meets Bronze (1 visit, 100 spend)", tier2.body.tier === "Bronze");

    // Generate and claim second earn (300)
    const gen2 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 300 } });
    await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: gen2.body.data.token } });

    // Test 3: two earns (800 total) meets Silver
    const tier3 = await api("/__test__/resolve-tier", {
      method: "POST",
      slug: null,
      body: { organizationId, userId }
    });
    check("two earns (800 total) meets Silver (2 visits, 700 spend)", tier3.body.tier === "Silver");

    // Configure Gold threshold
    await api("/__test__/set-tier-thresholds", {
      method: "POST",
      slug: null,
      body: {
        organizationId,
        tierThresholds: {
          Bronze: { minVisits: 1, minSpend: 100 },
          Silver: { minVisits: 2, minSpend: 700 },
          Gold: { minVisits: 3, minSpend: 900 },
          Platinum: { minVisits: null, minSpend: null }
        }
      }
    });

    // Create an old transaction outside the 365-day window
    await api("/__test__/create-dated-transaction", {
      method: "POST",
      slug: null,
      body: { email, organizationId, billAmount: 1000, createdAtDaysAgo: 400 }
    });

    // Test 4: old earn outside rolling window doesn't count
    const tier4 = await api("/__test__/resolve-tier", {
      method: "POST",
      slug: null,
      body: { organizationId, userId }
    });
    check(
      "a 400-day-old earn outside the trailing 12-month window doesn't count toward tier (stays Silver, not Gold)",
      tier4.body.tier === "Silver"
    );

    // Configure Platinum threshold at exact boundary
    await api("/__test__/set-tier-thresholds", {
      method: "POST",
      slug: null,
      body: {
        organizationId,
        tierThresholds: {
          Bronze: { minVisits: 1, minSpend: 100 },
          Silver: { minVisits: 2, minSpend: 700 },
          Gold: { minVisits: 3, minSpend: 900 },
          Platinum: { minVisits: 2, minSpend: 800 }
        }
      }
    });

    // Test 5: exact boundary (2 visits, 800 spend) meets threshold
    const tier5 = await api("/__test__/resolve-tier", {
      method: "POST",
      slug: null,
      body: { organizationId, userId }
    });
    check("meeting a threshold exactly (2 visits, 800 spend) counts as met", tier5.body.tier === "Platinum");

    // Reset to Bronze/Silver only for later tasks
    await api("/__test__/set-tier-thresholds", {
      method: "POST",
      slug: null,
      body: {
        organizationId,
        tierThresholds: {
          Bronze: { minVisits: 1, minSpend: 100 },
          Silver: { minVisits: 2, minSpend: 700 },
          Gold: { minVisits: null, minSpend: null },
          Platinum: { minVisits: null, minSpend: null }
        }
      }
    });

    const balanceResp = await api("/api/points/balance", { token: customerToken });
    check("balance response surfaces tier", balanceResp.body.data.tier === "Silver");

    const listResp = await api("/api/admin/customers", { token: adminToken });
    const me = (listResp.body?.data || []).find((c) => c.email === email);
    check("admin customer list surfaces tier", me?.tier === "Silver");
  } finally {
    stop();
  }

  if (failures) { console.error(`tier-system: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("tier-system: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

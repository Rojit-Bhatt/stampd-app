/**
 * (G17) Self-service customer data export — GET /api/customer-auth/data.
 * Self-contained: boots its own server on a random port against the
 * in-memory mock DB.
 *
 * Verifies the privacy-facing contract that made this endpoint worth building:
 *   - a signed-in customer gets their profile + memberships back (200),
 *     membership rows carry tenant/company context so the export is readable,
 *   - an unsigned request is refused (401),
 *   - the export returns ONLY this account's data — a second customer's
 *     registration and membership must not appear in the first account's
 *     export,
 *   - the endpoint is rate-limited like the rest of auth (429 after a burst).
 *
 * Run directly: `node tests/customer-data-export.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const OUTLET = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, tenant = false, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (tenant) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = OUTLET; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const email1 = `export1_${Date.now()}@test.co`;
    const email2 = `export2_${Date.now()}@test.co`;

    // Two accounts — the second exists to prove the export never leaks it.
    for (const email of [email1, email2]) {
      await api("/api/customer-auth/register", {
        method: "POST",
        body: { name: email, email, password: "password", phone: "+9779800007777" },
      });
    }
    const login1 = await api("/api/customer-auth/login", { method: "POST", body: { email: email1, password: "password" } });
    const session1 = login1.body?.token;
    check("customer 1 signs in", Boolean(session1), login1.body);
    const login2 = await api("/api/customer-auth/login", { method: "POST", body: { email: email2, password: "password" } });
    const session2 = login2.body?.token;
    check("customer 2 signs in", Boolean(session2), login2.body);

    // Customer 2 joins the outlet so there is a distinct second membership
    // row in the DB while customer 1 has none yet.
    const enter2 = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: session2, tenant: true,
    });
    check("customer 2 joins the outlet", enter2.status === 200, enter2.body);

    console.log("\n== Anonymous access ==");
    const anon = await api("/api/customer-auth/data");
    check("unsigned -> 401", anon.status === 401, anon.body);

    console.log("\n== Export ==");
    const export1 = await api("/api/customer-auth/data", { token: session1 });
    check("signed export -> 200", export1.status === 200, export1.body);
    check("payload shape: success + data", export1.body?.success === true && Boolean(export1.body?.data), export1.body);
    const d = export1.body?.data;
    check("profile carries the right email", d?.profile?.email === email1, d?.profile);
    check("profile carries the phone", d?.profile?.phone === "+9779800007777", d?.profile);
    check("requestedAt is an ISO stamp", /^\d{4}-\d{2}-\d{2}T/.test(d?.requestedAt || ""), d?.requestedAt);
    check("no memberships yet (never entered an outlet)", Array.isArray(d?.memberships) && d.memberships.length === 0, d?.memberships);

    // Customer 1 now enters the outlet — the export must describe the
    // membership with tenant/company names, and must STILL not show customer 2.
    const enter1 = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: session1, tenant: true,
    });
    check("customer 1 joins the outlet", enter1.status === 200, enter1.body);

    const export1Again = await api("/api/customer-auth/data", { token: session1 });
    check("export after join -> 200", export1Again.status === 200, export1Again.body);
    const m = export1Again.body?.data?.memberships?.[0];
    check("exactly one membership exported", export1Again.body?.data?.memberships?.length === 1, export1Again.body?.data?.memberships);
    check("membership carries tenant name", Boolean(m?.tenant?.name), m);
    check("membership carries company name", Boolean(m?.tenant?.company), m);
    check("membership balance exposed", typeof m?.pointsBalanceCenti === "number", m);
    check("tenant context resolves to the seeded company", m?.tenant?.company === "Coffesarowar Group", m?.tenant);
    check("customer 2's membership never leaks into customer 1's export",
      !export1Again.body?.data?.memberships?.some((row) => row.email === email2), export1Again.body?.data?.memberships);

    console.log("\n== Wrong-account export ==");
    // Re-export customer 2 — should describe customer 2, never customer 1.
    const export2 = await api("/api/customer-auth/data", { token: session2 });
    check("customer 2 export -> 200", export2.status === 200, export2.body);
    check("customer 2 profile, not customer 1", export2.body?.data?.profile?.email === email2, export2.body?.data?.profile);
    check("customer 2 membership present", export2.body?.data?.memberships?.length === 1, export2.body?.data?.memberships);

    console.log("\n== Rate limiting ==");
    // Burst the limiter — authLimiter allows a handful per minute; a fast
    // loop of 40 should cross it.
    let hits429 = 0;
    for (let i = 0; i < 40; i++) {
      const r = await api("/api/customer-auth/data", { token: session1 });
      if (r.status === 429) hits429++;
    }
    check("export bursts are rate-limited (at least one 429)", hits429 > 0, { hits429 });

    if (failures === 0) console.log("\nALL CUSTOMER-DATA-EXPORT CHECKS PASSED");
    else { console.error(`\n${failures} customer-data-export check(s) FAILED`); process.exitCode = 1; }
  } finally {
    await stop();
  }
}

main().catch((e) => { console.error("UNCAUGHT", e); process.exitCode = 1; process.exit(1); });

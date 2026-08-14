/**
 * Company/outlet restructure suite. Self-contained: boots its own server on
 * a dedicated port against the in-memory mock DB.
 *
 * Covers the headline guarantees of the restructure: outlet slugs are unique
 * only WITHIN a company (two chains can both have a "downtown", and each
 * resolves to its own outlet); a company registers its own outlets with
 * their own independent credentials; the plan's outlet limit gates
 * creation; archiving frees a slot without destroying data; and an owner
 * can only ever enter its own company's outlets.
 *
 * Run directly: `node tests/company-outlets.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, company, outlet, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (company) headers["X-Company-Slug"] = company;
    if (outlet) headers["X-Outlet-Slug"] = outlet;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const loginAdmin = async (email, password = "password") =>
    api("/api/admin-auth/login", { method: "POST", body: { email, password } });

  try {
    const platformLogin = await api("/api/platform/login", {
      method: "POST", body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    // 1. THE headline case: the seed gives two different companies an outlet
    // slugged "durbarmarg". Both must resolve, to different outlets.
    const a = await api("/api/tenant", { company: "coffesarowar", outlet: "durbarmarg" });
    const b = await api("/api/tenant", { company: "himalayan-bites", outlet: "durbarmarg" });
    check("same outlet slug under company A resolves -> 200", a.status === 200);
    check("same outlet slug under company B resolves -> 200", b.status === 200);
    check("...and they are different outlets", a.body?.tenant?.id !== b.body?.tenant?.id);
    check("...A is the right one", a.body?.tenant?.name === "Coffesarowar Durbarmarg");
    check("...B is the right one", b.body?.tenant?.name === "Himalayan Bites Durbarmarg");

    // 2. An outlet slug alone is not a tenant — both segments are required.
    const noCompany = await api("/api/tenant", { outlet: "durbarmarg" });
    check("outlet slug with no company -> 400", noCompany.status === 400);

    // 3. A real (company, outlet) pair that doesn't exist 404s.
    const wrongPair = await api("/api/tenant", { company: "sweet-corner", outlet: "durbarmarg" });
    check("company that has no such outlet -> 404", wrongPair.status === 404);

    // 4. Platform registers a company; its owner can log in.
    const stamp = Date.now();
    const registered = await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: {
        name: "Test Chain", slug: `test-chain-${stamp}`,
        ownerName: "Test Owner", ownerEmail: `owner-${stamp}@test.com`, ownerPassword: "password123"
      },
    });
    check("platform registers a company -> 201", registered.status === 201);
    const companySlug = registered.body?.company?.slug;

    // The owner must verify before signing in.
    const unverified = await loginAdmin(`owner-${stamp}@test.com`, "password123");
    check("unverified owner can't sign in -> 403", unverified.status === 403);
    check("...with NEEDS_VERIFICATION", unverified.body?.code === "NEEDS_VERIFICATION");

    const mint = await api("/__test__/mint-admin-token", {
      method: "POST", body: { email: `owner-${stamp}@test.com`, type: "email_verify" },
    });
    await api(`/api/admin-auth/verify-email?token=${mint.body.token}`);

    const ownerLogin = await loginAdmin(`owner-${stamp}@test.com`, "password123");
    check("verified owner signs in -> 200", ownerLogin.status === 200);
    check("...identified as a company owner", ownerLogin.body?.kind === "company_owner");
    const ownerToken = ownerLogin.body.token;

    // 5. Reserved slugs are refused — a company slugged "explore" would own a
    // top-level route and be permanently unreachable.
    const reserved = await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: { name: "Bad", slug: "explore", ownerName: "X", ownerEmail: `x-${stamp}@t.com`, ownerPassword: "password123" },
    });
    check("reserved company slug refused -> 400", reserved.status === 400);
    check("...with RESERVED_SLUG", reserved.body?.code === "RESERVED_SLUG");

    // 6. A brand-new company is on a trial: exactly one outlet allowed.
    const outlet1 = await api("/api/company/outlets", {
      method: "POST", token: ownerToken,
      body: { name: "First", slug: "first", category: "cafe",
              adminName: "First Admin", adminEmail: `first-${stamp}@test.com`, adminPassword: "password123" },
    });
    check("owner creates its first outlet -> 201", outlet1.status === 201);
    check("...and gets the two-segment admin path to hand over", outlet1.body?.outletPath === `/${companySlug}/first/admin`);

    const outlet2 = await api("/api/company/outlets", {
      method: "POST", token: ownerToken,
      body: { name: "Second", slug: "second", category: "cafe",
              adminName: "Second Admin", adminEmail: `second-${stamp}@test.com`, adminPassword: "password123" },
    });
    check("second outlet blocked by the trial limit -> 402", outlet2.status === 402);
    check("...with OUTLET_LIMIT_REACHED", outlet2.body?.code === "OUTLET_LIMIT_REACHED");

    // 7. Duplicate slug within the SAME company is refused. Uses the seeded
    // Coffesarowar owner, whose comped plan has slots to spare — the trial
    // company above would 402 on the limit before ever reaching the slug
    // check, which would prove nothing about duplicates.
    const seededOwner = await loginAdmin("owner@coffesarowar.com");
    const dupe = await api("/api/company/outlets", {
      method: "POST", token: seededOwner.body.token,
      body: { name: "Patan Again", slug: "patan", category: "cafe",
              adminName: "Dup", adminEmail: `dup-${stamp}@test.com`, adminPassword: "password123" },
    });
    check("duplicate slug within a company -> 409", dupe.status === 409);

    // ...but the SAME slug under a DIFFERENT company is perfectly fine.
    const himalayanOwner = await loginAdmin("owner@himalayanbites.com");
    const sameSlugElsewhere = await api("/api/company/outlets", {
      method: "POST", token: himalayanOwner.body.token,
      body: { name: "Himalayan Patan", slug: "patan", category: "restaurant",
              adminName: "HP", adminEmail: `hp-${stamp}@test.com`, adminPassword: "password123" },
    });
    check("same slug under a different company -> 201", sameSlugElsewhere.status === 201);

    // 8. Archiving frees the slot; the outlet's data is untouched.
    const outletId = outlet1.body.outlet.id;
    const archived = await api(`/api/company/outlets/${outletId}`, { method: "DELETE", token: ownerToken });
    check("owner archives an outlet -> 200", archived.status === 200);
    check("...status is archived, not deleted", archived.body?.outlet?.status === "archived");

    const afterArchive = await api("/api/company/outlets", { token: ownerToken });
    check("archived outlet still listed (data kept)", (afterArchive.body?.outlets || []).some((o) => o.id === outletId));

    const outlet2Retry = await api("/api/company/outlets", {
      method: "POST", token: ownerToken,
      body: { name: "Second", slug: "second", category: "cafe",
              adminName: "Second Admin", adminEmail: `second2-${stamp}@test.com`, adminPassword: "password123" },
    });
    check("archiving freed the slot -> new outlet 201", outlet2Retry.status === 201);

    // Restoring must re-check the limit, or archive+restore would be a way
    // around the plan.
    const restore = await api(`/api/company/outlets/${outletId}/restore`, { method: "POST", token: ownerToken });
    check("restoring over the limit -> 402", restore.status === 402);

    // 9. An archived outlet stops serving customers.
    const archivedTenant = await api("/api/tenant", { company: companySlug, outlet: "first" });
    check("archived outlet is unavailable to customers -> 403", archivedTenant.status === 403);

    // 10. Cross-company isolation: this owner cannot enter another company's
    // outlet even knowing its id.
    const foreign = await api("/api/tenant", { company: "coffesarowar", outlet: "patan" });
    const foreignId = foreign.body.tenant.id;
    const steal = await api("/api/company/enter-outlet", {
      method: "POST", token: ownerToken, body: { organizationId: foreignId },
    });
    check("owner cannot enter another company's outlet -> 403", steal.status === 403);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll company-outlets checks passed.");
  }
}

main();

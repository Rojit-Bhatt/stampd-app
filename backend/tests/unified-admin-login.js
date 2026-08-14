/**
 * Unified admin login suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * Covers: one slug-less email+password form serves both company owners and
 * outlet admins, and the credentials alone decide which; staff emails are
 * unique across the WHOLE platform (the guarantee that makes the above
 * unambiguous), while customer emails stay deliberately non-unique across
 * outlets; an outlet admin's tenant JWT reaches only its own outlet.
 *
 * Run directly: `node tests/unified-admin-login.js`
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
  const login = (email, password = "password") =>
    api("/api/admin-auth/login", { method: "POST", body: { email, password } });

  try {
    // 1. The same form, two different kinds of staff.
    const owner = await login("owner@coffesarowar.com");
    check("company owner signs in -> 200", owner.status === 200);
    check("...kind is company_owner", owner.body?.kind === "company_owner");
    check("...carries its company", owner.body?.company?.slug === "coffesarowar");

    const outletAdmin = await login("patan@coffesarowar.com");
    check("outlet admin signs in via the SAME endpoint -> 200", outletAdmin.status === 200);
    check("...kind is outlet_admin", outletAdmin.body?.kind === "outlet_admin");
    check("...carries both slugs for the redirect", outletAdmin.body?.company?.slug === "coffesarowar" && outletAdmin.body?.outlet?.slug === "patan");
    check("...and a real business_admin tenant JWT", outletAdmin.body?.user?.role === "business_admin");

    // 2. Unknown email and wrong password are indistinguishable.
    const unknown = await login("nobody@nowhere.com", "whatever");
    const wrongPass = await login("owner@coffesarowar.com", "wrongpassword");
    check("unknown email -> 401", unknown.status === 401);
    check("wrong password -> 401", wrongPass.status === 401);
    check("...same message for both (no account enumeration)", unknown.body?.message === wrongPass.body?.message);

    // 3. The outlet admin's tenant JWT works on its OWN outlet...
    const ownOutlet = await api("/api/admin/settings", {
      token: outletAdmin.body.token, company: "coffesarowar", outlet: "patan",
    });
    check("outlet admin reaches its own console -> 200", ownOutlet.status === 200);

    // ...and its identity is bound to that outlet, not to whatever slugs the
    // client claims: the tenant for /api/admin comes from the JWT, so
    // pointing the headers at a sibling changes nothing.
    const siblingProbe = await api("/api/admin/settings", {
      token: outletAdmin.body.token, company: "coffesarowar", outlet: "thamel",
    });
    check("...header-spoofing a sibling outlet doesn't move it", siblingProbe.status === 200 && siblingProbe.body?.settings?.slug === "patan");

    // 4. A company-owner session is not a tenant JWT and can't act as one.
    const ownerAsAdmin = await api("/api/admin/settings", {
      token: owner.body.token, company: "coffesarowar", outlet: "patan",
    });
    check("company session rejected by a tenant-JWT route -> 401", ownerAsAdmin.status === 401);

    // 5. Global staff email uniqueness — the invariant the login rests on.
    const platformLogin = await api("/api/platform/login", {
      method: "POST", body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const stamp = Date.now();

    const dupeCompany = await api("/api/platform/companies", {
      method: "POST", token: platformToken,
      body: { name: "Dupe Co", slug: `dupe-${stamp}`, ownerName: "Dupe",
              ownerEmail: "owner@coffesarowar.com", ownerPassword: "password123" },
    });
    check("registering a company with an existing OWNER email -> 409", dupeCompany.status === 409);

    const dupeOutletEmail = await api("/api/platform/companies", {
      method: "POST", token: platformToken,
      body: { name: "Dupe Co 2", slug: `dupe2-${stamp}`, ownerName: "Dupe2",
              ownerEmail: "patan@coffesarowar.com", ownerPassword: "password123" },
    });
    check("registering a company with an existing OUTLET ADMIN email -> 409", dupeOutletEmail.status === 409);

    const ownerToken = owner.body.token;
    const dupeOutlet = await api("/api/company/outlets", {
      method: "POST", token: ownerToken,
      body: { name: "Clash", slug: `clash-${stamp}`, category: "cafe", adminName: "Clash",
              adminEmail: "owner@himalayanbites.com", adminPassword: "password123" },
    });
    check("creating an outlet with another company's owner email -> 409", dupeOutlet.status === 409);

    // 6. Customer emails are the OPPOSITE case and must stay shareable — the
    // seed's bikash holds memberships at outlets of three companies with one
    // email. Over-tightening staff uniqueness must never catch customers.
    const asCustomerA = await api("/api/auth/login", {
      method: "POST", company: "coffesarowar", outlet: "durbarmarg",
      body: { email: "bikash@example.com", password: "password" },
    });
    const asCustomerB = await api("/api/auth/login", {
      method: "POST", company: "himalayan-bites", outlet: "lakeside",
      body: { email: "bikash@example.com", password: "password" },
    });
    check("one customer email logs in at company A's outlet -> 200", asCustomerA.status === 200);
    check("...and at company B's outlet too -> 200", asCustomerB.status === 200);
    check("...as two distinct memberships", asCustomerA.body?.user?.id !== asCustomerB.body?.user?.id);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll unified-admin-login checks passed.");
  }
}

main();

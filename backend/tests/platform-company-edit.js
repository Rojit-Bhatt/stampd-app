/**
 * Platform-admin company/outlet edit suite. Self-contained: boots its own
 * server on a dedicated port against the in-memory mock DB.
 *
 * Covers: editing a company's name; the owner-email-fix flow (wrong email
 * typed at registration -> platform corrects it -> the new address gets a
 * fresh, usable verification token and the old one stops working); the
 * platform's ability to edit and suspend an individual outlet inside a
 * company; and suspending a company taking all its outlets down with it.
 *
 * Run directly: `node tests/platform-company-edit.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5023 });
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
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  const verify = async (email) => {
    const mint = await api("/__test__/mint-admin-token", { method: "POST", body: { email, type: "email_verify" } });
    return api(`/api/admin-auth/verify-email?token=${mint.body.token}`);
  };
  const login = (email, password = "password") =>
    api("/api/admin-auth/login", { method: "POST", body: { email, password } });

  try {
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    const runSuffix = Date.now();
    const slug = `editme-${runSuffix}`;
    const wrongEmail = `wrong+${runSuffix}@typo.test`;
    const rightEmail = `correct+${runSuffix}@real.test`;

    const create = await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: {
        name: "Edit Me Co",
        slug,
        ownerName: "Typo Owner",
        ownerEmail: wrongEmail,
        ownerPassword: "password",
      },
    });
    check("register company -> 201", create.status === 201);
    const companyId = create.body?.company?.id;

    // 1. Edit the company's name.
    const rename = await api(`/api/platform/companies/${companyId}`, {
      method: "PATCH",
      token: platformToken,
      body: { name: "Renamed Co" },
    });
    check("edit company name -> 200 with the new value", rename.status === 200 && rename.body?.company?.name === "Renamed Co");

    // 2. Fix a mistyped owner email. The new address must get a fresh,
    //    working verification; the old one must stop existing.
    const fixEmail = await api(`/api/platform/companies/${companyId}`, {
      method: "PATCH",
      token: platformToken,
      body: { ownerEmail: rightEmail },
    });
    check("fix owner email -> 200, echoes the new address", fixEmail.status === 200 && fixEmail.body?.owner?.email === rightEmail);

    const oldEmailLogin = await login(wrongEmail);
    check("the old (mistyped) email can no longer sign in -> 401", oldEmailLogin.status === 401);

    const preVerify = await login(rightEmail);
    check("corrected email must re-verify before signing in -> 403", preVerify.status === 403);

    const verified = await verify(rightEmail);
    check("corrected email's fresh verification link works -> 200", verified.status === 200);

    const postVerify = await login(rightEmail);
    check("corrected email signs in once verified -> 200", postVerify.status === 200);
    check("...as this company's owner", postVerify.body?.company?.slug === slug);

    // 3. Re-submitting the same email is a no-op, not a re-verification.
    const sameEmail = await api(`/api/platform/companies/${companyId}`, {
      method: "PATCH",
      token: platformToken,
      body: { ownerEmail: rightEmail },
    });
    check("re-submitting the same owner email -> 200, no-op", sameEmail.status === 200);
    const stillIn = await login(rightEmail);
    check("...and doesn't force a re-verification", stillIn.status === 200);

    // 4. An owner email that collides with existing staff is refused.
    const collide = await api(`/api/platform/companies/${companyId}`, {
      method: "PATCH",
      token: platformToken,
      body: { ownerEmail: "durbarmarg@coffesarowar.com" },
    });
    check("owner email colliding with another admin -> 409", collide.status === 409);

    // 5. The platform can edit an outlet inside a company.
    const ownerToken = postVerify.body.token;
    await api("/api/company/outlets", {
      method: "POST",
      token: ownerToken,
      body: {
        name: "Editable Outlet", slug: "main", category: "cafe",
        adminName: "Outlet Admin", adminEmail: `outlet+${runSuffix}@real.test`, adminPassword: "password",
      },
    });
    const companyAfter = await api(`/api/platform/companies/${companyId}`, { token: platformToken });
    const outletId = companyAfter.body?.company?.outlets?.[0]?.id;
    check("company detail nests its outlets", Boolean(outletId));

    const editOutlet = await api(`/api/platform/outlets/${outletId}`, {
      method: "PATCH",
      token: platformToken,
      body: { name: "Renamed Outlet", category: "bakery" },
    });
    check("platform edits an outlet -> 200", editOutlet.status === 200 && editOutlet.body?.outlet?.name === "Renamed Outlet");

    const badCategory = await api(`/api/platform/outlets/${outletId}`, {
      method: "PATCH",
      token: platformToken,
      body: { category: "not-a-category" },
    });
    check("bogus outlet category -> 400", badCategory.status === 400);

    // 6. Suspending the COMPANY takes its outlets down with it.
    const liveBefore = await api("/api/tenant", { company: slug, outlet: "main" });
    check("outlet serves customers while its company is active -> 200", liveBefore.status === 200);

    const suspendCompany = await api(`/api/platform/companies/${companyId}`, {
      method: "PATCH",
      token: platformToken,
      body: { status: "suspended" },
    });
    check("platform suspends the company -> 200", suspendCompany.status === 200);

    const liveAfter = await api("/api/tenant", { company: slug, outlet: "main" });
    check("a suspended company's outlet stops serving -> 403", liveAfter.status === 403);
    check("...tagged TENANT_SUSPENDED so the frontend can tell it apart", liveAfter.body?.code === "TENANT_SUSPENDED");

    const ownerBlocked = await login(rightEmail);
    check("...and its owner can't sign in either -> 403", ownerBlocked.status === 403);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll platform-company-edit checks passed.");
  }
}

main();

/**
 * Program config (earn rate / points expiry) set at registration time, and
 * the inheritance chain it feeds. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * Before this, a company's programDefaults were hardcoded to the platform
 * default at creation and no endpoint could change them — so every outlet
 * inherited 100% forever, and neither the registration form nor the outlet
 * form had anywhere to put a different number.
 *
 * The invariant that matters most here is the one resolveProgram exists to
 * protect: an outlet with a null field FOLLOWS its company, and an outlet
 * with a set field does NOT. A test that only checked the value at creation
 * would pass even if the two were wired backwards.
 *
 * Run directly: `node tests/program-config.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5051 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, company, outlet, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (company) { headers["X-Company-Slug"] = company; headers["X-Outlet-Slug"] = outlet; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  // A freshly-registered owner is unverified, and adminLogin refuses those
  // with 403 before issuing a token — same as the real email flow.
  const verifiedOwnerToken = async (email) => {
    const mint = await api("/__test__/mint-admin-token", {
      method: "POST", body: { email, type: "email_verify" },
    });
    await api(`/api/admin-auth/verify-email?token=${mint.body.token}`);
    const login = await api("/api/admin-auth/login", {
      method: "POST", body: { email, password: "password" },
    });
    return login.body.token;
  };

  const earnRateAt = async (company, outlet) => {
    const res = await api("/api/tenant", { company, outlet });
    return res.body?.tenant?.program?.earnPercent;
  };

  try {
    const platform = (await api("/api/platform/login", {
      method: "POST", body: { email: "admin@stampd.co", password: "password" },
    })).body.token;

    console.log("\n== A company can be registered with its own program defaults ==");
    const reg = await api("/api/platform/companies", {
      method: "POST", token: platform,
      body: {
        name: "Rate Co", slug: "rate-co", ownerName: "Rate Owner",
        ownerEmail: "rateowner@test.co", ownerPassword: "password",
        programDefaults: { earnPercent: 12, pointsExpiryDays: 90 },
      },
    });
    check("register with custom programDefaults -> 201", reg.status === 201, reg.body);
    const companyId = reg.body?.company?.id;
    const ownerToken = await verifiedOwnerToken("rateowner@test.co");

    console.log("\n== An outlet with no override inherits the company ==");
    const inherit = await api("/api/company/outlets", {
      method: "POST", token: ownerToken,
      body: {
        name: "Inherit Outlet", slug: "inherit",
        adminName: "A", adminEmail: "inheritadmin@test.co", adminPassword: "password",
      },
    });
    check("create outlet without an override -> 201", inherit.status === 201, inherit.body);
    check("it resolves to the company's 12%, not the platform's 100%",
      (await earnRateAt("rate-co", "inherit")) === 12);
    const inheritTenant = await api("/api/tenant", { company: "rate-co", outlet: "inherit" });
    check("and inherits pointsExpiryDays too (90)",
      inheritTenant.body?.tenant?.program?.pointsExpiryDays === 90,
      inheritTenant.body?.tenant?.program);

    console.log("\n== An outlet CAN override at creation time ==");
    // Its own company: a trial subscription allows exactly one outlet, so a
    // second one here would 402 on the plan limit rather than test anything.
    const reg2 = await api("/api/platform/companies", {
      method: "POST", token: platform,
      body: {
        name: "Ovr Co", slug: "ovr-co", ownerName: "Ovr Owner",
        ownerEmail: "ovrowner@test.co", ownerPassword: "password",
        programDefaults: { earnPercent: 12, pointsExpiryDays: 90 },
      },
    });
    check("second company registered -> 201", reg2.status === 201, reg2.body);
    const owner2 = await verifiedOwnerToken("ovrowner@test.co");
    const override = await api("/api/company/outlets", {
      method: "POST", token: owner2,
      body: {
        name: "Override Outlet", slug: "override",
        adminName: "B", adminEmail: "ovradmin@test.co", adminPassword: "password",
        program: { earnPercent: 5 },
      },
    });
    check("create outlet WITH an override -> 201", override.status === 201, override.body);
    check("the override wins over the company default", (await earnRateAt("ovr-co", "override")) === 5);
    const ovrTenant = await api("/api/tenant", { company: "ovr-co", outlet: "override" });
    check("a partial override leaves the other field inherited (90)",
      ovrTenant.body?.tenant?.program?.pointsExpiryDays === 90,
      ovrTenant.body?.tenant?.program);

    console.log("\n== Company defaults stay editable after registration ==");
    const patch = await api(`/api/platform/companies/${companyId}`, {
      method: "PATCH", token: platform, body: { programDefaults: { earnPercent: 20 } },
    });
    check("patch company programDefaults -> 200", patch.status === 200, patch.body);
    check("the INHERITING outlet follows to 20", (await earnRateAt("rate-co", "inherit")) === 20);
    check("the OVERRIDING outlet is unaffected, still 5", (await earnRateAt("ovr-co", "override")) === 5);
    const afterPatch = await api("/api/tenant", { company: "rate-co", outlet: "inherit" });
    check("a partial patch does not wipe the untouched field (90)",
      afterPatch.body?.tenant?.program?.pointsExpiryDays === 90,
      afterPatch.body?.tenant?.program);

    console.log("\n== Validation ==");
    const nullDefault = await api("/api/platform/companies", {
      method: "POST", token: platform,
      body: {
        name: "Null Co", slug: "null-co", ownerName: "N",
        ownerEmail: "nullowner@test.co", ownerPassword: "password",
        programDefaults: { earnPercent: null },
      },
    });
    // Null is meaningful on an OUTLET ("inherit") but never on a company —
    // there is nothing above it to inherit from.
    check("a null company default is rejected -> 400", nullDefault.status === 400, nullDefault.body);

    const negative = await api("/api/platform/companies", {
      method: "POST", token: platform,
      body: {
        name: "Neg Co", slug: "neg-co", ownerName: "N",
        ownerEmail: "negowner@test.co", ownerPassword: "password",
        programDefaults: { earnPercent: -5 },
      },
    });
    check("a negative earn rate is rejected -> 400", negative.status === 400, negative.body);

    const zero = await api("/api/platform/companies", {
      method: "POST", token: platform,
      body: {
        name: "Zero Co", slug: "zero-co", ownerName: "Z",
        ownerEmail: "zeroowner@test.co", ownerPassword: "password",
        programDefaults: { earnPercent: 0, pointsExpiryDays: 0 },
      },
    });
    // 0 is a real setting (a program that awards nothing / never expires) and
    // must survive the falsy checks that would otherwise swallow it.
    check("zero is accepted, not treated as unset -> 201", zero.status === 201, zero.body);
    const zeroCompany = await api(`/api/platform/companies/${zero.body?.company?.id}`, { token: platform });
    check("and is stored as 0, not defaulted to 100",
      zeroCompany.body?.company?.programDefaults?.earnPercent === 0,
      zeroCompany.body?.company?.programDefaults);
  } finally {
    stop();
  }

  if (failures) { console.error(`\nprogram-config: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\nprogram-config: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

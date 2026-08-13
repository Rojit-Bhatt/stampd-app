// Reproduction for the "company console shows 0 active outlets" bug.
// Mirrors production: a Company (Magic Cups), a company_owner AdminAccount
// (magic.cups8@gmail.com), and one Organization linked via companyId.
// We then call GET /api/company/outlets with a company-session JWT exactly
// as the frontend does, and assert one outlet is returned.
//
// Self-contained like company-outlets.js: boots its own server against the
// in-memory mock DB via bootServer, seeds data through the real platform
// HTTP API (no direct model access needed), then logs in as the company
// owner and fetches the outlet list.
const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  const api = async (path, { method = "GET", token, body } = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };

  // 1. Platform login (demo seed creates admin@stampd.co / password).
  //    platformLogin returns { success, token, user } at the top level.
  const platform = await api("/api/platform/login", {
    method: "POST", body: { email: "admin@stampd.co", password: "password" },
  });
  check("platform login", platform.status === 200 && !!platform.json.token);
  const platformToken = platform.json.token;

  // 2. Create the company via the platform API, like real onboarding.
  const company = await api("/api/platform/companies", {
    method: "POST", token: platformToken,
    body: {
      name: "Magic Cups",
      slug: "magic-cups",
      ownerName: "Shubham Bhatt",
      ownerEmail: "magic.cups8@gmail.com",
      ownerPassword: "realpassword",
    },
  });
  check("create company", company.status === 201 || company.status === 200, company.json);
  const companyId =
    company.json?.company?.id ??
    company.json?.data?.company?._id ??
    company.json?.data?._id;
  check("company id returned", !!companyId, company.json);

  // 3. Log in as the company owner through the unified admin login.
  // A freshly registered owner is unverified until their email code is
  // consumed — the first login MUST refuse with NEEDS_VERIFICATION; a
  // successful login here would mean the verification gate is broken.
  const ownerLogin = await api("/api/admin-auth/login", {
    method: "POST",
    body: { email: "magic.cups8@gmail.com", password: "realpassword" },
  });
  check(
    "unverified owner refused -> NEEDS_VERIFICATION",
    ownerLogin.status === 403 && ownerLogin.json?.code === "NEEDS_VERIFICATION",
    ownerLogin.json
  );

  // Consume the email verification code via the test mint, then log in again.
  const mint = await api("/__test__/mint-admin-token", {
    method: "POST", body: { email: "magic.cups8@gmail.com", type: "email_verify" },
  });
  check("mint email-verify token", mint.status === 200 && mint.json?.success === true, mint.json);
  const verified = await api(`/api/admin-auth/verify-email?token=${mint.json.token}`);
  check("email verified -> 200", verified.status === 200, verified.json);

  const ownerLogin2 = await api("/api/admin-auth/login", {
    method: "POST",
    body: { email: "magic.cups8@gmail.com", password: "realpassword" },
  });
  check(
    "company owner login after verification",
    ownerLogin2.status === 200 && ownerLogin2.json?.kind === "company_owner",
    ownerLogin2.json
  );
    let ownerToken = ownerLogin2.json?.token;
  // 4. List outlets BEFORE creating any — legitimately empty at this point.
  const preList = await api("/api/company/outlets", { token: ownerToken });
  console.log("[pre] outlets full:", JSON.stringify(preList.json));
  const preOutlets = preList.json?.outlets ?? [];
  console.log("[pre] outlets status:", preList.status, "count:", preOutlets.length);

  // 5. Register the outlet via the company console, like the real flow.
  const outlet = await api("/api/company/outlets", {
    method: "POST", token: ownerToken,
    body: {
      name: "Magic Cups",
      slug: "magiccups",
      category: "cafe",
      adminName: "Magic Cups Admin",
      adminEmail: "magiccups.admin@example.com",
      adminPassword: "password",
    },
  });
  console.log("[create] outlet response:", JSON.stringify(outlet.json));
  check("create outlet via console", outlet.status === 201 || outlet.status === 200, outlet.json);

  // 6. Fetch outlets again — this is what the company dashboard does.
  const outletsRes = await api("/api/company/outlets", { token: ownerToken });
  const outlets = outletsRes.json?.outlets ?? [];
  console.log(
    "[post] outlets status:", outletsRes.status,
    "count:", outlets.length,
    JSON.stringify(outlets, null, 2)
  );

  if (outlets.length === 0) {
    check("outlets returned", false, "expected 1 outlet, got 0 — bug reproduced locally");
  } else {
    check("outlets returned", true);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    stop();
    process.exit(1);
  }
  console.log("\nPASS: company console returns the outlet as expected");
  stop();
}

main().catch(async (err) => {
  console.error("ERROR:", err);
  process.exit(1);
});

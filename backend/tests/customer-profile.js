/**
 * The customer's global profile — name and password on the CustomerAccount.
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB.
 *
 * These endpoints exist because the tenant-scoped /api/account equivalents
 * are wrong for a customer, in two ways that both reported success:
 *
 *   - a rename wrote the outlet's User membership row, which ensureMembership
 *     re-syncs DOWN from the account on the next enter-tenant. The name came
 *     back, the toast said "Name updated!", and navigating once undid it.
 *   - a password change wrote User.password, but customer sign-in reads
 *     CustomerAccount.password. It returned "Password updated." while the
 *     actual password was untouched — the worst possible outcome for a
 *     customer who changed it BECAUSE they thought it was compromised.
 *
 * So the assertions that matter are the ones after a round-trip: does the new
 * name survive navigation, and does the new password actually let you in.
 *
 * Run directly: `node tests/customer-profile.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const OUTLET = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5053 });
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
    const email = `profile_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Original Name", email, password: "password", phone: "+9779800007777" },
    });
    const login = await api("/api/customer-auth/login", {
      method: "POST", body: { email, password: "password" },
    });
    const session = login.body?.token;
    check("customer signs in globally", Boolean(session), login.body);

    // Join an outlet, so there's a membership row for the rename to fan out
    // to — and, more importantly, for ensureMembership to try to revert.
    const enter = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: session, tenant: true,
    });
    check("and joins an outlet", enter.status === 200, enter.body);

    console.log("\n== Renaming ==");
    const renamed = await api("/api/customer-auth/profile", {
      method: "PATCH", token: session, body: { name: "Renamed Customer" },
    });
    check("rename -> 200", renamed.status === 200, renamed.body);
    check("the response carries the new name",
      renamed.body?.account?.name === "Renamed Customer", renamed.body?.account);

    // The assertion the old tenant-scoped endpoint failed: enter-tenant runs
    // ensureMembership, which used to overwrite the rename from the account.
    const reEnter = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: session, tenant: true,
    });
    check("it SURVIVES re-entering the outlet",
      reEnter.body?.user?.name === "Renamed Customer", reEnter.body?.user);
    // And it reached the membership row, which is what outlet-scoped
    // reporting actually reads.
    const meAfter = await api("/api/account/me", { token: reEnter.body?.token, tenant: true });
    check("and the outlet sees the new name too",
      meAfter.body?.name === "Renamed Customer", meAfter.body);

    const blankName = await api("/api/customer-auth/profile", {
      method: "PATCH", token: session, body: { name: "   " },
    });
    check("a blank name is rejected -> 400", blankName.status === 400, blankName.body);

    console.log("\n== Changing the password ==");
    const wrongCurrent = await api("/api/customer-auth/change-password", {
      method: "POST", token: session,
      body: { currentPassword: "notmypassword", newPassword: "brandnewpass123" },
    });
    check("the wrong current password is refused -> 401", wrongCurrent.status === 401, wrongCurrent.body);

    const tooShort = await api("/api/customer-auth/change-password", {
      method: "POST", token: session,
      body: { currentPassword: "password", newPassword: "short" },
    });
    check("a too-short new password is refused -> 400", tooShort.status === 400, tooShort.body);

    const changed = await api("/api/customer-auth/change-password", {
      method: "POST", token: session,
      body: { currentPassword: "password", newPassword: "brandnewpass123" },
    });
    check("change password -> 200", changed.status === 200, changed.body);

    // The whole point. The old endpoint returned this same 200 while sign-in
    // kept accepting only the OLD password.
    const withNew = await api("/api/customer-auth/login", {
      method: "POST", body: { email, password: "brandnewpass123" },
    });
    check("the NEW password signs in", withNew.status === 200, withNew.body);
    const withOld = await api("/api/customer-auth/login", {
      method: "POST", body: { email, password: "password" },
    });
    check("and the OLD password no longer does -> 401", withOld.status === 401, withOld.body);

    console.log("\n== Anonymous callers ==");
    const noAuthRename = await api("/api/customer-auth/profile", {
      method: "PATCH", body: { name: "Hacker" },
    });
    check("renaming without a session -> 401", noAuthRename.status === 401, noAuthRename.body);
    const noAuthPassword = await api("/api/customer-auth/change-password", {
      method: "POST", body: { currentPassword: "x", newPassword: "yyyyyyyy" },
    });
    check("changing a password without a session -> 401", noAuthPassword.status === 401, noAuthPassword.body);
  } finally {
    stop();
  }

  if (failures) { console.error(`\ncustomer-profile: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\ncustomer-profile: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

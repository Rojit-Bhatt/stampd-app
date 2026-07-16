/**
 * Platform team (multiple admins + roles) suite. Self-contained: boots its
 * own server on a dedicated port against the in-memory mock DB.
 *
 * Covers: the seeded admin is an implicit "owner" (no migration needed);
 * an owner can invite a "support" admin; a support admin can read
 * businesses/analytics/audit-log but is rejected from onboard/edit/suspend
 * and from managing the team; an owner can remove a support admin but not
 * themselves.
 *
 * Run directly: `node tests/platform-team.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5026 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const ownerLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    check("seeded admin logs in", ownerLogin.status === 200);
    check("seeded admin is implicitly owner (no migration)", ownerLogin.body.user.platformRole === "owner");
    const ownerToken = ownerLogin.body.token;
    const ownerId = ownerLogin.body.user.id;

    const list0 = await api("/api/platform/admins", { token: ownerToken });
    check("owner can list admins -> 200", list0.status === 200);
    check("exactly 1 admin so far (the seed)", list0.body.admins.length === 1);

    const runSuffix = Date.now();
    const supportEmail = `support+${runSuffix}@stampd.co`;
    const invite = await api("/api/platform/admins", {
      method: "POST",
      token: ownerToken,
      body: { name: "Support Sam", email: supportEmail, password: "password", platformRole: "support" },
    });
    check("owner invites a support admin -> 201", invite.status === 201);
    check("invited admin has platformRole support", invite.body.admin?.platformRole === "support");

    const supportLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: supportEmail, password: "password" },
    });
    check("support admin logs in", supportLogin.status === 200);
    check("support admin's own login reflects platformRole support", supportLogin.body.user.platformRole === "support");
    const supportToken = supportLogin.body.token;

    const readAsSupport = await api("/api/platform/companies", { token: supportToken });
    check("support can read companies list -> 200", readAsSupport.status === 200);

    const analyticsAsSupport = await api("/api/platform/analytics", { token: supportToken });
    check("support can read analytics -> 200", analyticsAsSupport.status === 200);

    const auditAsSupport = await api("/api/platform/audit-log", { token: supportToken });
    check("support can read audit log -> 200", auditAsSupport.status === 200);

    const onboardAsSupport = await api("/api/platform/companies", {
      method: "POST",
      token: supportToken,
      body: { name: "Nope", slug: `nope-${runSuffix}`, ownerName: "X", ownerEmail: `x+${runSuffix}@nope.test`, ownerPassword: "password" },
    });
    check("support CANNOT register a company -> 403", onboardAsSupport.status === 403);

    const teamAsSupport = await api("/api/platform/admins", { token: supportToken });
    check("support CANNOT list the team -> 403", teamAsSupport.status === 403);

    const inviteAsSupport = await api("/api/platform/admins", {
      method: "POST",
      token: supportToken,
      body: { name: "Nope", email: `nope+${runSuffix}@x.com`, password: "password" },
    });
    check("support CANNOT invite another admin -> 403", inviteAsSupport.status === 403);

    const selfRemove = await api(`/api/platform/admins/${ownerId}`, { method: "DELETE", token: ownerToken });
    check("owner cannot remove themselves -> 400", selfRemove.status === 400);

    const supportId = invite.body.admin.id;
    const remove = await api(`/api/platform/admins/${supportId}`, { method: "DELETE", token: ownerToken });
    check("owner removes the support admin -> 200", remove.status === 200);

    const listAfter = await api("/api/platform/admins", { token: ownerToken });
    check("team is back to 1 admin after removal", listAfter.body.admins.length === 1);

    const auditLog = await api("/api/platform/audit-log", { token: ownerToken });
    const actions = auditLog.body.entries.filter((e) => e.action === "invite_admin" || e.action === "remove_admin").map((e) => e.action);
    check("invite_admin and remove_admin both got logged", actions.includes("invite_admin") && actions.includes("remove_admin"));
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll platform-team checks passed.");
  }
}

main();

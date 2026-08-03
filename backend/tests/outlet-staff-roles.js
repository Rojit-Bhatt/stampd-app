/**
 * Outlet staff roles suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * The negative cases are the point of this suite. Grows across the plan's tasks:
 * Task 1 pins the no-migration promise (an admin created before staffRole
 * existed keeps full access), Task 2 adds the per-route 403 matrix, Task 5
 * adds the /api/admin/staff surface.
 *
 * Run directly: `node tests/outlet-staff-roles.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5058 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  try {
    // --- the no-migration promise ---------------------------------
    // An outlet admin provisioned the normal way has no staffRole at all.
    // It must keep full access to every gated surface, with no backfill.
    const outlet = await makeSiblingOutlet(baseUrl, { label: `sr${Date.now()}` });
    const t = outlet.adminToken;

    const settings = await api("/api/admin/settings", { token: t });
    check("existing admin reads settings", settings.status === 200, settings);
    check(
      "settings reports staffRole null for a pre-roles admin",
      settings.body?.settings?.staffRole === null,
      settings.body?.settings,
    );
    check(
      "settings reports staffPinRequired false for a fresh outlet",
      settings.body?.settings?.staffPinRequired === false,
      settings.body?.settings,
    );

    const patched = await api("/api/admin/settings", {
      method: "PATCH", token: t, body: { name: "Renamed By Primary" },
    });
    check("existing admin still writes settings", patched.status === 200, patched);

    const report = await api("/api/admin/reports/summary", { token: t });
    check("existing admin still reads reports", report.status === 200, report);

    const reward = await api("/api/admin/rewards", {
      method: "POST", token: t, body: { name: "Free Coffee", pointsPrice: 10 },
    });
    check("existing admin still creates rewards", reward.status === 201 || reward.status === 200, reward);

    // --- the 403 matrix -------------------------------------------
    // Two more sibling outlets, each demoted to a role, so the matrix is
    // asserted against real tokens rather than a unit-tested predicate.
    const staffOutlet = await makeSiblingOutlet(baseUrl, { label: `st${Date.now()}` });
    await api("/__test__/set-staff-role", {
      method: "POST", body: { email: staffOutlet.adminEmail, staffRole: "staff" },
    });
    const staffT = staffOutlet.adminToken;

    const mgrOutlet = await makeSiblingOutlet(baseUrl, { label: `mg${Date.now()}` });
    await api("/__test__/set-staff-role", {
      method: "POST", body: { email: mgrOutlet.adminEmail, staffRole: "manager" },
    });
    const mgrT = mgrOutlet.adminToken;

    // The token is re-verified against the DB on every request, so the
    // demotion applies to the ALREADY-ISSUED token with no re-login. Assert
    // that directly — it's the reason staffRole is resolved in verifyToken
    // rather than baked into the JWT.
    const staffSettings = await api("/api/admin/settings", { token: staffT });
    check(
      "a demotion applies to an already-issued token",
      staffSettings.body?.settings?.staffRole === "staff",
      staffSettings.body?.settings,
    );

    // GET /settings must stay OPEN for staff: AdminGuard revalidates against
    // it, and a 403 here would log the account out in a loop.
    check("staff can still READ settings", staffSettings.status === 200, staffSettings);

    const blocked = [
      ["manage_settings", "PATCH", "/api/admin/settings", { name: "Nope" }],
      ["view_reports",    "GET",   "/api/admin/reports/customers/download"],
      ["view_reports",    "GET",   "/api/admin/reports/summary"],
      ["view_reports",    "GET",   "/api/admin/dashboard-stats"],
      ["view_reports",    "GET",   "/api/admin/transactions"],
      ["view_reports",    "GET",   "/api/admin/customers"],
      ["manage_catalog",  "POST",  "/api/admin/rewards", { name: "X", pointsPrice: 1 }],
      ["manage_catalog",  "POST",  "/api/admin/menu", { name: "X", price: 1 }],
      ["manage_marketing","POST",  "/api/admin/campaigns", { name: "X", multiplier: 2 }],
      ["manage_marketing","POST",  "/api/admin/events", { title: "X" }],
      ["manage_marketing","GET",   "/api/admin/broadcasts"],
    ];

    for (const [action, method, path, body] of blocked) {
      const r = await api(path, { method, token: staffT, body });
      check(
        `staff is 403 on ${method} ${path} (${action})`,
        r.status === 403 && r.body?.code === "STAFF_ROLE_FORBIDDEN",
        r,
      );
    }

    // A manager passes every one of those.
    for (const [, method, path, body] of blocked) {
      const r = await api(path, { method, token: mgrT, body });
      check(`manager is NOT 403 on ${method} ${path}`, r.status !== 403, r);
    }

    // Reads the counter genuinely needs stay open for staff. Campaigns
    // especially: GenerateQr.tsx reads it to show the live multiplier BEFORE
    // staff quote a number, so gating it would make them quote the wrong one.
    for (const path of ["/api/admin/campaigns", "/api/admin/menu", "/api/admin/rewards", "/api/admin/events"]) {
      const r = await api(path, { token: staffT });
      check(`staff can still read ${path}`, r.status === 200, r);
    }

    // And the counter itself is untouched by the role. Both routes already
    // return 201 (unrelated to this feature) — asserting the real status,
    // not a bare "not 403", so this can't pass by accident.
    const staffQr = await api("/api/admin/generate-qr", {
      method: "POST", token: staffT, body: { billAmount: 500 },
    });
    check("staff can still generate an earn QR", staffQr.status === 201, staffQr);
    const staffRedeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: staffT });
    check("staff can still generate a redeem QR", staffRedeemQr.status === 201, staffRedeemQr);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll outlet-staff-role checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });

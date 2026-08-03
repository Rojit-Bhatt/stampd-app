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

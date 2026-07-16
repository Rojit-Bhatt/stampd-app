/**
 * Platform audit log suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * Covers: onboarding, editing, suspending, and reactivating a business each
 * write a row; the log endpoint returns them most-recent-first with the
 * actor/target names denormalized (no join needed).
 *
 * Run directly: `node tests/platform-audit-log.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5024 });
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
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    const runSuffix = Date.now();
    const slug = `auditme-${runSuffix}`;
    const create = await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: {
        name: "Audit Me Cafe",
        slug,
        ownerName: "Owner",
        ownerEmail: `owner+${runSuffix}@audit.test`,
        ownerPassword: "password",
      },
    });
    const id = create.body.company.id;

    await api(`/api/platform/companies/${id}`, {
      method: "PATCH",
      token: platformToken,
      body: { name: "Audit Me Cafe (Renamed)" },
    });

    await api(`/api/platform/companies/${id}`, {
      method: "PATCH",
      token: platformToken,
      body: { status: "suspended" },
    });

    await api(`/api/platform/companies/${id}`, {
      method: "PATCH",
      token: platformToken,
      body: { status: "active" },
    });

    const log = await api("/api/platform/audit-log", { token: platformToken });
    check("audit log reachable -> 200", log.status === 200);

    const entries = log.body?.entries || [];
    const forThisBusiness = entries.filter((e) => e.targetName?.startsWith("Audit Me Cafe"));
    check("4 audit entries recorded for this business (onboard, edit, suspend, reactivate)", forThisBusiness.length === 4);

    check("most recent entry first (reactivate)", entries[0]?.action === "reactivate");
    check("actor name is the real platform admin, not just an id", entries[0]?.actorName && entries[0].actorName !== "undefined");

    const actions = forThisBusiness.map((e) => e.action).sort();
    check(
      "the 4 recorded actions are exactly onboard/edit/suspend/reactivate",
      JSON.stringify(actions) === JSON.stringify(["edit", "onboard", "reactivate", "suspend"]),
    );

    const editEntry = forThisBusiness.find((e) => e.action === "edit");
    check("edit entry's details describe the name change", !!editEntry && editEntry.details.includes("Renamed"));
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll platform-audit-log checks passed.");
  }
}

main();

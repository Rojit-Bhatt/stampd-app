/**
 * Batch-vs-loop performance benchmark. Self-contained: boots the real
 * server against the in-memory mock DB, bulk-seeds a tenant with 250
 * customers (birthday today + email/push consent + one earn each with a
 * balance older than the inactivity window), then measures the refactored
 * runDailyTriggers path (batched $in reads, single-pass joins).
 *
 * Measures wall time and MongoDB find round-trip count (server-side
 * mongoose command counter exposed via /__test__/db-op-stats) for the
 * refactored trigger run.
 *
 * Expectation from the plan: refactored round-trip count is O(1) per org
 * per trigger (fixed reads + $in) rather than O(N) per user, and the same
 * seeded flow completes with far fewer server round trips.
 *
 * Run directly: `node tests/batch-writes-perf.js`
 */
const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeCompanyWithOutlet } = require("./helpers/makeOutlet");

const PORT = 5058;
const CUSTOMER_COUNT = 250;

async function main() {
  const { baseUrl, stop } = await bootServer({ port: PORT });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else {
      console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
      failures++;
    }
  };
  const api = makeApi(baseUrl);

  try {
    const provisioned = await makeCompanyWithOutlet(baseUrl, { label: `perf${Date.now()}` });
    const { companySlug, outletSlug, adminToken } = provisioned;

    // Resolve the org id (needed by the seed hook) via the admin menu list
    // or get-organization hook — use __test__/get-organization:
    const orgRes = await api("/__test__/get-organization", {
      method: "POST",
      body: { companySlug, outletSlug }
    });
    const organizationId = orgRes.body?.organizationId;
    check("resolved organization id for seeding", Boolean(organizationId), orgRes.body);

    // Bulk-seed: birthday-today customers, email+push consent, each with an
    // earn and a balance aged past the inactivity window (days=1 below).
    const seed = await api("/__test__/seed-customers", {
      method: "POST",
      body: { organizationId, count: CUSTOMER_COUNT, birthdayToday: true, ageBalanceDays: 5, earnEach: true }
    });
    check(`bulk-seeded >=${CUSTOMER_COUNT} customers in the target org`, Number.isInteger(seed.body?.seeded) && seed.body.seeded >= CUSTOMER_COUNT, seed.body);

    // Enable both triggers via admin settings (inactivity days=1 so every
    // aged balance qualifies; birthday enabled so today's seeded birthdays
    // fire too).
    const settings = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { messagingTriggers: { birthday: { enabled: true }, inactivity: { days: 1 } } }
    });
    check("trigger settings applied", settings.status === 200, settings.body);

    // Stub webpush so the trigger sends don't hit a real endpoint — same
    // technique messaging-triggers.js uses.
    await api("/__test__/stub-webpush-behavior", { method: "POST", body: { behavior: "gone" } });

    // --- Benchmark the REFACTORED path (current runDailyTriggers) ---------
    const resetBefore = await api("/__test__/reset-db-op-stats", { method: "POST" });
    check("op-stats reset ok", resetBefore.status === 200);
    const t0 = Date.now();
    const run = await api("/__test__/run-daily-triggers", { method: "POST" });
    const refactoredMs = Date.now() - t0;
    const afterStats = await api("/__test__/db-op-stats", { method: "GET" });
    const refactoredOps = afterStats.body?.findOps;

    check(
      "runDailyTriggers completes without error",
      run.status === 200,
      { status: run.status, body: run.body }
    );
    check(
      "server-side find-op counter is available",
      Number.isInteger(refactoredOps),
      { afterStats: afterStats.body }
    );
    // The refactored path does a fixed number of reads per org (members,
    // accounts, already-sent guard) — NOT one per user. With 250 users an
    // O(N)-per-user path would exceed 2000 finds easily; the batched path
    // should stay under ~50.
    check(
      "refactored trigger find round trips stay sub-linear vs user count (O(1)-ish)",
      Number.isInteger(refactoredOps) && refactoredOps < CUSTOMER_COUNT * 0.2,
      { findOps: refactoredOps, customers: CUSTOMER_COUNT }
    );

    console.log(`[perf] refactored runDailyTriggers: ${refactoredMs}ms wall, ${refactoredOps} find round trips (${CUSTOMER_COUNT} customers)`);
  } finally {
    await stop();
  }

  if (failures > 0) {
    console.error(`batch-writes-perf: ${failures} FAILED`);
    process.exit(1);
  }
  console.log("batch-writes-perf: ALL PASSED");
}

main().catch((err) => {
  console.error("batch-writes-perf test failed:", err.message);
  process.exit(1);
});

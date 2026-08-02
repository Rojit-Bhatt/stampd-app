/**
 * Cross-tenant events feed (/explore/events). Self-contained: boots its own
 * server on a dedicated port against the in-memory mock DB.
 *
 * Covers: auth gate, cross-outlet aggregation sorted soonest-first, past
 * events excluded, a suspended outlet's events disappearing from the feed,
 * and the 50-event cap keeping the soonest events when more exist.
 *
 * Run directly: `node tests/explore-events.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d) {
  return d.toISOString();
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5058 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);
  const now = new Date();
  const runSuffix = Date.now();

  try {
    // --- auth gate ---
    const noAuth = await api("/api/customer-auth/events");
    check("events feed without a global session -> 401", noAuth.status === 401);

    // --- a global customer session to read the feed with ---
    const email = `explore-events-${runSuffix}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Events Tester", email, password: "password123", phone: "9811110098" },
    });
    const mint = await api("/__test__/mint-global-token", {
      method: "POST",
      body: { email, type: "email_verify" },
    });
    await api(`/api/customer-auth/verify-email?token=${mint.body.token}`);
    const login = await api("/api/customer-auth/login", {
      method: "POST",
      body: { email, password: "password123" },
    });
    const globalToken = login.body.token;
    check("global customer login -> token issued", Boolean(globalToken));

    // --- two outlets, two events, out-of-order creation, must sort by date ---
    const adminLoginA = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const tokenA = adminLoginA.body.token;

    const outletB = await makeSiblingOutlet(baseUrl, { label: `ev${runSuffix}`, category: "bakery" });
    const tokenB = outletB.adminToken;

    // A is created first but dated LATER than B, which is created second —
    // proves the feed sorts by date, not creation order.
    const eventA = await api("/api/admin/events", {
      method: "POST",
      token: tokenA,
      company: COMPANY,
      outlet: SLUG,
      body: { title: `Later Event ${runSuffix}`, date: isoDate(new Date(now.getTime() + 3 * DAY_MS)) },
    });
    check("create later event at outlet A -> 201", eventA.status === 201);

    const eventB = await api("/api/admin/events", {
      method: "POST",
      token: tokenB,
      company: COMPANY,
      outlet: outletB.outletSlug,
      body: { title: `Sooner Event ${runSuffix}`, date: isoDate(new Date(now.getTime() + 1 * DAY_MS)) },
    });
    check("create sooner event at outlet B -> 201", eventB.status === 201);

    // --- a past event at outlet A, must never appear ---
    const pastEvent = await api("/api/admin/events", {
      method: "POST",
      token: tokenA,
      company: COMPANY,
      outlet: SLUG,
      body: { title: `Past Event ${runSuffix}`, date: isoDate(new Date(now.getTime() - 1 * DAY_MS)) },
    });
    check("create past event -> 201", pastEvent.status === 201);

    const feed1 = await api("/api/customer-auth/events", { token: globalToken });
    check("events feed -> 200", feed1.status === 200);
    const titles1 = (feed1.body.events || []).map((e) => e.title);
    check("feed includes outlet A's event", titles1.includes(`Later Event ${runSuffix}`));
    check("feed includes outlet B's event", titles1.includes(`Sooner Event ${runSuffix}`));
    check("feed excludes the past event", !titles1.includes(`Past Event ${runSuffix}`));
    const idxSooner = titles1.indexOf(`Sooner Event ${runSuffix}`);
    const idxLater = titles1.indexOf(`Later Event ${runSuffix}`);
    check("sooner event sorts before the later one despite being created second", idxSooner < idxLater, { idxSooner, idxLater });
    check("outlet attribution present", (feed1.body.events || []).every((e) => e.slug && e.companySlug && e.businessName));

    // --- a suspended outlet's event disappears from the feed ---
    const outletC = await makeSiblingOutlet(baseUrl, { label: `evc${runSuffix}`, category: "cafe" });
    const eventC = await api("/api/admin/events", {
      method: "POST",
      token: outletC.adminToken,
      company: COMPANY,
      outlet: outletC.outletSlug,
      body: { title: `Suspendable Event ${runSuffix}`, date: isoDate(new Date(now.getTime() + 2 * DAY_MS)) },
    });
    check("create event at outlet C -> 201", eventC.status === 201);

    const feedBeforeSuspend = await api("/api/customer-auth/events", { token: globalToken });
    check("feed includes outlet C's event before suspension",
      (feedBeforeSuspend.body.events || []).some((e) => e.title === `Suspendable Event ${runSuffix}`));

    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const suspend = await api(`/api/platform/outlets/${outletC.outletId}`, {
      method: "PATCH",
      token: platformToken,
      body: { status: "suspended" },
    });
    check("platform suspends outlet C -> 200", suspend.status === 200);

    const feedAfterSuspend = await api("/api/customer-auth/events", { token: globalToken });
    check("feed excludes outlet C's event after suspension",
      !(feedAfterSuspend.body.events || []).some((e) => e.title === `Suspendable Event ${runSuffix}`));

    // --- cap at 50: 55 future events at a dedicated outlet, only the
    // soonest 50 across the whole platform come back ---
    const outletD = await makeSiblingOutlet(baseUrl, { label: `evd${runSuffix}`, category: "gym" });
    const CAP_TOTAL = 55;
    await Promise.all(
      Array.from({ length: CAP_TOTAL }, (_, i) =>
        api("/api/admin/events", {
          method: "POST",
          token: outletD.adminToken,
          company: COMPANY,
          outlet: outletD.outletSlug,
          // Offsets start well past the 1-3 day events above, so none of the
          // capped-out events can displace an earlier one already counted.
          body: { title: `CapEvent-${i + 1}`, date: isoDate(new Date(now.getTime() + (100 + i) * DAY_MS)) },
        })
      )
    );

    const feed2 = await api("/api/customer-auth/events", { token: globalToken });
    check("feed never exceeds the 50-event cap", (feed2.body.events || []).length === 50, feed2.body.events?.length);
    const titles2 = feed2.body.events.map((e) => e.title);
    // Two pre-existing, still-active future events (Later Event, Sooner
    // Event) occupy 2 of the 50 slots, leaving room for exactly the 48
    // soonest CapEvents (1..48); 49..55 fall outside the cap.
    check("CapEvent-1 (soonest of the batch) is included", titles2.includes("CapEvent-1"));
    check("CapEvent-48 is included", titles2.includes("CapEvent-48"));
    check("CapEvent-49 is excluded by the cap", !titles2.includes("CapEvent-49"));
    check("CapEvent-55 (furthest out) is excluded by the cap", !titles2.includes("CapEvent-55"));
    const dates2 = feed2.body.events.map((e) => new Date(e.date).getTime());
    const sorted = dates2.every((d, i) => i === 0 || dates2[i - 1] <= d);
    check("capped feed stays sorted soonest-first", sorted);
  } finally {
    stop();
  }

  if (failures) { console.error(`explore-events: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("explore-events: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

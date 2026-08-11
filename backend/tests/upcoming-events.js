/**
 * Upcoming events suite (Epic D5).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms admin CRUD on events, that the public tenant
 * endpoint exposes only upcoming (date >= today) events capped at 3 sorted
 * soonest-first, and tenant isolation.
 *
 * Run directly: `node tests/upcoming-events.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d) {
  return d.toISOString();
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5020 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const now = new Date();
    const tomorrow = isoDate(new Date(now.getTime() + 1 * DAY_MS));
    const yesterday = isoDate(new Date(now.getTime() - 1 * DAY_MS));
    const in10Days = isoDate(new Date(now.getTime() + 10 * DAY_MS));

    const created1 = await api("/api/admin/events", {
      method: "POST",
      token: adminToken,
      body: {
        title: "Live Jazz Night",
        date: tomorrow,
        time: "7:00 PM",
        location: "Main hall",
        description: "Local jazz trio.",
        rewards: [
          { rank: "1st Place", reward: "NPR 5,000 + Trophy" },
          { rank: "2nd Place", reward: "NPR 2,000" },
        ],
      },
    });
    check("create tomorrow event -> 201", created1.status === 201);
    check(
      "create response includes the rewards list",
      Array.isArray(created1.body.event.rewards) && created1.body.event.rewards.length === 2,
    );

    const created2 = await api("/api/admin/events", {
      method: "POST",
      token: adminToken,
      body: { title: "Past Trivia Night", date: yesterday, time: "6:00 PM" },
    });
    check("create yesterday event -> 201", created2.status === 201);
    check(
      "event created without rewards defaults to an empty array",
      Array.isArray(created2.body.event.rewards) && created2.body.event.rewards.length === 0,
    );
    const pastEventId = created2.body.event.id || created2.body.event._id;

    const created3 = await api("/api/admin/events", {
      method: "POST",
      token: adminToken,
      body: { title: "Anniversary Sale", date: in10Days, time: "All day" },
    });
    check("create +10-day event -> 201", created3.status === 201);

    const adminList = await api("/api/admin/events", { token: adminToken });
    check("admin list -> 200", adminList.status === 200);
    check("admin list has all 3 events", adminList.body.events.length === 3);

    const publicTenant = await api("/api/tenant");
    check("public tenant -> 200", publicTenant.status === 200);
    const upcoming = publicTenant.body.tenant.upcomingEvents;
    check("upcoming events excludes the past one", Array.isArray(upcoming) && upcoming.every((e) => e.title !== "Past Trivia Night"));
    check("upcoming events includes tomorrow's event", upcoming.some((e) => e.title === "Live Jazz Night"));
    check("upcoming events includes the +10-day event", upcoming.some((e) => e.title === "Anniversary Sale"));
    check("upcoming events sorted soonest first", new Date(upcoming[0].date) <= new Date(upcoming[1].date));

    const jazzInFeed = upcoming.find((e) => e.title === "Live Jazz Night");
    check(
      "public tenant upcomingEvents carries the rewards list",
      Boolean(jazzInFeed) && Array.isArray(jazzInFeed.rewards) && jazzInFeed.rewards.length === 2
        && jazzInFeed.rewards[0].rank === "1st Place" && jazzInFeed.rewards[0].reward === "NPR 5,000 + Trophy",
    );

    // Cap at 3: add a 4th upcoming event, confirm only 3 come back.
    const in2Days = isoDate(new Date(now.getTime() + 2 * DAY_MS));
    await api("/api/admin/events", {
      method: "POST",
      token: adminToken,
      body: { title: "Extra Upcoming Event", date: in2Days },
    });
    const publicTenant2 = await api("/api/tenant");
    check("upcoming events capped at 3", publicTenant2.body.tenant.upcomingEvents.length === 3);

    // Update.
    const jazzId = created1.body.event.id || created1.body.event._id;
    const patched = await api(`/api/admin/events/${jazzId}`, {
      method: "PATCH",
      token: adminToken,
      body: { time: "8:30 PM" },
    });
    check("update event -> 200", patched.status === 200);
    check("update response reflects new time", patched.body.event.time === "8:30 PM");

    // Delete.
    const deleted = await api(`/api/admin/events/${pastEventId}`, { method: "DELETE", token: adminToken });
    check("delete event -> 200", deleted.status === 200);
    const listAfterDelete = await api("/api/admin/events", { token: adminToken });
    check("deleted event no longer in admin list", listAfterDelete.body.events.every((e) => (e.id || e._id) !== pastEventId));

    // Tenant isolation.
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const runSuffix = Date.now();
    const secondSlug = `brewhaven-${runSuffix}`;
    const secondAdminEmail = `boss+${runSuffix}@brewhaven.test`;
    const sibling = await makeSiblingOutlet(baseUrl, { label: `sib${Date.now()}` });
    const secondPublicTenant = await api("/api/tenant", { slug: sibling.outletSlug });
    check("second tenant's upcomingEvents is empty", Array.isArray(secondPublicTenant.body.tenant.upcomingEvents) && secondPublicTenant.body.tenant.upcomingEvents.length === 0);
  } finally {
    stop();
  }

  if (failures) { console.error(`upcoming-events: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("upcoming-events: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

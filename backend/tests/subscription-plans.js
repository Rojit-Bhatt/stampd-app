/**
 * SubscriptionPlan CRUD suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * Covers: default 3 plans seeded on boot; public endpoint reachable with no
 * auth; owner can create/edit/archive a plan; support (read-only platform
 * role) can read but not write; archived plan disappears from the public
 * list but still resolves for admin management.
 *
 * Run directly: `node tests/subscription-plans.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5027 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
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
    // 1. Public endpoint, no auth, sees the 3 seeded default plans.
    const publicPlans = await api("/api/platform/plans/public");
    check("public plans reachable -> 200", publicPlans.status === 200);
    check("3 default plans seeded", publicPlans.body?.plans?.length === 3);
    const slugs = (publicPlans.body?.plans || []).map((p) => p.slug).sort();
    check("default plan slugs are basic/growth/pro", JSON.stringify(slugs) === JSON.stringify(["basic", "growth", "pro"]));
    const growth = (publicPlans.body?.plans || []).find((p) => p.slug === "growth");
    check("growth is flagged isMostPopular", growth?.isMostPopular === true);
    check("growth priceNpr is a plain number (2499)", growth?.priceNpr === 2499);

    // The outlet limit must be exposed under exactly this name. The platform
    // console's Plans page had been reading `businessLimit` — a field that
    // never existed — so the column rendered blank, creating a plan was
    // rejected outright, and editing a limit returned 200 while silently
    // changing nothing. Every other test here already spoke `outletLimit`,
    // which is why the API looked fine while the UI was broken; this asserts
    // the wire name the frontend actually depends on.
    check("plans expose the limit as `outletLimit`", growth?.outletLimit === 3, growth);
    check(
      "and NOT under any other name",
      growth?.businessLimit === undefined && growth?.limit === undefined,
      growth,
    );

    // 2. Owner login, create a new plan.
    const ownerLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const ownerToken = ownerLogin.body.token;
    check("platform owner logs in", ownerLogin.status === 200);

    const created = await api("/api/platform/plans", {
      method: "POST",
      token: ownerToken,
      body: { name: "Starter Test", slug: "starter-test", priceNpr: 499, outletLimit: 1, features: ["1 location"] },
    });
    check("owner creates a plan -> 201", created.status === 201 && created.body?.plan?.slug === "starter-test");

    // 3. Duplicate slug rejected.
    const dup = await api("/api/platform/plans", {
      method: "POST",
      token: ownerToken,
      body: { name: "Dup", slug: "starter-test", priceNpr: 1, outletLimit: 1 },
    });
    check("duplicate slug rejected -> 409", dup.status === 409);

    // 4. Owner edits the plan (price + outletLimit).
    const edited = await api("/api/platform/plans/starter-test", {
      method: "PATCH",
      token: ownerToken,
      body: { priceNpr: 599, outletLimit: 2 },
    });
    check("owner edits plan -> 200", edited.status === 200 && edited.body?.plan?.priceNpr === 599 && edited.body?.plan?.outletLimit === 2);

    // 5. Support (read-only platform role) can read admin list, cannot write.
    const invite = await api("/api/platform/admins", {
      method: "POST",
      token: ownerToken,
      body: { name: "Plan Support", email: "plansupport@stampd.co", password: "password123", platformRole: "support" },
    });
    check("owner invites a support admin -> 201", invite.status === 201);

    const supportLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "plansupport@stampd.co", password: "password123" },
    });
    const supportToken = supportLogin.body.token;

    const supportRead = await api("/api/platform/plans", { token: supportToken });
    check("support can read admin plan list -> 200", supportRead.status === 200);

    const supportWrite = await api("/api/platform/plans", {
      method: "POST",
      token: supportToken,
      body: { name: "Nope", slug: "nope", priceNpr: 1, outletLimit: 1 },
    });
    check("support CANNOT create a plan -> 403", supportWrite.status === 403);

    // 6. Owner archives the test plan; disappears from public, still in admin list.
    const archived = await api("/api/platform/plans/starter-test", { method: "DELETE", token: ownerToken });
    check("owner archives plan -> 200", archived.status === 200 && archived.body?.plan?.isActive === false);

    const publicAfter = await api("/api/platform/plans/public");
    check("archived plan hidden from public list", !(publicAfter.body?.plans || []).some((p) => p.slug === "starter-test"));

    const adminAfter = await api("/api/platform/plans", { token: ownerToken });
    check("archived plan still visible in admin list", (adminAfter.body?.plans || []).some((p) => p.slug === "starter-test"));

    // Cleanup: remove the support admin so this suite doesn't leak state into
    // any other suite sharing the same process's expectations (each suite
    // boots its own fresh server anyway, but keep the audit trail clean).
    const remove = await api(`/api/platform/admins/${invite.body.admin.id}`, { method: "DELETE", token: ownerToken });
    check("cleanup: support admin removed", remove.status === 200);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll subscription-plans checks passed.");
  }
}

main();

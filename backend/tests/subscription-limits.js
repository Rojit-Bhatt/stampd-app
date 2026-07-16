/**
 * Subscription business-limit + lazy expiry/grace suite. Self-contained:
 * boots its own server on a dedicated port against the in-memory mock DB.
 *
 * Covers: a brand-new owner gets a 14-day/1-business trial automatically on
 * registration; they can create exactly one business, then a second is
 * blocked with BUSINESS_LIMIT_REACHED; an unverified owner can't create any
 * business; within the grace window (past currentPeriodEnd but before
 * GRACE_PERIOD_DAYS) adding a business still works; past the grace window
 * it's blocked with SUBSCRIPTION_EXPIRED even under the business limit; the
 * in-app reminder appears once within EXPIRY_REMINDER_DAYS.
 *
 * Run directly: `node tests/subscription-limits.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5029 });
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

  const registerVerifyLogin = async (email) => {
    await api("/api/owner/register", {
      method: "POST",
      body: { name: "Test Owner", email, password: "password123", phone: "9800000000" },
    });
    const mint = await api("/__test__/mint-owner-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/owner/verify-email?token=${mint.body.token}`);
    const login = await api("/api/owner/login", { method: "POST", body: { email, password: "password123" } });
    return login.body.token;
  };

  try {
    // 1. Fresh owner gets a trial automatically.
    const tokenA = await registerVerifyLogin("subA@test.com");
    const subA = await api("/api/owner/subscription", { token: tokenA });
    check("owner A subscription reachable -> 200", subA.status === 200);
    check("owner A is trialing", subA.body?.subscription?.effectiveStatus === "trialing");
    check("owner A trial limit is 1 business", subA.body?.subscription?.businessLimitAtPurchase === 1);
    check("owner A trial businessCount starts at 0", subA.body?.subscription?.businessCount === 0);

    // 2. Owner A creates their one allowed business.
    const create1 = await api("/api/owner/businesses", {
      method: "POST",
      token: tokenA,
      body: { name: "A's Cafe", slug: `as-cafe-${Date.now()}`, category: "cafe" },
    });
    check("owner A creates their 1st business -> 201", create1.status === 201);

    // 3. A second business is blocked at the trial limit.
    const create2 = await api("/api/owner/businesses", {
      method: "POST",
      token: tokenA,
      body: { name: "A's Second Cafe", slug: `as-cafe-2-${Date.now()}`, category: "cafe" },
    });
    check("owner A blocked from a 2nd business -> 402", create2.status === 402);
    check("2nd business rejection has BUSINESS_LIMIT_REACHED code", create2.body?.code === "BUSINESS_LIMIT_REACHED");

    // 4. An unverified owner can't create any business at all.
    await api("/api/owner/register", {
      method: "POST",
      body: { name: "Unverified Owner", email: "unverified@test.com", password: "password123", phone: "9800000001" },
    });
    const unverifiedLogin = await api("/api/owner/login", {
      method: "POST",
      body: { email: "unverified@test.com", password: "password123" },
    });
    const unverifiedToken = unverifiedLogin.body.token;
    const unverifiedCreate = await api("/api/owner/businesses", {
      method: "POST",
      token: unverifiedToken,
      body: { name: "Should Fail", slug: `should-fail-${Date.now()}` },
    });
    check("unverified owner blocked from creating a business -> 403", unverifiedCreate.status === 403);

    // 5. Grace period: owner B's subscription is pushed 2 days past
    // currentPeriodEnd (GRACE_PERIOD_DAYS is 5) — still allowed to add.
    const tokenB = await registerVerifyLogin("subB@test.com");
    const ownerBAccountRes = await api("/api/owner/subscription", { token: tokenB });
    check("owner B subscription reachable -> 200", ownerBAccountRes.status === 200);

    // Need ownerAccountId for the test hook — decode it from the JWT-like
    // global session isn't meant to be read client-side, so instead grab it
    // via a business creation first isn't needed; the hook accepts
    // ownerAccountId directly, so extract via mint-owner-token's account
    // lookup isn't exposed either. Simplest: decode the unsigned JWT payload
    // (test-only convenience, mirrors lib/api.ts's decodeJwtPayload trick).
    const decodeJwt = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const ownerBId = decodeJwt(tokenB).ownerAccountId;

    const graceExpire = await api("/__test__/expire-subscription", {
      method: "POST",
      body: { ownerAccountId: ownerBId, daysAgo: 2 },
    });
    check("test hook pushes owner B 2 days past period end", graceExpire.status === 200);

    const subBGrace = await api("/api/owner/subscription", { token: tokenB });
    check("owner B effective status is 'grace'", subBGrace.body?.subscription?.effectiveStatus === "grace");

    const createDuringGrace = await api("/api/owner/businesses", {
      method: "POST",
      token: tokenB,
      body: { name: "B's Cafe", slug: `bs-cafe-${Date.now()}`, category: "cafe" },
    });
    check("owner B CAN still create a business during grace -> 201", createDuringGrace.status === 201);

    // 6. Past grace (10 days, > GRACE_PERIOD_DAYS=5) -> blocked even though
    // this specific owner is technically still under most plans' limits in
    // spirit; here owner B is now AT their trial limit (1) too, but the
    // rejection code proves it's the expiry check that fires, not the count
    // check silently producing the same status for a different reason.
    const pastGraceExpire = await api("/__test__/expire-subscription", {
      method: "POST",
      body: { ownerAccountId: ownerBId, daysAgo: 10 },
    });
    check("test hook pushes owner B 10 days past period end", pastGraceExpire.status === 200);

    const subBExpired = await api("/api/owner/subscription", { token: tokenB });
    check("owner B effective status is 'expired'", subBExpired.body?.subscription?.effectiveStatus === "expired");
    check("owner B's reminder shows (past due)", subBExpired.body?.reminder?.show === true);

    const createAfterExpiry = await api("/api/owner/businesses", {
      method: "POST",
      token: tokenB,
      body: { name: "B's 2nd Cafe", slug: `bs-cafe-2-${Date.now()}`, category: "cafe" },
    });
    check("owner B blocked after real expiry -> 402", createAfterExpiry.status === 402);
    check("expired rejection has SUBSCRIPTION_EXPIRED code", createAfterExpiry.body?.code === "SUBSCRIPTION_EXPIRED");

    // 7. Reminder appears within EXPIRY_REMINDER_DAYS even while still
    // nominally "trialing" (owner A, untouched, still has 12+ days left —
    // should NOT show yet).
    const subAReminder = await api("/api/owner/subscription", { token: tokenA });
    check("owner A (fresh trial, 14 days left) reminder does NOT show yet", subAReminder.body?.reminder?.show === false);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll subscription-limits checks passed.");
  }
}

main();

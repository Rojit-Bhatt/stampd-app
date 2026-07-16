/**
 * Subscription-key activation suite (replaces live payment-gateway
 * integration — see docs/superpowers/plans/
 * 2026-07-16-multi-business-subscriptions.md). Self-contained: boots its own
 * server on a dedicated port against the in-memory mock DB.
 *
 * Covers: platform owner generates a key scoped to a plan; an owner redeems
 * it to activate/extend their subscription; a used/revoked key can't be
 * redeemed again; the downgrade-over-limit rule blocks redeeming a
 * lower-limit key while over that limit; the tenant-scoped
 * /api/admin/subscription surface (no separate owner login needed) reflects
 * the same subscription and can redeem a key too; platform contact info is
 * always included in the summary.
 *
 * Run directly: `node tests/subscription-keys.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5030 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) headers["X-Tenant-Slug"] = slug;
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
      body: { name: "Key Test Owner", email, password: "password123", phone: "9800000002" },
    });
    const mint = await api("/__test__/mint-owner-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/owner/verify-email?token=${mint.body.token}`);
    const login = await api("/api/owner/login", { method: "POST", body: { email, password: "password123" } });
    return login.body.token;
  };

  try {
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    // 1. Generate a "growth" key (limit 3).
    const genGrowth = await api("/api/platform/subscription-keys", {
      method: "POST",
      token: platformToken,
      body: { planSlug: "growth", note: "Test — paid via phone call" },
    });
    check("platform owner generates a growth key -> 201", genGrowth.status === 201 && Boolean(genGrowth.body?.key?.code));
    const growthCode = genGrowth.body.key.code;

    // 2. Bad plan slug rejected.
    const genBad = await api("/api/platform/subscription-keys", {
      method: "POST",
      token: platformToken,
      body: { planSlug: "not-a-real-plan" },
    });
    check("generating a key for a nonexistent plan -> 404", genBad.status === 404);

    // 3. Owner redeems the growth key.
    const tokenC = await registerVerifyLogin("subC@test.com");
    const redeemGrowth = await api("/api/owner/subscription/redeem-key", {
      method: "POST",
      token: tokenC,
      body: { code: growthCode },
    });
    check("owner C redeems the growth key -> 200", redeemGrowth.status === 200);

    const subCAfter = await api("/api/owner/subscription", { token: tokenC });
    check("owner C is now on growth (limit 3)", subCAfter.body?.subscription?.businessLimitAtPurchase === 3);
    check("owner C effective status is active", subCAfter.body?.subscription?.effectiveStatus === "active");
    check("platformContact present in summary", "platformContact" in subCAfter.body && "phone" in subCAfter.body.platformContact);

    // 4. Reusing the same key fails.
    const reuse = await api("/api/owner/subscription/redeem-key", {
      method: "POST",
      token: tokenC,
      body: { code: growthCode },
    });
    check("reusing an already-redeemed key -> 400", reuse.status === 400);

    // 5. Platform list shows it redeemed, with the owner it was assigned to.
    const decodeJwt = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    const ownerCId = decodeJwt(tokenC).ownerAccountId;
    const keyList = await api("/api/platform/subscription-keys", { token: platformToken });
    const listedKey = (keyList.body?.keys || []).find((k) => k.code === growthCode);
    check("platform key list shows it redeemed", listedKey?.status === "redeemed");
    check("platform key list shows the redeeming owner", listedKey?.assignedToOwnerAccountId === ownerCId);

    // 6. Revoke an unused key, then it can't be redeemed.
    const genToRevoke = await api("/api/platform/subscription-keys", {
      method: "POST",
      token: platformToken,
      body: { planSlug: "basic" },
    });
    const revoked = await api(`/api/platform/subscription-keys/${genToRevoke.body.key.code}`, {
      method: "DELETE",
      token: platformToken,
    });
    check("owner revokes an unused key -> 200", revoked.status === 200 && revoked.body?.key?.status === "revoked");

    const redeemRevoked = await api("/api/owner/subscription/redeem-key", {
      method: "POST",
      token: tokenC,
      body: { code: genToRevoke.body.key.code },
    });
    check("redeeming a revoked key -> 400", redeemRevoked.status === 400);

    // 7. Downgrade-over-limit: owner C creates 2 businesses (now has 1 from
    // no prior creation — create 2 fresh ones to reach 2, still <= 3), then
    // a "basic" (limit 1) key must be rejected.
    await api("/api/owner/businesses", {
      method: "POST",
      token: tokenC,
      body: { name: "C's Cafe 1", slug: `cs-cafe-1-${Date.now()}`, category: "cafe" },
    });
    await api("/api/owner/businesses", {
      method: "POST",
      token: tokenC,
      body: { name: "C's Cafe 2", slug: `cs-cafe-2-${Date.now()}`, category: "cafe" },
    });
    const genBasicForC = await api("/api/platform/subscription-keys", {
      method: "POST",
      token: platformToken,
      body: { planSlug: "basic" },
    });
    const downgradeAttempt = await api("/api/owner/subscription/redeem-key", {
      method: "POST",
      token: tokenC,
      body: { code: genBasicForC.body.key.code },
    });
    check("redeeming a lower-limit key while over that limit -> 400", downgradeAttempt.status === 400);
    check("downgrade rejection has PLAN_BELOW_CURRENT_USAGE code", downgradeAttempt.body?.code === "PLAN_BELOW_CURRENT_USAGE");

    // 8. Tenant-scoped /api/admin/subscription — enter one of owner C's
    // businesses and confirm the same subscription is visible + redeemable
    // from inside the ordinary tenant admin console, no owner login needed.
    const myBusinesses = await api("/api/owner/my-businesses", { token: tokenC });
    const firstBiz = myBusinesses.body.businesses[0];
    const enterResult = await api("/api/owner/enter-business", {
      method: "POST",
      token: tokenC,
      body: { organizationId: firstBiz.organizationId },
    });
    const tenantToken = enterResult.body.token;

    const tenantSubView = await api("/api/admin/subscription", { token: tenantToken, slug: firstBiz.slug });
    check("tenant-scoped subscription view -> 200", tenantSubView.status === 200);
    check(
      "tenant-scoped view shows the SAME subscription as the owner dashboard",
      tenantSubView.body?.subscription?.businessLimitAtPurchase === subCAfter.body?.subscription?.businessLimitAtPurchase,
    );

    const genProForTenantRedeem = await api("/api/platform/subscription-keys", {
      method: "POST",
      token: platformToken,
      body: { planSlug: "pro" },
    });
    const tenantRedeem = await api("/api/admin/subscription/redeem-key", {
      method: "POST",
      token: tenantToken,
      slug: firstBiz.slug,
      body: { code: genProForTenantRedeem.body.key.code },
    });
    check("redeeming a key from inside the tenant admin console -> 200", tenantRedeem.status === 200);

    const subCFinal = await api("/api/owner/subscription", { token: tokenC });
    check("owner C is now on pro (limit 6) after the tenant-console redemption", subCFinal.body?.subscription?.businessLimitAtPurchase === 6);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll subscription-keys checks passed.");
  }
}

main();

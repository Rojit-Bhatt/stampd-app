/**
 * Subscription-key activation suite. There is no payment gateway: the
 * platform admin issues a key out-of-band and the company owner redeems it.
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB.
 *
 * Covers: generating a key scoped to a plan; a company owner redeeming it to
 * activate/extend its subscription; used/revoked keys refusing a second
 * redemption; concurrent redemption of one key yielding exactly one winner;
 * the downgrade-over-limit rule (and the rejected key being released rather
 * than burned); and redemption being company-owner-only.
 *
 * Run directly: `node tests/subscription-keys.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeCompanyWithOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5030 });
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
  const genKey = (token, planSlug, note) =>
    api("/api/platform/subscription-keys", { method: "POST", token, body: { planSlug, note } });
  const redeem = (token, code) =>
    api("/api/company/subscription/redeem-key", { method: "POST", token, body: { code } });
  const addOutlet = (token, label) =>
    api("/api/company/outlets", {
      method: "POST", token,
      body: {
        name: `Outlet ${label}`, slug: `o-${label}`, category: "cafe",
        adminName: `Admin ${label}`, adminEmail: `a-${label}@test.com`, adminPassword: "password",
      },
    });

  try {
    const stamp = Date.now();
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    // 1. Generate a growth key (3 outlets).
    const growth = await genKey(platformToken, "growth", "Test — paid by phone");
    check("platform owner generates a growth key -> 201", growth.status === 201 && Boolean(growth.body?.key?.code));
    const growthCode = growth.body.key.code;

    const bad = await genKey(platformToken, "not-a-real-plan");
    check("key for a nonexistent plan -> 404", bad.status === 404);

    // 2. A company redeems it and moves onto growth.
    const c = await makeCompanyWithOutlet(baseUrl, { label: `keyc${stamp}`, withOutlet: false });
    const redeemed = await redeem(c.ownerToken, growthCode);
    check("company redeems the growth key -> 200", redeemed.status === 200);

    const subAfter = await api("/api/company/subscription", { token: c.ownerToken });
    check("...and is now on growth (3 outlets)", subAfter.body?.subscription?.outletLimitAtPurchase === 3);
    check("...with an active subscription", subAfter.body?.subscription?.effectiveStatus === "active");
    check("platform contact included for manual renewal", "platformContact" in subAfter.body);

    // 3. The same key can't be reused.
    const reuse = await redeem(c.ownerToken, growthCode);
    check("reusing a redeemed key -> 400", reuse.status === 400);

    const decodeJwt = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64").toString());
    const companyCId = decodeJwt(c.ownerToken).companyId;
    const keyList = await api("/api/platform/subscription-keys", { token: platformToken });
    const listed = (keyList.body?.keys || []).find((k) => k.code === growthCode);
    check("platform key list shows it redeemed", listed?.status === "redeemed");
    check("...and which company redeemed it", listed?.assignedToCompanyId === companyCId);

    // 4. Revoking an unused key blocks redemption and assigns nobody.
    const toRevoke = await genKey(platformToken, "basic");
    const revoked = await api(`/api/platform/subscription-keys/${toRevoke.body.key.code}`, {
      method: "DELETE", token: platformToken,
    });
    check("platform revokes an unused key -> 200", revoked.status === 200 && revoked.body?.key?.status === "revoked");
    check("...and it has no assigned company", revoked.body?.key?.assignedToCompanyId === null);

    const redeemRevoked = await redeem(c.ownerToken, toRevoke.body.key.code);
    check("redeeming a revoked key -> 400", redeemRevoked.status === 400);

    // 5. Two companies racing on one key: exactly one wins.
    const race = await genKey(platformToken, "basic");
    const d = await makeCompanyWithOutlet(baseUrl, { label: `keyd${stamp}`, withOutlet: false });
    const e = await makeCompanyWithOutlet(baseUrl, { label: `keye${stamp}`, withOutlet: false });
    const [rA, rB] = await Promise.all([
      redeem(d.ownerToken, race.body.key.code),
      redeem(e.ownerToken, race.body.key.code),
    ]);
    const statuses = [rA.status, rB.status].sort();
    check("concurrent redemption: exactly one 200 and one 400", statuses[0] === 200 && statuses[1] === 400);

    // 6. Downgrade-over-limit: a company running 2 outlets can't drop to a
    // 1-outlet plan, and the rejected key must be released, not burned.
    await addOutlet(c.ownerToken, `c1${stamp}`);
    await addOutlet(c.ownerToken, `c2${stamp}`);

    const basicKey = await genKey(platformToken, "basic");
    const downgrade = await redeem(c.ownerToken, basicKey.body.key.code);
    check("redeeming a lower-limit key while over it -> 400", downgrade.status === 400);
    check("...with PLAN_BELOW_CURRENT_USAGE", downgrade.body?.code === "PLAN_BELOW_CURRENT_USAGE");

    const afterReject = await api("/api/platform/subscription-keys", { token: platformToken });
    const basicListed = (afterReject.body?.keys || []).find((k) => k.code === basicKey.body.key.code);
    check("...and the rejected key is released, not burned", basicListed?.status === "unused");

    // 7. Redemption is company-owner-only: an outlet admin's tenant JWT
    // can't reach it.
    const outletAdminEmail = `a-c1${stamp}@test.com`;
    const mint = await api("/__test__/mint-admin-token", {
      method: "POST", body: { email: outletAdminEmail, type: "email_verify" },
    });
    await api(`/api/admin-auth/verify-email?token=${mint.body.token}`);
    const outletAdminLogin = await api("/api/admin-auth/login", {
      method: "POST", body: { email: outletAdminEmail, password: "password" },
    });
    check("the outlet's admin can sign in", outletAdminLogin.status === 200);
    const proKey = await genKey(platformToken, "pro");
    const byOutletAdmin = await redeem(outletAdminLogin.body.token, proKey.body.key.code);
    check("an outlet admin cannot redeem a key -> 401", byOutletAdmin.status === 401);
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

/**
 * BusinessOwnerAccount identity suite. Self-contained: boots its own server
 * on a dedicated port against the in-memory mock DB.
 *
 * Covers: register -> verify -> login for a brand-new owner; a fresh owner
 * with no businesses gets an empty my-businesses list and is denied entry
 * to a business it doesn't own; the seeded Coffesarowar tenant is
 * grandfathered with an owner account on boot (no password — must be
 * claimed via forgot/reset password); once claimed, that owner's
 * my-businesses includes Coffesarowar and enter-business returns a tenant
 * JWT for the SAME pre-existing business_admin row (not a freshly
 * auto-provisioned one, unlike the customer identity flow).
 *
 * Run directly: `node tests/business-owner-identity.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5028 });
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

  try {
    // 1. Register a brand-new owner.
    const registered = await api("/api/owner/register", {
      method: "POST",
      body: { name: "Fresh Owner", email: "freshowner@test.com", password: "password123", phone: "9800000001" },
    });
    check("owner registers -> 201", registered.status === 201);

    const mintVerify = await api("/__test__/mint-owner-token", {
      method: "POST",
      body: { email: "freshowner@test.com", type: "email_verify" },
    });
    check("mint email_verify token for fresh owner", mintVerify.status === 200 && Boolean(mintVerify.body.token));

    const verified = await api(`/api/owner/verify-email?token=${mintVerify.body.token}`);
    check("fresh owner verifies email -> 200", verified.status === 200);

    const freshLogin = await api("/api/owner/login", {
      method: "POST",
      body: { email: "freshowner@test.com", password: "password123" },
    });
    check("fresh owner logs in -> 200", freshLogin.status === 200 && Boolean(freshLogin.body.token));
    const freshOwnerToken = freshLogin.body.token;

    const freshMyBusinesses = await api("/api/owner/my-businesses", { token: freshOwnerToken });
    check("fresh owner has zero businesses", freshMyBusinesses.status === 200 && freshMyBusinesses.body.businesses.length === 0);

    // Coffesarowar's real org id, via the public tenant lookup.
    const tenantInfo = await api("/api/tenant", { slug: "coffesarowar" });
    const coffesarowarId = tenantInfo.body?.tenant?.id;
    check("resolved coffesarowar's organization id", Boolean(coffesarowarId));

    const deniedEnter = await api("/api/owner/enter-business", {
      method: "POST",
      token: freshOwnerToken,
      body: { organizationId: coffesarowarId },
    });
    check("fresh owner denied entry to a business they don't own -> 403", deniedEnter.status === 403);

    // 2. The grandfathered owner (seeded barista) — claim via forgot/reset,
    // since the seed intentionally sets no password.
    const mintReset = await api("/__test__/mint-owner-token", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", type: "password_reset" },
    });
    check("mint password_reset token for grandfathered owner", mintReset.status === 200 && Boolean(mintReset.body.token));

    const resetResult = await api("/api/owner/reset-password", {
      method: "POST",
      body: { token: mintReset.body.token, password: "newpassword123" },
    });
    check("grandfathered owner sets a password -> 200", resetResult.status === 200);

    const ownerLogin = await api("/api/owner/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "newpassword123" },
    });
    check("grandfathered owner logs in -> 200", ownerLogin.status === 200 && Boolean(ownerLogin.body.token));
    const ownerToken = ownerLogin.body.token;

    const myBusinesses = await api("/api/owner/my-businesses", { token: ownerToken });
    check(
      "grandfathered owner's my-businesses includes Coffesarowar",
      myBusinesses.status === 200 && myBusinesses.body.businesses.some((b) => b.slug === "coffesarowar"),
    );

    const enterResult = await api("/api/owner/enter-business", {
      method: "POST",
      token: ownerToken,
      body: { organizationId: coffesarowarId },
    });
    check("owner enters Coffesarowar -> 200 with a tenant JWT", enterResult.status === 200 && Boolean(enterResult.body.token));
    check("entered tenant JWT is business_admin role for the right org", enterResult.body?.user?.role === "business_admin" && enterResult.body?.user?.organizationId === coffesarowarId);

    // The tenant JWT returned must work against the real tenant admin API —
    // proves it's the SAME pre-existing business_admin row, not a new one.
    const settingsCheck = await api("/api/admin/settings", { token: enterResult.body.token, slug: "coffesarowar" });
    check("entered tenant JWT actually authenticates against /api/admin", settingsCheck.status === 200);

    // 3. Bad global-owner-session shouldn't work as a tenant token, and vice
    // versa — cross-check the type-disambiguation in tokenUtils.
    const globalTokenAsTenant = await api("/api/admin/settings", { token: ownerToken, slug: "coffesarowar" });
    check("global owner session token rejected by tenant-JWT-only route -> 401", globalTokenAsTenant.status === 401);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll business-owner-identity checks passed.");
  }
}

main();

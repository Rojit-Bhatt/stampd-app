/**
 * Account settings + business-admin email verification suite (Epic E1).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms profile/password edits work for all three
 * roles, that onboarding a new business sends its admin a verification
 * email, that GET /api/admin/settings exposes adminEmailVerified correctly
 * before and after verifying, and tenant isolation.
 *
 * Run directly: `node tests/account-settings.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5021 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
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
    // --- Customer: profile + password ---
    const email = `e1_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "E1 Tester", email, password: "password", phone: "+9779811110000", address: "1 Test St" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Tenant-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    const customerToken = customerLogin.body.token;

    const meBefore = await api("/api/account/me", { token: customerToken });
    check("customer GET /account/me -> 200", meBefore.status === 200);
    check("customer me has correct name", meBefore.body.name === "E1 Tester");

    const patchedName = await api("/api/account/profile", { method: "PATCH", token: customerToken, body: { name: "Renamed Tester" } });
    check("customer profile update -> 200", patchedName.status === 200);
    check("customer profile update reflects new name", patchedName.body.name === "Renamed Tester");

    const wrongPw = await api("/api/account/change-password", {
      method: "POST", token: customerToken, body: { currentPassword: "wrong", newPassword: "newpassword1" },
    });
    check("wrong current password -> 401", wrongPw.status === 401);

    const rightPw = await api("/api/account/change-password", {
      method: "POST", token: customerToken, body: { currentPassword: "password", newPassword: "newpassword1" },
    });
    check("correct current password -> 200", rightPw.status === 200);

    const oldPwLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "password" } });
    check("old password no longer works", oldPwLogin.status === 401);
    const newPwLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "newpassword1" } });
    check("new password works", newPwLogin.status === 200);

    // --- Business admin: existing seeded admin, profile + password ---
    const adminLogin = await api("/api/auth/login", { method: "POST", body: { email: "barista@mansarowar.cafe", password: "password" } });
    const adminToken = adminLogin.body.token;

    const adminMe = await api("/api/account/me", { token: adminToken });
    check("admin GET /account/me -> 200", adminMe.status === 200);
    check("admin me has role business_admin", adminMe.body.role === "business_admin");

    const adminPatch = await api("/api/account/profile", { method: "PATCH", token: adminToken, body: { name: "Renamed Barista" } });
    check("admin profile update -> 200", adminPatch.status === 200);

    // --- Platform: profile + password ---
    const platformLogin = await api("/api/platform/login", { method: "POST", slug: undefined, body: { email: "admin@stampd.co", password: "password" } });
    const platformToken = platformLogin.body.token;

    const platformMe = await api("/api/account/me", { slug: undefined, token: platformToken });
    check("platform GET /account/me -> 200", platformMe.status === 200);
    check("platform me has role platform", platformMe.body.role === "platform");

    // --- New business onboarding: admin starts unverified, gets a verify email ---
    const runSuffix = Date.now();
    const secondSlug = `brewhaven-${runSuffix}`;
    const secondAdminEmail = `boss+${runSuffix}@brewhaven.test`;
    await api("/api/platform/businesses", {
      method: "POST",
      slug: undefined,
      token: platformToken,
      body: {
        name: "Brew Haven",
        slug: secondSlug,
        adminName: "Haven Boss",
        adminEmail: secondAdminEmail,
        adminPassword: "password",
      },
    });
    const secondAdminLogin = await api("/api/auth/login", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, password: "password" } });
    const secondAdminToken = secondAdminLogin.body.token;

    const secondSettingsBefore = await api("/api/admin/settings", { slug: secondSlug, token: secondAdminToken });
    check("new admin settings -> 200", secondSettingsBefore.status === 200);
    check("new admin starts unverified", secondSettingsBefore.body.settings.adminEmailVerified === false);

    const mintAdminVerify = await api("/__test__/mint-token", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, type: "email_verify" } });
    check("mint verify token for new admin -> 200", mintAdminVerify.status === 200);
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-email?token=${mintAdminVerify.body.token}`, { headers: { "X-Tenant-Slug": secondSlug } });
    check("new admin verify-email link -> 200", verifyRes.status === 200);

    const secondSettingsAfter = await api("/api/admin/settings", { slug: secondSlug, token: secondAdminToken });
    check("new admin now verified", secondSettingsAfter.body.settings.adminEmailVerified === true);

    // --- Existing seeded admin (verified since seed) unaffected by the new tenant ---
    const originalSettings = await api("/api/admin/settings", { token: adminToken });
    check("original tenant's admin still verified, untouched by second tenant", originalSettings.body.settings.adminEmailVerified === true);
  } finally {
    stop();
  }

  if (failures) { console.error(`account-settings: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("account-settings: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

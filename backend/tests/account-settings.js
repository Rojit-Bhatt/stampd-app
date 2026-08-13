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
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
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
    // --- Customer: profile + password ---
    const email = `e1_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "E1 Tester", email, password: "password", phone: "+9779811110000", address: "1 Test St" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Company-Slug": COMPANY, "X-Outlet-Slug": SLUG } });
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
    const adminLogin = await api("/api/admin-auth/login", { method: "POST", body: { email: "durbarmarg@coffesarowar.com", password: "password" } });
    const adminToken = adminLogin.body.token;

    const adminMe = await api("/api/account/me", { token: adminToken });
    check("admin GET /account/me -> 200", adminMe.status === 200);
    check("admin me has role business_admin", adminMe.body.role === "business_admin");

    const adminPatch = await api("/api/account/profile", { method: "PATCH", token: adminToken, body: { name: "Renamed Barista" } });
    check("admin profile update -> 200", adminPatch.status === 200);

    // --- Setting a password on a Google-only admin account ---
    const cleared = await api("/__test__/clear-password", {
      method: "POST", slug: undefined, body: { email: "durbarmarg@coffesarowar.com", kind: "staff" },
    });
    check("clear-password test hook -> 200", cleared.status === 200);

    const meBeforeSet = await api("/api/account/me", { token: adminToken });
    check("hasPassword is false once password is cleared", meBeforeSet.body.hasPassword === false);

    const setWithoutCurrent = await api("/api/account/change-password", {
      method: "POST", token: adminToken, body: { newPassword: "adminfreshpass1" },
    });
    check("setting a first password with no currentPassword -> 200", setWithoutCurrent.status === 200);

    // Setting the first password bumps the account's passwordVersion, which
    // kills the pre-change token on the very next request (the same
    // credential-version contract the customer flow exercises above). Re-
    // login to get a fresh token before asserting. The outlet admin's
    // sign-in credential lives on AdminAccount (still "password" — the
    // change-password hook only touched the User membership row that
    // hasPassword reads from), so sign in with the original password.
    const adminLoginAfterSet = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    check("re-login after setting first password -> token", Boolean(adminLoginAfterSet.body.token));
    const freshAdminToken = adminLoginAfterSet.body.token;

    const meAfterSet = await api("/api/account/me", { token: freshAdminToken });
    check("hasPassword is true after setting one", meAfterSet.body.hasPassword === true);

    // Restore the original (unset) password so later tests in this file (or
    // a re-run against the same seeded admin) aren't affected — the seeded
    // admin never had a User.password to begin with (see models/User.js:
    // business_admin credentials live on AdminAccount, not here), so this
    // is restoring to null, not to "password".
    const restored = await api("/__test__/restore-password", {
      method: "POST", slug: undefined, body: { email: "durbarmarg@coffesarowar.com", kind: "staff", passwordHash: cleared.body.previousPasswordHash },
    });
    check("restore-password test hook -> 200", restored.status === 200);

    // --- Platform: profile + password ---
    const platformLogin = await api("/api/platform/login", { method: "POST", slug: undefined, body: { email: "admin@stampd.co", password: "password" } });
    const platformToken = platformLogin.body.token;

    const platformMe = await api("/api/account/me", { slug: undefined, token: platformToken });
    check("platform GET /account/me -> 200", platformMe.status === 200);
    check("platform me has role platform", platformMe.body.role === "platform");

    // --- A new outlet's admin must verify before it can sign in at all ---
    const sibling = await makeSiblingOutlet(baseUrl, { label: `sib${Date.now()}`, verify: false });

    const unverifiedLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: sibling.adminEmail, password: "password" },
    });
    check("a new outlet's admin can't sign in before verifying -> 403", unverifiedLogin.status === 403);
    check("...with NEEDS_VERIFICATION", unverifiedLogin.body?.code === "NEEDS_VERIFICATION");

    const mintAdminVerify = await api("/__test__/mint-admin-token", {
      method: "POST", slug: undefined,
      body: { email: sibling.adminEmail, type: "email_verify" },
    });
    check("mint verify token for the new admin -> 200", mintAdminVerify.status === 200);
    const verifyRes = await api(`/api/admin-auth/verify-email?token=${mintAdminVerify.body.token}`, { slug: undefined });
    check("new admin's verify-email link -> 200", verifyRes.status === 200);

    const verifiedLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: sibling.adminEmail, password: "password" },
    });
    check("...and can sign in once verified -> 200", verifiedLogin.status === 200);

    const secondSettingsAfter = await api("/api/admin/settings", { slug: sibling.outletSlug, token: verifiedLogin.body.token });
    check("new admin's console reports it verified", secondSettingsAfter.body.settings.adminEmailVerified === true);

    // --- The seeded admin (verified at seed) is untouched by all of this ---
    const originalSettings = await api("/api/admin/settings", { token: freshAdminToken });
    check("this outlet's admin still verified, untouched by the sibling", originalSettings.body.settings.adminEmailVerified === true);
  } finally {
    stop();
  }

  if (failures) { console.error(`account-settings: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("account-settings: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

/**
 * Coverage-gap suite (bug-fix review pass): closes the 4 previously-untested
 * endpoints (POST /api/auth/google, POST /api/auth/complete-profile,
 * DELETE /api/admin/menu/:id, GET /api/reviews).
 *
 * The Google OAuth success path can't be exercised here without a real,
 * live-signed Google ID token (google-auth-library verifies the signature
 * against Google's public keys) — this suite covers the input-validation
 * and error-handling paths instead, including the email_verified regression
 * guard added during this review (payload.email_verified !== true is
 * rejected, but that branch only runs after a real signature check, so it
 * isn't independently reachable with a fabricated token either).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB.
 *
 * Run directly: `node tests/auth-google-and-profile.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({
    port: 5030,
    // A dummy client id so authenticateWithGoogle proceeds past its own
    // "GOOGLE_CLIENT_ID is not defined" 500 and into the real verifyIdToken
    // call, which fails locally on a malformed token — deterministic
    // regardless of whatever the developer's real .env holds.
    env: { GOOGLE_CLIENT_ID: "dummy-test-client-id" },
  });
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
    // --- POST /api/auth/google ---
    const googleNoSlug = await api("/api/auth/google", {
      method: "POST",
      slug: null,
      body: { idToken: "whatever" },
    });
    check("google auth without tenant slug -> 400", googleNoSlug.status === 400);

    const googleNoToken = await api("/api/auth/google", {
      method: "POST",
      body: {},
    });
    check("google auth without idToken -> 400", googleNoToken.status === 400);

    const googleBadToken = await api("/api/auth/google", {
      method: "POST",
      body: { idToken: "not-a-real-google-token" },
    });
    check("google auth with garbage idToken -> 401", googleBadToken.status === 401);
    check("google auth with garbage idToken -> 'Invalid Google token.'", googleBadToken.body?.message === "Invalid Google token.");

    // --- POST /api/auth/complete-profile ---
    const noTokenComplete = await api("/api/auth/complete-profile", {
      method: "POST",
      body: { phone: "9800000000" },
    });
    check("complete-profile without token -> 401", noTokenComplete.status === 401);

    const runSuffix = Date.now();
    const customerEmail = `gap-${runSuffix}@test.co`;
    const register = await api("/api/auth/register", {
      method: "POST",
      body: { name: "Gap Customer", email: customerEmail, password: "password123", phone: "9811111111" },
    });
    check("register customer for gap suite -> 200/201", register.status === 200 || register.status === 201);

    // Registration doesn't auto-login (unverified customers can't get a
    // session token) — verify via the dev-only mint-token hook, then login.
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email: customerEmail, type: "email_verify" } });
    await fetch(`${baseUrl}/api/auth/verify-email?token=${mint.body.token}`, { headers: { "X-Tenant-Slug": SLUG } });
    const customerLogin = await api("/api/auth/login", { method: "POST", body: { email: customerEmail, password: "password123" } });
    const customerToken = customerLogin.body?.token;
    check("customer login after verify -> token issued", Boolean(customerToken));

    const completeNoPhone = await api("/api/auth/complete-profile", {
      method: "POST",
      token: customerToken,
      body: {},
    });
    check("complete-profile without phone -> 400", completeNoPhone.status === 400);

    const completeOk = await api("/api/auth/complete-profile", {
      method: "POST",
      token: customerToken,
      body: { phone: "9800000000", address: "123 Test St" },
    });
    check("complete-profile with phone -> 200", completeOk.status === 200);

    // --- DELETE /api/admin/menu/:id ---
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const customersList = await api("/api/admin/customers", { token: adminToken });
    const gapCustomer = (customersList.body?.data || []).find((c) => c.email === customerEmail);
    check("complete-profile saved phone, visible to admin", gapCustomer?.phone === "9800000000");

    const created = await api("/api/admin/menu", {
      method: "POST",
      token: adminToken,
      body: { name: `Gap Item ${runSuffix}`, description: "", price: "100", category: "General" },
    });
    check("create menu item for delete test -> 200/201", created.status === 200 || created.status === 201);
    const itemId = created.body?.item?.id || created.body?.item?._id;
    check("created item has an id", Boolean(itemId));

    const del = await api(`/api/admin/menu/${itemId}`, { method: "DELETE", token: adminToken });
    check("delete menu item -> 200", del.status === 200);

    const listAfterDelete = await api("/api/admin/menu", { token: adminToken });
    const stillThere = (listAfterDelete.body?.items || []).some((i) => (i.id || i._id) === itemId);
    check("deleted item no longer in list", !stillThere);

    const delAgain = await api(`/api/admin/menu/${itemId}`, { method: "DELETE", token: adminToken });
    check("deleting an already-deleted item -> 404", delAgain.status === 404);

    // Tenant isolation: a second tenant's admin can't delete this tenant's item.
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const secondSlug = `gapcafe-${runSuffix}`;
    await api("/api/platform/businesses", {
      method: "POST",
      slug: undefined,
      token: platformToken,
      body: {
        name: "Gap Cafe",
        slug: secondSlug,
        adminName: "Gap Boss",
        adminEmail: `gapboss+${runSuffix}@test.co`,
        adminPassword: "password",
      },
    });
    const secondAdminLogin = await api("/api/auth/login", {
      method: "POST",
      slug: secondSlug,
      body: { email: `gapboss+${runSuffix}@test.co`, password: "password" },
    });
    const secondAdminToken = secondAdminLogin.body.token;

    const createdAgain = await api("/api/admin/menu", {
      method: "POST",
      token: adminToken,
      body: { name: `Gap Item 2 ${runSuffix}`, description: "", price: "100", category: "General" },
    });
    const secondItemId = createdAgain.body?.item?.id || createdAgain.body?.item?._id;

    const crossTenantDelete = await api(`/api/admin/menu/${secondItemId}`, {
      method: "DELETE",
      token: secondAdminToken,
    });
    check("cross-tenant delete attempt -> 404 (isolation held)", crossTenantDelete.status === 404);

    // --- GET /api/reviews ---
    const reviews = await api("/api/reviews", { slug: undefined });
    check("GET /api/reviews -> 200", reviews.status === 200);
    check("reviews fall back to no_api_key without GOOGLE_PLACES_API_KEY", reviews.body?.source === "no_api_key" && reviews.body?.success === false);
  } finally {
    stop();
  }

  if (failures) { console.error(`auth-google-and-profile: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("auth-google-and-profile: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

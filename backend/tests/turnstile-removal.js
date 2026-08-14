/**
 * turnstile-removal.js — regression guard for the 2026-08-14 Cloudflare
 * Turnstile removal.
 *
 * The Turnstile widget and server-side check were removed because the
 * live build shipped with an empty site key (both the widget and the
 * Google button disappeared from every login page). The removal must
 * never partially revert: a deploy that brings back a turnstile check
 * while the frontend no longer sends a token would brick every login
 * (400 "Verification challenge is required") — a silent, catastrophic
 * regression.
 *
 * Asserts, against a real booted server with NO TURNSTILE_SECRET_KEY:
 *   - server boots fine without the secret (dev and production mode);
 *   - every unauthenticated endpoint that used to require a Turnstile
 *     token (customer register/login, tenant register/login, admin
 *     login, platform login) works with a plain email+password body;
 *   - the removal is verifiable in the code path: requiring the deleted
 *     middleware module must throw.
 *
 * Self-contained: boots its own server on an ephemeral port against the
 * in-memory mock DB (same pattern as unified-admin-login.js).
 *
 * Run directly: `node tests/turnstile-removal.js`
 */
const { bootServer } = require("./helpers/bootServer");
const path = require("path");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const mint = async (email, type) => {
    const res = await api("/__test__/mint-global-token", { method: "POST", body: { email, type } });
    return res.body?.token;
  };
  const api = (path, { method = "GET", company, outlet, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (company) headers["X-Company-Slug"] = company;
    if (outlet) headers["X-Outlet-Slug"] = outlet;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    // --- 1. The middleware module is gone from the codebase. -------------
    //     A require() of the deleted file must throw — if anyone reinstalls
    //     the middleware, this check fails and the deploy does too.
    let threw = false;
    try { require("../middleware/turnstileMiddleware"); }
    catch (_e) { threw = true; }
    check("deleted turnstileMiddleware module cannot be required anymore", threw);

    // --- 2. Production-mode boot without the secret succeeds. ----------
    //     Previously, a production boot with TURNSTILE_SECRET_KEY unset
    //     called process.exit(1) — one missing env var killed the whole
    //     API. Booting with NODE_ENV=production and no secret must not
    //     bail out (bootServer above already did this in its default mode;
    //     this asserts the production env var combination explicitly).
    let prodBooted = null;
    try {
      const prod = await bootServer({
        port: 0,
        env: {
          NODE_ENV: "production",
          JWT_SECRET: "test_only_insecure_jwt_secret",
          MONGODB_URI: "mongodb://in-memory-fallback",
          JWT_GLOBAL_SECRET: "test_only_insecure_global_jwt_secret",
        },
        requireBeforeServer: "./mockMongooseBootstrap.js",
      });
      prodBooted = prod;
      check("server boots in production mode with NO TURNSTILE_SECRET_KEY", true);
    } catch (err) {
      check("server boots in production mode with NO TURNSTILE_SECRET_KEY", false, String(err.message).slice(0, 200));
    } finally {
      if (prodBooted) await prodBooted.stop();
    }

    // --- 3. Old unauthenticated endpoints accept token-free bodies. ----
    //     Customer global auth.
    const runSuffix = Date.now();
    const email = `turnstile.removal.${runSuffix}@example.com`;
    const registered = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Turnstile Removal Test", email, password: "password123", phone: "+9779811000000" },
    });
    check("POST /api/customer-auth/register WITHOUT turnstileToken -> 201", registered.status === 201, registered.body);
    // The global login requires the new account to be email-verified — the
    // same rule the real UI enforces. Mint the verification token from the
    // test-only hook (no real email needed) and verify before logging in.
    const verifyToken = await mint(email, "email_verify");
    const verified = await api(`/api/customer-auth/verify-email?token=${encodeURIComponent(verifyToken || "")}`);
    check("post-register email verification -> 200", verified.status === 200, verified.body);
    const cust = await api("/api/customer-auth/login", {
      method: "POST",
      body: { email, password: "password123" },
    });
    check("POST /api/customer-auth/login WITHOUT turnstileToken -> 200", cust.status === 200, cust.body);
    check("...customer login issues a token", Boolean(cust.body?.token), cust.body);

    //     Tenant-scoped auth (legacy surfaces, still exercised by QR links).
    const tEmail = `tenant.rm.${runSuffix}@example.com`;
    const tenantReg = await api("/api/auth/register", {
      method: "POST",
      company: "coffesarowar",
      outlet: "durbarmarg",
      body: { name: "Turnstile Removal Tenant Test", email: tEmail, password: "password123", phone: "+9779811000001" },
    });
    check("POST /api/auth/register WITHOUT turnstileToken -> 201", tenantReg.status === 201, tenantReg.body);
    const tenantLogin = await api("/api/auth/login", {
      method: "POST",
      company: "coffesarowar",
      outlet: "durbarmarg",
      body: { email: tEmail, password: "password123" },
    });
    check("POST /api/auth/login WITHOUT turnstileToken -> 200", tenantLogin.status === 200, tenantLogin.body);
    check("...tenant login issues a token", Boolean(tenantLogin.body?.token), tenantLogin.body);

    //     Admin login (company owner).
    const admin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "owner@coffesarowar.com", password: "password" },
    });
    check("POST /api/admin-auth/login WITHOUT turnstileToken -> 200", admin.status === 200, admin.body);
    check("...admin login returns company_owner", admin.body?.kind === "company_owner", admin.body);

    //     Platform login.
    const platform = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    check("POST /api/platform/login WITHOUT turnstileToken -> 200", platform.status === 200, platform.body);
    check("...platform login issues a token", Boolean(platform.body?.token), platform.body);

    // --- 4. Wrong credentials still fail normally (no security drift). --
    const bad = await api("/api/customer-auth/login", {
      method: "POST",
      body: { email, password: "wrongpassword" },
    });
    check("wrong customer password -> non-200", bad.status !== 200, bad.body);
  } finally {
    if (stop) await stop();
  }

  console.log(`\nturnstile-removal: ${failures === 0 ? "all PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

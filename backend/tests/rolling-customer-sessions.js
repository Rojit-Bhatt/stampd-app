/**
 * Rolling customer sessions + sign-out-everywhere suite.
 *
 * Customers used to be logged out 14 days after SIGNING IN, however often
 * they used the app. Now:
 *
 *   - the global session lives 90 days and is re-issued (X-Session-Token
 *     response header) once it is more than a day old, so an active
 *     customer is never asked to sign in again;
 *   - the re-issued token keeps the ORIGINAL sign-in time (`at`), and a
 *     session older than 365 days since sign-in is refused regardless —
 *     rolling renewal never makes a stolen token immortal;
 *   - POST /api/customer-auth/sign-out-everywhere kills every global
 *     session AND every outlet (tenant) JWT for the account — the server-
 *     side revocation a plain logout (which only clears the device) lacks,
 *     and the only one a Google-only account (no password to change) has;
 *   - a password change now kills outlet JWTs too (they carry the
 *     membership row's version, which a password change never bumped).
 *
 * Run directly: `node tests/rolling-customer-sessions.js`
 */

const jwt = require("jsonwebtoken");
const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";
const GLOBAL_SECRET = "rolling-sessions-test-global-secret";
const DAY = 24 * 60 * 60;

async function main() {
  const { baseUrl, stop } = await bootServer({
    port: 0,
    env: { JWT_SECRET: "rolling-sessions-test-secret", JWT_GLOBAL_SECRET: GLOBAL_SECRET, GLOBAL_SESSION_EXPIRES_IN: "" },
  });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, slug = null, body, origin } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));
  };
  const decode = (t) => jwt.decode(t) || {};

  try {
    const email = `rolling-${Date.now()}@test.co`;
    const password = "password123";
    await api("/api/customer-auth/register", {
      method: "POST", body: { name: "Rolling", email, password, phone: "9800006666" },
    });
    const login = await api("/api/customer-auth/login", { method: "POST", body: { email, password } });
    const token = login.body?.token;
    const claims = decode(token);
    check("login issues a global session", Boolean(token), login.body);
    check("global session lives 90 days", claims.exp - claims.iat === 90 * DAY, { lifetime: claims.exp - claims.iat });
    check("global session records the sign-in time", typeof claims.at === "number" && Math.abs(claims.at - claims.iat) <= 1, claims);

    // A fresh session is not re-issued on every request.
    const fresh = await api("/api/customer-auth/me", { token });
    check("fresh session: no X-Session-Token", fresh.status === 200 && !fresh.headers.get("x-session-token"));

    // A session issued 3 days ago is renewed, keeping the original sign-in.
    const now = Math.floor(Date.now() / 1000);
    const aged = jwt.sign(
      { type: "global_customer", customerAccountId: claims.customerAccountId, pv: claims.pv, at: now - 40 * DAY, iat: now - 3 * DAY },
      GLOBAL_SECRET,
      { expiresIn: 87 * DAY }
    );
    const renewed = await api("/api/customer-auth/me", { token: aged, origin: "http://localhost:3000" });
    const next = renewed.headers.get("x-session-token");
    const nextClaims = decode(next);
    check("day-old session: request still succeeds", renewed.status === 200, renewed.body);
    check("day-old session: X-Session-Token issued", Boolean(next));
    check("renewed token runs a fresh 90 days", nextClaims.exp - nextClaims.iat === 90 * DAY && nextClaims.iat >= now - 5, nextClaims);
    check("renewed token keeps the original sign-in time", nextClaims.at === now - 40 * DAY, nextClaims);
    check(
      "CORS exposes X-Session-Token to the cross-origin app",
      (renewed.headers.get("access-control-expose-headers") || "").toLowerCase().includes("x-session-token"),
      renewed.headers.get("access-control-expose-headers")
    );
    check("renewed token is accepted", (await api("/api/customer-auth/me", { token: next })).status === 200);

    // Absolute cap: signed in > 365 days ago is refused, even if unexpired.
    const ancient = jwt.sign(
      { type: "global_customer", customerAccountId: claims.customerAccountId, pv: claims.pv, at: now - 366 * DAY, iat: now - 2 * DAY },
      GLOBAL_SECRET,
      { expiresIn: 30 * DAY }
    );
    const capped = await api("/api/customer-auth/me", { token: ancient });
    check("session older than 365 days since sign-in -> 401", capped.status === 401, capped.body);

    // --- Sign out everywhere. ---
    const second = (await api("/api/customer-auth/login", { method: "POST", body: { email, password } })).body?.token;
    const tenant = (await api("/api/customer-auth/enter-tenant", { method: "POST", token: second, slug: SLUG, body: {} })).body?.token;
    check("outlet JWT works before sign-out", (await api("/api/points/balance", { token: tenant })).status === 200);

    const out = await api("/api/customer-auth/sign-out-everywhere", { method: "POST", token: second, body: {} });
    check("sign-out-everywhere -> 200", out.status === 200, out.body);
    check("first device's session is dead", (await api("/api/customer-auth/me", { token })).status === 401);
    check("calling device's session is dead", (await api("/api/customer-auth/me", { token: second })).status === 401);
    check("renewed session is dead", (await api("/api/customer-auth/me", { token: next })).status === 401);
    check("outlet JWT is dead", (await api("/api/points/balance", { token: tenant })).status === 401);
    const again = await api("/api/customer-auth/login", { method: "POST", body: { email, password } });
    check("signing in again still works", again.status === 200 && Boolean(again.body?.token));
    check(
      "sign-out-everywhere requires a session",
      (await api("/api/customer-auth/sign-out-everywhere", { method: "POST", body: {} })).status === 401
    );

    // --- Password change kills outlet JWTs too. ---
    const g3 = again.body.token;
    const t3 = (await api("/api/customer-auth/enter-tenant", { method: "POST", token: g3, slug: SLUG, body: {} })).body?.token;
    check("outlet JWT works before password change", (await api("/api/points/balance", { token: t3 })).status === 200);
    const changed = await api("/api/customer-auth/change-password", {
      method: "POST", token: g3, body: { currentPassword: password, newPassword: "password456" },
    });
    check("password change -> 200", changed.status === 200, changed.body);
    check("outlet JWT is dead after a password change", (await api("/api/points/balance", { token: t3 })).status === 401);
  } catch (err) {
    console.error("Suite crashed:", err);
    failures++;
  } finally {
    await stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll rolling-session checks passed.");
}

main();

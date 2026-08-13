/**
 * session-versioning.js — Task 4: session versioning for instant revocation
 *
 * A token is minted with the account's sessionVersion. A password change
 * bumps the version on the account row, so every previously-issued token is
 * rejected 401 ("Session expired") on the very next request — no token list,
 * no refresh dance. Fresh login works because the next mint carries the
 * new version. Also asserted directly: verifyAuthToken(token, row) rejects
 * a stale version with the exact error string.
 *
 * Run directly: `node tests/session-versioning.js`
 */
const { bootServer } = require("./helpers/bootServer");

// Ephemeral port — fixed ports collide with TIME_WAIT leftovers from
// earlier suite runs (undici then surfaces "fetch failed / bad port").
const PORT = 5200 + (Date.now() % 1200);
const {
  generateGlobalSessionToken,
  verifyGlobalSessionToken
} = require("../utils/tokenUtils");
const jwt = require("jsonwebtoken");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: PORT });

  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };

  const api = (path, { method = "GET", body, headers = {} } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  const as = (token) => ({ Authorization: `Bearer ${token}` });

  try {
    // --- register (global flow returns a fresh global session token) ---
    const email = `sessver_${Date.now()}@test.co`;
    const reg = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Session Version Tester", email, password: "password123", phone: "+9779811110001" }
    });
    check("registration succeeds and mints a global session token", reg.status === 201 && !!reg.body.token);
    const globalToken = reg.body.token;

    // Sanity: the token can reach a verifyGlobalSession-gated route
    const meBefore = await api("/api/customer-auth/me", { headers: as(globalToken) });
    check("original token passes the global-session gate", meBefore.status === 200);

    // --- change the password (global flow) ---
    const changed = await api("/api/customer-auth/change-password", {
      method: "POST",
      headers: as(globalToken),
      body: { currentPassword: "password123", newPassword: "password456" }
    });
    check("password change succeeds", changed.body.success === true);

    // --- the ORIGINAL token must now be dead ---
    const afterChange = await api("/api/customer-auth/me", { headers: as(globalToken) });
    check("the original token is rejected 401 after a password change", afterChange.status === 401);

    // --- fresh login works and re-signs the new sessionVersion ---
    const fresh = await api("/api/customer-auth/login", {
      method: "POST",
      body: { email, password: "password456" }
    });
    check("a fresh login after the password change succeeds", fresh.body.success === true);
    if (fresh.body.token) {
      const freshGate = await api("/api/customer-auth/me", { headers: as(fresh.body.token) });
      check("the freshly-minted token passes the global-session gate", freshGate.status === 200);
    }

    // --- direct unit-level assertion on the verifier ---
    const rowAt1 = { sessionVersion: 1 };
    const staleToken = generateGlobalSessionToken({ customerAccountId: "deadbeefdeadbeefdeadbeef" });
    try {
      verifyGlobalSessionToken(staleToken, rowAt1);
      check("token minted at version 0 is rejected against a row at version 1", false);
    } catch (err) {
      check("token minted at version 0 is rejected against a row at version 1 with 'Session expired' 401",
        err.message === "Session expired" && err.statusCode === 401);
    }
    // null row skips the check (crypto validity only)
    const direct = verifyGlobalSessionToken(staleToken, null);
    check("verifyGlobalSessionToken with null row skips the revocation check",
      direct.customerAccountId === "deadbeefdeadbeefdeadbeef");

    // --- backward compatibility: pre-version tokens (no sessionVersion claim) ---
    const legacy = jwt.sign(
      { type: "global_customer", customerAccountId: "deadbeefdeadbeefdeadbeef" },
      process.env.JWT_GLOBAL_SECRET || "dev_only_insecure_global_jwt_secret_change_me",
      { expiresIn: "30d" }
    );
    const rowAt0 = { sessionVersion: 0 };
    const compat = verifyGlobalSessionToken(legacy, rowAt0);
    check("a token without a sessionVersion claim matches a row at version 0 (both treated as 0)",
      compat.customerAccountId === "deadbeefdeadbeefdeadbeef");
  } finally {
    stop();
  }

  console.log(`\nsession-versioning: ${failures === 0 ? "all PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

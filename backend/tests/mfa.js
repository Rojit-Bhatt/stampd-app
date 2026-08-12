/**
 * MFA (TOTP) suite. Self-contained: boots its own server on a dedicated
 * port against the in-memory mock DB, with ENABLE_MFA=true.
 *
 * Covers, for a customer account:
 *   - setup hands back a scannable otpauth URI + a one-time manual secret
 *   - enable self-verifies the secret (can't arm MFA with a secret you
 *     can't generate codes for) — no re-entry needed, setup's URI proves it
 *   - status reflects armed/disarmed correctly
 *   - login with MFA armed returns needsMfa (no session!), a valid code
 *     completes it into a real session, wrong/expired tokens are refused
 *   - disable requires password + current code; a code after disable fails
 *
 * Run directly: `node tests/mfa.js` (ENABLE_MFA=true is set for this suite)
 */
const { bootServer } = require("./helpers/bootServer");
const otpauth = require("otpauth");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0, env: { ENABLE_MFA: "true" } });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  // Tenant headers: tenant JWTs are scoped to the resolved org, so any
  // tenant endpoint wants the outlet's X-Company-Slug/X-Outlet-Slug.
  const api = (path, { method = "GET", token, body, tenant = false } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenant) {
      headers["X-Company-Slug"] = "coffesarowar";
      headers["X-Outlet-Slug"] = "durbarmarg";
    }
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: method !== "GET" && body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const email = `mfa_${Date.now()}@test.co`;

    console.log("\n== register + baseline status ==");
    const reg = await api("/api/customer-auth/register", {
      method: "POST", body: { name: "MFA Tester", email, password: "password", phone: "+9779800001111" },
    });
    check("register succeeds", reg.status === 201, reg.body);
    const globalToken = reg.body.token;

    // MFA off by default for a fresh account.
    const statusOff = await api("/api/customer-auth/mfa/status", { token: globalToken });
    check("mfa status before setup: 200", statusOff.status === 200, statusOff.body);
    check("mfa disabled initially", statusOff.body?.requiresMfa === false, statusOff.body);

    console.log("\n== setup + enable ==");
    const setup = await api("/api/customer-auth/mfa/setup", { method: "POST", token: globalToken });
    check("setup 200", setup.status === 200, setup.body);
    const { otpauthUri, manualSecret } = setup.body || {};
    check("setup returns an otpauth:// URI", otpauthUri && otpauthUri.startsWith("otpauth://totp/"), { uri: otpauthUri });
    check("setup returns a manual secret once", manualSecret && manualSecret.length >= 16, { len: manualSecret?.length });

    // Enable self-verifies: the URI setup returned is forwarded back, the
    // server re-derives the secret and generates the code itself. The
    // manual secret is returned so an authenticator without a camera can
    // enroll — but nothing about enrollment state is round-tripped.
    const enable = await api("/api/customer-auth/mfa/enable", {
      method: "POST", token: globalToken, body: { otpauthUri },
    });
    check("enable 200 (secret self-verified)", enable.status === 200, enable.body);

    const statusOn = await api("/api/customer-auth/mfa/status", { token: globalToken });
    check("mfa status after enable: armed", statusOn.body?.requiresMfa === true, statusOn.body);

    console.log("\n== login: needsMfa handshake ==");
    const login = await api("/api/customer-auth/login", {
      method: "POST", body: { email, password: "password" },
    });
    check("login returns needsMfa instead of a session", login.body?.needsMfa === true, login.body);
    const challengeToken = login.body?.challengeToken;
    check("a challenge token was issued", typeof challengeToken === "string" && challengeToken.split(".").length === 3, { ct: challengeToken });

    // The challenge token must NOT work as a session token.
    const balanceWithChallenge = await api("/api/points/balance", { token: challengeToken });
    check("challenge token refused as a session (401)", balanceWithChallenge.status === 401);

    // The server never exposes the encrypted secret, so the only way this
    // test can mint codes is the plain base32 manualSecret it got at
    // setup() — exactly what an authenticator app would use.
    // otpauth v9: `new Secret({ base32: str })` double-encodes (treats the
    // string as raw bytes) — the v9 API for rebuilding a Secret from its
    // base32 form is Secret.fromBase32(str).
    const secret = otpauth.Secret.fromBase32(manualSecret.replace(/ /g, ""));
    const totp = new otpauth.TOTP({ issuer: "Stampd", label: email, algorithm: "SHA1", digits: 6, period: 30, secret });
    const code = totp.generate();

    const mfa = await api("/api/customer-auth/login/mfa", {
      method: "POST", body: { challengeToken, code },
    });
    check("completeMfaLogin 200", mfa.status === 200, mfa.body);
    const sessionToken = mfa.body?.token;
    check("completion issues a real session", typeof sessionToken === "string" && sessionToken.split(".").length === 3, { t: sessionToken });

    // Balance is a tenant endpoint (verifyToken — tenant JWT), so exchange
    // the global session for a tenant JWT at the test outlet first, exactly
    // like the claim-hijack suite does.
    const enter = await api("/api/customer-auth/enter-tenant", { method: "POST", token: sessionToken, tenant: true });
    const tenantToken = enter.body?.token;
    check("enter-tenant issued a tenant JWT", typeof tenantToken === "string" && tenantToken.split(".").length === 3, enter.body);
    const balance = await api("/api/points/balance", { token: tenantToken, tenant: true });
    check("session token works (balance 200)", balance.status === 200, balance.body);

    console.log("\n== attack surface: wrong/expired/stale challenge ==");
    const wrongCode = code === "000001" ? "000002" : String(Number(code) + 1).padStart(6, "0");
    const badMfa = await api("/api/customer-auth/login/mfa", {
      method: "POST", body: { challengeToken, code: wrongCode },
    });
    check("wrong TOTP code refused", badMfa.status === 400, badMfa.body);

    const garbage = await api("/api/customer-auth/login/mfa", {
      method: "POST", body: { challengeToken: "not.a.jwt", code },
    });
    check("garbage challenge token refused", garbage.status === 400, garbage.body);

    console.log("\n== disable ==");
    const disable = await api("/api/customer-auth/mfa/disable", {
      method: "POST", token: sessionToken, body: { code, password: "password" },
    });
    check("disable 200 with code + password", disable.status === 200, disable.body);

    const statusOff2 = await api("/api/customer-auth/mfa/status", { token: globalToken });
    check("mfa disarmed after disable", statusOff2.body?.requiresMfa === false, statusOff2.body);

    // A code generated for the now-deleted secret must not work anymore.
    const staleCode = totp.generate();
    const mfaAfterDisable = await api("/api/customer-auth/login/mfa", {
      method: "POST", body: { challengeToken, code: staleCode },
    });
    check("code from removed secret refused after disable", mfaAfterDisable.status === 400, mfaAfterDisable.body);

    // Login is back to a single step once disarmed.
    const login2 = await api("/api/customer-auth/login", {
      method: "POST", body: { email, password: "password" },
    });
    check("login after disable issues a session directly (no needsMfa)", login2.body?.token !== undefined && login2.body?.needsMfa !== true, login2.body);

    console.log("\n== enable requires an actual setup URI ==");
    const enableGarbage = await api("/api/customer-auth/mfa/enable", {
      method: "POST", token: globalToken, body: { otpauthUri: "not-an-uri-at-all" },
    });
    check("enable with a garbage URI refused", enableGarbage.status === 400, enableGarbage.body);

    const statusFinal = await api("/api/customer-auth/mfa/status", { token: globalToken });
    check("still disarmed after failed enable", statusFinal.body?.requiresMfa === false, statusFinal.body);

    if (failures === 0) console.log("\nmfa: all PASS");
    else { console.error(`\nmfa: ${failures} FAILED`); process.exitCode = 1; }
  } finally {
    stop();
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });

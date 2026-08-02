/**
 * OTP-based email verification for AdminAccount and CustomerAccount.
 *
 * The email-link path (VerificationToken records looked up by tokenHash)
 * stays untouched and is not re-tested here — this suite covers only what's
 * new: the `code`/`attempts` fields, the two verify-otp endpoints, the
 * brute-force lock, and admin login's new NEEDS_VERIFICATION code.
 *
 * Run directly: `node tests/auth-otp.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5047 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra ?? ""); failures++; }
  };
  const api = (path, { method = "GET", body, token } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const getCode = async (email, kind) => {
    const res = await api("/__test__/get-otp-code", { method: "POST", body: { email, kind } });
    return res.body;
  };

  try {
    const stamp = Date.now();

    // === Admin side ============================================
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;

    const companySlug = `otp-co-${stamp}`;
    const ownerEmail = `owner-otp-${stamp}@test.com`;
    const registered = await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: {
        name: "OTP Test Co", slug: companySlug,
        ownerName: "Otp Owner", ownerEmail, ownerPassword: "password123",
      },
    });
    check("registered a fresh company -> 201", registered.status === 201);

    const firstCode = await getCode(ownerEmail, "admin");
    check("fresh admin account has a 6-digit code", /^\d{6}$/.test(firstCode?.code || ""));
    check("fresh admin account has zero attempts", firstCode?.attempts === 0);

    // Unverified admin login -> NEEDS_VERIFICATION, not the old code.
    const unverifiedLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: ownerEmail, password: "password123" },
    });
    check("unverified admin login -> 403", unverifiedLogin.status === 403);
    check("...with NEEDS_VERIFICATION", unverifiedLogin.body?.code === "NEEDS_VERIFICATION");

    // That login attempt must have minted a FRESH code, invalidating the one
    // captured above.
    const codeAfterLoginAttempt = await getCode(ownerEmail, "admin");
    check(
      "login attempt on unverified account issues a fresh code",
      codeAfterLoginAttempt?.code !== firstCode?.code
    );

    // Wrong code increments attempts without verifying.
    const wrong1 = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail, code: "000000" },
    });
    check("wrong admin code -> 400", wrong1.status === 400);
    check("...with OTP_INCORRECT", wrong1.body?.code === "OTP_INCORRECT");

    // Five wrong guesses burns the code. The "wrong admin code -> 400" check
    // above already spent attempt #1 against this same record, so three
    // more loop iterations (attempts #2-4) plus one final request
    // (attempt #5) reaches the lock exactly on that final request.
    for (let i = 0; i < 3; i++) {
      await api("/api/admin-auth/verify-otp", { method: "POST", body: { email: ownerEmail, code: "111111" } });
    }
    const locked = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail, code: "222222" },
    });
    check("5th wrong admin code -> 429 OTP_LOCKED", locked.status === 429 && locked.body?.code === "OTP_LOCKED");

    // Even the real code (captured earlier, before any burning) no longer
    // verifies once the record is locked — get-otp-code itself now 404s
    // for this account since it only ever exposes a live (usedAt: null)
    // record, so the pre-captured value is the only way to test this.
    const tryRealAfterLock = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail, code: codeAfterLoginAttempt.code },
    });
    check(
      "correct code rejected once burned by lockout",
      tryRealAfterLock.status === 400 && tryRealAfterLock.body?.code === "OTP_EXPIRED"
    );

    // A fresh admin (new email) verifies correctly with the real code.
    const ownerEmail2 = `owner-otp2-${stamp}@test.com`;
    await api("/api/platform/companies", {
      method: "POST",
      token: platformToken,
      body: {
        name: "OTP Test Co 2", slug: `otp-co2-${stamp}`,
        ownerName: "Otp Owner 2", ownerEmail: ownerEmail2, ownerPassword: "password123",
      },
    });
    const realCode = await getCode(ownerEmail2, "admin");
    const verified = await api("/api/admin-auth/verify-otp", {
      method: "POST", body: { email: ownerEmail2, code: realCode.code },
    });
    check("correct admin code -> 200", verified.status === 200);

    const loginNow = await api("/api/admin-auth/login", {
      method: "POST", body: { email: ownerEmail2, password: "password123" },
    });
    check("verified admin can now log in", loginNow.status === 200);

    // === Customer side ==========================================
    const custEmail = `cust-otp-${stamp}@test.com`;
    const custRegister = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Otp Customer", email: custEmail, password: "password123", phone: "9800000000" },
    });
    check("customer register -> 201", custRegister.status === 201);
    check("fresh customer account is unverified", custRegister.body?.account?.emailVerified === false);

    // Confirms the "keep deferred" decision: an unverified customer can
    // still log in exactly like a verified one, unlike admin.
    const custLogin = await api("/api/customer-auth/login", {
      method: "POST", body: { email: custEmail, password: "password123" },
    });
    check("unverified customer login still succeeds -> 200", custLogin.status === 200);

    const custCode = await getCode(custEmail, "customer");
    check("fresh customer account has a 6-digit code", /^\d{6}$/.test(custCode?.code || ""));

    const custWrong = await api("/api/customer-auth/verify-otp", {
      method: "POST", body: { email: custEmail, code: "999999" },
    });
    check("wrong customer code -> 400 OTP_INCORRECT", custWrong.status === 400 && custWrong.body?.code === "OTP_INCORRECT");

    const custVerified = await api("/api/customer-auth/verify-otp", {
      method: "POST", body: { email: custEmail, code: custCode.code },
    });
    check("correct customer code -> 200", custVerified.status === 200);
    check("response carries fulfilled (even if empty)", "fulfilled" in (custVerified.body || {}));

    // Old-style link path still works on a record that also carries a code —
    // proves the two paths coexist without interfering. Uses the existing
    // mint-global-token hook (raw tokenHash), against a THIRD fresh account.
    const custEmail3 = `cust-otp3-${stamp}@test.com`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Otp Customer 3", email: custEmail3, password: "password123", phone: "9800000001" },
    });
    const minted = await api("/__test__/mint-global-token", {
      method: "POST", body: { email: custEmail3, type: "email_verify" },
    });
    check("minted a link token for an account that also has a code", minted.status === 200);
    const linkVerify = await api(`/api/customer-auth/verify-email?token=${minted.body.token}`, { method: "GET" });
    check("old-style link verify still works", linkVerify.status === 200);

    if (failures === 0) console.log("\nAll auth-otp checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

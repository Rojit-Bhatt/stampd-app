/**
 * Auth email-verification + password-reset flow suite (Epic A).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Drives the HTTP endpoints end-to-end, using the dev-only
 * /__test__/mint-token hook to obtain raw verification/reset tokens (the real
 * flow delivers them by email, which a test cannot read).
 *
 * Run directly: `node tests/auth-email-flow.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";
const H = { "Content-Type": "application/json", "X-Tenant-Slug": SLUG };

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5013 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const post = (path, body, headers = H) =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const mint = async (email, type) => {
    const res = await post("/__test__/mint-token", { email, type });
    const body = await res.json();
    return body.token;
  };

  try {
    // 1. Register requires phone
    const noPhone = await post("/api/auth/register", { name: "N", email: `np_${Date.now()}@t.co`, password: "password" });
    check("register without phone -> 400", noPhone.status === 400);

    // 2. Register succeeds, login shows unverified
    const email = `v_${Date.now()}@t.co`;
    const reg = await post("/api/auth/register", { name: "V", email, password: "password", phone: "+9779812345678" });
    check("register -> 201", reg.status === 201);
    const login1 = await (await post("/api/auth/login", { email, password: "password" })).json();
    check("login emailVerified false", login1.user && login1.user.emailVerified === false);

    // 3. Unverified customer cannot claim a stamp
    const genAdmin = await (await post("/api/auth/login", { email: "barista@mansarowar.cafe", password: "password" })).json();
    const gen = await fetch(`${baseUrl}/api/admin/generate-qr`, {
      method: "POST", headers: { ...H, Authorization: `Bearer ${genAdmin.token}` }
    });
    const genBody = await gen.json();
    const claimUnverified = await fetch(`${baseUrl}/api/stamps/claim`, {
      method: "POST", headers: { ...H, Authorization: `Bearer ${login1.token}` },
      body: JSON.stringify({ token: genBody.data.token })
    });
    check("unverified claim -> 403", claimUnverified.status === 403);

    // 4. Verify email via a minted token, then login shows verified
    const rawToken = await mint(email, "email_verify");
    const verify = await fetch(`${baseUrl}/api/auth/verify-email?token=${rawToken}`, { headers: H });
    check("verify-email -> 200", verify.status === 200);
    const login2 = await (await post("/api/auth/login", { email, password: "password" })).json();
    check("login emailVerified true after verify", login2.user.emailVerified === true);

    // 5. Used token rejected on reuse
    const verifyReuse = await fetch(`${baseUrl}/api/auth/verify-email?token=${rawToken}`, { headers: H });
    check("used token rejected on reuse", verifyReuse.status === 400);

    // 6. Forgot + reset password
    await post("/api/auth/forgot-password", { email });
    const rawReset = await mint(email, "password_reset");
    const reset = await post("/api/auth/reset-password", { token: rawReset, password: "newpass123" });
    check("reset-password -> 200", reset.status === 200);
    const loginOld = await post("/api/auth/login", { email, password: "password" });
    check("old password rejected", loginOld.status === 401);
    const loginNew = await post("/api/auth/login", { email, password: "newpass123" });
    check("new password accepted", loginNew.status === 200);
  } finally {
    stop();
  }

  if (failures) { console.error(`auth-email-flow: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("auth-email-flow: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

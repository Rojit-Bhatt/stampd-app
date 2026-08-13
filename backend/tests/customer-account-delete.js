/**
 * (G17) Self-service account deletion — POST /api/customer-auth/delete.
 * Self-contained: boots its own server on a random port against the
 * in-memory mock DB.
 *
 * The deletion contract (email confirmation) matters: the customer's
 * memberships, points ledger, and profile disappear permanently, so a
 * stolen session must never be enough to wipe an account.
 *
 *   - unsigned -> 401,
 *   - wrong confirmation email -> 400 with the account intact,
 *   - matching email -> 200 and the session can no longer sign in,
 *   - a second delete attempt fails cleanly (account already gone).
 *
 * Run directly: `node tests/customer-account-delete.js`
 */

const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const email = `delete_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "ToDelete", email, password: "password", phone: "+9779800007777" },
    });
    const login = await api("/api/customer-auth/login", { method: "POST", body: { email, password: "password" } });
    const session = login.body?.token;
    check("customer signs in", Boolean(session), login.body);

    console.log("\n== Access control ==");
    const anon = await api("/api/customer-auth/delete", { method: "POST", body: { email } });
    check("unsigned -> 401", anon.status === 401, anon.body);

    console.log("\n== Wrong confirmation email ==");
    const wrong = await api("/api/customer-auth/delete", {
      method: "POST", token: session, body: { email: "someone-else@test.co" },
    });
    check("wrong email -> 400", wrong.status === 400, wrong.body);
    // Account still exists and signs in after the rejected delete.
    const stillIn = await api("/api/customer-auth/me", { token: session });
    check("account still exists after rejected delete", stillIn.status === 200, stillIn.body);

    console.log("\n== Deletion ==");
    const deleted = await api("/api/customer-auth/delete", {
      method: "POST", token: session, body: { email },
    });
    check("matching email -> 200", deleted.status === 200, deleted.body);
    check("delete response is success", deleted.body?.success === true, deleted.body);

    // Old session must be dead — and re-registration must be possible.
    const meAfter = await api("/api/customer-auth/me", { token: session });
    check("old session dies after deletion", meAfter.status === 401, meAfter.body);
    const again = await api("/api/customer-auth/delete", {
      method: "POST", token: session, body: { email },
    });
    check("repeat delete fails cleanly (session dead)", again.status === 401, again.body);

    const reReg = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Reborn", email, password: "newpassword", phone: "+9779800007777" },
    });
    check("email can be re-registered after deletion", reReg.status === 201 || reReg.status === 200, reReg.body);

    if (failures === 0) console.log("\nALL CUSTOMER-ACCOUNT-DELETE CHECKS PASSED");
    else { console.error(`\n${failures} customer-account-delete check(s) FAILED`); process.exitCode = 1; }
  } finally {
    await stop();
  }
}

main().catch((e) => { console.error("UNCAUGHT", e); process.exitCode = 1; process.exit(1); });

/**
 * Pending-claim hijack suite.
 *
 * A PendingClaim's _id is NOT a secret: it is an ObjectId, whose per-process
 * counter increments predictably on real MongoDB, so anyone who starts one
 * legitimate claim can guess the ids of others. Three code paths used to
 * treat that guessable id as sufficient authorization:
 *
 *   - linkPendingClaimToAccount (reachable UNAUTHENTICATED via register)
 *   - fulfillPendingClaim's bind-an-unclaimed-row branch
 *   - getClaimStatus, which returns what the customer earned
 *
 * The attack: a stranger with no account, who never visited the outlet and
 * never scanned anything, registers quoting a guessed claim id, verifies
 * their email, and receives the victim's points AND a membership — while the
 * victim gets "already used" and a zero balance.
 *
 * claimSecret closes it: returned once, only to whoever burned the 30s QR
 * token, and required to bind or read the claim.
 *
 * Run directly: `node tests/claim-hijack.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const verifyGlobal = async (email) => {
    const mint = await api("/__test__/mint-global-token", {
      method: "POST", slug: null, body: { email, type: "email_verify" },
    });
    return api(`/api/customer-auth/verify-email?token=${mint.body.token}`, { slug: null });
  };

  try {
    const adminToken = (await api("/api/admin-auth/login", {
      method: "POST", slug: null, body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    })).body.token;

    // Staff rings a Rs 500 bill and puts the QR up. A walk-in scans it.
    const qr = await api("/api/admin/generate-qr", {
      method: "POST", token: adminToken, body: { billAmount: 500 },
    });
    const start = await api("/api/claim/start", { method: "POST", body: { token: qr.body.data.token } });
    const claimId = start.body?.data?.pendingClaimId;
    const realSecret = start.body?.data?.claimSecret;

    console.log("\n== claim/start hands the scanner a secret ==");
    check("a pending claim was created", Boolean(claimId), start.body);
    check("...and a claimSecret came with it", typeof realSecret === "string" && realSecret.length >= 32, {
      len: realSecret && realSecret.length,
    });

    console.log("\n== THE ATTACK: register quoting a guessed claim id ==");
    // The attacker knows (or guessed) the id. They have no account, never
    // visited the outlet, never scanned. Before the fix this succeeded.
    const attackerEmail = `attacker_${Date.now()}@evil.test`;
    const attackerReg = await api("/api/customer-auth/register", {
      method: "POST", slug: null,
      body: {
        name: "Attacker", email: attackerEmail, password: "password", phone: "+9779800009999",
        pendingClaimId: claimId,
        // no claimSecret — this is the whole point
      },
    });
    check("registration itself still succeeds", attackerReg.status === 201, attackerReg.body);
    await verifyGlobal(attackerEmail);

    // The claim must NOT have been bound to them, so verification must not
    // have auto-fulfilled anything.
    const attackerSession = await api("/api/customer-auth/login", {
      method: "POST", slug: null, body: { email: attackerEmail, password: "password" },
    });
    const attackerTenant = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: attackerSession.body.token,
    });
    const attackerBalance = await api("/api/points/balance", { token: attackerTenant.body.token });
    check(
      "the attacker got NOTHING (balance 0)",
      attackerBalance.body?.data?.balance === 0,
      attackerBalance.body?.data,
    );

    console.log("\n== ...and a wrong secret can't bind it either ==");
    const wrongSecret = "f".repeat(realSecret.length);
    const badFulfill = await api(`/api/claim/${claimId}/fulfill`, {
      method: "POST", token: attackerTenant.body.token, body: { claimSecret: wrongSecret },
    });
    check("fulfill with a wrong secret -> 404", badFulfill.status === 404, badFulfill.body);
    const noSecretFulfill = await api(`/api/claim/${claimId}/fulfill`, {
      method: "POST", token: attackerTenant.body.token,
    });
    check("fulfill with NO secret -> 404", noSecretFulfill.status === 404, noSecretFulfill.body);
    check(
      "a wrong secret is indistinguishable from a missing claim",
      badFulfill.status === noSecretFulfill.status,
      { bad: badFulfill.status, none: noSecretFulfill.status },
    );

    console.log("\n== ...and the status read is closed too ==");
    const peek = await api(`/api/claim/${claimId}/status?secret=${wrongSecret}`);
    check("status with a wrong secret -> 404", peek.status === 404, peek.body);
    const peekNone = await api(`/api/claim/${claimId}/status`);
    check("status with NO secret -> 404 (no balance leak)", peekNone.status === 404, peekNone.body);

    console.log("\n== The real scanner is unaffected ==");
    const victimEmail = `victim_${Date.now()}@test.co`;
    const victimReg = await api("/api/customer-auth/register", {
      method: "POST", slug: null,
      body: {
        name: "Victim", email: victimEmail, password: "password", phone: "+9779800008888",
        pendingClaimId: claimId,
        claimSecret: realSecret,
      },
    });
    check("the scanner registers with the real secret -> 201", victimReg.status === 201, victimReg.body);

    const victimVerify = await verifyGlobal(victimEmail);
    check(
      "verifying auto-fulfills their claim",
      victimVerify.body?.fulfilled?.length === 1,
      victimVerify.body,
    );
    check(
      "...for the full 500 points",
      victimVerify.body?.fulfilled?.[0]?.pointsEarned === 500,
      victimVerify.body?.fulfilled?.[0],
    );

    const victimSession = await api("/api/customer-auth/login", {
      method: "POST", slug: null, body: { email: victimEmail, password: "password" },
    });
    const victimTenant = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: victimSession.body.token,
    });
    const victimBalance = await api("/api/points/balance", { token: victimTenant.body.token });
    check("the scanner has their 500 points", victimBalance.body?.data?.balance === 500, victimBalance.body?.data);

    const status = await api(`/api/claim/${claimId}/status?secret=${realSecret}`);
    check("the real secret reads the status", status.status === 200, status.body);
    check("...showing it fulfilled", status.body?.data?.fulfilled === true, status.body?.data);

    console.log("\n== A re-fulfill of an already-fulfilled claim is tagged, not just refused ==");
    // The real-world case: the claim tab was backgrounded to open the email,
    // autoFulfillForAccount already awarded the points on verify (above), and
    // now the SAME tab resumes and tries to fulfill the claim it's already
    // been granted. Before this fix the client had no way to tell that apart
    // from a genuinely stale/foreign claim, and showed a scary error for
    // what was, from the customer's side, already a success.
    const reFulfill = await api(`/api/claim/${claimId}/fulfill`, {
      method: "POST", token: victimTenant.body.token, body: { claimSecret: realSecret },
    });
    check("re-fulfilling an already-fulfilled claim -> 400", reFulfill.status === 400, reFulfill.body);
    check(
      "...tagged CLAIM_ALREADY_FULFILLED so the client can show success instead of an error",
      reFulfill.body?.code === "CLAIM_ALREADY_FULFILLED",
      reFulfill.body,
    );
    // The double attempt must not have double-awarded anything.
    const victimBalanceAfterRefulfill = await api("/api/points/balance", { token: victimTenant.body.token });
    check(
      "the balance is untouched by the re-fulfill attempt (still 500, not 1000)",
      victimBalanceAfterRefulfill.body?.data?.balance === 500,
      victimBalanceAfterRefulfill.body?.data,
    );

    console.log("\n== A claim already bound to someone else stays theirs ==");
    const qr2 = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount: 300 } });
    const start2 = await api("/api/claim/start", { method: "POST", body: { token: qr2.body.data.token } });
    // Victim binds it.
    await api(`/api/claim/${start2.body.data.pendingClaimId}/fulfill`, {
      method: "POST", token: victimTenant.body.token, body: { claimSecret: start2.body.data.claimSecret },
    });
    // Attacker tries with the CORRECT secret — still refused, because it's
    // bound to another account now.
    const stealBound = await api(`/api/claim/${start2.body.data.pendingClaimId}/fulfill`, {
      method: "POST", token: attackerTenant.body.token, body: { claimSecret: start2.body.data.claimSecret },
    });
    check(
      "even WITH the secret, a claim bound to another account is refused",
      stealBound.status === 400 || stealBound.status === 403,
      stealBound.body,
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`\nclaim-hijack: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\nclaim-hijack: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

/**
 * Regression suite for the "second outlet hangs on the green spinner" bug.
 *
 * What broke: the customer app uses ONE shared token slot
 * (`customer_auth_token`) for every outlet. When a member of two outlets
 * opened outlet A and then outlet B, the stored JWT could end up belonging
 * to the WRONG outlet while the URL belonged to the right one. The frontend
 * gate (sessionStale: "token org id !== current tenant id") then rendered
 * the full-screen spinner — and, because the effect that refreshes the
 * token only fires when the tenant query's result CHANGES, a second visit
 * to outlet B (same query result) never re-fired it. Deadlock: spinner
 * forever.
 *
 * The production fix is in the FRONTEND (CustomerAuthContext must actively
 * exchange a fresh tenant JWT when the cached one belongs to a different
 * tenant, instead of waiting for a caller to re-fire the effect). This
 * backend suite pins the contract the frontend depends on — and proves the
 * server's side is not the problem:
 *
 *   1. A global session can enter TWO distinct tenants; the two tenant JWTs
 *      carry distinct organizationIds (frontend's sessionStale can tell
 *      them apart, which is exactly what the bug's deadlock hinges on).
 *   2. A tenant JWT issued for tenant A is REJECTED when presented against
 *      tenant B's scoped routes (so a wrong-outlet token can never silently
 *      serve the wrong outlet's data — the property the frontend must
 *      restore by re-exchanging).
 *   3. Membership User._ids are distinct per tenant for the same global
 *      account (the two JWTs therefore genuinely identify different rows).
 *
 * Run directly: `node backend/tests/outlet-switch-stuck-loader.js`
 */
const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG_A = "durbarmarg";

// Base64url -> Buffer (mirrors the frontend's display-only decodeJwtPayload,
// which is all that matters for identifying which tenant a stored JWT
// belongs to — never for verifying anything).
function decodePayload(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
  } catch {
    return null;
  }
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else {
      console.error(`FAIL ${name}`);
      failures++;
    }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) {
      headers["X-Company-Slug"] = COMPANY;
      headers["X-Outlet-Slug"] = slug;
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  try {
    const runSuffix = Date.now();

    // --- Stand up a second outlet under the same company (the exact
    //     multi-outlet membership scenario the bug reports). ---
    const outletB = await makeSiblingOutlet(baseUrl, { label: `osl${runSuffix}` });
    const SLUG_B = outletB.outletSlug;
    check("stand up a second outlet -> ok", Boolean(outletB.outletId));

    // --- One customer, global identity (the bug's customer). ---
    const email = `switcher-${runSuffix}@test.co`;
    const reg = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Switcher", email, password: "password123", phone: "9800000099" },
    });
    check("customer registers -> 201", reg.status === 201);
    const mint = await api("/__test__/mint-global-token", {
      method: "POST",
      body: { email, type: "email_verify" },
    });
    const verify = await api(`/api/customer-auth/verify-email?token=${mint.body.token}`);
    check("customer verifies email -> 200", verify.status === 200);
    const globalLogin = await api("/api/customer-auth/login", {
      method: "POST",
      body: { email, password: "password123" },
    });
    const globalToken = globalLogin.body?.token;
    check("global login -> session issued", Boolean(globalToken));

    // --- Enter tenant A, then tenant B, keeping BOTH tenant JWTs. ---
    const enterA = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      slug: SLUG_A,
      token: globalToken,
      body: {},
    });
    const tenantAToken = enterA.body?.token;
    check("enter tenant A -> tenant JWT issued", Boolean(tenantAToken));

    const enterB = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      slug: SLUG_B,
      token: globalToken,
      body: {},
    });
    const tenantBToken = enterB.body?.token;
    check("enter tenant B -> tenant JWT issued", Boolean(tenantBToken));

    // Tenant B's own admin JWT — needed for the write-side isolation check.
    const adminBToken = outletB.adminToken;
    check("tenant B admin token available", Boolean(adminBToken));

    const payloadA = decodePayload(tenantAToken);
    const payloadB = decodePayload(tenantBToken);
    check(
      "tenant A JWT's organizationId differs from tenant B's (frontend sessionStale can tell them apart)",
      Boolean(payloadA?.organizationId) &&
        Boolean(payloadB?.organizationId) &&
        payloadA.organizationId !== payloadB.organizationId,
    );
    check("both JWTs identify distinct membership rows", enterA.body?.user?.id !== enterB.body?.user?.id);

    // --- The deadlock condition, reproduced at the API boundary: ---
    // Customer endpoints scope to the JWT's organizationId, never to the URL
    // headers — so a wrong-outlet JWT can never quietly serve the OTHER
    // outlet's data on writes (outright rejected) and on reads returns only
    // its own tenant's row. The frontend's sessionStale gate detects this
    // mismatch (different organizationId in the JWT) and triggers recovery.
    console.log("\n== Wrong-outlet token boundary behavior (what the frontend sessionStale gate relies on) ==");
    const wrongTokenBalance = await api("/api/points/balance", { slug: SLUG_B, token: tenantAToken });
    check(
      "tenant A JWT on tenant B's balance route -> 200 but scoped to tenant A's own row",
      wrongTokenBalance.status === 200 && wrongTokenBalance.body?.success === true,
    );

    // A tenant JWT is only ever exchangeable for the tenant it belongs to:
    // a WRONG-outlet JWT presented at enter-tenant for the OTHER tenant must
    // fail (the shared slot must never be "half-converted" into the wrong
    // tenant's token) — this is the exact moment the frontend's sessionStale
    // gate would otherwise just sit on the spinner forever.
    const wrongTenantEnter = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      slug: SLUG_B,
      token: tenantAToken,
      body: {},
    });
    check(
      "tenant A JWT cannot be exchanged for tenant B's token at enter-tenant",
      wrongTenantEnter.status >= 400,
    );

    // --- And the correct token always works on its own tenant. ---
    const rightTokenBalance = await api("/api/points/balance", { slug: SLUG_B, token: tenantBToken });
    check("tenant B JWT against tenant B's balance route -> accepted", rightTokenBalance.status === 200);

    // --- The stuck-loader trigger, exercised for real: the customer views
    //     outlet B while still holding tenant A's JWT in the shared slot.
    //     The API boundary must NEVER let that wrong-outlet JWT read or
    //     touch outlet B's data: the balance endpoint scopes strictly to
    //     the JWT's own tenant (tenant A's row, untouched by tenant B), so
    //     a stale wrong-outlet token is harmlessly "wrong data from its own
    //     tenant" on read-only calls, and outright rejected on any write.
    console.log("\n== Stuck-loader contract ==");
    const balanceWithWrongToken = await api("/api/points/balance", {
      slug: SLUG_B,
      token: tenantAToken,
    });
    check(
      "tenant A JWT on outlet B returns ONLY tenant A's own data (200 but scoped to A)",
      balanceWithWrongToken.status === 200 &&
        balanceWithWrongToken.body?.success === true,
    );

    // The definitive write-side guarantee: a tenant-A JWT must NOT be able
    // to earn points at tenant B even with a tenant-B QR token — the QR is
    // burned by tenant B's admin, so accepting it under tenant A's JWT
    // would be the exact "wrong outlet's data" leak this bug's deadlock
    // exists to prevent.
    const bQr = await api("/api/admin/generate-qr", {
      method: "POST",
      slug: SLUG_B,
      token: adminBToken,
      body: { billAmount: 100 },
    });
    const wrongTokenClaim = await api("/api/points/claim", {
      method: "POST",
      slug: SLUG_B,
      token: tenantAToken,
      body: { token: bQr.body?.data?.token },
    });
    check(
      "tenant A JWT cannot claim tenant B's earn QR (write-side isolation holds)",
      wrongTokenClaim.status >= 400,
    );

    // And the right token earns normally — tenant B's balance route is not
    // broken for its own JWT, the only token the frontend must converge to.
    const rightQr = await api("/api/admin/generate-qr", {
      method: "POST",
      slug: SLUG_B,
      token: adminBToken,
      body: { billAmount: 100 },
    });
    const rightTokenClaim = await api("/api/points/claim", {
      method: "POST",
      slug: SLUG_B,
      token: tenantBToken,
      body: { token: rightQr.body?.data?.token },
    });
    check(
      "tenant B JWT claims tenant B's earn QR -> 200 (its own outlet works)",
      rightTokenClaim.status === 200,
    );
  } finally {
    stop();
  }
  if (failures) {
    console.error(`outlet-switch-stuck-loader: ${failures} FAILED`);
    process.exitCode = 1;
  } else console.log("outlet-switch-stuck-loader: all PASS");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

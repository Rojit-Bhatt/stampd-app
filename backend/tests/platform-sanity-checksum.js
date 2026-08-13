// Phase 2 (G11 — backups/DR): the platform sanity-checksum endpoint must be
// reachable for platform admins and unreachable for everyone else, and the
// digest shape must stay deterministic (same state → same sha256) so an
// operator's daily diff remains meaningful.
//
// The endpoint itself does NOT write anything. The demo seed (SEED_DEMO_DATA)
// creates the platform admin "admin@stampd.co"/"password" on every mock-DB
// boot, so the suite can log in directly with no extra hooks.
const { bootServer } = require("./helpers/bootServer");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  // tenant:true adds the outlet's company/outlet slugs — required by
  // resolveTenant for tenant-scoped routes (admin console, claim flow).
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
    console.log("\n== auth gating ==");
    const unauth = await api("/api/platform/sanity-checksum");
    check("unauthenticated request refused (401)", unauth.status === 401);

    // The demo seed's outlet admin must NOT reach platform admin routes —
    // the same boundary every other platform route enforces.
    const tenantAdmin = await api("/api/admin-auth/login", {
      method: "POST", body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    check("outlet admin logs in (setup for boundary check)", tenantAdmin.status === 200, tenantAdmin.body);
    const tenantToken = tenantAdmin.body?.token;
    const crossBoundary = await api("/api/platform/sanity-checksum", { token: tenantToken });
    check("tenant admin can't reach the platform checksum (403)", crossBoundary.status === 403, crossBoundary.body);

    console.log("\n== platform admin access ==");
    const login = await api("/api/platform/login", {
      method: "POST", body: { email: "admin@stampd.co", password: "password" },
    });
    check("platform admin logs in", login.status === 200, login.body);
    const platformToken = login.body?.token;

    const checksum = await api("/api/platform/sanity-checksum", { token: platformToken });
    check("platform admin reaches the checksum (200)", checksum.status === 200, checksum.body);
    const digest = checksum.body?.digest;

    console.log("\n== digest shape and determinism ==");
    check("digest carries counts and a totalPointsCenti", digest && typeof digest.totalPointsCenti === "string" && typeof digest.customers === "number" && typeof digest.transactions === "number", digest);
    check("sha256 is 64 hex chars", digest && /^[0-9a-f]{64}$/.test(digest.sha256), { sha: digest?.sha256 });

    const again = await api("/api/platform/sanity-checksum", { token: platformToken });
    check("same state → same digest (deterministic)", again.body?.digest?.sha256 === digest?.sha256);

    // A write to the business state must change the digest — otherwise the
    // checksum wouldn't detect corruption or data loss. Minting a QR alone
    // doesn't move points (nothing exists until scanned), so this churns a
    // real earn: scan the freshly-minted QR as the customer would.
    console.log("\n== digest changes with the data ==");
    const earn = await api("/api/admin/generate-qr", {
      method: "POST", token: tenantToken, tenant: true, body: { billAmount: "77" },
    });
    check("seed earn QR minted (setup for churn test)", earn.status === 201, earn.body);
    // The customer scan is the two-step claim flow: claim/start burns the
    // 30 s QR token and returns a claim id + claim secret, then fulfill with
    // the secret actually awards the points. Follow the same path the
    // customer app walks — no auth needed, the QR itself is the credential.
    const start = await api("/api/claim/start", { method: "POST", tenant: true, body: { token: earn.body?.data?.token } });
    check("claim/start burned the earn QR (200)", start.status === 200, start.body);
    // Fulfill needs an authenticated customer token in the tenant — create
    // a fresh customer exactly as the app would: register, verify, enter.
    const cEmail = `cchk_${Date.now()}@test.co`;
    const reg = await api("/api/customer-auth/register", {
      method: "POST", tenant: true, body: { name: "Checksum Customer", email: cEmail, phone: "+9779800000000", password: "password" },
    });
    check("customer registered (setup for fulfill)", reg.status === 201, reg.body);
    // The registration verification hook mints the customer's email-verify
    // code via the same DB path as a real code — no /__test__ shortcut
    // needed because the mock DB is shared in the child process.
    const mint = await api("/__test__/mint-global-token", {
      method: "POST", tenant: true, body: { email: cEmail, type: "email_verify" },
    });
    const verifyResp = await api(`/api/customer-auth/verify-email?token=${mint.body?.token}`, { tenant: true });
    check("email verified (setup for fulfill)", verifyResp.status === 200, verifyResp.body);
    const cLogin = await api("/api/customer-auth/login", {
      method: "POST", tenant: true, body: { email: cEmail, password: "password" },
    });
    check("customer logged in (setup for fulfill)", cLogin.status === 200, cLogin.body);
    const enter = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: cLogin.body?.token, tenant: true,
    });
    check("customer entered the tenant (setup for fulfill)", enter.status === 200, enter.body);
    const customerToken = enter.body?.token;
    const fulfill = await api(`/api/claim/${start.body?.data?.pendingClaimId}/fulfill`, {
      method: "POST", token: customerToken, tenant: true, body: { claimSecret: start.body?.data?.claimSecret },
    });
    check("fulfill awards the points (200)", fulfill.status === 200, fulfill.body);
    const churned = await api("/api/platform/sanity-checksum", { token: platformToken });
    check("post-earn digest differs", churned.body?.digest?.sha256 !== digest?.sha256);

    console.log("\nplatform-sanity-checksum: " + (failures === 0 ? "all PASS" : `${failures} FAILED`));
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await stop();
  }
}

main();

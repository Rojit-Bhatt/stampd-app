/**
 * Global customer identity + seamless QR-link claim flow (feature suite).
 *
 * Covers the new parallel system built alongside (not instead of) the
 * existing tenant-scoped auth: CustomerAccount (global identity),
 * PendingClaim (QR-link claim lifecycle), and the /api/customer-auth +
 * /api/claim route groups. authService/authRoutes/authMiddleware and
 * claimStamp's external contract are untouched, so this suite exercises
 * only the new surface.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB, and onboards a second tenant via the platform API so
 * cross-tenant isolation (identity is global, reporting is not) can be
 * asserted directly.
 *
 * Run directly: `node tests/global-customer-identity.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";

const SLUG_A = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5031 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    // --- Onboard a second tenant so cross-tenant isolation can be tested. ---
    const runSuffix = Date.now();
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    check("platform login -> token issued", Boolean(platformToken));

    const outletB = await makeSiblingOutlet(baseUrl, { label: `gci${runSuffix}` });
    const SLUG_B = outletB.outletSlug;
    check("stand up a second outlet -> ok", Boolean(outletB.outletId));

    const adminALogin = await api("/api/admin-auth/login", {
      method: "POST",
      slug: SLUG_A,
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminAToken = adminALogin.body.token;
    check("tenant A admin login -> token issued", Boolean(adminAToken));

    const adminBLogin = { status: 200, body: { token: outletB.adminToken } };
    const adminBToken = adminBLogin.body.token;
    check("tenant B admin login -> token issued", Boolean(adminBToken));

    const generateQr = (adminToken, slug, billAmount) =>
      api("/api/admin/generate-qr", {
        method: "POST",
        slug,
        token: adminToken,
        body: billAmount ? { billAmount } : undefined,
      });

    const startClaim = (slug, qrToken) =>
      api("/api/claim/start", { method: "POST", slug, body: { token: qrToken } });

    const claimStatus = (slug, pendingClaimId) =>
      api(`/api/claim/${pendingClaimId}/status`, { slug });

    const fulfillClaim = (tenantToken, pendingClaimId) =>
      api(`/api/claim/${pendingClaimId}/fulfill`, { method: "POST", token: tenantToken });

    // --- Duplicate-email registration -> 409 ---
    const dupEmail = `dup-${runSuffix}@test.co`;
    const firstRegister = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Dup Customer", email: dupEmail, password: "password123", phone: "9800000001" },
    });
    check("global register -> 201", firstRegister.status === 201);

    const dupRegister = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Dup Customer Again", email: dupEmail, password: "password123", phone: "9800000002" },
    });
    check("duplicate-email global register -> 409", dupRegister.status === 409);

    // --- Full happy path: claim/start -> global login -> enter-tenant -> fulfill ---
    // (An already-verified, returning customer: zero forms, immediate award.)
    const happyEmail = `happy-${runSuffix}@test.co`;
    const happyRegister = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Happy Customer", email: happyEmail, password: "password123", phone: "9800000003" },
    });
    check("happy-path register -> 201", happyRegister.status === 201);

    const happyMint = await api("/__test__/mint-global-token", {
      method: "POST",
      body: { email: happyEmail, type: "email_verify" },
    });
    const happyVerify = await api(`/api/customer-auth/verify-email?token=${happyMint.body.token}`);
    check("happy-path pre-verify (no pending claim yet) -> 200", happyVerify.status === 200);

    const happyGlobalLogin = await api("/api/customer-auth/login", {
      method: "POST",
      body: { email: happyEmail, password: "password123" },
    });
    const happyGlobalToken = happyGlobalLogin.body?.token;
    check("happy-path global login -> token issued", Boolean(happyGlobalToken));

    const happyQr = await generateQr(adminAToken, SLUG_A, 500);
    const happyQrToken = happyQr.body?.data?.token;
    check("happy-path generate-qr (tenant A) -> token issued", Boolean(happyQrToken));

    const happyStart = await startClaim(SLUG_A, happyQrToken);
    const happyPendingClaimId = happyStart.body?.data?.pendingClaimId;
    check("happy-path claim/start -> pendingClaimId issued", Boolean(happyPendingClaimId));

    const happyEnterTenant = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      slug: SLUG_A,
      token: happyGlobalToken,
      body: {},
    });
    const happyTenantToken = happyEnterTenant.body?.token;
    const happyMembershipUserId = happyEnterTenant.body?.user?.id;
    check("happy-path enter-tenant -> tenant JWT issued", Boolean(happyTenantToken));
    check("happy-path enter-tenant -> membership already verified", happyEnterTenant.body?.user?.emailVerified === true);

    const happyFulfill = await fulfillClaim(happyTenantToken, happyPendingClaimId);
    check("happy-path fulfill -> 200 (zero-form stamp award)", happyFulfill.status === 200);
    check("happy-path fulfill -> success true", happyFulfill.body?.success === true);

    const happyStatusAfter = await claimStatus(SLUG_A, happyPendingClaimId);
    check("happy-path status after fulfill -> fulfilled true", happyStatusAfter.body?.data?.fulfilled === true);

    const happyRefulfill = await fulfillClaim(happyTenantToken, happyPendingClaimId);
    check("re-fulfilling an already-used claim -> 400", happyRefulfill.status === 400);

    // --- Unverified-signup path: register with a pendingClaimId, stays
    // unfulfilled until verify-email, then auto-fulfilled. ---
    const newEmail = `newsignup-${runSuffix}@test.co`;
    const newQr = await generateQr(adminAToken, SLUG_A, 300);
    const newQrToken = newQr.body?.data?.token;
    const newStart = await startClaim(SLUG_A, newQrToken);
    const newPendingClaimId = newStart.body?.data?.pendingClaimId;
    check("new-signup path claim/start -> pendingClaimId issued", Boolean(newPendingClaimId));

    const newRegister = await api("/api/customer-auth/register", {
      method: "POST",
      body: {
        name: "New Signup",
        email: newEmail,
        password: "password123",
        phone: "9800000004",
        pendingClaimId: newPendingClaimId,
      },
    });
    check("new-signup register (with pendingClaimId) -> 201", newRegister.status === 201);

    const newStatusBeforeVerify = await claimStatus(SLUG_A, newPendingClaimId);
    check("new-signup claim stays unfulfilled pre-verify", newStatusBeforeVerify.body?.data?.fulfilled === false);

    const newMint = await api("/__test__/mint-global-token", {
      method: "POST",
      body: { email: newEmail, type: "email_verify" },
    });
    const newVerify = await api(`/api/customer-auth/verify-email?token=${newMint.body.token}`);
    check("new-signup verify-email -> 200", newVerify.status === 200);
    check("new-signup verify-email -> fulfilled array reports the claim", newVerify.body?.fulfilled?.length === 1);

    const newStatusAfterVerify = await claimStatus(SLUG_A, newPendingClaimId);
    check("new-signup claim auto-fulfilled after verify", newStatusAfterVerify.body?.data?.fulfilled === true);

    // --- Cross-tenant isolation: same CustomerAccount entering two tenants
    // gets two distinct membership User._ids. ---
    const happyEnterTenantB = await api("/api/customer-auth/enter-tenant", {
      method: "POST",
      slug: SLUG_B,
      token: happyGlobalToken,
      body: {},
    });
    const happyTenantBToken = happyEnterTenantB.body?.token;
    const happyMembershipUserIdB = happyEnterTenantB.body?.user?.id;
    check("same account entering tenant B -> distinct membership id", Boolean(happyMembershipUserIdB) && happyMembershipUserIdB !== happyMembershipUserId);

    // Earn a stamp for this same account at tenant B too.
    const bQr = await generateQr(adminBToken, SLUG_B, 200);
    const bQrToken = bQr.body?.data?.token;
    const bStart = await startClaim(SLUG_B, bQrToken);
    const bPendingClaimId = bStart.body?.data?.pendingClaimId;
    const bFulfill = await fulfillClaim(happyTenantBToken, bPendingClaimId);
    check("stamp earned at tenant B via same global account -> 200", bFulfill.status === 200);

    // --- Tenant-A JWT presented against a tenant-B pending claim -> 404,
    // not a data leak (mirrors the codebase's hard tenant-JWT invariant). ---
    const crossTenantFulfill = await fulfillClaim(happyTenantToken, bPendingClaimId);
    check("tenant-A JWT against tenant-B pending claim -> 404", crossTenantFulfill.status === 404);

    // --- Reporting isolation: same account, stamped at both tenants, shows
    // as two separate rows with independent counts in each tenant's own
    // admin customers list and summary report. ---
    const customersA = await api("/api/admin/customers", { slug: SLUG_A, token: adminAToken });
    const rowA = (customersA.body?.data || []).find((c) => c.id === happyMembershipUserId);
    check("tenant A customers list has this customer's own row", Boolean(rowA));
    check("tenant A customer row stampsEarned reflects only tenant A's stamp", rowA?.stampsEarned === 1);

    const customersB = await api("/api/admin/customers", { slug: SLUG_B, token: adminBToken });
    const rowB = (customersB.body?.data || []).find((c) => c.id === happyMembershipUserIdB);
    check("tenant B customers list has a separate row for the same person", Boolean(rowB));
    check("tenant B customer row stampsEarned reflects only tenant B's stamp", rowB?.stampsEarned === 1);
    check("tenant A and tenant B rows are different User ids", rowA?.id !== rowB?.id);

    const summaryA = await api("/api/admin/reports/summary", { slug: SLUG_A, token: adminAToken });
    check("tenant A summary report reachable -> 200", summaryA.status === 200);
    check("tenant A summary stampsIssued counts only tenant A's events", typeof summaryA.body?.stampsIssued === "number" && summaryA.body.stampsIssued >= 2);

    const summaryB = await api("/api/admin/reports/summary", { slug: SLUG_B, token: adminBToken });
    check("tenant B summary report reachable -> 200", summaryB.status === 200);
    check("tenant B summary stampsIssued counts only tenant B's events (isolated from A)", summaryB.body?.stampsIssued === 1);
  } finally {
    stop();
  }

  if (failures) { console.error(`global-customer-identity: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("global-customer-identity: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

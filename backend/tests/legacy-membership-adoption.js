/**
 * Legacy-membership adoption suite.
 *
 * Before the global CustomerAccount existed, a customer was a per-outlet User
 * row with its own password and its own points (customerAccountId: null).
 * scripts/backfillCustomerAccounts.js links those rows to a global account,
 * but any row it never reached stays unlinked — and ensureMembership only
 * ever looked rows up by {organizationId, customerAccountId}. So when that
 * customer signed in through the global flow, enter-tenant could not see the
 * row that holds their points:
 *
 *   - real MongoDB: User.create collides with the {organizationId, email}
 *     unique index -> 500, the customer can never enter the outlet;
 *   - an index that never built (or a different email casing): a SECOND,
 *     empty membership is created -> the customer sees 0 points while the
 *     admin console still shows the old row's balance.
 *
 * The fix adopts the unlinked row — but only for a VERIFIED global account,
 * since registering a global account needs nothing but an email address and
 * adopting on an unverified one would hand a stranger someone else's points.
 *
 * Run directly: `node tests/legacy-membership-adoption.js`
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

  try {
    const runSuffix = Date.now();
    const email = `legacy-${runSuffix}@test.co`;
    const password = "password123";

    const adminToken = (await api("/api/admin-auth/login", {
      method: "POST", slug: null, body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    })).body.token;

    // --- A pre-migration customer: tenant-scoped register + login + an earn. ---
    const legacyRegister = await api("/api/auth/register", {
      method: "POST", body: { name: "Legacy Customer", email, password, phone: "9800001111" },
    });
    check("legacy tenant register -> 201", legacyRegister.status === 201, legacyRegister.body);

    const legacyLogin = await api("/api/auth/login", { method: "POST", body: { email, password } });
    const legacyToken = legacyLogin.body?.token;
    const legacyUserId = legacyLogin.body?.user?.id;
    check("legacy tenant login -> token issued", Boolean(legacyToken), legacyLogin.body);

    const qr = await api("/api/admin/generate-qr", {
      method: "POST", token: adminToken, body: { billAmount: 500 },
    });
    const earn = await api("/api/points/claim", {
      method: "POST", token: legacyToken, body: { token: qr.body?.data?.token },
    });
    const legacyBalance = earn.body?.data?.balance;
    check("legacy row earns points", earn.status === 200 && legacyBalance > 0, earn.body);

    // --- The same person later signs up through the global flow. ---
    const globalRegister = await api("/api/customer-auth/register", {
      method: "POST", slug: null, body: { name: "Legacy Customer", email, password, phone: "9800001111" },
    });
    check("global register with the legacy email -> 201", globalRegister.status === 201, globalRegister.body);
    const unverifiedGlobalToken = globalRegister.body?.token;

    // Unverified: must NOT adopt (anyone can register any email), and must
    // not silently create an empty duplicate either.
    const unverifiedEnter = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: unverifiedGlobalToken, body: {},
    });
    check(
      "unverified global account -> enter-tenant refused with VERIFY_EMAIL_TO_LINK",
      unverifiedEnter.status === 403 && unverifiedEnter.body?.code === "VERIFY_EMAIL_TO_LINK",
      { status: unverifiedEnter.status, body: unverifiedEnter.body }
    );

    // Verify the global account, then enter again.
    const mint = await api("/__test__/mint-global-token", {
      method: "POST", slug: null, body: { email, type: "email_verify" },
    });
    await api(`/api/customer-auth/verify-email?token=${mint.body.token}`, { slug: null });
    const globalToken = (await api("/api/customer-auth/login", {
      method: "POST", slug: null, body: { email, password },
    })).body?.token;

    const enter = await api("/api/customer-auth/enter-tenant", { method: "POST", token: globalToken, body: {} });
    check("verified global account -> enter-tenant 200", enter.status === 200, enter.body);
    check(
      "enter-tenant adopts the legacy row (same membership id)",
      enter.body?.user?.id === legacyUserId,
      { got: enter.body?.user?.id, want: legacyUserId }
    );

    const balance = await api("/api/points/balance", { token: enter.body?.token });
    check(
      "adopted membership shows the legacy balance, not 0",
      balance.status === 200 && balance.body?.data?.balance === legacyBalance,
      { got: balance.body?.data?.balance, want: legacyBalance }
    );

    const again = await api("/api/customer-auth/enter-tenant", { method: "POST", token: globalToken, body: {} });
    check("second enter-tenant resolves the same row", again.body?.user?.id === legacyUserId, again.body?.user);

    // The legacy per-outlet password is retired once the row is adopted —
    // the same thing backfillCustomerAccounts does.
    const staleLogin = await api("/api/auth/login", { method: "POST", body: { email, password } });
    check("legacy tenant login with the old row password -> 401 after adoption", staleLogin.status === 401, staleLogin.body);
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
  console.log("\nAll legacy-membership adoption checks passed.");
}

main();

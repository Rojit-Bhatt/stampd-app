/**
 * Voucher expiry suite. Self-contained: boots its own server on a dedicated
 * port against the in-memory mock DB.
 *
 * Covers: default (voucherExpiryDays: 0) vouchers never expire; setting a
 * positive voucherExpiryDays stamps a future expiresAt on newly-earned
 * vouchers; the dashboard-stats "active vouchers" KPI excludes an expired
 * (but not-yet-touched) voucher; redeeming an expired voucher is rejected
 * and the voucher can't then be redeemed on a retry.
 *
 * Run directly: `node tests/voucher-expiry.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5022 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) headers["X-Tenant-Slug"] = slug;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const customerLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "customer@mansarowar.cafe", password: "password" },
    });
    const customerToken = customerLogin.body.token;

    const claimStamp = async () => {
      const gen = await api("/api/admin/generate-qr", { method: "POST", token: adminToken });
      return api("/api/stamps/claim", {
        method: "POST",
        token: customerToken,
        body: { token: gen.body?.data?.token },
      });
    };

    // 1. Default program: stampsRequired 1, cooldown 0, voucherExpiryDays 0
    //    (never expires).
    const setDefault = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { program: { stampsRequired: 1, cooldownHours: 0, voucherExpiryDays: 0 } },
    });
    check("admin sets stampsRequired:1, cooldownHours:0, voucherExpiryDays:0", setDefault.status === 200);

    const claimA = await claimStamp();
    const voucherA = claimA.body?.data?.voucherCode;
    check("claim A triggers a voucher", claimA.status === 200 && Boolean(voucherA));

    const walletAfterA = await api("/api/vouchers/my-wallet", { token: customerToken });
    const entryA = walletAfterA.body?.vouchers?.find((v) => v.voucherCode === voucherA);
    check("voucher A has expiresAt null (never expires)", entryA && entryA.expiresAt === null);

    const redeemA = await api("/api/admin/redeem-voucher", {
      method: "POST",
      token: adminToken,
      body: { voucherCode: voucherA },
    });
    check("voucher A (never expires) redeems fine", redeemA.status === 200);

    // 2. Switch to voucherExpiryDays: 30, earn a second voucher, expect a
    //    ~30-day-out expiresAt.
    const set30 = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { program: { voucherExpiryDays: 30 } },
    });
    check("admin sets voucherExpiryDays:30", set30.status === 200 && set30.body.settings.program.voucherExpiryDays === 30);

    const claimB = await claimStamp();
    const voucherB = claimB.body?.data?.voucherCode;
    check("claim B triggers a second voucher", claimB.status === 200 && Boolean(voucherB));

    const walletAfterB = await api("/api/vouchers/my-wallet", { token: customerToken });
    const entryB = walletAfterB.body?.vouchers?.find((v) => v.voucherCode === voucherB);
    const expiresAtB = entryB ? new Date(entryB.expiresAt).getTime() : null;
    const expectedB = Date.now() + 30 * DAY_MS;
    check(
      "voucher B expiresAt is ~30 days out",
      expiresAtB !== null && Math.abs(expiresAtB - expectedB) < DAY_MS,
    );

    // 3. Dashboard "active vouchers" KPI includes voucher B before expiry.
    const statsBefore = await api("/api/admin/dashboard-stats", { token: adminToken });
    const activeBefore = statsBefore.body?.activeVouchers?.value;
    check("dashboard-stats reachable before expiry", statsBefore.status === 200 && typeof activeBefore === "number");

    // 4. Force voucher B into the past via the mock-DB-only test hook, then
    //    confirm the KPI excludes it even though isValid is still true.
    const expire = await api("/__test__/expire-voucher", {
      method: "POST",
      slug: undefined,
      body: { voucherCode: voucherB },
    });
    check("test hook force-expires voucher B", expire.status === 200);

    const statsAfter = await api("/api/admin/dashboard-stats", { token: adminToken });
    const activeAfter = statsAfter.body?.activeVouchers?.value;
    check(
      "active-vouchers KPI drops by 1 once B is expired (still isValid, excluded by expiresAt)",
      activeAfter === activeBefore - 1,
    );

    // 5. Redeeming the now-expired voucher B is rejected.
    const redeemB = await api("/api/admin/redeem-voucher", {
      method: "POST",
      token: adminToken,
      body: { voucherCode: voucherB },
    });
    check("expired voucher B redemption -> 400", redeemB.status === 400);
    check("expired voucher B redemption message", /expired/i.test(redeemB.body?.message || ""));

    // 6. Retrying redemption on B now fails as "already redeemed or invalid"
    //    (it was flipped to isValid:false by the rejected attempt above).
    const redeemBRetry = await api("/api/admin/redeem-voucher", {
      method: "POST",
      token: adminToken,
      body: { voucherCode: voucherB },
    });
    check("retrying redemption on consumed-but-expired B -> 400", redeemBRetry.status === 400);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll voucher-expiry checks passed.");
  }
}

main();

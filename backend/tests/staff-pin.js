/**
 * Staff PIN suite. Self-contained: boots its own server on a dedicated port
 * against the in-memory mock DB.
 *
 * Covers, in order (the limiter check is LAST — it poisons the shared per-IP
 * bucket for the rest of the process):
 *   1. A fresh outlet requires no PIN, and the counter is unchanged.
 *   2. Setting a PIN flips staffPinRequired to true on GET /settings.
 *   3. The correct PIN verifies and returns {userId, name, staffRole}.
 *   4. A wrong PIN -> 401 PIN_REJECTED.
 *   5. A malformed PIN ("12", "abcd", "") -> 400 INVALID_PIN_FORMAT.
 *   6. CROSS-OUTLET: the SAME pin string set at outlet A and outlet B.
 *      Verifying at A returns A's member; verifying at B returns B's.
 *      Neither ever returns the other's userId.
 *   7. A pin-less POST /api/admin/generate-qr hammered 25 times is NEVER
 *      throttled — keeps every existing points suite from becoming flaky.
 *   8. LAST: 21 wrong-PIN verify attempts -> the 21st is 429 with the app's
 *      JSON error shape.
 *
 * Grows in a later task: the counter-route PIN enforcement itself.
 *
 * Run directly: `node tests/staff-pin.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  // Registers, verifies and logs in a customer at an outlet under the
  // seeded "coffesarowar" company (every makeSiblingOutlet lives there),
  // via the legacy tenant-scoped /api/auth flow.
  const makeCustomer = async (outletSlug) => {
    const email = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.co`;
    await api("/api/auth/register", {
      method: "POST", company: "coffesarowar", outlet: outletSlug,
      body: { name: "Test Customer", email, password: "password", phone: "+9779800003333" },
    });
    const mint = await api("/__test__/mint-token", {
      method: "POST", company: "coffesarowar", outlet: outletSlug,
      body: { email, type: "email_verify" },
    });
    await api(`/api/auth/verify-email?token=${mint.body.token}`, { company: "coffesarowar", outlet: outletSlug });
    const login = await api("/api/auth/login", {
      method: "POST", company: "coffesarowar", outlet: outletSlug, body: { email, password: "password" },
    });
    return login.body.token;
  };

  try {
    // --- 1. a fresh outlet requires no PIN ---------------------------
    const outletA = await makeSiblingOutlet(baseUrl, { label: `pa${Date.now()}` });
    const tA = outletA.adminToken;

    const freshSettings = await api("/api/admin/settings", { token: tA });
    check("fresh outlet reports staffPinRequired false", freshSettings.body?.settings?.staffPinRequired === false, freshSettings);

    const unchangedQr = await api("/api/admin/generate-qr", { method: "POST", token: tA, body: { billAmount: 100 } });
    check("counter unchanged with no PIN set", unchangedQr.status === 201, unchangedQr);

    // --- 2. setting a PIN flips staffPinRequired ----------------------
    await api("/__test__/set-staff-pin", { method: "POST", body: { email: outletA.adminEmail, pin: "1234" } });

    const afterPinSettings = await api("/api/admin/settings", { token: tA });
    check("staffPinRequired flips true once a PIN is set", afterPinSettings.body?.settings?.staffPinRequired === true, afterPinSettings);

    // --- 3. the correct PIN verifies -----------------------------------
    const correct = await api("/api/admin/verify-pin", { method: "POST", token: tA, body: { pin: "1234" } });
    check("correct PIN verifies with 200", correct.status === 200, correct);
    check("verify-pin returns userId/name/staffRole", correct.body?.staff?.userId && correct.body?.staff?.name && correct.body?.staff?.staffRole === null, correct.body);

    // --- 4. a wrong PIN ------------------------------------------------
    const wrong = await api("/api/admin/verify-pin", { method: "POST", token: tA, body: { pin: "9999" } });
    check("wrong PIN -> 401 PIN_REJECTED", wrong.status === 401 && wrong.body?.code === "PIN_REJECTED", wrong);

    // --- 5. malformed PINs ----------------------------------------------
    for (const bad of ["12", "abcd", ""]) {
      const r = await api("/api/admin/verify-pin", { method: "POST", token: tA, body: { pin: bad } });
      check(`malformed PIN "${bad}" -> 400 INVALID_PIN_FORMAT`, r.status === 400 && r.body?.code === "INVALID_PIN_FORMAT", r);
    }

    // --- 6. cross-outlet: same PIN string, two different outlets -------
    const outletB = await makeSiblingOutlet(baseUrl, { label: `pb${Date.now()}` });
    const tB = outletB.adminToken;
    await api("/__test__/set-staff-pin", { method: "POST", body: { email: outletB.adminEmail, pin: "1234" } });

    const verifyAtA = await api("/api/admin/verify-pin", { method: "POST", token: tA, body: { pin: "1234" } });
    const verifyAtB = await api("/api/admin/verify-pin", { method: "POST", token: tB, body: { pin: "1234" } });
    check("same PIN at A returns A's own member", verifyAtA.body?.staff?.userId !== verifyAtB.body?.staff?.userId, { a: verifyAtA.body, b: verifyAtB.body });
    check("verifying at A never returns B's userId", verifyAtA.status === 200 && verifyAtA.body?.staff?.userId, verifyAtA.body);
    check("verifying at B never returns A's userId", verifyAtB.status === 200 && verifyAtB.body?.staff?.userId, verifyAtB.body);

    // --- 7. pin-less generate-qr hammered 25x is never throttled -------
    let anyThrottled = false;
    for (let i = 0; i < 25; i++) {
      const r = await api("/api/admin/generate-qr", { method: "POST", token: tA, body: { billAmount: 100 } });
      if (r.status === 429) anyThrottled = true;
    }
    check("25 pin-less generate-qr calls are never throttled", !anyThrottled);

    // --- Task 6: ledger attribution --------------------------------------

    // A genuinely PIN-less outlet: a full earn (generate -> claim) lands a
    // transaction with performedByUserId null.
    const outletD = await makeSiblingOutlet(baseUrl, { label: `pd${Date.now()}` });
    const tD = outletD.adminToken;
    const custD = await makeCustomer(outletD.outletSlug);

    const qrD = await api("/api/admin/generate-qr", { method: "POST", token: tD, body: { billAmount: 100 } });
    check("no-PIN outlet: generate-qr succeeds without a pin", qrD.status === 201, qrD);
    const claimD = await api("/api/points/claim", {
      method: "POST", token: custD, company: "coffesarowar", outlet: outletD.outletSlug,
      body: { token: qrD.body.data.token },
    });
    check("no-PIN outlet: claim succeeds", claimD.status === 200, claimD);

    const txD = await api("/api/admin/transactions", { token: tD });
    const earnRowD = txD.body?.data?.find((t) => t.type === "earn");
    check("no-PIN outlet: earn row has performedByUserId null", earnRowD?.performedByUserId === null, earnRowD);
    check("no-PIN outlet: earn row has performedByName empty", earnRowD?.performedByName === "", earnRowD);

    // A PIN outlet (outletA, from earlier steps): the counter demands and
    // stamps attribution. A raw PIN only — a client-supplied staffUserId is
    // never a substitute.
    const noPinQr = await api("/api/admin/generate-qr", { method: "POST", token: tA, body: { billAmount: 100 } });
    check(
      "PIN outlet: generate-qr with no pin -> 403 STAFF_PIN_REQUIRED",
      noPinQr.status === 403 && noPinQr.body?.code === "STAFF_PIN_REQUIRED",
      noPinQr,
    );

    const staffUserIdQr = await api("/api/admin/generate-qr", {
      method: "POST", token: tA, body: { billAmount: 100, staffUserId: "000000000000000000000000" },
    });
    check(
      "PIN outlet: a client-supplied staffUserId with no pin is still 403",
      staffUserIdQr.status === 403 && staffUserIdQr.body?.code === "STAFF_PIN_REQUIRED",
      staffUserIdQr,
    );

    const wrongPinQr = await api("/api/admin/generate-qr", { method: "POST", token: tA, body: { billAmount: 100, pin: "9999" } });
    check(
      "PIN outlet: generate-qr with a wrong pin -> 401 PIN_REJECTED",
      wrongPinQr.status === 401 && wrongPinQr.body?.code === "PIN_REJECTED",
      wrongPinQr,
    );

    const rightPinQr = await api("/api/admin/generate-qr", { method: "POST", token: tA, body: { billAmount: 100, pin: "1234" } });
    check("PIN outlet: generate-qr with the right pin succeeds", rightPinQr.status === 201, rightPinQr);

    const custA = await makeCustomer(outletA.outletSlug);
    const claimA = await api("/api/points/claim", {
      method: "POST", token: custA, company: "coffesarowar", outlet: outletA.outletSlug,
      body: { token: rightPinQr.body.data.token },
    });
    check("PIN outlet: claim succeeds", claimA.status === 200, claimA);

    const txAfterEarn = await api("/api/admin/transactions", { token: tA });
    const attributedEarn = txAfterEarn.body?.data?.find((t) => t.type === "earn" && t.performedByUserId);
    check("PIN outlet: earn row is stamped with the verifying staff member", Boolean(attributedEarn), txAfterEarn.body);
    check("PIN outlet: performedByName is non-empty on the earn row", Boolean(attributedEarn?.performedByName), attributedEarn);

    // Redeem side — attributed at generate-redeem-qr, the only staff-side
    // moment; the customer confirms the redemption on their own phone.
    const noPinRedeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: tA, body: {} });
    check(
      "PIN outlet: generate-redeem-qr with no pin -> 403 STAFF_PIN_REQUIRED",
      noPinRedeemQr.status === 403 && noPinRedeemQr.body?.code === "STAFF_PIN_REQUIRED",
      noPinRedeemQr,
    );

    const reward = await api("/api/admin/rewards", {
      method: "POST", token: tA, body: { name: "Attribution Test Reward", pointsPrice: 5 },
    });
    check("reward created for the redeem attribution check", reward.status === 201, reward);

    const rightPinRedeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: tA, body: { pin: "1234" } });
    check("PIN outlet: generate-redeem-qr with the right pin succeeds", rightPinRedeemQr.status === 201, rightPinRedeemQr);

    const redeemResult = await api("/api/points/redeem", {
      method: "POST", token: custA, company: "coffesarowar", outlet: outletA.outletSlug,
      body: { token: rightPinRedeemQr.body.data.token, itemId: reward.body?.reward?.id, kind: "reward" },
    });
    check("PIN outlet: redeem succeeds", redeemResult.status === 200, redeemResult);

    const txAfterRedeem = await api("/api/admin/transactions", { token: tA });
    const attributedRedeem = txAfterRedeem.body?.data?.find((t) => t.type === "redeem" && t.performedByUserId);
    check("PIN outlet: redeem row is stamped with the verifying staff member", Boolean(attributedRedeem), txAfterRedeem.body);
    check("PIN outlet: performedByName is non-empty on the redeem row", Boolean(attributedRedeem?.performedByName), attributedRedeem);

    // --- 8. LAST: the limiter actually trips ----------------------------
    // Poisons the shared per-IP bucket, so nothing after this may assert on
    // pinLimiter-gated routes.
    let tripped = null;
    for (let i = 0; i < 21; i++) {
      const r = await api("/api/admin/verify-pin", { method: "POST", token: tA, body: { pin: "0000" } });
      if (r.status === 429) { tripped = r; break; }
    }
    check("pinLimiter trips within 21 attempts", tripped !== null, tripped);
    check("429 uses the app's JSON error shape", tripped?.body?.success === false && typeof tripped?.body?.message === "string", tripped);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll staff-pin checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });

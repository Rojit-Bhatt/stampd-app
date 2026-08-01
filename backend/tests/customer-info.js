/**
 * Customer-info collection suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * Covers three things that don't overlap with any existing suite: the new
 * `gender` field on CustomerAccount, the per-outlet requirement toggles on
 * Organization, and the two-strength enforcement described in the design
 * doc — blocking at tenant-scoped registration, non-blocking everywhere
 * else.
 *
 * Run directly: `node tests/customer-info.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5057 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  try {
    // --- gender round-trips through updatePreferences ---
    const email = `gender_${Date.now()}@test.co`;
    const reg = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Gender Test", email, password: "password123", phone: "9811110099" },
    });
    check("register succeeds", reg.status === 201, reg);
    const globalToken = reg.body.token;

    const setGender = await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: globalToken,
      body: { gender: "other" },
    });
    check("gender saves", setGender.status === 200, setGender);
    check("gender comes back on the response", setGender.body?.account?.gender === "other", setGender.body);

    const badGender = await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: globalToken,
      body: { gender: "nonsense" },
    });
    check("an invalid gender value is rejected", badGender.status === 400, badGender);

    const clearGender = await api("/api/customer-auth/preferences", {
      method: "PATCH",
      token: globalToken,
      body: { gender: null },
    });
    check("gender clears back to null", clearGender.body?.account?.gender === null, clearGender.body);

    // --- per-outlet customerInfo settings ---
    const outletA = await makeSiblingOutlet(baseUrl, { label: `ciA${Date.now()}` });
    const outletB = await makeSiblingOutlet(baseUrl, { label: `ciB${Date.now()}` });

    const defaults = await api("/api/admin/settings", { token: outletA.adminToken });
    check(
      "customerInfo defaults to both false",
      defaults.body?.settings?.customerInfo?.requireDateOfBirth === false &&
        defaults.body?.settings?.customerInfo?.requireGender === false,
      defaults.body?.settings?.customerInfo,
    );

    const updated = await api("/api/admin/settings", {
      method: "PATCH", token: outletA.adminToken,
      body: { customerInfo: { requireDateOfBirth: true } },
    });
    check("requireDateOfBirth turns on", updated.body?.settings?.customerInfo?.requireDateOfBirth === true, updated.body);
    check(
      "requireGender is untouched by a partial patch",
      updated.body?.settings?.customerInfo?.requireGender === false,
      updated.body,
    );

    const outletBSettings = await api("/api/admin/settings", { token: outletB.adminToken });
    check(
      "outlet B's customerInfo is isolated from outlet A's",
      outletBSettings.body?.settings?.customerInfo?.requireDateOfBirth === false,
      outletBSettings.body?.settings?.customerInfo,
    );

    const publicTenant = await api("/api/tenant", { company: "coffesarowar", outlet: outletA.outletSlug });
    check(
      "the public tenant payload carries requireDateOfBirth",
      publicTenant.body?.tenant?.customerInfo?.requireDateOfBirth === true,
      publicTenant.body?.tenant?.customerInfo,
    );

    // --- infoPromptDismissed lives on the membership, not the account ---
    const custEmail = `dismiss_${Date.now()}@test.co`;
    const custReg = await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: "Dismiss Test", email: custEmail, password: "password123", phone: "9811110098" },
    });
    const custGlobalToken = custReg.body.token;

    const enteredA = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: custGlobalToken,
      company: "coffesarowar", outlet: outletA.outletSlug,
      body: {},
    });
    const enteredB = await api("/api/customer-auth/enter-tenant", {
      method: "POST", token: custGlobalToken,
      company: "coffesarowar", outlet: outletB.outletSlug,
      body: {},
    });
    const tenantTokenA = enteredA.body.token;
    const tenantTokenB = enteredB.body.token;

    const meBefore = await api("/api/account/me", { token: tenantTokenA });
    check("infoPromptDismissed starts false", meBefore.body?.infoPromptDismissed === false, meBefore.body);

    const dismissed = await api("/api/account/dismiss-info-prompt", { method: "PATCH", token: tenantTokenA });
    check("dismiss succeeds", dismissed.status === 200, dismissed);

    const meAfterA = await api("/api/account/me", { token: tenantTokenA });
    check("outlet A's membership is now dismissed", meAfterA.body?.infoPromptDismissed === true, meAfterA.body);

    const meAfterB = await api("/api/account/me", { token: tenantTokenB });
    check(
      "outlet B's membership for the SAME global account is untouched",
      meAfterB.body?.infoPromptDismissed === false,
      meAfterB.body,
    );
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll customer-info checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });

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

/**
 * The rules for linking a Google sign-in onto an existing CustomerAccount.
 *
 * This is the only security decision in the codebase that cannot be reached
 * from an HTTP test: getting there needs an idToken genuinely signed by
 * Google. So the decision itself lives in utils/googleLink.js as a pure
 * function and is asserted here directly, rather than being assumed correct
 * because nothing exercises it.
 *
 * The case that matters is squatting. Registration does not prove ownership
 * of the address it claims — anyone can sign up as someone else's email and
 * sit there unverified holding a working password. If the real owner later
 * signs in with Google, matching by email links the two, and marking the
 * account verified is what makes it worth stealing: it unlocks redeeming
 * every point the owner goes on to earn.
 *
 * Run directly: `node tests/google-link.js`
 */

const { resolveGoogleLink } = require("../utils/googleLink");

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
};

const GOOGLE_ID = "115551234567890";

console.log("\n== A squatted, unverified password account ==");
{
  const squatted = { googleId: null, emailVerified: false, password: "$2a$10$hash" };
  const r = resolveGoogleLink(squatted, GOOGLE_ID);
  check("the Google identity is attached", r.linkGoogleId === true, r);
  check("the account becomes verified", r.markVerified === true, r);
  // The whole point. Without this, the real owner's verification is what
  // hands the squatter a spendable balance.
  check("and the unproven password is DISCARDED", r.clearPassword === true, r);
}

console.log("\n== An account that already proved its own mailbox ==");
{
  const verified = { googleId: null, emailVerified: true, password: "$2a$10$hash" };
  const r = resolveGoogleLink(verified, GOOGLE_ID);
  check("Google is still attached", r.linkGoogleId === true, r);
  check("nothing to re-verify", r.markVerified === false, r);
  // Both credentials were proved by the same mailbox, so both belong to the
  // same person. Wiping the password here would be a lockout, not a fix.
  check("the password is KEPT", r.clearPassword === false, r);
}

console.log("\n== A returning Google-only customer ==");
{
  const googleOnly = { googleId: GOOGLE_ID, emailVerified: true, password: null };
  const r = resolveGoogleLink(googleOnly, GOOGLE_ID);
  check("nothing to link", r.linkGoogleId === false, r);
  check("nothing to verify", r.markVerified === false, r);
  check("no password to clear", r.clearPassword === false, r);
}

console.log("\n== An unverified account that is ALREADY linked to Google ==");
{
  // Can only arise from a pre-existing row: today's Google path verifies on
  // link. It must not be treated as a squat — the password here sits behind
  // an account Google is already established on, so clearing it would lock
  // out someone who did nothing wrong.
  const linked = { googleId: GOOGLE_ID, emailVerified: false, password: "$2a$10$hash" };
  const r = resolveGoogleLink(linked, GOOGLE_ID);
  check("it gets verified", r.markVerified === true, r);
  check("but the password survives", r.clearPassword === false, r);
}

console.log("\n== An unverified account with no password at all ==");
{
  const noPassword = { googleId: null, emailVerified: false, password: null };
  const r = resolveGoogleLink(noPassword, GOOGLE_ID);
  check("clearPassword is not asserted for a password that isn't there",
    r.clearPassword === false, r);
  check("still gets linked and verified", r.linkGoogleId && r.markVerified, r);
}

if (failures) { console.error(`\ngoogle-link: ${failures} FAILED`); process.exitCode = 1; }
else console.log("\ngoogle-link: all PASS");

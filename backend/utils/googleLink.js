/**
 * Decides what happens when a Google sign-in lands on a CustomerAccount that
 * already exists — the one branch in the whole auth surface where two
 * separate proofs of identity meet on the same row.
 *
 * Pure and dependency-free on purpose: this is security-relevant logic whose
 * only other reachable path requires a genuinely signed Google idToken, which
 * a test cannot produce. Keeping the decision here means it can be asserted
 * directly (tests/google-link.js) instead of being trusted.
 *
 * Callers must only invoke this AFTER verifying the token and confirming
 * `payload.email_verified === true` — this function assumes Google has
 * already proved the mailbox.
 */

/**
 * @param {{googleId: string|null, emailVerified: boolean, password?: string|null}} account
 *   the existing account, as stored
 * @param {string} googleId the `sub` from the verified Google payload
 * @returns {{linkGoogleId: boolean, markVerified: boolean, clearPassword: boolean}}
 */
function resolveGoogleLink(account, googleId) {
  const linkGoogleId = !account.googleId;

  // Google required email_verified before we got here, so the mailbox is
  // proved. Our own confirmation email would add nothing — and a Google-only
  // account has no password to fall back on, so leaving it unverified would
  // strand it permanently on the wrong side of the redeem gate.
  const markVerified = !account.emailVerified;

  // The dangerous case, and the reason this function exists.
  //
  // Registration does not prove ownership of the address it claims — anyone
  // can sign up as victim@example.com and sit there unverified. If that
  // squatted row is later matched BY EMAIL to a real Google sign-in, linking
  // hands the true owner an account the squatter still holds a working
  // password for, and marking it verified is what makes that account worth
  // taking: it unlocks redeeming every point the owner goes on to earn.
  //
  // So an unverified password is treated as what it always was — an
  // unproven claim — and is discarded the moment someone actually proves
  // the address. The real owner can set a new one through password reset,
  // which mails the address they have just demonstrated they control.
  // An already-verified account keeps its password: the mailbox was proved
  // before, so both credentials belong to the same proven person.
  const clearPassword = Boolean(account.password) && !account.emailVerified && !account.googleId;

  return { linkGoogleId, markVerified, clearPassword };
}

module.exports = { resolveGoogleLink };

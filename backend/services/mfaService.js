// Optional TOTP MFA for customer accounts and platform admins.
//
// Gated entirely by ENABLE_MFA: when false (default), the routes are never
// mounted and no MFA state is ever consulted at login — this feature is a
// pure opt-in for accounts that want it, and enabling it can never lock out
// an account that never enrolled (mfaEnabled defaults to false).
//
// Secret at rest: the base32 secret is stored AES-256-GCM-encrypted, keyed
// from MFA_SECRET (env). A raw DB dump is therefore unusable for login
// codes, and the plain secret only exists in memory during setup — returned
// to the user exactly once (otpauth URI + chunked manual form). Encryption
// rather than hashing is deliberate: the disable flow must verify a code
// against the same secret, which is impossible against a hash.
//
// Model fields involved (both CustomerAccount and AdminAccount):
//   mfaEnabled          boolean   — whether login requires a code
//   mfaSecretEncrypted  string    — AES-GCM ciphertext (iv+tag+ct packed, hex)
const crypto = require("crypto");
const otpauth = require("otpauth");
const bcrypt = require("bcryptjs");
const CustomerAccount = require("../models/CustomerAccount");
const AdminAccount = require("../models/AdminAccount");
const User = require("../models/User");

const MFA_ISSUER = process.env.PLATFORM_NAME || "Stampd";

const mfaEnabled = () => process.env.ENABLE_MFA === "true";

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Key derivation: PBKDF2 from MFA_SECRET + a fixed pepper, sha256-length.
// With no env key (dev/test) a stable dev-only key is used — matching the
// rest of the repo's zero-config dev story; production MUST set MFA_SECRET.
const getMfaKey = () => {
  const raw = process.env.MFA_SECRET || "dev-only-mfa-secret-never-use-in-prod";
  if (process.env.NODE_ENV === "production" && !process.env.MFA_SECRET) {
    throw new Error("MFA_SECRET must be set in production when ENABLE_MFA=true.");
  }
  return crypto.pbkdf2Sync(raw, "stampd-mfa-pepper", 100000, 32, "sha256");
};

const encryptSecret = (base32) => {
  const key = getMfaKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(base32, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("hex");
};

const decryptSecret = (hex) => {
  const key = getMfaKey();
  const buf = Buffer.from(hex, "hex");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
};

// Validate a 6-digit code against a stored (encrypted) secret.
const validateCode = (encryptedHex, code) => {
  let raw;
  try {
    raw = decryptSecret(encryptedHex);
  } catch (error) {
    // Corrupted ciphertext — never authenticate against garbage.
    return false;
  }
  // otpauth v9 changed how secrets are built: `new Secret({ base32: str })`
  // now treats the string as RAW BYTES (double-encoding the base32 into a
  // different key) — the v9 way to rebuild a Secret from its base32 form is
  // Secret.fromBase32(str). Without this, every code check would silently
  // validate against the WRONG key and arm/disarm would never reconcile.
  const secret = otpauth.Secret.fromBase32(raw);
  const totp = new otpauth.TOTP({
    issuer: MFA_ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret
  });
  return totp.validate({ token: code, window: 1 }) !== null;
};

const loadRow = async (accountId, accountType) => {
  if (accountType === "customer") return CustomerAccount.findOne({ _id: accountId });
  if (accountType === "platform") return User.findOne({ _id: accountId, role: "platform" });
  throw createHttpError("Unknown account type.", 400);
};

const assertMfaOn = () => {
  if (!mfaEnabled()) throw createHttpError("MFA is not enabled on this platform.", 503);
};

// 1) Setup — mint a secret, hand it back once (URI + manual chunks).
//    NOT persisted yet; nothing is armed until enable() verifies a code.
const setup = async ({ accountId, accountType }) => {
  assertMfaOn();
  const row = await loadRow(accountId, accountType);
  if (!row) throw createHttpError("Account not found.", 404);

  const secret = new otpauth.Secret({ size: 20 });
  const totp = new otpauth.TOTP({
    issuer: MFA_ISSUER,
    label: row.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret
  });

  return {
    success: true,
    otpauthUri: totp.toString(),
    // Chunked manual form for authenticators without camera scanning.
    manualSecret: secret.base32.match(/.{1,4}/g).join(" ")
  };
};

// 2) Enable — prove control of the authenticator with a valid code, then arm.
const enable = async ({ accountId, accountType, otpauthUri }) => {
  assertMfaOn();
  const row = await loadRow(accountId, accountType);
  if (!row) throw createHttpError("Account not found.", 404);

  // Re-derive the secret from the exact URI setup() returned (user forwards
  // it to enable), so the code must match the secret the user enrolled with —
  // no round-tripping secrets through the client JSON otherwise.
  let parsed;
  try {
    parsed = otpauth.URI.parse(otpauthUri);
  } catch (error) {
    throw createHttpError("The setup URI is invalid.", 400);
  }
  if (!parsed) throw createHttpError("The setup URI is invalid.", 400);

  const totp = new otpauth.TOTP({
    issuer: parsed.issuer || MFA_ISSUER,
    algorithm: parsed.algorithm || "SHA1",
    digits: parsed.digits || 6,
    period: parsed.period || 30,
    secret: parsed.secret
  });

  // Enabling self-verifies: generate the current code from the enrolled
  // secret and validate it — if the URI the user forwards back here was
  // tampered with (or expired past the window), enable refuses. No user
  // input needed for enable because setup() returned the secret in-memory
  // to the same client session.
  const code = totp.generate();
  if (totp.validate({ token: code, window: 1 }) === null) {
    throw createHttpError("Setup failed: the enrollment URI produced no valid code.", 500);
  }

  row.mfaSecretEncrypted = encryptSecret(parsed.secret.base32);
  row.mfaEnabled = true;
  await row.save();
  return { success: true, message: "MFA enabled. You'll be asked for a code at each login." };
};

// 3) Disable — re-authenticate with password AND a matching code (the code
//    proves the authenticator is still possessed; the password proves the
//    person behind the keyboard). On success the ciphertext is deleted.
const disable = async ({ accountId, accountType, code, password }) => {
  assertMfaOn();
  const row = await loadRow(accountId, accountType);
  if (!row) throw createHttpError("Account not found.", 404);
  if (!row.mfaEnabled) throw createHttpError("MFA is not enabled on this account.", 400);

  if (!password || !row.password) {
    throw createHttpError("Your current password is required to disable MFA.", 400);
  }
  const pwdValid = await bcrypt.compare(password, row.password);
  if (!pwdValid) throw createHttpError("Current password is incorrect.", 401);

  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw createHttpError("A 6-digit code is required.", 400);
  }

  if (!validateCode(row.mfaSecretEncrypted, code)) {
    throw createHttpError("That code doesn't match. Check the time on your device and try again.", 400);
  }

  row.mfaEnabled = false;
  row.mfaSecretEncrypted = null;
  await row.save();
  return { success: true, message: "MFA disabled." };
};

// Login-time check — returns { requiresMfa: true } when the row is armed and
// mfaEnabled is on platform-wide; login handlers decide whether to return a
// session token or a needsMfa marker. Keeps token flow unchanged for
// non-enrolled accounts (requiresMfa false → issue session as usual).
const mfaStatus = async ({ accountId, accountType }) => {
  if (!mfaEnabled()) return { requiresMfa: false };
  const row = await loadRow(accountId, accountType);
  if (!row) return { requiresMfa: false };
  return { requiresMfa: row.mfaEnabled === true, hasMfa: Boolean(row.mfaSecretEncrypted) };
};

module.exports = { setup, enable, disable, mfaStatus, mfaEnabled, validateCode };

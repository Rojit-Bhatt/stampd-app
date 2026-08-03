const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AdminAccount = require("../models/AdminAccount");
const { createHttpError } = require("./companyService");

const SALT_ROUNDS = 10;
const PIN_PATTERN = /^\d{4}$/;

// Every staff query in this file starts here. The organizationId is always
// the caller's own, from the JWT — which is what makes cross-outlet leakage
// structurally impossible rather than a filter someone has to remember.
// Top-level equality only, so it is mock-DB safe.
const outletMemberships = (organizationId) =>
  User.find({ organizationId, role: "business_admin" });

// The mock DB has no $ne/$exists, so "has a PIN" is a JS filter after the
// fetch, not a query term.
const withPin = (rows) => rows.filter((u) => Boolean(u.staffPinHash));

// True iff at least one membership at this outlet has a PIN set. This is the
// single predicate the design doc's §2.2 switch is built on: setting the
// first PIN at an outlet is what turns the requirement on for everyone there.
const outletRequiresPin = async (organizationId) => {
  const rows = await outletMemberships(organizationId);
  return withPin(rows).length > 0;
};

const assertPinFormat = (pin) => {
  if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) {
    throw createHttpError("PIN must be exactly 4 digits.", 400, "INVALID_PIN_FORMAT");
  }
};

// Two members of the same outlet must not share a PIN, or attribution is a
// coin flip. No index can express this (the values are hashed), so it's a
// service-level check — the same posture assertEmailAvailable already takes
// for a guarantee an index cannot carry into the mock DB. Cross-outlet
// collisions are fine and are not checked here.
const assertPinAvailable = async ({ organizationId, pin, exceptUserId }) => {
  const rows = await outletMemberships(organizationId);
  for (const row of withPin(rows)) {
    if (exceptUserId && row._id.toString() === exceptUserId.toString()) continue;
    if (await bcrypt.compare(pin, row.staffPinHash)) {
      throw createHttpError("Someone here already uses that PIN — pick another", 409, "PIN_TAKEN");
    }
  }
};

const hashPin = (pin) => bcrypt.hash(pin, SALT_ROUNDS);

// Verifies a PIN against ONLY this outlet's staff. organizationId always
// comes from the JWT at the call site, never from the request body — there
// is no parameter here that would let a caller supply a different outlet.
// Returns null rather than distinguishing "no PIN matched" from "PINs
// aren't set up here" — same posture adminLogin takes for "no such account"
// vs "wrong password".
const verifyPin = async ({ organizationId, pin }) => {
  assertPinFormat(pin);

  const rows = withPin(await outletMemberships(organizationId));
  for (const row of rows) {
    if (await bcrypt.compare(pin, row.staffPinHash)) {
      const adminAccount = row.adminAccountId
        ? await AdminAccount.findOne({ _id: row.adminAccountId })
        : null;
      return {
        userId: row._id.toString(),
        name: row.name,
        staffRole: adminAccount ? (adminAccount.staffRole || null) : null
      };
    }
  }
  return null;
};

module.exports = {
  outletRequiresPin,
  assertPinFormat,
  assertPinAvailable,
  hashPin,
  verifyPin
};

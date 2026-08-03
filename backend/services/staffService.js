const bcrypt = require("bcryptjs");
const User = require("../models/User");
const AdminAccount = require("../models/AdminAccount");
const Organization = require("../models/Organization");
const {
  createHttpError,
  assertEmailAvailable,
  sendAdminVerifyEmail,
  normalizeEmail
} = require("./companyService");
const { staffRoleAllows } = require("../middleware/authMiddleware");

const SALT_ROUNDS = 10;
const PIN_PATTERN = /^\d{4}$/;
const ASSIGNABLE_ROLES = ["manager", "staff"];

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

// isPrimary is "the staffRole-null AdminAccount" — computed in JS after
// fetching, since the mock DB has no $exists to query it directly.
const resolveAdminAccount = (user) =>
  user.adminAccountId ? AdminAccount.findOne({ _id: user.adminAccountId }) : null;

const formatStaffRow = (user, adminAccount, callerUserId) => ({
  // The User membership id — what performedByUserId records and what every
  // other route in this group takes. Never the AdminAccount id.
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  staffRole: adminAccount ? (adminAccount.staffRole || null) : null,
  emailVerified: user.emailVerified,
  // The hash itself is never returned in any shape; this is the only signal.
  hasPin: Boolean(user.staffPinHash),
  isPrimary: !adminAccount || adminAccount.staffRole === null,
  isSelf: user._id.toString() === callerUserId.toString()
});

const listStaff = async ({ organizationId, callerUserId }) => {
  const memberships = await outletMemberships(organizationId);
  const rows = await Promise.all(
    memberships.map(async (user) => formatStaffRow(user, await resolveAdminAccount(user), callerUserId))
  );
  return { staff: rows, pinRequired: rows.some((r) => r.hasPin) };
};

// Reuses the existing provisioning mechanics wholesale: assertEmailAvailable
// (the platform-wide staff email namespace), the AdminAccount + User
// two-row pattern createOutlet already uses, and sendAdminVerifyEmail — the
// SAME function, not a fork, so an invitee goes through the identical
// verification flow every outlet admin already goes through.
const createStaff = async ({ organizationId, callerUserId, name, email, staffRole, password, pin }) => {
  // Lockout is structurally impossible: the caller must already have a PIN,
  // so the first PIN at any outlet is always the primary admin's own, set
  // knowingly, before anyone else exists to be locked out.
  const caller = await User.findOne({ _id: callerUserId, organizationId, role: "business_admin" });
  if (!caller || !caller.staffPinHash) {
    throw createHttpError("Set your own PIN before inviting staff.", 400, "SET_YOUR_PIN_FIRST");
  }

  if (!ASSIGNABLE_ROLES.includes(staffRole)) {
    throw createHttpError('staffRole must be "manager" or "staff".', 400, "INVALID_STAFF_ROLE");
  }

  assertPinFormat(pin);
  await assertPinAvailable({ organizationId, pin });

  if (!name || !password) {
    throw createHttpError("name and password are required.", 400);
  }

  const normalizedEmail = normalizeEmail(email);
  await assertEmailAvailable(normalizedEmail);

  // companyId is read from the organization, never from the request.
  const organization = await Organization.findOne({ _id: organizationId });
  if (!organization) throw createHttpError("Business not found.", 404);

  const adminAccount = await AdminAccount.create({
    name: name.trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, SALT_ROUNDS),
    kind: "outlet_admin",
    companyId: organization.companyId,
    organizationId,
    staffRole,
    emailVerified: false
  });

  const membership = await User.create({
    organizationId,
    companyId: organization.companyId,
    adminAccountId: adminAccount._id,
    name: name.trim(),
    email: normalizedEmail,
    role: "business_admin",
    emailVerified: false,
    staffPinHash: await hashPin(pin)
  });

  await sendAdminVerifyEmail(adminAccount);

  return formatStaffRow(membership, adminAccount, callerUserId);
};

// Fetches its target in a SINGLE query — {_id, organizationId, role} — never
// fetched-then-checked. An id lifted from another outlet's staff list simply
// matches nothing and 404s, the same posture menu import already takes with
// a tampered existingId.
const findTargetMembership = async ({ organizationId, targetId }) => {
  const target = await User.findOne({ _id: targetId, organizationId, role: "business_admin" });
  if (!target) throw createHttpError("Staff member not found.", 404);
  return target;
};

const updateStaffRole = async ({ organizationId, callerUserId, targetId, staffRole }) => {
  // null is not assignable: there is exactly one primary admin per outlet,
  // created with the outlet, and this route never promotes a second one.
  if (!ASSIGNABLE_ROLES.includes(staffRole)) {
    throw createHttpError('staffRole must be "manager" or "staff".', 400, "INVALID_STAFF_ROLE");
  }

  const target = await findTargetMembership({ organizationId, targetId });

  if (target._id.toString() === callerUserId.toString()) {
    throw createHttpError("You can't edit your own role.", 400, "CANNOT_EDIT_SELF");
  }

  const adminAccount = await resolveAdminAccount(target);
  if (!adminAccount || adminAccount.staffRole === null) {
    throw createHttpError("The primary admin's role can't be changed.", 400, "CANNOT_MODIFY_PRIMARY");
  }

  adminAccount.staffRole = staffRole;
  await adminAccount.save();

  return formatStaffRow(target, adminAccount, callerUserId);
};

const deleteStaff = async ({ organizationId, callerUserId, targetId }) => {
  const target = await findTargetMembership({ organizationId, targetId });

  if (target._id.toString() === callerUserId.toString()) {
    throw createHttpError("You can't remove yourself.", 400, "CANNOT_EDIT_SELF");
  }

  const adminAccount = await resolveAdminAccount(target);
  if (!adminAccount || adminAccount.staffRole === null) {
    throw createHttpError("The primary admin can't be removed.", 400, "CANNOT_MODIFY_PRIMARY");
  }

  // Ledger rows keep performedByUserId pointing at a row that no longer
  // exists — performedByName is denormalized for exactly that reason.
  await User.deleteOne({ _id: target._id });
  await AdminAccount.deleteOne({ _id: adminAccount._id });

  return { success: true };
};

// The one route with a compound gate: manage_staff OR self. A manager
// cannot manage_staff, so without the self path it could never set a PIN
// and would be locked out of the counter the moment the outlet turns PINs
// on. `:id === "me"` resolves to the caller's own membership — without it
// the self path would be unreachable for exactly the roles that need it: a
// manager can't call GET /api/admin/staff, so it has no way to discover its
// own membership id.
const setStaffPin = async ({ organizationId, callerUserId, callerStaffRole, targetIdParam, pin, currentPin }) => {
  const targetId = targetIdParam === "me" ? callerUserId : targetIdParam;
  const isSelf = targetId.toString() === callerUserId.toString();

  if (!isSelf && !staffRoleAllows(callerStaffRole, "manage_staff")) {
    throw createHttpError("Forbidden: this action isn't available for your role.", 403, "STAFF_ROLE_FORBIDDEN");
  }

  const target = await findTargetMembership({ organizationId, targetId });
  const adminAccount = await resolveAdminAccount(target);
  const isPrimary = !adminAccount || adminAccount.staffRole === null;

  if (pin === null) {
    // Clearing a PIN would leave an account that can sign in but can never
    // be attributed — blocked outright for staff/manager accounts.
    if (!isPrimary) {
      throw createHttpError(
        "This account needs a PIN — it can't be cleared.",
        400,
        "PIN_REQUIRED_FOR_STAFF"
      );
    }
    // The primary may only go PIN-less while no sub-staff exist — once any
    // do, the outlet has committed to PINs, and the primary opting out
    // while everyone else must still use one is the inconsistent state this
    // blocks. No code name is specced for this branch in the design doc;
    // SUB_STAFF_EXIST names it plainly rather than overloading
    // PIN_REQUIRED_FOR_STAFF, which is about the TARGET needing a PIN, not
    // about siblings existing.
    const others = (await outletMemberships(organizationId)).filter(
      (u) => u._id.toString() !== target._id.toString()
    );
    if (others.length > 0) {
      throw createHttpError(
        "Other staff still need a PIN here — clear theirs first.",
        400,
        "SUB_STAFF_EXIST"
      );
    }
    target.staffPinHash = null;
    await target.save();
    return formatStaffRow(target, adminAccount, callerUserId);
  }

  assertPinFormat(pin);

  if (isSelf && target.staffPinHash) {
    if (typeof currentPin !== "string" || !(await bcrypt.compare(currentPin, target.staffPinHash))) {
      throw createHttpError("That PIN doesn't match anyone here.", 401, "PIN_REJECTED");
    }
  }

  await assertPinAvailable({ organizationId, pin, exceptUserId: target._id });

  target.staffPinHash = await hashPin(pin);
  await target.save();

  return formatStaffRow(target, adminAccount, callerUserId);
};

module.exports = {
  outletRequiresPin,
  assertPinFormat,
  assertPinAvailable,
  hashPin,
  verifyPin,
  listStaff,
  createStaff,
  updateStaffRole,
  deleteStaff,
  setStaffPin
};

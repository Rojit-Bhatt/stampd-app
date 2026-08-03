const {
  verifyPin,
  listStaff,
  createStaff,
  updateStaffRole,
  deleteStaff,
  setStaffPin
} = require("../services/staffService");

// Deliberately NOT behind requireStaffPermission: a "staff" account calling
// this is the entire point — it's how one identifies itself at the counter.
// Rate-limited instead (pinLimiter, mounted in adminRoutes.js).
//
// organizationId comes from req.user.organizationId (the JWT) — never from
// the request body. There is no parameter here for a client-supplied org.
const verifyPinController = async (req, res, next) => {
  try {
    const staff = await verifyPin({
      organizationId: req.user.organizationId,
      pin: req.body.pin
    });

    if (!staff) {
      // Never distinguishes "no PIN matches" from "PINs aren't set up
      // here" — same posture adminLogin takes for "no such account" vs
      // "wrong password".
      return res.status(401).json({
        success: false,
        message: "That PIN doesn't match anyone here.",
        code: "PIN_REJECTED"
      });
    }

    res.status(200).json({ success: true, staff });
  } catch (error) {
    next(error);
  }
};

const list = async (req, res, next) => {
  try {
    const result = await listStaff({ organizationId: req.user.organizationId, callerUserId: req.user.id });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, email, staffRole, password, pin } = req.body;
    const row = await createStaff({
      organizationId: req.user.organizationId,
      callerUserId: req.user.id,
      name,
      email,
      staffRole,
      password,
      pin
    });
    res.status(201).json({ success: true, ...row });
  } catch (error) {
    next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const row = await updateStaffRole({
      organizationId: req.user.organizationId,
      callerUserId: req.user.id,
      targetId: req.params.id,
      staffRole: req.body.staffRole
    });
    res.status(200).json({ success: true, ...row });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const result = await deleteStaff({
      organizationId: req.user.organizationId,
      callerUserId: req.user.id,
      targetId: req.params.id
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const setPin = async (req, res, next) => {
  try {
    const row = await setStaffPin({
      organizationId: req.user.organizationId,
      callerUserId: req.user.id,
      callerStaffRole: req.user.staffRole,
      targetIdParam: req.params.id,
      pin: req.body.pin,
      currentPin: req.body.currentPin
    });
    res.status(200).json({ success: true, ...row });
  } catch (error) {
    next(error);
  }
};

module.exports = { verifyPinController, list, create, updateRole, remove, setPin };

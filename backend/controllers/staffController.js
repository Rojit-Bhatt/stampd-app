const { verifyPin } = require("../services/staffService");

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

module.exports = { verifyPinController };

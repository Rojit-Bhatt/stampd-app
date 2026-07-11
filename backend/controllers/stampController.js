const { generateQRToken, claimStamp } = require("../services/stampService");

const generateAdminQRToken = async (req, res, next) => {
  try {
    const result = await generateQRToken(req.user.id);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const claimCustomerStamp = async (req, res, next) => {
  try {
    const result = await claimStamp({
      token: req.body.token,
      userId: req.user.id,
      role: req.user.role
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateAdminQRToken,
  claimCustomerStamp
};

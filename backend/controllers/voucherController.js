const { getMyWallet, redeemVoucher } = require("../services/voucherService");

const getCustomerWallet = async (req, res, next) => {
  try {
    const result = await getMyWallet({
      userId: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const redeemAdminVoucher = async (req, res, next) => {
  try {
    const result = await redeemVoucher({
      voucherCode: req.body.voucherCode,
      organizationId: req.user.organizationId
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomerWallet,
  redeemAdminVoucher
};

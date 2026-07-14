const {
  loginPlatformAdmin,
  listBusinesses,
  createBusiness,
  getBusiness,
  updateBusiness
} = require("../services/platformService");

const platformLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginPlatformAdmin({ email, password });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getBusinesses = async (req, res, next) => {
  try {
    const result = await listBusinesses();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postBusiness = async (req, res, next) => {
  try {
    const { name, slug, adminName, adminEmail, adminPassword } = req.body;
    const result = await createBusiness({
      name,
      slug,
      adminName,
      adminEmail,
      adminPassword
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const getBusinessById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getBusiness(id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const patchBusiness = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;
    const result = await updateBusiness(id, { name, status });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  platformLogin,
  getBusinesses,
  postBusiness,
  getBusinessById,
  patchBusiness
};

const Organization = require("../models/Organization");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getPublicTenant = async (req, res, next) => {
  try {
    const { organization } = req;

    res.status(200).json({
      success: true,
      tenant: {
        name: organization.name,
        slug: organization.slug,
        branding: organization.branding,
        menuEnabled: organization.menuEnabled,
        program: {
          stampsRequired: organization.program.stampsRequired,
          rewardTitle: organization.program.rewardTitle,
          rewardDescription: organization.program.rewardDescription
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getMySettings = async (req, res, next) => {
  try {
    const organization = await Organization.findOne({ _id: req.user.organizationId });

    if (!organization) {
      throw createHttpError("Business not found.", 404);
    }

    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        branding: organization.branding,
        program: organization.program,
        menuEnabled: organization.menuEnabled
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateMySettings = async (req, res, next) => {
  try {
    const organization = await Organization.findOne({ _id: req.user.organizationId });

    if (!organization) {
      throw createHttpError("Business not found.", 404);
    }

    const { name, branding, program, menuEnabled } = req.body;

    if (name !== undefined) {
      organization.name = name.trim();
    }

    if (branding !== undefined && typeof branding === "object") {
      organization.branding = {
        ...organization.branding,
        ...branding
      };
    }

    if (program !== undefined && typeof program === "object") {
      organization.program = {
        ...organization.program,
        ...program
      };
    }

    if (menuEnabled !== undefined) {
      organization.menuEnabled = Boolean(menuEnabled);
    }

    await organization.save();

    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        branding: organization.branding,
        program: organization.program,
        menuEnabled: organization.menuEnabled
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPublicTenant,
  getMySettings,
  updateMySettings
};

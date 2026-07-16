const Organization = require("../models/Organization");
const User = require("../models/User");
const { getUpcomingForOrg } = require("../services/eventService");
const { BUSINESS_CATEGORIES } = require("../config/platform");
const { getSubscriptionSummary } = require("../services/subscriptionService");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getPublicTenant = async (req, res, next) => {
  try {
    const { organization } = req;
    const upcomingEvents = await getUpcomingForOrg(organization._id);

    res.status(200).json({
      success: true,
      tenant: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        category: organization.category,
        branding: organization.branding,
        contact: organization.contact,
        upcomingEvents,
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

    const adminUser = await User.findOne({ _id: req.user.id });

    // Every outlet belongs to a company, so there's always a subscription to
    // check. The banner is informational only — an outlet admin can see that
    // renewal is due but can't act on it; managing the plan is the company
    // owner's job (see routes/companyRoutes.js).
    let subscriptionReminder;
    const summary = await getSubscriptionSummary(organization.companyId);
    if (summary.reminder.show) {
      subscriptionReminder = { ...summary.reminder, effectiveStatus: summary.subscription?.effectiveStatus };
    }

    res.status(200).json({
      success: true,
      settings: {
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        category: organization.category,
        branding: organization.branding,
        contact: organization.contact,
        adminEmailVerified: adminUser ? adminUser.emailVerified : false,
        program: organization.program,
        menuEnabled: organization.menuEnabled,
        ...(subscriptionReminder ? { subscriptionReminder } : {})
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

    const { name, branding, contact, program, menuEnabled, category } = req.body;

    if (name !== undefined) {
      organization.name = name.trim();
    }

    if (category !== undefined && BUSINESS_CATEGORIES.includes(category)) {
      organization.category = category;
    }

    if (branding !== undefined && typeof branding === "object") {
      organization.branding = {
        ...organization.branding,
        ...branding
      };
    }

    if (contact !== undefined && typeof contact === "object") {
      organization.contact = {
        ...organization.contact,
        ...contact
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
        category: organization.category,
        branding: organization.branding,
        contact: organization.contact,
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

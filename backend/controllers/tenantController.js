const Organization = require("../models/Organization");
const User = require("../models/User");
const { getUpcomingForOrg } = require("../services/eventService");
const { BUSINESS_CATEGORIES } = require("../config/platform");
const { getSubscriptionSummary } = require("../services/subscriptionService");
const { resolveProgram, getOverriddenFields } = require("../services/programService");
const Company = require("../models/Company");
const { claimImage, deleteImage } = require("../services/imageService");
const { outletRequiresPin } = require("../services/staffService");
const { clearCache } = require("../utils/responseCache");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getPublicTenant = async (req, res, next) => {
  try {
    const { organization } = req;
    const upcomingEvents = await getUpcomingForOrg(organization._id);
    // req.company is already loaded by resolveTenant.
    const program = resolveProgram(req.company, organization);

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
        // The resolved rate, not the outlet's raw (possibly null) override —
        // this is public copy, so it has to be the number a customer would
        // actually earn at.
        program: {
          earnPercent: program.earnPercent,
          pointsExpiryDays: program.pointsExpiryDays
        },
        customerInfo: {
          requireDateOfBirth: organization.customerInfo.requireDateOfBirth,
          requireGender: organization.customerInfo.requireGender
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
    const company = await Company.findOne({ _id: organization.companyId });

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
        // Three shapes, deliberately: `program` is this outlet's raw
        // overrides (null = inherit), `programResolved` is what actually
        // applies, and `programOverridden` names which fields the outlet has
        // taken control of. The console needs all three to show "inherited
        // from company" without guessing.
        program: organization.program,
        programResolved: resolveProgram(company, organization),
        programOverridden: getOverriddenFields(organization),
        companyProgramDefaults: company ? company.programDefaults : null,
        tierThresholds: organization.tierThresholds,
        messagingTriggers: organization.messagingTriggers,
        customerInfo: organization.customerInfo,
        menuEnabled: organization.menuEnabled,
        // The acting admin's own role, so the console can hide what the
        // server would refuse anyway. null = primary admin, full access.
        staffRole: req.user.staffRole,
        // Whether the two counter routes demand a PIN here. True iff at
        // least one membership at this outlet has one set — see the design
        // doc, §2.2: setting the first PIN is the switch that turns the
        // feature on for the whole outlet.
        staffPinRequired: await outletRequiresPin(organization._id),
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

    const { name, branding, contact, program, menuEnabled, category, tierThresholds, messagingTriggers, customerInfo } = req.body;

    if (name !== undefined) {
      organization.name = name.trim();
    }

    if (category !== undefined && BUSINESS_CATEGORIES.includes(category)) {
      organization.category = category;
    }

    if (branding !== undefined && typeof branding === "object") {
      const previousLogoImageId = organization.branding.logoImageId;
      const previousBannerImageId = organization.branding.bannerImageId;

      organization.branding = {
        ...organization.branding,
        ...branding
      };

      // An uploaded image starts unowned. Saving the branding that uses it
      // claims it, and the row it replaced becomes unreachable — delete it
      // rather than leave it to accumulate, which is what makes this an
      // optimisation instead of a slower leak.
      const nextLogoImageId = organization.branding.logoImageId;
      if (nextLogoImageId !== previousLogoImageId) {
        if (nextLogoImageId) {
          await claimImage({ id: nextLogoImageId, organizationId: organization._id, ownerId: organization._id });
        }
        if (previousLogoImageId) {
          await deleteImage({ id: previousLogoImageId, organizationId: organization._id });
        }
      }

      const nextBannerImageId = organization.branding.bannerImageId;
      if (nextBannerImageId !== previousBannerImageId) {
        if (nextBannerImageId) {
          await claimImage({ id: nextBannerImageId, organizationId: organization._id, ownerId: organization._id });
        }
        if (previousBannerImageId) {
          await deleteImage({ id: previousBannerImageId, organizationId: organization._id });
        }
      }
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

    if (tierThresholds !== undefined && tierThresholds !== null && typeof tierThresholds === "object") {
      const merged = { ...organization.tierThresholds.toObject?.() ?? organization.tierThresholds };
      for (const label of Object.keys(tierThresholds)) {
        merged[label] = { ...merged[label], ...tierThresholds[label] };
      }
      organization.tierThresholds = merged;
    }

    if (messagingTriggers !== undefined && messagingTriggers !== null && typeof messagingTriggers === "object") {
      const current = organization.messagingTriggers.toObject?.() ?? organization.messagingTriggers;
      organization.messagingTriggers = {
        milestone: { ...current.milestone, ...messagingTriggers.milestone },
        inactivity: { ...current.inactivity, ...messagingTriggers.inactivity },
        birthday: { ...current.birthday, ...messagingTriggers.birthday }
      };
    }

    if (customerInfo !== undefined && customerInfo !== null && typeof customerInfo === "object") {
      const current = organization.customerInfo.toObject?.() ?? organization.customerInfo;
      organization.customerInfo = { ...current, ...customerInfo };
    }

    if (menuEnabled !== undefined) {
      organization.menuEnabled = Boolean(menuEnabled);
    }

    await organization.save();

    // Settings drive both public outputs — tenant info and (via menuEnabled)
    // the public menu — so purge both keys on save.
    clearCache({ tenant: String(organization._id), kind: "publicTenant" });
    clearCache({ tenant: String(organization._id), kind: "publicMenu" });

    const company = await Company.findOne({ _id: organization.companyId });

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
        programResolved: resolveProgram(company, organization),
        programOverridden: getOverriddenFields(organization),
        companyProgramDefaults: company ? company.programDefaults : null,
        tierThresholds: organization.tierThresholds,
        messagingTriggers: organization.messagingTriggers,
        customerInfo: organization.customerInfo,
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

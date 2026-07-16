const {
  listAllPlans,
  listActivePlans,
  createPlan,
  updatePlan,
  archivePlan
} = require("../services/subscriptionPlanService");
const User = require("../models/User");

const getPublicPlans = async (req, res, next) => {
  try {
    const result = await listActivePlans();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getAdminPlans = async (req, res, next) => {
  try {
    const result = await listAllPlans();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postPlan = async (req, res, next) => {
  try {
    const { name, slug, priceNpr, businessLimit, features, isMostPopular, sortOrder } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await createPlan({
      name, slug, priceNpr, businessLimit, features, isMostPopular, sortOrder,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const patchPlan = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { name, priceNpr, businessLimit, features, isMostPopular, isActive, sortOrder } = req.body;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await updatePlan(slug, {
      name, priceNpr, businessLimit, features, isMostPopular, isActive, sortOrder,
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const deletePlan = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const actor = await User.findOne({ _id: req.user.id });
    const result = await archivePlan(slug, {
      actorId: req.user.id,
      actorName: actor ? actor.name : "Unknown"
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { getPublicPlans, getAdminPlans, postPlan, patchPlan, deletePlan };

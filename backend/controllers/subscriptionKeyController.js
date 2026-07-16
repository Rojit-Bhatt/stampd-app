const { generateKey, listKeys, revokeKey } = require("../services/subscriptionKeyService");

const postKey = async (req, res, next) => {
  try {
    const { planSlug, note } = req.body;
    const result = await generateKey({ planSlug, note, actorId: req.user.id });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const getKeys = async (req, res, next) => {
  try {
    const result = await listKeys();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const deleteKey = async (req, res, next) => {
  try {
    const { code } = req.params;
    const result = await revokeKey(code);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { postKey, getKeys, deleteKey };

const {
  listBroadcasts,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  getBroadcastDetail
} = require("../services/broadcastService");

const list = async (req, res, next) => {
  try {
    const data = await listBroadcasts(req.user.organizationId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const broadcast = await createBroadcast(req.user.organizationId, req.body);
    res.status(201).json({ success: true, broadcast });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const broadcast = await updateBroadcast(req.user.organizationId, req.params.id, req.body);
    res.status(200).json({ success: true, broadcast });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await deleteBroadcast(req.user.organizationId, req.params.id);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

const detail = async (req, res, next) => {
  try {
    const data = await getBroadcastDetail(req.user.organizationId, req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { list, create, update, remove, detail };

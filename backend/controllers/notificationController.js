const { listNotifications, markRead, markAllRead } = require("../services/notificationService");

const getNotifications = async (req, res, next) => {
  try {
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await listNotifications(req.user.organizationId, { unreadOnly, limit });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const postMarkRead = async (req, res, next) => {
  try {
    const ok = await markRead(req.user.organizationId, req.params.id);
    if (!ok) return res.status(404).json({ success: false, message: "Notification not found." });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

const postMarkAllRead = async (req, res, next) => {
  try {
    await markAllRead(req.user.organizationId);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getNotifications, postMarkRead, postMarkAllRead };

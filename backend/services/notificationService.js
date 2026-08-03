const Notification = require("../models/Notification");

// Fire-and-forget by design — every caller wraps this in `.catch(...)` and
// never awaits it into a response path. A notification-write failure must
// never be why a redemption or a signup itself fails.
const createNotification = async ({ organizationId, type, message }) => {
  await Notification.create({ organizationId, type, message });
};

const formatNotification = (doc) => ({
  id: doc._id.toString(),
  type: doc.type,
  message: doc.message,
  readAt: doc.readAt,
  createdAt: doc.createdAt
});

const listNotifications = async (organizationId, { unreadOnly = false, limit = 20 } = {}) => {
  const query = unreadOnly
    ? { organizationId, readAt: null }
    : { organizationId };

  const docs = await Notification.find(query).sort({ createdAt: -1 }).limit(limit);
  const unreadCount = (await Notification.find({ organizationId, readAt: null })).length;

  return {
    notifications: docs.map(formatNotification),
    unreadCount
  };
};

const markRead = async (organizationId, notificationId) => {
  const doc = await Notification.findOne({ _id: notificationId, organizationId });
  if (!doc) return false;
  doc.readAt = new Date();
  await doc.save();
  return true;
};

const markAllRead = async (organizationId) => {
  const unread = await Notification.find({ organizationId, readAt: null });
  const now = new Date();
  for (const doc of unread) {
    doc.readAt = now;
    await doc.save();
  }
};

module.exports = { createNotification, listNotifications, markRead, markAllRead };

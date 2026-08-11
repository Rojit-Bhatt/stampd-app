const Event = require("../models/Event");
const { claimImage, deleteImage } = require("./imageService");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// An uploaded image starts unowned. Saving the row that uses it claims it,
// and the row it replaced becomes unreachable — delete it rather than leave
// it to accumulate, which is what makes this an optimisation instead of a
// slower leak.
const applyImage = async ({ organizationId, ownerId, nextImageId, previousImageId }) => {
  if (nextImageId === previousImageId) return;
  if (nextImageId) {
    await claimImage({ id: nextImageId, organizationId, ownerId });
  }
  if (previousImageId) {
    await deleteImage({ id: previousImageId, organizationId });
  }
};

const listForOrg = async (organizationId) => {
  return Event.find({ organizationId }).sort({ date: 1 });
};

const createEvent = async (
  organizationId,
  { title, date, time, location, description, imageUrl, imageId, imagePositionY, rewards }
) => {
  if (!title) {
    throw createHttpError("Event title is required.", 400);
  }
  if (!date) {
    throw createHttpError("Event date is required.", 400);
  }

  const event = await Event.create({
    organizationId,
    title: title.trim(),
    date: new Date(date),
    time: time !== undefined ? time : "",
    location: location !== undefined ? location : "",
    description: description !== undefined ? description : "",
    imageUrl: imageUrl !== undefined ? imageUrl : "",
    imageId: imageId || null,
    imagePositionY: imagePositionY !== undefined ? imagePositionY : 50,
    rewards: rewards !== undefined ? rewards : []
  });

  await applyImage({
    organizationId, ownerId: event._id.toString(),
    nextImageId: event.imageId, previousImageId: null
  });

  return event;
};

// Only these fields may be changed via the API — never organizationId or
// _id, so an admin can't move an event into (or out of) another tenant.
const MUTABLE_EVENT_FIELDS = ["title", "date", "time", "location", "description", "imageUrl", "imageId", "imagePositionY", "rewards"];

const updateEvent = async (organizationId, eventId, updates) => {
  const existing = await Event.findOne({ _id: eventId, organizationId });
  if (!existing) {
    throw createHttpError("Event not found.", 404);
  }
  const previousImageId = existing.imageId || null;

  const safeUpdates = {};
  for (const field of MUTABLE_EVENT_FIELDS) {
    if (updates[field] !== undefined) {
      safeUpdates[field] = field === "date" ? new Date(updates[field]) : updates[field];
    }
  }

  const updatedEvent = await Event.findOneAndUpdate(
    { _id: eventId, organizationId },
    { $set: safeUpdates },
    { new: true }
  );

  if (!updatedEvent) {
    throw createHttpError("Event not found.", 404);
  }

  if (safeUpdates.imageId !== undefined) {
    await applyImage({
      organizationId, ownerId: updatedEvent._id.toString(),
      nextImageId: updatedEvent.imageId, previousImageId
    });
  }

  return updatedEvent;
};

const deleteEvent = async (organizationId, eventId) => {
  const existing = await Event.findOne({ _id: eventId, organizationId });
  if (!existing) {
    throw createHttpError("Event not found.", 404);
  }

  const result = await Event.deleteOne({ _id: eventId, organizationId });

  const deletedCount =
    result && typeof result.deletedCount === "number" ? result.deletedCount : 0;

  if (!deletedCount) {
    throw createHttpError("Event not found.", 404);
  }

  if (existing.imageId) {
    await deleteImage({ id: existing.imageId, organizationId });
  }

  return { success: true };
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const getUpcomingForOrg = async (organizationId, limit = 3) => {
  return Event.find({ organizationId, date: { $gte: startOfToday() } })
    .sort({ date: 1 })
    .limit(limit);
};

// No organizationId filter, no limit — the cross-tenant events feed
// (discoveryService.getUpcomingEventsFeed) applies its own cap AFTER
// dropping events whose outlet/company turns out to be inactive, so a limit
// here would be premature.
const getUpcomingAllOrgs = async () => {
  return Event.find({ date: { $gte: startOfToday() } }).sort({ date: 1 });
};

module.exports = {
  listForOrg,
  createEvent,
  updateEvent,
  deleteEvent,
  getUpcomingForOrg,
  getUpcomingAllOrgs
};

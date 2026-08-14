const { listForOrg, createEvent, updateEvent, deleteEvent } = require("../services/eventService");
const { clearCache } = require("../utils/responseCache");

// Events surface in the public tenant endpoint (upcomingEvents), which is
// cached — purge that key on any event write.
const purgeTenantCache = (orgId) => clearCache({ tenant: String(orgId), kind: "publicTenant" });

const listEvents = async (req, res, next) => {
  try {
    const events = await listForOrg(req.user.organizationId);
    res.status(200).json({ success: true, events });
  } catch (error) {
    next(error);
  }
};

const createEventController = async (req, res, next) => {
  try {
    const { title, date, time, location, description, imageUrl, imageId, imagePositionY, rewards } = req.body;
    const event = await createEvent(req.user.organizationId, {
      title,
      date,
      time,
      location,
      description,
      imageUrl,
      imageId,
      imagePositionY,
      rewards
    });
    purgeTenantCache(req.user.organizationId);
    res.status(201).json({ success: true, event });
  } catch (error) {
    next(error);
  }
};

const updateEventController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await updateEvent(req.user.organizationId, id, req.body);
    purgeTenantCache(req.user.organizationId);
    res.status(200).json({ success: true, event });
  } catch (error) {
    next(error);
  }
};

const deleteEventController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await deleteEvent(req.user.organizationId, id);
    purgeTenantCache(req.user.organizationId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listEvents,
  createEventController,
  updateEventController,
  deleteEventController
};

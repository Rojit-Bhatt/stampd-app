const { listForOrg, createEvent, updateEvent, deleteEvent } = require("../services/eventService");

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
    const { title, date, time, location, description, imageUrl, imageId } = req.body;
    const event = await createEvent(req.user.organizationId, {
      title,
      date,
      time,
      location,
      description,
      imageUrl,
      imageId
    });
    res.status(201).json({ success: true, event });
  } catch (error) {
    next(error);
  }
};

const updateEventController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const event = await updateEvent(req.user.organizationId, id, req.body);
    res.status(200).json({ success: true, event });
  } catch (error) {
    next(error);
  }
};

const deleteEventController = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await deleteEvent(req.user.organizationId, id);
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

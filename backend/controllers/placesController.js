const { autocompleteBusinesses } = require("../services/placesService");

// Thin: parse, call the service, format. Every decision about what is valid,
// what is billed and what is returned lives in the service.
const postPlacesAutocomplete = async (req, res, next) => {
  try {
    const results = await autocompleteBusinesses(req.body && req.body.input);
    res.json({ success: true, results });
  } catch (err) {
    if (err.status && err.code) {
      return res
        .status(err.status)
        .json({ success: false, code: err.code, message: err.message });
    }
    next(err);
  }
};

module.exports = { postPlacesAutocomplete };

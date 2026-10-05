// What a client is told about an error.
//
// 4xx errors are raised on purpose (createHttpError in every service) and
// their messages are written for the customer — "That email or password
// didn't match", "Not enough points — …", "Add your phone number…". They
// go out as-is in every environment. Hiding them (the old behaviour: every
// production message became "Internal Server Error") left customers with a
// scary non-answer and broke the claim page's message-based classification.
//
// 5xx is where internal detail lives (driver errors, duplicate-key text,
// upstream failures), so in production it is always generic. That only holds
// if nothing unexpected is tagged 4xx — see classifyAuthError below and the
// catch in tenantMiddleware.resolveTenant.
const errorResponseBody = (error, statusCode, { production }) => {
  let message;
  if (!production) {
    message = error.message || "Internal Server Error";
  } else if (statusCode < 500) {
    message = error.message || "Request failed";
  } else {
    message = "Internal Server Error";
  }
  return {
    success: false,
    message,
    ...(error.code ? { code: error.code } : {})
  };
};

// The auth middlewares' catch-all used to tag EVERY failure 401 — a MongoDB
// outage then read as "you are signed out" (and, once 4xx messages are
// shown, would have leaked driver text). Deliberate errors keep their
// status; JWT failures become a friendly 401; anything else is a 500.
const JWT_ERROR_NAMES = new Set(["JsonWebTokenError", "NotBeforeError"]);

const classifyAuthError = (error) => {
  if (error.statusCode) return error;
  if (error.name === "TokenExpiredError") {
    error.statusCode = 401;
    error.message = "Your session has expired. Please sign in again.";
  } else if (JWT_ERROR_NAMES.has(error.name)) {
    error.statusCode = 401;
    error.message = "Your session is invalid. Please sign in again.";
  } else {
    error.statusCode = 500;
  }
  return error;
};

module.exports = { errorResponseBody, classifyAuthError };

const { rateLimit } = require("express-rate-limit");

// Rate limiters for the unauthenticated, abuse-prone endpoints (login,
// register, forgot-password, resend-verification). Applied per-route, never
// globally — a global limiter would also throttle legitimate high-frequency
// traffic like the claim page's status poll.
//
// Store: the default in-memory MemoryStore, on purpose. It is correct for a
// single backend instance (what's deployed). If this ever scales to more than
// one instance behind a load balancer, each instance would keep its own
// counts and the effective limit would multiply by the instance count — at
// that point switch to a shared store (e.g. Redis). Not needed yet.
//
// Keying: express-rate-limit's default key is the client IP (IPv6-safe). In
// production the app sits behind Render's proxy, so server.js sets
// `trust proxy` there — without it every request would share the proxy's IP
// and the limiter would throttle globally. In dev/test (direct connections)
// the default socket IP is used, which is exactly what lets a single test
// process trip a threshold on purpose.

// Returns a handler that responds in this app's standard error shape
// ({success:false, message}) rather than express-rate-limit's default
// plain-text body, so the frontend's apiRequest (which parses JSON on error)
// surfaces a clean message instead of choking on a non-JSON 429.
const jsonHandler = (message) => (req, res) => {
  res.status(429).json({ success: false, message });
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Login attempts: has to tolerate normal typo retries, so a looser window.
const authLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many attempts. Please wait a few minutes and try again."),
});

// Account creation and email-triggering actions (register, forgot-password,
// resend-verification): legitimately rare per person, so a tighter cap that
// also throttles email-spam abuse.
const registrationLimiter = rateLimit({
  windowMs: HOUR,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many requests. Please wait a while and try again."),
});

// File uploads. Authenticated, so this is not about anonymous abuse — it's
// that each request carries up to 256KB that gets base64'd into memory and
// rewrites a row, and nothing in the product needs a customer to change their
// picture more than a handful of times an hour. Its own bucket rather than
// reusing registrationLimiter: sharing would let picture-fiddling burn the
// budget for password resets, which actually matter.
const uploadLimiter = rateLimit({
  windowMs: HOUR,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many uploads. Please wait a while and try again."),
});

module.exports = { authLimiter, registrationLimiter, uploadLimiter };

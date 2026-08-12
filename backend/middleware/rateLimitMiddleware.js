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

// Google Places lookups from the public /review-qr tool. Unauthenticated, on a
// marketing page, and every call that gets past the guards is billed by Google
// — so this is a cost control, not just an abuse control. Its own bucket
// rather than reusing authLimiter: a visitor hunting for their shop should
// never be able to burn the budget that protects the login endpoints.
const placesLimiter = rateLimit({
  windowMs: 5 * MINUTE,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many searches. Please wait a few minutes and try again."),
});

// 20 attempts / minute / IP, shared across verify-pin AND the two counter
// routes that re-verify a PIN inline.
//
// Its own bucket, never authLimiter's: a barista fumbling their PIN must not
// burn the budget that protects the login endpoints.
//
// 20/min is deliberately above what a busy counter does (a till generating a
// QR more than twenty times a minute is not a real till) and far below what a
// 10,000-value sweep needs — at 20/min an exhaustive search takes over eight
// hours of sustained traffic from a single IP against an endpoint that ALSO
// requires a valid tenant JWT for that exact outlet. The PIN is an
// attribution layer among people who already share a device and a login, not
// a perimeter; the perimeter is the JWT, and it is unchanged.
//
// `skip` is what makes it safe to hang this on the counter routes at all:
// only a request that actually CARRIES a pin consumes the budget. A request
// with no `pin` is not a PIN attempt and is not counted. This is NOT an
// optimisation: without it, every existing suite that generates QR codes in
// a loop (points-earn.js alone does eleven, integration-qa.js and
// multi-tenant-isolation.js more) would start tripping a limiter it has no
// idea exists — the same shared 127.0.0.1 bucket that rate-limiting.js
// relies on to trip deliberately. Skipping pin-less requests keeps the
// counter routes byte-identical for every outlet that hasn't turned PINs on.
// express.json() is mounted globally before every route in server.js, so
// req.body is populated by the time `skip` runs.
const pinLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => typeof req.body?.pin !== "string",
  handler: jsonHandler("Too many attempts. Please wait a minute and try again."),
});

// CSP violation reports are fire-and-forget: a misbehaving page can loop them
// (and report-uri spam is a known nuisance/DDoS vector), so cap this endpoint
// at 60/min per client. Its own bucket, never authLimiter's: the CSP endpoint
// is public and unauthenticated — it must not borrow state from anything
// privileged, and nothing privileged should share its state either.
const cspReportLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler("Too many CSP reports. Slow down."),
});

module.exports = { authLimiter, registrationLimiter, uploadLimiter, placesLimiter, pinLimiter, cspReportLimiter };

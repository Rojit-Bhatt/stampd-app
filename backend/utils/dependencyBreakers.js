// Shared circuit breaker instances for external dependencies called from
// hot, synchronous request paths. Shared (not per-call-site) so a dependency
// failing via one caller trips protection for every caller of it.
const { createCircuitBreaker, DependencyUnavailableError } = require("./circuitBreaker");

// Google's tokeninfo/certs endpoint, hit on every Google sign-in (customer
// and staff). Awaited directly in the login request path with no prior
// timeout — a slow/down Google leaves every Google-login request hanging.
const googleOAuthBreaker = createCircuitBreaker({
  name: "google-oauth-verify",
  timeoutMs: 5000,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  maxConcurrent: 20
});

// Brevo's transactional-email API — hit from login verification, customer
// registration, and the daily-trigger loop. Emails are best-effort from the
// customer's point of view (a failed verification email fails the flow with
// a retry, but notification emails just drop), so fast-failing on a dead
// Brevo keeps those request paths responsive.
const brevoEmailBreaker = createCircuitBreaker({
  name: "brevo-email",
  timeoutMs: 4000,
  failureThreshold: 4,
  resetTimeoutMs: 30000,
  maxConcurrent: 10
});

// Sparrow SMS — hit from triggers and Broadcast, always inside a user-facing
// request. Per-message sends must not hang the whole admin session.
const sparrowSmsBreaker = createCircuitBreaker({
  name: "sparrow-sms",
  timeoutMs: 5000,
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  maxConcurrent: 5
});

// Web-push delivery (VAPID) — hit once per eligible customer in the trigger
// loops and Broadcast, but each send is fire-and-forget, so the breaker's
// job is to stop piling up dead-endpoint sends rather than protect latency.
const pushNotificationBreaker = createCircuitBreaker({
  name: "webpush",
  timeoutMs: 3000,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  maxConcurrent: 20
});

// Google Places autocomplete — a keystroke-driven endpoint; callers get a
// 502 PLACES_UPSTREAM either way, but with a breaker the admin stops waiting
// on the full HTTP timeout while Google is down or slow.
const placesApiBreaker = createCircuitBreaker({
  name: "google-places",
  timeoutMs: 5000,
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  maxConcurrent: 10
});

// Google Places review proxy (maps.googleapis.com) — read-only, already
// swallows errors; the breaker just converts hangs into immediate empty
// review lists.
const googleReviewsBreaker = createCircuitBreaker({
  name: "google-reviews",
  timeoutMs: 5000,
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  maxConcurrent: 5
});

module.exports = {
  googleOAuthBreaker,
  brevoEmailBreaker,
  sparrowSmsBreaker,
  pushNotificationBreaker,
  placesApiBreaker,
  googleReviewsBreaker,
  DependencyUnavailableError
};

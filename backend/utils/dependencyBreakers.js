// Shared circuit breaker instances for external dependencies called from
// hot, synchronous request paths. Shared (not per-call-site) so a dependency
// failing via one caller trips protection for every caller of it.
const { createCircuitBreaker } = require("./circuitBreaker");

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

module.exports = { googleOAuthBreaker };

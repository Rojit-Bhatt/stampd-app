// Error tracking bridge (Phase 2 — G12 logging/alerting).
//
// SENTRY_DSN unset → capture() is a no-op and no external request is ever
// made. Setting the env var in production turns on Sentry with zero code
// changes. Tests always hit the no-op path (no DSN in test env).
let sentry = null;
const withSentry = async (fn) => {
  if (!process.env.SENTRY_DSN) return null;
  if (!sentry) {
    // Lazy load — the @sentry/node dependency ships only when tracking is
    // wanted, and nothing is imported before it's actually needed.
    try {
      // eslint-disable-next-line global-require
      sentry = await import("@sentry/node");
      sentry.init({ dsn: process.env.SENTRY_DSN });
    } catch (_) {
      // @sentry/node not installed — stay a silent no-op.
      return null;
    }
  }
  return fn(sentry);
};

const capture = (error, { context } = {}) => {
  void withSentry((s) => {
    s.captureException(error, { extra: context || {} });
  });
};

module.exports = { capture };

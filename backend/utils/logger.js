// Structured JSON logger (Phase 2 — G12 logging/alerting).
//
// console.log("something broke") gives operators nothing machine-readable to
// grep, alert, or ship to a log service. Every line below is one JSON object
// with a stable shape: {ts, level, module, msg, ...extra}. Log collectors
// (Render's log drain, Loki, a SIEM) parse it without heuristics.
//
// Kept as a plain wrapper — no dependency, no external call — because log
// shipping belongs to the environment (stderr → log drain), not the app.
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

// Respect LOG_LEVEL when set; defaults to info so tests and CI stay quiet.
const MIN_LEVEL = LEVELS[String(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;

const log = (level, module, msg, extra) => {
  if (LEVELS[level] < MIN_LEVEL) return;
  const entry = { ts: new Date().toISOString(), level, module, msg };
  if (extra && typeof extra === "object") Object.assign(entry, extra);
  const line = JSON.stringify(entry);
  // Errors go to stderr so container orchestrators flag them as error-level;
  // everything else stays on stdout, the conventional split.
  if (LEVELS[level] >= LEVELS.error) process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

module.exports = {
  debug: (module, msg, extra) => log("debug", module, msg, extra),
  info: (module, msg, extra) => log("info", module, msg, extra),
  warn: (module, msg, extra) => log("warn", module, msg, extra),
  error: (module, msg, extra) => log("error", module, msg, extra)
};

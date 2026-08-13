const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

// Boot the real server.js on its own port against the in-memory mock DB, and
// wait until it answers the health endpoint. Returns { baseUrl, stop } so a
// test suite is fully self-contained — no manually-started server required.
//
// server.js reads `process.env.PORT || 5001` and falls back to mockMongoose
// whenever MONGODB_URI is unset, so we just drive both via env.
//
// `env` sets/overrides additional vars for the child process (e.g. a dummy
// GOOGLE_CLIENT_ID so a test can deterministically exercise a code path that
// only runs when that var is configured, regardless of the developer's real
// .env). `deleteEnv` explicitly unsets vars (beyond the always-forced
// MONGODB_URI) so a test isn't accidentally affected by ambient shell env.
// `requireBeforeServer` (path, resolved against this helpers dir) lets one
// suite — csp-report-only.js — run the server in NODE_ENV=production:
// server.js refuses the in-memory mock DB in production (a deliberate
// guard against misconfigured deploys), so the child receives a non-empty
// MONGODB_URI and this bootstrap swaps mongoose for the mock module
// before server.js requires it. The guard stays intact for every other
// suite and for real deployments (no caller passes the option otherwise).
async function bootServer({ port = 5010, timeoutMs = 15000, env: envOverrides = {}, deleteEnv = [], requireBeforeServer = null } = {}) {
  const serverPath = path.resolve(__dirname, "../../server.js");
  const baseUrl = `http://localhost:${port}`;

  const env = { ...process.env, PORT: String(port), ...(requireBeforeServer ? { MOCK_MONGOOSE: "1" } : {}) };
  // Default to the fast, deterministic console-log email stub unless a test
  // explicitly opts into real SMTP via `env: { SMTP_HOST: ... }` — otherwise
  // a real SMTP_HOST configured in backend/.env for normal dev use would
  // make every test that registers/verifies a customer try to send a real
  // email through it.
  if (!("SMTP_HOST" in envOverrides)) env.SMTP_HOST = "";
  Object.assign(env, envOverrides);
  // Force the zero-config in-memory mock DB, always, never overridable —
  // must be an explicit empty string, not `delete`: server.js's
  // `require("dotenv").config()` runs inside the child and only skips a var
  // that's already *defined* in process.env; a deleted (undefined) var gets
  // silently refilled from backend/.env on disk (e.g. a real MONGODB_URI set
  // there for normal dev use), which would point tests at a real database.
  env.MONGODB_URI = requireBeforeServer ? (envOverrides.MONGODB_URI || "mongodb://in-memory-fallback") : "";
  for (const key of deleteEnv) delete env[key];

  const args = requireBeforeServer
    ? ["-r", path.resolve(__dirname, requireBeforeServer), serverPath]
    : [serverPath];
  const child = spawn("node", args, {
    env,
    cwd: path.resolve(__dirname, "../.."),
  });

  child.stdout.on("data", (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[server:${port}] ${line}`);
  });
  child.stderr.on("data", (d) => {
    const line = d.toString().trim();
    if (line) console.error(`[server:${port}] ${line}`);
  });

  const stop = () => {
    try {
      child.kill();
    } catch (_) {
      // already gone
    }
  };

  // Poll the health endpoint until it responds or we time out.
  const deadline = Date.now() + timeoutMs;
  const ping = () =>
    new Promise((resolve) => {
      const req = http.get(baseUrl + "/", (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });

  while (Date.now() < deadline) {
    if (await ping()) {
      return { baseUrl, stop };
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  stop();
  throw new Error(`Test server did not become ready on ${baseUrl} within ${timeoutMs}ms.`);
}

module.exports = { bootServer };

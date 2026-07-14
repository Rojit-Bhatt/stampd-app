const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

// Boot the real server.js on its own port against the in-memory mock DB, and
// wait until it answers the health endpoint. Returns { baseUrl, stop } so a
// test suite is fully self-contained — no manually-started server required.
//
// server.js reads `process.env.PORT || 5001` and falls back to mockMongoose
// whenever MONGODB_URI is unset, so we just drive both via env.
async function bootServer({ port = 5010, timeoutMs = 15000 } = {}) {
  const serverPath = path.resolve(__dirname, "../../server.js");
  const baseUrl = `http://localhost:${port}`;

  const env = { ...process.env, PORT: String(port) };
  delete env.MONGODB_URI; // force the zero-config in-memory mock DB

  const child = spawn("node", [serverPath], {
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

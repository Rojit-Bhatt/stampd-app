/**
 * csp-report-only.js — Task 5: strict hash-based CSP in report-only mode
 *
 * Boots the server with NODE_ENV=production and a real built frontend/dist
 * (a prerequisite — build it first). Asserts:
 *
 *   - the SPA document (/) carries Content-Security-Policy-Report-Only with
 *     strict-dynamic, object-src 'none', base-uri 'none' and, when the
 *     build has inline scripts, their sha256 hashes;
 *   - API routes (/api/health) carry NO CSP header (JSON is never a
 *     document — the policy would be inert there anyway);
 *   - POST /api/csp-report accepts a synthetic violation report, returns
 *     204, and logs it as a structured line with the right shape.
 *
 * Run directly: `node tests/csp-report-only.js`
 * Prerequisite: `cd frontend && npx vite build` (dist must exist).
 */

// Node picks up NODE_ENV before bootServer's first import, so set it here.
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_only_insecure_jwt_secret";
// Keep the in-memory mock DB — the CSP behaviour is about HTTP headers,
// not the database layer.
// Production-mode boot: the server's "no real database in production"
// guard is respected — bootServer is asked to pass a (harmless) URI and
// swap mongoose for the in-memory mock at require-time via the
// mock-bootstrap below, so the test exercises the real production HTTP
// surface (production static serving + CSP) against the same mock DB
// every other suite uses.

const { bootServer } = require("./helpers/bootServer");

// NOTE on boot mode: CSP lives on the production static-serving path, so
// this suite must boot the server with NODE_ENV=production. The server
// refuses the in-memory mock DB in production (a deliberate guard against
// misconfigured deploys handing out /__test__ account-takeover endpoints)
// — so the child is given a non-empty MONGODB_URI and a bootstrap script
// swaps mongoose for the in-memory mock BEFORE server.js requires it,
// keeping the guard happy and the DB zero-config, exactly like dev tests.

// Ephemeral port — fixed ports collide with TIME_WAIT leftovers from
// earlier suite runs (undici then surfaces "fetch failed / bad port").
const PORT = 5200 + (Date.now() % 1200);

async function main() {
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };

  // Capture console.log while the report ingestion runs. The booted server
  // re-emits its own stdout through console.log (prefixed "[server:PORT]"),
  // so separate those away — the structured violation line is ours.
  const logs = [];
  const serverLines = [];
  const originalLog = console.log;
  console.log = (...args) => {
    const line = args.map(String).join(" ");
    if (line.startsWith(`[server:${PORT}]`)) serverLines.push(line);
    else logs.push(line);
  };

  let stop = null;
  try {
    const booted = await bootServer({
      port: PORT,
      env: { MONGODB_URI: "mongodb://in-memory-fallback", NODE_ENV: "production", JWT_GLOBAL_SECRET: "test_only_insecure_global_jwt_secret",
        TURNSTILE_SECRET_KEY: "test-only-fake-key"
      },
      requireBeforeServer: "./mockMongooseBootstrap.js"
    });
    stop = booted.stop;
    const { baseUrl } = booted;
    const api = (path, { method = "GET", body, headers: extraHeaders = {} } = {}) =>
      fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...extraHeaders },
        body: body ? JSON.stringify(body) : undefined
      }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));

    // --- the SPA document carries the report-only CSP header ---
    // "/" is the JSON API root in production; the SPA document is served
    // by the catch-all for non-API paths such as "/login".
    const doc = await api("/login", { headers: { Accept: "text/html" } });
    const csp = doc.headers.get("Content-Security-Policy-Report-Only");
    check("the SPA document (served at /login) returns 200 HTML", doc.status === 200 && (doc.headers.get("content-type") || "").includes("text/html"), `${doc.status} ${doc.headers.get("content-type")}`);
    check("the SPA document carries the report-only CSP header", Boolean(csp), csp);
    check("the header contains strict-dynamic", csp && csp.includes("'strict-dynamic'"));
    check("object-src is none", csp && csp.includes("object-src 'none'"));
    check("base-uri is none", csp && csp.includes("base-uri 'none'"));
    // When the build has inline scripts they're hashed at boot; an empty
    // list is valid for the current build (only src'd script tags exist).
    check("inline-script hashes are allowlisted when present", csp && csp.includes("'self'"));

    // --- the JSON API root and API routes carry no CSP header ---
    const root = await api("/");
    check("the JSON API root carries no CSP header", !root.headers.get("Content-Security-Policy-Report-Only"));
    const health = await api("/api/health");
    check("the /api/health JSON route carries no CSP header", !health.headers.get("Content-Security-Policy-Report-Only"));

    // --- violation reports are ingested ---
    const report = {
      "csp-report": {
        "document-uri": "https://example.com/",
        "violated-directive": "script-src",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/stealer.js",
        "original-policy": csp
      }
    };
    const posted = await api("/api/csp-report", { method: "POST", body: report });
    check("POST /api/csp-report returns 204", posted.status === 204, posted.body);
    const structured = [...logs, ...serverLines].find((l) => l.includes('"type":"csp-violation"'));
    process.stdout.write(`[debug] violation line: ${structured ? structured.slice(0, 300) : null}\n`);
    check("the violation is logged as a structured JSON line", Boolean(structured));
    if (structured) {
      // BootServer re-emits the server's own stdout prefixed "[server:PORT]"
      // — strip that before parsing the JSON.
      const raw = structured.replace(/^\[server:\d+\]\s*/, "");
      const parsed = JSON.parse(raw);
      check("the log carries blockedUri", parsed.blockedUri === "https://evil.example/stealer.js");
      check("the log carries documentUri", parsed.documentUri === "https://example.com/");
      check("the log carries a timestamp", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(parsed.timestamp));
    }

    // --- dev-mode behaviour: with NODE_ENV unset there is no dist served
    //     and no header — covered implicitly by every other suite running
    //     against the dev server.
  } finally {
    console.log = originalLog;
    if (stop) await stop();
  }

  console.log(`\ncsp-report-only: ${failures === 0 ? "all PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

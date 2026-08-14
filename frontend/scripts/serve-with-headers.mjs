// Local-only harness for verifying frontend/public/_headers.
//
// Cloudflare Pages applies _headers; `vite preview` does not. This serves the
// real production build with the _headers CSP applied verbatim, so a browser
// load reports exactly the violations the deployed site would.
//
// Not part of the app or the deploy. Run via .claude/launch.json.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const HEADERS_FILE = new URL("../public/_headers", import.meta.url).pathname;
const PORT = 4178;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};

// Pull every "Name: value" line out of the single `/*` block in _headers.
const raw = await readFile(HEADERS_FILE, "utf8");
const headers = raw
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && !line.startsWith("/"))
  .map((line) => {
    const at = line.indexOf(":");
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // The CSP's report-uri points at /api/csp-report. Answer it the way the
  // real collector does so the count of these requests is the metric.
  if (url.pathname === "/api/csp-report") {
    let n = 0;
    req.on("data", () => { n++; });
    req.on("end", () => {
      console.log(`CSP-REPORT received (${n} chunks)`);
      res.writeHead(204).end();
    });
    return;
  }

  for (const [name, value] of headers) res.setHeader(name, value);

  const rel = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, rel === "/" ? "index.html" : rel);
  let body;
  try {
    body = await readFile(file);
  } catch {
    file = join(DIST, "index.html"); // SPA fallback
    body = await readFile(file);
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  res.writeHead(200).end(body);
}).listen(PORT, () => console.log(`serving dist with _headers on http://localhost:${PORT}`));

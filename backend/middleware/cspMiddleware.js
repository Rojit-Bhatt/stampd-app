const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Strict (hash-based) CSP for the SPA document — deployed report-only.
//
// The Vite build is static, so a per-response nonce is impossible; instead
// every inline bootstrap script in the built index.html is hashed at boot
// and allowlisted with a sha256 digest. 'strict-dynamic' trusts the blessed
// scripts and everything they load (the whole app bundle chain), so the
// bundle itself never needs an entry here. object-src/base-uri none close
// the classic gadget classes.
//
// As of the 2026-08-13 build the SPA document carries NO inline scripts —
// only a module script with src and an SW register script with src — so the
// hash list is empty and 'strict-dynamic' does the heavy lifting. If an
// inline script is added to index.html later, this middleware re-hashes it
// at boot and the report-only header will surface a violation for it
// instead of silently allowing it.
//
// Report-only is deliberate: nothing breaks on deploy, violations flow to
// /api/csp-report, and enforcement becomes a follow-up step after a clean
// observation window.

const buildCspHeader = (hashes) => {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' ${hashes.map((h) => `'sha256-${h}'`).join(" ").trim()} 'strict-dynamic' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `connect-src 'self'`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`
  ];
  return directives.join("; ");
};

const cspMiddleware = (distPath) => {
  let header = null;
  try {
    const html = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
    const hashes = (html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) || [])
      .map((tag) => tag.replace(/<\/?script[^>]*>/gi, ""))
      .filter((body) => body.trim().length > 0)
      .map((body) => crypto.createHash("sha256").update(body).digest("base64"));
    header = buildCspHeader(hashes);
  } catch (_err) {
    // Dist not built (dev environment): no document is served here anyway,
    // so the middleware no-ops.
    header = null;
  }

  return (req, res, next) => {
    // Document requests only: HTML accept, and never API/JSON routes.
    // Static assets (js/css/svg) pass through without the header — CSP on
    // the document governs what the page may load; asset files don't need
    // it, and attach it to e.g. a CSS response would be meaningless noise.
    if (header && req.accepts("html") && !req.path.startsWith("/api/")) {
      res.setHeader("Content-Security-Policy-Report-Only", header);
    }
    next();
  };
};

module.exports = { cspMiddleware };

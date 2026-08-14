"use strict";
// Response cache for shared, infrequently-changing API output.
//
// The frontend is a pure client-side SPA: its "pages" load by fetching JSON
// from the API. Caching those shared responses (public menu, tenant info,
// public plans) at the API layer is the equivalent of page/fragment caching.
//
// Design invariants:
// - Keys include tenant (company+outlet) and locale, so variations can never
//   be served to the wrong tenant or language.
// - Cached bodies are plain JS objects (uncompressed). Express still runs
//   `compression()` AFTER the cache layer, so JSON/HTML responses get exactly
//   one compression pass — no double-compression, per the transit task.
// - Personalized output (balances, notifications, auth, dashboards) is NOT
//   cached here — only output identical across users, changed only by edits.
// - Edge caching of static assets stays Cloudflare's job (see
//   frontend/wrangler.jsonc). This covers the dynamic JSON the CDN cannot
//   hold, and Cache-Control: public, max-age=300 lets Cloudflare cache these
//   too when it fronts the API.

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

let store = new Map();

/** Reset all cached entries. Exposed for tests and full-site purges. */
function clearCache(opts = {}) {
  if (!opts.tenant && !opts.kind) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (opts.tenant && !key.includes(`tenant:${opts.tenant}`)) continue;
    if (opts.kind && !key.includes(`kind:${opts.kind}`)) continue;
    store.delete(key);
  }
}

function tenantKey(req) {
  // resolveTenant annotates req with the resolved tenant; req.organizationId
  // is that outlet's id (tenantMiddleware.js) — the tenant scope used
  // everywhere else in the codebase, so cache keys join it exactly.
  const t = req.organizationId || req.companyId || "";
  return t ? String(t) : "global";
}

/** Build the cache key from request + options. */
function cacheKey(req, opts) {
  const tenant = opts.tenantKey ? opts.tenantKey(req) : tenantKey(req);
  const locale = (opts.localeKey && opts.localeKey(req)) || req.headers["accept-language"] || "default";
  const parts = [`kind:${opts.kind}`, `tenant:${tenant}`, `locale:${locale}`];
  if (opts.extraKey) parts.push(opts.extraKey(req));
  return parts.join("|");
}

/**
 * Express middleware. Serves cached JSON for GET requests; on a miss, runs
 * the wrapped handler, caches its response body, and serves next reads.
 *
 *   router.get("/", cacheMiddleware({ kind: "publicMenu", ttlMs: 600_000 }));
 */
function cacheMiddleware({ kind, ttlMs = DEFAULT_TTL_MS, tenantKey: tenantKeyFn, localeKey, extraKey } = {}) {
  return function responseCache(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const key = cacheKey(req, { kind, tenantKey: tenantKeyFn, localeKey, extraKey });
    const entry = store.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      // Cache-Control: short max-age — Cloudflare (or any CDN) can re-serve
      // this exact response until the server purges the key on content edits.
      // The header value mirrors the TTL so stale edge copies can't outlive
      // the server's copy.
      res.set("Cache-Control", `public, max-age=${Math.round(ttlMs / 1000)}`);
      return res.json(entry.body);
    }
    // Intercept res.json to capture the body for future cache hits.
    const originalJson = res.json.bind(res);
    res.json = function cachedJson(body) {
      const code = res.statusCode >= 200 && res.statusCode < 300;
      if (code && !res.headersSent) {
        store.set(key, { body: typeof body === "string" ? { data: body } : body, expiresAt: Date.now() + ttlMs });
        res.set("Cache-Control", `public, max-age=${Math.round(ttlMs / 1000)}`);
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { cacheMiddleware, clearCache };

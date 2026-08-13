// stampd Cloudflare Worker — static SPA + API proxy.
//
// Serves the React SPA from Static Assets and forwards every /api/* request
// to the real backend (Render), with the same path + query string + method
// + headers + body. This keeps the site usable at stampdd.club even when the
// Vite build carries an empty VITE_API_BASE_URL: the browser's relative
// /api/* calls land here and get proxied instead of hitting the SPA.
//
// The proxy is deliberately simple and stateless: no caching, no header
// mangling, no auth — the backend is the source of truth and already sets
// its own CORS/Cache-Control headers.
const API_ORIGIN = "https://api.stampdd.club";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, API_ORIGIN);
      const proxyHeaders = new Headers(request.headers);
      // The host header must belong to the target origin.
      proxyHeaders.set("Host", target.host);
      // Cloudflare injects cf-connecting-ip et al. — keep them, the backend
      // trusts Cloudflare as its proxy layer.
      const method = request.method;
      // Buffer the body before re-issuing: passing a Request's streaming body
      // straight into a second fetch is what made proxied POSTs hang on
      // Cloudflare's edge (the outbound request then waits for a stream that
      // was already consumed once). Text is safe for our JSON+form API.
      const rawBody = ["GET", "HEAD"].includes(method) ? undefined : await request.text();
      if (rawBody !== undefined) {
        proxyHeaders.set("Content-Length", String(new TextEncoder().encode(rawBody).length));
      }
      return fetch(target.toString(), {
        method,
        headers: proxyHeaders,
        body: rawBody,
        redirect: "manual",
      });
    }
    // Everything else — SPA shell, JS/CSS assets, images — from Static Assets.
    return env.ASSETS.fetch(request);
  },
};

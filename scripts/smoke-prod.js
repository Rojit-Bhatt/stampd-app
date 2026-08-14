#!/usr/bin/env node
// Production smoke test — verifies the LIVE deployment end-to-end, exactly
// the class of outage that went unnoticed for two hours on 2026-08-13:
// the Cloudflare frontend lost its /api proxy, so every API call from the
// website returned the SPA HTML and all features silently failed.
//
// This script catches that scenario in seconds by asserting what the live
// stack must answer as:
//   - https://SITE/               -> SPA index.html (text/html, 200)
//   - https://SITE/api/company/me -> JSON (401 without a token is correct)
//   - https://SITE/api/tenant?with tenant headers -> real tenant JSON (200)
//   - OPTIONS preflight to /api   -> 204 with CORS allow-origin header
//   - https://API_BASE/health     -> {"status":"ok"} (200)
//
// Usage:
//   SITE=https://stampdd.club API_BASE=https://api.stampdd.club node scripts/smoke-prod.js
//   SITE=... API_BASE=... node scripts/smoke-prod.js company drgn cofeesarowar
//
// Exits 0 only when every check passes; exits 1 with a per-check report
// otherwise — safe to run in CI after deployments. The tenant check uses
// TENANT_COMPANY/TENANT_OUTLET env vars (defaults: drgn / cofeesarowar) so
// it can run against any tenant without secrets; public tenant info is, by
// design, unauthenticated.

const SITE = process.env.SITE || "https://stampdd.club";
const API_BASE = process.env.API_BASE || "https://api.stampdd.club";
const TENANT_COMPANY = (process.env.TENANT_COMPANY || "drgn").toLowerCase();
const TENANT_OUTLET = (process.env.TENANT_OUTLET || "cofeesarowar").toLowerCase();

const isJson = (ct) => typeof ct === "string" && ct.includes("application/json");
const isHtml = (ct) => typeof ct === "string" && ct.includes("text/html");

async function fetchStatus(url, opts = {}) {
  try {
    const res = await fetch(url, { method: opts.method || "GET", headers: opts.headers, redirect: "manual" });
    const body = await res.text().catch(() => "");
    return { ok: true, status: res.status, contentType: res.headers.get("content-type") || "", body };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

async function main() {
  const checks = [];
  const pass = (name, ok, detail) => checks.push({ name, ok, detail });

  // 1. The website itself still serves the SPA.
  const home = await fetchStatus(SITE + "/");
  pass("SPA serves index.html", home.ok && home.status === 200 && isHtml(home.contentType));

  // 2. API calls reach the backend as JSON — NOT the SPA HTML.
  //    401 without a token is the correct backend answer; HTML 200 would
  //    mean the /api proxy is gone and the site is disconnected (the 2026
  //    outage signature).
  const apiMe = await fetchStatus(SITE + "/api/company/me");
  pass("GET /api/company/me returns JSON", apiMe.ok && isJson(apiMe.contentType) && [401, 403].includes(apiMe.status));

  const apiOutlets = await fetchStatus(SITE + "/api/company/outlets");
  pass("GET /api/company/outlets returns JSON", apiOutlets.ok && isJson(apiOutlets.contentType) && [401, 403].includes(apiOutlets.status));

  // 3. Public tenant resolution works through the site (real JSON body,
  //    not HTML). Uses the public /api/tenant endpoint with tenant slugs.
  const tenantUrl = `${API_BASE}/api/tenant`;
  const tenant = await fetchStatus(tenantUrl, {
    headers: {
      "X-Company-Slug": TENANT_COMPANY,
      "X-Outlet-Slug": TENANT_OUTLET,
    },
  });
  let tenantData = null;
  try {
    tenantData = tenant.ok ? JSON.parse(tenant.body) : null;
  } catch {
    tenantData = null;
  }
  pass(
    `GET /api/tenant (${TENANT_COMPANY}/${TENANT_OUTLET}) returns the real tenant`,
    tenant.ok && tenant.status === 200 && tenantData?.success === true && tenantData?.tenant?.slug === TENANT_OUTLET
  );

  // 4. The browser's preflight (CORS) handshake succeeds — browsers will
  //    block every authenticated request if this fails.
  const preflight = await fetchStatus(SITE + "/api/company/me", {
    method: "OPTIONS",
    headers: { Origin: SITE, "Access-Control-Request-Method": "GET" },
  });
  pass("OPTIONS preflight returns CORS allow-origin", preflight.ok && preflight.status === 204);

  // 5. The backend itself is healthy.
  const health = await fetchStatus(API_BASE + "/health");
  pass("Backend /health is ok", health.ok && health.status === 200 && health.body.includes('"status":"ok"'));

  let failed = 0;
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : " — " + (c.detail || "(no detail)")}`);
    if (!c.ok) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main();

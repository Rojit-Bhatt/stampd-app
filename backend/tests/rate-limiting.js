/**
 * Rate limiting suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms the two limiters (rateLimitMiddleware) actually
 * throttle their endpoints past the threshold with the app's JSON error
 * shape, that the two limiters are independent buckets, and that an
 * un-limited endpoint is never throttled no matter how hard it's hit.
 *
 * All requests here come from 127.0.0.1 (trust proxy is off outside
 * production), so they share one IP bucket — which is exactly what lets a
 * single test process trip a per-IP threshold. The library's IP-extraction
 * itself is express-rate-limit's well-tested default and isn't re-tested here.
 *
 * Run directly: `node tests/rate-limiting.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    // --- An un-limited endpoint is never throttled -------------------
    // Do this FIRST, before any bucket is tripped: /api/tenant carries no
    // limiter, so hammering it well past both thresholds must stay 200.
    console.log("\n== An un-limited endpoint is never throttled ==");
    let tenantThrottled = false;
    for (let i = 0; i < 25; i += 1) {
      const r = await api("/api/tenant", { slug: SLUG });
      if (r.status === 429) { tenantThrottled = true; break; }
    }
    check("25 hits on the public /api/tenant, never a 429", tenantThrottled === false);

    // --- registrationLimiter: 10 / hour ------------------------------
    // forgot-password always 200s ("if that account exists…") and creates
    // nothing, so it's the safe endpoint to hammer.
    console.log("\n== registrationLimiter throttles at 10 ==");
    let regStatuses = [];
    for (let i = 0; i < 11; i += 1) {
      const r = await api("/api/customer-auth/forgot-password", {
        method: "POST", body: { email: `nobody${i}@example.com` },
      });
      regStatuses.push(r.status);
    }
    check("the first 10 forgot-password requests pass", regStatuses.slice(0, 10).every((s) => s === 200), regStatuses);
    const reg11 = await api("/api/customer-auth/forgot-password", { method: "POST", body: { email: "nobody@example.com" } });
    check("the 11th+ is throttled -> 429", reg11.status === 429, reg11);
    check("...with the app's JSON error shape, not plain text", reg11.body?.success === false && typeof reg11.body?.message === "string", reg11.body);

    // --- authLimiter: 20 / 15 min, independent bucket ----------------
    console.log("\n== authLimiter throttles at 20, independently of registrationLimiter ==");
    // Even though registrationLimiter is already tripped above, authLimiter
    // is a separate bucket — the first login must still go through.
    const first = await api("/api/platform/login", { method: "POST", body: { email: "admin@stampd.co", password: "wrong" } });
    check("login still works while the OTHER limiter is tripped (separate buckets)", first.status === 401, first);

    // We've now used 1 of the 20. Nineteen more reach the limit; the 21st trips.
    let authStatuses = [first.status];
    for (let i = 0; i < 19; i += 1) {
      const r = await api("/api/platform/login", { method: "POST", body: { email: "admin@stampd.co", password: "wrong" } });
      authStatuses.push(r.status);
    }
    check("the first 20 login attempts are the normal 401, not throttled", authStatuses.every((s) => s === 401), authStatuses);
    const auth21 = await api("/api/platform/login", { method: "POST", body: { email: "admin@stampd.co", password: "wrong" } });
    check("the 21st login attempt is throttled -> 429", auth21.status === 429, auth21);
    check("...also in the app's JSON error shape", auth21.body?.success === false && typeof auth21.body?.message === "string", auth21.body);
  } finally {
    stop();
  }

  if (failures) { console.error(`\nrate-limiting: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\nrate-limiting: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

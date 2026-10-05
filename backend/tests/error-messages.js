/**
 * Client-error messages suite.
 *
 * The production error handler replaced EVERY message with "Internal
 * Server Error" — including the deliberate 4xx ones customers need ("That
 * email or password didn't match", "Not enough points — …", "Add your phone
 * number…"). It must hide details only for real server errors (5xx).
 *
 * That only works if nothing unexpected arrives as a 4xx, so the auth and
 * tenant middlewares' catch-alls must classify instead of blanket-tagging:
 * JWT failures -> 401 with a friendly message; anything else (DB outage,
 * driver error) -> 500, hidden.
 *
 * Run directly: `node tests/error-messages.js`
 */

const { errorResponseBody, classifyAuthError } = require("../utils/errorResponse");
const { bootServer } = require("./helpers/bootServer");

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
};

const httpError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });

// --- errorResponseBody: production ---
{
  const prod = { production: true };
  const wrongPassword = errorResponseBody(httpError("That email or password didn't match — try again.", 401), 401, prod);
  check("prod: 4xx keeps its message", wrongPassword.message === "That email or password didn't match — try again.", wrongPassword);
  const phone = errorResponseBody(httpError("Add your phone number before earning points.", 400, "PHONE_REQUIRED"), 400, prod);
  check("prod: 4xx keeps its code", phone.code === "PHONE_REQUIRED" && phone.message.startsWith("Add your phone"), phone);
  const crash = errorResponseBody(new Error("E11000 duplicate key error collection: users index: organizationId_1_email_1"), 500, prod);
  check("prod: 5xx is generic", crash.message === "Internal Server Error", crash);
  const upstream = errorResponseBody(httpError("Google sign-in is temporarily unavailable. Please try again shortly.", 503), 503, prod);
  check("prod: deliberate 5xx (503) is still generic", upstream.message === "Internal Server Error", upstream);
  const empty = errorResponseBody(httpError("", 404), 404, prod);
  check("prod: 4xx with no message gets a generic client message", empty.message === "Request failed", empty);
  check("shape: success:false", wrongPassword.success === false && crash.success === false);
}

// --- errorResponseBody: dev ---
{
  const dev = errorResponseBody(new Error("boom detail"), 500, { production: false });
  check("dev: 5xx shows the detail", dev.message === "boom detail", dev);
}

// --- classifyAuthError ---
{
  const expired = classifyAuthError(Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" }));
  check("expired JWT -> 401, friendly", expired.statusCode === 401 && /expired/i.test(expired.message) && expired.message !== "jwt expired", expired.message);
  const bad = classifyAuthError(Object.assign(new Error("invalid signature"), { name: "JsonWebTokenError" }));
  check("bad JWT -> 401, friendly", bad.statusCode === 401 && bad.message !== "invalid signature", bad.message);
  const db = classifyAuthError(Object.assign(new Error("connection <monitor> to 10.0.0.1:27017 closed"), { name: "MongoNetworkError" }));
  check("DB failure in auth -> 500 (not 'signed out')", db.statusCode === 500, db.statusCode);
  const deliberate = classifyAuthError(httpError("This business is suspended.", 401, "TENANT_SUSPENDED"));
  check("deliberate auth error keeps its status/message/code", deliberate.statusCode === 401 && deliberate.code === "TENANT_SUSPENDED" && deliberate.message === "This business is suspended.");
}

async function server() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  try {
    const garbage = await fetch(`${baseUrl}/api/points/balance`, { headers: { Authorization: "Bearer not-a-jwt" } });
    const body = await garbage.json();
    check("garbage tenant JWT -> 401 with a readable message", garbage.status === 401 && body.message && !/jwt malformed/i.test(body.message), body);
    const garbageGlobal = await fetch(`${baseUrl}/api/customer-auth/me`, { headers: { Authorization: "Bearer not-a-jwt" } });
    check("garbage global session -> 401", garbageGlobal.status === 401);
    const noTenant = await fetch(`${baseUrl}/api/tenant`);
    check("missing tenant headers -> still 400", noTenant.status === 400);
  } finally {
    await stop();
  }
}

server()
  .catch((err) => { console.error("Suite crashed:", err); failures++; })
  .finally(() => {
    if (failures > 0) {
      console.error(`\n${failures} check(s) failed.`);
      process.exit(1);
    }
    console.log("\nAll error-message checks passed.");
  });

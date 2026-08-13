// TEST BOOTSTRAP ONLY — used by csp-report-only.js to boot the server in
// NODE_ENV=production against the in-memory mock DB.
//
// server.js refuses the in-memory fallback in production (a deliberate
// guard: a misconfigured deploy must not silently serve the unauthenticated
// /__test__ account-takeover routes). That guard exists for DEPLOYS, not
// for tests — a test passing an explicit MONGODB_URI to reach the
// production HTTP surface (static serving, CSP header) should still get
// the fast, deterministic mock DB. So this module swaps "mongoose" for the
// in-memory mock BEFORE server.js requires it (passed via `node -r`),
// leaving the guard untouched for every real deployment.

const path = require("path");
const Module = require("module");

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "mongoose") {
    return originalRequire.call(this, path.resolve(__dirname, "../../utils/mockMongoose"));
  }
  return originalRequire.apply(this, arguments);
};

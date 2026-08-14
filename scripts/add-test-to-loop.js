#!/usr/bin/env node
// Adds the turnstile-removal regression suite to the backend test loop.
// Usage: node scripts/add-test-to-loop.js
const fs = require("fs");
const path = require("path");
const pkgPath = path.resolve(__dirname, "../backend/package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const t = pkg.scripts.test;
if (t.includes("turnstile-removal")) {
  console.log("turnstile-removal already in test loop");
} else {
  pkg.scripts.test = t.replace(
    "node tests/health-endpoint.js",
    "node tests/turnstile-removal.js && node tests/health-endpoint.js",
  );
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log("turnstile-removal added to test loop (before health-endpoint)");
}

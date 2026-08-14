#!/usr/bin/env node
// Validate a jsonc file by stripping // line comments that appear outside
// quoted strings (handles escaped quotes inside strings), then JSON.parse.
// Usage: node check-jsonc.js <file>
const fs = require("fs");
const file = process.argv[2];
if (!file) { console.error("usage: check-jsonc.js <file>"); process.exit(1); }
const raw = fs.readFileSync(file, "utf8");
let out = "";
let inStr = false;
for (let i = 0; i < raw.length; i++) {
  const c = raw[i];
  if (inStr) {
    out += c;
    if (c === '"' && raw[i - 1] !== "\\") inStr = false;
    continue;
  }
  if (c === '"') { inStr = true; out += c; continue; }
  if (c === "/" && raw[i + 1] === "/") {
    while (i < raw.length && raw[i] !== "\n") i++;
    out += " ";
    continue;
  }
  out += c;
}
try {
  JSON.parse(out);
  console.log(`PASS ${file} is valid jsonc`);
} catch (err) {
  console.error(`FAIL ${file}: ${err.message}`);
  process.exit(1);
}

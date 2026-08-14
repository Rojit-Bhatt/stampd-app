#!/usr/bin/env node
// Show exactly what characters surround a failing JSON parse position,
// after the same comment-stripping the check-jsonc.js script does.
const fs = require("fs");
const raw = fs.readFileSync(process.argv[2], "utf8");
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
  console.log("VALID");
} catch (err) {
  const pos = Number(String(err.message).match(/position (\d+)/)?.[1]);
  console.log("context before:", JSON.stringify(out.slice(pos - 120, pos)));
  console.log("context after:", JSON.stringify(out.slice(pos, pos + 120)));
}

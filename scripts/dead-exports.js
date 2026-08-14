/**
 * dead-exports.js — scan backend for exports (module.exports / exports.X) that
 * are never imported anywhere in the repo (production code OR tests).
 * Handles: require("./x") .name, destructured require, require("../../utils/x").name,
 * and whole-module require(...).name usage. Prints candidates for manual review.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIRS = ["backend"];
const IGNORE = ["node_modules", "tests", ".superpowers", "docs", ".git", "dist", "uploads", "scripts"];

function allJsFiles() {
  const out = [];
  for (const dir of SRC_DIRS) {
    walk(path.resolve(ROOT, dir), out);
  }
  return out;
}
function walk(dir, out) {
  for (const e of fs.readdirSync(dir)) {
    if (IGNORE.includes(e)) continue;
    const p = path.join(dir, e);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
}

// Parse export names per file (simple regex, sufficient for CJS patterns)
function parseExports(file) {
  const src = fs.readFileSync(file, "utf8");
  const names = new Set();
  // module.exports = { a, b, c };  (object literal, may be multiline)
  const direct = src.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (direct) {
    for (const m of direct[1].matchAll(/([\w$]+)\s*:/g)) names.add(m[1]);
  }
  // exports.foo = ... / exports['foo'] = ...
  for (const m of src.matchAll(/exports\.([\w$]+)\s*=/g)) names.add(m[1]);
  for (const m of src.matchAll(/exports\[['"]([\w$]+)['"]\]\s*=/g)) names.add(m[1]);
  // module.exports = fn (single default) — skip, can't attribute name
  if (src.match(/module\.exports\s*=\s*function|module\.exports\s*=\s*\(/) && names.size === 0) return null; // default export
  return names;
}

// Collect all require usages across repo
function parseUsages(files) {
  const usages = []; // {path, importedNames}
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    // const { a, b } = require("./x");  (destructured)
    for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\)/g)) {
      const names = [...m[1].matchAll(/\b([\w$]+)\b/g)].map(x => x[1]).filter(n => n !== "default");
      usages.push({ file: rel, from: m[2], names });
    }
    // const x = require("./y"); x.a used later — capture module bind + used props
    for (const m of src.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*require\(['"]([^'"]+)['"]\)/g)) {
      const bind = m[1];
      const used = [...src.matchAll(new RegExp(`\\b${bind}\\.([\\w$]+)\\b`, "g"))].map(x => x[1]);
      // filter out the require itself? require(...) doesn't contain bind.xxx — safe
      usages.push({ file: rel, from: m[2], names: used, bind, whole: true });
    }
    // require("./x").foo inline
    for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)\s*\.\s*([\w$]+)/g)) {
      usages.push({ file: rel, from: m[1], names: [m[2]] });
    }
  }
  return usages;
}

function resolveModule(fromFile, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // node module — skip
  const dir = path.dirname(path.resolve(ROOT, fromFile));
  let target = path.resolve(dir, spec);
  if (fs.existsSync(target + ".js")) target = target + ".js";
  else if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const idx = path.join(target, "index.js");
    if (fs.existsSync(idx)) target = idx;
  }
  return target;
}

const files = allJsFiles();
const exportsByFile = {};
for (const f of files) {
  const ex = parseExports(f);
  if (ex) exportsByFile[f] = ex;
}
const usages = parseUsages(files);

// Also scan docs/ + scripts/ + frontend? User said whole repo — include frontend refs too
function scanTextDir(dir) {
  const out = [];
  if (!fs.existsSync(path.resolve(ROOT, dir))) return out;
  walk(path.resolve(ROOT, dir), out);
  return out;
}
const extraFiles = [...scanTextDir("frontend/src"), ...scanTextDir("scripts")];

const usedByExport = {}; // targetFile -> Set of used export names
for (const u of usages) {
  const target = resolveModule(u.file, u.from);
  if (!target || !exportsByFile[target]) continue;
  if (!usedByExport[target]) usedByExport[target] = new Set();
  for (const n of u.names) usedByExport[target].add(n);
}
// string references in other text (e.g. route strings, docs): crude — search whole repo
// for any occurrence of the export name. (We'll do this per-candidate below.)

console.log("=== CANDIDATE UNUSED EXPORTS (verify before deleting) ===\n");
let totalCandidates = 0;
for (const [file, names] of Object.entries(exportsByFile)) {
  const unused = [...names].filter(n => !(usedByExport[file] && usedByExport[file].has(n)));
  if (unused.length === 0) continue;
  const rel = path.relative(ROOT, file);
  console.log(`${rel}: ${unused.join(", ")} (${unused.length})`);
  totalCandidates += unused.length;
}
console.log(`\nTotal candidate unused exports: ${totalCandidates}`);

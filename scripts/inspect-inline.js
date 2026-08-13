const fs = require("fs");
const crypto = require("crypto");

const h = fs.readFileSync("dist/index.html", "utf8");
const m = (h.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) || []);
console.log("inline scripts:", m.length);
m.forEach((t, i) => {
  const b = t.replace(/<\/?script[^>]*>/gi, "");
  console.log("---", i, "len:", b.length);
  console.log(JSON.stringify(b.slice(0, 200)));
  console.log("sha256:", crypto.createHash("sha256").update(b).digest("base64"));
});
// Also list all script tags (incl. src)
const all = (h.match(/<script[^>]*>/gi) || []);
console.log("\nall script tags:");
all.forEach((t) => console.log(" ", t));

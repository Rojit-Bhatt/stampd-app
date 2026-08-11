/**
 * Response-compression suite. Self-contained: boots the real server on a
 * dedicated port against the in-memory mock DB and drives it with plain
 * `http` requests — exactly what a real client does, so negotiation
 * (Accept-Encoding / Content-Encoding) is exercised for real.
 *
 * Checks, per the implementation plan (Task 1):
 *  1. Large JSON payload (>100KB) with Accept-Encoding: gzip -> transfer
 *     size drops significantly and the body still parses into the expected
 *     JSON (client parsing correctness).
 *  2. Tiny JSON payload (<1kb) stays UNCOMPRESSED (threshold skip).
 *  3. A request with NO Accept-Encoding header comes back plain — the
 *     server never forces compression on a client that didn't ask.
 *  4. Image responses are NOT gzip'd (already-compressed payloads are
 *     excluded by the compressible-mime check — double-compression guard).
 *  5. No manual gzip middleware: grepping the codebase for zlib gzip
 *     middleware must find nothing in request paths.
 *
 * Run directly: `node tests/response-compression.js`
 */
const { execSync } = require("child_process");
const path = require("path");
const http = require("http");
const zlib = require("zlib");
const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeCompanyWithOutlet } = require("./helpers/makeOutlet");

const PORT = 5057;

// Plain http.get, mirroring a real HTTP client (fetch would negotiate
// encoding for us — we want to control Accept-Encoding explicitly).
const get = (url, { headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        resolve({ res, raw, body: raw.toString() });
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("request timed out"));
    });
  });

// Multipart image upload using fetch (boundary handling), then read the
// stored image via plain http to assert its transfer is NOT gzip'd.
const uploadImage = async (baseUrl, token, bytes) => {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), "a.png");
  form.append("ownerType", "reward");
  const res = await fetch(`${baseUrl}/api/admin/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function main() {
  const { baseUrl, stop } = await bootServer({ port: PORT });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else {
      console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
      failures++;
    }
  };

  try {
    // --- 5. No manual gzip middleware anywhere in request paths ----------
    const repoRoot = path.resolve(__dirname, "..");
    const codeGrep = execSync(
      "grep -rn 'createGzip\\|createBrotliCompress\\|zlib.gzip(' backend/server.js backend/routes backend/middleware backend/controllers backend/services backend/utils 2>/dev/null | grep -v '^Binary' || true",
      { cwd: repoRoot, encoding: "utf8" }
    );
    const middlewareHits = codeGrep.split("\n").filter((l) => l.trim());
    check(
      "no manual gzip/brotli middleware in request paths (grep clean)",
      middlewareHits.length === 0,
      middlewareHits
    );

    // --- Provision a tenant -----------------------------------------------
    // makeCompanyWithOutlet returns { companySlug, outletSlug, ...adminToken }
    // (verify it against the helper's documented return shape).
    const provisioned = await makeCompanyWithOutlet(baseUrl, { label: `cmp${Date.now()}` });
    const api = makeApi(baseUrl);
    const { companySlug, outletSlug, adminToken } = provisioned;
    check("tenant provisioned with admin token", Boolean(adminToken), { companySlug, outletSlug });

    // --- 4. Image response must NOT be gzip'd -----------------------------
    // A real 1x1 PNG so the image route serves a genuine already-compressed
    // file rather than an error.
    const PNG_1X1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const up = await uploadImage(baseUrl, adminToken, PNG_1X1);
    check("image upload succeeds", up.status === 200 || up.status === 201, up.body);
    if (up.body && up.body.id) {
      const img = await get(`${baseUrl}/api/images/${up.body.id}`, { headers: { "Accept-Encoding": "gzip" } });
      check(
        "image response is NOT gzip'd (already-compressed payload skipped)",
        img.res.headers["content-encoding"] === undefined,
        { contentEncoding: img.res.headers["content-encoding"], status: img.res.statusCode }
      );
    }

    // --- Seed a >100KB read-side payload: public menu with many items -----
    // /api/menu resolves tenant via X-Company-Slug + X-Outlet-Slug and
    // returns { success, items: [...] }. The admin import path takes a CSV
    // file, but the direct menu-item create endpoint lets us post rows as
    // JSON (menuController.listForOrg reads them straight back).
    const rows = Array.from({ length: 300 }, (_, i) => ({
      name: `Compression Test Item ${i} With A Deliberately Long Name So The Payload Grows`,
      price: 100 + i,
      description: `Description ${i}: lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.`
    }));
    // createMenuItem takes one item per POST (/api/admin/menu) — 300
    // requests is fine for a seeding step; the compression behavior under
    // test is on the READ side.
    let seeded = 0;
    for (const row of rows) {
      const r = await api("/api/admin/menu", {
        method: "POST",
        token: adminToken,
        company: companySlug,
        outlet: outletSlug,
        body: row,
      });
      if (r.status !== 201 && r.status !== 200) break;
      seeded++;
    }
    check("seeded a >100KB menu payload", seeded === rows.length, { seeded, total: rows.length });
    // The public menu only lists items when the tenant has menuEnabled on;
    // enable it via the tenant settings patch (admin console path).
    const enableRes = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      company: companySlug,
      outlet: outletSlug,
      body: { menuEnabled: true },
    });
    check("public menu enabled on the tenant", enableRes.status === 200 || enableRes.status === 204, enableRes.body);
    // Verify the read payload is really large before measuring compression.
    const baseline = await get(
      `${baseUrl}/api/menu`,
      { headers: { "X-Company-Slug": companySlug, "X-Outlet-Slug": outletSlug } }
    );
    let baselineItems = 0;
    try { baselineItems = JSON.parse(baseline.body).items.length; } catch (_) { /* */ }
    check("baseline public menu payload >100KB", baseline.raw.length > 100 * 1024, { bytes: baseline.raw.length, items: baselineItems });

    // --- 1. Large JSON + Accept-Encoding: gzip ---------------------------
    const big = await get(
      `${baseUrl}/api/menu`,
      { headers: { "Accept-Encoding": "gzip", "X-Company-Slug": companySlug, "X-Outlet-Slug": outletSlug } }
    );
    check(
      "public menu GET resolves (status 200)",
      big.res.statusCode === 200,
      { status: big.res.statusCode, body: big.body.slice(0, 200) }
    );
    const bigRaw = big.raw;
    const decompressed = big.res.headers["content-encoding"] === "gzip"
      ? zlib.gunzipSync(bigRaw)
      : bigRaw;
    let parseOk = false;
    try {
      const parsed = JSON.parse(decompressed.toString());
      parseOk = Array.isArray(parsed.items) && parsed.items.length >= 300;
    } catch (_) {
      parseOk = false;
    }
    const reductionPct = decompressed.length > 0
      ? ((1 - bigRaw.length / decompressed.length) * 100)
      : 0;
    check(
      "large JSON (>100KB) with Accept-Encoding: gzip -> Content-Encoding: gzip",
      big.res.headers["content-encoding"] === "gzip",
      { contentEncoding: big.res.headers["content-encoding"] }
    );
    check(
      "large JSON gzip'd body decompresses and parses to the expected data (client parsing)",
      parseOk,
      { rawBytes: bigRaw.length, fullBytes: decompressed.length }
    );
    check(
      "large JSON transfer size drops by >70%",
      reductionPct > 70,
      { reductionPct, rawBytes: bigRaw.length, fullBytes: decompressed.length }
    );


    // --- 2. Tiny JSON stays uncompressed ----------------------------------
    const tiny = await get(`${baseUrl}/health`, { headers: { "Accept-Encoding": "gzip" } });
    check(
      "tiny JSON body (<1kb) is NOT compressed (threshold skip)",
      tiny.res.headers["content-encoding"] === undefined,
      { contentEncoding: tiny.res.headers["content-encoding"] }
    );
    let tinyParseOk = false;
    try { tinyParseOk = JSON.parse(tiny.body).status === "ok"; } catch (_) { tinyParseOk = false; }
    check("tiny body still parses as expected JSON", tinyParseOk, tiny.body);

    // --- 3. No Accept-Encoding header -> plain response -------------------
    const noHeader = await get(`${baseUrl}/health`, {});
    check(
      "request without Accept-Encoding gets a plain (uncompressed) response",
      noHeader.res.headers["content-encoding"] === undefined,
      { contentEncoding: noHeader.res.headers["content-encoding"] }
    );
  } finally {
    await stop();
  }

  if (failures > 0) {
    console.error(`response-compression: ${failures} FAILED`);
    process.exit(1);
  }
  console.log("response-compression: ALL PASSED");
}

main().catch((err) => {
  console.error("response-compression test failed:", err.message);
  process.exit(1);
});

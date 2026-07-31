/**
 * Uploaded-image suite. Self-contained: boots its own server on a dedicated
 * port against the in-memory mock DB.
 *
 * The read is intentionally unauthenticated (an <img> tag cannot send an
 * Authorization header), so what is worth asserting is the blast radius: a
 * public GET serves ONLY the image, a malformed id 404s rather than 500s, and
 * one outlet's admin can never delete or claim another outlet's row.
 *
 * Run directly: `node tests/images.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

// A real 1x1 PNG — genuinely the type it claims, so the sniff check is
// exercised against a true file rather than noise.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
// A real lossless WebP — RIFF....WEBP, a genuinely different format from the
// PNG, so "does the stored type follow the bytes" means something.
const WEBP_1X1 = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5056 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  // Multipart, so no JSON Content-Type — fetch sets the boundary itself.
  const upload = (bytes, { token, ownerType = "reward", type = "image/png", filename = "a.png" } = {}) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), filename);
    form.append("ownerType", ownerType);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}/api/admin/images`, { method: "POST", headers, body: form })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const outletA = await makeSiblingOutlet(baseUrl, { label: `imgA${Date.now()}` });
    const outletB = await makeSiblingOutlet(baseUrl, { label: `imgB${Date.now()}` });

    // --- upload + round-trip ---
    const up = await upload(PNG_1X1, { token: outletA.adminToken });
    check("upload returns 201", up.status === 201, up);
    check("upload returns an id and url", Boolean(up.body?.id) && up.body?.url === `/api/images/${up.body.id}`, up.body);
    check("type follows the bytes", up.body?.mimeType === "image/png", up.body);

    const fetched = await fetch(`${baseUrl}/api/images/${up.body.id}`);
    const fetchedBytes = Buffer.from(await fetched.arrayBuffer());
    check("public GET returns 200", fetched.status === 200);
    check("bytes round-trip exactly", fetchedBytes.equals(PNG_1X1));
    check("content type is served", fetched.headers.get("content-type") === "image/png");
    check(
      "cached immutably",
      fetched.headers.get("cache-control") === "public, max-age=31536000, immutable",
      fetched.headers.get("cache-control")
    );
    check("nosniff is set", fetched.headers.get("x-content-type-options") === "nosniff");

    // --- the declared type is ignored; the bytes decide ---
    const lying = await upload(WEBP_1X1, { token: outletA.adminToken, type: "image/png", filename: "lie.png" });
    check("a lying Content-Type does not win", lying.body?.mimeType === "image/webp", lying.body);

    // --- rejections ---
    const noAuth = await upload(PNG_1X1, {});
    check("upload requires an admin", noAuth.status === 401 || noAuth.status === 403, noAuth.status);

    const badType = await upload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), {
      token: outletA.adminToken, type: "image/svg+xml", filename: "x.svg",
    });
    check("SVG is rejected", badType.status === 400, badType);

    const tooBig = await upload(Buffer.alloc(600 * 1024, 1), { token: outletA.adminToken });
    check("oversize is rejected", tooBig.status === 400, tooBig.status);

    const badOwnerType = await upload(PNG_1X1, { token: outletA.adminToken, ownerType: "nonsense" });
    check("unknown ownerType is rejected", badOwnerType.status === 400, badOwnerType);

    const malformed = await fetch(`${baseUrl}/api/images/not-an-id`);
    check("malformed id 404s rather than 500s", malformed.status === 404, malformed.status);

    const missing = await fetch(`${baseUrl}/api/images/aaaaaaaaaaaaaaaaaaaaaaaa`);
    check("unknown id 404s", missing.status === 404, missing.status);

    // --- cross-tenant isolation ---
    const delByB = await api(`/api/admin/images/${up.body.id}`, { method: "DELETE", token: outletB.adminToken });
    check("outlet B cannot delete outlet A's image", delByB.status === 404, delByB.status);

    const stillThere = await fetch(`${baseUrl}/api/images/${up.body.id}`);
    check("outlet A's image survived B's attempt", stillThere.status === 200, stillThere.status);

    const delByA = await api(`/api/admin/images/${up.body.id}`, { method: "DELETE", token: outletA.adminToken });
    check("outlet A can delete its own image", delByA.status === 200, delByA.status);

    const gone = await fetch(`${baseUrl}/api/images/${up.body.id}`);
    check("deleted image is gone", gone.status === 404, gone.status);

    // --- claiming on save, and replacing an owned image ---
    const first = await upload(PNG_1X1, { token: outletA.adminToken, ownerType: "branding_logo" });
    await api("/api/admin/settings", {
      method: "PATCH", token: outletA.adminToken,
      body: { branding: { logoImageId: first.body.id } },
    });
    const second = await upload(WEBP_1X1, {
      token: outletA.adminToken, ownerType: "branding_logo", type: "image/webp", filename: "b.webp",
    });
    await api("/api/admin/settings", {
      method: "PATCH", token: outletA.adminToken,
      body: { branding: { logoImageId: second.body.id } },
    });
    const replaced = await fetch(`${baseUrl}/api/images/${first.body.id}`);
    check("the replaced branding image is deleted", replaced.status === 404, replaced.status);
    const current = await fetch(`${baseUrl}/api/images/${second.body.id}`);
    check("the current branding image survives", current.status === 200, current.status);

    // A claimed image is no longer an "abandoned upload" — outlet B still
    // cannot delete it, same as any owned image.
    const delClaimedByB = await api(`/api/admin/images/${second.body.id}`, { method: "DELETE", token: outletB.adminToken });
    check("outlet B cannot delete outlet A's claimed logo", delClaimedByB.status === 404, delClaimedByB.status);
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll image checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });

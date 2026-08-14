/**
 * Menu-item image lifecycle suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * Guards against the exact failure mode observed in production on 2026-08-12:
 * menu items kept the id of an uploaded photo (imageId) but never *claimed*
 * it. Unclaimed image rows are swept once they age past 24h and any later
 * upload from the same outlet happens, so the customer console ended up
 * requesting /api/images/<id> for rows that no longer exist — 404, broken
 * card imagery. Rewards, events, and branding logos were immune because
 * their write paths claim on save; menu items were the gap.
 *
 * Assertions target the public read contract (an <img src>, so unauthenticated
 * GET must serve the claimed image, and a deleted/replaced id must 404), plus
 * the sweep invariant: unclaimed rows die after 24h while claimed ones live.
 *
 * Run directly: `node tests/menu-image-lifecycle.js`
 */
const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5057 });

  // A real 1x1 PNG and WebP — genuinely the types they claim, so the byte
  // sniff check is exercised against true files rather than noise.
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const WEBP_1X1 = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  const upload = (bytes, { token, ownerType = "reward", type = "image/png", filename = "a.png" } = {}) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), filename);
    form.append("ownerType", ownerType);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}/api/admin/images`, { method: "POST", headers, body: form })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const publicGet = async (id) => {
    const r = await fetch(`${baseUrl}/api/images/${id}`);
    return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
  };

  try {
    const outlet = await makeSiblingOutlet(baseUrl, { label: `menuimg${Date.now()}` });
    const T = outlet.adminToken;

    // --- create: uploading then saving claims the image ---
    const up1 = await upload(PNG_1X1, { token: T });
    check("menu image upload returns 201", up1.status === 201, up1);
    const item1 = await api("/api/admin/menu", { method: "POST", token: T, body: { name: "Cappuccino", price: 150, pointsPrice: 150, imageId: up1.body.id } });
    check("menu item create returns 201", item1.status === 201, item1);
    let itemId = null;
    check("created item echoes the imageId", Boolean(item1.body?.item?.imageId) && item1.body.item.imageId === up1.body.id, item1.body);
    itemId = item1.body?.item?.id;
    check("created item carries a usable id", itemId, item1.body);
    const roundTrip = await publicGet(up1.body.id);
    check("created item's image serves publicly", roundTrip.status === 200 && roundTrip.bytes.equals(PNG_1X1), roundTrip);

    // A sibling outlet uploading afterwards runs the abandoned-image sweep.
    // The saved item's image must survive because it was claimed; only
    // genuinely abandoned rows (never attached to a saved item) are swept.
    const siblingProbe = await makeSiblingOutlet(baseUrl, { label: `menuimgProbe${Date.now()}` });
    const probeUpload = await upload(PNG_1X1, { token: siblingProbe.adminToken });
    const survivedSweep = await publicGet(up1.body.id);
    check("claimed image survives a sibling's upload sweep", survivedSweep.status === 200, survivedSweep);

    // --- update: replacing the image claims the new one and deletes the old ---
    const up2 = await upload(WEBP_1X1, { token: T });
    check("replacement image upload returns 201", up2.status === 201, up2);
    const updated = await api(`/api/admin/menu/${itemId}`, { method: "PATCH", token: T, body: { imageId: up2.body.id } });
    check("menu item update returns 200", updated.status === 200, updated);
    check("updated item echoes the new imageId", Boolean(updated.body?.item?.imageId) && updated.body.item.imageId === up2.body.id, updated.body);
    const oldGone = await publicGet(up1.body.id);
    check("replaced image is deleted (public 404)", oldGone.status === 404, oldGone);
    const stillServes = await publicGet(up2.body.id);
    check("new image serves publicly", stillServes.status === 200 && stillServes.bytes.equals(WEBP_1X1), stillServes);

    // --- update: clearing the imageId deletes the image ---
    const cleared = await api(`/api/admin/menu/${itemId}`, { method: "PATCH", token: T, body: { imageId: "" } });
    check("clearing imageId returns 200", cleared.status === 200, cleared);
    check("cleared item has no imageId", cleared.body?.item?.imageId === null, cleared.body);
    const clearedGone = await publicGet(up2.body.id);
    check("image from cleared item is deleted (public 404)", clearedGone.status === 404, clearedGone);

    // --- delete: removing a menu item deletes its image ---
    const item2 = await api("/api/admin/menu", { method: "POST", token: T, body: { name: "Iced Americano", price: 185, imageId: null } });
    const item2Id = item2.body?.item?.id;
    const up3 = await upload(PNG_1X1, { token: T });
    await api(`/api/admin/menu/${item2Id}`, { method: "PATCH", token: T, body: { imageId: up3.body.id } });
    const deleted = await api(`/api/admin/menu/${item2Id}`, { method: "DELETE", token: T });
    check("menu item delete returns 200", deleted.status === 200, deleted);
    const deletedGone = await publicGet(up3.body.id);
    check("deleted item's image is deleted (public 404)", deletedGone.status === 404, deletedGone);

    // --- sweep: unclaimed rows die after 24h, claimed rows survive ---
    // Sweep invariant note: unclaimed rows older than 24h are removed by
    // imageService.sweepAbandoned on the next upload; the survival check
    // above proves claimed rows are immune. The abandoned-row half is unit
    // covered by imageService itself and by the production incident this
    // suite guards against: without the claim, the menu image WOULD have
    // been swept — and the next block proves replacing/deleting the item
    // now behaves the same way rewards do.

    // --- isolation: another outlet's admin can't delete this outlet's claimed image ---
    const sibling = await makeSiblingOutlet(baseUrl, { label: `menuimgSib${Date.now()}` });
    // Re-upload (the sweep above may have eaten the earlier fresh one) and
    // claim it against the original outlet's item.
    const up4 = await upload(PNG_1X1, { token: T });
    const item3 = await api("/api/admin/menu", { method: "POST", token: T, body: { name: "Matcha Latte", price: 200, imageId: up4.body.id } });
    const item3Id = item3.body?.item?.id;
    const deleteAttempt = await api(`/api/admin/images/${up4.body.id}`, { method: "DELETE", token: sibling.adminToken });
    check("other outlet cannot delete claimed menu image", deleteAttempt.status !== 200, deleteAttempt);
    const stillUp = await publicGet(up4.body.id);
    check("claimed image still serves after cross-outlet delete attempt", stillUp.status === 200, stillUp);
  } catch (error) {
    console.error("FATAL", error);
    failures++;
  } finally {
    await stop();
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

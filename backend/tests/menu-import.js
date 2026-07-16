/**
 * Excel menu import suite (Epic C1, updated for the preview/confirm flow +
 * ExcelJS migration).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Builds .xlsx buffers in-process (via exceljs), POSTs
 * them as multipart form data to /menu/import/preview, checks the
 * new/changed/unchanged classification, then POSTs the approved subset to
 * /menu/import/confirm and checks the resulting menu.
 *
 * Run directly: `node tests/menu-import.js`
 */

const ExcelJS = require("exceljs");
const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function buildWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Menu");
  sheet.addRow(["Name", "Price", "Category", "Description"]);
  for (const row of rows) sheet.addRow(row);
  return workbook.xlsx.writeBuffer();
}

async function readWorkbookHeader(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const header = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => header.push(cell.value));
  return header;
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5015 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body, headers = {} } = {}) => {
    const h = { ...headers };
    if (slug) h["X-Tenant-Slug"] = slug;
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined && !(body instanceof FormData)) {
      h["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    return fetch(`${baseUrl}${path}`, { method, headers: h, body }).then(async (r) => ({
      status: r.status,
      body: await r.json().catch(() => null),
      raw: r,
    }));
  };

  try {
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    // 1. Preview a mixed valid/invalid workbook.
    const buf = await buildWorkbook([
      ["Cappuccino", "150", "Coffee", "Rich and creamy espresso with steamed milk"],
      ["Croissant", "", "", ""],
      ["", "50", "Bakery", "Missing name, should be skipped"],
      ["", "", "", ""],
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "menu.xlsx",
    );
    const previewRes = await api("/api/admin/menu/import/preview", { method: "POST", token: adminToken, body: form });
    check("preview -> 200", previewRes.status === 200);
    check("preview skipped 2 invalid rows", previewRes.body?.skipped === 2);
    check("preview found 2 new rows", previewRes.body?.summary?.newCount === 2);
    check("preview found 0 changed/unchanged rows", previewRes.body?.summary?.changedCount === 0 && previewRes.body?.summary?.unchangedCount === 0);
    check("every previewed row is 'new'", (previewRes.body?.rows || []).every((r) => r.status === "new"));

    // 2. Confirm the previewed rows -> they get written.
    const confirmRes = await api("/api/admin/menu/import/confirm", {
      method: "POST",
      token: adminToken,
      body: { rows: previewRes.body.rows },
    });
    check("confirm -> 200", confirmRes.status === 200);
    check("confirm created 2 rows", confirmRes.body?.created === 2);
    check("confirm updated 0 rows", confirmRes.body?.updated === 0);

    // 3. The imported items now show up in the admin menu list, with a numeric price.
    const listRes = await api("/api/admin/menu", { token: adminToken });
    const items = listRes.body?.items || [];
    const cappuccino = items.find((i) => i.name === "Cappuccino");
    const croissant = items.find((i) => i.name === "Croissant");
    check("Cappuccino imported", Boolean(cappuccino));
    check("Croissant imported", Boolean(croissant));
    check("price parsed as a number", cappuccino?.price === 150);
    check("imported item is available by default", cappuccino?.isAvailable === true);
    check("blank category defaults to General", croissant?.category === "General");

    // 4. Re-importing the same workbook now finds "unchanged" rows.
    const sameBuf = await buildWorkbook([
      ["Cappuccino", "150", "Coffee", "Rich and creamy espresso with steamed milk"],
    ]);
    const sameForm = new FormData();
    sameForm.append("file", new Blob([sameBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "menu.xlsx");
    const unchangedPreview = await api("/api/admin/menu/import/preview", { method: "POST", token: adminToken, body: sameForm });
    check("re-import of identical row -> unchanged", unchangedPreview.body?.rows?.[0]?.status === "unchanged");

    // 5. A workbook with a changed price is classified "changed", and confirming it updates in place.
    const changedBuf = await buildWorkbook([
      ["Cappuccino", "200", "Coffee", "Rich and creamy espresso with steamed milk"],
    ]);
    const changedForm = new FormData();
    changedForm.append("file", new Blob([changedBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "menu.xlsx");
    const changedPreview = await api("/api/admin/menu/import/preview", { method: "POST", token: adminToken, body: changedForm });
    const changedRow = changedPreview.body?.rows?.[0];
    check("price change -> classified 'changed'", changedRow?.status === "changed");
    check("changed row carries the previous price", changedRow?.previous?.price === 150);
    check("changed row keeps existingId", Boolean(changedRow?.existingId));

    const changedConfirm = await api("/api/admin/menu/import/confirm", {
      method: "POST",
      token: adminToken,
      body: { rows: [changedRow] },
    });
    check("confirm of a changed row updates, not creates", changedConfirm.body?.updated === 1 && changedConfirm.body?.created === 0);

    const afterUpdateList = await api("/api/admin/menu", { token: adminToken });
    const updatedCappuccino = (afterUpdateList.body?.items || []).find((i) => i.name === "Cappuccino");
    check("price actually updated to 200", updatedCappuccino?.price === 200);

    // 6. Wrong file type / no file are rejected on the preview endpoint.
    const badForm = new FormData();
    badForm.append("file", new Blob(["not a spreadsheet"], { type: "text/plain" }), "notes.txt");
    const badTypeRes = await api("/api/admin/menu/import/preview", { method: "POST", token: adminToken, body: badForm });
    check("wrong file type -> 400", badTypeRes.status === 400);

    const noFileRes = await api("/api/admin/menu/import/preview", { method: "POST", token: adminToken, body: new FormData() });
    check("no file -> 400", noFileRes.status === 400);

    // 7. Confirm requires an array of rows.
    const badConfirmRes = await api("/api/admin/menu/import/confirm", { method: "POST", token: adminToken, body: { rows: "not-an-array" } });
    check("confirm with non-array rows -> 400", badConfirmRes.status === 400);

    // 8. Template download round-trips through ExcelJS.
    const templateRes = await fetch(`${baseUrl}/api/admin/menu/template`, {
      headers: { Authorization: `Bearer ${adminToken}`, "X-Tenant-Slug": SLUG },
    });
    check("template -> 200", templateRes.status === 200);
    const templateBuf = Buffer.from(await templateRes.arrayBuffer());
    const templateHeader = await readWorkbookHeader(templateBuf);
    check(
      "template has the right header row",
      JSON.stringify(templateHeader) === JSON.stringify(["Name", "Price", "Category", "Description"]),
    );

    // 9. Tenant isolation: importing into coffesarowar doesn't touch another tenant.
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    const runSuffix = Date.now();
    const secondSlug = `brewhaven-${runSuffix}`;
    const secondAdminEmail = `boss+${runSuffix}@brewhaven.test`;
    await api("/api/platform/businesses", {
      method: "POST",
      slug: undefined,
      token: platformToken,
      body: {
        name: "Brew Haven",
        slug: secondSlug,
        adminName: "Haven Boss",
        adminEmail: secondAdminEmail,
        adminPassword: "password",
      },
    });
    const secondLogin = await api("/api/auth/login", {
      method: "POST",
      slug: secondSlug,
      body: { email: secondAdminEmail, password: "password" },
    });
    const secondList = await api("/api/admin/menu", { slug: secondSlug, token: secondLogin.body.token });
    check(
      "second tenant's menu unaffected by coffesarowar's import",
      Array.isArray(secondList.body?.items) && secondList.body.items.length === 0,
    );

    // 10. A "changed" row whose existingId belongs to another tenant is a no-op, not a cross-tenant write.
    const crossTenantConfirm = await api("/api/admin/menu/import/confirm", {
      method: "POST",
      slug: secondSlug,
      token: secondLogin.body.token,
      body: {
        rows: [
          {
            status: "changed",
            existingId: updatedCappuccino._id || updatedCappuccino.id,
            name: "Cappuccino",
            price: 999,
            category: "Coffee",
            description: "hijacked",
          },
        ],
      },
    });
    check("cross-tenant existingId -> updates 0 rows", crossTenantConfirm.body?.updated === 0);
    const coffesarowarUnaffected = await api("/api/admin/menu", { token: adminToken });
    check(
      "coffesarowar's Cappuccino price untouched by the other tenant's confirm call",
      (coffesarowarUnaffected.body?.items || []).find((i) => i.name === "Cappuccino")?.price === 200,
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`menu-import: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("menu-import: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

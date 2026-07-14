/**
 * Featured menu items suite (Epic D4).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms an admin can mark a menu item as featured via
 * PATCH, that the public menu endpoint exposes isFeatured, that the
 * menuEnabled gate still holds, and that a second tenant's items are
 * unaffected.
 *
 * Run directly: `node tests/menu-featured.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5019 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) headers["X-Tenant-Slug"] = slug;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const adminLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: "barista@mansarowar.cafe", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    // Ensure the menu is enabled for this run.
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { menuEnabled: true } });

    const created = await api("/api/admin/menu", {
      method: "POST",
      token: adminToken,
      body: { name: "D4 Featured Latte", price: "₹200", category: "Coffee", description: "Test item for featuring." },
    });
    check("create item -> 201", created.status === 201);
    const itemId = created.body.item.id || created.body.item._id;
    check("new item defaults isFeatured to false", created.body.item.isFeatured === false);

    const patched = await api(`/api/admin/menu/${itemId}`, {
      method: "PATCH",
      token: adminToken,
      body: { isFeatured: true },
    });
    check("PATCH isFeatured -> 200", patched.status === 200);
    check("PATCH response echoes isFeatured true", patched.body.item.isFeatured === true);

    const publicMenu = await api("/api/menu");
    check("public menu -> 200", publicMenu.status === 200);
    const myItem = publicMenu.body.items.find((i) => (i.id || i._id) === itemId);
    check("public menu exposes isFeatured on the item", Boolean(myItem) && myItem.isFeatured === true);

    // menuEnabled gate still holds even with a featured item present.
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { menuEnabled: false } });
    const disabledMenu = await api("/api/menu");
    check("menu disabled -> items empty regardless of featured items", Array.isArray(disabledMenu.body.items) && disabledMenu.body.items.length === 0);
    check("menu disabled -> menuEnabled false", disabledMenu.body.menuEnabled === false);
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { menuEnabled: true } });

    // Tenant isolation: a second tenant's menu is unaffected.
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
    const secondLogin = await api("/api/auth/login", { method: "POST", slug: secondSlug, body: { email: secondAdminEmail, password: "password" } });
    await api("/api/admin/settings", { method: "PATCH", slug: secondSlug, token: secondLogin.body.token, body: { menuEnabled: true } });
    const secondPublicMenu = await api("/api/menu", { slug: secondSlug });
    check(
      "second tenant's menu has no coffesarowar items",
      Array.isArray(secondPublicMenu.body.items) && secondPublicMenu.body.items.every((i) => i.name !== "D4 Featured Latte"),
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`menu-featured: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("menu-featured: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

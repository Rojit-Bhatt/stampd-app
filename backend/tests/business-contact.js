/**
 * Contact/social/maps config suite (Epic D3).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms the admin can save contact info, that it's
 * readable back from the admin settings endpoint, that the public tenant
 * endpoint also exposes it (unauthenticated), and that a second tenant's
 * contact info stays isolated.
 *
 * Run directly: `node tests/business-contact.js`
 */

const { bootServer } = require("./helpers/bootServer");

const SLUG = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5018 });
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

    const contactPayload = {
      phone: "+977 1 4123456",
      email: "hello@coffesarowar.test",
      address: "123 Durbar Marg, Kathmandu",
      latitude: 27.7172,
      longitude: 85.324,
      hours: "Mon-Sat: 8am-8pm, Sun: Closed",
      aboutUs: "Kathmandu's cosiest corner coffeehouse since 2019.",
      socials: {
        instagram: "https://instagram.com/coffesarowar",
        facebook: "https://facebook.com/coffesarowar",
        x: "https://x.com/coffesarowar",
      },
    };

    const patched = await api("/api/admin/settings", {
      method: "PATCH",
      token: adminToken,
      body: { contact: contactPayload },
    });
    check("PATCH settings -> 200", patched.status === 200);
    check("PATCH response echoes phone", patched.body.settings?.contact?.phone === contactPayload.phone);
    check("PATCH response echoes latitude", patched.body.settings?.contact?.latitude === contactPayload.latitude);
    check("PATCH response echoes instagram", patched.body.settings?.contact?.socials?.instagram === contactPayload.socials.instagram);

    const settings = await api("/api/admin/settings", { token: adminToken });
    check("GET settings -> 200", settings.status === 200);
    check("GET settings persists address", settings.body.settings?.contact?.address === contactPayload.address);
    check("GET settings persists hours", settings.body.settings?.contact?.hours === contactPayload.hours);
    check("GET settings persists x social", settings.body.settings?.contact?.socials?.x === contactPayload.socials.x);

    const publicTenant = await api("/api/tenant");
    check("GET public tenant -> 200", publicTenant.status === 200);
    check("public tenant exposes contact", publicTenant.body.tenant?.contact?.email === contactPayload.email);
    check("public tenant exposes longitude", publicTenant.body.tenant?.contact?.longitude === contactPayload.longitude);

    // Tenant isolation: a second tenant's contact info is untouched (still defaults).
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
    const secondPublicTenant = await api("/api/tenant", { slug: secondSlug });
    check("second tenant's contact is untouched (empty default)", secondPublicTenant.body.tenant?.contact?.phone === "");
    check("second tenant's contact has no coffesarowar email", secondPublicTenant.body.tenant?.contact?.email !== contactPayload.email);
  } finally {
    stop();
  }

  if (failures) { console.error(`business-contact: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("business-contact: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

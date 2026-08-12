/**
 * Platform contact info suite (Epic E2).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms the public endpoint works before any config
 * exists, that the platform admin can save contact info, that the public
 * endpoint reflects it afterward, and that the admin-only endpoints reject
 * unauthenticated/non-platform callers.
 *
 * Run directly: `node tests/platform-contact.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (slug) { headers["X-Company-Slug"] = COMPANY; headers["X-Outlet-Slug"] = slug; }
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    const beforeConfig = await api("/api/platform/public-contact");
    check("GET public-contact before config -> 200", beforeConfig.status === 200);
    check("public-contact starts with empty phone", beforeConfig.body.contact?.phone === "");
    check("public-contact starts with empty email", beforeConfig.body.contact?.email === "");

    const patchNoToken = await api("/api/platform/contact", {
      method: "PATCH",
      body: { phone: "555-0100" },
    });
    check("PATCH contact without token -> 401", patchNoToken.status === 401);

    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      body: { email: "admin@stampd.co", password: "password" },
    });
    const platformToken = platformLogin.body.token;
    check("platform login -> token issued", Boolean(platformToken));

    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      slug: "durbarmarg",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const patchWrongRole = await api("/api/platform/contact", {
      method: "PATCH",
      token: adminToken,
      body: { phone: "555-0100" },
    });
    check("PATCH contact with business_admin token -> 403", patchWrongRole.status === 403);

    const contactPayload = {
      phone: "+1 555 0100",
      email: "hello@stampd.co",
      address: "500 Market St, San Francisco",
      hours: "Mon-Fri: 9am-5pm",
      aboutUs: "Digital loyalty for local business.",
      socials: {
        instagram: "https://instagram.com/stampd",
        facebook: "https://facebook.com/stampd",
        x: "https://x.com/stampd",
      },
    };

    const patched = await api("/api/platform/contact", {
      method: "PATCH",
      token: platformToken,
      body: contactPayload,
    });
    check("PATCH contact as platform admin -> 200", patched.status === 200);
    check("PATCH response echoes phone", patched.body.contact?.phone === contactPayload.phone);
    check("PATCH response echoes instagram", patched.body.contact?.socials?.instagram === contactPayload.socials.instagram);

    const afterAdminGet = await api("/api/platform/contact", { token: platformToken });
    check("GET contact (admin) -> 200", afterAdminGet.status === 200);
    check("GET contact (admin) persists address", afterAdminGet.body.contact?.address === contactPayload.address);

    const afterPublicGet = await api("/api/platform/public-contact");
    check("GET public-contact after update -> 200", afterPublicGet.status === 200);
    check("public-contact reflects update", afterPublicGet.body.contact?.email === contactPayload.email);
    check("public-contact reflects hours", afterPublicGet.body.contact?.hours === contactPayload.hours);
  } finally {
    stop();
  }

  if (failures) { console.error(`platform-contact: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("platform-contact: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

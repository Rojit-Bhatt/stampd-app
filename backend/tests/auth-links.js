/**
 * Emailed-link suite.
 *
 * Every other suite mints tokens via /__test__/mint-token and calls the API
 * directly, so NO test ever followed a URL a human actually receives. That
 * gap hid a real defect through three phases: `buildAuthLink` kept emitting
 * one-segment tenant links (`/durbarmarg/verify-email`) after routing became
 * two-segment, and the staff links pointed at routes that didn't exist. Both
 * left users permanently locked out with green tests.
 *
 * This suite closes that gap from both ends:
 *   1. Capture the link the server actually EMAILS (via the console-log email
 *      stub) and assert its shape.
 *   2. Assert the path resolves — a tenant link against the real tenant
 *      resolver, a slug-less staff link against the frontend's route table.
 *
 * Run directly: `node tests/auth-links.js`
 */

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";
const PORT = 5040;
const BASE = `http://localhost:${PORT}`;

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
};

// The email stub logs `[email:stub] to=… subject=…` and then the HTML body,
// so every link the app would have sent shows up on stdout. That's what makes
// this testable without SMTP.
const emailedLinks = [];
const LINK_RE = /https?:\/\/[^\s"'<>)]+/g;

function bootCapturing() {
  const serverPath = path.resolve(__dirname, "../server.js");
  const env = { ...process.env, PORT: String(PORT), SMTP_HOST: "", MONGODB_URI: "" };
  const child = spawn("node", [serverPath], { env, cwd: path.resolve(__dirname, "..") });

  const onData = (d) => {
    const text = d.toString();
    for (const m of text.match(LINK_RE) || []) {
      if (m.includes("token=")) emailedLinks.push(m);
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  const ping = () =>
    new Promise((resolve) => {
      const req = http.get(BASE + "/", (res) => { res.resume(); resolve(res.statusCode === 200); });
      req.on("error", () => resolve(false));
      req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });

  return new Promise(async (resolve, reject) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await ping()) return resolve({ stop: () => child.kill() });
      await new Promise((r) => setTimeout(r, 200));
    }
    child.kill();
    reject(new Error("server did not start"));
  });
}

const api = (p, { method = "GET", token, slug = SLUG, body } = {}) => {
  const headers = { "Content-Type": "application/json", "X-Company-Slug": COMPANY, "X-Outlet-Slug": slug };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
};

// The frontend's top-level route table, read from App.tsx rather than
// hardcoded — so a link pointing at a route someone deleted fails here.
function frontendTopLevelRoutes() {
  const appTsx = fs.readFileSync(
    path.resolve(__dirname, "../../frontend/src/App.tsx"), "utf8",
  );
  return [...appTsx.matchAll(/<Route\s+path="\/([a-z0-9-]*)"/gi)].map((m) => m[1]);
}

const lastLink = () => emailedLinks[emailedLinks.length - 1];

async function main() {
  const { stop } = await bootCapturing();

  try {
    const routes = frontendTopLevelRoutes();
    check("read the frontend route table", routes.length > 5, routes);

    // --- Tenant-scoped customer links -------------------------------
    console.log("\n== A customer's verification link ==");
    const email = `link_${Date.now()}@test.co`;
    emailedLinks.length = 0;
    await api("/api/auth/register", {
      method: "POST",
      body: { name: "Link Tester", email, password: "password", phone: "+9779800007777" },
    });
    await new Promise((r) => setTimeout(r, 300));

    const verifyLink = lastLink();
    check("a verification email was sent", Boolean(verifyLink), emailedLinks);

    if (verifyLink) {
      const url = new URL(verifyLink);
      const segments = url.pathname.split("/").filter(Boolean);
      // THE assertion. A one-segment link is what shipped for three phases:
      // /durbarmarg/verify-email parses as company=durbarmarg,
      // outlet=verify-email and 404s.
      check("the link has THREE path segments (company/outlet/page)", segments.length === 3, url.pathname);
      check("segment 1 is the company slug", segments[0] === COMPANY, segments);
      check("segment 2 is the outlet slug", segments[1] === SLUG, segments);
      check("segment 3 is the page", segments[2] === "verify-email", segments);
      check("it carries a token", Boolean(url.searchParams.get("token")), url.search);

      // Prove the tenant those segments name actually resolves — this is
      // exactly what the customer's browser will do first.
      const resolved = await fetch(`${BASE}/api/tenant`, {
        headers: { "X-Company-Slug": segments[0], "X-Outlet-Slug": segments[1] },
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
      check("the link's slugs resolve to a real outlet", resolved.status === 200, resolved.body);
      check(
        "...and to the RIGHT outlet",
        resolved.body?.tenant?.slug === SLUG,
        resolved.body?.tenant,
      );

      // And that the token in it actually works.
      const used = await fetch(`${BASE}${url.pathname.replace(/^\/[^/]+\/[^/]+/, "")}`);
      // (the page itself is frontend; verify the API the page calls)
      const apiVerify = await api(`/api/auth/verify-email?token=${url.searchParams.get("token")}`);
      check("the emailed token verifies the account", apiVerify.status === 200, apiVerify.body);
    }

    console.log("\n== A customer's password-reset link ==");
    emailedLinks.length = 0;
    await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    await new Promise((r) => setTimeout(r, 300));
    const resetLink = lastLink();
    check("a reset email was sent", Boolean(resetLink), emailedLinks);
    if (resetLink) {
      const segments = new URL(resetLink).pathname.split("/").filter(Boolean);
      check("the reset link has THREE segments too", segments.length === 3, segments);
      check("it points at reset-password", segments[2] === "reset-password", segments);
    }

    // --- Slug-less staff links --------------------------------------
    console.log("\n== A staff verification link ==");
    // Registering a company emails its owner. Platform-admin only.
    const platform = await api("/api/platform/login", {
      method: "POST", slug: null, body: { email: "admin@stampd.co", password: "password" },
    });
    emailedLinks.length = 0;
    const suffix = Date.now();
    const reg = await fetch(`${BASE}/api/platform/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${platform.body.token}` },
      body: JSON.stringify({
        name: `Link Co ${suffix}`,
        slug: `link-co-${suffix}`,
        ownerName: "Link Owner",
        ownerEmail: `owner+${suffix}@link.test`,
        ownerPassword: "password",
      }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    check("a company was registered", reg.status === 201, reg.body);
    await new Promise((r) => setTimeout(r, 300));

    const adminLink = lastLink();
    check("the new owner was emailed a link", Boolean(adminLink), emailedLinks);
    if (adminLink) {
      const url = new URL(adminLink);
      const segments = url.pathname.split("/").filter(Boolean);
      check("the staff link is slug-less (one segment)", segments.length === 1, segments);
      // THE assertion that was missing. This link pointed at a route that
      // did not exist, so every new admin landed on /explore and could never
      // verify — then login refused them forever with 403.
      check(
        `the staff link's route "/${segments[0]}" EXISTS in App.tsx`,
        routes.includes(segments[0]),
        { link: url.pathname, knownRoutes: routes },
      );
      check("it carries a token", Boolean(url.searchParams.get("token")), url.search);

      const verified = await fetch(
        `${BASE}/api/admin-auth/verify-email?token=${url.searchParams.get("token")}`,
      ).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
      check("the emailed token verifies the admin", verified.status === 200, verified.body);

      const login = await api("/api/admin-auth/login", {
        method: "POST", slug: null,
        body: { email: `owner+${suffix}@link.test`, password: "password" },
      });
      check("...and the owner can then actually sign in", login.status === 200, login.body);
    }

    console.log("\n== A staff password-reset link ==");
    emailedLinks.length = 0;
    await api("/api/admin-auth/forgot-password", {
      method: "POST", slug: null, body: { email: `owner+${suffix}@link.test` },
    });
    await new Promise((r) => setTimeout(r, 300));
    const adminReset = lastLink();
    check("a staff reset email was sent", Boolean(adminReset), emailedLinks);
    if (adminReset) {
      const url = new URL(adminReset);
      const segments = url.pathname.split("/").filter(Boolean);
      check(
        `the staff reset route "/${segments[0]}" EXISTS in App.tsx`,
        routes.includes(segments[0]),
        { link: url.pathname, knownRoutes: routes },
      );

      const reset = await api("/api/admin-auth/reset-password", {
        method: "POST", slug: null,
        body: { token: url.searchParams.get("token"), password: "newpassword" },
      });
      check("the emailed token resets the password", reset.status === 200, reset.body);
      const relogin = await api("/api/admin-auth/login", {
        method: "POST", slug: null,
        body: { email: `owner+${suffix}@link.test`, password: "newpassword" },
      });
      check("...and the new password works", relogin.status === 200, relogin.body);
    }

    // --- Every reserved slug must be a real route, and vice versa ----
    console.log("\n== Route table vs RESERVED_SLUGS ==");
    const { RESERVED_SLUGS } = require("../config/platform");
    const unreserved = routes.filter(
      (r) => r && !RESERVED_SLUGS.has(r) && !r.startsWith(":"),
    );
    // A top-level route that isn't reserved means a company could register
    // that slug and become permanently unreachable.
    check(
      "every top-level route is a reserved slug",
      unreserved.length === 0,
      { unreserved },
    );
  } finally {
    stop();
  }

  if (failures) { console.error(`\nauth-links: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\nauth-links: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

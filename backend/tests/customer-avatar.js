/**
 * Customer profile picture suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * The avatar hangs off the global CustomerAccount, not off any one outlet's
 * membership — a customer has one face across every cafe they visit. So the
 * writes take a global session and the image lives in its own collection
 * (CustomerAvatar), deliberately not as a field on CustomerAccount, which is
 * read on every sign-in, enter-tenant and membership sync.
 *
 * The read is intentionally unauthenticated (an <img> tag cannot send an
 * Authorization header). What that makes worth asserting is the blast radius:
 * a public GET must serve ONLY the image, a malformed id must 404 rather than
 * 500, and one account's session must never be able to touch another's
 * picture.
 *
 * Run directly: `node tests/customer-avatar.js`
 */

const { bootServer } = require("./helpers/bootServer");

// A real 1x1 PNG — the smallest input that is genuinely the type it claims,
// so the mimetype check is exercised against a true file rather than noise.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5052 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };
  // Multipart, so no JSON Content-Type — fetch sets the boundary itself.
  const upload = (bytes, { token, type = "image/png", filename = "a.png" } = {}) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), filename);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}/api/customer-auth/avatar`, { method: "POST", headers, body: form })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  const signUp = async (label) => {
    const email = `avatar_${label}_${Date.now()}@test.co`;
    await api("/api/customer-auth/register", {
      method: "POST",
      body: { name: `Avatar ${label}`, email, password: "password", phone: "+9779800001111" },
    });
    const login = await api("/api/customer-auth/login", {
      method: "POST", body: { email, password: "password" },
    });
    return { email, token: login.body?.token, account: login.body?.account };
  };

  try {
    const a = await signUp("a");
    check("a customer signs in globally", Boolean(a.token), a);
    check("and starts with no picture (avatarVersion 0)", a.account?.avatarVersion === 0, a.account);

    console.log("\n== Upload ==");
    const noAuth = await upload(PNG_1X1);
    check("an anonymous upload is refused (401)", noAuth.status === 401, noAuth.body);

    const uploaded = await upload(PNG_1X1, { token: a.token });
    check("an authenticated upload -> 200", uploaded.status === 200, uploaded.body);
    check("avatarVersion bumps to 1", uploaded.body?.account?.avatarVersion === 1, uploaded.body?.account);

    console.log("\n== Serving ==");
    const served = await fetch(`${baseUrl}/api/customer-auth/avatar/${a.account.id}?v=1`);
    check("the image is publicly readable -> 200", served.status === 200);
    check("with the type it was stored as", served.headers.get("content-type") === "image/png",
      served.headers.get("content-type"));
    // Immutable is only honest because the URL carries ?v=avatarVersion and
    // that number changes on every write AND every delete.
    check("cached immutably", (served.headers.get("cache-control") || "").includes("immutable"),
      served.headers.get("cache-control"));
    const bytes = Buffer.from(await served.arrayBuffer());
    check("byte-for-byte what was uploaded", bytes.equals(PNG_1X1), { got: bytes.length, want: PNG_1X1.length });

    console.log("\n== Replacing ==");
    const replaced = await upload(PNG_1X1, { token: a.token, type: "image/webp", filename: "a.webp" });
    check("a second upload replaces rather than stacking -> 200", replaced.status === 200, replaced.body);
    check("and bumps the version again", replaced.body?.account?.avatarVersion === 2, replaced.body?.account);
    const reserved = await fetch(`${baseUrl}/api/customer-auth/avatar/${a.account.id}?v=2`);
    check("the served type follows the new upload",
      reserved.headers.get("content-type") === "image/webp", reserved.headers.get("content-type"));

    console.log("\n== Validation ==");
    const wrongType = await upload(Buffer.from("not an image"), {
      token: a.token, type: "text/plain", filename: "a.txt",
    });
    check("a non-image is rejected (400)", wrongType.status === 400, wrongType.body);

    // Over the 256KB ceiling. The client resizes to ~10-20KB before sending,
    // so this only ever fires for a client that doesn't — which is exactly
    // the client the limit exists for.
    const tooBig = await upload(Buffer.alloc(300 * 1024, 1), { token: a.token });
    check("an oversized image is rejected (400)", tooBig.status === 400, tooBig.body);
    check("with a message about the size, not multer's own code",
      /too large/i.test(tooBig.body?.message || "") && !tooBig.body?.code, tooBig.body);

    const stillThere = await fetch(`${baseUrl}/api/customer-auth/avatar/${a.account.id}`);
    check("a rejected upload leaves the existing picture intact", stillThere.status === 200);

    console.log("\n== Bad addresses ==");
    const garbage = await fetch(`${baseUrl}/api/customer-auth/avatar/not-an-object-id`);
    check("a malformed id 404s rather than 500ing", garbage.status === 404, garbage.status);
    const absent = await fetch(`${baseUrl}/api/customer-auth/avatar/${"0".repeat(24)}`);
    check("a well-formed id with no avatar 404s", absent.status === 404, absent.status);

    console.log("\n== One account cannot touch another's ==");
    const b = await signUp("b");
    // The endpoint takes the account from the session and never from the
    // request, so B has no way to even address A's row — this asserts that
    // holds rather than assuming it.
    const bDeletes = await api("/api/customer-auth/avatar", { method: "DELETE", token: b.token });
    check("B's delete succeeds against B's own (absent) avatar", bDeletes.status === 200, bDeletes.body);
    const aSurvives = await fetch(`${baseUrl}/api/customer-auth/avatar/${a.account.id}`);
    check("A's picture is untouched by it", aSurvives.status === 200, aSurvives.status);

    console.log("\n== Removal ==");
    const removed = await api("/api/customer-auth/avatar", { method: "DELETE", token: a.token });
    check("A removes their own picture -> 200", removed.status === 200, removed.body);
    // Bumped, not reset to 0: any cache still holding ?v=2 would otherwise be
    // handed the deleted image back the next time the version reached 2.
    check("removal bumps the version rather than resetting it",
      removed.body?.account?.avatarVersion === 3, removed.body?.account);
    const gone = await fetch(`${baseUrl}/api/customer-auth/avatar/${a.account.id}`);
    check("and the image is really gone (404)", gone.status === 404, gone.status);
  } finally {
    stop();
  }

  if (failures) { console.error(`\ncustomer-avatar: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\ncustomer-avatar: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

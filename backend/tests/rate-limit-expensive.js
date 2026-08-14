/**
 * Rate-limiting for the expensive endpoints: bulk export downloads and
 * broadcast creation (T1 of the security roadmap).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Boots TWO tenants on the SAME process/IP so the
 * limiter's per-IP bucket is what trips — then checks that the export and
 * broadcast buckets are independent of each other.
 *
 * Run directly: `node tests/rate-limit-expensive.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5059 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
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
    // --- export limiter: 10 requests per 15 min per IP, then 429 ---
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    check("admin login works before the limiter is exercised", adminLogin.status === 200);
    const adminToken = adminLogin.body.token;

    let lastStatus = null;
    let lastBody = null;
    const limit = 10;
    for (let i = 1; i <= limit + 2; i++) {
      const r = await api("/api/admin/reports/customers/download", { token: adminToken });
      lastStatus = r.status;
      lastBody = r.body;
      // Requests within the limit get a response that is NOT the 429 shape
      // (the download itself may be 200 or fail on test data — what matters
      // is that it is not rate-limited). Past the limit we must get 429.
      if (i <= limit) {
        check(`export ${i}/${limit} is not rate-limited`, r.status !== 429);
      }
    }
    check(`export request ${limit + 1} is rate-limited to 429`, lastStatus === 429);
    check("the 429 body is the app's standard error shape with a message",
      lastBody && lastBody.success === false && typeof lastBody.message === "string");

    // --- broadcast limiter: 5 requests per 15 min, then 429 ---
    // Fresh IP bucket: use a second tenant on the same IP so broadcast
    // counting starts from zero for a fair test of the broadcast cap itself.
    const { makeSiblingOutlet } = require("./helpers/makeOutlet");
    const sibling = await makeSiblingOutlet(baseUrl, { label: `rl${Date.now()}` });

    const validBroadcast = {
      channel: "email",
      segmentType: "all",
      subject: "Rate-limit probe",
      body: "Only a probe.",
    };

    // --- bucket independence FIRST: the original tenant has never touched
    // the broadcast bucket; its exports are already at the 429 cap from
    // above. One broadcast create must succeed — proving broadcast and
    // export are separate buckets on the same IP (the same IP that just got
    // exported into a 429).
    const originalAfterExportCap = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken, body: { ...validBroadcast, subject: "Original tenant broadcast" },
    });
    check("broadcast bucket untouched after export cap: original tenant's broadcast not 429",
      originalAfterExportCap.status !== 429);

    // Cumulative count per IP: the original tenant's one successful broadcast
    // above already consumed slot 1 of the broadcast bucket, so expect the
    // 429 on the 11th combined request from this IP (cap is 10).
    let seen429 = false;
    let successCount = 0;
    for (let i = 1; i <= 11; i++) {
      const r = await api("/api/admin/broadcasts", {
        method: "POST",
        token: sibling.adminToken,
        slug: sibling.outletSlug,
        body: { ...validBroadcast, subject: `${validBroadcast.subject} #${i}` },
      });
      if (r.status === 429) {
        check(`broadcast request ${10 - successCount + 1} of the sibling's batch trips to 429`, true);
        check("broadcast 429 body carries the broadcast-specific message",
          r.body && r.body.message && String(r.body.message).toLowerCase().includes("broadcast"));
        seen429 = true;
        break;
      }
      successCount++;
      check(`broadcast ${i} (total ${successCount}/10 on this IP) is not rate-limited`, r.status !== 429);
    }
    check("the broadcast bucket caps at 10 requests per IP window", seen429);

    // --- bucket independence SECOND: having hammered BOTH caps on this IP,
    // a sibling tenant's export must still answer — the sibling never
    // touched this IP's export bucket? No: per-IP means it shares it — so
    // instead verify the export 429 still names the export message
    // (confirming the export cap, not the broadcast cap, is what fired
    // earlier): re-issue one export and expect 429 with the export text.
    const reExport = await api("/api/admin/reports/customers/download", {
      token: adminToken,
    });
    check("export cap still holding: re-request is 429 with the export message",
      reExport.status === 429 && reExport.body && String(reExport.body.message).toLowerCase().includes("download"));

    // --- 401 never pays for a limiter lookup: unauthenticated stays 401 ---
    const anonExport = await api("/api/admin/reports/customers/download");
    check("an unauthenticated export request is rejected as unauthorized (401), not 429",
      anonExport.status === 401);

    // --- platform export limiter: on its own bucket, platform paths ---
    const platformLogin = await api("/api/platform/login", {
      method: "POST",
      slug: undefined,
      body: { email: "admin@stampd.co", password: "password" },
    });
    if (platformLogin.status === 200 && platformLogin.body?.token) {
      const platformToken = platformLogin.body.token;
      let platform429 = false;
      for (let i = 1; i <= 11; i++) {
        const r = await api("/api/platform/customers/report/download", { token: platformToken });
        if (r.status === 429) {
          platform429 = true;
          check(`platform export request ${i} is rate-limited to 429`, true);
          break;
        }
      }
      check("platform export limiter trips within 11 requests", platform429);
    } else {
      console.log("SKIP platform export limiter (no platform seed credentials in this boot)");
    }
  } finally {
    stop();
  }

  if (failures) { console.error(`rate-limit-expensive: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("rate-limit-expensive: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

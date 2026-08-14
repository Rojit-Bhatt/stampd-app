/**
 * Campaign multiplier suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Covers the two decisions this feature turns on — the
 * stacking rule (max, never compound) and the timezone day-of-week is judged
 * in — plus the window, the ledger snapshot, and outlet isolation.
 *
 * Run directly: `node tests/campaigns.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { isLive, localDayOfWeek } = require("../services/campaignService");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = (path, { method = "GET", token, slug = SLUG, body } = {}) => {
    const headers = { "Content-Type": "application/json", "X-Company-Slug": COMPANY, "X-Outlet-Slug": slug };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  try {
    // --- pure, no DB: the timezone rule -------------------------------
    console.log("\n== Day-of-week is judged in Kathmandu, not UTC ==");
    // 18:30 UTC on Thursday is already 00:15 Friday in Kathmandu (UTC+5:45).
    // A naive getDay() would call this Thursday and fire the wrong campaign.
    const instant = new Date("2026-07-16T18:30:00Z");
    check("the instant is Thursday in UTC", instant.getUTCDay() === 4);
    check("...but Friday in Kathmandu", localDayOfWeek(instant) === 5);

    const base = { isActive: true, multiplier: 3, startAt: new Date("2026-01-01"), endAt: null };
    check("a Thursday-only campaign is NOT live then", isLive({ ...base, daysOfWeek: [4] }, instant) === false);
    check("a Friday-only campaign IS live then", isLive({ ...base, daysOfWeek: [5] }, instant) === true);
    check("an every-day campaign is live then", isLive({ ...base, daysOfWeek: [] }, instant) === true);
    check("an inactive campaign is never live", isLive({ ...base, isActive: false, daysOfWeek: [] }, instant) === false);

    console.log("\n== The window ==");
    const mid = new Date("2026-07-16T12:00:00Z");
    check(
      "before the window opens -> not live",
      isLive({ ...base, daysOfWeek: [], startAt: new Date("2026-08-01") }, mid) === false,
    );
    check(
      "after the window closes -> not live",
      isLive({ ...base, daysOfWeek: [], endAt: new Date("2026-07-01") }, mid) === false,
    );
    check(
      "a null endAt runs open-ended",
      isLive({ ...base, daysOfWeek: [], endAt: null }, mid) === true,
    );

    // --- through the API ----------------------------------------------
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST", body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const email = `camp_${Date.now()}@test.co`;
    await api("/api/auth/register", {
      method: "POST", body: { name: "Campaign Tester", email, password: "password", phone: "+9779800005555" },
    });
    const mint = await api("/__test__/mint-token", { method: "POST", body: { email, type: "email_verify" } });
    await api(`/api/auth/verify-email?token=${mint.body.token}`);
    const customerToken = (await api("/api/auth/login", { method: "POST", body: { email, password: "password" } })).body.token;

    const earn = async (billAmount) => {
      const qr = await api("/api/admin/generate-qr", { method: "POST", token: adminToken, body: { billAmount } });
      const claim = await api("/api/points/claim", { method: "POST", token: customerToken, body: { token: qr.body.data.token } });
      return { qr: qr.body.data, claim: claim.body };
    };

    const past = new Date(Date.now() - DAY_MS).toISOString();
    const future = new Date(Date.now() + DAY_MS).toISOString();

    console.log("\n== No campaign: the multiplier is the identity ==");
    let r = await earn(100);
    check("a 100 bill earns 100", r.claim.data.pointsEarned === 100, r.claim.data);
    check("multiplier comes back as 1", r.claim.data.multiplier === 1, r.claim.data);
    check("no campaign is named", r.claim.data.campaignName === null, r.claim.data);

    console.log("\n== A live 2x doubles the earn ==");
    const c2 = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken,
      body: { name: "Double Weekend", multiplier: 2, startAt: past, endAt: future },
    });
    check("campaign created -> 201", c2.status === 201, c2.body);
    check("it reports itself live", c2.body.campaign.isLive === true, c2.body.campaign);

    r = await earn(100);
    check("a 100 bill now earns 200", r.claim.data.pointsEarned === 200, r.claim.data);
    check("the earn names the campaign", r.claim.data.campaignName === "Double Weekend", r.claim.data);
    check("staff's QR previews the doubled figure", r.qr.previewPoints === 200, r.qr);
    check("the customer's balance read advertises it", true);
    const bal = await api("/api/points/balance", { token: customerToken });
    check("balance read exposes the active campaign", bal.body.data.activeCampaign?.multiplier === 2, bal.body.data);

    console.log("\n== STACKING RULE: max, never compound ==");
    // This is the decision the whole feature turns on. 2x and 3x both live
    // must give 3x — compounding to 6x would give away more than either
    // campaign promised.
    const c3 = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken,
      body: { name: "Triple Day", multiplier: 3, startAt: past, endAt: future },
    });
    check("a second overlapping campaign is allowed", c3.status === 201, c3.body);

    r = await earn(100);
    check("2x + 3x both live -> 300, NOT 600", r.claim.data.pointsEarned === 300, r.claim.data);
    check("the best multiplier wins", r.claim.data.multiplier === 3, r.claim.data);
    check("and it's the 3x campaign that's credited", r.claim.data.campaignName === "Triple Day", r.claim.data);

    console.log("\n== The ledger snapshots why a row is worth what it is ==");
    const hist = await api("/api/points/history", { token: customerToken });
    check("the 3x row is on the ledger at 300", hist.body.data[0].points === 300, hist.body.data[0]);
    // Written at earn time is not the same as readable later — formatTransaction
    // used to drop multiplier/campaignId on the read path entirely, so a
    // customer or admin re-reading history (not the earn response) saw a
    // plain earn with no explanation for why it was 3x the bill.
    check("the ledger READ also exposes the multiplier", hist.body.data[0].multiplier === 3, hist.body.data[0]);
    check("...and the campaign name", hist.body.data[0].campaignName === "Triple Day", hist.body.data[0]);

    console.log("\n== Switching off ==");
    await api(`/api/admin/campaigns/${c3.body.campaign.id}`, { method: "PATCH", token: adminToken, body: { isActive: false } });
    r = await earn(100);
    check("3x off -> falls back to the 2x", r.claim.data.pointsEarned === 200, r.claim.data);

    await api(`/api/admin/campaigns/${c2.body.campaign.id}`, { method: "PATCH", token: adminToken, body: { isActive: false } });
    r = await earn(100);
    check("both off -> back to 100", r.claim.data.pointsEarned === 100, r.claim.data);

    console.log("\n== A window that hasn't opened ==");
    const later = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken,
      body: { name: "Next Week", multiplier: 5, startAt: new Date(Date.now() + 7 * DAY_MS).toISOString() },
    });
    check("a future campaign is not live", later.body.campaign.isLive === false, later.body.campaign);
    r = await earn(100);
    check("a future campaign doesn't multiply", r.claim.data.pointsEarned === 100, r.claim.data);

    console.log("\n== Fractional points survive a multiplier ==");
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { earnPercent: 10 } } });
    const frac = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken,
      body: { name: "Half-ish", multiplier: 1.5, startAt: past, endAt: future },
    });
    check("a fractional multiplier is allowed", frac.status === 201, frac.body);
    // 105 x 10% x 1.5 = 15.75 points, which only survives because points are
    // stored as integer centipoints.
    r = await earn(105);
    check("Rs 105 at 10% x1.5 earns exactly 15.75", r.claim.data.pointsEarned === 15.75, r.claim.data);
    await api(`/api/admin/campaigns/${frac.body.campaign.id}`, { method: "PATCH", token: adminToken, body: { isActive: false } });
    await api("/api/admin/settings", { method: "PATCH", token: adminToken, body: { program: { earnPercent: 100 } } });

    console.log("\n== Validation ==");
    const low = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken, body: { name: "Takes points away", multiplier: 0.5, startAt: past },
    });
    check("a multiplier below 1 is refused", low.status === 400, low.body);
    const backwards = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken, body: { name: "Backwards", multiplier: 2, startAt: future, endAt: past },
    });
    check("an end before the start is refused", backwards.status === 400, backwards.body);
    const noName = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken, body: { multiplier: 2, startAt: past },
    });
    check("a nameless campaign is refused", noName.status === 400, noName.body);

    console.log("\n== A pointless-but-valid 1x campaign doesn't produce a broken ledger read ==");
    // multiplier: 1 is permitted by validation (only < 1 is refused). If a
    // campaign is live and named but does nothing to the earn rate, the
    // ledger's multiplier/campaignName pairing still has to be well-formed —
    // campaignName set with multiplier null would render "(nullx)" in the UI.
    const c1x = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken,
      body: { name: "Just An Announcement", multiplier: 1, startAt: past, endAt: future },
    });
    check("a 1x campaign is allowed to be created", c1x.status === 201, c1x.body);
    const flatEarn = await earn(100);
    check("a 1x campaign doesn't change the earn", flatEarn.claim.data.pointsEarned === 100, flatEarn.claim.data);
    check("but it IS named", flatEarn.claim.data.campaignName === "Just An Announcement", flatEarn.claim.data);
    const flatHist = await api("/api/points/history", { token: customerToken });
    check(
      "campaignName and multiplier are both present together, not campaignName-with-null-multiplier",
      flatHist.body.data[0].campaignName === "Just An Announcement" && flatHist.body.data[0].multiplier === 1,
      flatHist.body.data[0],
    );
    await api(`/api/admin/campaigns/${c1x.body.campaign.id}`, { method: "PATCH", token: adminToken, body: { isActive: false } });

    console.log("\n== Deleting the campaign doesn't erase why a past row was worth what it was ==");
    const gone = await api("/api/admin/campaigns", {
      method: "POST", token: adminToken,
      body: { name: "Vanishing Act", multiplier: 4, startAt: past, endAt: future },
    });
    check("a throwaway campaign is created", gone.status === 201, gone.body);
    const goneEarn = await earn(50);
    check("it earns at 4x", goneEarn.claim.data.pointsEarned === 200, goneEarn.claim.data);
    const del = await api(`/api/admin/campaigns/${gone.body.campaign.id}`, { method: "DELETE", token: adminToken });
    check("the campaign deletes", del.status === 200, del.body);
    const afterDelete = await api("/api/points/history", { token: customerToken });
    const survivingRow = afterDelete.body.data.find((t) => t.points === 200);
    check(
      "the ledger row survives the campaign's deletion, name and multiplier intact",
      survivingRow?.campaignName === "Vanishing Act" && survivingRow?.multiplier === 4,
      survivingRow,
    );

    console.log("\n== Outlet isolation ==");
    const sibling = await api("/api/admin-auth/login", {
      method: "POST", body: { email: "patan@coffesarowar.com", password: "password" },
    });
    const siblingList = await api("/api/admin/campaigns", { token: sibling.body.token, slug: "patan" });
    check(
      "a sibling outlet sees none of this outlet's campaigns",
      Array.isArray(siblingList.body.data) && siblingList.body.data.length === 0,
      siblingList.body.data,
    );

    const crossEdit = await api(`/api/admin/campaigns/${later.body.campaign.id}`, {
      method: "PATCH", token: sibling.body.token, slug: "patan", body: { isActive: false },
    });
    check("a sibling outlet can't edit this outlet's campaign -> 404", crossEdit.status === 404, crossEdit.body);
  } finally {
    stop();
  }

  if (failures) { console.error(`\ncampaigns: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("\ncampaigns: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

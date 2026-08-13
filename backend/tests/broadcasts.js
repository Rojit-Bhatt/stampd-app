/**
 * Broadcast campaign builder suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Covers CRUD, validation, cross-tenant isolation,
 * evaluateBroadcasts matching/idempotency/consent/pause behavior, and
 * prebuilt seeding at outlet creation.
 *
 * Run directly: `node tests/broadcasts.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function provisionTenantCustomer(api, label, phoneSuffix, slug = SLUG) {
  const email = `${label}_${Date.now()}@test.co`;
  const reg = await api("/api/customer-auth/register", {
    method: "POST",
    slug: null,
    body: { name: label, email, password: "password123", phone: `98111100${phoneSuffix}` },
  });
  const globalToken = reg.body.token;
  const entered = await api("/api/customer-auth/enter-tenant", {
    method: "POST",
    token: globalToken,
    slug,
    body: {},
  });
  return { email, globalToken, tenantToken: entered.body.token, userId: entered.body.user.id };
}

async function getOrgId(baseUrl, companySlug, outletSlug) {
  const resp = await fetch(`${baseUrl}/__test__/get-organization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companySlug, outletSlug }),
  });
  const body = await resp.json();
  return body.organizationId;
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5054 });
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
    const adminLogin = await api("/api/admin-auth/login", {
      method: "POST",
      body: { email: "durbarmarg@coffesarowar.com", password: "password" },
    });
    const adminToken = adminLogin.body.token;

    const emptyList = await api("/api/admin/broadcasts", { token: adminToken });
    check("GET /broadcasts starts as an array (may already hold prebuilts once Task 3 lands)", Array.isArray(emptyList.body.data));

    const badChannel = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "carrier-pigeon", segmentType: "all", subject: "Hi", body: "Hi there" },
    });
    check("invalid channel is rejected", badChannel.status === 400);

    const badSegment = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "planet", subject: "Hi", body: "Hi there" },
    });
    check("invalid segmentType is rejected", badSegment.status === 400);

    const missingTier = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "tier", subject: "Hi", body: "Hi there" },
    });
    check("segmentType tier without a valid segmentTier is rejected", missingTier.status === 400);

    const created = await api("/api/admin/broadcasts", {
      method: "POST", token: adminToken,
      body: { channel: "email", segmentType: "tier", segmentTier: "Gold", subject: "Welcome to Gold", body: "You made it!" },
    });
    // POST /broadcasts is now rate-limited (10 per IP per 15 min, see
    // broadcastLimiter). This suite needs seven POSTs from the same process
    // (three validation probes plus four creates), comfortably under that
    // cap — the validation probes run first so a real cap breach (429) would
    // fail loudly instead of silently corrupting a later assertion.
    check("create broadcast -> 201", created.status === 201);
    check("created broadcast is active by default", created.body.broadcast.active === true);
    check("created broadcast has zeroed counts", created.body.broadcast.sentCount === 0 && created.body.broadcast.failedCount === 0 && created.body.broadcast.noConsentCount === 0);

    const broadcastId = created.body.broadcast.id;

    const listed = await api("/api/admin/broadcasts", { token: adminToken });
    check("listed broadcasts includes the new one", listed.body.data.some((b) => b.id === broadcastId));

    const paused = await api(`/api/admin/broadcasts/${broadcastId}`, {
      method: "PATCH", token: adminToken, body: { active: false },
    });
    check("PATCH active:false pauses the broadcast", paused.body.broadcast.active === false);

    const editedContent = await api(`/api/admin/broadcasts/${broadcastId}`, {
      method: "PATCH", token: adminToken, body: { subject: "Congrats on Gold!", body: "New copy." },
    });
    check("PATCH edits subject/body", editedContent.body.broadcast.subject === "Congrats on Gold!" && editedContent.body.broadcast.body === "New copy.");
    check("segment/channel are unaffected by a content-only PATCH", editedContent.body.broadcast.segmentTier === "Gold" && editedContent.body.broadcast.channel === "email");

    const detail = await api(`/api/admin/broadcasts/${broadcastId}`, { token: adminToken });
    check("detail view returns an empty recipients list before any evaluation", Array.isArray(detail.body.data.recipients) && detail.body.data.recipients.length === 0);

    // Cross-tenant isolation: a sibling outlet must never see this broadcast.
    const sibling = await makeSiblingOutlet(baseUrl, { label: `bc${Date.now()}` });
    const siblingList = await api("/api/admin/broadcasts", { token: sibling.adminToken, slug: sibling.outletSlug });
    check("a sibling outlet's broadcast list never includes another outlet's broadcast", !siblingList.body.data.some((b) => b.id === broadcastId));

    const siblingDetailAttempt = await api(`/api/admin/broadcasts/${broadcastId}`, { token: sibling.adminToken, slug: sibling.outletSlug });
    check("a sibling outlet cannot fetch another outlet's broadcast detail by id", siblingDetailAttempt.status === 404);

    const deleted = await api(`/api/admin/broadcasts/${broadcastId}`, { method: "DELETE", token: adminToken });
    check("DELETE removes the broadcast", deleted.status === 200);

    const afterDelete = await api("/api/admin/broadcasts", { token: adminToken });
    check("deleted broadcast no longer appears in the list", !afterDelete.body.data.some((b) => b.id === broadcastId));

    // --- evaluateBroadcasts: matching, idempotency, consent, pause ---

    const orgId = await getOrgId(baseUrl, COMPANY, SLUG);

    // Configure Gold thresholds low enough that a single earn crosses them.
    await api("/api/admin/settings", {
      method: "PATCH", token: adminToken,
      body: { tierThresholds: { Gold: { minVisits: 1, minSpend: 0 } } },
    });

    const goldTenant = await makeSiblingOutlet(baseUrl, { label: `gold${Date.now()}` });
    await api("/api/admin/settings", {
      method: "PATCH", token: goldTenant.adminToken, slug: goldTenant.outletSlug,
      body: { tierThresholds: { Gold: { minVisits: 1, minSpend: 0 } } },
    });
    const goldBroadcast = await api("/api/admin/broadcasts", {
      method: "POST", token: goldTenant.adminToken, slug: goldTenant.outletSlug,
      body: { channel: "email", segmentType: "tier", segmentTier: "Gold", subject: "Welcome to Gold!", body: "You made it." },
    });
    const goldBroadcastId = goldBroadcast.body.broadcast.id;

    const goldCustomer = await provisionTenantCustomer(api, "GoldReacher", "20", goldTenant.outletSlug);
    await api("/api/customer-auth/preferences", { method: "PATCH", token: goldCustomer.globalToken, slug: null, body: { emailOptIn: true } });

    const gen1 = await api("/api/admin/generate-qr", { method: "POST", token: goldTenant.adminToken, slug: goldTenant.outletSlug, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen1.body.data.token } });

    const goldDetailAfterFirst = await api(`/api/admin/broadcasts/${goldBroadcastId}`, { token: goldTenant.adminToken, slug: goldTenant.outletSlug });
    check("tier broadcast fires exactly once, the earn that reaches Gold", goldDetailAfterFirst.body.data.sentCount === 1);
    check("the sent recipient is the customer who just reached Gold", goldDetailAfterFirst.body.data.recipients.some((r) => r.userId === goldCustomer.userId && r.status === "sent"));

    const gen2 = await api("/api/admin/generate-qr", { method: "POST", token: goldTenant.adminToken, slug: goldTenant.outletSlug, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen2.body.data.token } });
    const goldDetailAfterSecond = await api(`/api/admin/broadcasts/${goldBroadcastId}`, { token: goldTenant.adminToken, slug: goldTenant.outletSlug });
    check("idempotency: a further earn after already matching does not re-send or re-log", goldDetailAfterSecond.body.data.sentCount === 1 && goldDetailAfterSecond.body.data.recipients.length === 1);

    // A customer without email consent who also reaches Gold gets logged
    // no_consent, not sent, and no email is attempted.
    const noConsentGold = await provisionTenantCustomer(api, "GoldNoConsent", "21", goldTenant.outletSlug);
    const gen3 = await api("/api/admin/generate-qr", { method: "POST", token: goldTenant.adminToken, slug: goldTenant.outletSlug, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: noConsentGold.tenantToken, body: { token: gen3.body.data.token } });
    const goldDetailAfterNoConsent = await api(`/api/admin/broadcasts/${goldBroadcastId}`, { token: goldTenant.adminToken, slug: goldTenant.outletSlug });
    check("a matching customer without consent is logged no_consent", goldDetailAfterNoConsent.body.data.recipients.some((r) => r.userId === noConsentGold.userId && r.status === "no_consent"));
    check("no_consent does not count as sent", goldDetailAfterNoConsent.body.data.sentCount === 1);

    // An "all customers" broadcast fires once for an EXISTING customer (one
    // who already had activity before the broadcast existed) on their next
    // earn, and not again after that.
    // Reuse goldTenant for the all-segment broadcast instead of spinning up
    // a fifth sibling outlet: POST /broadcasts is rate-limited to 5 per IP
    // per 15 minutes, and this suite already needs four creates
    // (invalid ×3 do not consume the bucket — they fail validation first).
    // The semantics are unchanged: an "all customers" broadcast fires once
    // for an EXISTING customer (goldCustomer already had activity before
    // the broadcast existed) on their next earn, and not again after that.
    const allBroadcast = await api("/api/admin/broadcasts", {
      method: "POST", token: goldTenant.adminToken, slug: goldTenant.outletSlug,
      body: { channel: "email", segmentType: "all", subject: "Hey there", body: "Thanks for being here." },
    });
    const allBroadcastId = allBroadcast.body.broadcast.id;

    const gen4 = await api("/api/admin/generate-qr", { method: "POST", token: goldTenant.adminToken, slug: goldTenant.outletSlug, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen4.body.data.token } });
    const allDetailAfterFirst = await api(`/api/admin/broadcasts/${allBroadcastId}`, { token: goldTenant.adminToken, slug: goldTenant.outletSlug });
    check("all-segment broadcast fires once for an existing customer on their next earn", allDetailAfterFirst.body.data.sentCount === 1);

    const gen5 = await api("/api/admin/generate-qr", { method: "POST", token: goldTenant.adminToken, slug: goldTenant.outletSlug, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: goldCustomer.tenantToken, body: { token: gen5.body.data.token } });
    const allDetailAfterSecond = await api(`/api/admin/broadcasts/${allBroadcastId}`, { token: goldTenant.adminToken, slug: goldTenant.outletSlug });
    check("all-segment broadcast does not re-fire for the same customer", allDetailAfterSecond.body.data.sentCount === 1);

    // Pausing stops future matches; reactivating does not retroactively
    // catch up on a match that occurred while paused.
    const pauseTenant = await makeSiblingOutlet(baseUrl, { label: `pause${Date.now()}` });
    const pauseBroadcast = await api("/api/admin/broadcasts", {
      method: "POST", token: pauseTenant.adminToken, slug: pauseTenant.outletSlug,
      body: { channel: "email", segmentType: "all", subject: "Pause test", body: "Should not fire while paused." },
    });
    const pauseBroadcastId = pauseBroadcast.body.broadcast.id;
    await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { method: "PATCH", token: pauseTenant.adminToken, slug: pauseTenant.outletSlug, body: { active: false } });

    const pausedCustomer = await provisionTenantCustomer(api, "PausedRule", "22", pauseTenant.outletSlug);
    await api("/api/customer-auth/preferences", { method: "PATCH", token: pausedCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const genPaused = await api("/api/admin/generate-qr", { method: "POST", token: pauseTenant.adminToken, slug: pauseTenant.outletSlug, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: pausedCustomer.tenantToken, body: { token: genPaused.body.data.token } });

    const pauseDetailWhilePaused = await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { token: pauseTenant.adminToken, slug: pauseTenant.outletSlug });
    check("a paused broadcast does not fire for a newly matching customer", pauseDetailWhilePaused.body.data.sentCount === 0);

    await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { method: "PATCH", token: pauseTenant.adminToken, slug: pauseTenant.outletSlug, body: { active: true } });
    const pauseDetailAfterReactivate = await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { token: pauseTenant.adminToken, slug: pauseTenant.outletSlug });
    check("reactivating does NOT retroactively catch up a match that occurred while paused", pauseDetailAfterReactivate.body.data.sentCount === 0);

    const genReactivated = await api("/api/admin/generate-qr", { method: "POST", token: pauseTenant.adminToken, slug: pauseTenant.outletSlug, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: pausedCustomer.tenantToken, body: { token: genReactivated.body.data.token } });
    const pauseDetailAfterFurtherEarn = await api(`/api/admin/broadcasts/${pauseBroadcastId}`, { token: pauseTenant.adminToken, slug: pauseTenant.outletSlug });
    check("a further earn AFTER reactivating fires normally", pauseDetailAfterFurtherEarn.body.data.sentCount === 1);

    // Cross-tenant isolation: an earn at a sibling outlet must never feed a
    // broadcast that belongs to this outlet.
    const sibling2 = await makeSiblingOutlet(baseUrl, { label: `bceval${Date.now()}` });
    const siblingCustomer = await provisionTenantCustomer(api, "SiblingEval", "23", sibling2.outletSlug);
    await api("/api/customer-auth/preferences", { method: "PATCH", token: siblingCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const genSibling = await api("/api/admin/generate-qr", { method: "POST", token: sibling2.adminToken, body: { billAmount: 100 } });
    await api("/api/points/claim", { method: "POST", token: siblingCustomer.tenantToken, body: { token: genSibling.body.data.token } });

    // allBroadcast lives on goldTenant now; reading its detail needs that
    // tenant's token (a durbarmarg token gets the expected 404 — isolation).
    const allDetailAfterSiblingEarn = await api(`/api/admin/broadcasts/${allBroadcastId}`, {
      token: goldTenant.adminToken, slug: goldTenant.outletSlug,
    });
    check("an earn at a sibling outlet never feeds this outlet's broadcast",
      Array.isArray(allDetailAfterSiblingEarn.body.data.recipients) &&
      !allDetailAfterSiblingEarn.body.data.recipients.some((r) => r.userId === siblingCustomer.userId));

    // --- prebuilt seeding at outlet creation ---
    // demoSeed.js's outlets get these too, automatically, by virtue of also
    // calling createOutlet — no separate demo-seed-only code path exists.
    const freshOutlet = await makeSiblingOutlet(baseUrl, { label: `prebuilt${Date.now()}` });
    const freshOutletBroadcasts = await api("/api/admin/broadcasts", { token: freshOutlet.adminToken, slug: freshOutlet.outletSlug });
    check("a newly created outlet gets exactly 2 prebuilt broadcasts", freshOutletBroadcasts.body.data.length === 2);
    check("both prebuilts are active by default", freshOutletBroadcasts.body.data.every((b) => b.active === true));
    check("one prebuilt targets all customers on email", freshOutletBroadcasts.body.data.some((b) => b.segmentType === "all" && b.channel === "email"));
    check("one prebuilt targets Gold tier on email", freshOutletBroadcasts.body.data.some((b) => b.segmentType === "tier" && b.segmentTier === "Gold" && b.channel === "email"));
  } finally {
    stop();
  }

  if (failures) { console.error(`broadcasts: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("broadcasts: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

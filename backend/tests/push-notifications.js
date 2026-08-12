/**
 * Web Push notifications suite.
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. Confirms sendTrigger's independent email/push
 * branching, and the 410-prune behavior, using test-hooks to create
 * subscription rows and stub web-push's send call directly — real browser
 * push delivery is not testable in this harness. Grows in Task 2 to cover
 * the subscribe/unsubscribe endpoints.
 *
 * Run directly: `node tests/push-notifications.js`
 */

const { bootServer } = require("./helpers/bootServer");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";

async function getOrgId(baseUrl, companySlug, outletSlug) {
  const resp = await fetch(`${baseUrl}/__test__/get-organization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companySlug, outletSlug }),
  });
  const body = await resp.json();
  return body.organizationId;
}

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
  return {
    email,
    globalToken,
    tenantToken: entered.body.token,
    userId: entered.body.user.id,
    accountId: reg.body.account.id,
  };
}

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
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
    const orgId = await getOrgId(baseUrl, COMPANY, SLUG);

    // Push-only consent: no email, still sends via push alone.
    const pushOnlyCustomer = await provisionTenantCustomer(api, "PushOnly", "20");
    await fetch(`${baseUrl}/__test__/create-push-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerAccountId: pushOnlyCustomer.accountId,
        endpoint: `https://push.example/${Date.now()}`,
        keys: { p256dh: "p", auth: "a" },
        grantConsent: true,
      }),
    });

    const sendResp1 = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: pushOnlyCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("push-only consent still sends (email skipped, push used)", sendResp1.body.sent === true);

    // Neither channel consented: refuses to send.
    const noConsentCustomer = await provisionTenantCustomer(api, "PushNoConsent", "21");
    const sendResp2 = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: noConsentCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("no consent on either channel refuses to send", sendResp2.body.sent === false && sendResp2.body.reason === "no_consent");

    // Email-only consent still works after the restructure (regression
    // against Phase 3a's original behavior).
    const emailOnlyCustomer = await provisionTenantCustomer(api, "PushEmailOnly", "24");
    await api("/api/customer-auth/preferences", { method: "PATCH", token: emailOnlyCustomer.globalToken, slug: null, body: { emailOptIn: true } });
    const sendResp3 = await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: emailOnlyCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check("email-only consent still sends (unaffected by the push restructure)", sendResp3.body.sent === true);

    // A dead subscription (web-push returns 410) gets pruned.
    await fetch(`${baseUrl}/__test__/stub-webpush-behavior`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behavior: "gone" }),
    });

    const pruneCustomer = await provisionTenantCustomer(api, "PushPrune", "22");
    await fetch(`${baseUrl}/__test__/create-push-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerAccountId: pruneCustomer.accountId,
        endpoint: `https://push.example/prune-${Date.now()}`,
        keys: { p256dh: "p", auth: "a" },
        grantConsent: true,
      }),
    });

    await fetch(`${baseUrl}/__test__/send-trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, userId: pruneCustomer.userId, type: "milestone", context: { visitCount: 1 } }),
    });

    // The push send is fire-and-forget (matching this codebase's email
    // convention), so the prune happens asynchronously — a short wait lets
    // it land before asserting, same tradeoff any fire-and-forget send
    // makes for testability.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const subsCountResp = await fetch(`${baseUrl}/__test__/push-subscription-count?customerAccountId=${pruneCustomer.accountId}`).then((r) => r.json());
    check("a 410 response prunes the dead subscription", subsCountResp.count === 0);

    const subsCustomer = await provisionTenantCustomer(api, "SubsFlow", "23");

    const saveResp = await api("/api/customer-auth/push-subscription", {
      method: "POST",
      token: subsCustomer.globalToken,
      slug: null,
      body: { endpoint: "https://push.example/subs-1", keys: { p256dh: "p1", auth: "a1" } },
    });
    check("POST push-subscription grants push consent", saveResp.body.account?.marketingConsent?.push?.granted === true);

    const saveResp2 = await api("/api/customer-auth/push-subscription", {
      method: "POST",
      token: subsCustomer.globalToken,
      slug: null,
      body: { endpoint: "https://push.example/subs-1", keys: { p256dh: "p1-updated", auth: "a1" } },
    });
    check("POSTing the same endpoint again succeeds (updates, not a duplicate)", saveResp2.status === 200);

    const countAfterUpsert = await fetch(`${baseUrl}/__test__/push-subscription-count?customerAccountId=${subsCustomer.accountId}`).then((r) => r.json());
    check("upserting the same endpoint results in exactly one row", countAfterUpsert.count === 1);

    const deleteResp = await api("/api/customer-auth/push-subscription", {
      method: "DELETE",
      token: subsCustomer.globalToken,
      slug: null,
      body: { endpoint: "https://push.example/subs-1" },
    });
    check("DELETE revokes push consent when it was the last device", deleteResp.body.account?.marketingConsent?.push?.granted === false);
  } finally {
    stop();
  }

  if (failures) { console.error(`push-notifications: ${failures} FAILED`); process.exitCode = 1; }
  else console.log("push-notifications: all PASS");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

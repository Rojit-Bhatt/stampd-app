/**
 * sms-daily-quota.js — Task 3: tenant daily SMS quota (T1 money control)
 *
 * The quota applies to EVERY sendSms call — capped at DAILY_SMS_QUOTA (3,
 * set via the child process env) successful sends per UTC day per
 * (company, organization) pair. The 4th send must throw the standard
 * createHttpError(429, ...) shaped response — the same {success: false,
 * message} JSON that the Express error handler emits for http-errors
 * instances. A DIFFERENT organizationId under the same company keeps its
 * own counter and keeps sending.
 *
 * Run directly: `node tests/sms-daily-quota.js`
 */
const { bootServer } = require("./helpers/bootServer");
const { makeCompanyWithOutlet, makeSiblingOutlet } = require("./helpers/makeOutlet");

const COMPANY = "coffesarowar";
const SLUG = "durbarmarg";
// Quota low enough to exercise the cap without waiting for a UTC rollover:
// 3 allowed sends, the 4th must be refused.
const DAILY_SMS_QUOTA = 3;

async function getCompanyId(baseUrl, companySlug) {
  const resp = await fetch(`${baseUrl}/__test__/get-company`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companySlug }),
  });
  const body = await resp.json();
  return body.companyId;
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
  // Ephemeral port — fixed ports collide with TIME_WAIT leftovers from
  // earlier suite runs (undici then surfaces "fetch failed / bad port").
  const port = 5200 + (Date.now() % 1200);
  const { baseUrl, stop } = await bootServer({
    port,
    env: { DAILY_SMS_QUOTA: String(DAILY_SMS_QUOTA) },
  });

  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };

  const api = (path, { method = "GET", body } = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  try {
    const companyId = await getCompanyId(baseUrl, COMPANY);
    const organizationId = await getOrgId(baseUrl, COMPANY, SLUG);
    // Enable SMS: cap large enough that the monthly paisa check never
    // intervenes — this suite is about the daily volume quota, not spend.
    await api("/__test__/set-sms-cap", {
      method: "POST",
      body: { companyId, smsMonthlyCapPaisa: 1_000_000 },
    });

    // --- the quota itself ---
    const sends = [];
    for (let i = 1; i <= DAILY_SMS_QUOTA + 1; i++) {
      const r = await api("/__test__/send-sms", {
        method: "POST",
        body: {
          companyId,
          organizationId,
          to: `+97798111100${50 + i}`,
          text: `daily-quota-msg-${i}`,
        },
      });
      sends.push(r);
    }
    for (let i = 0; i < DAILY_SMS_QUOTA; i++) {
      check(`send ${i + 1} of ${DAILY_SMS_QUOTA} succeeds under the daily quota`,
        sends[i].body.sent === true);
    }
    const breach = sends[DAILY_SMS_QUOTA];
    check("the 4th send is refused by the daily quota", breach.status === 429);
    check("429 body carries the daily-quota message",
      breach.body && breach.body.success === false &&
      String(breach.body.message).toLowerCase().includes("daily sms"));
    check("the refused send leaves no log row behind",
      breach.body && !("sent" in breach.body));

    // --- per-organization isolation: same company, different org ---
    const sibling = await makeSiblingOutlet(baseUrl, { label: `smsq${Date.now()}` });
    const siblingOrgId = await getOrgId(baseUrl, COMPANY, sibling.outletSlug);
    const siblingSend = await api("/__test__/send-sms", {
      method: "POST",
      body: {
        companyId,
        organizationId: siblingOrgId,
        to: "+9779811110099",
        text: "daily-quota-sibling",
      },
    });
    check("a different org under the same company keeps its own counter — its 1st send succeeds even though the original org is capped",
      siblingSend.body.sent === true);
    const siblingSend2 = await api("/__test__/send-sms", {
      method: "POST",
      body: {
        companyId,
        organizationId: siblingOrgId,
        to: "+9779811110098",
        text: "daily-quota-sibling-2",
      },
    });
    check("the sibling org has its own full budget — its 2nd send succeeds too",
      siblingSend2.body.sent === true);

    // --- the original org stays capped (no leak, no reset) ---
    const stillCapped = await api("/__test__/send-sms", {
      method: "POST",
      body: {
        companyId,
        organizationId,
        to: "+9779811110097",
        text: "daily-quota-still-capped",
      },
    });
    check("the capped org stays capped — its 5th attempt is still 429",
      stillCapped.status === 429);
  } finally {
    stop();
  }

  console.log(`\nsms-daily-quota: ${failures === 0 ? "all PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

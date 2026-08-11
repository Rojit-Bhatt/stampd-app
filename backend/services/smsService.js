const Company = require("../models/Company");
const SmsSendLog = require("../models/SmsSendLog");
const { PLATFORM_TIMEZONE, SMS_COST_PAISA_PER_MESSAGE } = require("../config/platform");

// Start of the current calendar month, judged in PLATFORM_TIMEZONE — a
// Nepal-only platform, same convention campaignService.localDayOfWeek
// already uses for day-of-week judging. No cron: "is this month capped" is
// answered fresh on every send attempt, exactly like subscription expiry.
const startOfCurrentMonth = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLATFORM_TIMEZONE,
    year: "numeric",
    month: "numeric"
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  return new Date(Date.UTC(year, month - 1, 1));
};

// Sparrow accepts a local 10-digit number (e.g. 98XXXXXXXX) — strip any
// leading +977/977/0 a customer's stored number might carry. THIS FORMAT IS
// UNVERIFIED against a live account — confirm before production.
const normalizePhone = (raw) => {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("977")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  return digits;
};

const apiConfigured = () => Boolean(process.env.SPARROW_SMS_API_KEY);

// THE REQUEST/RESPONSE SHAPE HERE IS UNVERIFIED against a live Sparrow
// account — built against their publicly documented API. Confirm before
// production.
const sendViaSparrowApi = async ({ to, text }) => {
  const params = new URLSearchParams({
    token: process.env.SPARROW_SMS_API_KEY,
    from: process.env.SPARROW_SMS_FROM || "",
    to,
    text
  });
  // Circuit-broken: a dead or slow Sparrow fast-fails (never hangs the
  // admin past timeoutMs) and repeated failures open the circuit for all
  // SMS callers at once. Failures still throw plain Errors so the cap check
  // and "sending failed" semantics in sendSms are unchanged.
  const { sparrowSmsBreaker } = require("../utils/dependencyBreakers");
  const res = await sparrowSmsBreaker.exec(async () =>
    fetch(`https://api.sparrowsms.com/v2/sms/?${params.toString()}`)
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.response_code !== 200) {
    throw new Error(`Sparrow SMS API responded ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
};

// The single entrypoint for every SMS send in the app, from either the
// canned-trigger path or Broadcast — centralizing the cap check here is
// what makes "check the cap once" possible instead of duplicating it in
// both callers.
const sendSms = async ({ companyId, organizationId, to, text }) => {
  const company = await Company.findOne({ _id: companyId });
  if (!company || company.smsMonthlyCapPaisa === null || company.smsMonthlyCapPaisa === undefined) {
    return { sent: false, reason: "sms_not_enabled" };
  }

  const monthStart = startOfCurrentMonth();
  const logsThisMonth = await SmsSendLog.find({ companyId, sentAt: { $gte: monthStart } });
  const spentPaisa = logsThisMonth.reduce((sum, l) => sum + l.costPaisa, 0);

  if (spentPaisa + SMS_COST_PAISA_PER_MESSAGE > company.smsMonthlyCapPaisa) {
    return { sent: false, reason: "cap_reached" };
  }

  const normalized = normalizePhone(to);
  if (apiConfigured()) {
    await sendViaSparrowApi({ to: normalized, text });
  } else {
    console.log(`[sms:stub] to=${normalized} text="${text}"`);
  }

  await SmsSendLog.create({ companyId, organizationId, costPaisa: SMS_COST_PAISA_PER_MESSAGE });
  return { sent: true };
};

module.exports = { sendSms };

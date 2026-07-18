const nodemailer = require("nodemailer");

const APP_BASE_URL = () => process.env.APP_BASE_URL || "http://localhost:3000";

// Compose a tenant-scoped link:
//   http://localhost:3000/coffesarowar/durbarmarg/verify-email?token=...
//
// BOTH slugs are required and neither may be omitted. An outlet slug is only
// unique within its company, so a one-segment `/durbarmarg/verify-email` does
// not resolve to an outlet at all — React Router reads it as
// company=durbarmarg, outlet=verify-email, and the customer lands on a 404
// with no way to recover their account. This is the server-side twin of
// frontend/src/lib/tenantPath.ts, and it exists for the same reason.
const buildAuthLink = ({ companySlug, outletSlug, path, token }) => {
  if (!companySlug || !outletSlug) {
    throw new Error(
      `buildAuthLink needs both slugs (got company=${companySlug}, outlet=${outletSlug}) — ` +
        "a one-segment tenant link silently resolves to the wrong place."
    );
  }
  return `${APP_BASE_URL()}/${companySlug}/${outletSlug}/${path}?token=${encodeURIComponent(token)}`;
};

const FROM_ADDRESS = () => process.env.SMTP_FROM || "no-reply@stampd.co";

const apiConfigured = () => Boolean(process.env.BREVO_API_KEY);
const smtpConfigured = () => Boolean(process.env.SMTP_HOST);

// Brevo's HTTPS transactional-email API (port 443) — the preferred delivery
// path wherever it's configured. Several free hosts (Render's free web
// services since Sep 2025, among others) block outbound SMTP ports (25, 465,
// 587) entirely as an anti-spam measure; that block is independent of the
// service being "asleep" or not, so it can't be worked around with a
// keep-alive ping. Port 443 is never blocked, so this is what makes real
// email delivery possible on a $0 host at all.
const sendViaBrevoApi = async ({ to, subject, html }) => {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      sender: { email: FROM_ADDRESS() },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API responded ${res.status}: ${body.slice(0, 300)}`);
  }
};

// Plain SMTP (nodemailer) — still the path for local dev against a real
// mailbox, or any host that doesn't block outbound SMTP ports. Not reachable
// on Render's free tier (see above); kept as a fallback rather than removed,
// since it's provider-agnostic where the Brevo API call above is not.
let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    });
  }
  return transporter;
};

const sendViaSmtp = async ({ to, subject, html }) => {
  await getTransporter().sendMail({ from: FROM_ADDRESS(), to, subject, html });
};

// Single delivery interface. Tries, in order: Brevo's HTTP API (if
// BREVO_API_KEY is set), plain SMTP (if SMTP_HOST is set), or — with neither
// configured (dev/test) — logs the message (including any link in the html)
// and returns stubbed:true so the whole flow is testable with zero
// infrastructure.
const sendEmail = async ({ to, subject, html }) => {
  if (apiConfigured()) {
    await sendViaBrevoApi({ to, subject, html });
    return { ok: true };
  }
  if (smtpConfigured()) {
    await sendViaSmtp({ to, subject, html });
    return { ok: true };
  }
  console.log(`[email:stub] to=${to} subject="${subject}"`);
  console.log(`[email:stub] body=${html}`);
  return { ok: true, stubbed: true };
};

module.exports = { sendEmail, buildAuthLink };

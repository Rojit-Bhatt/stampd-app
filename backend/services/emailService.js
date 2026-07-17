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

const smtpConfigured = () => Boolean(process.env.SMTP_HOST);

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

// Single delivery interface. With no SMTP configured (dev), logs the message
// (including any link in the html) and returns stubbed:true so the whole flow
// is testable with zero infrastructure.
const sendEmail = async ({ to, subject, html }) => {
  if (!smtpConfigured()) {
    console.log(`[email:stub] to=${to} subject="${subject}"`);
    console.log(`[email:stub] body=${html}`);
    return { ok: true, stubbed: true };
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || "no-reply@stampd.co",
    to,
    subject,
    html
  });
  return { ok: true };
};

module.exports = { sendEmail, buildAuthLink };

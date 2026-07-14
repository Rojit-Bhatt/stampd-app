const nodemailer = require("nodemailer");

const APP_BASE_URL = () => process.env.APP_BASE_URL || "http://localhost:3000";

// Compose a tenant-scoped link, e.g. http://localhost:3000/coffesarowar/verify-email?token=...
const buildAuthLink = ({ slug, path, token }) =>
  `${APP_BASE_URL()}/${slug}/${path}?token=${encodeURIComponent(token)}`;

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

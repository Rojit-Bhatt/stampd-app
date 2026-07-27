const { sendEmail } = require("./emailService");
const MessageLog = require("../models/MessageLog");
const PointsTransaction = require("../models/PointsTransaction");
const CustomerAccount = require("../models/CustomerAccount");

const renderTemplate = (type, { organization, customer, context }) => {
  if (type === "milestone") {
    return {
      subject: `You've visited ${organization.name} ${context.visitCount} times!`,
      html: `<p>Hi ${customer.name}, that's ${context.visitCount} visits to ${organization.name} — thanks for being a regular. See you again soon.</p>`
    };
  }
  if (type === "birthday") {
    return {
      subject: `Happy birthday from ${organization.name}!`,
      html: `<p>Hi ${customer.name}, happy birthday from all of us at ${organization.name}. Hope it's a good one — come by and treat yourself.</p>`
    };
  }
  if (type === "inactivity") {
    return {
      subject: `We miss you at ${organization.name}`,
      html: `<p>Hi ${customer.name}, it's been a while since your last visit to ${organization.name}. You've still got ${context.balance} points waiting — come say hi.</p>`
    };
  }
  throw new Error(`Unknown trigger type: ${type}`);
};

const sendTrigger = async (type, { organization, customer, membership, context = {} }) => {
  if (!customer.marketingConsent?.email?.granted) {
    return { sent: false, reason: "no_consent" };
  }

  const { subject, html } = renderTemplate(type, { organization, customer, context });

  sendEmail({ to: customer.email, subject, html })
    .catch((err) => console.error(`Failed to send ${type} trigger to ${customer.email}:`, err.message));

  await MessageLog.create({ organizationId: organization._id, userId: membership._id, triggerType: type });

  return { sent: true };
};

const checkMilestoneTrigger = async ({ organization, membership }) => {
  const visitCount = organization.messagingTriggers?.milestone?.visitCount;
  if (visitCount === null || visitCount === undefined) return;

  const earns = await PointsTransaction.countDocuments({
    organizationId: organization._id,
    userId: membership._id,
    type: "earn"
  });
  if (earns !== visitCount) return;

  if (!membership.customerAccountId) return;
  const customer = await CustomerAccount.findOne({ _id: membership.customerAccountId });
  if (!customer) return;

  await sendTrigger("milestone", { organization, customer, membership, context: { visitCount } });
};

module.exports = { sendTrigger, checkMilestoneTrigger };

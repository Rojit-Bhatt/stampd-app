const Broadcast = require("../models/Broadcast");
const BroadcastLog = require("../models/BroadcastLog");
const User = require("../models/User");
const CustomerAccount = require("../models/CustomerAccount");
const PushSubscription = require("../models/PushSubscription");
const { resolveTier } = require("./tierService");
const { sendEmail } = require("./emailService");
const { sendPushToSubscription } = require("./messagingService");
const { sendSms } = require("./smsService");
const { TIER_LABELS } = require("../config/platform");

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const CHANNELS = ["email", "push", "sms"];
const SEGMENT_TYPES = ["tier", "all"];

const parseInput = (input) => {
  const channel = String(input.channel || "");
  if (!CHANNELS.includes(channel)) {
    throw createHttpError("Pick a channel: email, push, or SMS.", 400);
  }

  const segmentType = String(input.segmentType || "");
  if (!SEGMENT_TYPES.includes(segmentType)) {
    throw createHttpError("Pick a segment: a tier, or all customers.", 400);
  }

  let segmentTier = null;
  if (segmentType === "tier") {
    segmentTier = String(input.segmentTier || "");
    if (!TIER_LABELS.includes(segmentTier)) {
      throw createHttpError("Pick a valid tier label.", 400);
    }
  }

  const subject = String(input.subject || "").trim();
  if (!subject) throw createHttpError("Give it a subject or title.", 400);

  const body = String(input.body || "").trim();
  if (!body) throw createHttpError("Write the message.", 400);

  return { channel, segmentType, segmentTier, subject, body };
};

const getCounts = async (broadcastId) => {
  const logs = await BroadcastLog.find({ broadcastId });
  return {
    sentCount: logs.filter((l) => l.status === "sent").length,
    failedCount: logs.filter((l) => l.status === "failed").length,
    noConsentCount: logs.filter((l) => l.status === "no_consent").length
  };
};

const format = (b, counts) => ({
  id: b._id.toString(),
  channel: b.channel,
  segmentType: b.segmentType,
  segmentTier: b.segmentTier,
  subject: b.subject,
  body: b.body,
  active: b.active,
  createdAt: b.createdAt,
  sentCount: counts.sentCount,
  failedCount: counts.failedCount,
  noConsentCount: counts.noConsentCount
});

const listBroadcasts = async (organizationId) => {
  const rows = await Broadcast.find({ organizationId }).sort({ createdAt: -1 });
  return Promise.all(rows.map(async (b) => format(b, await getCounts(b._id))));
};

const createBroadcast = async (organizationId, input) => {
  const parsed = parseInput(input);
  const created = await Broadcast.create({ organizationId, ...parsed, active: true });
  return format(created, await getCounts(created._id));
};

// Segment/channel are NOT editable — changing them after some evaluation
// has already happened would make existing BroadcastLog rows describe a
// different rule retroactively. Delete and recreate to change segment or
// channel.
const updateBroadcast = async (organizationId, id, input) => {
  const broadcast = await Broadcast.findOne({ _id: id, organizationId });
  if (!broadcast) throw createHttpError("Broadcast not found.", 404);

  if (input.active !== undefined) {
    broadcast.active = Boolean(input.active);
  }
  if (input.subject !== undefined) {
    const subject = String(input.subject).trim();
    if (!subject) throw createHttpError("Give it a subject or title.", 400);
    broadcast.subject = subject;
  }
  if (input.body !== undefined) {
    const body = String(input.body).trim();
    if (!body) throw createHttpError("Write the message.", 400);
    broadcast.body = body;
  }

  await broadcast.save();
  return format(broadcast, await getCounts(broadcast._id));
};

const deleteBroadcast = async (organizationId, id) => {
  const broadcast = await Broadcast.findOne({ _id: id, organizationId });
  if (!broadcast) throw createHttpError("Broadcast not found.", 404);
  await Broadcast.deleteOne({ _id: broadcast._id });
  await BroadcastLog.deleteMany({ broadcastId: broadcast._id });
  return { success: true };
};

// Per-recipient drill-down: the broadcast plus every BroadcastLog row for
// it, each enriched with the customer's name/email off the User membership
// row (a direct lookup, not a Mongoose populate — kept independent of
// populate's limited path coverage elsewhere in this codebase).
const getBroadcastDetail = async (organizationId, id) => {
  const broadcast = await Broadcast.findOne({ _id: id, organizationId });
  if (!broadcast) throw createHttpError("Broadcast not found.", 404);

  const logs = await BroadcastLog.find({ broadcastId: broadcast._id, organizationId }).sort({ sentAt: -1 });
  const recipients = await Promise.all(
    logs.map(async (log) => {
      const member = await User.findOne({ _id: log.userId, organizationId });
      return {
        userId: log.userId.toString(),
        name: member ? member.name : "(deleted customer)",
        email: member ? member.email : "",
        status: log.status,
        sentAt: log.sentAt
      };
    })
  );

  return { ...format(broadcast, await getCounts(broadcast._id)), recipients };
};

// The evaluation entrypoint, called fire-and-forget from
// pointsService.claimPoints right after checkMilestoneTrigger. A customer's
// tier can only change as a RESULT of an earn (it's a trailing-12-month
// window recomputed from PointsTransaction rows), so post-earn is the only
// point a "tier reached" event can newly become true — no cron needed.
const evaluateBroadcasts = async ({ organization, membership }) => {
  const broadcasts = await Broadcast.find({ organizationId: organization._id, active: true });
  if (broadcasts.length === 0) return;

  for (const broadcast of broadcasts) {
    // The row's mere existence IS the guard — skip before even checking
    // segment match, so a customer who has already been handled (sent,
    // failed, or no_consent) is never re-evaluated for this broadcast again.
    const existing = await BroadcastLog.findOne({ broadcastId: broadcast._id, userId: membership._id });
    if (existing) continue;

    let matches = false;
    if (broadcast.segmentType === "all") {
      matches = true;
    } else if (broadcast.segmentType === "tier") {
      const tier = await resolveTier(organization._id, membership._id, { org: organization });
      matches = tier === broadcast.segmentTier;
    }

    // Not yet matched — no log row, so this customer is simply re-checked
    // on their next earn (or forever, if they never reach the segment).
    if (!matches) continue;

    // A membership with no linked CustomerAccount has no consent record and
    // no email/push channel to reach — same guard as checkMilestoneTrigger.
    if (!membership.customerAccountId) continue;
    const customer = await CustomerAccount.findOne({ _id: membership.customerAccountId });
    if (!customer) continue;

    const consented = customer.marketingConsent?.[broadcast.channel]?.granted;
    if (!consented) {
      await BroadcastLog.create({
        broadcastId: broadcast._id,
        organizationId: organization._id,
        userId: membership._id,
        status: "no_consent"
      });
      continue;
    }

    let status;
    if (broadcast.channel === "email") {
      try {
        await sendEmail({ to: customer.email, subject: broadcast.subject, html: `<p>${broadcast.body}</p>` });
        status = "sent";
      } catch (err) {
        console.error(`Broadcast email failed for ${customer.email}:`, err.message);
        status = "failed";
      }
    } else if (broadcast.channel === "push") {
      const subscriptions = await PushSubscription.find({ customerAccountId: customer._id });
      let anySucceeded = false;
      for (const sub of subscriptions) {
        const result = await sendPushToSubscription(sub, { title: broadcast.subject, body: broadcast.body });
        if (result.ok) anySucceeded = true;
      }
      status = anySucceeded ? "sent" : "failed";
    } else {
      const result = await sendSms({
        companyId: organization.companyId,
        organizationId: organization._id,
        to: customer.phone,
        text: broadcast.body
      });
      if (result.sent) status = "sent";
      else if (result.reason === "cap_reached" || result.reason === "sms_not_enabled") status = "cap_reached";
      else status = "failed";
    }

    await BroadcastLog.create({
      broadcastId: broadcast._id,
      organizationId: organization._id,
      userId: membership._id,
      status
    });
  }
};

// Every new outlet gets these two, active by default, freely editable or
// deletable like any other broadcast. "Gold tier congrats" is inert until
// the admin configures tierThresholds — resolveTier returns null with none
// configured, which never equals "Gold", so it simply never matches until
// then (no error, no special-casing needed).
const seedDefaultBroadcasts = async (organizationId) => {
  await Broadcast.create({
    organizationId,
    channel: "email",
    segmentType: "all",
    segmentTier: null,
    subject: "Welcome!",
    body: "Thanks for joining us — every visit earns points you can redeem for rewards. See you soon!",
    active: true
  });

  await Broadcast.create({
    organizationId,
    channel: "email",
    segmentType: "tier",
    segmentTier: "Gold",
    subject: "You've reached Gold status!",
    body: "Thanks for being a regular — you've hit Gold tier. We appreciate you.",
    active: true
  });
};

module.exports = {
  listBroadcasts,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  getBroadcastDetail,
  evaluateBroadcasts,
  seedDefaultBroadcasts
};

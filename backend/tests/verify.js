const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Mock mongoose query engine to completely strip sessions in the test environment (standalone MongoDB compatibility)
mongoose.startSession = async function() {
  return {
    withTransaction: async (cb) => cb(),
    endSession: () => {}
  };
};

const originalExec = mongoose.Query.prototype.exec;
mongoose.Query.prototype.exec = function() {
  if (this.options && this.options.session) {
    delete this.options.session;
  }
  return originalExec.apply(this, arguments);
};

const originalCreate = mongoose.Model.create;
mongoose.Model.create = function(doc, options) {
  if (options && options.session) {
    delete options.session;
  }
  if (Array.isArray(doc) && options && options.session) {
    delete options.session;
  }
  return originalCreate.apply(this, arguments);
};

const connectDB = require("../config/db");
const { generateQRToken, claimStamp } = require("../services/stampService");
const StampCard = require("../models/StampCard");
const Voucher = require("../models/Voucher");
const DynamicQRToken = require("../models/DynamicQRToken");
const StampClaimEvent = require("../models/StampClaimEvent");
const User = require("../models/User");

// Minimal assert helper
function assert(condition, message) {
  if (!condition) {
    console.error("❌ ASSERTION FAILED:", message);
    throw new Error(message);
  }
}

async function runTests() {
  console.log("Starting System Verification Tests...");
  await connectDB();

  // Create clean test users
  const testCustomerEmail = "test-customer@coffesarowar.com";
  const testAdminEmail = "test-admin@coffesarowar.com";

  // Clean old test users
  await User.deleteMany({ email: { $in: [testCustomerEmail, testAdminEmail] } });
  
  const customer = await User.create({
    name: "Test Customer",
    email: testCustomerEmail,
    role: "customer"
  });

  const admin = await User.create({
    name: "Test Admin",
    email: testAdminEmail,
    role: "admin"
  });

  const userId = customer._id;
  const adminId = admin._id;

  // Clean old cards/vouchers/tokens for this user
  await StampCard.deleteMany({ userId });
  await Voucher.deleteMany({ userId });

  // ----------------------------------------------------
  // TEST 1: The 5-Stamp Test (Voucher Automation)
  // ----------------------------------------------------
  console.log("\n--- Running Test 1: Voucher Automation (5-Stamp Test) ---");

  for (let i = 1; i <= 5; i++) {
    console.log(`Simulating Stamp Claim #${i}...`);
    
    // Generate a fresh token
    const tokenResult = await generateQRToken(adminId);
    const token = tokenResult.data.token;
    assert(token, `Failed to generate QR token on iteration ${i}`);

    // Mock 18-hour cooldown by updating the card's lastStampedAt if it exists
    if (i > 1) {
      await StampCard.updateOne(
        { userId },
        { $set: { lastStampedAt: new Date(Date.now() - 19 * 60 * 60 * 1000) } }
      );
    }

    // Claim the stamp
    const claimResult = await claimStamp({
      token,
      userId,
      role: "customer"
    });

    assert(claimResult.success === true, `Failed to claim stamp on iteration ${i}`);

    if (i < 5) {
      assert(claimResult.data.rewardTriggered === false, "Reward should not trigger before 5th stamp");
      assert(claimResult.data.stampsEarned === i, `Expected ${i} stamps earned, got ${claimResult.data.stampsEarned}`);
    } else {
      // 5th stamp milestone trigger assertions
      assert(claimResult.data.rewardTriggered === true, "Reward MUST trigger on 5th stamp");
      assert(claimResult.data.stampsEarned === 0, "Stamps earned MUST reset to 0 on 5th stamp");
      assert(claimResult.data.voucherCode.startsWith("CAFE-"), "Voucher code must start with CAFE-");
      
      // Verify database state matches
      const card = await StampCard.findOne({ userId });
      assert(card.stampsEarned === 0, "StampCard stampsEarned in DB must be 0");

      const voucher = await Voucher.findOne({ userId, voucherCode: claimResult.data.voucherCode });
      assert(voucher, "Voucher record must exist in DB");
      assert(voucher.isValid === true, "Newly generated voucher must be valid");
      console.log(`✅ Success: Voucher code ${voucher.voucherCode} generated and card reset to 0!`);
    }
  }

  // ----------------------------------------------------
  // TEST 2: Concurrency & Race-Condition (Double-Tap Test)
  // ----------------------------------------------------
  console.log("\n--- Running Test 2: Double-Tap Concurrency Test ---");

  // Reset the stamp card
  await StampCard.updateOne({ userId }, { $set: { stampsEarned: 0, lastStampedAt: null } });

  // Generate a single QR token
  const doubleTapTokenResult = await generateQRToken(adminId);
  const token = doubleTapTokenResult.data.token;

  console.log(`Dispatching 5 parallel claim requests concurrently with token: ${token}...`);

  // Fire 5 requests at the exact same time
  const claimRequests = Array.from({ length: 5 }).map(() =>
    claimStamp({
      token,
      userId,
      role: "customer"
    }).catch((err) => {
      // Return the error so Promise.all resolved payload contains the errors
      return err;
    })
  );

  const results = await Promise.all(claimRequests);

  let successCount = 0;
  let failureCount = 0;

  for (const res of results) {
    if (res.success === true) {
      successCount++;
    } else if (res.statusCode === 400 || res.status === 400) {
      failureCount++;
    } else {
      console.log("Unhandled claim error:", res.message || res);
    }
  }

  console.log(`Results: ${successCount} succeeded, ${failureCount} failed (HTTP 400).`);

  // Assertions: exactly 1 claim succeeds, other 4 claims fail with 400 bad request (already used or duplicate claim)
  assert(successCount === 1, `Exactly 1 claim should succeed. Got: ${successCount}`);
  assert(failureCount === 4, `Exactly 4 claims should fail. Got: ${failureCount}`);

  // Confirm database balance is exactly 1
  const cardAfterDoubleTap = await StampCard.findOne({ userId });
  assert(cardAfterDoubleTap.stampsEarned === 1, `Expected card stampsEarned to be 1, got ${cardAfterDoubleTap.stampsEarned}`);

  console.log("✅ Success: Concurrency lock verified! Only 1 stamp was credited, 4 requests blocked.");

  // Cleanup test users and ALL associated data
  await User.deleteMany({ email: { $in: [testCustomerEmail, testAdminEmail] } });
  await StampCard.deleteMany({ userId });
  await Voucher.deleteMany({ userId });
  await DynamicQRToken.deleteMany({ generatedBy: adminId });
  await StampClaimEvent.deleteMany({ userId });

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! FULL-SYSTEM HEALTH IS COMPLIANT.");
  mongoose.connection.close();
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  mongoose.connection.close();
  process.exit(1);
});

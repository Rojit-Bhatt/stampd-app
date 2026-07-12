/**
 * One-time script to purge orphaned StampClaimEvent records
 * whose userId references have been deleted from the User collection.
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const connectDB = require("../config/db");
const StampClaimEvent = require("../models/StampClaimEvent");
const User = require("../models/User");

async function purgeOrphans() {
  await connectDB();

  // Get all valid user IDs
  const validUsers = await User.find({}, "_id");
  const validUserIds = new Set(validUsers.map(u => u._id.toString()));

  // Get all stamp claim events
  const allEvents = await StampClaimEvent.find({});
  const orphanIds = allEvents
    .filter(e => !validUserIds.has(e.userId.toString()))
    .map(e => e._id);

  if (orphanIds.length === 0) {
    console.log("✅ No orphaned StampClaimEvent records found. Database is clean.");
  } else {
    await StampClaimEvent.deleteMany({ _id: { $in: orphanIds } });
    console.log(`✅ Purged ${orphanIds.length} orphaned StampClaimEvent record(s).`);
  }

  mongoose.connection.close();
}

purgeOrphans().catch(err => {
  console.error("Purge failed:", err);
  mongoose.connection.close();
  process.exit(1);
});

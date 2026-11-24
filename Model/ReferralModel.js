const mongoose = require("mongoose");

const fraudFlagSchema = new mongoose.Schema(
  {
    flagType: {
      type: String,
      enum: [
        "same_phone",
        "same_email",
        "same_gstin",
        "same_pan",
        "same_ip",
        "same_address",
        "monthly_cap_exceeded",
        "suspicious_velocity",
        "manual_flag",
      ],
      required: true,
    },
    details: {
      type: String,
      default: "",
    },
    flaggedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const referralSchema = new mongoose.Schema(
  {
    referralCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referrerName: {
      type: String,
      default: "",
      trim: true,
    },
    referrerStoreName: {
      type: String,
      default: "",
      trim: true,
    },
    referredId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One referral record per referred business
      index: true,
    },
    referredName: {
      type: String,
      default: "",
      trim: true,
    },
    referredStoreName: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "qualified", "credited", "reversed", "blocked"],
      default: "pending",
      index: true,
    },
    // The qualifying first order details
    qualifiedOrderId: {
      type: String,
      default: "",
      index: true,
    },
    qualifiedOrderValue: {
      type: Number,
      default: 0,
    },
    qualifiedAt: {
      type: Date,
      default: null,
    },
    returnWindowEndsAt: {
      type: Date,
      default: null,
      index: true,
    },
    creditedAt: {
      type: Date,
      default: null,
    },
    // Reward amounts snapshot
    rewardAmount: {
      type: Number,
      default: 1000,
      min: 0,
    },
    refereeRewardAmount: {
      type: Number,
      default: 500,
      min: 0,
    },
    // Ledger entry IDs for audit and reconciliation
    rewardLedgerEntryId: {
      type: String,
      default: "",
    },
    refereeLedgerEntryId: {
      type: String,
      default: "",
    },
    fraudFlags: {
      type: [fraudFlagSchema],
      default: [],
    },
    isFraudFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
    adminOverride: {
      isOverridden: { type: Boolean, default: false },
      action: { type: String, enum: ["approved", "blocked", "none"], default: "none" },
      reason: { type: String, default: "" },
      adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      updatedAt: { type: Date, default: null },
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

referralSchema.index({ referrerId: 1, createdAt: -1 });
referralSchema.index({ status: 1, returnWindowEndsAt: 1 });

module.exports = mongoose.model("Referral", referralSchema);

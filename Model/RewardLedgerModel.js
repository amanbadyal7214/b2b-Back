const mongoose = require("mongoose");

const rewardLedgerSchema = new mongoose.Schema(
  {
    entryId: {
      type: String,
      required: true,
      unique: true,
      index: true, // e.g. "LEDG-2026-000123"
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit", "reversal", "expiry", "adjustment"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Authoritative running wallet balance after this transaction was committed
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      enum: [
        "referral_reward",
        "referee_welcome_bonus",
        "order_redemption",
        "order_cancellation_refund",
        "admin_adjustment",
        "promotional_grant",
        "expired",
      ],
      required: true,
      index: true,
    },
    referenceId: {
      type: String,
      default: "", // referralId, orderId, or invoiceId
      index: true,
    },
    status: {
      type: String,
      enum: ["available", "pending", "used", "expired", "reversed"],
      default: "available",
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: String,
      default: "system", // 'system' or Admin user name/id
    },
    note: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for chronological ledger queries per user
rewardLedgerSchema.index({ userId: 1, createdAt: -1 });
// Compound index for idempotency checks
rewardLedgerSchema.index({ userId: 1, source: 1, referenceId: 1 });

module.exports = mongoose.model("RewardLedger", rewardLedgerSchema);

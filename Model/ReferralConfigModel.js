const mongoose = require("mongoose");

const referralConfigSchema = new mongoose.Schema(
  {
    rewardType: {
      type: String,
      enum: ["wallet_credit", "flat_discount", "percentage"],
      default: "wallet_credit",
    },
    // Reward credited to the referrer once qualified
    referrerRewardAmount: {
      type: Number,
      default: 1000,
      min: 0,
    },
    // Reward or welcome credit credited to the new buyer (referee)
    refereeRewardAmount: {
      type: Number,
      default: 500,
      min: 0,
    },
    // Minimum first order value required to qualify the referral (e.g. ₹10,000)
    minFirstOrderValue: {
      type: Number,
      default: 10000,
      min: 0,
    },
    // Days after delivery/order before reward transitions from qualified to credited
    returnWindowDays: {
      type: Number,
      default: 7,
      min: 0,
    },
    // Maximum number of qualified referrals allowed per referrer per calendar month
    monthlyReferralCap: {
      type: Number,
      default: 10,
      min: 1,
    },
    // Maximum total reward value allowed per referrer per calendar month
    monthlyRewardCap: {
      type: Number,
      default: 25000,
      min: 0,
    },
    // Maximum percentage of an order that can be settled using wallet rewards (e.g. 20%)
    maxOrderRedemptionPercent: {
      type: Number,
      default: 20,
      min: 1,
      max: 100,
    },
    // Expiry period for wallet reward balance in days (e.g. 365 days / 1 year)
    rewardExpiryDays: {
      type: Number,
      default: 365,
      min: 30,
    },
    // Program active status
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: String,
      default: "system",
    },
  },
  {
    timestamps: true,
  }
);

// Singleton helper to get or initialize default config
referralConfigSchema.statics.getOrCreateConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

module.exports = mongoose.model("ReferralConfig", referralConfigSchema);

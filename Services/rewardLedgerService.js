const mongoose = require("mongoose");
const RewardLedger = require("../Model/RewardLedgerModel");
const Referral = require("../Model/ReferralModel");
const ReferralConfig = require("../Model/ReferralConfigModel");
const User = require("../Model/UserModel");
const Order = require("../Model/OrderModel");
const Counter = require("../Model/CounterModel");

/**
 * Helper: Generate unique sequential Ledger Entry ID (e.g. LEDG-2026-000123)
 */
const generateLedgerEntryId = async () => {
  const currentYear = new Date().getFullYear();
  const counterKey = `ledger_${currentYear}`;

  const counterDoc = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const paddedSeq = String(counterDoc.seq).padStart(6, "0");
  return `LEDG-${currentYear}-${paddedSeq}`;
};

/**
 * Get or Seed Referral Configuration
 */
const getReferralConfig = async () => {
  return await ReferralConfig.getOrCreateConfig();
};

/**
 * Authoritative Wallet Summary & Reconciled Available Balance
 */
const getWalletSummary = async (userId) => {
  if (!userId) {
    return {
      availableBalance: 0,
      pendingBalance: 0,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
      expiringSoonAmount: 0,
      transactions: [],
    };
  }

  const uId = new mongoose.Types.ObjectId(String(userId));

  // 1. Process any expired credits before calculating live balance
  const now = new Date();
  const expiredCredits = await RewardLedger.find({
    userId: uId,
    type: "credit",
    status: "available",
    expiresAt: { $ne: null, $lte: now },
  });

  for (const expItem of expiredCredits) {
    expItem.status = "expired";
    await expItem.save();

    // Append debit entry for expired amount
    const entryId = await generateLedgerEntryId();
    // Re-check current balance before logging expiry
    const prevEntry = await RewardLedger.findOne({ userId: uId }).sort({ createdAt: -1 });
    const currentBal = prevEntry ? prevEntry.balanceAfter : 0;
    const nextBal = Math.max(0, currentBal - expItem.amount);

    await RewardLedger.create({
      entryId,
      userId: uId,
      type: "expiry",
      amount: expItem.amount,
      balanceAfter: nextBal,
      source: "expired",
      referenceId: expItem.entryId,
      status: "expired",
      note: `Automatic expiry of reward entry ${expItem.entryId}`,
    });
  }

  // 2. Fetch authoritative latest balance from newest ledger entry
  const latestEntry = await RewardLedger.findOne({ userId: uId }).sort({ createdAt: -1 });
  const authoritativeBalance = latestEntry ? Math.max(0, latestEntry.balanceAfter) : 0;

  // 3. Compute Lifetime Metrics
  const lifetimeStats = await RewardLedger.aggregate([
    { $match: { userId: uId } },
    {
      $group: {
        _id: null,
        totalEarned: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$type", "credit"] },
                  { $ne: ["$source", "order_cancellation_refund"] },
                ],
              },
              "$amount",
              0,
            ],
          },
        },
        totalRedeemed: {
          $sum: {
            $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0],
          },
        },
      },
    },
  ]);

  const lifetimeEarned = lifetimeStats[0]?.totalEarned || 0;
  const lifetimeRedeemed = lifetimeStats[0]?.totalRedeemed || 0;

  // 4. Calculate Pending Referral Balance
  const pendingReferrals = await Referral.find({
    referrerId: uId,
    status: { $in: ["pending", "qualified"] },
  });
  const pendingBalance = pendingReferrals.reduce((sum, r) => sum + (r.rewardAmount || 0), 0);

  // 5. Expiring soon in next 30 days
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringSoonDocs = await RewardLedger.find({
    userId: uId,
    type: "credit",
    status: "available",
    expiresAt: { $ne: null, $gt: now, $lte: thirtyDaysLater },
  });
  const expiringSoonAmount = expiringSoonDocs.reduce((sum, d) => sum + d.amount, 0);

  // 6. Recent Transaction History
  const transactions = await RewardLedger.find({ userId: uId })
    .sort({ createdAt: -1 })
    .limit(50);

  // Synchronize User cached balance fields
  await User.findByIdAndUpdate(uId, {
    walletBalance: authoritativeBalance,
    pendingRewardBalance: pendingBalance,
  });

  return {
    availableBalance: authoritativeBalance,
    pendingBalance,
    lifetimeEarned,
    lifetimeRedeemed,
    expiringSoonAmount,
    transactions,
  };
};

/**
 * Idempotent Double-Entry Credit Reward
 */
const creditReward = async ({
  userId,
  amount,
  source,
  referenceId = "",
  note = "",
  expiresAt = null,
  createdBy = "system",
}) => {
  if (!userId || !amount || amount <= 0) return null;
  const uId = new mongoose.Types.ObjectId(String(userId));

  // Idempotency check: don't double-credit the exact same referral or event
  if (referenceId && source) {
    const existing = await RewardLedger.findOne({
      userId: uId,
      source,
      referenceId,
      type: "credit",
    });
    if (existing) {
      return existing;
    }
  }

  // Get current balance
  const lastEntry = await RewardLedger.findOne({ userId: uId }).sort({ createdAt: -1 });
  const currentBal = lastEntry ? lastEntry.balanceAfter : 0;
  const nextBal = currentBal + Number(amount);

  const entryId = await generateLedgerEntryId();

  const newEntry = await RewardLedger.create({
    entryId,
    userId: uId,
    type: "credit",
    amount: Number(amount),
    balanceAfter: nextBal,
    source,
    referenceId,
    status: "available",
    expiresAt,
    createdBy,
    note,
  });

  // Sync cache on User
  await User.findByIdAndUpdate(uId, { walletBalance: nextBal });

  return newEntry;
};

/**
 * Atomic Debit Reward for Order Checkout
 */
const debitForOrder = async ({ userId, amount, orderId, note = "" }) => {
  if (!userId || !amount || amount <= 0) return 0;
  const uId = new mongoose.Types.ObjectId(String(userId));

  const lastEntry = await RewardLedger.findOne({ userId: uId }).sort({ createdAt: -1 });
  const currentBal = lastEntry ? lastEntry.balanceAfter : 0;

  if (amount > currentBal) {
    throw new Error(
      `Insufficient wallet balance. Requested: ₹${amount}, Available: ₹${currentBal}`
    );
  }

  const nextBal = currentBal - Number(amount);
  const entryId = await generateLedgerEntryId();

  const newEntry = await RewardLedger.create({
    entryId,
    userId: uId,
    type: "debit",
    amount: Number(amount),
    balanceAfter: nextBal,
    source: "order_redemption",
    referenceId: orderId,
    status: "used",
    createdBy: "system",
    note: note || `Redeemed on Order ${orderId}`,
  });

  await User.findByIdAndUpdate(uId, { walletBalance: nextBal });

  return Number(amount);
};

/**
 * Restitution Reversal: Restores debited balance when order is cancelled/returned
 */
const reverseDebitForOrder = async ({ userId, amount, orderId, reason = "" }) => {
  if (!userId || !amount || amount <= 0) return null;
  const uId = new mongoose.Types.ObjectId(String(userId));

  // Idempotency: verify this cancellation hasn't already been reversed
  const existingReversal = await RewardLedger.findOne({
    userId: uId,
    source: "order_cancellation_refund",
    referenceId: orderId,
  });
  if (existingReversal) return existingReversal;

  const lastEntry = await RewardLedger.findOne({ userId: uId }).sort({ createdAt: -1 });
  const currentBal = lastEntry ? lastEntry.balanceAfter : 0;
  const nextBal = currentBal + Number(amount);

  const entryId = await generateLedgerEntryId();

  const newEntry = await RewardLedger.create({
    entryId,
    userId: uId,
    type: "reversal",
    amount: Number(amount),
    balanceAfter: nextBal,
    source: "order_cancellation_refund",
    referenceId: orderId,
    status: "available",
    createdBy: "system",
    note: reason || `Refund of debited reward balance for cancelled order ${orderId}`,
  });

  await User.findByIdAndUpdate(uId, { walletBalance: nextBal });

  return newEntry;
};

/**
 * Admin Manual Adjustment with Mandatory Audit Reason
 */
const adminAdjustment = async ({
  userId,
  amount,
  type = "credit", // 'credit' or 'debit'
  note = "",
  adminId = "",
  adminName = "Administrator",
}) => {
  if (!userId || !amount || amount <= 0) {
    throw new Error("User ID and a positive adjustment amount are required.");
  }
  if (!note || note.trim().length < 5) {
    throw new Error("A detailed mandatory reason is required for administrative ledger adjustment.");
  }

  const uId = new mongoose.Types.ObjectId(String(userId));
  const lastEntry = await RewardLedger.findOne({ userId: uId }).sort({ createdAt: -1 });
  const currentBal = lastEntry ? lastEntry.balanceAfter : 0;

  let nextBal = currentBal;
  if (type === "credit") {
    nextBal = currentBal + Number(amount);
  } else if (type === "debit") {
    if (amount > currentBal) {
      throw new Error(`Cannot debit ₹${amount}. User only has ₹${currentBal} available.`);
    }
    nextBal = currentBal - Number(amount);
  } else {
    throw new Error("Adjustment type must be 'credit' or 'debit'.");
  }

  const entryId = await generateLedgerEntryId();

  const entry = await RewardLedger.create({
    entryId,
    userId: uId,
    type: type === "credit" ? "credit" : "debit",
    amount: Number(amount),
    balanceAfter: nextBal,
    source: "admin_adjustment",
    referenceId: String(adminId || "MANUAL_ADJ"),
    status: type === "credit" ? "available" : "used",
    createdBy: adminName,
    note: `[Admin Adjustment by ${adminName}]: ${note.trim()}`,
  });

  await User.findByIdAndUpdate(uId, { walletBalance: nextBal });

  return entry;
};

/**
 * Anti-Abuse Rules Checker
 */
const checkAntiAbuse = async (referrerUser, newBuyerData = {}, registrationIp = "") => {
  const flags = [];
  const config = await getReferralConfig();

  if (!referrerUser) {
    return { isAllowed: false, reason: "Referrer profile not found", flags: [] };
  }

  // 1. Self-referral checks
  const refPhone = String(referrerUser.phone || referrerUser.mobile || "").replace(/\D/g, "");
  const buyerPhone = String(newBuyerData.phone || newBuyerData.mobile || "").replace(/\D/g, "");
  if (refPhone && buyerPhone && refPhone === buyerPhone) {
    flags.push({
      flagType: "same_phone",
      details: `Referrer and buyer share identical mobile number (${buyerPhone}).`,
    });
  }

  const refEmail = (referrerUser.email || "").toLowerCase().trim();
  const buyerEmail = (newBuyerData.email || "").toLowerCase().trim();
  if (refEmail && buyerEmail && refEmail === buyerEmail) {
    flags.push({
      flagType: "same_email",
      details: `Referrer and buyer share identical email (${buyerEmail}).`,
    });
  }

  const refGstin = (referrerUser.gstin || "").toUpperCase().trim();
  const buyerGstin = (newBuyerData.gstin || "").toUpperCase().trim();
  if (refGstin && buyerGstin && refGstin === buyerGstin) {
    flags.push({
      flagType: "same_gstin",
      details: `Referrer and buyer share identical GSTIN (${buyerGstin}).`,
    });
  }

  const refPan = (referrerUser.pan || "").toUpperCase().trim();
  const buyerPan = (newBuyerData.pan || "").toUpperCase().trim();
  if (refPan && buyerPan && refPan === buyerPan) {
    flags.push({
      flagType: "same_pan",
      details: `Referrer and buyer share identical PAN (${buyerPan}).`,
    });
  }

  if (registrationIp && referrerUser.registrationIp && registrationIp === referrerUser.registrationIp) {
    flags.push({
      flagType: "same_ip",
      details: `Registration originated from same IP address (${registrationIp}).`,
    });
  }

  // 2. Monthly cap check
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthCount = await Referral.countDocuments({
    referrerId: referrerUser._id,
    createdAt: { $gte: startOfMonth },
    status: { $ne: "blocked" },
  });

  if (monthCount >= config.monthlyReferralCap) {
    flags.push({
      flagType: "monthly_cap_exceeded",
      details: `Referrer reached monthly limit of ${config.monthlyReferralCap} referrals.`,
    });
  }

  return {
    isAllowed: !flags.some((f) => ["same_phone", "same_email", "same_gstin"].includes(f.flagType)),
    isFraudFlagged: flags.length > 0,
    flags,
  };
};

/**
 * Trigger: Qualify referral when buyer places their first eligible order
 */
const qualifyReferralForOrder = async (order, buyerUser) => {
  if (!order || !buyerUser) return null;

  // Find active pending referral
  const referral = await Referral.findOne({
    referredId: buyerUser._id,
    status: "pending",
  });
  if (!referral) return null;

  const config = await getReferralConfig();
  const orderTotal = Number(order.pricing?.grossMerchandise || order.pricing?.grandTotal || 0);

  // Enforce minimum first order value
  if (orderTotal < config.minFirstOrderValue) {
    return null;
  }

  // Calculate return window end date
  const returnWindowEndsAt = new Date(
    Date.now() + config.returnWindowDays * 24 * 60 * 60 * 1000
  );

  referral.status = "qualified";
  referral.qualifiedOrderId = order.orderId;
  referral.qualifiedOrderValue = orderTotal;
  referral.qualifiedAt = new Date();
  referral.returnWindowEndsAt = returnWindowEndsAt;
  referral.rewardAmount = config.referrerRewardAmount;
  referral.refereeRewardAmount = config.refereeRewardAmount;
  await referral.save();

  // Mark order as referral processed
  order.referralId = referral._id;
  order.referredBy = referral.referrerId;
  order.referralProcessed = true;
  await order.save();

  // Update referrer pending balance
  await getWalletSummary(referral.referrerId);

  return referral;
};

/**
 * Routine: Process matured referrals whose return window has elapsed
 */
const processMaturedReferrals = async () => {
  const config = await getReferralConfig();
  const now = new Date();

  // Find all qualified referrals whose return window has ended
  const maturedReferrals = await Referral.find({
    status: "qualified",
    returnWindowEndsAt: { $lte: now },
  });

  const results = {
    processed: 0,
    reversed: 0,
    errors: [],
  };

  for (const ref of maturedReferrals) {
    try {
      // Check if qualifying order was cancelled or returned
      const order = await Order.findOne({ orderId: ref.qualifiedOrderId });
      if (order && ["cancelled", "returned", "failed"].includes(order.status)) {
        ref.status = "reversed";
        ref.notes = `Order ${ref.qualifiedOrderId} was ${order.status}; reward reversed.`;
        await ref.save();
        results.reversed++;
        continue;
      }

      // Calculate expiry date for credit
      const expiresAt = new Date(
        Date.now() + config.rewardExpiryDays * 24 * 60 * 60 * 1000
      );

      // 1. Credit Referrer
      const referrerEntry = await creditReward({
        userId: ref.referrerId,
        amount: ref.rewardAmount,
        source: "referral_reward",
        referenceId: ref._id.toString(),
        note: `Referral reward for boutique ${ref.referredStoreName || ref.referredName} (Order ${ref.qualifiedOrderId})`,
        expiresAt,
        createdBy: "system",
      });

      // 2. Credit Referee (new buyer welcome credit, if configured)
      let refereeEntry = null;
      if (ref.refereeRewardAmount > 0) {
        refereeEntry = await creditReward({
          userId: ref.referredId,
          amount: ref.refereeRewardAmount,
          source: "referee_welcome_bonus",
          referenceId: ref._id.toString(),
          note: `Welcome reward for joining via partner referral code ${ref.referralCode}`,
          expiresAt,
          createdBy: "system",
        });
      }

      ref.status = "credited";
      ref.creditedAt = new Date();
      ref.rewardLedgerEntryId = referrerEntry?.entryId || "";
      ref.refereeLedgerEntryId = refereeEntry?.entryId || "";
      await ref.save();

      // Recalculate balances
      await getWalletSummary(ref.referrerId);
      if (refereeEntry) {
        await getWalletSummary(ref.referredId);
      }

      results.processed++;
    } catch (err) {
      console.error(`[processMaturedReferrals] Error processing ref ${ref._id}:`, err);
      results.errors.push({ refId: ref._id, message: err.message });
    }
  }

  return results;
};

module.exports = {
  getReferralConfig,
  getWalletSummary,
  creditReward,
  debitForOrder,
  reverseDebitForOrder,
  adminAdjustment,
  checkAntiAbuse,
  qualifyReferralForOrder,
  processMaturedReferrals,
};

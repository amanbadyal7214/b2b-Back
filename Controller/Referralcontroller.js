const mongoose = require("mongoose");
const Referral = require("../Model/ReferralModel");
const RewardLedger = require("../Model/RewardLedgerModel");
const ReferralConfig = require("../Model/ReferralConfigModel");
const User = require("../Model/UserModel");
const {
  getReferralConfig,
  getWalletSummary,
  adminAdjustment,
  processMaturedReferrals,
} = require("../Services/rewardLedgerService");

/**
 * Mask business or buyer name for privacy (e.g. "Boutique S***, Surat")
 */
const maskName = (name = "") => {
  if (!name || name.length <= 3) return name;
  const parts = name.split(" ");
  if (parts.length > 1) {
    return `${parts[0]} ${parts[1].charAt(0)}***`;
  }
  return `${name.substring(0, 3)}***${name.slice(-1)}`;
};

/* ========================================================================= */
/* BUYER / RETAILER ENDPOINTS                                                */
/* ========================================================================= */

/**
 * GET /api/referrals/my-code
 * Fetch logged-in retailer's referral code, link, and summary
 */
const getMyReferralCode = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Auto-generate code if missing
    if (!user.referralCode) {
      const clean = (user.ownerName || user.name || "BVB")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .substring(0, 6) || "BVB";
      const rand = Math.floor(1000 + Math.random() * 9000);
      user.referralCode = `REF-${clean}${rand}`;
      await user.save();
    }

    const config = await getReferralConfig();
    const wallet = await getWalletSummary(userId);

    const shareUrl = `${req.protocol}://${req.get("host")}/register?ref=${user.referralCode}`;
    const whatsappMessage = encodeURIComponent(
      `Namaste! Join Buddy Vs Buff (BVB) wholesale apparel network with my partner referral code *${user.referralCode}* to source genuine 240-420 GSM streetwear directly from Tiruppur mills.\n\nRegister your boutique here: ${shareUrl}`
    );

    return res.status(200).json({
      success: true,
      referralCode: user.referralCode,
      shareUrl,
      whatsappMessage,
      rewardAmount: config.referrerRewardAmount,
      refereeRewardAmount: config.refereeRewardAmount,
      minFirstOrderValue: config.minFirstOrderValue,
      returnWindowDays: config.returnWindowDays,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      lifetimeEarned: wallet.lifetimeEarned,
      config: {
        maxOrderRedemptionPercent: config.maxOrderRedemptionPercent,
        rewardExpiryDays: config.rewardExpiryDays,
      },
    });
  } catch (error) {
    console.error("[getMyReferralCode] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/referrals/my-referrals
 * Fetch all referrals made by this buyer with privacy-masked names
 */
const getMyReferrals = async (req, res) => {
  try {
    const userId = req.user._id;
    const referrals = await Referral.find({ referrerId: userId }).sort({ createdAt: -1 });

    const maskedList = referrals.map((r) => ({
      _id: r._id,
      storeName: maskName(r.referredStoreName || r.referredName),
      status: r.status,
      qualifiedOrderValue: r.qualifiedOrderValue,
      rewardAmount: r.rewardAmount,
      registeredAt: r.createdAt,
      qualifiedAt: r.qualifiedAt,
      creditedAt: r.creditedAt,
      returnWindowEndsAt: r.returnWindowEndsAt,
      notes: r.status === "pending" ? "Awaiting first qualifying order" : r.notes,
    }));

    return res.status(200).json({
      success: true,
      referrals: maskedList,
      totalCount: referrals.length,
    });
  } catch (error) {
    console.error("[getMyReferrals] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/referrals/my-wallet
 * Fetch full immutable ledger statement and reconciled balances
 */
const getMyWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const summary = await getWalletSummary(userId);

    return res.status(200).json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("[getMyWallet] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/referrals/validate-code
 * Validate referral code before registration
 */
const validateReferralCode = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: "Referral code is required." });
    }

    const cleanCode = code.trim().toUpperCase();
    const config = await getReferralConfig();
    if (!config.isActive) {
      return res.status(400).json({ success: false, message: "Referral program is currently paused." });
    }

    const referrer = await User.findOne({ referralCode: cleanCode });
    if (!referrer) {
      return res.status(404).json({ success: false, message: "Invalid referral code. No matching partner found." });
    }

    // Don't allow using own code if logged in
    if (req.user && String(referrer._id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You cannot use your own referral code." });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      code: cleanCode,
      referrerStoreName: referrer.storeName || referrer.companyName || referrer.name,
      welcomeBonus: config.refereeRewardAmount,
      minFirstOrderValue: config.minFirstOrderValue,
      message: `Valid code! Get ₹${config.refereeRewardAmount} welcome store credit on your first order.`,
    });
  } catch (error) {
    console.error("[validateReferralCode] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/referrals/checkout-quote
 * Calculate max redeemable rewards for given order grand total
 */
const getCheckoutQuote = async (req, res) => {
  try {
    const userId = req.user._id;
    const orderTotal = Math.max(0, Number(req.query.orderTotal || 0));

    const config = await getReferralConfig();
    const wallet = await getWalletSummary(userId);

    const maxAllowedPercent = config.maxOrderRedemptionPercent || 20;
    const maxByCap = Math.round((orderTotal * maxAllowedPercent) / 100);
    const applicableDiscount = Math.min(wallet.availableBalance, maxByCap);
    const finalPayable = Math.max(0, orderTotal - applicableDiscount);

    return res.status(200).json({
      success: true,
      availableBalance: wallet.availableBalance,
      orderTotal,
      maxAllowedPercent,
      maxRedeemable: maxByCap,
      applicableDiscount,
      finalPayable,
    });
  } catch (error) {
    console.error("[getCheckoutQuote] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ========================================================================= */
/* ADMIN ENDPOINTS                                                           */
/* ========================================================================= */

/**
 * GET /api/referrals/admin/config
 */
const getAdminReferralConfig = async (req, res) => {
  try {
    const config = await getReferralConfig();
    return res.status(200).json({ success: true, config });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/referrals/admin/config
 */
const updateAdminReferralConfig = async (req, res) => {
  try {
    const {
      rewardType,
      referrerRewardAmount,
      refereeRewardAmount,
      minFirstOrderValue,
      returnWindowDays,
      monthlyReferralCap,
      monthlyRewardCap,
      maxOrderRedemptionPercent,
      rewardExpiryDays,
      isActive,
    } = req.body;

    const config = await ReferralConfig.getOrCreateConfig();

    if (rewardType) config.rewardType = rewardType;
    if (referrerRewardAmount !== undefined) config.referrerRewardAmount = Math.max(0, Number(referrerRewardAmount));
    if (refereeRewardAmount !== undefined) config.refereeRewardAmount = Math.max(0, Number(refereeRewardAmount));
    if (minFirstOrderValue !== undefined) config.minFirstOrderValue = Math.max(0, Number(minFirstOrderValue));
    if (returnWindowDays !== undefined) config.returnWindowDays = Math.max(0, Number(returnWindowDays));
    if (monthlyReferralCap !== undefined) config.monthlyReferralCap = Math.max(1, Number(monthlyReferralCap));
    if (monthlyRewardCap !== undefined) config.monthlyRewardCap = Math.max(0, Number(monthlyRewardCap));
    if (maxOrderRedemptionPercent !== undefined) {
      config.maxOrderRedemptionPercent = Math.min(100, Math.max(1, Number(maxOrderRedemptionPercent)));
    }
    if (rewardExpiryDays !== undefined) config.rewardExpiryDays = Math.max(30, Number(rewardExpiryDays));
    if (typeof isActive === "boolean") config.isActive = isActive;

    config.updatedBy = req.admin?.name || req.admin?.email || "Admin";
    await config.save();

    return res.status(200).json({
      success: true,
      message: "Referral rules and reward caps updated successfully.",
      config,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/referrals/admin/list
 * Admin list with filters & fraud flags
 */
const getAdminReferralsList = async (req, res) => {
  try {
    const {
      status = "all",
      search = "",
      fraudOnly = "false",
      page = 1,
      limit = 30,
    } = req.query;

    const query = {};
    if (status !== "all") {
      query.status = status;
    }
    if (fraudOnly === "true") {
      query.isFraudFlagged = true;
    }
    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { referralCode: { $regex: term, $options: "i" } },
        { referrerName: { $regex: term, $options: "i" } },
        { referrerStoreName: { $regex: term, $options: "i" } },
        { referredName: { $regex: term, $options: "i" } },
        { referredStoreName: { $regex: term, $options: "i" } },
        { qualifiedOrderId: { $regex: term, $options: "i" } },
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const totalCount = await Referral.countDocuments(query);
    const referrals = await Referral.find(query)
      .populate("referrerId", "name storeName email phone gstin")
      .populate("referredId", "name storeName email phone gstin status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    return res.status(200).json({
      success: true,
      referrals,
      totalCount,
      page: Number(page),
      totalPages: Math.ceil(totalCount / Number(limit)) || 1,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/referrals/admin/override/:id
 * Admin manual Approve / Block referral override
 */
const overrideReferralByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason = "" } = req.body;

    if (!["approved", "blocked"].includes(action)) {
      return res.status(400).json({ success: false, message: "Action must be 'approved' or 'blocked'." });
    }

    const referral = await Referral.findById(id);
    if (!referral) {
      return res.status(404).json({ success: false, message: "Referral record not found." });
    }

    referral.adminOverride = {
      isOverridden: true,
      action,
      reason: reason.trim(),
      adminId: req.admin?._id || null,
      updatedAt: new Date(),
    };

    if (action === "blocked") {
      referral.status = "blocked";
    } else if (action === "approved" && referral.status === "blocked") {
      referral.status = referral.qualifiedOrderId ? "qualified" : "pending";
    }

    await referral.save();

    // Reconcile referrer wallet
    await getWalletSummary(referral.referrerId);

    return res.status(200).json({
      success: true,
      message: `Referral ${action} successfully.`,
      referral,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/referrals/admin/ledger/:userId
 * Inspect full ledger timeline for a specific retailer
 */
const getAdminUserLedger = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Retailer record not found." });
    }

    const summary = await getWalletSummary(userId);
    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        storeName: user.storeName || user.companyName,
        email: user.email,
        phone: user.phone,
        referralCode: user.referralCode,
      },
      ...summary,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/referrals/admin/adjustment
 * Manual credit/debit with mandatory audit reason
 */
const createAdminManualAdjustment = async (req, res) => {
  try {
    const { userId, amount, type = "credit", note } = req.body;

    const adminName = req.admin?.name || req.admin?.email || "Administrator";
    const adminId = req.admin?._id || "";

    const entry = await adminAdjustment({
      userId,
      amount: Number(amount),
      type,
      note,
      adminId,
      adminName,
    });

    const updatedSummary = await getWalletSummary(userId);

    return res.status(200).json({
      success: true,
      message: `Successfully executed manual ${type} adjustment of ₹${amount}.`,
      entry,
      wallet: updatedSummary,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/referrals/admin/reports
 * Total issued, redeemed, outstanding liability, top referrers
 */
const getAdminReferralReports = async (req, res) => {
  try {
    // 1. Ledger Aggregations (Authoritative financial liability)
    const financialStats = await RewardLedger.aggregate([
      {
        $group: {
          _id: null,
          totalIssued: {
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
          totalExpired: {
            $sum: {
              $cond: [{ $eq: ["$type", "expiry"] }, "$amount", 0],
            },
          },
        },
      },
    ]);

    const totalIssued = financialStats[0]?.totalIssued || 0;
    const totalRedeemed = financialStats[0]?.totalRedeemed || 0;
    const totalExpired = financialStats[0]?.totalExpired || 0;
    // Outstanding Liability = Total Issued - Total Redeemed - Total Expired
    const outstandingLiability = Math.max(0, totalIssued - totalRedeemed - totalExpired);

    // 2. Referral status breakdown
    const [totalReferrals, pendingCount, qualifiedCount, creditedCount, fraudCount] =
      await Promise.all([
        Referral.countDocuments(),
        Referral.countDocuments({ status: "pending" }),
        Referral.countDocuments({ status: "qualified" }),
        Referral.countDocuments({ status: "credited" }),
        Referral.countDocuments({ isFraudFlagged: true }),
      ]);

    // 3. Top Referrers Leaderboard
    const topReferrers = await Referral.aggregate([
      { $match: { status: "credited" } },
      {
        $group: {
          _id: "$referrerId",
          successfulReferrals: { $sum: 1 },
          totalRewardsEarned: { $sum: "$rewardAmount" },
          referrerName: { $first: "$referrerName" },
          referrerStoreName: { $first: "$referrerStoreName" },
        },
      },
      { $sort: { successfulReferrals: -1, totalRewardsEarned: -1 } },
      { $limit: 10 },
    ]);

    return res.status(200).json({
      success: true,
      totals: {
        totalIssued,
        totalRedeemed,
        totalExpired,
        outstandingLiability,
        totalReferrals,
        pendingCount,
        qualifiedCount,
        creditedCount,
        fraudCount,
      },
      topReferrers,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/referrals/admin/process-matured
 * Batch process matured referrals (return window elapsed)
 */
const triggerMaturedReferralsBatch = async (req, res) => {
  try {
    const result = await processMaturedReferrals();
    return res.status(200).json({
      success: true,
      message: `Processed ${result.processed} matured referrals (${result.reversed} reversed).`,
      result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMyReferralCode,
  getMyReferrals,
  getMyWallet,
  validateReferralCode,
  getCheckoutQuote,
  getAdminReferralConfig,
  updateAdminReferralConfig,
  getAdminReferralsList,
  overrideReferralByAdmin,
  getAdminUserLedger,
  createAdminManualAdjustment,
  getAdminReferralReports,
  triggerMaturedReferralsBatch,
};

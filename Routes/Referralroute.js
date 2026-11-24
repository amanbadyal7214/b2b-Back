const express = require("express");
const router = express.Router();
const {
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
} = require("../Controller/Referralcontroller");
const {
  verifyUserToken,
  verifyAdminToken,
  optionalUserToken,
} = require("../Middleware/authMiddleware");

/* ========================================================================= */
/* BUYER / RETAILER ROUTES                                                   */
/* ========================================================================= */

// Buyer: Get unique referral code, shareable link & reward rules
router.get("/my-code", verifyUserToken, getMyReferralCode);

// Buyer: Get list of referred businesses (privacy-masked) with statuses
router.get("/my-referrals", verifyUserToken, getMyReferrals);

// Buyer: Get rewards wallet balance and full immutable ledger history
router.get("/my-wallet", verifyUserToken, getMyWallet);

// Buyer / Guest: Validate referral code before registration
router.post("/validate-code", optionalUserToken, validateReferralCode);

// Buyer: Checkout discount calculation quote
router.get("/checkout-quote", verifyUserToken, getCheckoutQuote);

/* ========================================================================= */
/* ADMIN ROUTES                                                              */
/* ========================================================================= */

// Admin: Referral rules configuration
router.get("/admin/config", verifyAdminToken, getAdminReferralConfig);
router.put("/admin/config", verifyAdminToken, updateAdminReferralConfig);

// Admin: Referral records with filters & fraud flags
router.get("/admin/list", verifyAdminToken, getAdminReferralsList);

// Admin: Override referral (approve or block)
router.post("/admin/override/:id", verifyAdminToken, overrideReferralByAdmin);

// Admin: Inspect user's complete ledger history
router.get("/admin/ledger/:userId", verifyAdminToken, getAdminUserLedger);

// Admin: Manual credit / debit balance adjustment with mandatory reason
router.post("/admin/adjustment", verifyAdminToken, createAdminManualAdjustment);

// Admin: Financial liability and top referrers reports
router.get("/admin/reports", verifyAdminToken, getAdminReferralReports);

// Admin: Batch trigger matured referrals
router.post("/admin/process-matured", verifyAdminToken, triggerMaturedReferralsBatch);

module.exports = router;

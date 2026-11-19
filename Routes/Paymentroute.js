const express = require("express");
const router = express.Router();
const {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
} = require("../Controller/Paymentcontroller");
const { verifyUserToken } = require("../Middleware/authMiddleware");

// Step 8: Create gateway order id (status: created)
router.post("/create", verifyUserToken, createPaymentOrder);

// Step 10: Server verifies signature, amounts, deducts stock, clears cart (status -> success)
router.post("/verify", verifyUserToken, verifyPayment);

// Step 11: Idempotent backup webhook confirmation
router.post("/webhook", handleWebhook);

module.exports = router;

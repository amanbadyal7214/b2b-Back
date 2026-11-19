const express = require("express");
const router = express.Router();
const {
  saveAddress,
  getAddresses,
  getCheckoutSummary,
} = require("../Controller/Checkoutcontroller");
const { verifyUserToken } = require("../Middleware/authMiddleware");

// Step 5: Address select/add with pincode serviceability check
router.post("/address", verifyUserToken, saveAddress);
router.get("/addresses", verifyUserToken, getAddresses);

// Step 6: Order summary calculation with server-verified prices & live stock check
router.get("/summary", verifyUserToken, getCheckoutSummary);

module.exports = router;

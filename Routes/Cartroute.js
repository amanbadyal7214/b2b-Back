const express = require("express");
const router = express.Router();
const cartController = require("../Controller/Cartcontroller");
const { optionalUserToken, verifyUserToken } = require("../Middleware/authMiddleware");

// Retrieve shopping bag (Guest or Authenticated)
router.get("/", optionalUserToken, cartController.getCart);

// Add SKU item to bag (Validates SKU, Color, Stock, Live Price)
router.post("/add", optionalUserToken, cartController.addToCart);

// Update SKU quantity (Debounced / Strict stock check)
router.put("/update", optionalUserToken, cartController.updateCartItem);

// Remove SKU item from bag
router.delete("/remove/:skuId", optionalUserToken, cartController.removeFromCart);
router.post("/remove", optionalUserToken, cartController.removeFromCart);

// Merge guest cart on login
router.post("/merge", verifyUserToken, cartController.mergeGuestCart);

// Clear bag
router.delete("/clear", optionalUserToken, cartController.clearCart);

module.exports = router;


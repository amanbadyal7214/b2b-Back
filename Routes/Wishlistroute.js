const express = require("express");
const router = express.Router();
const wishlistController = require("../Controller/Wishlistcontroller");
const { verifyUserToken, optionalUserToken } = require("../Middleware/authMiddleware");

// Retrieve user's wishlist
router.get("/", optionalUserToken, wishlistController.getWishlist);

// Toggle product in wishlist (Heart icon click)
router.post("/toggle", verifyUserToken, wishlistController.toggleWishlist);

// Remove specific product from wishlist
router.delete("/remove/:productId", verifyUserToken, wishlistController.removeFromWishlist);
router.post("/remove", verifyUserToken, wishlistController.removeFromWishlist);

// Move item from wishlist to cart (select size -> add to cart & remove from wishlist)
router.post("/move-to-cart", verifyUserToken, wishlistController.moveToCart);

// Sync guest wishlist on login
router.post("/sync", verifyUserToken, wishlistController.syncGuestWishlist);

module.exports = router;


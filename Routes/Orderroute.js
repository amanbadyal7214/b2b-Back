const express = require("express");
const router = express.Router();
const {
  createOrder,
  getOrderById,
  getUserOrders,
  getAllOrdersForAdmin,
  updateOrderStatusByAdmin,
} = require("../Controller/Ordercontroller");
const { verifyUserToken, optionalUserToken } = require("../Middleware/authMiddleware");

// Admin Orders Management (Placed before /:id)
router.get("/admin", getAllOrdersForAdmin);
router.get("/admin/all", getAllOrdersForAdmin);
router.get("/admin/:id", getOrderById);
router.patch("/admin/:id/status", updateOrderStatusByAdmin);
router.put("/admin/:id/status", updateOrderStatusByAdmin);
router.put("/admin/:id", updateOrderStatusByAdmin);

// Step 7: Create order from cart with server-verified prices & 15-min stock lock
router.post("/", verifyUserToken, createOrder);

// Retailer / Customer order history
router.get("/user", verifyUserToken, getUserOrders);
router.get("/my-orders", verifyUserToken, getUserOrders);

// Step 13: Confirmation screen & order retrieval
router.get("/:id", optionalUserToken, getOrderById);

// Order history fallback
router.get("/", optionalUserToken, (req, res, next) => {
  if (req.user) {
    return getUserOrders(req, res, next);
  }
  return getAllOrdersForAdmin(req, res, next);
});

module.exports = router;

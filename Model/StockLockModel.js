const mongoose = require("mongoose");

const stockLockSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    skuId: {
      type: String,
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL: automatic expiration when date arrives
    },
    status: {
      type: String,
      enum: ["active", "released", "deducted"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("StockLock", stockLockSchema);

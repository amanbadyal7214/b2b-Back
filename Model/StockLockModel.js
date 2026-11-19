const mongoose = require("mongoose");

/**
 * StockLock Schema
 * Tracks temporary inventory reservations during checkout/payment pending window (10-15 min).
 * NOTE: expiresAt is indexed for fast cron scans, NOT a TTL delete index,
 * because the cron job MUST decrement Inventory.reserved and log RELEASE before marking released.
 */
const stockLockSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      default: null,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
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
      trim: true,
      uppercase: true,
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
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "consumed", "deducted", "released"],
      default: "active",
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releaseReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

stockLockSchema.virtual("qty").get(function () {
  return this.quantity;
});

stockLockSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model("StockLock", stockLockSchema);

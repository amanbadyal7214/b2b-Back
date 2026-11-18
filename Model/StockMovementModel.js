const mongoose = require("mongoose");

/**
 * Immutable Stock Movement Audit Ledger
 * Records every stock change: who, when, why, refId, and exact before/after balances.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    skuId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      default: null,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "INWARD",
        "RESERVE",
        "DEDUCT",
        "RELEASE",
        "RETURN",
        "CANCEL",
        "ADJUST",
        "DAMAGED",
        "TRANSFER_OUT",
        "TRANSFER_IN",
        "CYCLE_COUNT",
      ],
      required: true,
      index: true,
    },
    qty: {
      type: Number,
      required: true,
    },
    beforeOnHand: { type: Number, default: 0 },
    afterOnHand: { type: Number, default: 0 },
    beforeReserved: { type: Number, default: 0 },
    afterReserved: { type: Number, default: 0 },
    beforeAvailable: { type: Number, default: 0 },
    afterAvailable: { type: Number, default: 0 },
    refId: {
      type: String,
      default: "",
      trim: true,
      index: true, // orderId, PO number, transfer ref, cycle count ref
    },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
    qcStatus: {
      type: String,
      enum: ["N/A", "PASS", "FAIL"],
      default: "N/A",
    },
    by: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    byModel: {
      type: String,
      enum: ["Admin", "User", "System"],
      default: "System",
    },
    byName: {
      type: String,
      default: "System",
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

stockMovementSchema.index({ skuId: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("StockMovement", stockMovementSchema);

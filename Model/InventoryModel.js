const mongoose = require("mongoose");

/**
 * SKU-level Inventory Schema
 * Inventory belongs to a SKU (product + color + size) inside a Warehouse.
 * Core 3 numbers:
 *   onHand    = physically present in warehouse
 *   reserved  = locked by pending/unpaid orders
 *   available = onHand - reserved (computed, shown to buyers)
 */
const inventorySchema = new mongoose.Schema(
  {
    skuId: {
      type: String,
      required: [true, "SKU ID is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"],
      index: true,
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: [true, "Warehouse reference is required"],
      index: true,
    },
    // Denormalized catalog metadata for fast admin search & reporting
    productName: {
      type: String,
      default: "",
      trim: true,
    },
    productSku: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },
    color: {
      type: String,
      default: "Standard",
      trim: true,
    },
    colorCode: {
      type: String,
      default: "#1F2422",
      trim: true,
    },
    size: {
      type: String,
      default: "STD",
      trim: true,
      uppercase: true,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    onHand: {
      type: Number,
      min: [0, "onHand cannot be negative"],
      default: 0,
    },
    reserved: {
      type: Number,
      min: [0, "reserved cannot be negative"],
      default: 0,
    },
    damaged: {
      type: Number,
      min: [0, "damaged cannot be negative"],
      default: 0,
    },
    reorderLevel: {
      type: Number,
      min: 0,
      default: 10,
    },
    moq: {
      type: Number,
      min: 1,
      default: 1,
    },
    lowStockAlertActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastInwardAt: {
      type: Date,
      default: null,
    },
    lastCountedAt: {
      type: Date,
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Unique SKU per warehouse (supports both single and multi-warehouse setups)
inventorySchema.index({ skuId: 1, warehouseId: 1 }, { unique: true });

// Virtual: available = onHand - reserved
inventorySchema.virtual("available").get(function () {
  return Math.max(0, (this.onHand || 0) - (this.reserved || 0));
});

// Virtual: computed stock status
inventorySchema.virtual("stockStatus").get(function () {
  const avail = Math.max(0, (this.onHand || 0) - (this.reserved || 0));
  if (avail <= 0) return "Out of Stock";
  if (avail <= (this.reorderLevel ?? 10)) return "Low Stock";
  return "In Stock";
});

inventorySchema.pre("save", function () {
  const avail = Math.max(0, (this.onHand || 0) - (this.reserved || 0));
  this.lowStockAlertActive = avail <= (this.reorderLevel ?? 10);
  this.updatedAt = new Date();
});

module.exports = mongoose.model("Inventory", inventorySchema);

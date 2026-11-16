const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    skuId: {
      type: String,
      required: true,
      trim: true, // e.g. "BVB-TEE-01-BLK-M"
    },
    productSku: {
      type: String,
      default: "",
      trim: true, // e.g. "BVB-TEE-01"
    },
    productName: {
      type: String,
      default: "",
      trim: true,
    },
    color: {
      type: String,
      required: true,
      trim: true,
    },
    colorCode: {
      type: String,
      default: "#121214",
    },
    size: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
      default: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    mrp: {
      type: Number,
      default: 0,
    },
    image: {
      type: String,
      default: "",
    },
    moq: {
      type: Number,
      default: 1,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    guestId: {
      type: String,
      default: null,
      index: true,
    },
    items: [cartItemSchema],
    status: {
      type: String,
      enum: ["active", "converted", "abandoned"],
      default: "active",
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Helper virtuals
cartSchema.virtual("subtotal").get(function () {
  return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
});

cartSchema.virtual("totalQuantity").get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

cartSchema.set("toJSON", { virtuals: true });
cartSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Cart", cartSchema);


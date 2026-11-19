const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    skuId: {
      type: String,
      required: true,
    },
    productSku: {
      type: String,
      default: "",
    },
    productName: {
      type: String,
      required: true,
    },
    color: {
      type: String,
      default: "Standard",
    },
    colorCode: {
      type: String,
      default: "#121214",
    },
    size: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
    },
    mrp: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    image: {
      type: String,
      default: "",
    },
    warehouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
    },
    cancelledQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    damagedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    itemStatus: {
      type: String,
      enum: ["active", "partially_cancelled", "cancelled", "returned"],
      default: "active",
    },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [orderItemSchema],
    totalUnits: {
      type: Number,
      required: true,
      min: 1,
    },
    shippingAddress: {
      storeName: { type: String, required: true },
      contactName: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: "" },
      street: { type: String, required: true },
      landmark: { type: String, default: "" },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      gstin: { type: String, default: "" },
    },
    pricing: {
      grossMerchandise: { type: Number, required: true },
      discountRate: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      gstRate: { type: Number, default: 0.05 },
      gstAmount: { type: Number, default: 0 },
      freightCost: { type: Number, default: 0 },
      grandTotal: { type: Number, required: true },
    },
    status: {
      type: String,
      enum: [
        "pending",
        "payment_pending",
        "paid",
        "processing",
        "dispatched",
        "delivered",
        "partially_cancelled",
        "cancelled",
        "returned",
        "failed",
        "expired",
      ],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "pending", "paid", "failed", "refunded"],
      default: "unpaid",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay", "upi", "bank_transfer", "cod", "sample_verification"],
      default: "razorpay",
    },
    razorpayOrderId: {
      type: String,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
    },
    stockLockedUntil: {
      type: Date,
      index: true,
    },
    isStockDeducted: {
      type: Boolean,
      default: false,
    },
    deliveryDetails: {
      estimatedDeliveryDate: { type: Date },
      estimatedDays: { type: Number, default: 3 },
      deliverySpeed: { type: String, default: "Standard 3-4 Days" },
      hub: { type: String, default: "Direct Dispatch Hub" },
      trackingNumber: { type: String, default: "" },
    },
    notes: {
      type: String,
      default: "",
    },
    paidAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);

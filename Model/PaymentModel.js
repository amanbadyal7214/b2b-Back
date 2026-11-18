const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    gateway: {
      type: String,
      enum: ["razorpay", "mock_gateway", "cod", "bank_transfer"],
      default: "razorpay",
    },
    gatewayOrderId: {
      type: String,
      index: true,
    },
    gatewayPaymentId: {
      type: String,
      index: true,
    },
    gatewaySignature: {
      type: String,
    },
    status: {
      type: String,
      enum: ["created", "authorized", "success", "failed", "refunded"],
      default: "created",
      index: true,
    },
    rawWebhookPayload: {
      type: mongoose.Schema.Types.Mixed,
    },
    errorMessage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payment", paymentSchema);

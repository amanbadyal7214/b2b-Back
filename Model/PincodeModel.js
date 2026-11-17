const mongoose = require("mongoose");

const pincodeSchema = new mongoose.Schema(
  {
    pincode: {
      type: String,
      required: [true, "6-digit Indian Pincode is required"],
      trim: true,
      unique: true,
      minlength: [6, "Pincode must be exactly 6 digits"],
      maxlength: [6, "Pincode must be exactly 6 digits"],
      match: [/^[1-9][0-9]{5}$/, "Please enter a valid 6-digit Indian postal pincode"],
      index: true,
    },
    city: {
      type: String,
      required: [true, "City / District is required"],
      trim: true,
    },
    state: {
      type: String,
      default: "India",
      trim: true,
    },
    hub: {
      type: String,
      default: "Direct Dispatch",
      trim: true,
    },
    estimatedDays: {
      type: Number,
      default: 3,
      min: [1, "Estimated delivery must be at least 1 day"],
      max: [15, "Estimated delivery cannot exceed 15 days"],
    },
    deliverySpeed: {
      type: String,
      enum: ["24-48h Express", "Standard 3-4 Days", "Regional 4-6 Days"],
      default: "Standard 3-4 Days",
    },
    isCodAvailable: {
      type: Boolean,
      default: true,
    },
    isPrepaidAvailable: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
      index: true,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Search text index for city, state, and pincode
pincodeSchema.index({ pincode: "text", city: "text", state: "text" });

module.exports = mongoose.model("Pincode", pincodeSchema);

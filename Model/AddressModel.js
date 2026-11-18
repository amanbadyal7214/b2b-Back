const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    storeName: {
      type: String,
      required: [true, "Store / Business name is required"],
      trim: true,
    },
    contactName: {
      type: String,
      required: [true, "Contact person name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Mobile phone number is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    street: {
      type: String,
      required: [true, "Street address / building is required"],
      trim: true,
    },
    landmark: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },
    pincode: {
      type: String,
      required: [true, "6-digit postal pincode is required"],
      trim: true,
      match: [/^[1-9][0-9]{5}$/, "Invalid 6-digit Indian pincode"],
      index: true,
    },
    gstin: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Address", addressSchema);

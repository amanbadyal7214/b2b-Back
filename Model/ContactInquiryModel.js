const mongoose = require("mongoose");

const contactInquirySchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      default: "",
      trim: true,
    },
    topic: {
      type: String,
      default: "Retailer Store Onboarding",
      trim: true,
    },
    topicValue: {
      type: String,
      default: "wholesale-onboarding",
      trim: true,
    },
    volume: {
      type: String,
      default: "50 – 150 Pieces · Boutique Floor",
      trim: true,
    },
    volumeValue: {
      type: String,
      default: "50-150",
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["new", "in_review", "contacted", "converted", "closed"],
      default: "new",
      index: true,
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true,
    },
    assignedTo: {
      type: String,
      default: "",
      trim: true,
    },
    contactedAt: {
      type: Date,
    },
    ipAddress: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactInquiry", contactInquirySchema);

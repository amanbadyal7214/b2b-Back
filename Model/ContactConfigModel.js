const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
  {
    value: { type: String, required: true },
    label: { type: String, required: true },
    meta: { type: String, default: "" },
  },
  { _id: false }
);

const volumeTierSchema = new mongoose.Schema(
  {
    value: { type: String, required: true },
    label: { type: String, required: true },
    hint: { type: String, default: "" },
  },
  { _id: false }
);

const contactConfigSchema = new mongoose.Schema(
  {
    supportEmail: {
      type: String,
      default: "wholesale@buddyvsbuff.com",
      trim: true,
    },
    supportPhone: {
      type: String,
      default: "+91 98204 00142",
      trim: true,
    },
    whatsappNumber: {
      type: String,
      default: "+919820400142",
      trim: true,
    },
    businessHours: {
      type: String,
      default: "Mon – Sat · 10:00 – 19:00 IST",
      trim: true,
    },
    showroomAddress: {
      type: String,
      default: "Kamala Mills, Lower Parel, Mumbai",
      trim: true,
    },
    millAddress: {
      type: String,
      default: "Avinashi Apparel Zone, Tiruppur, Tamil Nadu",
      trim: true,
    },
    responseCommitment: {
      type: String,
      default: "< 4h reply for verified GST accounts",
      trim: true,
    },
    topics: [topicSchema],
    volumeTiers: [volumeTierSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactConfig", contactConfigSchema);

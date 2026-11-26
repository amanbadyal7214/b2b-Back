const mongoose = require("mongoose");

const announcementItemSchema = new mongoose.Schema(
  {
    badge: {
      type: String,
      default: "ANNOUNCEMENT",
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    ctaText: {
      type: String,
      default: "Explore",
      trim: true,
    },
    link: {
      type: String,
      default: "/shop",
      trim: true,
    },
    highlight: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: true, timestamps: true }
);

const announcementConfigSchema = new mongoose.Schema(
  {
    isEnabled: {
      type: Boolean,
      default: true,
    },
    rotationSpeedSeconds: {
      type: Number,
      default: 4.8,
      min: 2,
      max: 20,
    },
    announcements: [announcementItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("AnnouncementConfig", announcementConfigSchema);

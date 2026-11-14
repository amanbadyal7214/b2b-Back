const mongoose = require("mongoose");

const fitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Fit name is required (e.g. Oversized, Relaxed, Tailored)"],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  { timestamps: true }
);

// Virtual for label compatibility
fitSchema.virtual("label").get(function () {
  return this.name;
});

fitSchema.set("toJSON", { virtuals: true });
fitSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Fit", fitSchema);


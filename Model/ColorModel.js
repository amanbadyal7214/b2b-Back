const mongoose = require("mongoose");

const colorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Color name is required (e.g. Obsidian Black)"],
      trim: true,
      unique: true,
    },
    hexCode: {
      type: String,
      required: [true, "HEX color code is required (e.g. #1C1D1F)"],
      trim: true,
      uppercase: true,
      match: [/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Please enter a valid HEX code like #000000 or #FFF"],
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
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

// Virtual properties so components can use label/hex interchangeably
colorSchema.virtual("label").get(function () {
  return this.name;
});

colorSchema.virtual("hex").get(function () {
  return this.hexCode;
});

colorSchema.set("toJSON", { virtuals: true });
colorSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Color", colorSchema);


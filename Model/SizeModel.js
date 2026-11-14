const mongoose = require("mongoose");

const sizeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Size name or label is required (e.g. S, M, L, 32)"],
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    system: {
      type: String,
      enum: ["Alpha", "Numeric", "FreeSize", "Custom"],
      default: "Alpha",
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    categoryType: {
      type: String,
      default: "General",
      trim: true,
    },
    chest: {
      type: String,
      default: "",
      trim: true,
    },
    waist: {
      type: String,
      default: "",
      trim: true,
    },
    length: {
      type: String,
      default: "",
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate code before saving if not provided (Zero-argument hook for modern Mongoose)
sizeSchema.pre("save", function () {
  if (!this.code && this.name) {
    const clean = this.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    this.code = `SZ-${clean}`;
  }
});

module.exports = mongoose.model("Size", sizeSchema);


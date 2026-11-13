const mongoose = require("mongoose");

const productTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product type name is required"],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
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

// Auto-generate slug and code before saving if not provided (Zero-argument hook for Mongoose 9)
productTypeSchema.pre("save", function () {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }
  if (!this.code && this.name) {
    const letters = this.name
      .replace(/[^a-zA-Z]/g, "")
      .substring(0, 3)
      .toUpperCase();
    this.code = `TYPE-${letters || "PRD"}-${Math.floor(100 + Math.random() * 900)}`;
  }
});

module.exports = mongoose.model("ProductType", productTypeSchema);

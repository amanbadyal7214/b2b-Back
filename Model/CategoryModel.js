const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
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
    productType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductType",
      default: null,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    imagePublicId: {
      type: String,
      default: "",
      trim: true,
    },
    itemCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate slug and code before saving if not provided
categorySchema.pre("save", function () {
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
    this.code = `CAT-${letters || "GEN"}-${Math.floor(100 + Math.random() * 900)}`;
  }
});

module.exports = mongoose.model("Category", categorySchema);


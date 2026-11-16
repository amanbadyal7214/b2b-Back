const mongoose = require("mongoose");

const wishlistItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    color: {
      type: String,
      default: "",
      trim: true,
    },
    colorCode: {
      type: String,
      default: "",
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const wishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: [wishlistItemSchema],
  },
  {
    timestamps: true,
  }
);

wishlistSchema.set("toJSON", { virtuals: true });
wishlistSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Wishlist", wishlistSchema);


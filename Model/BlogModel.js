const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Article title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    excerpt: {
      type: String,
      required: [true, "Article excerpt/summary is required"],
      trim: true,
      maxlength: [600, "Excerpt cannot exceed 600 characters"],
    },
    contentHtml: {
      type: String,
      required: [true, "Article content HTML is required"],
    },
    coverImageUrl: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=80",
    },
    category: {
      type: String,
      required: true,
      default: "Fabric & GSM",
      trim: true,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    author: {
      name: {
        type: String,
        default: "Buddy Vs Buff Textile Lab",
      },
      role: {
        type: String,
        default: "Senior Fabric Technologist",
      },
      avatar: {
        type: String,
        default:
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
      },
    },
    readingTime: {
      type: Number,
      default: 4, // in minutes
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
      index: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    views: {
      type: Number,
      default: 0,
    },
    linkedProductIds: {
      type: [String],
      default: [],
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Helper function to calculate reading time from HTML content
blogSchema.methods.calculateReadingTime = function () {
  if (!this.contentHtml) return 3;
  const text = this.contentHtml.replace(/<[^>]*>?/gm, " ");
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
};

module.exports = mongoose.model("Blog", blogSchema);

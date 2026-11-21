const mongoose = require("mongoose");

const featuredCollectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Collection title is required"],
      trim: true,
    },
    subtitle: {
      type: String,
      default: "",
      trim: true,
    },
    indexNumber: {
      type: String,
      default: "",
      trim: true,
    },
    duration: {
      type: String,
      default: "0:15",
      trim: true,
    },
    moq: {
      type: String,
      default: "MOQ 20 pcs",
      trim: true,
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
    video: {
      type: String,
      default: "",
      trim: true,
    },
    videoPublicId: {
      type: String,
      default: "",
      trim: true,
    },
    link: {
      type: String,
      default: "/shop",
      trim: true,
    },
    mediaPosition: {
      type: String,
      default: "object-center",
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
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

// Ensure virtual index is formatted if indexNumber is missing
featuredCollectionSchema.pre("save", async function () {
  if (!this.indexNumber) {
    const count = await mongoose.model("FeaturedCollection").countDocuments();
    this.indexNumber = String(count + 1).padStart(2, "0");
  }
});

module.exports = mongoose.model("FeaturedCollection", featuredCollectionSchema);

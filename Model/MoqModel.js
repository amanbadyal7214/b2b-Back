const mongoose = require("mongoose");

const moqSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "MOQ / Pack Type name is required (e.g. Editable MOQ, Low MOQ, Bulk Pack)"],
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
    hint: {
      type: String,
      default: "",
      trim: true,
    },
    minQuantity: {
      type: Number,
      default: 1,
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

// Virtuals for dropdown and frontend compatibility
moqSchema.virtual("label").get(function () {
  return this.name;
});

moqSchema.virtual("value").get(function () {
  return this.name;
});

moqSchema.set("toJSON", { virtuals: true });
moqSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Moq", moqSchema);


const mongoose = require("mongoose");

const fabricSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Fabric name is required (e.g. Combed Jersey, French Terry)"],
      trim: true,
    },
    gsm: {
      type: String,
      required: [true, "GSM / Weight is required (e.g. 280 GSM, 210-250 GSM)"],
      trim: true,
    },
    material: {
      type: String,
      default: "",
      trim: true,
    },
    weightTier: {
      type: String,
      enum: ["Lightweight", "Midweight", "Heavyweight", "Custom"],
      default: "Midweight",
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

// Compound index to ensure uniqueness across (name + gsm)
fabricSchema.index({ name: 1, gsm: 1 }, { unique: true });

// Virtuals for options formatting
fabricSchema.virtual("label").get(function () {
  return `${this.name} (${this.gsm})`;
});

fabricSchema.virtual("value").get(function () {
  return this.name;
});

fabricSchema.virtual("hint").get(function () {
  return this.gsm;
});

fabricSchema.set("toJSON", { virtuals: true });
fabricSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Fabric", fabricSchema);


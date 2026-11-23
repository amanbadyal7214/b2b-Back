const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    seq: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

/**
 * Get next sequence number atomically
 */
counterSchema.statics.getNextSequence = async function (key) {
  const result = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return result.seq;
};

module.exports = mongoose.model("Counter", counterSchema);

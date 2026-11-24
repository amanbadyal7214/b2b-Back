const mongoose = require("mongoose");

const pillarSchema = new mongoose.Schema(
  {
    number: { type: String, default: "01" },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const metricSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    val: { type: String, default: "" },
  },
  { _id: false }
);

const ourStorySchema = new mongoose.Schema(
  {
    eyebrow: {
      type: String,
      default: "OUR STORY · BORN IN TIRUPPUR",
      trim: true,
    },
    heading: {
      type: String,
      default: "Why We Built Buddy Vs Buff: Restoring Fabric Integrity to Indian Wholesale.",
      trim: true,
    },
    paragraph1: {
      type: String,
      default:
        "For over three decades, independent boutique owners travelled to crowded wholesale mandis. By the time a basic cotton t-shirt arrived on the retail shelf, it had passed through commission agents, state stockists, and city sub-distributors — each taking an 8% to 15% margin cut.",
      trim: true,
    },
    paragraph2: {
      type: String,
      default:
        "To protect margins, traditional manufacturers downgraded fabrics to flimsy 160 GSM carded yarn that warped and developed bacon necklines after two washes. We created Buddy Vs Buff to eliminate the middlemen and deliver genuine heavyweight 240 to 420 GSM streetwear directly from our Tiruppur circular looms to your store counter at honest factory wholesale rates.",
      trim: true,
    },
    image: {
      type: String,
      default: "", // Empty defaults to fallback asset on frontend
      trim: true,
    },
    imagePublicId: {
      type: String,
      default: "",
      trim: true,
    },
    badgeText: {
      type: String,
      default: "Tiruppur Circular Loom #04",
      trim: true,
    },
    quote: {
      type: String,
      default:
        "Every garment begins as raw combed cotton bales in Tamil Nadu, passing through our circular looms, reactive dye baths, and automated laser cutters before arriving in your store cartons.",
      trim: true,
    },
    quoteAuthor: {
      type: String,
      default: "100% Combed Compact Cotton",
      trim: true,
    },
    quoteSubtext: {
      type: String,
      default: "Batch Tiruppur",
      trim: true,
    },
    pillars: {
      type: [pillarSchema],
      default: [
        {
          number: "01",
          title: "240 to 420 GSM Rigor",
          description:
            "High-density 24-gauge circular knits that drape crisply and never bacon.",
        },
        {
          number: "02",
          title: "Zero Middlemen",
          description:
            "Direct mill billing with full GSTR-1 input tax credit on every carton.",
        },
        {
          number: "03",
          title: "Boutique Exclusivity",
          description:
            "We never sell single pieces to retail consumers, protecting your store prices.",
        },
        {
          number: "04",
          title: "48-Hour Hub Dispatch",
          description:
            "Central warehouse pre-assorted 1:2:2:2:1 size packs with zero deadstock.",
        },
      ],
    },
    metrics: {
      type: [metricSchema],
      default: [
        { label: "Verified Boutiques: ", val: "500+ Across 28 States" },
        { label: "First-Pass QC: ", val: "99.4% Accuracy" },
        { label: "Fabric Weight: ", val: "100% Combed Cotton" },
      ],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("OurStory", ourStorySchema);

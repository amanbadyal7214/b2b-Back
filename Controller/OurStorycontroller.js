const OurStory = require("../Model/OurStoryModel");
const { uploadToCloudinary } = require("../Config/cloudinary");

// Default initial story seed data
const DEFAULT_STORY_DATA = {
  eyebrow: "OUR STORY · BORN IN TIRUPPUR",
  heading: "Why We Built Buddy Vs Buff: Restoring Fabric Integrity to Indian Wholesale.",
  paragraph1:
    "For over three decades, independent boutique owners travelled to crowded wholesale mandis. By the time a basic cotton t-shirt arrived on the retail shelf, it had passed through commission agents, state stockists, and city sub-distributors — each taking an 8% to 15% margin cut.",
  paragraph2:
    "To protect margins, traditional manufacturers downgraded fabrics to flimsy 160 GSM carded yarn that warped and developed bacon necklines after two washes. We created Buddy Vs Buff to eliminate the middlemen and deliver genuine heavyweight 240 to 420 GSM streetwear directly from our Tiruppur circular looms to your store counter at honest factory wholesale rates.",
  image: "",
  imagePublicId: "",
  badgeText: "Tiruppur Circular Loom #04",
  quote:
    "Every garment begins as raw combed cotton bales in Tamil Nadu, passing through our circular looms, reactive dye baths, and automated laser cutters before arriving in your store cartons.",
  quoteAuthor: "100% Combed Compact Cotton",
  quoteSubtext: "Batch Tiruppur",
  pillars: [
    {
      number: "01",
      title: "240 to 420 GSM Rigor",
      description: "High-density 24-gauge circular knits that drape crisply and never bacon.",
    },
    {
      number: "02",
      title: "Zero Middlemen",
      description: "Direct mill billing with full GSTR-1 input tax credit on every carton.",
    },
    {
      number: "03",
      title: "Boutique Exclusivity",
      description: "We never sell single pieces to retail consumers, protecting your store prices.",
    },
    {
      number: "04",
      title: "48-Hour Hub Dispatch",
      description: "Central warehouse pre-assorted 1:2:2:2:1 size packs with zero deadstock.",
    },
  ],
  metrics: [
    { label: "Verified Boutiques: ", val: "500+ Across 28 States" },
    { label: "First-Pass QC: ", val: "99.4% Accuracy" },
    { label: "Fabric Weight: ", val: "100% Combed Cotton" },
  ],
};

/**
 * PUBLIC / ADMIN: Get Our Story Content
 * GET /api/our-story
 */
exports.getOurStory = async (req, res) => {
  try {
    let story = await OurStory.findOne().lean();

    if (!story) {
      story = await OurStory.create(DEFAULT_STORY_DATA);
    }

    return res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error("getOurStory Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load Our Story content",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Update Our Story Content
 * PUT /api/our-story
 */
exports.updateOurStory = async (req, res) => {
  try {
    let story = await OurStory.findOne();
    if (!story) {
      story = new OurStory(DEFAULT_STORY_DATA);
    }

    const {
      eyebrow,
      heading,
      paragraph1,
      paragraph2,
      badgeText,
      quote,
      quoteAuthor,
      quoteSubtext,
      image: imageUrl,
      pillars,
      metrics,
    } = req.body;

    if (eyebrow !== undefined) story.eyebrow = eyebrow.trim();
    if (heading !== undefined) story.heading = heading.trim();
    if (paragraph1 !== undefined) story.paragraph1 = paragraph1.trim();
    if (paragraph2 !== undefined) story.paragraph2 = paragraph2.trim();
    if (badgeText !== undefined) story.badgeText = badgeText.trim();
    if (quote !== undefined) story.quote = quote.trim();
    if (quoteAuthor !== undefined) story.quoteAuthor = quoteAuthor.trim();
    if (quoteSubtext !== undefined) story.quoteSubtext = quoteSubtext.trim();

    // Handle Direct Image URL or Cloudinary file upload
    if (req.file && req.file.buffer) {
      try {
        const uploadResult = await uploadToCloudinary(
          req.file.buffer,
          "b2b_our_story",
          "image"
        );
        if (uploadResult && uploadResult.url) {
          story.image = uploadResult.url;
          story.imagePublicId = uploadResult.public_id || "";
        }
      } catch (uploadErr) {
        console.warn("Cloudinary upload failed, falling back if URL provided:", uploadErr.message);
      }
    } else if (imageUrl !== undefined) {
      story.image = imageUrl.trim();
    }

    // Parse Pillars if stringified JSON from FormData
    if (pillars) {
      try {
        const parsedPillars = typeof pillars === "string" ? JSON.parse(pillars) : pillars;
        if (Array.isArray(parsedPillars)) {
          story.pillars = parsedPillars.map((p, idx) => ({
            number: p.number || `0${idx + 1}`,
            title: p.title || "",
            description: p.description || "",
          }));
        }
      } catch (e) {
        console.warn("Could not parse pillars JSON:", e.message);
      }
    }

    // Parse Metrics if stringified JSON from FormData
    if (metrics) {
      try {
        const parsedMetrics = typeof metrics === "string" ? JSON.parse(metrics) : metrics;
        if (Array.isArray(parsedMetrics)) {
          story.metrics = parsedMetrics.map((m) => ({
            label: m.label || "",
            val: m.val || "",
          }));
        }
      } catch (e) {
        console.warn("Could not parse metrics JSON:", e.message);
      }
    }

    await story.save();

    return res.status(200).json({
      success: true,
      message: "Our Story section updated successfully",
      data: story,
    });
  } catch (error) {
    console.error("updateOurStory Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update Our Story section",
      error: error.message,
    });
  }
};

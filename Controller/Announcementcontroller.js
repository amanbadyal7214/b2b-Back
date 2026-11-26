const AnnouncementConfig = require("../Model/AnnouncementModel");

// Default Factory Seed Data
const DEFAULT_ANNOUNCEMENTS = [
  {
    badge: "MILL-DIRECT",
    text: "Pan-India Wholesale Dispatch · 100% GST Tax Invoice Input Credit",
    ctaText: "Explore Catalog",
    link: "/shop",
    highlight: "Tiruppur & Mumbai Hubs",
    isActive: true,
    order: 0,
  },
  {
    badge: "BULK SLABS",
    text: "6% Off at 50+ Pcs · 12% Off & Free Insured Freight at 150+ Pcs",
    ctaText: "View Trade Slabs",
    link: "/become-retailer",
    highlight: "Tiered Pricing",
    isActive: true,
    order: 1,
  },
  {
    badge: "TRADE PASS",
    text: "Register Your Store Today · ₹2,499 Sample Verification Kit Credited on 1st Bulk PO",
    ctaText: "Apply For Pass",
    link: "/become-retailer",
    highlight: "4H Verification",
    isActive: true,
    order: 2,
  },
  {
    badge: "HEAVYWEIGHT GSM",
    text: "240–500 GSM Luxury Silhouettes · Low Starting Pack MOQ from 6 Pcs",
    ctaText: "Browse Drops",
    link: "/shop",
    highlight: "Ready 48h Dispatch",
    isActive: true,
    order: 3,
  },
];

/**
 * PUBLIC / ADMIN: Get Top Announcement Banner Configuration
 * GET /api/announcements
 */
exports.getAnnouncements = async (req, res) => {
  try {
    let config = await AnnouncementConfig.findOne().lean();

    if (!config) {
      config = await AnnouncementConfig.create({
        isEnabled: true,
        rotationSpeedSeconds: 4.8,
        announcements: DEFAULT_ANNOUNCEMENTS,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Announcement configuration retrieved successfully.",
      config: {
        _id: config._id,
        isEnabled: config.isEnabled !== undefined ? config.isEnabled : true,
        rotationSpeedSeconds: config.rotationSpeedSeconds || 4.8,
        announcements: Array.isArray(config.announcements) ? config.announcements : [],
      },
    });
  } catch (error) {
    console.error("[getAnnouncements] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch top announcement banner configuration.",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Update Top Announcement Banner Configuration
 * PUT /api/announcements
 */
exports.updateAnnouncements = async (req, res) => {
  try {
    const { isEnabled, rotationSpeedSeconds, announcements } = req.body;

    let config = await AnnouncementConfig.findOne();

    if (!config) {
      config = new AnnouncementConfig();
    }

    if (isEnabled !== undefined) {
      config.isEnabled = Boolean(isEnabled);
    }

    if (rotationSpeedSeconds !== undefined) {
      const speed = Number(rotationSpeedSeconds);
      if (!isNaN(speed) && speed >= 2 && speed <= 30) {
        config.rotationSpeedSeconds = speed;
      }
    }

    if (Array.isArray(announcements)) {
      config.announcements = announcements.map((item, index) => ({
        _id: item._id,
        badge: (item.badge || "ANNOUNCEMENT").trim().toUpperCase(),
        text: (item.text || "").trim(),
        ctaText: (item.ctaText || "Explore").trim(),
        link: (item.link || "/shop").trim(),
        highlight: (item.highlight || "").trim(),
        isActive: item.isActive !== undefined ? Boolean(item.isActive) : true,
        order: item.order !== undefined ? Number(item.order) : index,
      })).filter((item) => item.text.length > 0);
    }

    await config.save();

    return res.status(200).json({
      success: true,
      message: "Announcement banner configuration updated successfully.",
      config,
    });
  } catch (error) {
    console.error("[updateAnnouncements] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update announcement banner configuration.",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Reset Announcement Banner to Factory Defaults
 * POST /api/announcements/reset
 */
exports.resetDefaultAnnouncements = async (req, res) => {
  try {
    let config = await AnnouncementConfig.findOne();

    if (!config) {
      config = new AnnouncementConfig();
    }

    config.isEnabled = true;
    config.rotationSpeedSeconds = 4.8;
    config.announcements = DEFAULT_ANNOUNCEMENTS;

    await config.save();

    return res.status(200).json({
      success: true,
      message: "Announcement banner reset to factory default slides.",
      config,
    });
  } catch (error) {
    console.error("[resetDefaultAnnouncements] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset announcement banner configuration.",
      error: error.message,
    });
  }
};

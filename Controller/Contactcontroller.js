const ContactInquiry = require("../Model/ContactInquiryModel");
const ContactConfig = require("../Model/ContactConfigModel");

const DEFAULT_TOPICS = [
  {
    value: "wholesale-onboarding",
    label: "Retailer Store Onboarding",
    meta: "MOQ 20 · Tier Slabs",
  },
  {
    value: "sample-kit",
    label: "Request 3-Piece Sample Kit",
    meta: "48h Courier Dispatch",
  },
  {
    value: "bulk-production",
    label: "Bulk & Stockist Booking",
    meta: "200+ pcs Direct Mill",
  },
  {
    value: "private-label",
    label: "Private Label & Custom Ratios",
    meta: "OEM Wash & Neck Tags",
  },
  {
    value: "order-support",
    label: "Existing Order & Dispatch",
    meta: "GST & Tracking Desk",
  },
];

const DEFAULT_VOLUME_TIERS = [
  { value: "15-50", label: "15 – 50 Pieces · Trial Pack", hint: "MOQ" },
  { value: "50-150", label: "50 – 150 Pieces · Boutique Floor", hint: "TIER 1" },
  { value: "150-500", label: "150 – 500 Pieces · Multi-Store", hint: "TIER 2" },
  { value: "500-plus", label: "500+ Pieces · Regional Stockist", hint: "DIRECT" },
];

/**
 * PUBLIC: Submit a Wholesale Buyer Inquiry
 * POST /api/contact/inquiry
 */
exports.submitInquiry = async (req, res) => {
  try {
    const {
      fullName,
      businessName,
      email,
      phone,
      city,
      topic,
      topicValue,
      volume,
      volumeValue,
      message,
    } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }

    if (!businessName || !businessName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Boutique / Business store name is required.",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Corporate or business email is required.",
      });
    }

    // Generate unique reference ticket ID: BVB-INQ-XXXXXX
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const timeCode = Date.now().toString().slice(-4);
    const ticketId = `BVB-INQ-${timeCode}${randomSuffix}`;

    const ipAddress =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress || "";

    const newInquiry = await ContactInquiry.create({
      ticketId,
      fullName: fullName.trim(),
      businessName: businessName.trim(),
      email: email.trim().toLowerCase(),
      phone: (phone || "").trim(),
      city: (city || "").trim(),
      topic: (topic || "Retailer Store Onboarding").trim(),
      topicValue: (topicValue || "wholesale-onboarding").trim(),
      volume: (volume || "50 – 150 Pieces · Boutique Floor").trim(),
      volumeValue: (volumeValue || "50-150").trim(),
      message: (message || "").trim(),
      status: "new",
      ipAddress: String(ipAddress).slice(0, 50),
    });

    return res.status(201).json({
      success: true,
      message: `Enquiry ${ticketId} successfully submitted to the BVB Buying Desk.`,
      ticket: {
        refId: newInquiry.ticketId,
        name: newInquiry.fullName,
        business: newInquiry.businessName,
        email: newInquiry.email,
        topic: newInquiry.topic,
        volume: newInquiry.volume,
        createdAt: newInquiry.createdAt,
      },
    });
  } catch (error) {
    console.error("[submitInquiry] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit wholesale inquiry. Please try again.",
      error: error.message,
    });
  }
};

/**
 * PUBLIC / ADMIN: Get Contact Desk Configuration
 * GET /api/contact/config
 */
exports.getContactConfig = async (req, res) => {
  try {
    let config = await ContactConfig.findOne().lean();

    if (!config) {
      config = await ContactConfig.create({
        supportEmail: "wholesale@buddyvsbuff.com",
        supportPhone: "+91 98204 00142",
        whatsappNumber: "+919820400142",
        businessHours: "Mon – Sat · 10:00 – 19:00 IST",
        showroomAddress: "Kamala Mills, Lower Parel, Mumbai",
        millAddress: "Avinashi Apparel Zone, Tiruppur, Tamil Nadu",
        responseCommitment: "< 4h reply for verified GST accounts",
        topics: DEFAULT_TOPICS,
        volumeTiers: DEFAULT_VOLUME_TIERS,
      });
    }

    return res.status(200).json({
      success: true,
      config,
    });
  } catch (error) {
    console.error("[getContactConfig] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch contact configuration.",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Get All Inquiries with Metrics
 * GET /api/contact/admin/inquiries
 */
exports.getAllInquiries = async (req, res) => {
  try {
    const { status, topic, search } = req.query;

    const query = {};

    if (status && status !== "ALL") {
      query.status = status;
    }

    if (topic && topic !== "ALL") {
      query.$or = [{ topic: topic }, { topicValue: topic }];
    }

    if (search && search.trim()) {
      const s = search.trim();
      const regex = new RegExp(s, "i");
      query.$or = [
        { ticketId: regex },
        { fullName: regex },
        { businessName: regex },
        { email: regex },
        { phone: regex },
        { city: regex },
      ];
    }

    const inquiries = await ContactInquiry.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Summary counters
    const [total, newCount, inReviewCount, contactedCount, convertedCount, closedCount] =
      await Promise.all([
        ContactInquiry.countDocuments(),
        ContactInquiry.countDocuments({ status: "new" }),
        ContactInquiry.countDocuments({ status: "in_review" }),
        ContactInquiry.countDocuments({ status: "contacted" }),
        ContactInquiry.countDocuments({ status: "converted" }),
        ContactInquiry.countDocuments({ status: "closed" }),
      ]);

    return res.status(200).json({
      success: true,
      inquiries,
      metrics: {
        total,
        new: newCount,
        inReview: inReviewCount,
        contacted: contactedCount,
        converted: convertedCount,
        closed: closedCount,
      },
    });
  } catch (error) {
    console.error("[getAllInquiries] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch contact inquiries.",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Update Inquiry Status & Notes
 * PUT /api/contact/admin/inquiries/:id
 */
exports.updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, assignedTo } = req.body;

    const inquiry = await ContactInquiry.findById(id);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found.",
      });
    }

    if (status) {
      inquiry.status = status;
      if (status === "contacted" && !inquiry.contactedAt) {
        inquiry.contactedAt = new Date();
      }
    }

    if (adminNotes !== undefined) {
      inquiry.adminNotes = adminNotes.trim();
    }

    if (assignedTo !== undefined) {
      inquiry.assignedTo = assignedTo.trim();
    }

    await inquiry.save();

    return res.status(200).json({
      success: true,
      message: "Inquiry status updated successfully.",
      inquiry,
    });
  } catch (error) {
    console.error("[updateInquiryStatus] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update inquiry.",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Delete an Inquiry
 * DELETE /api/contact/admin/inquiries/:id
 */
exports.deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const inquiry = await ContactInquiry.findByIdAndDelete(id);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Inquiry ${inquiry.ticketId} deleted successfully.`,
    });
  } catch (error) {
    console.error("[deleteInquiry] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete inquiry.",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Update Contact Desk Configuration
 * PUT /api/contact/admin/config
 */
exports.updateContactConfig = async (req, res) => {
  try {
    const {
      supportEmail,
      supportPhone,
      whatsappNumber,
      businessHours,
      showroomAddress,
      millAddress,
      responseCommitment,
      topics,
      volumeTiers,
    } = req.body;

    let config = await ContactConfig.findOne();

    if (!config) {
      config = new ContactConfig();
    }

    if (supportEmail) config.supportEmail = supportEmail.trim();
    if (supportPhone) config.supportPhone = supportPhone.trim();
    if (whatsappNumber) config.whatsappNumber = whatsappNumber.trim();
    if (businessHours) config.businessHours = businessHours.trim();
    if (showroomAddress) config.showroomAddress = showroomAddress.trim();
    if (millAddress) config.millAddress = millAddress.trim();
    if (responseCommitment) config.responseCommitment = responseCommitment.trim();
    if (Array.isArray(topics)) config.topics = topics;
    if (Array.isArray(volumeTiers)) config.volumeTiers = volumeTiers;

    await config.save();

    return res.status(200).json({
      success: true,
      message: "Contact desk configuration updated successfully.",
      config,
    });
  } catch (error) {
    console.error("[updateContactConfig] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update contact configuration.",
      error: error.message,
    });
  }
};

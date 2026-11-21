const FeaturedCollection = require("../Model/FeaturedCollectionModel");
const { uploadToCloudinary, deleteFromCloudinary } = require("../Config/cloudinary");

const DEFAULT_SEEDS = [
  {
    title: "Oversized Essentials",
    subtitle: "Volume, comfort and the silhouettes shaping now.",
    indexNumber: "01",
    duration: "0:14",
    moq: "MOQ 20 pcs",
    image: "", // Frontend falls back to default imported assets if empty
    video: "",
    link: "/shop?category=tees",
    mediaPosition: "object-[50%_20%]",
    order: 1,
    status: "Active",
  },
  {
    title: "Everyday Shirts",
    subtitle: "Easy layers made for repeat wear.",
    indexNumber: "02",
    duration: "0:18",
    moq: "MOQ 20 pcs",
    image: "",
    video: "",
    link: "/shop?category=shirts",
    mediaPosition: "object-top",
    order: 2,
    status: "Active",
  },
  {
    title: "Premium Hoodies",
    subtitle: "Weight, softness and a confident relaxed fit.",
    indexNumber: "03",
    duration: "0:15",
    moq: "MOQ 20 pcs",
    image: "",
    video: "",
    link: "/shop?category=hoodies",
    mediaPosition: "object-[50%_18%]",
    order: 3,
    status: "Active",
  },
  {
    title: "Denim Edit",
    subtitle: "New washes. Familiar attitude.",
    indexNumber: "04",
    duration: "0:16",
    moq: "MOQ 15 pcs",
    image: "",
    video: "",
    link: "/shop?category=denim",
    mediaPosition: "object-[50%_22%]",
    order: 4,
    status: "Active",
  },
  {
    title: "Relaxed Bottomwear",
    subtitle: "Movement-first cuts with everyday character.",
    indexNumber: "05",
    duration: "0:12",
    moq: "MOQ 15 pcs",
    image: "",
    video: "",
    link: "/shop?category=trousers",
    mediaPosition: "object-center",
    order: 5,
    status: "Active",
  },
];

/**
 * Auto-seed initial 5 default collections if collection is completely empty
 */
const autoSeedIfEmpty = async () => {
  try {
    const count = await FeaturedCollection.countDocuments();
    if (count === 0) {
      await FeaturedCollection.insertMany(DEFAULT_SEEDS);
      console.log("[Featured Collections] Auto-seeded default 5 collections.");
    }
  } catch (err) {
    console.warn("[Featured Collections] Auto-seed note:", err.message);
  }
};

/**
 * Get all featured collections
 * GET /api/featured-collections
 * Query params:
 *  - all: "true" to include inactive (default for admin)
 *  - status: "Active" / "Inactive"
 */
exports.getFeaturedCollections = async (req, res) => {
  try {
    const { all, status } = req.query;

    await autoSeedIfEmpty();

    const query = {};
    if (status) {
      query.status = status;
    } else if (all !== "true" && all !== "1") {
      // For public frontend by default, show only active
      query.status = "Active";
    }

    const collections = await FeaturedCollection.find(query)
      .sort({ order: 1, createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: collections.length,
      collections,
    });
  } catch (error) {
    console.error("Error fetching featured collections:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch featured collections",
      error: error.message,
    });
  }
};

/**
 * Get single featured collection
 * GET /api/featured-collections/:id
 */
exports.getFeaturedCollectionById = async (req, res) => {
  try {
    const collection = await FeaturedCollection.findById(req.params.id);
    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "Featured collection not found",
      });
    }
    return res.status(200).json({
      success: true,
      collection,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch featured collection",
      error: error.message,
    });
  }
};

/**
 * Create a new featured collection
 * POST /api/featured-collections
 */
exports.createFeaturedCollection = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      indexNumber,
      duration,
      moq,
      link,
      mediaPosition,
      order,
      status,
      image: imageFromBody,
      video: videoFromBody,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Collection title is required",
      });
    }

    let imageUrl = imageFromBody ? String(imageFromBody).trim() : "";
    let imagePublicId = "";
    let videoUrl = videoFromBody ? String(videoFromBody).trim() : "";
    let videoPublicId = "";

    // Check for uploaded files (multer fields: image, poster, video)
    const imageFile =
      req.files?.image?.[0] ||
      req.files?.poster?.[0] ||
      (req.file?.fieldname === "image" || req.file?.fieldname === "poster" ? req.file : null);

    const videoFile =
      req.files?.video?.[0] ||
      (req.file?.fieldname === "video" ? req.file : null);

    // 1. Upload image if present
    if (imageFile && imageFile.buffer) {
      try {
        const uploadResult = await uploadToCloudinary(imageFile.buffer, "b2b_featured_collections", "image");
        imageUrl = uploadResult.url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Image upload error:", uploadErr);
        return res.status(500).json({
          success: false,
          message: `Failed to upload collection poster: ${uploadErr.message}`,
        });
      }
    } else if (imageUrl && !imageUrl.startsWith("http") && imageUrl.startsWith("data:image")) {
      try {
        const uploadResult = await uploadToCloudinary(imageUrl, "b2b_featured_collections", "image");
        imageUrl = uploadResult.url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.warn("Base64 image upload fallback:", uploadErr.message);
      }
    }

    // 2. Upload video if present
    if (videoFile && videoFile.buffer) {
      try {
        const uploadResult = await uploadToCloudinary(videoFile.buffer, "b2b_featured_collections", "video");
        videoUrl = uploadResult.url;
        videoPublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Video upload error:", uploadErr);
        return res.status(500).json({
          success: false,
          message: `Failed to upload collection video reel: ${uploadErr.message}`,
        });
      }
    } else if (videoUrl && !videoUrl.startsWith("http") && videoUrl.startsWith("data:video")) {
      try {
        const uploadResult = await uploadToCloudinary(videoUrl, "b2b_featured_collections", "video");
        videoUrl = uploadResult.url;
        videoPublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.warn("Base64 video upload fallback:", uploadErr.message);
      }
    }

    // Determine order and index number
    const totalCount = await FeaturedCollection.countDocuments();
    const finalOrder = order !== undefined && order !== "" ? Number(order) : totalCount + 1;
    const finalIndex = indexNumber?.trim() || String(totalCount + 1).padStart(2, "0");

    const newCollection = new FeaturedCollection({
      title: title.trim(),
      subtitle: subtitle ? subtitle.trim() : "",
      indexNumber: finalIndex,
      duration: duration ? duration.trim() : "0:15",
      moq: moq ? moq.trim() : "MOQ 20 pcs",
      image: imageUrl,
      imagePublicId,
      video: videoUrl,
      videoPublicId,
      link: link ? link.trim() : "/shop",
      mediaPosition: mediaPosition ? mediaPosition.trim() : "object-center",
      order: isNaN(finalOrder) ? 0 : finalOrder,
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    const saved = await newCollection.save();

    return res.status(201).json({
      success: true,
      message: `Featured Collection "${saved.title}" created successfully`,
      collection: saved,
    });
  } catch (error) {
    console.error("Error creating featured collection:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create featured collection",
      error: error.message,
    });
  }
};

/**
 * Update an existing featured collection
 * PUT /api/featured-collections/:id
 */
exports.updateFeaturedCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await FeaturedCollection.findById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Featured collection not found",
      });
    }

    const {
      title,
      subtitle,
      indexNumber,
      duration,
      moq,
      link,
      mediaPosition,
      order,
      status,
      image: imageFromBody,
      video: videoFromBody,
    } = req.body;

    if (title && title.trim()) {
      existing.title = title.trim();
    }
    if (subtitle !== undefined) {
      existing.subtitle = subtitle.trim();
    }
    if (indexNumber !== undefined) {
      existing.indexNumber = indexNumber.trim();
    }
    if (duration !== undefined) {
      existing.duration = duration.trim();
    }
    if (moq !== undefined) {
      existing.moq = moq.trim();
    }
    if (link !== undefined) {
      existing.link = link.trim();
    }
    if (mediaPosition !== undefined) {
      existing.mediaPosition = mediaPosition.trim();
    }
    if (order !== undefined && order !== "") {
      existing.order = Number(order);
    }
    if (status !== undefined) {
      existing.status = status;
    }

    // Handle Image Replacement
    const imageFile =
      req.files?.image?.[0] ||
      req.files?.poster?.[0] ||
      (req.file?.fieldname === "image" || req.file?.fieldname === "poster" ? req.file : null);

    if (imageFile && imageFile.buffer) {
      try {
        if (existing.imagePublicId) {
          await deleteFromCloudinary(existing.imagePublicId, "image");
        }
        const uploadResult = await uploadToCloudinary(imageFile.buffer, "b2b_featured_collections", "image");
        existing.image = uploadResult.url;
        existing.imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        return res.status(500).json({
          success: false,
          message: `Failed to replace image: ${uploadErr.message}`,
        });
      }
    } else if (imageFromBody !== undefined) {
      const trimmedImg = String(imageFromBody).trim();
      if (trimmedImg.startsWith("data:image")) {
        try {
          if (existing.imagePublicId) {
            await deleteFromCloudinary(existing.imagePublicId, "image");
          }
          const uploadResult = await uploadToCloudinary(trimmedImg, "b2b_featured_collections", "image");
          existing.image = uploadResult.url;
          existing.imagePublicId = uploadResult.public_id;
        } catch (uploadErr) {
          existing.image = trimmedImg;
        }
      } else {
        existing.image = trimmedImg;
      }
    }

    // Handle Video Replacement
    const videoFile =
      req.files?.video?.[0] ||
      (req.file?.fieldname === "video" ? req.file : null);

    if (videoFile && videoFile.buffer) {
      try {
        if (existing.videoPublicId) {
          await deleteFromCloudinary(existing.videoPublicId, "video");
        }
        const uploadResult = await uploadToCloudinary(videoFile.buffer, "b2b_featured_collections", "video");
        existing.video = uploadResult.url;
        existing.videoPublicId = uploadResult.public_id;
      } catch (uploadErr) {
        return res.status(500).json({
          success: false,
          message: `Failed to replace video reel: ${uploadErr.message}`,
        });
      }
    } else if (videoFromBody !== undefined) {
      const trimmedVid = String(videoFromBody).trim();
      if (trimmedVid.startsWith("data:video")) {
        try {
          if (existing.videoPublicId) {
            await deleteFromCloudinary(existing.videoPublicId, "video");
          }
          const uploadResult = await uploadToCloudinary(trimmedVid, "b2b_featured_collections", "video");
          existing.video = uploadResult.url;
          existing.videoPublicId = uploadResult.public_id;
        } catch (uploadErr) {
          existing.video = trimmedVid;
        }
      } else {
        existing.video = trimmedVid;
      }
    }

    const updated = await existing.save();

    return res.status(200).json({
      success: true,
      message: `Featured collection "${updated.title}" updated successfully`,
      collection: updated,
    });
  } catch (error) {
    console.error("Error updating featured collection:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update featured collection",
      error: error.message,
    });
  }
};

/**
 * Delete a featured collection
 * DELETE /api/featured-collections/:id
 */
exports.deleteFeaturedCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const collection = await FeaturedCollection.findById(id);

    if (!collection) {
      return res.status(404).json({
        success: false,
        message: "Featured collection not found",
      });
    }

    if (collection.imagePublicId) {
      await deleteFromCloudinary(collection.imagePublicId, "image");
    }
    if (collection.videoPublicId) {
      await deleteFromCloudinary(collection.videoPublicId, "video");
    }

    await FeaturedCollection.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: `Featured collection "${collection.title}" deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting featured collection:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete featured collection",
      error: error.message,
    });
  }
};

/**
 * Seed or Reset default collections
 * POST /api/featured-collections/seed
 */
exports.seedFeaturedCollections = async (req, res) => {
  try {
    const { reset } = req.body || {};
    if (reset) {
      await FeaturedCollection.deleteMany({});
    }
    const currentCount = await FeaturedCollection.countDocuments();
    if (currentCount === 0) {
      await FeaturedCollection.insertMany(DEFAULT_SEEDS);
    }
    const all = await FeaturedCollection.find().sort({ order: 1 });
    return res.status(200).json({
      success: true,
      message: "Featured collections seeded successfully",
      count: all.length,
      collections: all,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to seed featured collections",
      error: error.message,
    });
  }
};

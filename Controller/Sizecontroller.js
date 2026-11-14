const mongoose = require("mongoose");
const Size = require("../Model/SizeModel");
const Category = require("../Model/CategoryModel");

/**
 * Standard default apparel sizes with logical ordering
 */
const DEFAULT_APPAREL_SIZES = [
  // Alpha Sizes (Tops)
  { name: "XS", code: "SZ-XS", system: "Alpha", categoryType: "Topwear", sortOrder: 1, chest: "34-36 in", description: "Extra Small", status: "Active" },
  { name: "S", code: "SZ-S", system: "Alpha", categoryType: "Topwear", sortOrder: 2, chest: "36-38 in", description: "Small", status: "Active" },
  { name: "M", code: "SZ-M", system: "Alpha", categoryType: "Topwear", sortOrder: 3, chest: "38-40 in", description: "Medium", status: "Active" },
  { name: "L", code: "SZ-L", system: "Alpha", categoryType: "Topwear", sortOrder: 4, chest: "40-42 in", description: "Large", status: "Active" },
  { name: "XL", code: "SZ-XL", system: "Alpha", categoryType: "Topwear", sortOrder: 5, chest: "42-44 in", description: "Extra Large", status: "Active" },
  { name: "XXL", code: "SZ-XXL", system: "Alpha", categoryType: "Topwear", sortOrder: 6, chest: "44-46 in", description: "Double Extra Large", status: "Active" },
  { name: "3XL", code: "SZ-3XL", system: "Alpha", categoryType: "Topwear", sortOrder: 7, chest: "46-48 in", description: "Triple Extra Large", status: "Active" },

  // Waist / Numeric Sizes (Bottoms)
  { name: "28", code: "SZ-28", system: "Numeric", categoryType: "Bottomwear", sortOrder: 10, waist: "28 in", description: "Waist 28 Inch", status: "Active" },
  { name: "30", code: "SZ-30", system: "Numeric", categoryType: "Bottomwear", sortOrder: 11, waist: "30 in", description: "Waist 30 Inch", status: "Active" },
  { name: "32", code: "SZ-32", system: "Numeric", categoryType: "Bottomwear", sortOrder: 12, waist: "32 in", description: "Waist 32 Inch", status: "Active" },
  { name: "34", code: "SZ-34", system: "Numeric", categoryType: "Bottomwear", sortOrder: 13, waist: "34 in", description: "Waist 34 Inch", status: "Active" },
  { name: "36", code: "SZ-36", system: "Numeric", categoryType: "Bottomwear", sortOrder: 14, waist: "36 in", description: "Waist 36 Inch", status: "Active" },
  { name: "38", code: "SZ-38", system: "Numeric", categoryType: "Bottomwear", sortOrder: 15, waist: "38 in", description: "Waist 38 Inch", status: "Active" },

  // Free / Universal
  { name: "Free Size", code: "SZ-FS", system: "FreeSize", categoryType: "General", sortOrder: 20, description: "One Size Fits All", status: "Active" },
];

/**
 * Get all product sizes
 * GET /api/sizes
 * Query params: ?status=Active&system=Alpha&search=M
 */
exports.getSizes = async (req, res) => {
  try {
    // Auto-seed defaults if collection is empty
    const totalCount = await Size.countDocuments();
    if (totalCount === 0) {
      try {
        await Size.insertMany(DEFAULT_APPAREL_SIZES);
      } catch (seedErr) {
        console.warn("Auto-seeding sizes error:", seedErr.message);
      }
    }

    const { status, system, search, category, categoryType } = req.query;
    const filter = {};

    if (status && status !== "ALL") {
      filter.status = status;
    }
    if (system && system !== "ALL") {
      filter.system = system;
    }
    if (category && category !== "ALL") {
      if (mongoose.isValidObjectId(category)) {
        filter.category = category;
      } else {
        filter.categoryType = category;
      }
    } else if (categoryType && categoryType !== "ALL") {
      if (mongoose.isValidObjectId(categoryType)) {
        filter.category = categoryType;
      } else {
        filter.categoryType = categoryType;
      }
    }

    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { code: { $regex: search.trim(), $options: "i" } },
        { categoryType: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const sizes = await Size.find(filter)
      .populate("category", "name slug code image")
      .sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({
      success: true,
      count: sizes.length,
      sizes,
    });
  } catch (error) {
    console.error("Error fetching sizes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sizes",
      error: error.message,
    });
  }
};

/**
 * Get single size by ID
 * GET /api/sizes/:id
 */
exports.getSizeById = async (req, res) => {
  try {
    const { id } = req.params;
    const size = await Size.findById(id).populate("category", "name slug code image");

    if (!size) {
      return res.status(404).json({
        success: false,
        message: "Size not found",
      });
    }

    return res.status(200).json({
      success: true,
      size,
    });
  } catch (error) {
    console.error("Error fetching size by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch size",
      error: error.message,
    });
  }
};

/**
 * Create a new size
 * POST /api/sizes
 */
exports.createSize = async (req, res) => {
  try {
    const {
      name,
      code,
      system,
      category,
      categoryType,
      chest,
      waist,
      length,
      sortOrder,
      description,
      status,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Size name is required (e.g. S, M, 32)",
      });
    }

    const trimmedName = name.trim();

    // Check if size already exists
    const existing = await Size.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Size "${trimmedName}" already exists`,
      });
    }

    // Auto-detect system if not specified
    let determinedSystem = system;
    if (!determinedSystem) {
      if (/^\d+$/.test(trimmedName)) {
        determinedSystem = "Numeric";
      } else if (["free size", "free", "onesize", "one size"].includes(trimmedName.toLowerCase())) {
        determinedSystem = "FreeSize";
      } else {
        determinedSystem = "Alpha";
      }
    }

    // Resolve Category reference if provided (by ID or object)
    let resolvedCategory = null;
    let resolvedCategoryName = categoryType ? categoryType.trim() : "General";

    const catLookup = category || (categoryType && mongoose.isValidObjectId(categoryType) ? categoryType : null);
    if (catLookup && mongoose.isValidObjectId(catLookup)) {
      const catDoc = await Category.findById(catLookup);
      if (catDoc) {
        resolvedCategory = catDoc._id;
        resolvedCategoryName = catDoc.name;
      }
    } else if (categoryType && categoryType.trim() && categoryType.trim() !== "General") {
      const catDoc = await Category.findOne({ name: new RegExp(`^${categoryType.trim()}$`, "i") });
      if (catDoc) {
        resolvedCategory = catDoc._id;
        resolvedCategoryName = catDoc.name;
      }
    }

    // Calculate sort order if not given
    let calculatedOrder = sortOrder;
    if (calculatedOrder === undefined || calculatedOrder === null || calculatedOrder === "") {
      const highest = await Size.findOne().sort({ sortOrder: -1 });
      calculatedOrder = highest && !isNaN(highest.sortOrder) ? highest.sortOrder + 1 : 1;
    }

    const newSize = new Size({
      name: trimmedName,
      code: code ? code.trim().toUpperCase() : undefined,
      system: determinedSystem,
      category: resolvedCategory,
      categoryType: resolvedCategoryName,
      chest: chest ? chest.trim() : "",
      waist: waist ? waist.trim() : "",
      length: length ? length.trim() : "",
      sortOrder: Number(calculatedOrder) || 0,
      description: description ? description.trim() : "",
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    const savedSize = await newSize.save();
    const populated = await savedSize.populate("category", "name slug code image");

    return res.status(201).json({
      success: true,
      message: "Size created successfully",
      size: populated,
    });
  } catch (error) {
    console.error("Error creating size:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create size",
      error: error.message,
    });
  }
};

/**
 * Update an existing size
 * PUT /api/sizes/:id
 */
exports.updateSize = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      system,
      category,
      categoryType,
      chest,
      waist,
      length,
      sortOrder,
      description,
      status,
    } = req.body;

    const size = await Size.findById(id);
    if (!size) {
      return res.status(404).json({
        success: false,
        message: "Size not found",
      });
    }

    if (name && name.trim()) {
      const trimmedName = name.trim();
      // Check for name duplicate on another size
      const duplicate = await Size.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Size "${trimmedName}" is already used by another record`,
        });
      }
      size.name = trimmedName;
    }

    if (code !== undefined) {
      size.code = code ? code.trim().toUpperCase() : `SZ-${size.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`;
    }
    if (system !== undefined) size.system = system;

    if (category !== undefined || categoryType !== undefined) {
      const catLookup = category !== undefined ? category : categoryType;
      if (catLookup && mongoose.isValidObjectId(catLookup)) {
        const catDoc = await Category.findById(catLookup);
        if (catDoc) {
          size.category = catDoc._id;
          size.categoryType = catDoc.name;
        } else {
          size.category = null;
          size.categoryType = "General";
        }
      } else if (typeof categoryType === "string" && categoryType.trim() && categoryType.trim() !== "General") {
        const catDoc = await Category.findOne({ name: new RegExp(`^${categoryType.trim()}$`, "i") });
        if (catDoc) {
          size.category = catDoc._id;
          size.categoryType = catDoc.name;
        } else {
          size.category = null;
          size.categoryType = categoryType.trim();
        }
      } else {
        size.category = null;
        size.categoryType = "General";
      }
    }

    if (chest !== undefined) size.chest = chest.trim();
    if (waist !== undefined) size.waist = waist.trim();
    if (length !== undefined) size.length = length.trim();
    if (sortOrder !== undefined) size.sortOrder = Number(sortOrder) || 0;
    if (description !== undefined) size.description = description.trim();
    if (status !== undefined) size.status = status;

    const updatedSize = await size.save();
    const populated = await updatedSize.populate("category", "name slug code image");

    return res.status(200).json({
      success: true,
      message: "Size updated successfully",
      size: populated,
    });
  } catch (error) {
    console.error("Error updating size:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update size",
      error: error.message,
    });
  }
};

/**
 * Delete a size
 * DELETE /api/sizes/:id
 */
exports.deleteSize = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Size.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Size not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Size "${deleted.name}" deleted successfully`,
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting size:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete size",
      error: error.message,
    });
  }
};

/**
 * Seed default standard apparel sizes
 * POST /api/sizes/seed
 */
exports.seedSizes = async (req, res) => {
  try {
    let createdCount = 0;
    let existingCount = 0;

    for (const item of DEFAULT_APPAREL_SIZES) {
      const existing = await Size.findOne({
        name: { $regex: new RegExp(`^${item.name}$`, "i") },
      });

      if (!existing) {
        await Size.create(item);
        createdCount++;
      } else {
        existingCount++;
      }
    }

    const allSizes = await Size.find().sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({
      success: true,
      message: `Sizes seeded: ${createdCount} created, ${existingCount} already existed.`,
      count: allSizes.length,
      sizes: allSizes,
    });
  } catch (error) {
    console.error("Error seeding sizes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to seed default sizes",
      error: error.message,
    });
  }
};


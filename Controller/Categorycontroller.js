const Category = require("../Model/CategoryModel");
const ProductType = require("../Model/ProductTypeModel");
const { uploadToCloudinary, deleteFromCloudinary } = require("../Config/cloudinary");

/**
 * Get all product categories
 * GET /api/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find()
      .populate("productType", "name code status")
      .sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: error.message,
    });
  }
};

/**
 * Create a new product category (Supports image upload via Multer or base64/URL)
 * POST /api/categories
 */
exports.createCategory = async (req, res) => {
  try {
    const { name, description, code, status, productType, type, image } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const trimmedName = name.trim();

    // Check if category already exists
    const existing = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Category "${trimmedName}" already exists`,
      });
    }

    // Optional productType resolution
    let resolvedTypeId = null;
    const typeIdToLookup = productType || type;
    if (typeIdToLookup) {
      const typeExists = await ProductType.findById(typeIdToLookup);
      if (typeExists) {
        resolvedTypeId = typeExists._id;
      }
    }

    // Handle Cloudinary Image Upload
    let imageUrl = "";
    let imagePublicId = "";

    // 1. If uploaded as file via multer
    if (req.file && req.file.buffer) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, "b2b_categories");
        imageUrl = uploadResult.url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Error uploading file to Cloudinary:", uploadErr);
      }
    }
    // 2. If uploaded as base64 data URI or string URL in body
    else if (image && typeof image === "string" && image.trim()) {
      try {
        const uploadResult = await uploadToCloudinary(image.trim(), "b2b_categories");
        imageUrl = uploadResult.url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Error uploading image string to Cloudinary:", uploadErr);
        imageUrl = image.trim(); // fallback to direct string if given
      }
    }

    const newCategory = new Category({
      name: trimmedName,
      description: description ? description.trim() : "",
      code: code ? code.trim().toUpperCase() : undefined,
      status: status === "Inactive" ? "Inactive" : "Active",
      productType: resolvedTypeId,
      image: imageUrl,
      imagePublicId: imagePublicId,
    });

    const savedCategory = await newCategory.save();
    const populated = await savedCategory.populate("productType", "name code status");

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: populated,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: error.message,
    });
  }
};

/**
 * Update a category (Supports updating image via Multer or base64/URL)
 * PUT /api/categories/:id
 */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, code, status, productType, type, image } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (name && name.trim()) {
      category.name = name.trim();
      category.slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
    }
    if (description !== undefined) category.description = description.trim();
    if (code) category.code = code.trim().toUpperCase();
    if (status) category.status = status;

    if (productType !== undefined || type !== undefined) {
      const typeIdToLookup = productType !== undefined ? productType : type;
      if (typeIdToLookup) {
        const typeExists = await ProductType.findById(typeIdToLookup);
        category.productType = typeExists ? typeExists._id : null;
      } else {
        category.productType = null;
      }
    }

    // Handle Image Replacement
    if (req.file && req.file.buffer) {
      try {
        if (category.imagePublicId) {
          await deleteFromCloudinary(category.imagePublicId);
        }
        const uploadResult = await uploadToCloudinary(req.file.buffer, "b2b_categories");
        category.image = uploadResult.url;
        category.imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Error uploading file to Cloudinary:", uploadErr);
      }
    } else if (image !== undefined) {
      if (typeof image === "string" && image.startsWith("data:image")) {
        try {
          if (category.imagePublicId) {
            await deleteFromCloudinary(category.imagePublicId);
          }
          const uploadResult = await uploadToCloudinary(image, "b2b_categories");
          category.image = uploadResult.url;
          category.imagePublicId = uploadResult.public_id;
        } catch (uploadErr) {
          console.error("Error uploading base64 to Cloudinary:", uploadErr);
        }
      } else if (typeof image === "string") {
        category.image = image.trim();
      }
    }

    const updated = await category.save();
    const populated = await updated.populate("productType", "name code status");

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category: populated,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update category",
      error: error.message,
    });
  }
};

/**
 * Delete a category
 * DELETE /api/categories/:id
 */
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Category.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Clean up Cloudinary asset
    if (deleted.imagePublicId) {
      await deleteFromCloudinary(deleted.imagePublicId);
    }

    return res.status(200).json({
      success: true,
      message: "Category removed successfully",
      category: deleted,
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete category",
      error: error.message,
    });
  }
};

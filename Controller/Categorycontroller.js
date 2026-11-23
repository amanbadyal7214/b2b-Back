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
 * Create a new product category (Supports image & catalogue PDF upload via Multer or base64/URL)
 * POST /api/categories
 */
exports.createCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      code,
      status,
      productType,
      type,
      image,
      cataloguePdf,
      cataloguePdfName,
      cataloguePdfSize,
    } = req.body;

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

    const imageFile =
      req.files?.image?.[0] ||
      (req.file?.fieldname === "image" ? req.file : null);

    const pdfFile =
      req.files?.pdf?.[0] ||
      req.files?.cataloguePdf?.[0] ||
      (req.file?.fieldname === "pdf" || req.file?.fieldname === "cataloguePdf"
        ? req.file
        : null);

    // Handle Image Upload
    let imageUrl = "";
    let imagePublicId = "";

    if (imageFile && imageFile.buffer) {
      try {
        const uploadResult = await uploadToCloudinary(imageFile.buffer, "b2b_categories");
        imageUrl = uploadResult.url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Error uploading image file to Cloudinary:", uploadErr);
        return res.status(500).json({
          success: false,
          message: `Failed to upload image to Cloudinary: ${uploadErr.message || "Network/Cloud error"}`,
        });
      }
    } else if (image && typeof image === "string" && image.trim()) {
      try {
        const uploadResult = await uploadToCloudinary(image.trim(), "b2b_categories");
        imageUrl = uploadResult.url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Error uploading image string to Cloudinary:", uploadErr);
        return res.status(500).json({
          success: false,
          message: `Failed to upload image to Cloudinary: ${uploadErr.message || "Network/Cloud error"}`,
        });
      }
    }

    // Handle Catalogue PDF Upload
    let pdfUrl = "";
    let pdfPublicId = "";
    let pdfName = cataloguePdfName || "";
    let pdfSize = cataloguePdfSize || "";

    if (pdfFile && pdfFile.buffer) {
      pdfName = pdfFile.originalname || `${trimmedName}-Catalogue.pdf`;
      const sizeBytes = pdfFile.size || pdfFile.buffer.length;
      pdfSize =
        sizeBytes < 1024 * 1024
          ? `${Math.round(sizeBytes / 1024)} KB`
          : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;

      try {
        const uploadResult = await uploadToCloudinary(pdfFile.buffer, "b2b_catalogues", "auto");
        pdfUrl = uploadResult.url;
        pdfPublicId = uploadResult.public_id;
      } catch (pdfErr) {
        console.warn("Cloudinary PDF upload failed, fallback to base64 data URI:", pdfErr.message);
        pdfUrl = `data:application/pdf;base64,${pdfFile.buffer.toString("base64")}`;
      }
    } else if (cataloguePdf && typeof cataloguePdf === "string" && cataloguePdf.trim()) {
      pdfUrl = cataloguePdf.trim();
      pdfName = cataloguePdfName || `${trimmedName}-Catalogue.pdf`;
      pdfSize = cataloguePdfSize || "Digital PDF";
    }

    const newCategory = new Category({
      name: trimmedName,
      description: description ? description.trim() : "",
      code: code ? code.trim().toUpperCase() : undefined,
      status: status === "Inactive" ? "Inactive" : "Active",
      productType: resolvedTypeId,
      image: imageUrl,
      imagePublicId: imagePublicId,
      cataloguePdf: pdfUrl,
      cataloguePdfPublicId: pdfPublicId,
      cataloguePdfName: pdfName,
      cataloguePdfSize: pdfSize,
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
 * Update a category (Supports updating image & catalogue PDF via Multer or base64/URL)
 * PUT /api/categories/:id
 */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      code,
      status,
      productType,
      type,
      image,
      cataloguePdf,
      cataloguePdfName,
      cataloguePdfSize,
    } = req.body;

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

    const imageFile =
      req.files?.image?.[0] ||
      (req.file?.fieldname === "image" ? req.file : null);

    const pdfFile =
      req.files?.pdf?.[0] ||
      req.files?.cataloguePdf?.[0] ||
      (req.file?.fieldname === "pdf" || req.file?.fieldname === "cataloguePdf"
        ? req.file
        : null);

    // Handle Image Replacement
    if (imageFile && imageFile.buffer) {
      try {
        if (category.imagePublicId) {
          await deleteFromCloudinary(category.imagePublicId);
        }
        const uploadResult = await uploadToCloudinary(imageFile.buffer, "b2b_categories");
        category.image = uploadResult.url;
        category.imagePublicId = uploadResult.public_id;
      } catch (uploadErr) {
        console.error("Error uploading file to Cloudinary:", uploadErr);
        return res.status(500).json({
          success: false,
          message: `Failed to upload image to Cloudinary: ${uploadErr.message || "Network/Cloud error"}`,
        });
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
          return res.status(500).json({
            success: false,
            message: `Failed to upload image to Cloudinary: ${uploadErr.message || "Network/Cloud error"}`,
          });
        }
      } else if (typeof image === "string") {
        category.image = image.trim();
      }
    }

    // Handle Catalogue PDF Replacement
    if (pdfFile && pdfFile.buffer) {
      try {
        if (category.cataloguePdfPublicId) {
          await deleteFromCloudinary(category.cataloguePdfPublicId, "auto");
        }
        const uploadResult = await uploadToCloudinary(pdfFile.buffer, "b2b_catalogues", "auto");
        category.cataloguePdf = uploadResult.url;
        category.cataloguePdfPublicId = uploadResult.public_id;
        category.cataloguePdfName = pdfFile.originalname || `${category.name}-Catalogue.pdf`;
        const sizeBytes = pdfFile.size || pdfFile.buffer.length;
        category.cataloguePdfSize =
          sizeBytes < 1024 * 1024
            ? `${Math.round(sizeBytes / 1024)} KB`
            : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      } catch (pdfErr) {
        console.warn("Cloudinary PDF upload failed, fallback to base64 data URI:", pdfErr.message);
        category.cataloguePdf = `data:application/pdf;base64,${pdfFile.buffer.toString("base64")}`;
        category.cataloguePdfName = pdfFile.originalname || `${category.name}-Catalogue.pdf`;
        const sizeBytes = pdfFile.size || pdfFile.buffer.length;
        category.cataloguePdfSize =
          sizeBytes < 1024 * 1024
            ? `${Math.round(sizeBytes / 1024)} KB`
            : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    } else if (cataloguePdf !== undefined) {
      if (cataloguePdf === "" || cataloguePdf === null) {
        // User requested removal of PDF
        if (category.cataloguePdfPublicId) {
          await deleteFromCloudinary(category.cataloguePdfPublicId, "auto");
        }
        category.cataloguePdf = "";
        category.cataloguePdfPublicId = "";
        category.cataloguePdfName = "";
        category.cataloguePdfSize = "";
      } else if (typeof cataloguePdf === "string" && cataloguePdf.trim()) {
        category.cataloguePdf = cataloguePdf.trim();
        if (cataloguePdfName) category.cataloguePdfName = cataloguePdfName.trim();
        if (cataloguePdfSize) category.cataloguePdfSize = cataloguePdfSize.trim();
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
    if (deleted.cataloguePdfPublicId) {
      await deleteFromCloudinary(deleted.cataloguePdfPublicId, "auto");
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

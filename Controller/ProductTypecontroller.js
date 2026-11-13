const ProductType = require("../Model/ProductTypeModel");

/**
 * Get all product types
 * GET /api/product-types or /api/product-type
 * Query params: ?status=Active&search=<term>
 */
exports.getProductTypes = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }
    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { code: { $regex: search.trim(), $options: "i" } },
        { slug: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const productTypes = await ProductType.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: productTypes.length,
      productTypes,
    });
  } catch (error) {
    console.error("Error fetching product types:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product types",
      error: error.message,
    });
  }
};

/**
 * Get single product type by ID
 * GET /api/product-types/:id
 */
exports.getProductTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const productType = await ProductType.findById(id);

    if (!productType) {
      return res.status(404).json({
        success: false,
        message: "Product type not found",
      });
    }

    return res.status(200).json({
      success: true,
      productType,
    });
  } catch (error) {
    console.error("Error fetching product type by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product type",
      error: error.message,
    });
  }
};

/**
 * Create a new product type
 * POST /api/product-types
 * Body: { name, code, description, status }
 */
exports.createProductType = async (req, res) => {
  try {
    const { name, code, description, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Product type name is required",
      });
    }

    const trimmedName = name.trim();

    // Check for existing product type with same name
    const existing = await ProductType.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Product type "${trimmedName}" already exists`,
      });
    }

    const newProductType = new ProductType({
      name: trimmedName,
      code: code ? code.trim().toUpperCase() : undefined,
      description: description ? description.trim() : "",
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    const savedProductType = await newProductType.save();

    return res.status(201).json({
      success: true,
      message: "Product type created successfully",
      productType: savedProductType,
    });
  } catch (error) {
    console.error("Error creating product type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create product type",
      error: error.message,
    });
  }
};

/**
 * Update an existing product type
 * PUT /api/product-types/:id
 */
exports.updateProductType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, status } = req.body;

    const productType = await ProductType.findById(id);
    if (!productType) {
      return res.status(404).json({
        success: false,
        message: "Product type not found",
      });
    }

    if (name && name.trim()) {
      productType.name = name.trim();
      productType.slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
    }
    if (code) productType.code = code.trim().toUpperCase();
    if (description !== undefined) productType.description = description.trim();
    if (status) productType.status = status;

    const updated = await productType.save();

    return res.status(200).json({
      success: true,
      message: "Product type updated successfully",
      productType: updated,
    });
  } catch (error) {
    console.error("Error updating product type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product type",
      error: error.message,
    });
  }
};

/**
 * Delete a product type
 * DELETE /api/product-types/:id
 */
exports.deleteProductType = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ProductType.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Product type not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product type removed successfully",
      productType: deleted,
    });
  } catch (error) {
    console.error("Error deleting product type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product type",
      error: error.message,
    });
  }
};

const Category = require("../Model/CategoryModel");

/**
 * Get all product categories
 * GET /api/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
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
 * Create a new product category
 * POST /api/categories
 */
exports.createCategory = async (req, res) => {
  try {
    const { name, description, code, status } = req.body;

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

    const newCategory = new Category({
      name: trimmedName,
      description: description ? description.trim() : "",
      code: code ? code.trim().toUpperCase() : undefined,
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    const savedCategory = await newCategory.save();

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: savedCategory,
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
 * Update a category
 * PUT /api/categories/:id
 */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, code, status } = req.body;

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

    const updated = await category.save();

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category: updated,
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


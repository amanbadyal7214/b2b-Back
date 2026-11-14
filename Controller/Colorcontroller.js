const Color = require("../Model/ColorModel");

/**
 * Get all product colors from database
 * GET /api/colors
 * Query params: ?status=Active&search=Black
 */
exports.getColors = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== "ALL") {
      filter.status = status;
    }

    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { hexCode: { $regex: search.trim(), $options: "i" } },
        { code: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const colors = await Color.find(filter).sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({
      success: true,
      count: colors.length,
      colors,
    });
  } catch (error) {
    console.error("Error fetching colors:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch colors from database",
      error: error.message,
    });
  }
};

/**
 * Get single color by ID
 * GET /api/colors/:id
 */
exports.getColorById = async (req, res) => {
  try {
    const { id } = req.params;
    const color = await Color.findById(id);

    if (!color) {
      return res.status(404).json({
        success: false,
        message: "Color not found",
      });
    }

    return res.status(200).json({
      success: true,
      color,
    });
  } catch (error) {
    console.error("Error fetching color by id:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving color record",
      error: error.message,
    });
  }
};

/**
 * Create a new product color
 * POST /api/colors
 */
exports.createColor = async (req, res) => {
  try {
    const { name, hexCode, code, description, sortOrder, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Color name is required",
      });
    }

    if (!hexCode || !hexCode.trim()) {
      return res.status(400).json({
        success: false,
        message: "Color HEX code is required",
      });
    }

    const trimmedName = name.trim();
    let formattedHex = hexCode.trim().toUpperCase();
    if (!formattedHex.startsWith("#")) {
      formattedHex = `#${formattedHex}`;
    }

    const existingColor = await Color.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existingColor) {
      return res.status(400).json({
        success: false,
        message: `Color "${trimmedName}" already exists in the database.`,
      });
    }

    const generatedCode =
      code && code.trim()
        ? code.trim().toUpperCase()
        : `CLR-${trimmedName.replace(/[^A-Za-z0-9]/g, "").substring(0, 4).toUpperCase() || "NEW"}`;

    const newColor = await Color.create({
      name: trimmedName,
      hexCode: formattedHex,
      code: generatedCode,
      description: description ? description.trim() : "",
      sortOrder: Number(sortOrder) || 0,
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    return res.status(201).json({
      success: true,
      message: `Color "${newColor.name}" created successfully.`,
      color: newColor,
    });
  } catch (error) {
    console.error("Error creating color:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create color",
      error: error.message,
    });
  }
};

/**
 * Update existing product color
 * PUT /api/colors/:id
 */
exports.updateColor = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, hexCode, code, description, sortOrder, status } = req.body;

    const existing = await Color.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Color not found",
      });
    }

    if (name && name.trim()) {
      const trimmedName = name.trim();
      const duplicate = await Color.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Another color with name "${trimmedName}" already exists.`,
        });
      }
      existing.name = trimmedName;
    }

    if (hexCode && hexCode.trim()) {
      let formattedHex = hexCode.trim().toUpperCase();
      if (!formattedHex.startsWith("#")) {
        formattedHex = `#${formattedHex}`;
      }
      existing.hexCode = formattedHex;
    }

    if (code !== undefined) {
      existing.code = code ? code.trim().toUpperCase() : existing.code;
    }

    if (description !== undefined) {
      existing.description = description.trim();
    }

    if (sortOrder !== undefined) {
      existing.sortOrder = Number(sortOrder) || 0;
    }

    if (status !== undefined) {
      existing.status = status === "Inactive" ? "Inactive" : "Active";
    }

    const updatedColor = await existing.save();

    return res.status(200).json({
      success: true,
      message: `Color "${updatedColor.name}" updated successfully.`,
      color: updatedColor,
    });
  } catch (error) {
    console.error("Error updating color:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update color",
      error: error.message,
    });
  }
};

/**
 * Delete a product color
 * DELETE /api/colors/:id
 */
exports.deleteColor = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Color.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Color not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Color "${deleted.name}" deleted successfully.`,
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting color:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete color",
      error: error.message,
    });
  }
};

/**
 * Toggle color active status
 * PATCH /api/colors/:id/status
 */
exports.toggleColorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const color = await Color.findById(id);

    if (!color) {
      return res.status(404).json({
        success: false,
        message: "Color not found",
      });
    }

    color.status = color.status === "Active" ? "Inactive" : "Active";
    await color.save();

    return res.status(200).json({
      success: true,
      message: `Color "${color.name}" is now ${color.status}.`,
      color,
    });
  } catch (error) {
    console.error("Error toggling color status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update color status",
      error: error.message,
    });
  }
};


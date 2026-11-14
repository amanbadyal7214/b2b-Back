const Moq = require("../Model/MoqModel");

/**
 * Get all MOQ / Pack Types from database
 * GET /api/moq-types
 * Query params: ?status=Active&search=Pack
 */
exports.getMoqs = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== "ALL") {
      filter.status = status;
    }

    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { code: { $regex: search.trim(), $options: "i" } },
        { hint: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const moqs = await Moq.find(filter).sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({
      success: true,
      count: moqs.length,
      moqs,
    });
  } catch (error) {
    console.error("Error fetching MOQ types:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch MOQ & Pack Types from database",
      error: error.message,
    });
  }
};

/**
 * Get single MOQ / Pack Type by ID
 * GET /api/moq-types/:id
 */
exports.getMoqById = async (req, res) => {
  try {
    const { id } = req.params;
    const moq = await Moq.findById(id);

    if (!moq) {
      return res.status(404).json({
        success: false,
        message: "MOQ / Pack Type not found",
      });
    }

    return res.status(200).json({
      success: true,
      moq,
    });
  } catch (error) {
    console.error("Error fetching MOQ type by id:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving MOQ type record",
      error: error.message,
    });
  }
};

/**
 * Create a new MOQ / Pack Type
 * POST /api/moq-types
 */
exports.createMoq = async (req, res) => {
  try {
    const { name, code, hint, minQuantity, description, sortOrder, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "MOQ / Pack Type name is required (e.g. Editable MOQ, Low MOQ, Bulk Pack)",
      });
    }

    const trimmedName = name.trim();
    const existingMoq = await Moq.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existingMoq) {
      return res.status(400).json({
        success: false,
        message: `MOQ / Pack Type "${trimmedName}" already exists in the database.`,
      });
    }

    const cleanSlug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const generatedCode =
      code && code.trim()
        ? code.trim().toUpperCase()
        : `MOQ-${trimmedName.replace(/[^A-Za-z0-9]/g, "").substring(0, 4).toUpperCase() || "NEW"}`;

    const newMoq = await Moq.create({
      name: trimmedName,
      slug: cleanSlug,
      code: generatedCode,
      hint: hint ? hint.trim().toUpperCase() : "",
      minQuantity: Number(minQuantity) || 1,
      description: description ? description.trim() : "",
      sortOrder: Number(sortOrder) || 0,
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    return res.status(201).json({
      success: true,
      message: `MOQ / Pack Type "${newMoq.name}" created successfully.`,
      moq: newMoq,
    });
  } catch (error) {
    console.error("Error creating MOQ type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create MOQ type",
      error: error.message,
    });
  }
};

/**
 * Update existing MOQ / Pack Type
 * PUT /api/moq-types/:id
 */
exports.updateMoq = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, hint, minQuantity, description, sortOrder, status } = req.body;

    const existing = await Moq.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "MOQ / Pack Type not found",
      });
    }

    if (name && name.trim()) {
      const trimmedName = name.trim();
      const duplicate = await Moq.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Another MOQ / Pack Type with name "${trimmedName}" already exists.`,
        });
      }
      existing.name = trimmedName;
      existing.slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    if (code !== undefined) {
      existing.code = code ? code.trim().toUpperCase() : existing.code;
    }

    if (hint !== undefined) {
      existing.hint = hint ? hint.trim().toUpperCase() : "";
    }

    if (minQuantity !== undefined) {
      existing.minQuantity = Number(minQuantity) || 1;
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

    const updatedMoq = await existing.save();

    return res.status(200).json({
      success: true,
      message: `MOQ / Pack Type "${updatedMoq.name}" updated successfully.`,
      moq: updatedMoq,
    });
  } catch (error) {
    console.error("Error updating MOQ type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update MOQ type",
      error: error.message,
    });
  }
};

/**
 * Delete an MOQ / Pack Type
 * DELETE /api/moq-types/:id
 */
exports.deleteMoq = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Moq.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "MOQ / Pack Type not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `MOQ / Pack Type "${deleted.name}" deleted successfully.`,
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting MOQ type:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete MOQ type",
      error: error.message,
    });
  }
};

/**
 * Toggle MOQ active status
 * PATCH /api/moq-types/:id/status
 */
exports.toggleMoqStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const moq = await Moq.findById(id);

    if (!moq) {
      return res.status(404).json({
        success: false,
        message: "MOQ / Pack Type not found",
      });
    }

    moq.status = moq.status === "Active" ? "Inactive" : "Active";
    await moq.save();

    return res.status(200).json({
      success: true,
      message: `MOQ / Pack Type "${moq.name}" is now ${moq.status}.`,
      moq,
    });
  } catch (error) {
    console.error("Error toggling MOQ status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update MOQ status",
      error: error.message,
    });
  }
};


const Fit = require("../Model/FitModel");

/**
 * Get all product fits from database
 * GET /api/fits
 * Query params: ?status=Active&search=Relaxed
 */
exports.getFits = async (req, res) => {
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
        { slug: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const fits = await Fit.find(filter).sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({
      success: true,
      count: fits.length,
      fits,
    });
  } catch (error) {
    console.error("Error fetching fits:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch fits from database",
      error: error.message,
    });
  }
};

/**
 * Get single fit by ID
 * GET /api/fits/:id
 */
exports.getFitById = async (req, res) => {
  try {
    const { id } = req.params;
    const fit = await Fit.findById(id);

    if (!fit) {
      return res.status(404).json({
        success: false,
        message: "Fit not found",
      });
    }

    return res.status(200).json({
      success: true,
      fit,
    });
  } catch (error) {
    console.error("Error fetching fit by id:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving fit record",
      error: error.message,
    });
  }
};

/**
 * Create a new product fit
 * POST /api/fits
 */
exports.createFit = async (req, res) => {
  try {
    const { name, code, description, sortOrder, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Fit name is required (e.g. Oversized, Relaxed, Tailored)",
      });
    }

    const trimmedName = name.trim();
    const existingFit = await Fit.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existingFit) {
      return res.status(400).json({
        success: false,
        message: `Fit "${trimmedName}" already exists in the database.`,
      });
    }

    const generatedSlug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const generatedCode =
      code && code.trim()
        ? code.trim().toUpperCase()
        : `FIT-${trimmedName.replace(/[^A-Za-z0-9]/g, "").substring(0, 4).toUpperCase() || "NEW"}`;

    const newFit = await Fit.create({
      name: trimmedName,
      slug: generatedSlug,
      code: generatedCode,
      description: description ? description.trim() : "",
      sortOrder: Number(sortOrder) || 0,
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    return res.status(201).json({
      success: true,
      message: `Fit "${newFit.name}" created successfully.`,
      fit: newFit,
    });
  } catch (error) {
    console.error("Error creating fit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create fit",
      error: error.message,
    });
  }
};

/**
 * Update existing product fit
 * PUT /api/fits/:id
 */
exports.updateFit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, sortOrder, status } = req.body;

    const existing = await Fit.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Fit not found",
      });
    }

    if (name && name.trim()) {
      const trimmedName = name.trim();
      const duplicate = await Fit.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Another fit with name "${trimmedName}" already exists.`,
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

    if (description !== undefined) {
      existing.description = description.trim();
    }

    if (sortOrder !== undefined) {
      existing.sortOrder = Number(sortOrder) || 0;
    }

    if (status !== undefined) {
      existing.status = status === "Inactive" ? "Inactive" : "Active";
    }

    const updatedFit = await existing.save();

    return res.status(200).json({
      success: true,
      message: `Fit "${updatedFit.name}" updated successfully.`,
      fit: updatedFit,
    });
  } catch (error) {
    console.error("Error updating fit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update fit",
      error: error.message,
    });
  }
};

/**
 * Delete a product fit
 * DELETE /api/fits/:id
 */
exports.deleteFit = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Fit.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Fit not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Fit "${deleted.name}" deleted successfully.`,
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting fit:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete fit",
      error: error.message,
    });
  }
};

/**
 * Toggle fit active status
 * PATCH /api/fits/:id/status
 */
exports.toggleFitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const fit = await Fit.findById(id);

    if (!fit) {
      return res.status(404).json({
        success: false,
        message: "Fit not found",
      });
    }

    fit.status = fit.status === "Active" ? "Inactive" : "Active";
    await fit.save();

    return res.status(200).json({
      success: true,
      message: `Fit "${fit.name}" is now ${fit.status}.`,
      fit,
    });
  } catch (error) {
    console.error("Error toggling fit status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update fit status",
      error: error.message,
    });
  }
};


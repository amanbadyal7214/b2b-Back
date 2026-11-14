const Fabric = require("../Model/FabricModel");

/**
 * Get all product fabrics from database
 * GET /api/fabrics
 * Query params: ?status=Active&search=Cotton
 */
exports.getFabrics = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status && status !== "ALL") {
      filter.status = status;
    }

    if (search && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { gsm: { $regex: search.trim(), $options: "i" } },
        { material: { $regex: search.trim(), $options: "i" } },
        { weightTier: { $regex: search.trim(), $options: "i" } },
        { code: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const fabrics = await Fabric.find(filter).sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({
      success: true,
      count: fabrics.length,
      fabrics,
    });
  } catch (error) {
    console.error("Error fetching fabrics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch fabrics from database",
      error: error.message,
    });
  }
};

/**
 * Get single fabric by ID
 * GET /api/fabrics/:id
 */
exports.getFabricById = async (req, res) => {
  try {
    const { id } = req.params;
    const fabric = await Fabric.findById(id);

    if (!fabric) {
      return res.status(404).json({
        success: false,
        message: "Fabric not found",
      });
    }

    return res.status(200).json({
      success: true,
      fabric,
    });
  } catch (error) {
    console.error("Error fetching fabric by id:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving fabric record",
      error: error.message,
    });
  }
};

/**
 * Create a new product fabric
 * POST /api/fabrics
 */
exports.createFabric = async (req, res) => {
  try {
    const { name, gsm, material, weightTier, code, description, sortOrder, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Fabric name is required (e.g. Combed Jersey, Loopback Fleece)",
      });
    }

    if (!gsm || !gsm.trim()) {
      return res.status(400).json({
        success: false,
        message: "GSM / Weight is required (e.g. 280 GSM, 210-250 GSM)",
      });
    }

    const trimmedName = name.trim();
    const trimmedGsm = gsm.trim();

    const existingFabric = await Fabric.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      gsm: { $regex: new RegExp(`^${trimmedGsm}$`, "i") },
    });

    if (existingFabric) {
      return res.status(400).json({
        success: false,
        message: `Fabric "${trimmedName} (${trimmedGsm})" already exists in the database.`,
      });
    }

    const cleanSlug = `${trimmedName}-${trimmedGsm}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const generatedCode =
      code && code.trim()
        ? code.trim().toUpperCase()
        : `FAB-${trimmedName.replace(/[^A-Za-z0-9]/g, "").substring(0, 3).toUpperCase()}${trimmedGsm.replace(/[^0-9]/g, "").substring(0, 3) || "GSM"}`;

    const newFabric = await Fabric.create({
      name: trimmedName,
      gsm: trimmedGsm,
      material: material ? material.trim() : "",
      weightTier: weightTier || "Midweight",
      code: generatedCode,
      slug: cleanSlug,
      description: description ? description.trim() : "",
      sortOrder: Number(sortOrder) || 0,
      status: status === "Inactive" ? "Inactive" : "Active",
    });

    return res.status(201).json({
      success: true,
      message: `Fabric "${newFabric.name} (${newFabric.gsm})" created successfully.`,
      fabric: newFabric,
    });
  } catch (error) {
    console.error("Error creating fabric:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create fabric",
      error: error.message,
    });
  }
};

/**
 * Update existing product fabric
 * PUT /api/fabrics/:id
 */
exports.updateFabric = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, gsm, material, weightTier, code, description, sortOrder, status } = req.body;

    const existing = await Fabric.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Fabric not found",
      });
    }

    const targetName = name !== undefined ? name.trim() : existing.name;
    const targetGsm = gsm !== undefined ? gsm.trim() : existing.gsm;

    if (name !== undefined || gsm !== undefined) {
      const duplicate = await Fabric.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${targetName}$`, "i") },
        gsm: { $regex: new RegExp(`^${targetGsm}$`, "i") },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Another fabric with "${targetName} (${targetGsm})" already exists.`,
        });
      }

      existing.name = targetName;
      existing.gsm = targetGsm;
      existing.slug = `${targetName}-${targetGsm}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    if (material !== undefined) {
      existing.material = material.trim();
    }

    if (weightTier !== undefined) {
      existing.weightTier = weightTier;
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

    const updatedFabric = await existing.save();

    return res.status(200).json({
      success: true,
      message: `Fabric "${updatedFabric.name}" updated successfully.`,
      fabric: updatedFabric,
    });
  } catch (error) {
    console.error("Error updating fabric:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update fabric",
      error: error.message,
    });
  }
};

/**
 * Delete a product fabric
 * DELETE /api/fabrics/:id
 */
exports.deleteFabric = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Fabric.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Fabric not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Fabric "${deleted.name}" deleted successfully.`,
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting fabric:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete fabric",
      error: error.message,
    });
  }
};

/**
 * Toggle fabric active status
 * PATCH /api/fabrics/:id/status
 */
exports.toggleFabricStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const fabric = await Fabric.findById(id);

    if (!fabric) {
      return res.status(404).json({
        success: false,
        message: "Fabric not found",
      });
    }

    fabric.status = fabric.status === "Active" ? "Inactive" : "Active";
    await fabric.save();

    return res.status(200).json({
      success: true,
      message: `Fabric "${fabric.name}" is now ${fabric.status}.`,
      fabric,
    });
  } catch (error) {
    console.error("Error toggling fabric status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update fabric status",
      error: error.message,
    });
  }
};


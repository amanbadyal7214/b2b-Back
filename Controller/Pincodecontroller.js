const Pincode = require("../Model/PincodeModel");

/**
 * Standard default wholesale textile & B2B delivery hubs in India
 */
const DEFAULT_HUBS = [
  { pincode: "400013", city: "Mumbai (Lower Parel)", state: "Maharashtra", hub: "West Direct Hub", estimatedDays: 2, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "400001", city: "Mumbai (Fort / CST)", state: "Maharashtra", hub: "West Direct Hub", estimatedDays: 2, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "641601", city: "Tiruppur (Loom Floor)", state: "Tamil Nadu", hub: "South Factory Facility", estimatedDays: 1, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "641602", city: "Tiruppur (KNP Colony)", state: "Tamil Nadu", hub: "South Factory Facility", estimatedDays: 1, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "110001", city: "New Delhi (Connaught Place)", state: "Delhi", hub: "North Regional Hub", estimatedDays: 3, deliverySpeed: "Standard 3-4 Days", status: "Active" },
  { pincode: "110006", city: "Old Delhi (Chandni Chowk)", state: "Delhi", hub: "North Regional Hub", estimatedDays: 3, deliverySpeed: "Standard 3-4 Days", status: "Active" },
  { pincode: "560001", city: "Bengaluru (Commercial St)", state: "Karnataka", hub: "South Direct Hub", estimatedDays: 2, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "395001", city: "Surat (Textile Market)", state: "Gujarat", hub: "West Direct Hub", estimatedDays: 2, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "380001", city: "Ahmedabad (Relief Road)", state: "Gujarat", hub: "West Direct Hub", estimatedDays: 2, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "700001", city: "Kolkata (BBD Bagh)", state: "West Bengal", hub: "East Hub", estimatedDays: 4, deliverySpeed: "Regional 4-6 Days", status: "Active" },
  { pincode: "500001", city: "Hyderabad (Abids)", state: "Telangana", hub: "Deccan Hub", estimatedDays: 3, deliverySpeed: "Standard 3-4 Days", status: "Active" },
  { pincode: "600001", city: "Chennai (Parrys)", state: "Tamil Nadu", hub: "South Direct Hub", estimatedDays: 2, deliverySpeed: "24-48h Express", status: "Active" },
  { pincode: "302001", city: "Jaipur (Johari Bazar)", state: "Rajasthan", hub: "North Regional Hub", estimatedDays: 3, deliverySpeed: "Standard 3-4 Days", status: "Active" },
  { pincode: "141001", city: "Ludhiana (Clock Tower)", state: "Punjab", hub: "North Regional Hub", estimatedDays: 3, deliverySpeed: "Standard 3-4 Days", status: "Active" },
  { pincode: "208001", city: "Kanpur (Civil Lines)", state: "Uttar Pradesh", hub: "North Regional Hub", estimatedDays: 3, deliverySpeed: "Standard 3-4 Days", status: "Active" },
  { pincode: "411001", city: "Pune (Camp)", state: "Maharashtra", hub: "West Direct Hub", estimatedDays: 2, deliverySpeed: "24-48h Express", status: "Active" },
];

/**
 * Controller: getAllPincodes
 * GET /api/pincodes
 */
const getAllPincodes = async (req, res) => {
  try {
    const { search = "", status = "ALL", state = "ALL" } = req.query;

    const query = {};

    if (status && status !== "ALL") {
      query.status = status;
    }

    if (state && state !== "ALL") {
      query.state = state;
    }

    if (search && search.trim()) {
      const cleanSearch = search.trim();
      query.$or = [
        { pincode: { $regex: cleanSearch, $options: "i" } },
        { city: { $regex: cleanSearch, $options: "i" } },
        { state: { $regex: cleanSearch, $options: "i" } },
        { hub: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const pincodes = await Pincode.find(query).sort({ pincode: 1 });

    const totalCount = await Pincode.countDocuments();
    const activeCount = await Pincode.countDocuments({ status: "Active" });
    const distinctStates = await Pincode.distinct("state");

    return res.status(200).json({
      success: true,
      count: pincodes.length,
      totalCount,
      activeCount,
      distinctStates,
      pincodes,
    });
  } catch (error) {
    console.error("[getAllPincodes] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch serviceable pincodes.",
      error: error.message,
    });
  }
};

/**
 * Controller: createPincode
 * POST /api/pincodes
 */
const createPincode = async (req, res) => {
  try {
    const {
      pincode,
      city,
      state,
      hub = "Central Dispatch",
      estimatedDays = 3,
      deliverySpeed = "Standard 3-4 Days",
      isCodAvailable = true,
      isPrepaidAvailable = true,
      status = "Active",
      minOrderAmount = 0,
      notes = "",
    } = req.body;

    if (!pincode || !String(pincode).trim()) {
      return res.status(400).json({
        success: false,
        message: "Postal Pincode is required.",
      });
    }

    const cleanPin = String(pincode).trim();
    if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Indian Postal Pincode. It must be exactly 6 digits starting with 1-9.",
      });
    }

    if (!city || !city.trim()) {
      return res.status(400).json({
        success: false,
        message: "City / Area name is required.",
      });
    }

    // Check existing
    const existing = await Pincode.findOne({ pincode: cleanPin });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Pincode ${cleanPin} is already registered in the system (${existing.city}).`,
      });
    }

    const newPincode = new Pincode({
      pincode: cleanPin,
      city: city.trim(),
      state: state && state.trim() ? state.trim() : "India",
      hub: hub && hub.trim() ? hub.trim() : "Direct Dispatch",
      estimatedDays: Number(estimatedDays) || 3,
      deliverySpeed: deliverySpeed || "Standard 3-4 Days",
      isCodAvailable: Boolean(isCodAvailable),
      isPrepaidAvailable: Boolean(isPrepaidAvailable),
      status: status || "Active",
      minOrderAmount: Number(minOrderAmount) || 0,
      notes: notes ? notes.trim() : "",
    });

    await newPincode.save();

    return res.status(201).json({
      success: true,
      message: `Pincode ${cleanPin} (${city.trim()}) successfully added to delivery network.`,
      pincode: newPincode,
    });
  } catch (error) {
    console.error("[createPincode] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create serviceable pincode.",
      error: error.message,
    });
  }
};

/**
 * Controller: bulkCreatePincodes
 * POST /api/pincodes/bulk
 * Accepts text list of pincodes (separated by comma, space or newline) with default city/state
 */
const bulkCreatePincodes = async (req, res) => {
  try {
    const {
      pincodesRaw,
      city = "",
      state = "",
      hub = "Central Dispatch",
      estimatedDays = 3,
      deliverySpeed = "Standard 3-4 Days",
      status = "Active",
    } = req.body;

    if (!pincodesRaw || typeof pincodesRaw !== "string") {
      return res.status(400).json({
        success: false,
        message: "Pincode list string is required.",
      });
    }

    // Extract all 6-digit numbers from the raw input
    const extracted = pincodesRaw.match(/\b[1-9][0-9]{5}\b/g);

    if (!extracted || extracted.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid 6-digit pincodes found in the provided input.",
      });
    }

    const uniquePins = [...new Set(extracted)];
    const existingPins = await Pincode.find({ pincode: { $in: uniquePins } }).select("pincode");
    const existingSet = new Set(existingPins.map((p) => p.pincode));

    const toInsert = [];
    const skipped = [];

    for (const pin of uniquePins) {
      if (existingSet.has(pin)) {
        skipped.push(pin);
      } else {
        toInsert.push({
          pincode: pin,
          city: city.trim() || `Zone ${pin.substring(0, 3)}`,
          state: state.trim() || "Pan-India",
          hub: hub.trim() || "Central Dispatch",
          estimatedDays: Number(estimatedDays) || 3,
          deliverySpeed: deliverySpeed || "Standard 3-4 Days",
          isCodAvailable: true,
          isPrepaidAvailable: true,
          status: status || "Active",
        });
      }
    }

    let insertedDocs = [];
    if (toInsert.length > 0) {
      insertedDocs = await Pincode.insertMany(toInsert);
    }

    return res.status(200).json({
      success: true,
      message: `Bulk import completed: ${insertedDocs.length} added, ${skipped.length} skipped (already present).`,
      addedCount: insertedDocs.length,
      skippedCount: skipped.length,
      skippedPincodes: skipped,
    });
  } catch (error) {
    console.error("[bulkCreatePincodes] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process bulk pincode import.",
      error: error.message,
    });
  }
};

/**
 * Controller: updatePincode
 * PUT /api/pincodes/:id
 */
const updatePincode = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      pincode,
      city,
      state,
      hub,
      estimatedDays,
      deliverySpeed,
      isCodAvailable,
      isPrepaidAvailable,
      status,
      minOrderAmount,
      notes,
    } = req.body;

    const existing = await Pincode.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Pincode record not found.",
      });
    }

    if (pincode && pincode !== existing.pincode) {
      const cleanPin = String(pincode).trim();
      if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
        return res.status(400).json({
          success: false,
          message: "Pincode must be a valid 6-digit Indian postal code.",
        });
      }

      const duplicate = await Pincode.findOne({ pincode: cleanPin, _id: { $ne: id } });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Pincode ${cleanPin} already exists for another record.`,
        });
      }
      existing.pincode = cleanPin;
    }

    if (city !== undefined) existing.city = String(city).trim();
    if (state !== undefined) existing.state = String(state).trim();
    if (hub !== undefined) existing.hub = String(hub).trim();
    if (estimatedDays !== undefined) existing.estimatedDays = Number(estimatedDays) || 3;
    if (deliverySpeed !== undefined) existing.deliverySpeed = deliverySpeed;
    if (isCodAvailable !== undefined) existing.isCodAvailable = Boolean(isCodAvailable);
    if (isPrepaidAvailable !== undefined) existing.isPrepaidAvailable = Boolean(isPrepaidAvailable);
    if (status !== undefined) existing.status = status;
    if (minOrderAmount !== undefined) existing.minOrderAmount = Number(minOrderAmount) || 0;
    if (notes !== undefined) existing.notes = String(notes).trim();

    await existing.save();

    return res.status(200).json({
      success: true,
      message: `Pincode ${existing.pincode} updated successfully.`,
      pincode: existing,
    });
  } catch (error) {
    console.error("[updatePincode] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update pincode record.",
      error: error.message,
    });
  }
};

/**
 * Controller: togglePincodeStatus
 * PATCH /api/pincodes/:id/toggle
 */
const togglePincodeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Pincode.findById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Pincode record not found.",
      });
    }

    record.status = record.status === "Active" ? "Inactive" : "Active";
    await record.save();

    return res.status(200).json({
      success: true,
      message: `Pincode ${record.pincode} status changed to ${record.status}.`,
      status: record.status,
      pincode: record,
    });
  } catch (error) {
    console.error("[togglePincodeStatus] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle pincode status.",
      error: error.message,
    });
  }
};

/**
 * Controller: deletePincode
 * DELETE /api/pincodes/:id
 */
const deletePincode = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Pincode.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Pincode record not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Pincode ${deleted.pincode} (${deleted.city}) removed from delivery network.`,
    });
  } catch (error) {
    console.error("[deletePincode] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete pincode.",
      error: error.message,
    });
  }
};

/**
 * Controller: checkPincodeAvailability
 * GET /api/pincodes/check/:pincode
 * Public endpoint to verify if delivery is available for user in checkout or store
 */
const checkPincodeAvailability = async (req, res) => {
  try {
    const { pincode } = req.params;
    const cleanPin = String(pincode || "").trim();

    if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        isAvailable: false,
        message: "Please enter a valid 6-digit Indian postal code.",
      });
    }

    const match = await Pincode.findOne({ pincode: cleanPin, status: "Active" });

    if (match) {
      return res.status(200).json({
        success: true,
        isAvailable: true,
        pincode: match.pincode,
        city: match.city,
        state: match.state,
        hub: match.hub,
        estimatedDays: match.estimatedDays,
        deliverySpeed: match.deliverySpeed,
        isCodAvailable: match.isCodAvailable,
        isPrepaidAvailable: match.isPrepaidAvailable,
        message: `✓ Dispatch available to ${match.city}, ${match.state} via ${match.hub} (${match.estimatedDays} business days).`,
      });
    }

    return res.status(200).json({
      success: true,
      isAvailable: false,
      pincode: cleanPin,
      message: `Pincode ${cleanPin} is currently outside our direct wholesale mill-dispatch zone. Contact desk for special freight booking.`,
    });
  } catch (error) {
    console.error("[checkPincodeAvailability] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify pincode.",
      error: error.message,
    });
  }
};

/**
 * Controller: seedDefaultPincodes
 * POST /api/pincodes/seed
 */
const seedDefaultPincodes = async (req, res) => {
  try {
    let inserted = 0;
    for (const hub of DEFAULT_HUBS) {
      const exists = await Pincode.findOne({ pincode: hub.pincode });
      if (!exists) {
        await Pincode.create(hub);
        inserted++;
      }
    }

    const total = await Pincode.countDocuments();

    return res.status(200).json({
      success: true,
      message: `Seeded ${inserted} major commercial delivery hubs. Total pincodes: ${total}.`,
      insertedCount: inserted,
      totalCount: total,
    });
  } catch (error) {
    console.error("[seedDefaultPincodes] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to seed default hubs.",
      error: error.message,
    });
  }
};

module.exports = {
  getAllPincodes,
  createPincode,
  bulkCreatePincodes,
  updatePincode,
  togglePincodeStatus,
  deletePincode,
  checkPincodeAvailability,
  seedDefaultPincodes,
};

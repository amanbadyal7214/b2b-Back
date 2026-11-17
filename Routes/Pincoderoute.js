const express = require("express");
const router = express.Router();
const {
  getAllPincodes,
  createPincode,
  bulkCreatePincodes,
  updatePincode,
  togglePincodeStatus,
  deletePincode,
  checkPincodeAvailability,
  seedDefaultPincodes,
} = require("../Controller/Pincodecontroller");

// Public check endpoint
router.get("/check/:pincode", checkPincodeAvailability);

// Seed hubs
router.post("/seed", seedDefaultPincodes);

// Bulk import
router.post("/bulk", bulkCreatePincodes);

// CRUD
router.get("/", getAllPincodes);
router.post("/", createPincode);
router.put("/:id", updatePincode);
router.patch("/:id/toggle", togglePincodeStatus);
router.delete("/:id", deletePincode);

module.exports = router;

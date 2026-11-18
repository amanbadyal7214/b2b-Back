const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  getAllRetailers,
  getRetailerById,
  updateRetailerStatus,
  verifyRetailer,
  updateSampleKitStatus,
  deleteRetailer,
} = require("../Controller/Usercontroller");
const { adminAccess } = require("../Controller/Admincontroller");
const { verifyUserToken } = require("../Middleware/authMiddleware");

// Retailer Registration & Store Onboarding (B2B Form)
router.post("/register", registerUser);
router.post("/register-retailer", registerUser);
router.post("/apply", registerUser);

// Authentication
router.post("/login", loginUser);

// Retailer Profile (Self)
router.get("/profile", verifyUserToken, getProfile);
router.get("/me", verifyUserToken, getProfile);
router.put("/profile", verifyUserToken, updateProfile);

// Retailer Management & Directory
router.get("/", getAllRetailers);
router.get("/retailers", getAllRetailers);
router.get("/:id", getRetailerById);
router.patch("/:id/status", updateRetailerStatus);
router.patch("/:id/verify", verifyRetailer);
router.patch("/:id/sample-kit", updateSampleKitStatus);
router.delete("/:id", deleteRetailer);

// Backward Compatibility
router.post("/admin-access", adminAccess);

module.exports = router;

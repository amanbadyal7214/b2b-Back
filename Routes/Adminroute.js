const express = require("express");
const router = express.Router();
const {
  adminAccess,
  getAdminProfile,
  createAdmin,
} = require("../Controller/Admincontroller");
const { verifyAdminToken, requireRole } = require("../Middleware/authMiddleware");

// Primary requested Admin Access API endpoints
router.post("/admin-access", adminAccess);
router.post("/admin/access", adminAccess);
router.post("/access", adminAccess);

// Standard auth login aliases
router.post("/login", adminAccess);
router.post("/admin/login", adminAccess);

// Provision new admin: if database has 0 admins, allow setup; otherwise require Super Administrator token
router.post("/create", async (req, res, next) => {
  try {
    const Admin = require("../Model/AdminModel");
    const count = await Admin.countDocuments();
    if (count === 0) {
      return createAdmin(req, res);
    }
    // If admins already exist, protect with token
    return verifyAdminToken(req, res, () => {
      requireRole("Super Administrator")(req, res, () => {
        createAdmin(req, res);
      });
    });
  } catch (err) {
    next(err);
  }
});

// Protected routes
router.get("/profile", verifyAdminToken, getAdminProfile);

module.exports = router;

const express = require("express");
const router = express.Router();
const {
  getAnnouncements,
  updateAnnouncements,
  resetDefaultAnnouncements,
} = require("../Controller/Announcementcontroller");
const { verifyAdminToken, requireModule } = require("../Middleware/authMiddleware");

// Public endpoint: Storefront reads active top announcement banner
router.get("/", getAnnouncements);

// Admin endpoints: Update or reset top announcement banner
router.put("/", verifyAdminToken, requireModule("blog"), updateAnnouncements);
router.post("/", verifyAdminToken, requireModule("blog"), updateAnnouncements);
router.post("/reset", verifyAdminToken, requireModule("blog"), resetDefaultAnnouncements);

module.exports = router;

const express = require("express");
const router = express.Router();
const {
  submitInquiry,
  getContactConfig,
  getAllInquiries,
  updateInquiryStatus,
  deleteInquiry,
  updateContactConfig,
} = require("../Controller/Contactcontroller");
const { verifyAdminToken, requireModule } = require("../Middleware/authMiddleware");

// Public endpoints
router.post("/inquiry", submitInquiry);
router.get("/config", getContactConfig);

// Admin endpoints (protected by token & retailers/crm or roles module)
router.get("/admin/inquiries", verifyAdminToken, requireModule("retailers"), getAllInquiries);
router.put("/admin/inquiries/:id", verifyAdminToken, requireModule("retailers"), updateInquiryStatus);
router.delete("/admin/inquiries/:id", verifyAdminToken, requireModule("retailers"), deleteInquiry);
router.put("/admin/config", verifyAdminToken, requireModule("retailers"), updateContactConfig);

module.exports = router;

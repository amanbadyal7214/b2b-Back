const express = require("express");
const router = express.Router();
const {
  getUserInvoices,
  getInvoiceById,
  getInvoiceByOrderId,
  getAdminInvoices,
  generateInvoiceManually,
  issueCreditNote,
  updateInvoiceStatus,
  exportGstReport,
} = require("../Controller/Invoicecontroller");
const { verifyUserToken, optionalUserToken } = require("../Middleware/authMiddleware");

// Admin Routes (Placed before /:id)
router.get("/admin/all", getAdminInvoices);
router.get("/admin", getAdminInvoices);
router.post("/admin/generate", generateInvoiceManually);
router.post("/admin/:id/credit-note", issueCreditNote);
router.patch("/admin/:id/status", updateInvoiceStatus);
router.get("/admin/gst-report", exportGstReport);

// Retailer Invoice Routes
router.get("/user", verifyUserToken, getUserInvoices);
router.get("/my-invoices", verifyUserToken, getUserInvoices);
router.get("/order/:orderId", optionalUserToken, getInvoiceByOrderId);
router.get("/:id", optionalUserToken, getInvoiceById);
router.get("/", verifyUserToken, getUserInvoices);

module.exports = router;

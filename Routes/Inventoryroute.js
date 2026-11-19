const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  getInventoryList,
  getSkuInventoryDetail,
  getLowStockAlerts,
  getStockMovements,
  getStockLocks,
  triggerReleaseExpiredLocks,
  handleSingleInward,
  handleBulkInward,
  downloadInwardTemplate,
  handleAdjustStock,
  updateReorderLevel,
  handleOrderReturn,
  handlePartialCancel,
  handleWarehouseTransfer,
  handleSyncProducts,
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} = require("../Controller/Inventorycontroller");
const { verifyAdminToken } = require("../Middleware/authMiddleware");

// Memory storage for CSV / Excel (.xlsx) bulk inward upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Public / Storefront read endpoint for live SKU availability
router.get("/sku/:skuId", getSkuInventoryDetail);

// Admin Inventory Command APIs
router.get("/", verifyAdminToken, getInventoryList);
router.get("/alerts/low-stock", verifyAdminToken, getLowStockAlerts);
router.get("/movements", verifyAdminToken, getStockMovements);
router.get("/locks", verifyAdminToken, getStockLocks);
router.post("/locks/release-expired", verifyAdminToken, triggerReleaseExpiredLocks);

// Stock Inward (Single + Bulk CSV/Excel + Template)
router.get("/inward/template", verifyAdminToken, downloadInwardTemplate);
router.post("/inward", verifyAdminToken, handleSingleInward);
router.post("/inward/bulk", verifyAdminToken, upload.single("file"), handleBulkInward);

// Manual Adjustments, Cycle Counts & Reorder Levels
router.post("/adjust", verifyAdminToken, handleAdjustStock);
router.patch("/:id/reorder-level", verifyAdminToken, updateReorderLevel);

// Returns (QC Pass/Fail) & Partial Cancellation
router.post("/return", verifyAdminToken, handleOrderReturn);
router.post("/partial-cancel", verifyAdminToken, handlePartialCancel);

// Multi-Warehouse Management & Transfers
router.get("/warehouses", verifyAdminToken, getWarehouses);
router.post("/warehouses", verifyAdminToken, createWarehouse);
router.put("/warehouses/:id", verifyAdminToken, updateWarehouse);
router.delete("/warehouses/:id", verifyAdminToken, deleteWarehouse);
router.post("/transfer", verifyAdminToken, handleWarehouseTransfer);

// Catalog SKU Sync
router.post("/sync-products", verifyAdminToken, handleSyncProducts);

module.exports = router;

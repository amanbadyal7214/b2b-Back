const Inventory = require("../Model/InventoryModel");
const StockLock = require("../Model/StockLockModel");
const StockMovement = require("../Model/StockMovementModel");
const Warehouse = require("../Model/WarehouseModel");
const { parseBulkInwardFile } = require("../Utils/spreadsheetParser");
const {
  ensureDefaultWarehouse,
  bootstrapAllProductsInventory,
  getAvailableStockForSku,
  inwardStock,
  bulkInwardStock,
  adjustStock,
  transferStock,
  processOrderReturn,
  partialCancelOrderItem,
  syncInventoryToProductSku,
} = require("../Services/inventoryService");
const { runLockExpirySweep } = require("../Jobs/stockLockCron");

/**
 * Helper: extract admin actor info from req
 */
const getAdminActor = (req) => ({
  by: req.admin?._id || null,
  byModel: req.admin ? "Admin" : "System",
  byName: req.admin?.name || req.admin?.email || "Administrator",
});

/**
 * GET /api/inventory
 * SKU-wise stock list with onHand / reserved / available, search, warehouse & status filters + KPIs
 */
const getInventoryList = async (req, res) => {
  try {
    const {
      search = "",
      status = "ALL", // ALL | IN_STOCK | LOW_STOCK | OUT_OF_STOCK | RESERVED
      warehouseId = "ALL",
      page = 1,
      limit = 50,
    } = req.query;

    await ensureDefaultWarehouse();

    const filter = {};
    if (warehouseId && warehouseId !== "ALL" && /^[0-9a-fA-F]{24}$/.test(warehouseId)) {
      filter.warehouseId = warehouseId;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { skuId: regex },
        { productName: regex },
        { productSku: regex },
        { color: regex },
        { size: regex },
      ];
    }

    // Apply computed availability status filters via $expr
    if (status === "OUT_OF_STOCK") {
      filter.$expr = { $lte: [{ $subtract: ["$onHand", "$reserved"] }, 0] };
    } else if (status === "LOW_STOCK") {
      filter.$expr = {
        $and: [
          { $gt: [{ $subtract: ["$onHand", "$reserved"] }, 0] },
          { $lte: [{ $subtract: ["$onHand", "$reserved"] }, "$reorderLevel"] },
        ],
      };
    } else if (status === "IN_STOCK") {
      filter.$expr = { $gt: [{ $subtract: ["$onHand", "$reserved"] }, "$reorderLevel"] };
    } else if (status === "RESERVED") {
      filter.reserved = { $gt: 0 };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, totalCount, allForStats, warehouses] = await Promise.all([
      Inventory.find(filter)
        .populate("warehouseId", "code name city state isDefault")
        .populate("productId", "name sku wholesalePrice retailPrice category image")
        .sort({ lowStockAlertActive: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Inventory.countDocuments(filter),
      Inventory.find(
        warehouseId && warehouseId !== "ALL" && /^[0-9a-fA-F]{24}$/.test(warehouseId)
          ? { warehouseId }
          : {}
      ).select("onHand reserved damaged reorderLevel"),
      Warehouse.find({ isActive: true }).sort({ isDefault: -1, name: 1 }),
    ]);

    // Compute Executive KPIs
    let totalOnHand = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let totalDamaged = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const row of allForStats) {
      const onHand = row.onHand || 0;
      const reserved = row.reserved || 0;
      const avail = Math.max(0, onHand - reserved);
      totalOnHand += onHand;
      totalReserved += reserved;
      totalAvailable += avail;
      totalDamaged += row.damaged || 0;
      if (avail <= 0) {
        outOfStockCount++;
      } else if (avail <= (row.reorderLevel ?? 10)) {
        lowStockCount++;
      }
    }

    return res.status(200).json({
      success: true,
      items,
      totalCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      warehouses,
      stats: {
        totalSkus: allForStats.length,
        totalOnHand,
        totalReserved,
        totalAvailable,
        totalDamaged,
        lowStockCount,
        outOfStockCount,
        alertCount: lowStockCount + outOfStockCount,
      },
    });
  } catch (error) {
    console.error("[getInventoryList] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load inventory list.",
      error: error.message,
    });
  }
};

/**
 * GET /api/inventory/sku/:skuId
 * Live availability, warehouse breakdown, active locks & recent movements for a SKU
 */
const getSkuInventoryDetail = async (req, res) => {
  try {
    const skuId = String(req.params.skuId || "").trim().toUpperCase();
    if (!skuId) {
      return res.status(400).json({ success: false, message: "SKU ID is required." });
    }

    const summary = await getAvailableStockForSku(skuId);
    const [activeLocks, recentMovements] = await Promise.all([
      StockLock.find({ skuId, status: "active" })
        .populate("warehouseId", "code name")
        .sort({ expiresAt: 1 })
        .limit(20),
      StockMovement.find({ skuId })
        .populate("warehouseId", "code name")
        .sort({ createdAt: -1 })
        .limit(30),
    ]);

    return res.status(200).json({
      success: true,
      sku: summary,
      activeLocks,
      recentMovements,
    });
  } catch (error) {
    console.error("[getSkuInventoryDetail] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load SKU inventory details.",
      error: error.message,
    });
  }
};

/**
 * GET /api/inventory/alerts/low-stock
 * Low stock (available <= reorderLevel) & Out of stock (available === 0) report
 */
const getLowStockAlerts = async (req, res) => {
  try {
    const { warehouseId = "ALL" } = req.query;
    const baseFilter = {
      $expr: { $lte: [{ $subtract: ["$onHand", "$reserved"] }, "$reorderLevel"] },
    };
    if (warehouseId && warehouseId !== "ALL" && /^[0-9a-fA-F]{24}$/.test(warehouseId)) {
      baseFilter.warehouseId = warehouseId;
    }

    const alerts = await Inventory.find(baseFilter)
      .populate("warehouseId", "code name city")
      .populate("productId", "name sku wholesalePrice image")
      .sort({ onHand: 1, updatedAt: -1 });

    const outOfStock = alerts.filter((a) => Math.max(0, a.onHand - a.reserved) <= 0);
    const lowStock = alerts.filter((a) => {
      const av = Math.max(0, a.onHand - a.reserved);
      return av > 0 && av <= (a.reorderLevel ?? 10);
    });

    return res.status(200).json({
      success: true,
      totalAlerts: alerts.length,
      outOfStockCount: outOfStock.length,
      lowStockCount: lowStock.length,
      outOfStock,
      lowStock,
      alerts,
    });
  } catch (error) {
    console.error("[getLowStockAlerts] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch low stock alerts.",
      error: error.message,
    });
  }
};

/**
 * GET /api/inventory/movements
 * Immutable stock movement audit trail
 */
const getStockMovements = async (req, res) => {
  try {
    const {
      skuId = "",
      type = "ALL",
      warehouseId = "ALL",
      refId = "",
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (skuId && skuId.trim()) {
      filter.skuId = { $regex: skuId.trim(), $options: "i" };
    }
    if (type && type !== "ALL") {
      filter.type = type.toUpperCase();
    }
    if (warehouseId && warehouseId !== "ALL" && /^[0-9a-fA-F]{24}$/.test(warehouseId)) {
      filter.warehouseId = warehouseId;
    }
    if (refId && refId.trim()) {
      filter.refId = { $regex: refId.trim(), $options: "i" };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [movements, totalCount] = await Promise.all([
      StockMovement.find(filter)
        .populate("warehouseId", "code name")
        .populate("productId", "name sku")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      StockMovement.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      movements,
      totalCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
    });
  } catch (error) {
    console.error("[getStockMovements] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load stock movement history.",
      error: error.message,
    });
  }
};

/**
 * GET /api/inventory/locks
 * List active, consumed, and released stock locks
 */
const getStockLocks = async (req, res) => {
  try {
    const { status = "active", skuId = "", page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status && status !== "ALL") {
      filter.status = status;
    }
    if (skuId && skuId.trim()) {
      filter.skuId = { $regex: skuId.trim(), $options: "i" };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [locks, totalCount, activeCount, expiredPendingCount] = await Promise.all([
      StockLock.find(filter)
        .populate("warehouseId", "code name")
        .populate("orderId", "orderId status paymentStatus pricing.grandTotal shippingAddress.storeName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      StockLock.countDocuments(filter),
      StockLock.countDocuments({ status: "active" }),
      StockLock.countDocuments({ status: "active", expiresAt: { $lte: new Date() } }),
    ]);

    return res.status(200).json({
      success: true,
      locks,
      totalCount,
      activeCount,
      expiredPendingCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
    });
  } catch (error) {
    console.error("[getStockLocks] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock locks.",
      error: error.message,
    });
  }
};

/**
 * POST /api/inventory/locks/release-expired
 * Manually trigger expired stock lock release sweep
 */
const triggerReleaseExpiredLocks = async (req, res) => {
  try {
    const result = await runLockExpirySweep();
    return res.status(200).json({
      success: true,
      message:
        result.releasedLocks > 0
          ? `Released ${result.releasedLocks} expired lock(s) and expired ${result.expiredOrders} pending order(s).`
          : "No expired active stock locks found.",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to release expired stock locks.",
      error: error.message,
    });
  }
};

/**
 * POST /api/inventory/inward
 * Single SKU Stock Inward (with PO Number)
 */
const handleSingleInward = async (req, res) => {
  try {
    const { skuId, qty, poNumber, warehouseId, warehouseCode, reorderLevel, reason } = req.body;
    const result = await inwardStock({
      skuId,
      qty,
      poNumber,
      warehouseId,
      warehouseCode,
      reorderLevel,
      reason,
      actor: getAdminActor(req),
    });

    return res.status(200).json({
      success: true,
      message: `Inwarded ${qty} units to ${result.inventory.skuId}. New onHand: ${result.inventory.onHand}, available: ${result.inventory.available}.`,
      inventory: result.inventory,
      movement: result.movement,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to inward stock.",
    });
  }
};

/**
 * POST /api/inventory/inward/bulk
 * Bulk Stock Inward via CSV/Excel (.xlsx) file upload OR JSON `rows` array
 */
const handleBulkInward = async (req, res) => {
  try {
    let rows = [];
    const { poNumber = "", warehouseId = null } = req.body;

    if (req.file && req.file.buffer) {
      rows = parseBulkInwardFile(req.file.buffer, req.file.originalname || "");
    } else if (Array.isArray(req.body.rows)) {
      rows = req.body.rows;
    } else if (typeof req.body.rows === "string") {
      try {
        rows = JSON.parse(req.body.rows);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid rows JSON format.",
        });
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid inward rows found. Upload a .csv or .xlsx file with columns: skuId, qty, poNumber, warehouseCode, reorderLevel, reason.",
      });
    }

    const report = await bulkInwardStock({
      rows,
      defaultPoNumber: poNumber,
      defaultWarehouseId: warehouseId,
      actor: getAdminActor(req),
    });

    return res.status(200).json({
      success: true,
      message: `Bulk inward processed: ${report.succeededCount} succeeded, ${report.failedCount} failed out of ${report.totalRows} rows.`,
      report,
    });
  } catch (error) {
    console.error("[handleBulkInward] Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process bulk stock inward.",
    });
  }
};

/**
 * GET /api/inventory/inward/template
 * Downloads a sample CSV template compatible with Excel for bulk inward
 */
const downloadInwardTemplate = async (req, res) => {
  try {
    const sampleItems = await Inventory.find({}).populate("warehouseId", "code").limit(5);
    const lines = ["skuId,qty,poNumber,warehouseCode,reorderLevel,reason"];

    if (sampleItems.length > 0) {
      for (const item of sampleItems) {
        lines.push(
          `${item.skuId},50,PO-2026-001,${item.warehouseId?.code || "WH-MAIN"},${item.reorderLevel ?? 10},Factory inward batch`
        );
      }
    } else {
      lines.push("BVB-TEE-01-BLK-M,100,PO-2026-001,WH-MAIN,10,Factory inward batch");
      lines.push("BVB-TEE-01-BLK-L,100,PO-2026-001,WH-MAIN,10,Factory inward batch");
    }

    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="bvb-bulk-inward-template.csv"');
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/inventory/adjust
 * Manual adjustment (ADD, SUBTRACT, DAMAGE, CYCLE_COUNT) with mandatory reason
 */
const handleAdjustStock = async (req, res) => {
  try {
    const { skuId, warehouseId, mode = "ADD", qty, reason, refId } = req.body;
    const result = await adjustStock({
      skuId,
      warehouseId,
      mode,
      qty,
      reason,
      refId,
      actor: getAdminActor(req),
    });

    return res.status(200).json({
      success: true,
      message: `Stock adjusted for ${result.inventory.skuId}. onHand: ${result.inventory.onHand}, available: ${result.inventory.available}.`,
      inventory: result.inventory,
      movement: result.movement,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to adjust stock.",
    });
  }
};

/**
 * PATCH /api/inventory/:id/reorder-level
 * Update reorderLevel / moq threshold for an inventory record
 */
const updateReorderLevel = async (req, res) => {
  try {
    const { id } = req.params;
    const { reorderLevel, moq } = req.body;

    const inv = await Inventory.findById(id);
    if (!inv) {
      return res.status(404).json({ success: false, message: "Inventory record not found." });
    }

    if (reorderLevel !== undefined && !isNaN(Number(reorderLevel))) {
      inv.reorderLevel = Math.max(0, parseInt(reorderLevel, 10));
    }
    if (moq !== undefined && !isNaN(Number(moq))) {
      inv.moq = Math.max(1, parseInt(moq, 10));
    }

    await inv.save();
    await syncInventoryToProductSku(inv.skuId, inv.productId);

    return res.status(200).json({
      success: true,
      message: `Updated reorder level for ${inv.skuId} to ${inv.reorderLevel}.`,
      inventory: inv,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update reorder level.",
    });
  }
};

/**
 * POST /api/inventory/return
 * Process Return with Quality Check (PASS -> restock onHand, FAIL -> damaged stock)
 */
const handleOrderReturn = async (req, res) => {
  try {
    const { orderId, skuId, qty, qcStatus = "PASS", reason, warehouseId } = req.body;
    const result = await processOrderReturn({
      orderIdOrNumber: orderId,
      skuId,
      qty,
      qcStatus,
      reason,
      warehouseId,
      actor: getAdminActor(req),
    });

    const isPass = String(qcStatus).toUpperCase() === "PASS";
    return res.status(200).json({
      success: true,
      message: isPass
        ? `Return QC PASSED: ${qty} pcs of ${result.inventory.skuId} restocked to onHand (${result.inventory.onHand}).`
        : `Return QC FAILED: ${qty} pcs of ${result.inventory.skuId} logged to damaged stock (onHand unchanged at ${result.inventory.onHand}).`,
      inventory: result.inventory,
      movement: result.movement,
      order: result.order,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process return.",
    });
  }
};

/**
 * POST /api/inventory/partial-cancel
 * Partial cancel a single SKU (or partial qty) from an order
 */
const handlePartialCancel = async (req, res) => {
  try {
    const { orderId, skuId, qty, reason } = req.body;
    const result = await partialCancelOrderItem({
      orderIdOrNumber: orderId,
      skuId,
      qty,
      reason,
      actor: getAdminActor(req),
    });

    return res.status(200).json({
      success: true,
      message: `Cancelled ${result.cancelledQty} pcs of ${skuId} on order ${result.order.orderId} and restored SKU stock.`,
      order: result.order,
      item: result.item,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to partially cancel item.",
    });
  }
};

/**
 * POST /api/inventory/transfer
 * Transfer available stock between two warehouses
 */
const handleWarehouseTransfer = async (req, res) => {
  try {
    const { skuId, fromWarehouseId, toWarehouseId, qty, reason, refId } = req.body;
    const result = await transferStock({
      skuId,
      fromWarehouseId,
      toWarehouseId,
      qty,
      reason,
      refId,
      actor: getAdminActor(req),
    });

    return res.status(200).json({
      success: true,
      message: `Transferred ${qty} pcs of ${skuId.toUpperCase()} from ${result.fromWarehouse.name} to ${result.toWarehouse.name} (Ref: ${result.transferRef}).`,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to transfer stock between warehouses.",
    });
  }
};

/**
 * POST /api/inventory/sync-products
 * Sync all catalog products' SKUs into Inventory collection
 */
const handleSyncProducts = async (req, res) => {
  try {
    const summary = await bootstrapAllProductsInventory(getAdminActor(req));
    return res.status(200).json({
      success: true,
      message: `Synced ${summary.skusSynced} SKUs across ${summary.productsCount} products.`,
      summary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to sync catalog products to inventory.",
      error: error.message,
    });
  }
};

/**
 * WAREHOUSE CRUD
 */
const getWarehouses = async (req, res) => {
  try {
    await ensureDefaultWarehouse();
    const warehouses = await Warehouse.find({}).sort({ isDefault: -1, createdAt: 1 });

    // Attach stock totals per warehouse
    const agg = await Inventory.aggregate([
      {
        $group: {
          _id: "$warehouseId",
          skuCount: { $sum: 1 },
          totalOnHand: { $sum: "$onHand" },
          totalReserved: { $sum: "$reserved" },
          totalDamaged: { $sum: "$damaged" },
        },
      },
    ]);
    const statsMap = {};
    for (const row of agg) {
      statsMap[String(row._id)] = {
        skuCount: row.skuCount,
        totalOnHand: row.totalOnHand,
        totalReserved: row.totalReserved,
        totalAvailable: Math.max(0, row.totalOnHand - row.totalReserved),
        totalDamaged: row.totalDamaged,
      };
    }

    const enriched = warehouses.map((w) => ({
      ...w.toObject(),
      metrics: statsMap[String(w._id)] || {
        skuCount: 0,
        totalOnHand: 0,
        totalReserved: 0,
        totalAvailable: 0,
        totalDamaged: 0,
      },
    }));

    return res.status(200).json({ success: true, warehouses: enriched });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createWarehouse = async (req, res) => {
  try {
    const { code, name, city, state, pincode, address, contactPerson, phone, isDefault = false } =
      req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Warehouse code and name are required." });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const exists = await Warehouse.findOne({ code: cleanCode });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: `Warehouse with code "${cleanCode}" already exists.`,
      });
    }

    if (isDefault) {
      await Warehouse.updateMany({}, { isDefault: false });
    }

    const warehouse = await Warehouse.create({
      code: cleanCode,
      name: name.trim(),
      city: city?.trim() || "",
      state: state?.trim() || "",
      pincode: pincode?.trim() || "",
      address: address?.trim() || "",
      contactPerson: contactPerson?.trim() || "",
      phone: phone?.trim() || "",
      isDefault: Boolean(isDefault),
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: `Warehouse "${warehouse.name}" (${warehouse.code}) created.`,
      warehouse,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    const wh = await Warehouse.findById(id);
    if (!wh) {
      return res.status(404).json({ success: false, message: "Warehouse not found." });
    }

    const { name, city, state, pincode, address, contactPerson, phone, isDefault, isActive } =
      req.body;

    if (name) wh.name = name.trim();
    if (city !== undefined) wh.city = city.trim();
    if (state !== undefined) wh.state = state.trim();
    if (pincode !== undefined) wh.pincode = pincode.trim();
    if (address !== undefined) wh.address = address.trim();
    if (contactPerson !== undefined) wh.contactPerson = contactPerson.trim();
    if (phone !== undefined) wh.phone = phone.trim();
    if (isActive !== undefined) wh.isActive = Boolean(isActive);
    if (isDefault === true) {
      await Warehouse.updateMany({ _id: { $ne: wh._id } }, { isDefault: false });
      wh.isDefault = true;
    }

    await wh.save();
    return res.status(200).json({
      success: true,
      message: `Warehouse "${wh.name}" updated.`,
      warehouse: wh,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const deleteWarehouse = async (req, res) => {
  try {
    const { id } = req.params;
    const wh = await Warehouse.findById(id);
    if (!wh) {
      return res.status(404).json({ success: false, message: "Warehouse not found." });
    }
    if (wh.isDefault) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete the default primary warehouse. Set another warehouse as default first.",
      });
    }

    const stockExists = await Inventory.exists({ warehouseId: wh._id, onHand: { $gt: 0 } });
    if (stockExists) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete warehouse while it still holds on-hand stock. Transfer stock out first.",
      });
    }

    await Warehouse.findByIdAndDelete(id);
    return res.status(200).json({
      success: true,
      message: `Warehouse "${wh.name}" removed.`,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};

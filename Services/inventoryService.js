const mongoose = require("mongoose");
const Inventory = require("../Model/InventoryModel");
const StockLock = require("../Model/StockLockModel");
const StockMovement = require("../Model/StockMovementModel");
const Warehouse = require("../Model/WarehouseModel");
const Product = require("../Model/ProductModel");
const Order = require("../Model/OrderModel");

const DEFAULT_LOCK_MINUTES = 15;

/**
 * Helper: normalize actor metadata for StockMovement audit records
 */
const normalizeActor = (actor = {}) => ({
  by: actor.by || actor._id || actor.id || null,
  byModel: actor.byModel || "System",
  byName: actor.byName || actor.name || "System",
});

/**
 * Helper: record an immutable movement log entry
 */
const logStockMovement = async (entry, session = null) => {
  const payload = {
    skuId: String(entry.skuId || "").trim().toUpperCase(),
    inventoryId: entry.inventoryId || null,
    productId: entry.productId || null,
    warehouseId: entry.warehouseId || null,
    type: entry.type,
    qty: entry.qty,
    beforeOnHand: entry.beforeOnHand ?? 0,
    afterOnHand: entry.afterOnHand ?? 0,
    beforeReserved: entry.beforeReserved ?? 0,
    afterReserved: entry.afterReserved ?? 0,
    beforeAvailable: Math.max(0, (entry.beforeOnHand ?? 0) - (entry.beforeReserved ?? 0)),
    afterAvailable: Math.max(0, (entry.afterOnHand ?? 0) - (entry.afterReserved ?? 0)),
    refId: entry.refId ? String(entry.refId).trim() : "",
    reason: entry.reason ? String(entry.reason).trim() : "",
    qcStatus: entry.qcStatus || "N/A",
    ...normalizeActor(entry.actor),
    createdAt: new Date(),
  };

  if (session) {
    const [doc] = await StockMovement.create([payload], { session });
    return doc;
  }
  return StockMovement.create(payload);
};

/**
 * Ensure at least one default Warehouse exists (auto-seeds WH-MAIN)
 */
const ensureDefaultWarehouse = async () => {
  let wh = await Warehouse.findOne({ isDefault: true, isActive: true });
  if (!wh) {
    wh = await Warehouse.findOne({ isActive: true }).sort({ createdAt: 1 });
  }
  if (!wh) {
    wh = await Warehouse.create({
      code: "WH-MAIN",
      name: "Primary Dispatch Warehouse",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110001",
      address: "BVB Central Wholesale Fulfillment Hub",
      isDefault: true,
      isActive: true,
    });
  } else if (!wh.isDefault) {
    wh.isDefault = true;
    await wh.save();
  }
  return wh;
};

/**
 * Resolve warehouse by id, code, or default
 */
const resolveWarehouse = async (warehouseIdOrCode = null) => {
  if (warehouseIdOrCode) {
    const str = String(warehouseIdOrCode).trim();
    if (/^[0-9a-fA-F]{24}$/.test(str)) {
      const byId = await Warehouse.findById(str);
      if (byId) return byId;
    }
    const byCode = await Warehouse.findOne({ code: str.toUpperCase() });
    if (byCode) return byCode;
  }
  return ensureDefaultWarehouse();
};

/**
 * Sync aggregated Inventory availability back onto Product.variants[].skus[]
 * so product catalog & storefront always show real-time `available = onHand - reserved`
 */
const syncInventoryToProductSku = async (skuId, productId = null) => {
  try {
    const upperSku = String(skuId || "").trim().toUpperCase();
    if (!upperSku) return;

    const invDocs = await Inventory.find({ skuId: upperSku });
    if (!invDocs.length) return;

    const targetProductId = productId || invDocs[0].productId;
    if (!targetProductId) return;

    const totalOnHand = invDocs.reduce((sum, d) => sum + (d.onHand || 0), 0);
    const totalReserved = invDocs.reduce((sum, d) => sum + (d.reserved || 0), 0);
    const totalAvailable = Math.max(0, totalOnHand - totalReserved);
    const minReorder = Math.min(...invDocs.map((d) => d.reorderLevel ?? 10));

    const nextStatus =
      totalAvailable <= 0
        ? "Out of Stock"
        : totalAvailable <= minReorder
        ? "Low Stock"
        : "In Stock";

    const product = await Product.findById(targetProductId);
    if (!product || !Array.isArray(product.variants)) return;

    let modified = false;
    for (const variant of product.variants) {
      if (!Array.isArray(variant.skus)) continue;
      for (const skuObj of variant.skus) {
        if (String(skuObj.sku || "").toUpperCase() === upperSku) {
          skuObj.stock = totalAvailable;
          skuObj.status = nextStatus;
          modified = true;
        }
      }
    }

    if (modified) {
      product.colors = product.variants;
      await product.save();
    }
  } catch (err) {
    console.warn(`[syncInventoryToProductSku] Warning for ${skuId}:`, err.message);
  }
};

/**
 * Ensure every SKU on a Product has an Inventory document in the default warehouse.
 * Non-destructive: existing Inventory counts are preserved; new SKUs initialize from sku.stock.
 */
const syncProductToInventory = async (product, actor = null) => {
  if (!product || !product._id) return [];
  const defaultWh = await ensureDefaultWarehouse();
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const moqParsed = parseInt(product.moq, 10);
  const moqVal = !isNaN(moqParsed) && moqParsed > 0 ? moqParsed : 1;

  const syncedDocs = [];

  for (const variant of variants) {
    const colorName = variant.color || variant.name || "Standard";
    const colorCode = variant.colorCode || variant.hex || "#1F2422";
    const variantImage =
      variant.gallery?.front || variant.images?.[0] || variant.image || product.image || "";

    const skus = Array.isArray(variant.skus) ? variant.skus : [];
    for (const skuItem of skus) {
      if (!skuItem.sku) continue;
      const upperSku = String(skuItem.sku).trim().toUpperCase();
      const sizeStr = String(skuItem.size || "STD").trim().toUpperCase();

      let inv = await Inventory.findOne({ skuId: upperSku, warehouseId: defaultWh._id });
      if (!inv) {
        const initialQty = Math.max(0, Number(skuItem.stock) || 0);
        inv = await Inventory.create({
          skuId: upperSku,
          productId: product._id,
          warehouseId: defaultWh._id,
          productName: product.name,
          productSku: product.sku || "",
          color: colorName,
          colorCode,
          size: sizeStr,
          image: variantImage,
          onHand: initialQty,
          reserved: 0,
          damaged: 0,
          reorderLevel: 10,
          moq: moqVal,
          lastInwardAt: initialQty > 0 ? new Date() : null,
        });

        if (initialQty > 0) {
          await logStockMovement({
            skuId: upperSku,
            inventoryId: inv._id,
            productId: product._id,
            warehouseId: defaultWh._id,
            type: "INWARD",
            qty: initialQty,
            beforeOnHand: 0,
            afterOnHand: initialQty,
            beforeReserved: 0,
            afterReserved: 0,
            refId: `INIT-${product.sku || product._id}`,
            reason: "Initial catalog SKU inventory sync",
            actor: actor || { byModel: "System", byName: "Catalog Sync" },
          });
        }
      } else {
        // Keep metadata fresh without overwriting live stock counters
        let dirty = false;
        if (inv.productName !== product.name) {
          inv.productName = product.name;
          dirty = true;
        }
        if (inv.color !== colorName) {
          inv.color = colorName;
          dirty = true;
        }
        if (inv.colorCode !== colorCode) {
          inv.colorCode = colorCode;
          dirty = true;
        }
        if (inv.size !== sizeStr) {
          inv.size = sizeStr;
          dirty = true;
        }
        if (variantImage && inv.image !== variantImage) {
          inv.image = variantImage;
          dirty = true;
        }
        if (dirty) await inv.save();
      }

      syncedDocs.push(inv);
    }
  }

  return syncedDocs;
};

/**
 * Bootstrap/sync all catalog products into Inventory collection
 */
const bootstrapAllProductsInventory = async (actor = null) => {
  await ensureDefaultWarehouse();
  const products = await Product.find({});
  let createdOrChecked = 0;
  for (const product of products) {
    const docs = await syncProductToInventory(product, actor);
    createdOrChecked += docs.length;
  }
  return { productsCount: products.length, skusSynced: createdOrChecked };
};

/**
 * Read live SKU availability (aggregates across active warehouses)
 * Used by Cart, Checkout, and Product listings (READ-ONLY: never mutates stock)
 */
const getAvailableStockForSku = async (skuId, productId = null) => {
  const upperSku = String(skuId || "").trim().toUpperCase();
  if (!upperSku) {
    return { onHand: 0, reserved: 0, available: 0, damaged: 0, reorderLevel: 10, exists: false };
  }

  let invDocs = await Inventory.find({ skuId: upperSku }).populate("warehouseId", "code name isDefault isActive");

  // Lazy auto-sync if product exists but inventory record hasn't been synced yet
  if (invDocs.length === 0 && productId) {
    const prod = await Product.findById(productId);
    if (prod) {
      await syncProductToInventory(prod);
      invDocs = await Inventory.find({ skuId: upperSku }).populate("warehouseId", "code name isDefault isActive");
    }
  }

  if (invDocs.length === 0) {
    return { onHand: 0, reserved: 0, available: 0, damaged: 0, reorderLevel: 10, exists: false };
  }

  const activeDocs = invDocs.filter((d) => !d.warehouseId || d.warehouseId.isActive !== false);
  const docsToUse = activeDocs.length > 0 ? activeDocs : invDocs;

  const onHand = docsToUse.reduce((sum, d) => sum + (d.onHand || 0), 0);
  const reserved = docsToUse.reduce((sum, d) => sum + (d.reserved || 0), 0);
  const damaged = docsToUse.reduce((sum, d) => sum + (d.damaged || 0), 0);
  const available = Math.max(0, onHand - reserved);
  const reorderLevel = Math.min(...docsToUse.map((d) => d.reorderLevel ?? 10));

  return {
    exists: true,
    skuId: upperSku,
    onHand,
    reserved,
    available,
    damaged,
    reorderLevel,
    isOutOfStock: available <= 0,
    isLowStock: available > 0 && available <= reorderLevel,
    warehouses: docsToUse.map((d) => ({
      inventoryId: d._id,
      warehouseId: d.warehouseId?._id || d.warehouseId,
      warehouseCode: d.warehouseId?.code || "WH-MAIN",
      warehouseName: d.warehouseId?.name || "Primary Warehouse",
      onHand: d.onHand,
      reserved: d.reserved,
      available: Math.max(0, d.onHand - d.reserved),
      reorderLevel: d.reorderLevel,
    })),
  };
};

/**
 * Batch lookup map of skuId -> { onHand, reserved, available, reorderLevel, stockStatus }
 * Used to enrich product listings efficiently in a single query.
 */
const getInventoryMapForSkus = async (skuIds = []) => {
  const cleanSkus = [...new Set(skuIds.filter(Boolean).map((s) => String(s).trim().toUpperCase()))];
  if (cleanSkus.length === 0) return {};

  const docs = await Inventory.find({ skuId: { $in: cleanSkus } }).lean();
  const map = {};

  for (const d of docs) {
    const key = d.skuId;
    if (!map[key]) {
      map[key] = {
        onHand: 0,
        reserved: 0,
        available: 0,
        damaged: 0,
        reorderLevel: d.reorderLevel ?? 10,
      };
    }
    map[key].onHand += d.onHand || 0;
    map[key].reserved += d.reserved || 0;
    map[key].damaged += d.damaged || 0;
    map[key].reorderLevel = Math.min(map[key].reorderLevel, d.reorderLevel ?? 10);
  }

  for (const key of Object.keys(map)) {
    const item = map[key];
    item.available = Math.max(0, item.onHand - item.reserved);
    item.status =
      item.available <= 0
        ? "Out of Stock"
        : item.available <= item.reorderLevel
        ? "Low Stock"
        : "In Stock";
  }

  return map;
};

/**
 * Helper: Check whether error indicates standalone MongoDB (transactions unsupported)
 */
const isStandaloneTransactionError = (err) => {
  if (!err) return false;
  const msg = String(err.message || "");
  return (
    err.code === 20 ||
    err.codeName === "IllegalOperation" ||
    msg.includes("Transaction numbers are only allowed on a replica set") ||
    msg.includes("replica set member or mongos")
  );
};

/**
 * ATOMIC RESERVE (Overselling Prevention!)
 * Uses single atomic query:
 *   { skuId, $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, qty] } }
 *   { $inc: { reserved: qty } }
 * Multi-item orders run inside a MongoDB Transaction (when replica set is available)
 * with automatic compensating rollback fallback on standalone MongoDB!
 *
 * @param {Object} params
 * @param {ObjectId} params.orderId
 * @param {String} params.orderNumber
 * @param {Array} params.items - [{ productId, skuId, quantity, productName, size }]
 * @param {Date} params.expiresAt
 * @param {Object} params.actor
 * @returns {Array} created locks with assigned warehouseId
 */
const reserveStockForOrder = async ({
  orderId,
  orderNumber,
  items = [],
  expiresAt = new Date(Date.now() + DEFAULT_LOCK_MINUTES * 60 * 1000),
  actor = { byModel: "System", byName: "Checkout" },
}) => {
  if (!items.length) return [];

  // Ensure every item's product is synced into Inventory before locking
  for (const item of items) {
    const upperSku = String(item.skuId || "").trim().toUpperCase();
    const exists = await Inventory.exists({ skuId: upperSku });
    if (!exists && item.productId) {
      const prod = await Product.findById(item.productId);
      if (prod) await syncProductToInventory(prod);
    }
  }

  const defaultWh = await ensureDefaultWarehouse();

  // Inner atomic reservation runner (works with or without a MongoDB session)
  const executeReservation = async (session = null) => {
    const reservedSnapshots = [];

    for (const item of items) {
      const upperSku = String(item.skuId || "").trim().toUpperCase();
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

      // Find candidate warehouses for this SKU, preferring default warehouse first
      const candidates = await Inventory.find({ skuId: upperSku })
        .session(session)
        .lean();

      candidates.sort((a, b) => {
        const aDef = String(a.warehouseId) === String(defaultWh._id) ? 0 : 1;
        const bDef = String(b.warehouseId) === String(defaultWh._id) ? 0 : 1;
        if (aDef !== bDef) return aDef - bDef;
        return (b.onHand - b.reserved) - (a.onHand - a.reserved);
      });

      let lockedInv = null;

      for (const cand of candidates) {
        // SINGLE ATOMIC CHECK + UPDATE QUERY (prevents race-condition overselling)
        const updated = await Inventory.findOneAndUpdate(
          {
            _id: cand._id,
            $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, qty] },
          },
          {
            $inc: { reserved: qty },
            $set: { updatedAt: new Date() },
          },
          { new: true, session }
        );

        if (updated) {
          lockedInv = updated;
          break;
        }
      }

      if (!lockedInv) {
        const currentAvail = candidates.reduce(
          (sum, c) => sum + Math.max(0, (c.onHand || 0) - (c.reserved || 0)),
          0
        );
        const err = new Error(
          `Out of stock for ${item.productName || upperSku} (${item.size || ""}). Available: ${currentAvail} units, requested: ${qty}.`
        );
        err.code = "OUT_OF_STOCK";
        err.outOfStockItem = {
          skuId: upperSku,
          name: item.productName || upperSku,
          size: item.size || "",
          available: currentAvail,
          requested: qty,
        };
        throw err;
      }

      // Refresh lowStockAlertActive
      const newAvailable = Math.max(0, lockedInv.onHand - lockedInv.reserved);
      const shouldAlert = newAvailable <= (lockedInv.reorderLevel ?? 10);
      if (lockedInv.lowStockAlertActive !== shouldAlert) {
        await Inventory.updateOne(
          { _id: lockedInv._id },
          { $set: { lowStockAlertActive: shouldAlert } },
          { session }
        );
      }

      // Create StockLock document
      const lockPayload = {
        orderId,
        orderNumber: orderNumber || String(orderId),
        inventoryId: lockedInv._id,
        warehouseId: lockedInv.warehouseId,
        productId: item.productId || lockedInv.productId,
        skuId: upperSku,
        quantity: qty,
        expiresAt,
        status: "active",
      };

      const lockDoc = session
        ? (await StockLock.create([lockPayload], { session }))[0]
        : await StockLock.create(lockPayload);

      // Log RESERVE movement
      await logStockMovement(
        {
          skuId: upperSku,
          inventoryId: lockedInv._id,
          productId: lockedInv.productId,
          warehouseId: lockedInv.warehouseId,
          type: "RESERVE",
          qty,
          beforeOnHand: lockedInv.onHand,
          afterOnHand: lockedInv.onHand,
          beforeReserved: lockedInv.reserved - qty,
          afterReserved: lockedInv.reserved,
          refId: orderNumber || String(orderId),
          reason: `Order checkout reservation (expires ${expiresAt.toISOString()})`,
          actor,
        },
        session
      );

      reservedSnapshots.push({
        lock: lockDoc,
        inventoryId: lockedInv._id,
        warehouseId: lockedInv.warehouseId,
        productId: lockedInv.productId,
        skuId: upperSku,
        qty,
      });
    }

    return reservedSnapshots;
  };

  let reservedResults = [];

  // Attempt MongoDB Transaction first (guarantees multi-SKU atomic rollback)
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      reservedResults = await executeReservation(session);
    });
  } catch (err) {
    if (isStandaloneTransactionError(err)) {
      // Standalone MongoDB fallback: atomic per-SKU updates with manual compensating rollback
      const partialSnapshots = [];
      try {
        for (const item of items) {
          const singleRes = await executeReservationSingleWithTracking(
            item,
            { orderId, orderNumber, expiresAt, actor, defaultWh }
          );
          partialSnapshots.push(singleRes);
        }
        reservedResults = partialSnapshots;
      } catch (fallbackErr) {
        // Compensating rollback for any previously reserved SKUs in this order
        for (const snap of partialSnapshots) {
          await Inventory.updateOne(
            { _id: snap.inventoryId, reserved: { $gte: snap.qty } },
            { $inc: { reserved: -snap.qty }, $set: { updatedAt: new Date() } }
          );
          await StockLock.updateOne(
            { _id: snap.lock._id },
            { $set: { status: "released", releasedAt: new Date(), releaseReason: "Multi-item order rollback" } }
          );
          const refreshed = await Inventory.findById(snap.inventoryId);
          if (refreshed) {
            await logStockMovement({
              skuId: snap.skuId,
              inventoryId: snap.inventoryId,
              productId: snap.productId,
              warehouseId: snap.warehouseId,
              type: "RELEASE",
              qty: snap.qty,
              beforeOnHand: refreshed.onHand,
              afterOnHand: refreshed.onHand,
              beforeReserved: refreshed.reserved + snap.qty,
              afterReserved: refreshed.reserved,
              refId: orderNumber || String(orderId),
              reason: "Rollback: another SKU in multi-item order was out of stock",
              actor: { byModel: "System", byName: "Atomic Rollback" },
            });
          }
        }
        throw fallbackErr;
      }
    } else {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  // Sync updated available counts back to Product documents
  for (const r of reservedResults) {
    await syncInventoryToProductSku(r.skuId, r.productId);
  }

  return reservedResults;
};

/**
 * Helper for standalone fallback per-item atomic reservation
 */
const executeReservationSingleWithTracking = async (
  item,
  { orderId, orderNumber, expiresAt, actor, defaultWh }
) => {
  const upperSku = String(item.skuId || "").trim().toUpperCase();
  const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

  const candidates = await Inventory.find({ skuId: upperSku }).lean();
  candidates.sort((a, b) => {
    const aDef = String(a.warehouseId) === String(defaultWh._id) ? 0 : 1;
    const bDef = String(b.warehouseId) === String(defaultWh._id) ? 0 : 1;
    if (aDef !== bDef) return aDef - bDef;
    return (b.onHand - b.reserved) - (a.onHand - a.reserved);
  });

  let lockedInv = null;
  for (const cand of candidates) {
    const updated = await Inventory.findOneAndUpdate(
      {
        _id: cand._id,
        $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, qty] },
      },
      {
        $inc: { reserved: qty },
        $set: { updatedAt: new Date() },
      },
      { new: true }
    );
    if (updated) {
      lockedInv = updated;
      break;
    }
  }

  if (!lockedInv) {
    const currentAvail = candidates.reduce(
      (sum, c) => sum + Math.max(0, (c.onHand || 0) - (c.reserved || 0)),
      0
    );
    const err = new Error(
      `Out of stock for ${item.productName || upperSku} (${item.size || ""}). Available: ${currentAvail} units, requested: ${qty}.`
    );
    err.code = "OUT_OF_STOCK";
    err.outOfStockItem = {
      skuId: upperSku,
      name: item.productName || upperSku,
      size: item.size || "",
      available: currentAvail,
      requested: qty,
    };
    throw err;
  }

  const newAvailable = Math.max(0, lockedInv.onHand - lockedInv.reserved);
  await Inventory.updateOne(
    { _id: lockedInv._id },
    { $set: { lowStockAlertActive: newAvailable <= (lockedInv.reorderLevel ?? 10) } }
  );

  const lockDoc = await StockLock.create({
    orderId,
    orderNumber: orderNumber || String(orderId),
    inventoryId: lockedInv._id,
    warehouseId: lockedInv.warehouseId,
    productId: item.productId || lockedInv.productId,
    skuId: upperSku,
    quantity: qty,
    expiresAt,
    status: "active",
  });

  await logStockMovement({
    skuId: upperSku,
    inventoryId: lockedInv._id,
    productId: lockedInv.productId,
    warehouseId: lockedInv.warehouseId,
    type: "RESERVE",
    qty,
    beforeOnHand: lockedInv.onHand,
    afterOnHand: lockedInv.onHand,
    beforeReserved: lockedInv.reserved - qty,
    afterReserved: lockedInv.reserved,
    refId: orderNumber || String(orderId),
    reason: `Order checkout reservation (expires ${expiresAt.toISOString()})`,
    actor,
  });

  return {
    lock: lockDoc,
    inventoryId: lockedInv._id,
    warehouseId: lockedInv.warehouseId,
    productId: lockedInv.productId,
    skuId: upperSku,
    qty,
  };
};

/**
 * PAYMENT SUCCESS -> DEDUCT STOCK (Idempotent)
 * Lifecycle: onHand -= qty, reserved -= qty, available stays same.
 * Marks active StockLocks as "consumed" and logs DEDUCT in StockMovement.
 */
const deductStockForOrder = async (order, actor = { byModel: "System", byName: "Payment Verification" }) => {
  if (!order || !order._id) return { deducted: false };
  if (order.isStockDeducted) return { deducted: false, alreadyDeducted: true };

  const activeLocks = await StockLock.find({ orderId: order._id, status: "active" });
  const touchedSkus = new Set();

  if (activeLocks.length > 0) {
    for (const lock of activeLocks) {
      // Atomically claim the lock so concurrent verify + webhook cannot double-deduct
      const claimed = await StockLock.findOneAndUpdate(
        { _id: lock._id, status: "active" },
        { $set: { status: "consumed", consumedAt: new Date() } },
        { new: true }
      );
      if (!claimed) continue;

      const qty = claimed.quantity;
      const invQuery = claimed.inventoryId
        ? { _id: claimed.inventoryId }
        : { skuId: claimed.skuId, ...(claimed.warehouseId ? { warehouseId: claimed.warehouseId } : {}) };

      const currentInv = await Inventory.findOne(invQuery);
      if (!currentInv) continue;

      const beforeOnHand = currentInv.onHand;
      const beforeReserved = currentInv.reserved;
      const decOnHand = Math.min(currentInv.onHand, qty);
      const decReserved = Math.min(currentInv.reserved, qty);

      const updated = await Inventory.findOneAndUpdate(
        { _id: currentInv._id },
        {
          $inc: { onHand: -decOnHand, reserved: -decReserved },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );

      if (updated) {
        const avail = Math.max(0, updated.onHand - updated.reserved);
        updated.lowStockAlertActive = avail <= (updated.reorderLevel ?? 10);
        await updated.save();

        await logStockMovement({
          skuId: updated.skuId,
          inventoryId: updated._id,
          productId: updated.productId,
          warehouseId: updated.warehouseId,
          type: "DEDUCT",
          qty,
          beforeOnHand,
          afterOnHand: updated.onHand,
          beforeReserved,
          afterReserved: updated.reserved,
          refId: order.orderId || String(order._id),
          reason: "Payment confirmed - permanent stock deduction",
          actor,
        });

        touchedSkus.add(`${updated.skuId}|${updated.productId}`);
      }
    }
  } else {
    // Edge case: webhook arrived after lock expired; deduct directly from onHand if available
    const defaultWh = await ensureDefaultWarehouse();
    for (const item of order.items || []) {
      const upperSku = String(item.skuId || "").trim().toUpperCase();
      let inv = await Inventory.findOne({
        skuId: upperSku,
        ...(item.warehouseId ? { warehouseId: item.warehouseId } : { warehouseId: defaultWh._id }),
      });
      if (!inv) {
        inv = await Inventory.findOne({ skuId: upperSku });
      }
      if (!inv) continue;

      const beforeOnHand = inv.onHand;
      const beforeReserved = inv.reserved;
      const decOnHand = Math.min(inv.onHand, item.quantity);

      inv.onHand = Math.max(0, inv.onHand - decOnHand);
      await inv.save();

      await logStockMovement({
        skuId: inv.skuId,
        inventoryId: inv._id,
        productId: inv.productId,
        warehouseId: inv.warehouseId,
        type: "DEDUCT",
        qty: item.quantity,
        beforeOnHand,
        afterOnHand: inv.onHand,
        beforeReserved,
        afterReserved: inv.reserved,
        refId: order.orderId || String(order._id),
        reason: "Payment confirmed (direct deduction after expired lock)",
        actor,
      });

      touchedSkus.add(`${inv.skuId}|${inv.productId}`);
    }
  }

  for (const pair of touchedSkus) {
    const [sku, prodId] = pair.split("|");
    await syncInventoryToProductSku(sku, prodId);
  }

  return { deducted: true, skusAffected: touchedSkus.size };
};

/**
 * RELEASE LOCKS FOR AN ORDER (Payment Failed / Cancelled Before Payment / Manual Release)
 * Lifecycle: onHand unchanged, reserved -= qty, available += qty.
 */
const releaseStockForOrder = async (
  orderId,
  reason = "Payment failed or order expired",
  actor = { byModel: "System", byName: "System" }
) => {
  const activeLocks = await StockLock.find({ orderId, status: "active" });
  const touchedSkus = new Set();
  let releasedCount = 0;

  for (const lock of activeLocks) {
    const claimed = await StockLock.findOneAndUpdate(
      { _id: lock._id, status: "active" },
      { $set: { status: "released", releasedAt: new Date(), releaseReason: reason } },
      { new: true }
    );
    if (!claimed) continue;

    const inv = claimed.inventoryId
      ? await Inventory.findById(claimed.inventoryId)
      : await Inventory.findOne({ skuId: claimed.skuId });

    if (inv) {
      const beforeOnHand = inv.onHand;
      const beforeReserved = inv.reserved;
      const decReserved = Math.min(inv.reserved, claimed.quantity);

      const updated = await Inventory.findOneAndUpdate(
        { _id: inv._id },
        {
          $inc: { reserved: -decReserved },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );

      if (updated) {
        const avail = Math.max(0, updated.onHand - updated.reserved);
        updated.lowStockAlertActive = avail <= (updated.reorderLevel ?? 10);
        await updated.save();

        await logStockMovement({
          skuId: updated.skuId,
          inventoryId: updated._id,
          productId: updated.productId,
          warehouseId: updated.warehouseId,
          type: "RELEASE",
          qty: claimed.quantity,
          beforeOnHand,
          afterOnHand: updated.onHand,
          beforeReserved,
          afterReserved: updated.reserved,
          refId: claimed.orderNumber || String(orderId),
          reason,
          actor,
        });

        touchedSkus.add(`${updated.skuId}|${updated.productId}`);
      }
    }
    releasedCount++;
  }

  for (const pair of touchedSkus) {
    const [sku, prodId] = pair.split("|");
    await syncInventoryToProductSku(sku, prodId);
  }

  return { releasedCount };
};

/**
 * CRON JOB ROUTINE: Release all expired active locks & expire unpaid pending orders
 */
const releaseExpiredLocks = async () => {
  const now = new Date();
  const expiredLocks = await StockLock.find({
    status: "active",
    expiresAt: { $lte: now },
  });

  if (expiredLocks.length === 0) {
    return { releasedLocks: 0, expiredOrders: 0 };
  }

  const affectedOrderIds = new Set();
  const touchedSkus = new Set();
  let releasedLocks = 0;

  for (const lock of expiredLocks) {
    // Atomic claim prevents double-release across overlapping cron executions
    const claimed = await StockLock.findOneAndUpdate(
      { _id: lock._id, status: "active" },
      {
        $set: {
          status: "released",
          releasedAt: now,
          releaseReason: "Checkout reservation window expired (auto cron)",
        },
      },
      { new: true }
    );
    if (!claimed) continue;

    affectedOrderIds.add(String(claimed.orderId));

    const inv = claimed.inventoryId
      ? await Inventory.findById(claimed.inventoryId)
      : await Inventory.findOne({ skuId: claimed.skuId });

    if (inv) {
      const beforeOnHand = inv.onHand;
      const beforeReserved = inv.reserved;
      const decReserved = Math.min(inv.reserved, claimed.quantity);

      const updated = await Inventory.findOneAndUpdate(
        { _id: inv._id },
        {
          $inc: { reserved: -decReserved },
          $set: { updatedAt: new Date() },
        },
        { new: true }
      );

      if (updated) {
        const avail = Math.max(0, updated.onHand - updated.reserved);
        updated.lowStockAlertActive = avail <= (updated.reorderLevel ?? 10);
        await updated.save();

        await logStockMovement({
          skuId: updated.skuId,
          inventoryId: updated._id,
          productId: updated.productId,
          warehouseId: updated.warehouseId,
          type: "RELEASE",
          qty: claimed.quantity,
          beforeOnHand,
          afterOnHand: updated.onHand,
          beforeReserved,
          afterReserved: updated.reserved,
          refId: claimed.orderNumber || String(claimed.orderId),
          reason: "Stock lock expired (15-min checkout timeout)",
          actor: { byModel: "System", byName: "Lock Expiry Cron" },
        });

        touchedSkus.add(`${updated.skuId}|${updated.productId}`);
      }
    }

    releasedLocks++;
  }

  // Mark pending/payment_pending orders as expired
  let expiredOrders = 0;
  for (const ordId of affectedOrderIds) {
    const res = await Order.updateOne(
      { _id: ordId, status: { $in: ["pending", "payment_pending"] }, paymentStatus: { $ne: "paid" } },
      { $set: { status: "expired" } }
    );
    if (res.modifiedCount > 0) expiredOrders++;
  }

  for (const pair of touchedSkus) {
    const [sku, prodId] = pair.split("|");
    await syncInventoryToProductSku(sku, prodId);
  }

  return { releasedLocks, expiredOrders };
};

/**
 * FULL ORDER CANCEL (Pre-shipment restock or lock release)
 * - If unpaid with active locks -> releases locks (reserved -= qty)
 * - If paid/deducted -> restores remaining active qty back to onHand (+qty)
 */
const restockCancelledOrder = async (
  order,
  reason = "Order cancelled before shipping",
  actor = { byModel: "Admin", byName: "Administrator" }
) => {
  if (!order) return { restocked: 0, released: 0 };

  // 1. Always release any active locks first
  const { releasedCount } = await releaseStockForOrder(order._id, reason, actor);

  let restockedUnits = 0;
  const touchedSkus = new Set();

  // 2. If stock had already been deducted, restock remaining non-cancelled/non-returned units
  if (order.isStockDeducted) {
    const defaultWh = await ensureDefaultWarehouse();

    for (const item of order.items || []) {
      const remainingQty = Math.max(
        0,
        (item.quantity || 0) - (item.cancelledQty || 0) - (item.returnedQty || 0) - (item.damagedQty || 0)
      );
      if (remainingQty <= 0) continue;

      const upperSku = String(item.skuId || "").trim().toUpperCase();
      let inv = await Inventory.findOne({
        skuId: upperSku,
        ...(item.warehouseId ? { warehouseId: item.warehouseId } : { warehouseId: defaultWh._id }),
      });
      if (!inv) inv = await Inventory.findOne({ skuId: upperSku });

      if (inv) {
        const beforeOnHand = inv.onHand;
        const beforeReserved = inv.reserved;
        inv.onHand += remainingQty;
        await inv.save();

        await logStockMovement({
          skuId: inv.skuId,
          inventoryId: inv._id,
          productId: inv.productId,
          warehouseId: inv.warehouseId,
          type: "CANCEL",
          qty: remainingQty,
          beforeOnHand,
          afterOnHand: inv.onHand,
          beforeReserved,
          afterReserved: inv.reserved,
          refId: order.orderId || String(order._id),
          reason,
          actor,
        });

        touchedSkus.add(`${inv.skuId}|${inv.productId}`);
      }

      item.cancelledQty = (item.cancelledQty || 0) + remainingQty;
      item.itemStatus = "cancelled";
      restockedUnits += remainingQty;
    }

    order.isStockDeducted = false;
  } else {
    for (const item of order.items || []) {
      item.cancelledQty = item.quantity;
      item.itemStatus = "cancelled";
    }
  }

  for (const pair of touchedSkus) {
    const [sku, prodId] = pair.split("|");
    await syncInventoryToProductSku(sku, prodId);
  }

  return { restockedUnits, releasedLocks: releasedCount };
};

/**
 * PARTIAL CANCEL: Cancel a specific SKU (or partial qty of a SKU) in an order
 * Only that SKU's stock is released/restocked.
 */
const partialCancelOrderItem = async ({
  orderIdOrNumber,
  skuId,
  qty,
  reason = "Partial item cancellation",
  actor = { byModel: "Admin", byName: "Administrator" },
}) => {
  const upperSku = String(skuId || "").trim().toUpperCase();
  const cancelQty = parseInt(qty, 10);
  if (!upperSku || isNaN(cancelQty) || cancelQty <= 0) {
    throw new Error("Valid skuId and positive cancellation quantity are required.");
  }

  const order = await Order.findOne({
    $or: [
      { _id: /^[0-9a-fA-F]{24}$/.test(String(orderIdOrNumber)) ? orderIdOrNumber : null },
      { orderId: orderIdOrNumber },
    ],
  });
  if (!order) throw new Error(`Order "${orderIdOrNumber}" not found.`);

  if (["dispatched", "delivered", "cancelled", "expired"].includes(order.status)) {
    throw new Error(
      `Cannot cancel items on an order with status "${order.status}". Use Return QC flow for shipped/delivered orders.`
    );
  }

  const item = order.items.find((i) => String(i.skuId || "").toUpperCase() === upperSku);
  if (!item) throw new Error(`SKU "${upperSku}" not found in order ${order.orderId}.`);

  const activeQty = item.quantity - (item.cancelledQty || 0);
  if (cancelQty > activeQty) {
    throw new Error(
      `Cannot cancel ${cancelQty} pcs of ${upperSku}; only ${activeQty} active pcs remain on this order.`
    );
  }

  const defaultWh = await ensureDefaultWarehouse();
  let inv = await Inventory.findOne({
    skuId: upperSku,
    ...(item.warehouseId ? { warehouseId: item.warehouseId } : { warehouseId: defaultWh._id }),
  });
  if (!inv) inv = await Inventory.findOne({ skuId: upperSku });

  if (order.isStockDeducted) {
    // Stock was already deducted -> add back to onHand
    if (inv) {
      const beforeOnHand = inv.onHand;
      const beforeReserved = inv.reserved;
      inv.onHand += cancelQty;
      await inv.save();

      await logStockMovement({
        skuId: inv.skuId,
        inventoryId: inv._id,
        productId: inv.productId,
        warehouseId: inv.warehouseId,
        type: "CANCEL",
        qty: cancelQty,
        beforeOnHand,
        afterOnHand: inv.onHand,
        beforeReserved,
        afterReserved: inv.reserved,
        refId: order.orderId,
        reason: `Partial cancel: ${reason}`,
        actor,
      });

      await syncInventoryToProductSku(inv.skuId, inv.productId);
    }
  } else {
    // Order is still locked -> reduce active lock & reserved
    const lock = await StockLock.findOne({ orderId: order._id, skuId: upperSku, status: "active" });
    if (lock) {
      const releaseAmt = Math.min(lock.quantity, cancelQty);
      if (lock.quantity <= cancelQty) {
        lock.status = "released";
        lock.releasedAt = new Date();
        lock.releaseReason = `Partial cancel: ${reason}`;
      } else {
        lock.quantity -= releaseAmt;
      }
      await lock.save();

      if (inv) {
        const beforeOnHand = inv.onHand;
        const beforeReserved = inv.reserved;
        const decRes = Math.min(inv.reserved, releaseAmt);
        inv.reserved -= decRes;
        await inv.save();

        await logStockMovement({
          skuId: inv.skuId,
          inventoryId: inv._id,
          productId: inv.productId,
          warehouseId: inv.warehouseId,
          type: "RELEASE",
          qty: releaseAmt,
          beforeOnHand,
          afterOnHand: inv.onHand,
          beforeReserved,
          afterReserved: inv.reserved,
          refId: order.orderId,
          reason: `Partial cancel lock release: ${reason}`,
          actor,
        });

        await syncInventoryToProductSku(inv.skuId, inv.productId);
      }
    }
  }

  item.cancelledQty = (item.cancelledQty || 0) + cancelQty;
  item.itemStatus = item.cancelledQty >= item.quantity ? "cancelled" : "partially_cancelled";

  // Check if entire order is now cancelled
  const allCancelled = order.items.every((i) => (i.cancelledQty || 0) >= i.quantity);
  if (allCancelled) {
    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.isStockDeducted = false;
  } else {
    order.status = "partially_cancelled";
  }

  await order.save();
  return { order, item, cancelledQty: cancelQty };
};

/**
 * RETURN WITH QUALITY CHECK (QC PASS vs QC FAIL)
 * - QC PASS -> Stock returns to sellable onHand (+qty), logs RETURN
 * - QC FAIL -> Stock moves to damaged counter (onHand unchanged), logs DAMAGED
 */
const processOrderReturn = async ({
  orderIdOrNumber,
  skuId,
  qty,
  qcStatus = "PASS",
  reason = "Customer return",
  warehouseId = null,
  actor = { byModel: "Admin", byName: "QC Inspector" },
}) => {
  const upperSku = String(skuId || "").trim().toUpperCase();
  const returnQty = parseInt(qty, 10);
  const normalizedQc = String(qcStatus || "PASS").trim().toUpperCase();

  if (!upperSku || isNaN(returnQty) || returnQty <= 0) {
    throw new Error("Valid skuId and positive return quantity are required.");
  }
  if (!["PASS", "FAIL"].includes(normalizedQc)) {
    throw new Error("qcStatus must be either 'PASS' or 'FAIL'.");
  }

  let order = null;
  let orderItem = null;

  if (orderIdOrNumber) {
    order = await Order.findOne({
      $or: [
        { _id: /^[0-9a-fA-F]{24}$/.test(String(orderIdOrNumber)) ? orderIdOrNumber : null },
        { orderId: orderIdOrNumber },
      ],
    });
    if (!order) throw new Error(`Order "${orderIdOrNumber}" not found.`);

    orderItem = order.items.find((i) => String(i.skuId || "").toUpperCase() === upperSku);
    if (!orderItem) throw new Error(`SKU "${upperSku}" not found in order ${order.orderId}.`);

    const returnableQty =
      orderItem.quantity -
      (orderItem.cancelledQty || 0) -
      (orderItem.returnedQty || 0) -
      (orderItem.damagedQty || 0);

    if (returnQty > returnableQty) {
      throw new Error(
        `Cannot process return of ${returnQty} pcs; only ${returnableQty} returnable pcs remain for ${upperSku} on order ${order.orderId}.`
      );
    }
  }

  const targetWh = await resolveWarehouse(warehouseId || orderItem?.warehouseId);
  let inv = await Inventory.findOne({ skuId: upperSku, warehouseId: targetWh._id });
  if (!inv) inv = await Inventory.findOne({ skuId: upperSku });
  if (!inv) {
    throw new Error(`Inventory record not found for SKU "${upperSku}".`);
  }

  const beforeOnHand = inv.onHand;
  const beforeReserved = inv.reserved;

  if (normalizedQc === "PASS") {
    inv.onHand += returnQty;
  } else {
    // QC FAIL: sellable onHand does NOT change, goes into damaged bucket
    inv.damaged = (inv.damaged || 0) + returnQty;
  }

  await inv.save();

  const movement = await logStockMovement({
    skuId: inv.skuId,
    inventoryId: inv._id,
    productId: inv.productId,
    warehouseId: inv.warehouseId,
    type: normalizedQc === "PASS" ? "RETURN" : "DAMAGED",
    qty: returnQty,
    beforeOnHand,
    afterOnHand: inv.onHand,
    beforeReserved,
    afterReserved: inv.reserved,
    refId: order ? order.orderId : `RET-${Date.now()}`,
    reason: reason || (normalizedQc === "PASS" ? "Return passed QC - restocked" : "Return failed QC - moved to damaged stock"),
    qcStatus: normalizedQc,
    actor,
  });

  if (order && orderItem) {
    if (normalizedQc === "PASS") {
      orderItem.returnedQty = (orderItem.returnedQty || 0) + returnQty;
    } else {
      orderItem.damagedQty = (orderItem.damagedQty || 0) + returnQty;
    }

    const totalHandled =
      (orderItem.cancelledQty || 0) + (orderItem.returnedQty || 0) + (orderItem.damagedQty || 0);
    if (totalHandled >= orderItem.quantity) {
      orderItem.itemStatus = "returned";
    }

    const allReturned = order.items.every(
      (i) => (i.cancelledQty || 0) + (i.returnedQty || 0) + (i.damagedQty || 0) >= i.quantity
    );
    if (allReturned) {
      order.status = "returned";
    }
    await order.save();
  }

  if (normalizedQc === "PASS") {
    await syncInventoryToProductSku(inv.skuId, inv.productId);
  }

  return { inventory: inv, movement, order };
};

/**
 * STOCK INWARD (Single SKU)
 * Increases onHand with PO Number reference and logs INWARD movement.
 */
const inwardStock = async ({
  skuId,
  qty,
  poNumber,
  warehouseId = null,
  warehouseCode = null,
  reorderLevel = undefined,
  reason = "",
  actor = { byModel: "Admin", byName: "Administrator" },
}) => {
  const upperSku = String(skuId || "").trim().toUpperCase();
  const inwardQty = parseInt(qty, 10);

  if (!upperSku) throw new Error("SKU ID is required for stock inward.");
  if (isNaN(inwardQty) || inwardQty <= 0) {
    throw new Error("Inward quantity must be a positive integer.");
  }

  const wh = await resolveWarehouse(warehouseId || warehouseCode);
  let inv = await Inventory.findOne({ skuId: upperSku, warehouseId: wh._id });

  // If SKU doesn't exist in this warehouse yet, copy metadata from another warehouse or Product catalog
  if (!inv) {
    const existingAnyWh = await Inventory.findOne({ skuId: upperSku });
    if (existingAnyWh) {
      inv = new Inventory({
        skuId: upperSku,
        productId: existingAnyWh.productId,
        warehouseId: wh._id,
        productName: existingAnyWh.productName,
        productSku: existingAnyWh.productSku,
        color: existingAnyWh.color,
        colorCode: existingAnyWh.colorCode,
        size: existingAnyWh.size,
        image: existingAnyWh.image,
        onHand: 0,
        reserved: 0,
        damaged: 0,
        reorderLevel: reorderLevel ?? existingAnyWh.reorderLevel ?? 10,
        moq: existingAnyWh.moq ?? 1,
      });
    } else {
      // Search Product collection for matching SKU
      const product = await Product.findOne({ "variants.skus.sku": upperSku });
      if (!product) {
        throw new Error(`SKU "${upperSku}" not found in Product catalog or Inventory.`);
      }
      let matchedVar = null;
      let matchedSku = null;
      for (const v of product.variants || []) {
        const found = (v.skus || []).find((s) => String(s.sku || "").toUpperCase() === upperSku);
        if (found) {
          matchedVar = v;
          matchedSku = found;
          break;
        }
      }
      inv = new Inventory({
        skuId: upperSku,
        productId: product._id,
        warehouseId: wh._id,
        productName: product.name,
        productSku: product.sku || "",
        color: matchedVar?.color || matchedVar?.name || "Standard",
        colorCode: matchedVar?.colorCode || "#1F2422",
        size: matchedSku?.size || "STD",
        image: matchedVar?.gallery?.front || matchedVar?.images?.[0] || product.image || "",
        onHand: 0,
        reserved: 0,
        damaged: 0,
        reorderLevel: reorderLevel ?? 10,
      });
    }
  }

  const beforeOnHand = inv.onHand || 0;
  const beforeReserved = inv.reserved || 0;
  inv.onHand = beforeOnHand + inwardQty;
  inv.lastInwardAt = new Date();
  if (reorderLevel !== undefined && !isNaN(Number(reorderLevel))) {
    inv.reorderLevel = Math.max(0, parseInt(reorderLevel, 10));
  }
  await inv.save();

  const refId = (poNumber || "").trim() || `PO-INW-${Date.now()}`;
  const movement = await logStockMovement({
    skuId: inv.skuId,
    inventoryId: inv._id,
    productId: inv.productId,
    warehouseId: inv.warehouseId,
    type: "INWARD",
    qty: inwardQty,
    beforeOnHand,
    afterOnHand: inv.onHand,
    beforeReserved,
    afterReserved: inv.reserved,
    refId,
    reason: reason || `Stock inward against ${refId}`,
    actor,
  });

  await syncInventoryToProductSku(inv.skuId, inv.productId);

  return { inventory: inv, movement };
};

/**
 * BULK STOCK INWARD (from Excel/CSV rows or JSON array)
 */
const bulkInwardStock = async ({
  rows = [],
  defaultPoNumber = "",
  defaultWarehouseId = null,
  actor = { byModel: "Admin", byName: "Administrator" },
}) => {
  const succeeded = [];
  const failed = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = row.rowNumber || i + 1;
    try {
      const res = await inwardStock({
        skuId: row.skuId,
        qty: row.qty,
        poNumber: row.poNumber || defaultPoNumber || `PO-BULK-${Date.now()}`,
        warehouseId: row.warehouseId || defaultWarehouseId,
        warehouseCode: row.warehouseCode || null,
        reorderLevel: row.reorderLevel,
        reason: row.reason || "Bulk Excel/CSV stock inward",
        actor,
      });
      succeeded.push({
        rowNumber: rowNum,
        skuId: res.inventory.skuId,
        qty: row.qty,
        newOnHand: res.inventory.onHand,
        newAvailable: res.inventory.available,
      });
    } catch (err) {
      failed.push({
        rowNumber: rowNum,
        skuId: row.skuId || "(empty)",
        qty: row.qty,
        error: err.message,
      });
    }
  }

  return {
    totalRows: rows.length,
    succeededCount: succeeded.length,
    failedCount: failed.length,
    succeeded,
    failed,
  };
};

/**
 * MANUAL ADJUSTMENT & CYCLE COUNT
 * Modes:
 *   ADD                -> onHand += qty (type: ADJUST)
 *   SUBTRACT           -> onHand -= qty (type: ADJUST)
 *   DAMAGE             -> onHand -= qty, damaged += qty (type: DAMAGED)
 *   CYCLE_COUNT        -> sets onHand = physicalCount, logs difference (type: CYCLE_COUNT)
 */
const adjustStock = async ({
  skuId,
  warehouseId = null,
  mode = "ADJUST",
  qty,
  reason,
  refId = "",
  actor = { byModel: "Admin", byName: "Administrator" },
}) => {
  const upperSku = String(skuId || "").trim().toUpperCase();
  const normalizedMode = String(mode || "ADJUST").trim().toUpperCase();
  const numericQty = parseInt(qty, 10);

  if (!upperSku) throw new Error("SKU ID is required.");
  if (!reason || !String(reason).trim()) {
    throw new Error("A clear reason is mandatory for manual stock adjustments and cycle counts.");
  }
  if (isNaN(numericQty)) {
    throw new Error("A valid numeric quantity / physical count is required.");
  }

  const wh = await resolveWarehouse(warehouseId);
  const inv = await Inventory.findOne({ skuId: upperSku, warehouseId: wh._id });
  if (!inv) {
    throw new Error(`Inventory record for SKU "${upperSku}" not found in warehouse "${wh.name}".`);
  }

  const beforeOnHand = inv.onHand;
  const beforeReserved = inv.reserved;
  let newOnHand = beforeOnHand;
  let movementType = "ADJUST";
  let signedDelta = 0;

  if (normalizedMode === "ADD") {
    if (numericQty <= 0) throw new Error("ADD quantity must be greater than 0.");
    newOnHand = beforeOnHand + numericQty;
    signedDelta = numericQty;
    movementType = "ADJUST";
  } else if (normalizedMode === "SUBTRACT") {
    if (numericQty <= 0) throw new Error("SUBTRACT quantity must be greater than 0.");
    newOnHand = beforeOnHand - numericQty;
    signedDelta = -numericQty;
    movementType = "ADJUST";
  } else if (normalizedMode === "DAMAGE" || normalizedMode === "DAMAGED") {
    if (numericQty <= 0) throw new Error("Damaged quantity must be greater than 0.");
    newOnHand = beforeOnHand - numericQty;
    signedDelta = -numericQty;
    movementType = "DAMAGED";
  } else if (normalizedMode === "CYCLE_COUNT" || normalizedMode === "SET") {
    if (numericQty < 0) throw new Error("Physical count cannot be negative.");
    newOnHand = numericQty;
    signedDelta = newOnHand - beforeOnHand;
    movementType = "CYCLE_COUNT";
    inv.lastCountedAt = new Date();
  } else {
    // Signed delta fallback
    newOnHand = beforeOnHand + numericQty;
    signedDelta = numericQty;
    movementType = "ADJUST";
  }

  if (newOnHand < beforeReserved) {
    throw new Error(
      `Cannot set onHand to ${newOnHand} because ${beforeReserved} units are currently reserved by active pending orders.`
    );
  }
  if (newOnHand < 0) {
    throw new Error("Resulting onHand stock cannot be negative.");
  }

  inv.onHand = newOnHand;
  if (movementType === "DAMAGED") {
    inv.damaged = (inv.damaged || 0) + Math.abs(signedDelta);
  }
  await inv.save();

  const movement = await logStockMovement({
    skuId: inv.skuId,
    inventoryId: inv._id,
    productId: inv.productId,
    warehouseId: inv.warehouseId,
    type: movementType,
    qty: signedDelta,
    beforeOnHand,
    afterOnHand: inv.onHand,
    beforeReserved,
    afterReserved: inv.reserved,
    refId: refId || `${movementType === "CYCLE_COUNT" ? "CC" : "ADJ"}-${Date.now()}`,
    reason: String(reason).trim(),
    actor,
  });

  await syncInventoryToProductSku(inv.skuId, inv.productId);

  return { inventory: inv, movement };
};

/**
 * MULTI-WAREHOUSE TRANSFER
 * Atomically verifies source warehouse has available >= qty, transfers to destination warehouse,
 * and logs TRANSFER_OUT + TRANSFER_IN.
 */
const transferStock = async ({
  skuId,
  fromWarehouseId,
  toWarehouseId,
  qty,
  reason = "Inter-warehouse stock transfer",
  refId = "",
  actor = { byModel: "Admin", byName: "Administrator" },
}) => {
  const upperSku = String(skuId || "").trim().toUpperCase();
  const transferQty = parseInt(qty, 10);

  if (!upperSku) throw new Error("SKU ID is required.");
  if (!fromWarehouseId || !toWarehouseId) {
    throw new Error("Both source and destination warehouses are required.");
  }
  if (String(fromWarehouseId) === String(toWarehouseId)) {
    throw new Error("Source and destination warehouses must be different.");
  }
  if (isNaN(transferQty) || transferQty <= 0) {
    throw new Error("Transfer quantity must be a positive integer.");
  }

  const [fromWh, toWh] = await Promise.all([
    resolveWarehouse(fromWarehouseId),
    resolveWarehouse(toWarehouseId),
  ]);

  if (!fromWh || !toWh) throw new Error("Invalid source or destination warehouse.");

  // Atomic check & deduct on source warehouse (prevents transferring reserved stock!)
  const sourceInv = await Inventory.findOneAndUpdate(
    {
      skuId: upperSku,
      warehouseId: fromWh._id,
      $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, transferQty] },
    },
    {
      $inc: { onHand: -transferQty },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  );

  if (!sourceInv) {
    const existing = await Inventory.findOne({ skuId: upperSku, warehouseId: fromWh._id });
    const avail = existing ? Math.max(0, existing.onHand - existing.reserved) : 0;
    throw new Error(
      `Insufficient available stock in ${fromWh.name} for ${upperSku}. Available: ${avail}, requested transfer: ${transferQty}.`
    );
  }

  sourceInv.lowStockAlertActive =
    Math.max(0, sourceInv.onHand - sourceInv.reserved) <= (sourceInv.reorderLevel ?? 10);
  await sourceInv.save();

  // Increment or create destination warehouse inventory
  let destInv = await Inventory.findOne({ skuId: upperSku, warehouseId: toWh._id });
  const destBeforeOnHand = destInv ? destInv.onHand : 0;
  const destBeforeReserved = destInv ? destInv.reserved : 0;

  if (!destInv) {
    destInv = new Inventory({
      skuId: sourceInv.skuId,
      productId: sourceInv.productId,
      warehouseId: toWh._id,
      productName: sourceInv.productName,
      productSku: sourceInv.productSku,
      color: sourceInv.color,
      colorCode: sourceInv.colorCode,
      size: sourceInv.size,
      image: sourceInv.image,
      onHand: transferQty,
      reserved: 0,
      damaged: 0,
      reorderLevel: sourceInv.reorderLevel ?? 10,
      moq: sourceInv.moq ?? 1,
      lastInwardAt: new Date(),
    });
  } else {
    destInv.onHand += transferQty;
    destInv.lastInwardAt = new Date();
  }
  await destInv.save();

  const transferRef = refId || `TRF-${Date.now()}`;

  await logStockMovement({
    skuId: upperSku,
    inventoryId: sourceInv._id,
    productId: sourceInv.productId,
    warehouseId: fromWh._id,
    type: "TRANSFER_OUT",
    qty: -transferQty,
    beforeOnHand: sourceInv.onHand + transferQty,
    afterOnHand: sourceInv.onHand,
    beforeReserved: sourceInv.reserved,
    afterReserved: sourceInv.reserved,
    refId: transferRef,
    reason: `Transferred to ${toWh.name} (${toWh.code}): ${reason}`,
    actor,
  });

  await logStockMovement({
    skuId: upperSku,
    inventoryId: destInv._id,
    productId: destInv.productId,
    warehouseId: toWh._id,
    type: "TRANSFER_IN",
    qty: transferQty,
    beforeOnHand: destBeforeOnHand,
    afterOnHand: destInv.onHand,
    beforeReserved: destBeforeReserved,
    afterReserved: destInv.reserved,
    refId: transferRef,
    reason: `Received from ${fromWh.name} (${fromWh.code}): ${reason}`,
    actor,
  });

  await syncInventoryToProductSku(upperSku, sourceInv.productId);

  return {
    transferRef,
    fromWarehouse: fromWh,
    toWarehouse: toWh,
    sourceInventory: sourceInv,
    destinationInventory: destInv,
  };
};

module.exports = {
  DEFAULT_LOCK_MINUTES,
  ensureDefaultWarehouse,
  resolveWarehouse,
  syncProductToInventory,
  syncInventoryToProductSku,
  bootstrapAllProductsInventory,
  getAvailableStockForSku,
  getInventoryMapForSkus,
  reserveStockForOrder,
  deductStockForOrder,
  releaseStockForOrder,
  releaseExpiredLocks,
  restockCancelledOrder,
  partialCancelOrderItem,
  processOrderReturn,
  inwardStock,
  bulkInwardStock,
  adjustStock,
  transferStock,
  logStockMovement,
};

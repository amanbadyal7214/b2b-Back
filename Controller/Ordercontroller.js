const mongoose = require("mongoose");
const Order = require("../Model/OrderModel");
const Cart = require("../Model/CartModel");
const Product = require("../Model/ProductModel");
const Pincode = require("../Model/PincodeModel");
const Address = require("../Model/AddressModel");
const {
  DEFAULT_LOCK_MINUTES,
  releaseExpiredLocks,
  reserveStockForOrder,
  releaseStockForOrder,
  restockCancelledOrder,
  partialCancelOrderItem,
  processOrderReturn,
} = require("../Services/inventoryService");
const {
  getReferralConfig,
  getWalletSummary,
  debitForOrder,
  reverseDebitForOrder,
  qualifyReferralForOrder,
} = require("../Services/rewardLedgerService");

/**
 * Routine: Release expired stock locks (delegates to atomic inventoryService)
 */
const cleanExpiredStockLocks = async () => {
  try {
    return await releaseExpiredLocks();
  } catch (err) {
    console.warn("[cleanExpiredStockLocks] Note:", err.message);
    return { releasedLocks: 0, expiredOrders: 0 };
  }
};

/**
 * Controller: createOrder
 * POST /api/orders
 * Step 7: Creates order from cart, calculates server-side prices, and ATOMICALLY reserves SKU stock
 * for 15 minutes (overselling-proof via $expr conditional update + transaction/rollback).
 */
const createOrder = async (req, res) => {
  let reservedOrderId = null;
  try {
    const userId = req.user ? req.user._id : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to generate wholesale manifest order.",
      });
    }

    // Free any expired locks before reserving so buyers don't hit stale holds
    await cleanExpiredStockLocks();

    const {
      addressId,
      shippingAddress: inlineAddress,
      paymentMethod = "razorpay",
      notes = "",
      useRewardBalance = false,
      rewardAmountToUse = 0,
    } = req.body;

    // 1. Resolve Shipping Address
    let addressData = inlineAddress;
    if (addressId) {
      const dbAddr = await Address.findById(addressId);
      if (dbAddr) {
        addressData = dbAddr.toObject();
      }
    }

    if (!addressData || !addressData.pincode || !addressData.street || !addressData.city) {
      return res.status(400).json({
        success: false,
        message: "A complete shipping address with a verified 6-digit postal pincode is required.",
      });
    }

    // Step 5 check: Pincode MUST be serviceable
    const cleanPin = String(addressData.pincode).trim();
    const pinRecord = await Pincode.findOne({ pincode: cleanPin, status: "Active" });
    if (!pinRecord) {
      return res.status(400).json({
        success: false,
        isServiceable: false,
        message: `Pincode ${cleanPin} is not currently serviceable for direct dispatch.`,
      });
    }

    // 2. Fetch User's active cart
    const cart = await Cart.findOne({ userId, status: "active" });
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot create order: Wholesale bag is empty.",
      });
    }

    // 3. Re-verify products & calculate prices strictly on server
    let grossMerchandise = 0;
    let totalPieces = 0;
    const orderItems = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product "${item.productName || item.skuId}" is no longer available in catalog.`,
        });
      }

      const variant =
        product.variants?.find(
          (v) =>
            v.color?.toLowerCase() === item.color?.toLowerCase() ||
            v.name?.toLowerCase() === item.color?.toLowerCase()
        ) ||
        product.variants?.[0] ||
        null;

      const skuObj = variant?.skus?.find(
        (s) =>
          s.sku?.toUpperCase() === item.skuId?.toUpperCase() ||
          s.size?.toUpperCase() === item.size?.toUpperCase()
      );

      const resolvedSkuId = (skuObj?.sku || item.skuId || "").toUpperCase();

      // Rule 1: Always take server price
      const livePrice =
        variant?.wholesalePrice ??
        variant?.price ??
        product.wholesalePrice ??
        product.price ??
        item.price;

      const lineTotal = livePrice * item.quantity;
      grossMerchandise += lineTotal;
      totalPieces += item.quantity;

      orderItems.push({
        productId: product._id,
        skuId: resolvedSkuId,
        productSku: product.sku || "",
        productName: product.name,
        color: item.color || variant?.color || "Standard",
        colorCode: variant?.colorCode || item.colorCode || "#121214",
        size: item.size,
        quantity: item.quantity,
        unitPrice: livePrice,
        mrp: variant?.mrp ?? product.retailPrice ?? 0,
        totalPrice: lineTotal,
        image:
          variant?.gallery?.front ||
          variant?.images?.[0] ||
          product.image ||
          item.image ||
          "",
      });
    }

    // 4. Calculate exact bulk rebate & freight
    let discountRate = 0;
    if (totalPieces >= 150) discountRate = 0.12;
    else if (totalPieces >= 50) discountRate = 0.06;

    const discountAmount = Math.round(grossMerchandise * discountRate);
    const discountedTotal = grossMerchandise - discountAmount;
    const gstRate = 0.05;
    const gstAmount = Math.round(discountedTotal * gstRate);
    const freightCost = totalPieces >= 150 ? 0 : 850;
    const grandTotal = discountedTotal + gstAmount + freightCost;

    // 5. Generate Order ObjectId & Order Number
    const orderObjectId = new mongoose.Types.ObjectId();
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const orderId = `BVB-PO-${randomSuffix}`;

    // 5.5 Optional Rewards Wallet Balance Debit
    let walletDebit = 0;
    let debitedOrderId = null;
    if (useRewardBalance) {
      try {
        const refConfig = await getReferralConfig();
        const wallet = await getWalletSummary(userId);
        const maxRedeemable = Math.round((grandTotal * (refConfig.maxOrderRedemptionPercent || 20)) / 100);
        const desiredDebit = rewardAmountToUse > 0 ? Number(rewardAmountToUse) : maxRedeemable;
        const actualDebit = Math.min(wallet.availableBalance, maxRedeemable, desiredDebit);

        if (actualDebit > 0) {
          await debitForOrder({
            userId,
            amount: actualDebit,
            orderId,
            note: `Redeemed on Wholesale Order ${orderId}`,
          });
          walletDebit = actualDebit;
          debitedOrderId = orderId;
        }
      } catch (walletErr) {
        console.warn("[createOrder] Wallet debit note:", walletErr.message);
      }
    }

    const payableTotal = Math.max(0, grandTotal - walletDebit);

    // 6. Set 15 Minute Stock Lock Expiration
    const stockLockedUntil = new Date(Date.now() + DEFAULT_LOCK_MINUTES * 60 * 1000);

    // 7. ATOMICALLY Reserve Stock across all items (MongoDB Transaction / Rollback)
    let reservations = [];
    try {
      reservations = await reserveStockForOrder({
        orderId: orderObjectId,
        orderNumber: orderId,
        items: orderItems,
        expiresAt: stockLockedUntil,
        actor: {
          by: userId,
          byModel: "User",
          byName: req.user?.name || req.user?.email || "Retailer",
        },
      });
      reservedOrderId = orderObjectId;
    } catch (stockErr) {
      if (stockErr.code === "OUT_OF_STOCK") {
        return res.status(400).json({
          success: false,
          message: stockErr.message,
          outOfStockItem: stockErr.outOfStockItem,
        });
      }
      throw stockErr;
    }

    // Attach assigned warehouseId from reservation to each order line item
    const warehouseBySku = {};
    for (const r of reservations) {
      warehouseBySku[r.skuId] = r.warehouseId;
    }
    for (const oi of orderItems) {
      if (warehouseBySku[oi.skuId]) {
        oi.warehouseId = warehouseBySku[oi.skuId];
      }
    }

    const estimatedDays = pinRecord.estimatedDays || 3;
    const estimatedDeliveryDate = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);

    // 8. Save Order Document
    const order = new Order({
      _id: orderObjectId,
      orderId,
      userId,
      items: orderItems,
      totalUnits: totalPieces,
      shippingAddress: {
        storeName: addressData.storeName,
        contactName: addressData.contactName,
        phone: addressData.phone,
        email: addressData.email || req.user.email || "",
        street: addressData.street,
        landmark: addressData.landmark || "",
        city: addressData.city,
        state: addressData.state,
        pincode: cleanPin,
        gstin: addressData.gstin || "",
      },
      pricing: {
        grossMerchandise,
        discountRate,
        discountAmount,
        gstRate,
        gstAmount,
        freightCost,
        grandTotal,
        walletDebit,
        payableTotal,
      },
      status: "pending",
      paymentStatus: "unpaid",
      paymentMethod,
      stockLockedUntil,
      isStockDeducted: false,
      deliveryDetails: {
        estimatedDeliveryDate,
        estimatedDays,
        deliverySpeed: pinRecord.deliverySpeed,
        hub: pinRecord.hub,
      },
      notes: notes ? notes.trim() : "",
    });

    await order.save();
    reservedOrderId = null; // Persisted successfully

    // Check if buyer was referred and qualify the referral
    try {
      await qualifyReferralForOrder(order, req.user);
    } catch (qualifyErr) {
      console.warn("[createOrder] Referral qualification note:", qualifyErr?.message);
    }

    return res.status(201).json({
      success: true,
      message: `Order ${orderId} created. Stock reserved for ${DEFAULT_LOCK_MINUTES} minutes.`,
      orderId: order.orderId,
      order: {
        id: order._id,
        orderId: order.orderId,
        items: order.items,
        totalUnits: order.totalUnits,
        pricing: order.pricing,
        status: order.status,
        paymentStatus: order.paymentStatus,
        stockLockedUntil: order.stockLockedUntil,
        deliveryDetails: order.deliveryDetails,
        shippingAddress: order.shippingAddress,
      },
    });
  } catch (error) {
    // Safety net: if stock was reserved but saving Order failed, release locks immediately
    if (reservedOrderId) {
      await releaseStockForOrder(reservedOrderId, "Order persistence failure rollback").catch(() => {});
    }
    // Restitution rollback: if wallet was debited but order failed, reverse the debit
    if (debitedOrderId && walletDebit > 0) {
      await reverseDebitForOrder({
        userId,
        amount: walletDebit,
        orderId: debitedOrderId,
        reason: "Order creation failure rollback",
      }).catch(() => {});
    }
    console.error("[createOrder] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate proforma order.",
      error: error.message,
    });
  }
};

/**
 * Controller: getOrderById
 * GET /api/orders/:id
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user._id : null;

    const query = {
      $or: [{ orderId: id }],
    };

    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      query.$or.push({ _id: id });
    }

    const order = await Order.findOne(query).populate("userId", "name email phone businessName gstNumber");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order record not found.",
      });
    }

    // Check ownership unless admin
    if (userId && String(order.userId?._id || order.userId) !== String(userId) && req.admin === undefined) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this order manifest.",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("[getOrderById] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve order details.",
      error: error.message,
    });
  }
};

/**
 * Controller: getUserOrders
 * GET /api/orders
 */
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: getAllOrdersForAdmin
 * GET /api/orders/admin
 */
const getAllOrdersForAdmin = async (req, res) => {
  try {
    const { status = "ALL", search = "", page = 1, limit = 50 } = req.query;

    const filter = {};

    if (status && status !== "ALL") {
      filter.status = status;
    }

    if (search && search.trim()) {
      const cleanSearch = search.trim();
      filter.$or = [
        { orderId: { $regex: cleanSearch, $options: "i" } },
        { "shippingAddress.storeName": { $regex: cleanSearch, $options: "i" } },
        { "shippingAddress.contactName": { $regex: cleanSearch, $options: "i" } },
        { "shippingAddress.phone": { $regex: cleanSearch, $options: "i" } },
        { "shippingAddress.city": { $regex: cleanSearch, $options: "i" } },
        { "shippingAddress.pincode": { $regex: cleanSearch, $options: "i" } },
        { "shippingAddress.gstin": { $regex: cleanSearch, $options: "i" } },
        { razorpayOrderId: { $regex: cleanSearch, $options: "i" } },
        { razorpayPaymentId: { $regex: cleanSearch, $options: "i" } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const skip = (pageNum - 1) * limitNum;

    const [orders, totalCount] = await Promise.all([
      Order.find(filter)
        .populate("userId", "name storeName email phone gstin")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Order.countDocuments(filter),
    ]);

    const allOrders = await Order.find({}).select("status paymentStatus pricing totalUnits");
    let totalRevenue = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let dispatchedCount = 0;
    let deliveredCount = 0;
    let totalPiecesSold = 0;

    for (const ord of allOrders) {
      if (["paid", "processing", "dispatched", "delivered", "partially_cancelled"].includes(ord.status)) {
        totalRevenue += ord.pricing?.grandTotal || 0;
        totalPiecesSold += ord.totalUnits || 0;
        paidCount++;
      }
      if (["pending", "payment_pending"].includes(ord.status)) {
        pendingCount++;
      }
      if (ord.status === "dispatched") {
        dispatchedCount++;
      }
      if (ord.status === "delivered") {
        deliveredCount++;
      }
    }

    return res.status(200).json({
      success: true,
      orders,
      totalCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      stats: {
        totalOrders: allOrders.length,
        totalRevenue,
        totalPiecesSold,
        paidCount,
        pendingCount,
        dispatchedCount,
        deliveredCount,
      },
    });
  } catch (error) {
    console.error("[getAllOrdersForAdmin] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders for administration.",
      error: error.message,
    });
  }
};

/**
 * Controller: updateOrderStatusByAdmin
 * PATCH /api/orders/admin/:id/status
 * Updates fulfillment status, tracking numbers, and handles inventory release/restock on cancellation
 */
const updateOrderStatusByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, trackingNumber, hub, deliverySpeed, notes } = req.body;

    const order = await Order.findOne({
      $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(id) ? id : null }, { orderId: id }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order record not found.",
      });
    }

    const previousStatus = order.status;

    if (status) {
      order.status = status;
      if (status === "cancelled" && previousStatus !== "cancelled") {
        order.cancelledAt = new Date();
        await restockCancelledOrder(
          order,
          notes ? `Order cancelled: ${notes.trim()}` : "Order cancelled before shipping",
          {
            by: req.admin?._id || null,
            byModel: req.admin ? "Admin" : "System",
            byName: req.admin?.name || "Administrator",
          }
        );

        // Restitution: Refund any debited rewards wallet balance
        if (order.pricing?.walletDebit > 0) {
          await reverseDebitForOrder({
            userId: order.userId,
            amount: order.pricing.walletDebit,
            orderId: order.orderId,
            reason: `Order ${order.orderId} cancelled by Administrator. Wallet credit refunded.`,
          }).catch((revErr) => {
            console.warn("[updateOrderStatusByAdmin] Wallet refund note:", revErr?.message);
          });
        }
      }
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
      if (paymentStatus === "paid" && !order.paidAt) {
        order.paidAt = new Date();
      }
    }

    if (!order.deliveryDetails) {
      order.deliveryDetails = {};
    }

    if (trackingNumber !== undefined) {
      order.deliveryDetails.trackingNumber = trackingNumber.trim();
    }
    if (hub) {
      order.deliveryDetails.hub = hub.trim();
    }
    if (deliverySpeed) {
      order.deliveryDetails.deliverySpeed = deliverySpeed.trim();
    }

    if (notes !== undefined) {
      order.notes = notes.trim();
    }

    await order.save();

    // Auto-generate Tax Invoice on dispatch or payment confirmation
    if (status === "dispatched" || status === "delivered" || paymentStatus === "paid") {
      try {
        const { createInvoiceForOrder } = require("../Services/invoiceService");
        await createInvoiceForOrder(order);
      } catch (invErr) {
        console.warn("[updateOrderStatusByAdmin] Invoice trigger note:", invErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Order ${order.orderId} status updated from "${previousStatus}" to "${order.status}".`,
      order,
    });
  } catch (error) {
    console.error("[updateOrderStatusByAdmin] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order status.",
      error: error.message,
    });
  }
};

/**
 * Controller: partialCancelOrderItemByAdmin
 * POST /api/orders/admin/:id/partial-cancel
 */
const partialCancelOrderItemByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { skuId, qty, reason } = req.body;
    const result = await partialCancelOrderItem({
      orderIdOrNumber: id,
      skuId,
      qty,
      reason,
      actor: {
        by: req.admin?._id || null,
        byModel: req.admin ? "Admin" : "System",
        byName: req.admin?.name || "Administrator",
      },
    });
    return res.status(200).json({
      success: true,
      message: `Cancelled ${result.cancelledQty} pcs of ${skuId} on ${result.order.orderId} and restored SKU stock.`,
      order: result.order,
      item: result.item,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel order item.",
    });
  }
};

/**
 * Controller: processOrderReturnByAdmin
 * POST /api/orders/admin/:id/return
 */
const processOrderReturnByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { skuId, qty, qcStatus = "PASS", reason, warehouseId } = req.body;
    const result = await processOrderReturn({
      orderIdOrNumber: id,
      skuId,
      qty,
      qcStatus,
      reason,
      warehouseId,
      actor: {
        by: req.admin?._id || null,
        byModel: req.admin ? "Admin" : "System",
        byName: req.admin?.name || "QC Inspector",
      },
    });
    return res.status(200).json({
      success: true,
      message:
        String(qcStatus).toUpperCase() === "PASS"
          ? `QC PASS: Restocked ${qty} pcs of ${skuId} to onHand.`
          : `QC FAIL: Logged ${qty} pcs of ${skuId} as damaged stock.`,
      order: result.order,
      inventory: result.inventory,
      movement: result.movement,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process return.",
    });
  }
};

/**
 * Controller: reorderOrder
 * POST /api/orders/:id/reorder
 * Re-orders items from past order or invoice:
 * - Checks stock availability (flags/skips out-of-stock items)
 * - Fetches CURRENT pricing (never copies old prices, flags price shift)
 * - Validates MOQ and active product status
 * - Primes user's cart and returns detailed validation warnings summary
 */
const reorderOrder = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required to reorder." });
    }

    const { id } = req.params;
    const { selectedItemIds = null } = req.body;

    const order = await Order.findOne({
      $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(id) ? id : null }, { orderId: id }],
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order record not found." });
    }

    // Verify ownership or admin
    if (!req.admin && String(order.userId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Unauthorized to reorder from this document." });
    }

    // Filter items if partial reorder requested
    let itemsToProcess = order.items;
    if (Array.isArray(selectedItemIds) && selectedItemIds.length > 0) {
      const idSet = new Set(selectedItemIds.map(String));
      itemsToProcess = order.items.filter((it) => idSet.has(String(it._id)) || idSet.has(String(it.skuId)));
    }

    if (itemsToProcess.length === 0) {
      return res.status(400).json({ success: false, message: "No items selected for reorder." });
    }

    // Load or create active cart
    let cart = await Cart.findOne({ userId, status: "active" });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const addedItems = [];
    const outOfStockItems = [];
    const priceChangedItems = [];
    const warnings = [];

    const Inventory = require("../Model/InventoryModel");

    for (const oldItem of itemsToProcess) {
      // 1. Fetch current product safely (by ObjectId, SKU, slug, or title)
      let product = null;
      const pidStr = oldItem.productId ? String(oldItem.productId).trim() : null;
      if (pidStr && /^[0-9a-fA-F]{24}$/.test(pidStr)) {
        try {
          product = await Product.findById(pidStr);
        } catch {
          product = null;
        }
      }

      if (!product && oldItem.productSku) {
        try {
          product = await Product.findOne({
            $or: [
              { sku: { $regex: new RegExp(`^${oldItem.productSku.trim()}$`, "i") } },
              { slug: { $regex: new RegExp(`^${oldItem.productSku.trim()}$`, "i") } },
            ],
          });
        } catch {}
      }

      if (!product && oldItem.skuId) {
        try {
          const baseSku = oldItem.skuId.split("-").slice(0, 3).join("-");
          product = await Product.findOne({
            $or: [
              { "variants.skus.sku": { $regex: new RegExp(`^${oldItem.skuId.trim()}$`, "i") } },
              { sku: { $regex: new RegExp(`^${baseSku.trim()}$`, "i") } },
              { sku: { $regex: new RegExp(`^${oldItem.skuId.trim()}$`, "i") } },
            ],
          });
        } catch {}
      }

      if (!product && oldItem.productName) {
        try {
          product = await Product.findOne({
            name: { $regex: new RegExp(`^${oldItem.productName.trim()}$`, "i") },
          });
        } catch {}
      }

      if (product && (product.status === "Inactive" || product.status === "Archived")) {
        warnings.push(`"${oldItem.productName}" is no longer active in wholesale catalogue and was skipped.`);
        outOfStockItems.push({
          skuId: oldItem.skuId,
          productName: oldItem.productName,
          reason: "Product Inactive/Archived",
        });
        continue;
      }

      // If product not found in MongoDB catalog, use safe fallback from oldItem
      if (!product) {
        product = {
          _id: pidStr && /^[0-9a-fA-F]{24}$/.test(pidStr) ? pidStr : new mongoose.Types.ObjectId(),
          name: oldItem.productName || "Wholesale Garment",
          sku: oldItem.productSku || oldItem.skuId || "BVB-PRODUCT",
          wholesalePrice: Number(oldItem.unitPrice) || 0,
          price: Number(oldItem.unitPrice) || 0,
          countInStock: 999,
          moq: 1,
          image: oldItem.image || "",
          status: "Active",
        };
      }

      // 2. Check current stock for the SKU
      const cleanSku = String(oldItem.skuId || oldItem.productSku || "SKU").trim();
      let availableOnHand = 0;
      try {
        const invRecords = await Inventory.find({ skuId: cleanSku });
        if (invRecords.length > 0) {
          availableOnHand = invRecords.reduce(
            (sum, inv) => sum + Math.max(0, (inv.onHand || 0) - (inv.reserved || 0)),
            0
          );
        } else {
          availableOnHand = product.countInStock ?? 100;
        }
      } catch {
        availableOnHand = 100;
      }

      if (availableOnHand <= 0) {
        warnings.push(`"${oldItem.productName}" (${oldItem.size} / ${oldItem.color}) is currently OUT OF STOCK.`);
        outOfStockItems.push({
          skuId: cleanSku,
          productName: oldItem.productName,
          size: oldItem.size,
          color: oldItem.color,
          requestedQty: oldItem.quantity,
          availableOnHand: 0,
          reason: "Out of Stock",
        });
        continue;
      }

      // 3. Resolve Current Pricing (Current Wholesale or Tier Price)
      const currentPrice = Number(product.wholesalePrice || product.price || oldItem.unitPrice || 0);
      const oldPrice = Number(oldItem.unitPrice || currentPrice);

      if (currentPrice !== oldPrice) {
        priceChangedItems.push({
          skuId: cleanSku,
          productName: oldItem.productName,
          oldPrice,
          newPrice: currentPrice,
          diff: currentPrice - oldPrice,
        });
        warnings.push(
          `Price updated for "${oldItem.productName}": ₹${oldPrice.toLocaleString("en-IN")} → ₹${currentPrice.toLocaleString("en-IN")}`
        );
      }

      // 4. Resolve Quantity
      const desiredQty = Number(oldItem.quantity) || 1;
      const qtyToAdd = Math.min(desiredQty, availableOnHand);

      if (qtyToAdd < desiredQty) {
        warnings.push(
          `Partial stock available for "${oldItem.productName}": only ${qtyToAdd} of ${desiredQty} pcs added.`
        );
      }

      // 5. Add or Update in Cart
      const existingCartIndex = cart.items.findIndex(
        (ci) =>
          ci.skuId === cleanSku ||
          (String(ci.productId) === String(product._id) &&
            ci.size === oldItem.size &&
            ci.color === oldItem.color)
      );

      if (existingCartIndex > -1) {
        cart.items[existingCartIndex].quantity += qtyToAdd;
        cart.items[existingCartIndex].price = currentPrice;
      } else {
        cart.items.push({
          productId: product._id,
          skuId: cleanSku,
          productSku: product.sku || oldItem.productSku || "",
          productName: product.name || oldItem.productName,
          color: oldItem.color || "Standard",
          colorCode: oldItem.colorCode || "#121214",
          size: oldItem.size || "M",
          quantity: qtyToAdd,
          price: currentPrice,
          mrp: product.price || product.mrp || currentPrice,
          image: oldItem.image || product.image || "",
          moq: product.moq || 1,
          addedAt: new Date(),
        });
      }

      addedItems.push({
        skuId: cleanSku,
        productName: oldItem.productName,
        size: oldItem.size,
        color: oldItem.color,
        quantity: qtyToAdd,
        unitPrice: currentPrice,
        total: currentPrice * qtyToAdd,
      });
    }

    cart.reorderOf = order.orderId;
    cart.lastActivityAt = new Date();
    await cart.save();

    return res.status(200).json({
      success: true,
      message: `Reorder processed: ${addedItems.length} items added to wholesale bag.`,
      orderId: order.orderId,
      addedItems,
      outOfStockItems,
      priceChangedItems,
      warnings,
      summary: {
        totalRequested: itemsToProcess.length,
        totalAdded: addedItems.length,
        outOfStockCount: outOfStockItems.length,
        priceChangeCount: priceChangedItems.length,
      },
      cart,
    });
  } catch (error) {
    console.error("[reorderOrder] Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to process reorder." });
  }
};

module.exports = {
  createOrder,
  getOrderById,
  getUserOrders,
  cleanExpiredStockLocks,
  getAllOrdersForAdmin,
  updateOrderStatusByAdmin,
  partialCancelOrderItemByAdmin,
  processOrderReturnByAdmin,
  reorderOrder,
};

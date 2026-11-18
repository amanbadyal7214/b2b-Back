const Order = require("../Model/OrderModel");
const Cart = require("../Model/CartModel");
const Product = require("../Model/ProductModel");
const Pincode = require("../Model/PincodeModel");
const StockLock = require("../Model/StockLockModel");
const Address = require("../Model/AddressModel");

/**
 * Routine: Release expired stock locks older than 15 minutes
 */
const cleanExpiredStockLocks = async () => {
  try {
    const now = new Date();
    const expiredLocks = await StockLock.find({
      status: "active",
      expiresAt: { $lt: now },
    });

    if (expiredLocks.length > 0) {
      for (const lock of expiredLocks) {
        lock.status = "released";
        await lock.save();

        // Expire order if still pending
        await Order.findOneAndUpdate(
          { _id: lock.orderId, status: "pending" },
          { status: "expired" }
        );
      }
    }
  } catch (err) {
    console.warn("[cleanExpiredStockLocks] Note:", err.message);
  }
};

// Automatic 2-minute interval cron to release expired stock locks & expire abandoned pending orders
setInterval(cleanExpiredStockLocks, 2 * 60 * 1000);

/**
 * Controller: createOrder
 * POST /api/orders
 * Step 7: Cart se order banata hai, price server se fresh calculate, stock 15 min lock
 * Rule 1: Price strictly calculated on server
 * Rule 4: Order creation & stock lock in consistent atomic sequence
 */
const createOrder = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to generate wholesale manifest order.",
      });
    }

    await cleanExpiredStockLocks();

    const {
      addressId,
      shippingAddress: inlineAddress,
      paymentMethod = "razorpay",
      notes = "",
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

    // 3. Re-verify products, stock and calculate prices strictly on server
    let grossMerchandise = 0;
    let totalPieces = 0;
    const orderItems = [];
    const stockLockPromises = [];

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
        ) || product.variants?.[0] || null;

      const skuObj = variant?.skus?.find(
        (s) =>
          s.sku?.toUpperCase() === item.skuId?.toUpperCase() ||
          s.size?.toUpperCase() === item.size?.toUpperCase()
      );

      const availableStock = skuObj ? skuObj.stock : 50;

      // Count currently locked active stock for this SKU
      const existingLocks = await StockLock.find({
        skuId: item.skuId,
        status: "active",
        expiresAt: { $gt: new Date() },
      });
      const currentlyLocked = existingLocks.reduce((acc, l) => acc + l.quantity, 0);

      const effectiveStock = availableStock - currentlyLocked;
      if (effectiveStock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient inventory for ${product.name} (${item.size}). Available: ${Math.max(0, effectiveStock)} units.`,
          outOfStockItem: {
            name: product.name,
            size: item.size,
            available: Math.max(0, effectiveStock),
            requested: item.quantity,
          },
        });
      }

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
        skuId: item.skuId,
        productSku: product.sku || "",
        productName: product.name,
        color: item.color || variant?.color || "Standard",
        colorCode: variant?.colorCode || item.colorCode || "#121214",
        size: item.size,
        quantity: item.quantity,
        unitPrice: livePrice,
        mrp: variant?.mrp ?? product.retailPrice ?? 0,
        totalPrice: lineTotal,
        image: variant?.gallery?.front || variant?.images?.[0] || product.image || item.image || "",
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

    // 5. Generate Order ID
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const orderId = `BVB-PO-${randomSuffix}`;

    // 6. Set 15 Minute Stock Lock Expiration
    const stockLockedUntil = new Date(Date.now() + 15 * 60 * 1000);

    const estimatedDays = pinRecord.estimatedDays || 3;
    const estimatedDeliveryDate = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);

    // 7. Save Order Document
    const order = new Order({
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

    // 8. Create Stock Lock Records
    for (const item of orderItems) {
      await StockLock.create({
        orderId: order._id,
        productId: item.productId,
        skuId: item.skuId,
        quantity: item.quantity,
        expiresAt: stockLockedUntil,
        status: "active",
      });
    }

    return res.status(201).json({
      success: true,
      message: `Order ${orderId} created. Stock reserved for 15 minutes.`,
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
 * Step 13: Confirmation screen & order details
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
 * Fetches all wholesale manifest orders across the platform with filtering, search & metrics
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

    // Aggregate key executive stats across all orders
    const allOrders = await Order.find({}).select("status paymentStatus pricing totalUnits");
    let totalRevenue = 0;
    let paidCount = 0;
    let pendingCount = 0;
    let dispatchedCount = 0;
    let deliveredCount = 0;
    let totalPiecesSold = 0;

    for (const ord of allOrders) {
      if (["paid", "processing", "dispatched", "delivered"].includes(ord.status)) {
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
 * Updates dispatch and fulfillment status, tracking numbers, or releases inventory on cancellation
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
      if (status === "cancelled") {
        order.cancelledAt = new Date();

        // If order was cancelled and stock was deducted, return stock to SKUs
        if (order.isStockDeducted) {
          for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (product && Array.isArray(product.variants)) {
              for (const variant of product.variants) {
                if (Array.isArray(variant.skus)) {
                  const skuObj = variant.skus.find(
                    (s) =>
                      s.sku?.toUpperCase() === item.skuId?.toUpperCase() ||
                      s.size?.toUpperCase() === item.size?.toUpperCase()
                  );
                  if (skuObj) {
                    skuObj.stock += item.quantity;
                    if (skuObj.status === "Out of Stock" && skuObj.stock > 0) {
                      skuObj.status = "Available";
                    }
                  }
                }
              }
              await product.save();
            }
          }
          order.isStockDeducted = false;
        }

        // Release any active stock locks
        await StockLock.updateMany(
          { orderId: order._id, status: "active" },
          { status: "released" }
        );
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

module.exports = {
  createOrder,
  getOrderById,
  getUserOrders,
  cleanExpiredStockLocks,
  getAllOrdersForAdmin,
  updateOrderStatusByAdmin,
};

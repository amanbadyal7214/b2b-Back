const Address = require("../Model/AddressModel");
const Pincode = require("../Model/PincodeModel");
const Cart = require("../Model/CartModel");
const Product = require("../Model/ProductModel");
const { getAvailableStockForSku } = require("../Services/inventoryService");

/**
 * Controller: saveAddress
 * POST /api/checkout/address
 * Step 5: Validates shipping address, verifies pincode serviceability, calculates delivery ETA
 */
const saveAddress = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to set shipping address.",
      });
    }

    const {
      storeName,
      contactName,
      phone,
      email,
      street,
      landmark,
      city,
      state,
      pincode,
      gstin,
      isDefault = true,
    } = req.body;

    if (!storeName || !contactName || !phone || !street || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: "All address fields (store name, contact name, phone, street, city, state, pincode) are required.",
      });
    }

    const cleanPin = String(pincode).trim();
    if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid 6-digit postal pincode.",
      });
    }

    // Step 5 Verification: Check if pincode is serviceable
    const pinMatch = await Pincode.findOne({ pincode: cleanPin, status: "Active" });
    if (!pinMatch) {
      return res.status(400).json({
        success: false,
        isServiceable: false,
        message: `Pincode ${cleanPin} is currently outside our direct wholesale mill-dispatch zone. Please choose a serviceable commercial hub.`,
      });
    }

    // Calculate delivery ETA
    const estimatedDays = pinMatch.estimatedDays || 3;
    const estimatedDeliveryDate = new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);

    // If default, unset previous defaults
    if (isDefault) {
      await Address.updateMany({ userId }, { isDefault: false });
    }

    const address = new Address({
      userId,
      storeName: storeName.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : req.user.email || "",
      street: street.trim(),
      landmark: landmark ? landmark.trim() : "",
      city: city.trim(),
      state: state.trim(),
      pincode: cleanPin,
      gstin: gstin ? gstin.trim().toUpperCase() : req.user.gstNumber || "",
      isDefault: Boolean(isDefault),
    });

    await address.save();

    return res.status(200).json({
      success: true,
      message: `Delivery address saved. Serviceable via ${pinMatch.hub} (${estimatedDays} business days).`,
      address,
      deliveryDetails: {
        isServiceable: true,
        pincode: cleanPin,
        city: pinMatch.city,
        state: pinMatch.state,
        hub: pinMatch.hub,
        estimatedDays,
        estimatedDeliveryDate,
        deliverySpeed: pinMatch.deliverySpeed,
        isCodAvailable: pinMatch.isCodAvailable,
      },
    });
  } catch (error) {
    console.error("[saveAddress] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save delivery address.",
      error: error.message,
    });
  }
};

/**
 * Controller: getAddresses
 * GET /api/checkout/addresses
 */
const getAddresses = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
    return res.status(200).json({ success: true, addresses });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Controller: getCheckoutSummary
 * GET /api/checkout/summary
 * Step 6: Recalculates fresh prices directly from database products (Rule 1: Never trust client price)
 */
const getCheckoutSummary = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const { pincode } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required for checkout." });
    }

    // 1. Fetch user's cart from database
    const cart = await Cart.findOne({ userId, status: "active" });
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(200).json({
        success: true,
        isEmpty: true,
        items: [],
        pricing: {
          subtotal: 0,
          discountRate: 0,
          discountAmount: 0,
          gstAmount: 0,
          freightCost: 0,
          grandTotal: 0,
        },
        warnings: ["Your wholesale bag is currently empty."],
      });
    }

    // 2. Freshly re-fetch product prices and check live stock
    let freshSubtotal = 0;
    let totalPieces = 0;
    const warnings = [];
    const verifiedItems = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        warnings.push(`Item "${item.productName || item.skuId}" is no longer available and was removed.`);
        continue;
      }

      // Resolve color variant
      const variant =
        product.variants?.find(
          (v) =>
            v.color?.toLowerCase() === item.color?.toLowerCase() ||
            v.name?.toLowerCase() === item.color?.toLowerCase()
        ) || product.variants?.[0] || null;

      // Resolve SKU & stock
      const skuObj = variant?.skus?.find(
        (s) =>
          s.sku?.toUpperCase() === item.skuId?.toUpperCase() ||
          s.size?.toUpperCase() === item.size?.toUpperCase()
      );

      const livePrice =
        variant?.wholesalePrice ??
        variant?.price ??
        product.wholesalePrice ??
        product.price ??
        item.price;

      if (item.price !== livePrice) {
        warnings.push(`Price for ${item.productName} updated from ₹${item.price} to current rate of ₹${livePrice}/pc.`);
      }

      const liveInv = await getAvailableStockForSku(skuObj?.sku || item.skuId, product._id);
      const availableStock = liveInv.exists ? liveInv.available : (skuObj ? skuObj.stock : 50);
      if (availableStock <= 0) {
        warnings.push(`⚠️ ${item.productName} (${item.size}) is currently OUT OF STOCK.`);
      } else if (availableStock < item.quantity) {
        warnings.push(`⚠️ Only ${availableStock} units available for ${item.productName} (${item.size}). Requested: ${item.quantity}.`);
      }

      const itemTotal = livePrice * item.quantity;
      freshSubtotal += itemTotal;
      totalPieces += item.quantity;

      verifiedItems.push({
        productId: product._id,
        skuId: item.skuId,
        productName: product.name,
        color: item.color,
        size: item.size,
        quantity: item.quantity,
        unitPrice: livePrice,
        mrp: variant?.mrp ?? product.retailPrice ?? 0,
        totalPrice: itemTotal,
        image: variant?.gallery?.front || variant?.images?.[0] || product.image || item.image || "",
        availableStock,
        isOutOfStock: availableStock <= 0,
      });
    }

    // 3. Compute bulk tier volume rebate
    let discountRate = 0;
    if (totalPieces >= 150) {
      discountRate = 0.12; // 12% Stockist Direct Rebate
    } else if (totalPieces >= 50) {
      discountRate = 0.06; // 6% Boutique Rebate
    }
    const discountAmount = Math.round(freshSubtotal * discountRate);
    const discountedSubtotal = freshSubtotal - discountAmount;

    // 4. Compute 5% Apparel GST
    const gstRate = 0.05;
    const gstAmount = Math.round(discountedSubtotal * gstRate);

    // 5. Compute Insured Carton Freight
    const freightCost = totalPieces >= 150 || totalPieces === 0 ? 0 : 850;

    // 6. Grand Total
    const grandTotal = discountedSubtotal + gstAmount + freightCost;

    // 7. Check Pincode serviceability if provided
    let pincodeInfo = null;
    if (pincode) {
      const cleanPin = String(pincode).trim();
      const pinRecord = await Pincode.findOne({ pincode: cleanPin, status: "Active" });
      if (pinRecord) {
        const estimatedDeliveryDate = new Date(Date.now() + (pinRecord.estimatedDays || 3) * 24 * 60 * 60 * 1000);
        pincodeInfo = {
          isServiceable: true,
          pincode: cleanPin,
          city: pinRecord.city,
          state: pinRecord.state,
          hub: pinRecord.hub,
          estimatedDays: pinRecord.estimatedDays,
          estimatedDeliveryDate,
          deliverySpeed: pinRecord.deliverySpeed,
          isCodAvailable: pinRecord.isCodAvailable,
        };
      } else {
        pincodeInfo = {
          isServiceable: false,
          pincode: cleanPin,
          message: `Pincode ${cleanPin} is outside our direct wholesale dispatch network.`,
        };
      }
    }

    return res.status(200).json({
      success: true,
      items: verifiedItems,
      totalUnits: totalPieces,
      pricing: {
        grossMerchandise: freshSubtotal,
        discountRate,
        discountAmount,
        discountedSubtotal,
        gstRate,
        gstAmount,
        freightCost,
        grandTotal,
      },
      warnings,
      pincodeInfo,
    });
  } catch (error) {
    console.error("[getCheckoutSummary] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to calculate checkout summary.",
      error: error.message,
    });
  }
};

module.exports = {
  saveAddress,
  getAddresses,
  getCheckoutSummary,
};

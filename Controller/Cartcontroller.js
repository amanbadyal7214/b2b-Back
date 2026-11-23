const mongoose = require("mongoose");
const Cart = require("../Model/CartModel");
const Product = require("../Model/ProductModel");
const { getAvailableStockForSku } = require("../Services/inventoryService");

/**
 * Helper: Locate Product safely by MongoDB ObjectId, slug, or SKU
 */
const findProductByIdentifier = async (identifier) => {
  if (!identifier) return null;
  const str = String(identifier).trim();
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    const byId = await Product.findById(str);
    if (byId) return byId;
  }
  return Product.findOne({
    $or: [
      { slug: { $regex: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
      { sku: { $regex: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
    ],
  });
};

/**
 * Helper to resolve active Cart for user or guest
 */
const findOrCreateCart = async (userId, guestId) => {
  let query = null;
  if (userId) {
    query = { userId, status: "active" };
  } else if (guestId) {
    query = { guestId, status: "active" };
  }

  if (!query) return null;

  let cart = await Cart.findOne(query);
  if (!cart) {
    cart = new Cart({
      userId: userId || null,
      guestId: userId ? null : guestId,
      items: [],
      status: "active",
    });
    await cart.save();
  }
  return cart;
};

/**
 * Helper to enrich and validate cart items against live Product/SKU records
 */
const revalidateCartItems = async (cart) => {
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return {
      cart,
      subtotal: 0,
      totalQuantity: 0,
      warnings: [],
    };
  }

  let subtotal = 0;
  let totalQuantity = 0;
  const warnings = [];
  const validItems = [];

  for (const item of cart.items) {
    let product = null;
    const pidStr = item.productId ? String(item.productId).trim() : null;
    if (pidStr && /^[0-9a-fA-F]{24}$/.test(pidStr)) {
      try {
        product = await Product.findById(pidStr);
      } catch {
        product = null;
      }
    }

    if (!product && item.productSku) {
      try {
        product = await Product.findOne({
          $or: [
            { sku: { $regex: new RegExp(`^${item.productSku.trim()}$`, "i") } },
            { slug: { $regex: new RegExp(`^${item.productSku.trim()}$`, "i") } },
          ],
        });
      } catch {}
    }

    if (!product && item.skuId) {
      try {
        const baseSku = item.skuId.split("-").slice(0, 3).join("-");
        product = await Product.findOne({
          $or: [
            { "variants.skus.sku": { $regex: new RegExp(`^${item.skuId.trim()}$`, "i") } },
            { sku: { $regex: new RegExp(`^${baseSku.trim()}$`, "i") } },
            { sku: { $regex: new RegExp(`^${item.skuId.trim()}$`, "i") } },
          ],
        });
      } catch {}
    }

    if (!product && item.productName) {
      try {
        product = await Product.findOne({
          name: { $regex: new RegExp(`^${item.productName.trim()}$`, "i") },
        });
      } catch {}
    }

    if (!product) {
      // Safe fallback: Retain line item with its stored price and attributes so user's cart is never wiped out
      const fallbackPrice = item.price || 0;
      const fallbackQty = item.quantity || 1;
      subtotal += fallbackPrice * fallbackQty;
      totalQuantity += fallbackQty;

      const enriched = typeof item.toObject === "function" ? item.toObject() : { ...item };
      enriched.availableStock = 100;
      enriched.isOutOfStock = false;
      enriched.livePrice = fallbackPrice;
      enriched.priceChanged = false;
      validItems.push(enriched);
      continue;
    }

    // Resolve color variant
    const variant =
      product.variants?.find(
        (v) =>
          v.color?.toLowerCase() === item.color?.toLowerCase() ||
          v.name?.toLowerCase() === item.color?.toLowerCase()
      ) ||
      product.variants?.[0] ||
      null;

    // Resolve SKU (Size Level)
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

    // Live available = onHand - reserved (read-only; adding to cart never modifies inventory)
    let invCheck = { exists: false, available: 0 };
    try {
      invCheck = await getAvailableStockForSku(skuObj?.sku || item.skuId, product._id);
    } catch {}
    const availableStock = invCheck.exists ? invCheck.available : (skuObj ? skuObj.stock : (product.countInStock ?? 100));
    const isOutOfStock = availableStock <= 0;

    let adjustedQty = item.quantity;
    if (!isOutOfStock && availableStock < item.quantity) {
      adjustedQty = availableStock;
      warnings.push(
        `Quantity for ${item.productName} (${item.size}) adjusted to available stock (${availableStock}).`
      );
    }

    if (isOutOfStock) {
      warnings.push(`${item.productName} (${item.color}, Size ${item.size}) is currently out of stock.`);
    }

    item.price = livePrice;
    item.quantity = adjustedQty;

    subtotal += livePrice * adjustedQty;
    totalQuantity += adjustedQty;

    const enriched = typeof item.toObject === "function" ? item.toObject() : { ...item };
    enriched.availableStock = availableStock;
    enriched.isOutOfStock = isOutOfStock;
    enriched.livePrice = livePrice;
    enriched.priceChanged = livePrice !== item.price;

    validItems.push(enriched);
  }

  cart.items = cart.items.filter((i) =>
    validItems.some((v) => String(v._id) === String(i._id))
  );
  await cart.save();

  return {
    cart,
    items: validItems,
    subtotal: Math.round(subtotal),
    totalQuantity,
    warnings,
  };
};

/**
 * Controller: getCart
 * GET /api/cart
 */
const getCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const guestId = req.headers["x-guest-id"] || req.query.guestId;

    if (!userId && !guestId) {
      return res.status(200).json({
        success: true,
        cart: {
          items: [],
          subtotal: 0,
          totalQuantity: 0,
        },
        warnings: [],
      });
    }

    const cart = await findOrCreateCart(userId, guestId);
    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: {
          items: [],
          subtotal: 0,
          totalQuantity: 0,
        },
        warnings: [],
      });
    }

    const validation = await revalidateCartItems(cart);

    return res.status(200).json({
      success: true,
      cart: {
        id: cart._id,
        userId: cart.userId,
        guestId: cart.guestId,
        items: validation.items,
        subtotal: validation.subtotal,
        totalQuantity: validation.totalQuantity,
        updatedAt: cart.updatedAt,
      },
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error("[getCart] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve shopping bag",
      error: error.message,
    });
  }
};

/**
 * Controller: addToCart
 * POST /api/cart/add
 * Body: { productId, skuId, color, size, quantity, guestId }
 */
const addToCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const {
      productId,
      skuId,
      color,
      size,
      quantity = 1,
      guestId = req.headers["x-guest-id"],
    } = req.body;

    if (!productId || !size) {
      return res.status(400).json({
        success: false,
        message: "Product ID and size are required to add to bag.",
      });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // 1. Fetch Product (supports Mongo _id, slug, or SKU)
    const product = await findProductByIdentifier(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Wholesale product not found.",
      });
    }

    // 2. Resolve Color Variant
    const variant =
      product.variants?.find(
        (v) =>
          v.color?.toLowerCase() === color?.toLowerCase() ||
          v.name?.toLowerCase() === color?.toLowerCase()
      ) ||
      product.variants?.[0] ||
      null;

    const resolvedColorName = variant?.color || variant?.name || color || "Standard";
    const resolvedColorCode = variant?.colorCode || variant?.hex || "#121214";

    // 3. Resolve SKU (Size Level)
    const skuObj = variant?.skus?.find(
      (s) =>
        s.sku?.toUpperCase() === skuId?.toUpperCase() ||
        s.size?.toUpperCase() === size?.toUpperCase()
    );

    // Compute SKU code
    const colCode = resolvedColorName
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const finalSkuCode =
      skuObj?.sku ||
      skuId ||
      `${product.sku || "BVB"}-${colCode}-${size.toUpperCase()}`;

    // Check live available = onHand - reserved (cart add does NOT reserve or deduct stock)
    const liveInv = await getAvailableStockForSku(finalSkuCode, product._id);
    const liveAvailable = liveInv.exists ? liveInv.available : (skuObj ? skuObj.stock : 0);

    if (liveAvailable <= 0) {
      return res.status(400).json({
        success: false,
        message: `${product.name} (Size ${size}) is currently Out of Stock.`,
        availableStock: 0,
      });
    }

    if (liveAvailable < qty) {
      return res.status(400).json({
        success: false,
        message: `Sirf ${liveAvailable} pcs available hain for Size ${size}. Aap ${qty} pcs add nahi kar sakte.`,
        availableStock: liveAvailable,
      });
    }

    // Determine unit price
    const unitPrice =
      variant?.wholesalePrice ??
      variant?.price ??
      product.wholesalePrice ??
      product.price ??
      0;

    const mrp =
      variant?.mrp ??
      variant?.retailPrice ??
      product.retailPrice ??
      product.mrp ??
      0;

    const image =
      variant?.gallery?.front ||
      variant?.images?.[0] ||
      variant?.image ||
      product.image ||
      "";

    // 4. Locate or Create Cart
    const activeGuestId = userId ? null : guestId || "guest_" + Date.now();
    const cart = await findOrCreateCart(userId, activeGuestId);

    // 5. Check if SKU already in cart
    const existingIndex = cart.items.findIndex(
      (item) => item.skuId?.toUpperCase() === finalSkuCode.toUpperCase()
    );

    if (existingIndex > -1) {
      const existing = cart.items[existingIndex];
      const newTotalQty = existing.quantity + qty;

      if (liveAvailable < newTotalQty) {
        return res.status(400).json({
          success: false,
          message: `Bag already contains ${existing.quantity} units. Adding ${qty} exceeds available stock (${liveAvailable}).`,
          availableStock: liveAvailable,
        });
      }

      existing.quantity = newTotalQty;
      existing.price = unitPrice; // Keep price synced with latest
    } else {
      cart.items.push({
        productId: product._id,
        skuId: finalSkuCode,
        productSku: product.sku || "",
        productName: product.name,
        color: resolvedColorName,
        colorCode: resolvedColorCode,
        size: size.toUpperCase(),
        quantity: qty,
        price: unitPrice,
        mrp,
        image,
        moq: product.moq ? parseInt(product.moq, 10) || 1 : 1,
        addedAt: new Date(),
      });
    }

    cart.lastActivityAt = new Date();
    await cart.save();

    const validation = await revalidateCartItems(cart);

    return res.status(200).json({
      success: true,
      message: `Added ${qty} ${qty === 1 ? "unit" : "units"} of ${product.name} (${size}) to bag.`,
      cart: {
        id: cart._id,
        userId: cart.userId,
        guestId: cart.guestId,
        items: validation.items,
        subtotal: validation.subtotal,
        totalQuantity: validation.totalQuantity,
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    console.error("[addToCart] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add item to bag",
      error: error.message,
    });
  }
};

/**
 * Controller: updateCartItem
 * PUT /api/cart/update
 * Body: { skuId, quantity, guestId }
 */
const updateCartItem = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const { skuId, quantity, guestId = req.headers["x-guest-id"] } = req.body;

    if (!skuId) {
      return res.status(400).json({
        success: false,
        message: "SKU identifier is required.",
      });
    }

    const cart = await findOrCreateCart(userId, guestId);
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found.",
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.skuId?.toUpperCase() === skuId.toUpperCase()
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in bag.",
      });
    }

    const targetQty = parseInt(quantity, 10);

    // If 0 or negative, remove item
    if (isNaN(targetQty) || targetQty <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      // Re-verify stock limit
      const item = cart.items[itemIndex];
      const product = await Product.findById(item.productId);
      if (product) {
        const variant = product.variants?.find(
          (v) => v.color?.toLowerCase() === item.color?.toLowerCase()
        );
        const skuObj = variant?.skus?.find(
          (s) =>
            s.sku?.toUpperCase() === skuId?.toUpperCase() ||
            s.size?.toUpperCase() === item.size?.toUpperCase()
        );
        const liveInv = await getAvailableStockForSku(skuObj?.sku || skuId, product._id);
        const liveAvailable = liveInv.exists ? liveInv.available : (skuObj ? skuObj.stock : 0);
        if (liveAvailable < targetQty) {
          return res.status(400).json({
            success: false,
            message: `Sirf ${liveAvailable} pcs available hain for this size. Isse zyada add nahi ho sakta.`,
            availableStock: liveAvailable,
          });
        }
      }
      cart.items[itemIndex].quantity = targetQty;
    }

    cart.lastActivityAt = new Date();
    await cart.save();

    const validation = await revalidateCartItems(cart);

    return res.status(200).json({
      success: true,
      message: "Cart updated successfully.",
      cart: {
        id: cart._id,
        items: validation.items,
        subtotal: validation.subtotal,
        totalQuantity: validation.totalQuantity,
      },
    });
  } catch (error) {
    console.error("[updateCartItem] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update item quantity",
      error: error.message,
    });
  }
};

/**
 * Controller: removeFromCart
 * DELETE /api/cart/remove/:skuId
 */
const removeFromCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const skuId = req.params.skuId || req.body.skuId;
    const guestId = req.headers["x-guest-id"] || req.query.guestId;

    if (!skuId) {
      return res.status(400).json({
        success: false,
        message: "SKU identifier is required to remove from bag.",
      });
    }

    const cart = await findOrCreateCart(userId, guestId);
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found.",
      });
    }

    const initialLen = cart.items.length;
    cart.items = cart.items.filter(
      (item) => item.skuId?.toUpperCase() !== skuId.toUpperCase()
    );

    if (cart.items.length === initialLen) {
      return res.status(404).json({
        success: false,
        message: "Item not present in bag.",
      });
    }

    cart.lastActivityAt = new Date();
    await cart.save();

    const validation = await revalidateCartItems(cart);

    return res.status(200).json({
      success: true,
      message: "Item removed from bag.",
      cart: {
        id: cart._id,
        items: validation.items,
        subtotal: validation.subtotal,
        totalQuantity: validation.totalQuantity,
      },
    });
  } catch (error) {
    console.error("[removeFromCart] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove item",
      error: error.message,
    });
  }
};

/**
 * Controller: mergeGuestCart
 * POST /api/cart/merge
 * Merges localStorage guest items into the authenticated user's server cart
 */
const mergeGuestCart = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to merge cart.",
      });
    }

    const userId = req.user._id;
    const { guestItems = [], guestId } = req.body;

    // 1. Get or create user cart
    const userCart = await findOrCreateCart(userId, null);

    // 2. If guestId provided, load database guest cart as well
    if (guestId) {
      const dbGuestCart = await Cart.findOne({ guestId, status: "active" });
      if (dbGuestCart && Array.isArray(dbGuestCart.items)) {
        for (const gItem of dbGuestCart.items) {
          if (!guestItems.some((i) => i.skuId === gItem.skuId)) {
            guestItems.push(gItem);
          }
        }
        // Mark guest cart as converted
        dbGuestCart.status = "converted";
        await dbGuestCart.save();
      }
    }

    // 3. Merge each guest item
    for (const item of guestItems) {
      if (!item.productId || !item.size) continue;

      const product = await findProductByIdentifier(item.productId);
      if (!product) continue;

      const variant =
        product.variants?.find(
          (v) =>
            v.color?.toLowerCase() === item.color?.toLowerCase() ||
            v.name?.toLowerCase() === item.color?.toLowerCase()
        ) || product.variants?.[0];

      const skuObj = variant?.skus?.find(
        (s) =>
          s.sku?.toUpperCase() === item.skuId?.toUpperCase() ||
          s.size?.toUpperCase() === item.size?.toUpperCase()
      );

      const targetSku =
        skuObj?.sku ||
        item.skuId ||
        `${product.sku}-${(item.color || "COL").substring(0, 3).toUpperCase()}-${item.size.toUpperCase()}`;

      const liveInv = await getAvailableStockForSku(targetSku, product._id);
      const liveAvailable = liveInv.exists ? liveInv.available : (skuObj ? skuObj.stock : 0);
      if (liveAvailable <= 0) continue;

      const existingIndex = userCart.items.findIndex(
        (i) => i.skuId?.toUpperCase() === targetSku.toUpperCase()
      );

      const qtyToAdd = Math.max(1, parseInt(item.quantity, 10) || 1);

      if (existingIndex > -1) {
        const existing = userCart.items[existingIndex];
        const newTotal = Math.max(existing.quantity, qtyToAdd);
        existing.quantity = Math.min(newTotal, liveAvailable);
      } else {
        const unitPrice =
          variant?.wholesalePrice ??
          variant?.price ??
          product.wholesalePrice ??
          product.price ??
          item.price ??
          0;

        userCart.items.push({
          productId: product._id,
          skuId: targetSku,
          productSku: product.sku || "",
          productName: product.name,
          color: variant?.color || item.color || "Standard",
          colorCode: variant?.colorCode || item.colorCode || "#121214",
          size: item.size.toUpperCase(),
          quantity: Math.min(qtyToAdd, liveAvailable),
          price: unitPrice,
          mrp: variant?.mrp ?? product.retailPrice ?? 0,
          image: variant?.gallery?.front || variant?.images?.[0] || product.image || "",
          moq: product.moq ? parseInt(product.moq, 10) || 1 : 1,
          addedAt: new Date(),
        });
      }
    }

    userCart.lastActivityAt = new Date();
    await userCart.save();

    const validation = await revalidateCartItems(userCart);

    return res.status(200).json({
      success: true,
      message: "Guest cart merged successfully into your account.",
      cart: {
        id: userCart._id,
        items: validation.items,
        subtotal: validation.subtotal,
        totalQuantity: validation.totalQuantity,
      },
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error("[mergeGuestCart] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to merge cart items",
      error: error.message,
    });
  }
};

/**
 * Controller: clearCart
 * DELETE /api/cart/clear
 */
const clearCart = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const guestId = req.headers["x-guest-id"] || req.query.guestId;

    const cart = await findOrCreateCart(userId, guestId);
    if (cart) {
      cart.items = [];
      cart.lastActivityAt = new Date();
      await cart.save();
    }

    return res.status(200).json({
      success: true,
      message: "Shopping bag cleared successfully.",
      cart: {
        items: [],
        subtotal: 0,
        totalQuantity: 0,
      },
    });
  } catch (error) {
    console.error("[clearCart] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to clear bag",
      error: error.message,
    });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  mergeGuestCart,
  clearCart,
};


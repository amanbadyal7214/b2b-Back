const mongoose = require("mongoose");
const Wishlist = require("../Model/WishlistModel");
const Cart = require("../Model/CartModel");
const Product = require("../Model/ProductModel");

/**
 * Helper to find or create user's wishlist
 */
const findOrCreateWishlist = async (userId) => {
  let wishlist = await Wishlist.findOne({ userId });
  if (!wishlist) {
    wishlist = new Wishlist({
      userId,
      items: [],
    });
    await wishlist.save();
  }
  return wishlist;
};

/**
 * Controller: getWishlist
 * GET /api/wishlist
 */
const getWishlist = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(200).json({
        success: true,
        items: [],
        count: 0,
      });
    }

    const wishlist = await Wishlist.findOne({ userId: req.user._id }).populate({
      path: "items.productId",
      select: "name sku slug category wholesalePrice retailPrice price mrp image variants colors sizeList moq availability",
    });

    if (!wishlist) {
      return res.status(200).json({
        success: true,
        items: [],
        count: 0,
      });
    }

    // Clean up items where product no longer exists
    const validItems = wishlist.items
      .filter((item) => item.productId != null)
      .map((item) => {
        const prod = item.productId;
        const colorName = item.color || "";
        const variant =
          prod.variants?.find(
            (v) =>
              v.color?.toLowerCase() === colorName.toLowerCase() ||
              v.name?.toLowerCase() === colorName.toLowerCase()
          ) ||
          prod.variants?.[0] ||
          null;

        const liveImage =
          variant?.gallery?.front ||
          variant?.images?.[0] ||
          variant?.image ||
          prod.image;

        const livePrice =
          variant?.wholesalePrice ??
          variant?.price ??
          prod.wholesalePrice ??
          prod.price ??
          0;

        return {
          id: String(prod._id),
          productId: prod._id,
          name: prod.name,
          sku: prod.sku,
          slug: prod.slug,
          category: prod.category,
          price: livePrice,
          mrp: variant?.mrp ?? prod.retailPrice ?? prod.mrp ?? 0,
          image: liveImage,
          selectedColor: {
            name: variant?.color || colorName || "Standard",
            hex: variant?.colorCode || item.colorCode || "#121214",
          },
          availableColors: prod.colors || prod.variants || [],
          sizeList: prod.sizeList || ["S", "M", "L", "XL", "XXL"],
          variants: prod.variants || [],
          moq: prod.moq || 1,
          availability: prod.availability || "Ready Stock",
          addedAt: item.addedAt,
        };
      });

    return res.status(200).json({
      success: true,
      items: validItems,
      count: validItems.length,
    });
  } catch (error) {
    console.error("[getWishlist] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve wishlist",
      error: error.message,
    });
  }
};

/**
 * Controller: toggleWishlist
 * POST /api/wishlist/toggle
 * Body: { productId, color, colorCode }
 */
const toggleWishlist = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Please log in to save items to your permanent wishlist.",
      });
    }

    const { productId, color, colorCode } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const wishlist = await findOrCreateWishlist(req.user._id);

    const existingIndex = wishlist.items.findIndex((item) =>
      item.productId.equals(productId)
    );

    let isWishlisted = false;
    let message = "";

    if (existingIndex > -1) {
      // Remove from wishlist
      wishlist.items.splice(existingIndex, 1);
      isWishlisted = false;
      message = `Removed "${product.name}" from your shortlist.`;
    } else {
      // Add to wishlist
      wishlist.items.push({
        productId: product._id,
        color: color || "",
        colorCode: colorCode || "",
        addedAt: new Date(),
      });
      isWishlisted = true;
      message = `Saved "${product.name}" to your shortlist.`;
    }

    await wishlist.save();

    return res.status(200).json({
      success: true,
      isWishlisted,
      message,
      wishlistCount: wishlist.items.length,
    });
  } catch (error) {
    console.error("[toggleWishlist] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update wishlist",
      error: error.message,
    });
  }
};

/**
 * Controller: removeFromWishlist
 * DELETE /api/wishlist/remove/:productId
 */
const removeFromWishlist = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const productId = req.params.productId || req.body.productId;
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    const wishlist = await findOrCreateWishlist(req.user._id);
    wishlist.items = wishlist.items.filter(
      (item) => !item.productId.equals(productId)
    );
    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: "Product removed from wishlist.",
      wishlistCount: wishlist.items.length,
    });
  } catch (error) {
    console.error("[removeFromWishlist] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove item from wishlist",
      error: error.message,
    });
  }
};

/**
 * Controller: moveToCart
 * POST /api/wishlist/move-to-cart
 * Adds specific SKU to cart & removes from wishlist in one step
 * Body: { productId, skuId, color, size, quantity }
 */
const moveToCart = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to move item to bag.",
      });
    }

    const { productId, skuId, color, size, quantity = 1 } = req.body;
    if (!productId || !size) {
      return res.status(400).json({
        success: false,
        message: "Product ID and size are required to move item to bag.",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // 1. Resolve variant & SKU
    const variant =
      product.variants?.find(
        (v) =>
          v.color?.toLowerCase() === color?.toLowerCase() ||
          v.name?.toLowerCase() === color?.toLowerCase()
      ) || product.variants?.[0];

    const skuObj = variant?.skus?.find(
      (s) =>
        s.sku?.toUpperCase() === skuId?.toUpperCase() ||
        s.size?.toUpperCase() === size?.toUpperCase()
    );

    const colCode = (variant?.color || color || "COL")
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    const finalSkuCode =
      skuObj?.sku ||
      skuId ||
      `${product.sku || "BVB"}-${colCode}-${size.toUpperCase()}`;

    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    if (skuObj && skuObj.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Only ${skuObj.stock} units available for size ${size}.`,
        availableStock: skuObj.stock,
      });
    }

    // 2. Add to user's cart
    let cart = await Cart.findOne({ userId: req.user._id, status: "active" });
    if (!cart) {
      cart = new Cart({ userId: req.user._id, items: [], status: "active" });
    }

    const existingIndex = cart.items.findIndex(
      (item) => item.skuId?.toUpperCase() === finalSkuCode.toUpperCase()
    );

    const unitPrice =
      variant?.wholesalePrice ??
      variant?.price ??
      product.wholesalePrice ??
      product.price ??
      0;

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += qty;
      cart.items[existingIndex].price = unitPrice;
    } else {
      cart.items.push({
        productId: product._id,
        skuId: finalSkuCode,
        productSku: product.sku || "",
        productName: product.name,
        color: variant?.color || color || "Standard",
        colorCode: variant?.colorCode || "#121214",
        size: size.toUpperCase(),
        quantity: qty,
        price: unitPrice,
        mrp: variant?.mrp ?? product.retailPrice ?? 0,
        image: variant?.gallery?.front || variant?.images?.[0] || product.image || "",
        moq: product.moq ? parseInt(product.moq, 10) || 1 : 1,
        addedAt: new Date(),
      });
    }

    cart.lastActivityAt = new Date();
    await cart.save();

    // 3. Remove product from wishlist
    const wishlist = await findOrCreateWishlist(req.user._id);
    wishlist.items = wishlist.items.filter(
      (item) => !item.productId.equals(productId)
    );
    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: `Moved ${product.name} (Size ${size}) to your shopping bag.`,
      cart,
      wishlistCount: wishlist.items.length,
    });
  } catch (error) {
    console.error("[moveToCart] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to move item to bag",
      error: error.message,
    });
  }
};

/**
 * Controller: syncGuestWishlist
 * POST /api/wishlist/sync
 * Syncs guest localStorage wishlist items into user account upon login
 */
const syncGuestWishlist = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { items = [] } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No items to sync.",
      });
    }

    const wishlist = await findOrCreateWishlist(req.user._id);

    for (const item of items) {
      const prodId = item.productId || item.id;
      if (!prodId) continue;

      const alreadyExists = wishlist.items.some((w) =>
        w.productId.equals(prodId)
      );

      if (!alreadyExists) {
        wishlist.items.push({
          productId: prodId,
          color: item.color || item.colorName || "",
          colorCode: item.colorCode || "",
          addedAt: new Date(),
        });
      }
    }

    await wishlist.save();

    return res.status(200).json({
      success: true,
      message: "Wishlist synced with account.",
      wishlistCount: wishlist.items.length,
    });
  } catch (error) {
    console.error("[syncGuestWishlist] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to sync wishlist",
      error: error.message,
    });
  }
};

module.exports = {
  getWishlist,
  toggleWishlist,
  removeFromWishlist,
  moveToCart,
  syncGuestWishlist,
};


const Product = require("../Model/ProductModel");
const Category = require("../Model/CategoryModel");
const { uploadToCloudinary, deleteFromCloudinary } = require("../Config/cloudinary");
const {
  syncProductToInventory,
  getInventoryMapForSkus,
} = require("../Services/inventoryService");

/**
 * Helper: Attach live Inventory (onHand, reserved, available) onto product SKU lists
 */
const enrichProductsWithLiveInventory = async (productDocs = []) => {
  const list = Array.isArray(productDocs) ? productDocs : [productDocs];
  const allSkuIds = [];
  for (const p of list) {
    for (const v of p?.variants || p?.colors || []) {
      for (const s of v?.skus || []) {
        if (s?.sku) allSkuIds.push(String(s.sku).toUpperCase());
      }
    }
  }

  const invMap = await getInventoryMapForSkus(allSkuIds);
  if (Object.keys(invMap).length === 0) return productDocs;

  const enrichOne = (doc) => {
    const obj = typeof doc.toObject === "function" ? doc.toObject({ virtuals: true }) : { ...doc };
    const applyToVariantList = (variants) => {
      if (!Array.isArray(variants)) return variants;
      return variants.map((v) => {
        if (!Array.isArray(v.skus)) return v;
        const enrichedSkus = v.skus.map((s) => {
          const live = invMap[String(s.sku || "").toUpperCase()];
          if (!live) return s;
          return {
            ...s,
            onHand: live.onHand,
            reserved: live.reserved,
            available: live.available,
            reorderLevel: live.reorderLevel,
            stock: live.available,
            status: live.status,
          };
        });
        return { ...v, skus: enrichedSkus };
      });
    };

    if (Array.isArray(obj.variants)) obj.variants = applyToVariantList(obj.variants);
    if (Array.isArray(obj.colors)) obj.colors = applyToVariantList(obj.colors);
    return obj;
  };

  return Array.isArray(productDocs) ? list.map(enrichOne) : enrichOne(productDocs);
};

/**
 * Helper to build default product gallery angles
 */
const buildDefaultGallery = (primaryImage, companions = []) => ({
  front: primaryImage || "",
  back: primaryImage || "",
  side: companions[0] || primaryImage || "",
  closeup: primaryImage || "",
  onModel: companions[1] || companions[0] || primaryImage || "",
});

/**
 * Get all products with filtering, search, sorting and pagination
 * GET /api/products
 */
exports.getProducts = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      group,
      fit,
      availability,
      isLatestDrop,
      isBestseller,
      search,
      q,
      color,
      sort,
      page = 1,
      limit = 50,
    } = req.query;

    const query = { status: "Active" };

    if (category && category !== "all") {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };
    }

    if (subcategory) {
      query.$or = [
        { subcategory: { $regex: new RegExp(subcategory.trim(), "i") } },
        { subcategorySlug: { $regex: new RegExp(subcategory.trim(), "i") } },
      ];
    }

    if (group) {
      query.group = { $regex: new RegExp(`^${group.trim()}$`, "i") };
    }

    if (fit) {
      query.fit = { $regex: new RegExp(`^${fit.trim()}$`, "i") };
    }

    if (availability) {
      query.availability = { $regex: new RegExp(`^${availability.trim()}$`, "i") };
    }

    if (isLatestDrop !== undefined) {
      query.isLatestDrop = isLatestDrop === "true" || isLatestDrop === true;
    }

    if (isBestseller !== undefined) {
      query.isBestseller = isBestseller === "true" || isBestseller === true;
    }

    const searchTerm = (search || q || "").trim();
    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, "i");
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { name: searchRegex },
            { sku: searchRegex },
            { fabric: searchRegex },
            { subcategory: searchRegex },
            { "colors.name": searchRegex },
            { colorTags: searchRegex },
          ],
        },
      ];
    }

    if (color) {
      const colorRegex = new RegExp(color.trim(), "i");
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "colors.name": colorRegex },
            { "colors.tone": colorRegex },
            { colorTags: colorRegex },
          ],
        },
      ];
    }

    // Sorting
    let sortOptions = { createdAt: -1 };
    if (sort === "price-low" || sort === "price-asc") {
      sortOptions = { wholesalePrice: 1 };
    } else if (sort === "price-high" || sort === "price-desc") {
      sortOptions = { wholesalePrice: -1 };
    } else if (sort === "bestseller") {
      sortOptions = { isBestseller: -1, createdAt: -1 };
    } else if (sort === "newest") {
      sortOptions = { isLatestDrop: -1, createdAt: -1 };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [total, rawProducts] = await Promise.all([
      Product.countDocuments(query),
      Product.find(query).sort(sortOptions).skip(skip).limit(limitNum),
    ]);

    const products = await enrichProductsWithLiveInventory(rawProducts);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: error.message,
    });
  }
};

/**
 * Get single product by id, sku, or slug
 * GET /api/products/:id
 */
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "Product identifier is required" });
    }

    const trimmedId = id.trim();

    let product = null;

    // 1. Try finding by MongoDB _id if valid ObjectId
    if (trimmedId.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findById(trimmedId).populate("categoryRef", "name slug");
    }

    // 2. Try finding by exact SKU
    if (!product) {
      product = await Product.findOne({
        sku: { $regex: new RegExp(`^${trimmedId}$`, "i") },
      }).populate("categoryRef", "name slug");
    }

    // 3. Try finding by slug
    if (!product) {
      product = await Product.findOne({
        slug: { $regex: new RegExp(`^${trimmedId}$`, "i") },
      }).populate("categoryRef", "name slug");
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product "${id}" not found`,
      });
    }

    const enrichedProduct = await enrichProductsWithLiveInventory(product);

    return res.status(200).json({
      success: true,
      product: enrichedProduct,
    });
  } catch (error) {
    console.error("Error fetching product by id:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product details",
      error: error.message,
    });
  }
};

/**
 * Create a new product with color variants & images
 * POST /api/products
 */
exports.createProduct = async (req, res) => {
  try {
    let payload = req.body;

    // Handle multipart form-data if fields are JSON strings
    if (typeof payload.colors === "string") {
      try {
        payload.colors = JSON.parse(payload.colors);
      } catch {
        payload.colors = [];
      }
    }
    if (typeof payload.sizeList === "string") {
      try {
        payload.sizeList = JSON.parse(payload.sizeList);
      } catch {
        payload.sizeList = payload.sizeList.split(",").map((s) => s.trim());
      }
    }
    if (typeof payload.copy === "string") {
      try {
        payload.copy = JSON.parse(payload.copy);
      } catch {
        payload.copy = {};
      }
    }

    const { sku, name, category, wholesalePrice, colors = [] } = payload;

    if (!sku || !sku.trim()) {
      return res.status(400).json({ success: false, message: "Product SKU is required" });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ success: false, message: "Product category is required" });
    }
    if (wholesalePrice === undefined || wholesalePrice === null) {
      return res.status(400).json({ success: false, message: "Wholesale price is required" });
    }

    const existingSku = await Product.findOne({
      sku: { $regex: new RegExp(`^${sku.trim()}$`, "i") },
    });
    if (existingSku) {
      return res.status(409).json({
        success: false,
        message: `Product with SKU "${sku}" already exists`,
      });
    }

    // Process primary uploaded image if provided via req.file
    let imageUrl = payload.image || "";
    let imagePublicId = payload.imagePublicId || "";

    if (req.file) {
      try {
        const uploadRes = await uploadToCloudinary(req.file.buffer, "b2b_products");
        imageUrl = uploadRes.url;
        imagePublicId = uploadRes.public_id;
      } catch (uploadErr) {
        console.warn("[Upload Fallback] Cloudinary upload failed, converting to data URI:", uploadErr.message);
        imageUrl = `data:${req.file.mimetype || "image/jpeg"};base64,${req.file.buffer.toString("base64")}`;
      }
    }

    // Default image fallback if primary image empty but first color has an image
    if (!imageUrl && colors.length > 0 && colors[0].image) {
      imageUrl = colors[0].image;
    }

    // Generate slug from SKU
    const slug = (payload.slug || sku).toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // Extract variants from payload (Myntra 3-Level Style-Color-SKU architecture)
    let rawVariants = payload.variants || payload.colors || colors || [];
    if (typeof rawVariants === "string") {
      try {
        rawVariants = JSON.parse(rawVariants);
      } catch (e) {
        rawVariants = [];
      }
    }

    // Process Level 2 Color Variants with 5 distinct photos and Level 3 SKUs
    const formattedVariants = await Promise.all(
      rawVariants.map(async (v) => {
        const colorName = v.color || v.name || "Default";
        const colorCode = v.colorCode || v.hex || "#1F2422";
        const g = v.gallery || {};
        const imgs = Array.isArray(v.images) ? [...v.images] : [];

        const angles = ["front", "back", "side", "closeup", "onModel"];
        const processedGallery = {};

        for (let idx = 0; idx < angles.length; idx++) {
          const angleKey = angles[idx];
          let photo = g[angleKey] || imgs[idx] || (angleKey === "front" ? (v.image || imageUrl) : "");

          if (typeof photo === "string" && photo.startsWith("data:image")) {
            try {
              const uploadRes = await uploadToCloudinary(photo, "b2b_products_angles");
              if (uploadRes && uploadRes.url) {
                photo = uploadRes.url;
              }
            } catch (pErr) {
              console.warn(`[Angle Upload] Cloudinary upload failed for ${colorName} - ${angleKey}:`, pErr.message);
            }
          }
          processedGallery[angleKey] = photo || "";
        }

        const finalImages = [
          processedGallery.front,
          processedGallery.back,
          processedGallery.side,
          processedGallery.closeup,
          processedGallery.onModel,
        ].filter(Boolean);

        const primaryImg = processedGallery.front || finalImages[0] || v.image || imageUrl || "";

        // Process Level 3 Size SKUs with exact stock
        let skus = Array.isArray(v.skus) ? v.skus : [];
        if (skus.length === 0) {
          const colCode = colorName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
          const sizeListArr =
            Array.isArray(payload.sizeList) && payload.sizeList.length > 0
              ? payload.sizeList
              : ["S", "M", "L", "XL", "XXL"];
          skus = sizeListArr.map((sz) => ({
            sku: `${sku.trim().toUpperCase()}-${colCode}-${sz}`,
            size: sz,
            stock: 25,
            status: "In Stock",
          }));
        }

        return {
          ...v,
          color: colorName,
          name: colorName,
          colorCode,
          hex: colorCode,
          tone: v.tone || "",
          images: finalImages.length > 0 ? finalImages : [primaryImg],
          gallery: processedGallery,
          image: primaryImg,
          price: Number(v.price) || Number(v.wholesalePrice) || Number(wholesalePrice) || 0,
          wholesalePrice: Number(v.wholesalePrice) || Number(v.price) || Number(wholesalePrice) || 0,
          mrp: Number(v.mrp) || Number(v.retailPrice) || Number(payload.retailPrice) || 0,
          retailPrice: Number(v.retailPrice) || Number(v.mrp) || Number(payload.retailPrice) || 0,
          skus,
        };
      })
    );

    const newProduct = new Product({
      ...payload,
      sku: sku.trim().toUpperCase(),
      styleId: sku.trim().toUpperCase(),
      name: name.trim(),
      slug,
      image: imageUrl,
      imagePublicId,
      variants: formattedVariants,
      colors: formattedVariants,
    });

    await newProduct.save();

    // Sync newly created product SKUs into Inventory collection
    await syncProductToInventory(newProduct, {
      by: req.admin?._id || null,
      byModel: req.admin ? "Admin" : "System",
      byName: req.admin?.name || "Catalog Create",
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create product",
      error: error.message,
    });
  }
};

/**
 * Update an existing product
 * PUT /api/products/:id
 */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let payload = req.body;

    if (typeof payload.colors === "string") {
      try {
        payload.colors = JSON.parse(payload.colors);
      } catch {
        // ignore
      }
    }
    if (typeof payload.sizeList === "string") {
      try {
        payload.sizeList = JSON.parse(payload.sizeList);
      } catch {
        // ignore
      }
    }
    if (typeof payload.copy === "string") {
      try {
        payload.copy = JSON.parse(payload.copy);
      } catch {
        // ignore
      }
    }

    let product = await Product.findById(id);
    if (!product) {
      product = await Product.findOne({ sku: { $regex: new RegExp(`^${id}$`, "i") } });
    }

    if (!product) {
      return res.status(404).json({ success: false, message: `Product "${id}" not found` });
    }

    // If new primary image uploaded via req.file
    if (req.file) {
      if (product.imagePublicId) {
        await deleteFromCloudinary(product.imagePublicId);
      }
      try {
        const uploadRes = await uploadToCloudinary(req.file.buffer, "b2b_products");
        payload.image = uploadRes.url;
        payload.imagePublicId = uploadRes.public_id;
      } catch (uploadErr) {
        console.warn("[Upload Fallback] Cloudinary upload failed, converting to data URI:", uploadErr.message);
        payload.image = `data:${req.file.mimetype || "image/jpeg"};base64,${req.file.buffer.toString("base64")}`;
      }
    }

    // Process Level 2 Color Variants with 5 distinct photos and Level 3 SKUs
    let rawVariants = payload.variants || payload.colors;
    if (typeof rawVariants === "string") {
      try {
        rawVariants = JSON.parse(rawVariants);
      } catch (e) {
        rawVariants = null;
      }
    }

    if (Array.isArray(rawVariants)) {
      const formattedVariants = await Promise.all(
        rawVariants.map(async (v) => {
          const colorName = v.color || v.name || "Default";
          const colorCode = v.colorCode || v.hex || "#1F2422";
          const g = v.gallery || {};
          const imgs = Array.isArray(v.images) ? [...v.images] : [];

          const angles = ["front", "back", "side", "closeup", "onModel"];
          const processedGallery = {};

          for (let idx = 0; idx < angles.length; idx++) {
            const angleKey = angles[idx];
            let photo =
              g[angleKey] ||
              imgs[idx] ||
              (angleKey === "front" ? (v.image || product.image) : "");

            if (typeof photo === "string" && photo.startsWith("data:image")) {
              try {
                const uploadRes = await uploadToCloudinary(photo, "b2b_products_angles");
                if (uploadRes && uploadRes.url) {
                  photo = uploadRes.url;
                }
              } catch (pErr) {
                console.warn(`[Angle Upload] Cloudinary upload failed for ${colorName} - ${angleKey}:`, pErr.message);
              }
            }
            processedGallery[angleKey] = photo || "";
          }

          const finalImages = [
            processedGallery.front,
            processedGallery.back,
            processedGallery.side,
            processedGallery.closeup,
            processedGallery.onModel,
          ].filter(Boolean);

          const primaryImg = processedGallery.front || finalImages[0] || v.image || product.image || "";

          // Level 3 SKUs per size
          let skus = Array.isArray(v.skus) ? v.skus : [];
          if (skus.length === 0) {
            const colCode = colorName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
            const sizeListArr =
              Array.isArray(payload.sizeList) && payload.sizeList.length > 0
                ? payload.sizeList
                : product.sizeList || ["S", "M", "L", "XL", "XXL"];
            const currentSku = payload.sku || product.sku;
            skus = sizeListArr.map((sz) => ({
              sku: `${currentSku}-${colCode}-${sz}`,
              size: sz,
              stock: 25,
              status: "In Stock",
            }));
          }

          return {
            ...v,
            color: colorName,
            name: colorName,
            colorCode,
            hex: colorCode,
            tone: v.tone || "",
            images: finalImages.length > 0 ? finalImages : [primaryImg],
            gallery: processedGallery,
            image: primaryImg,
            price: Number(v.price) || Number(v.wholesalePrice) || product.wholesalePrice || 0,
            wholesalePrice: Number(v.wholesalePrice) || Number(v.price) || product.wholesalePrice || 0,
            mrp: Number(v.mrp) || Number(v.retailPrice) || product.retailPrice || 0,
            retailPrice: Number(v.retailPrice) || Number(v.mrp) || product.retailPrice || 0,
            skus,
          };
        })
      );

      payload.variants = formattedVariants;
      payload.colors = formattedVariants;
    }

    Object.assign(product, payload);
    await product.save();

    // Ensure any newly added SKUs/variants are synced into Inventory
    await syncProductToInventory(product, {
      by: req.admin?._id || null,
      byModel: req.admin ? "Admin" : "System",
      byName: req.admin?.name || "Catalog Update",
    });

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product",
      error: error.message,
    });
  }
};

/**
 * Delete a product
 * DELETE /api/products/:id
 */
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let product = await Product.findById(id);
    if (!product) {
      product = await Product.findOne({ sku: { $regex: new RegExp(`^${id}$`, "i") } });
    }

    if (!product) {
      return res.status(404).json({ success: false, message: `Product "${id}" not found` });
    }

    if (product.imagePublicId) {
      await deleteFromCloudinary(product.imagePublicId);
    }

    await product.deleteOne();

    return res.status(200).json({
      success: true,
      message: `Product ${product.sku} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

/**
 * Seed or re-seed default B2B catalogue products
 * POST /api/products/seed
 */
exports.seedProducts = async (req, res) => {
  try {
    const { products: customSeedList, reset = false } = req.body || {};

    if (reset) {
      await Product.deleteMany({});
    }

    const currentCount = await Product.countDocuments();
    if (currentCount > 0 && !reset) {
      const existing = await Product.find().limit(20);
      return res.status(200).json({
        success: true,
        message: `Catalog already contains ${currentCount} products. Pass { reset: true } to overwrite.`,
        count: currentCount,
        products: existing,
      });
    }

    let seedItems = Array.isArray(customSeedList) && customSeedList.length > 0 ? customSeedList : [];

    if (seedItems.length === 0) {
      try {
        const { SAMPLE_PRODUCTS } = require("../scripts/seedProducts");
        if (Array.isArray(SAMPLE_PRODUCTS) && SAMPLE_PRODUCTS.length > 0) {
          seedItems = SAMPLE_PRODUCTS;
        }
      } catch (e) {
        console.warn("[seedProducts] Could not load SAMPLE_PRODUCTS:", e.message);
      }
    }

    if (seedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No product seed items provided in request body and default sample list unavailable",
      });
    }

    const inserted = await Product.insertMany(seedItems, { ordered: false });

    for (const p of inserted) {
      await syncProductToInventory(p, { byModel: "System", byName: "Catalog Seed" });
    }

    return res.status(201).json({
      success: true,
      message: `Successfully seeded ${inserted.length} wholesale products`,
      count: inserted.length,
      products: inserted,
    });
  } catch (error) {
    console.error("Error seeding products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to seed products",
      error: error.message,
    });
  }
};


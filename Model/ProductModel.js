const mongoose = require("mongoose");

/**
 * Level 3: Size-level SKU Schema (Myntra/Amazon Style-Color-SKU architecture)
 * Tracks exact stock and SKU code per color + size combination
 */
const skuItemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true, // e.g. "BVB-TEE-01-BLK-M"
    },
    size: {
      type: String,
      required: true,
      trim: true, // e.g. "S", "M", "L", "XL", "28", "30"
    },
    stock: {
      type: Number,
      default: 20,
      min: 0,
    },
    status: {
      type: String,
      enum: ["In Stock", "Low Stock", "Out of Stock"],
      default: "In Stock",
    },
  },
  { _id: true }
);

/**
 * Level 2: Color Variant Schema
 * Each color variant owns its own 5 photos, pricing, and size-level SKUs
 */
const variantSchema = new mongoose.Schema(
  {
    color: {
      type: String,
      required: [true, "Color name is required (e.g. Obsidian Black)"],
      trim: true,
    },
    colorCode: {
      type: String,
      default: "#1F2422",
      trim: true,
    },
    // Compatibility aliases
    name: { type: String, default: "", trim: true },
    hex: { type: String, default: "", trim: true },
    tone: { type: String, default: "", trim: true },
    // 5 photos per color (FRONT, BACK, SIDE, CLOSE-UP, ON MODEL)
    images: {
      type: [String],
      default: [],
    },
    // Structured 5-angle gallery
    gallery: {
      front: { type: String, default: "" },
      back: { type: String, default: "" },
      side: { type: String, default: "" },
      closeup: { type: String, default: "" },
      onModel: { type: String, default: "" },
    },
    image: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    price: { type: Number, default: null },
    wholesalePrice: { type: Number, default: null },
    mrp: { type: Number, default: null },
    retailPrice: { type: Number, default: null },
    stockStatus: {
      type: String,
      enum: ["In Stock", "Ready Stock", "Low Stock", "Made to Order", "Out of Stock"],
      default: "In Stock",
    },
    skuVariant: {
      type: String,
      default: "",
      trim: true,
    },
    // Level 3: SKUs per size
    skus: [skuItemSchema],
  },
  { _id: true }
);

const specificationItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const shippingTermSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    detail: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const sizeChartRowSchema = new mongoose.Schema(
  {
    size: { type: String, required: true },
    chest: { type: String, default: "" },
    shoulder: { type: String, default: "" },
    length: { type: String, default: "" },
    sleeve: { type: String, default: "" },
    waist: { type: String, default: "" },
    hip: { type: String, default: "" },
    thigh: { type: String, default: "" },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, "Product SKU is required (e.g. BVB-TEE-01)"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },
    category: {
      type: String,
      required: [true, "Product category slug is required (e.g. tees, shirts, hoodies)"],
      trim: true,
      lowercase: true,
    },
    categoryRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    group: {
      type: String,
      enum: ["Topwear", "Bottomwear", "Packs & Co-ords", "Outerwear", "Accessories"],
      default: "Topwear",
    },
    subcategory: {
      type: String,
      default: "",
      trim: true,
    },
    subcategorySlug: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    fabric: {
      type: String,
      default: "",
      trim: true,
    },
    gsm: {
      type: String,
      default: "",
      trim: true,
    },
    fit: {
      type: String,
      default: "Regular",
      trim: true,
    },
    availability: {
      type: String,
      enum: ["Ready Stock", "Made to Order", "Pre-Order", "Low Stock"],
      default: "Ready Stock",
    },
    moqType: {
      type: String,
      default: "Editable MOQ",
      trim: true,
    },
    moq: {
      type: String,
      default: "Editable",
      trim: true,
    },
    wholesalePrice: {
      type: Number,
      required: [true, "Wholesale price per unit is required"],
      min: 0,
    },
    retailPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    sizes: {
      type: String,
      default: "S – XXL",
      trim: true,
    },
    sizeList: {
      type: [String],
      default: ["S", "M", "L", "XL", "XXL"],
    },
    image: {
      type: String,
      required: [true, "Primary product image URL is required"],
      trim: true,
    },
    imagePublicId: {
      type: String,
      default: "",
      trim: true,
    },
    alt: {
      type: String,
      default: "",
      trim: true,
    },
    imagePosition: {
      type: String,
      default: "object-top",
      trim: true,
    },
    isLatestDrop: {
      type: Boolean,
      default: false,
    },
    isBestseller: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Active", "Draft", "Archived"],
      default: "Active",
    },
    // Level 1: Brand & Style ID
    brand: {
      type: String,
      default: "BUDDY VS BUFF",
      trim: true,
    },
    styleId: {
      type: String,
      default: "",
      trim: true,
    },
    // Level 2: Color Variants (Myntra Style-Color-SKU Architecture)
    variants: [variantSchema],
    colors: [variantSchema], // Backwards-compatible alias
    colorTags: {
      type: [String],
      default: [],
    },
    // Detailed copy & editorial specs
    copy: {
      summary: { type: String, default: "" },
      editorialHeadline: { type: String, default: "Designed for modern retail." },
      editorialBody: { type: String, default: "" },
      wholesaleRate: { type: String, default: "" },
      packRatio: { type: String, default: "1 : 2 : 2 : 2 : 1 (S–XXL)" },
      highlights: { type: [String], default: [] },
      specifications: [specificationItemSchema],
      sizeChartType: {
        type: String,
        enum: ["topwear", "bottomwear"],
        default: "topwear",
      },
      shippingTerms: [shippingTermSchema],
    },
    sizeChart: [sizeChartRowSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for ID matching slug/id used in frontend
productSchema.virtual("id").get(function () {
  return this.slug || this.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-");
});

// Auto-fill slug, styleId, and synchronize Level 2 Variants & Level 3 SKUs
productSchema.pre("save", function () {
  if (!this.slug && this.sku) {
    this.slug = this.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
  if (!this.styleId && this.sku) {
    this.styleId = this.sku;
  }
  if (!this.alt && this.name) {
    this.alt = `${this.name} ${this.sku}`;
  }

  // Synchronize variants and colors
  if (this.variants && this.variants.length > 0 && (!this.colors || this.colors.length === 0)) {
    this.colors = this.variants;
  } else if (this.colors && this.colors.length > 0 && (!this.variants || this.variants.length === 0)) {
    this.variants = this.colors;
  }

  const baseSku = this.sku || this.styleId || "SKU";
  const sizeList =
    Array.isArray(this.sizeList) && this.sizeList.length > 0
      ? this.sizeList
      : ["S", "M", "L", "XL", "XXL"];

  const normalizeVariant = (v) => {
    if (!v.color && v.name) v.color = v.name;
    if (!v.name && v.color) v.name = v.color;
    if (!v.colorCode && v.hex) v.colorCode = v.hex;
    if (!v.hex && v.colorCode) v.hex = v.colorCode;

    // Collect 5 photos from images or gallery
    const g = v.gallery || {};
    let imgs = Array.isArray(v.images) ? [...v.images].filter(Boolean) : [];
    if (imgs.length === 0) {
      imgs = [g.front || v.image, g.back, g.side, g.closeup, g.onModel].filter(Boolean);
    }
    if (imgs.length === 0 && (v.image || this.image)) {
      imgs = [v.image || this.image];
    }
    v.images = imgs;

    // Ensure 5-angle gallery is populated
    v.gallery = {
      front: g.front || imgs[0] || v.image || this.image || "",
      back: g.back || imgs[1] || "",
      side: g.side || imgs[2] || "",
      closeup: g.closeup || imgs[3] || "",
      onModel: g.onModel || imgs[4] || "",
    };
    v.image = v.gallery.front || imgs[0] || this.image || "";

    // Set prices if not custom overridden
    if (v.price === null || v.price === undefined) {
      v.price = this.wholesalePrice;
    }
    if (v.wholesalePrice === null || v.wholesalePrice === undefined) {
      v.wholesalePrice = this.wholesalePrice;
    }
    if (v.mrp === null || v.mrp === undefined) {
      v.mrp = this.retailPrice;
    }
    if (v.retailPrice === null || v.retailPrice === undefined) {
      v.retailPrice = this.retailPrice;
    }

    // Auto-generate Level 3 SKUs for each size if missing
    if (!v.skus || v.skus.length === 0) {
      const colCode = (v.color || "DEF").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
      v.skus = sizeList.map((sz) => ({
        sku: `${baseSku}-${colCode}-${sz}`.toUpperCase(),
        size: sz,
        stock: 25,
        status: "In Stock",
      }));
    }
  };

  if (Array.isArray(this.variants)) {
    this.variants.forEach(normalizeVariant);
    this.colors = this.variants;
  }
});

module.exports = mongoose.model("Product", productSchema);


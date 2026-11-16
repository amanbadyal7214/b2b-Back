const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const Product = require("../Model/ProductModel");

const SAMPLE_PRODUCTS = [
  {
    sku: "BVB-TEE-01",
    name: "Oversized Cotton Tee",
    slug: "bvb-tee-01",
    category: "tees",
    group: "Topwear",
    subcategory: "Drop-Shoulder Tees",
    subcategorySlug: "street-tees",
    fabric: "280 GSM Combed Jersey",
    gsm: "280 GSM",
    fit: "Oversized",
    availability: "Ready Stock",
    moqType: "Editable MOQ",
    moq: "Editable",
    wholesalePrice: 360,
    retailPrice: 999,
    sizes: "S – XXL",
    sizeList: ["S", "M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
    alt: "Model wearing warm ivory waffle oversized cotton tee",
    imagePosition: "object-top",
    isLatestDrop: true,
    isBestseller: true,
    colors: [
      {
        name: "Obsidian",
        hex: "#1F2422",
        tone: "Obsidian Black",
        image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-TEE-01-BLK",
      },
      {
        name: "Sage Moss",
        hex: "#889281",
        tone: "Sage & Olive",
        image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-TEE-01-SGE",
      },
      {
        name: "Warm Ivory",
        hex: "#ECEAE3",
        tone: "Warm Ivory",
        image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-TEE-01-IVR",
      },
    ],
    colorTags: ["Obsidian Black", "Sage & Olive", "Warm Ivory"],
    copy: {
      summary: "A contemporary menswear staple cut in 280 gsm combed jersey for clean retail merchandising. Relaxed shoulder geometry, reinforced twin-needle seams, and enzyme bio-wash finishing give every carton consistent floor-ready drape.",
      editorialHeadline: "Designed for modern retail.",
      editorialBody: "Crafted directly on our manufacturing floor in 280 GSM Combed Jersey, the Oversized Cotton Tee balances commercial volume appeal with atelier construction standards. Pre-shrunk fabric processing holds boxy proportions across washes, while clean tone-matched labelling arrives ready for boutique racks or partner private labeling.",
      wholesaleRate: "From ₹360 / pc",
      packRatio: "1 : 2 : 2 : 2 : 1 (S–XXL)",
      highlights: [
        "280 GSM Combed Jersey (280 GSM) mill-tested for low pilling and crisp hand feel",
        "Oversized fit silhouette block calibrated for repeat everyday demand",
        "MOQ Editable with flexible size ratio breakdown and GST-ready dispatch",
      ],
      specifications: [
        { label: "SKU Code", value: "BVB-TEE-01" },
        { label: "Category", value: "Topwear · Drop-Shoulder Tees" },
        { label: "Fabric & Weight", value: "280 GSM Combed Jersey (280 GSM)" },
        { label: "Silhouette Fit", value: "Oversized Fit" },
        { label: "Size Ratio Set", value: "S – XXL" },
        { label: "Minimum Order Qty", value: "Editable (Editable MOQ)" },
        { label: "Availability", value: "Ready Stock" },
        { label: "Origin & Billing", value: "Manufactured in India · GST Invoice Included" },
      ],
      sizeChartType: "topwear",
      shippingTerms: [
        {
          title: "Dispatch Lead Time",
          detail: "Ready Stock line ships within 48 business hours from order confirmation.",
        },
        {
          title: "Minimum Order & Carton Ratio",
          detail: "Minimum quantity is Editable. Size ratios can be adjusted per master carton for verified B2B stockists.",
        },
        {
          title: "Sample & Bulk Assurance",
          detail: "Verified buyers can order catalogue samples prior to carton booking. Manufacturing defect replacements covered within 7 days of delivery.",
        },
      ],
    },
    sizeChart: [
      { size: "S", chest: '42"', shoulder: '20.5"', length: '27.5"', sleeve: '8.5"' },
      { size: "M", chest: '44"', shoulder: '21.5"', length: '28.5"', sleeve: '9.0"' },
      { size: "L", chest: '46"', shoulder: '22.5"', length: '29.5"', sleeve: '9.5"' },
      { size: "XL", chest: '48"', shoulder: '23.5"', length: '30.5"', sleeve: '10.0"' },
      { size: "XXL", chest: '50"', shoulder: '24.5"', length: '31.0"', sleeve: '10.5"' },
    ],
  },
  {
    sku: "BVB-SHT-04",
    name: "Textured Casual Shirt",
    slug: "bvb-sht-04",
    category: "shirts",
    group: "Topwear",
    subcategory: "Summer Shirts",
    subcategorySlug: "summer-shirts",
    fabric: "220 GSM Slub Cotton-Linen",
    gsm: "220 GSM",
    fit: "Relaxed",
    availability: "Ready Stock",
    moqType: "Editable MOQ",
    moq: "Editable",
    wholesalePrice: 560,
    retailPrice: 1499,
    sizes: "M – XXL",
    sizeList: ["M", "L", "XL", "XXL"],
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
    alt: "Model wearing stone beige textured casual shirt",
    imagePosition: "object-top",
    isLatestDrop: true,
    isBestseller: true,
    colors: [
      {
        name: "Jet Black",
        hex: "#1E1E20",
        tone: "Obsidian Black",
        image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-SHT-04-BLK",
      },
      {
        name: "Sandstone",
        hex: "#A5927D",
        tone: "Warm Sand",
        image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-SHT-04-SND",
      },
      {
        name: "Bone",
        hex: "#EAE5DB",
        tone: "Warm Ivory",
        image: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-SHT-04-BON",
      },
    ],
    colorTags: ["Obsidian Black", "Warm Sand", "Warm Ivory"],
    copy: {
      summary: "A breathable slub cotton-linen shirt tailored for effortless resort layering and boutique retail sales.",
      editorialHeadline: "Tailored lightness for warm-weather retail.",
      editorialBody: "Engineered from a custom 220 GSM blend of slub cotton and breathable linen, the Textured Casual Shirt delivers premium tactile appeal and moisture control.",
      wholesaleRate: "From ₹560 / pc",
      packRatio: "1 : 2 : 2 : 1 (M–XXL)",
      highlights: [
        "220 GSM Slub Cotton-Linen pre-washed for vintage texture",
        "Camp-collar construction with mother-of-pearl finish buttons",
        "GST compliant invoices with fast door-to-door freight dispatch",
      ],
      specifications: [
        { label: "SKU Code", value: "BVB-SHT-04" },
        { label: "Category", value: "Topwear · Summer Shirts" },
        { label: "Fabric & Weight", value: "220 GSM Slub Cotton-Linen" },
        { label: "Silhouette Fit", value: "Relaxed Fit" },
        { label: "Size Ratio Set", value: "M – XXL" },
        { label: "Minimum Order Qty", value: "Editable (Editable MOQ)" },
        { label: "Availability", value: "Ready Stock" },
        { label: "Origin & Billing", value: "Manufactured in India · GST Invoice Included" },
      ],
      sizeChartType: "topwear",
      shippingTerms: [
        { title: "Dispatch Lead Time", detail: "Ready stock dispatches in 48 hours." },
        { title: "Carton Packaging", detail: "Poly-bagged per piece, packed in heavy-duty 5-ply cartons." },
      ],
    },
    sizeChart: [
      { size: "M", chest: '44"', shoulder: '21.5"', length: '28.5"', sleeve: '9.0"' },
      { size: "L", chest: '46"', shoulder: '22.5"', length: '29.5"', sleeve: '9.5"' },
      { size: "XL", chest: '48"', shoulder: '23.5"', length: '30.5"', sleeve: '10.0"' },
      { size: "XXL", chest: '50"', shoulder: '24.5"', length: '31.0"', sleeve: '10.5"' },
    ],
  },
  {
    sku: "BVB-HDY-02",
    name: "Essential Hoodie",
    slug: "bvb-hdy-02",
    category: "hoodies",
    group: "Topwear",
    subcategory: "Heavyweight Fleece",
    subcategorySlug: "heavy-fleece",
    fabric: "480 GSM Loopback Fleece",
    gsm: "480 GSM",
    fit: "Oversized",
    availability: "Ready Stock",
    moqType: "Editable MOQ",
    moq: "Editable",
    wholesalePrice: 890,
    retailPrice: 2499,
    sizes: "S – XL",
    sizeList: ["S", "M", "L", "XL"],
    image: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
    alt: "Model wearing warm sand heavyweight essential hoodie",
    imagePosition: "object-center",
    isLatestDrop: true,
    isBestseller: true,
    colors: [
      {
        name: "Pine Charcoal",
        hex: "#262B27",
        tone: "Charcoal & Slate",
        image: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-HDY-02-CHR",
      },
      {
        name: "Muted Olive",
        hex: "#7F877A",
        tone: "Sage & Olive",
        image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-HDY-02-OLV",
      },
      {
        name: "Warm Sand",
        hex: "#D6C6B2",
        tone: "Warm Sand",
        image: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-HDY-02-SND",
      },
    ],
    colorTags: ["Charcoal & Slate", "Sage & Olive", "Warm Sand"],
    copy: {
      summary: "Ultra-heavyweight 480 GSM fleece hoodie built for cold climates, luxury loungewear drops, and high-margin retail.",
      editorialHeadline: "Built heavyweight for luxury streetwear.",
      editorialBody: "Constructed from custom-milled 480 GSM loopback cotton fleece, this silhouette features dense double-layered hood construction without exterior drawstrings for a modern, architectural drape.",
      wholesaleRate: "From ₹890 / pc",
      packRatio: "1 : 2 : 2 : 1 (S–XL)",
      highlights: [
        "480 GSM 100% Cotton Loopback French Terry",
        "Double-walled hood with ribbed side panels",
        "Pre-shrunk enzyme bath ensuring zero shrinkage",
      ],
      specifications: [
        { label: "SKU Code", value: "BVB-HDY-02" },
        { label: "Category", value: "Topwear · Heavyweight Fleece" },
        { label: "Fabric & Weight", value: "480 GSM Loopback Fleece" },
        { label: "Silhouette Fit", value: "Oversized Fit" },
        { label: "Size Ratio Set", value: "S – XL" },
        { label: "Minimum Order Qty", value: "Editable (Editable MOQ)" },
        { label: "Availability", value: "Ready Stock" },
        { label: "Origin & Billing", value: "Manufactured in India · GST Invoice Included" },
      ],
      sizeChartType: "topwear",
      shippingTerms: [
        { title: "Dispatch Lead Time", detail: "48 hours ready dispatch." },
        { title: "Carton Specification", detail: "12 pcs master carton, barcoded packaging." },
      ],
    },
    sizeChart: [
      { size: "S", chest: '44"', shoulder: '21.5"', length: '27.5"', sleeve: '24.0"' },
      { size: "M", chest: '46"', shoulder: '22.5"', length: '28.5"', sleeve: '24.5"' },
      { size: "L", chest: '48"', shoulder: '23.5"', length: '29.5"', sleeve: '25.0"' },
      { size: "XL", chest: '50"', shoulder: '24.5"', length: '30.5"', sleeve: '25.5"' },
    ],
  },
  {
    sku: "BVB-TRS-08",
    name: "Relaxed Fit Trousers",
    slug: "bvb-trs-08",
    category: "bottomwear",
    group: "Bottomwear",
    subcategory: "Tailored Trousers",
    subcategorySlug: "trousers",
    fabric: "320 GSM Structured Twill",
    gsm: "320 GSM",
    fit: "Relaxed",
    availability: "Ready Stock",
    moqType: "Editable MOQ",
    moq: "Editable",
    wholesalePrice: 690,
    retailPrice: 1999,
    sizes: "28 – 36",
    sizeList: ["28", "30", "32", "34", "36"],
    image: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
    alt: "Model wearing olive khaki relaxed fit cargo trousers",
    imagePosition: "object-center",
    isLatestDrop: true,
    isBestseller: true,
    colors: [
      {
        name: "Obsidian",
        hex: "#1C1D1F",
        tone: "Obsidian Black",
        image: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-TRS-08-BLK",
      },
      {
        name: "Earth Taupe",
        hex: "#9B8977",
        tone: "Warm Sand",
        image: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-TRS-08-TPE",
      },
      {
        name: "Desert Sand",
        hex: "#D4C5B2",
        tone: "Warm Ivory",
        image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
        gallery: {
          front: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
          back: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
          side: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=900&q=80",
          closeup: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
          onModel: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
        },
        stockStatus: "Ready Stock",
        skuVariant: "BVB-TRS-08-SND",
      },
    ],
    colorTags: ["Obsidian Black", "Warm Sand", "Warm Ivory"],
    copy: {
      summary: "Modern pleat-front relaxed trousers crafted in structured 320 GSM cotton twill with an adjustable inner waistband.",
      editorialHeadline: "Everyday tailoring for the contemporary capsule.",
      editorialBody: "Engineered with a relaxed taper cut and deep front pleats, these trousers elevate everyday casualwear into sartorial B2B demand.",
      wholesaleRate: "From ₹690 / pc",
      packRatio: "1 : 2 : 2 : 2 : 1 (28–36)",
      highlights: [
        "320 GSM High-density cotton twill",
        "Deep reverse pleats with elasticated comfort back",
        "YKK metallic brass zipper and horn-tone button fastenings",
      ],
      specifications: [
        { label: "SKU Code", value: "BVB-TRS-08" },
        { label: "Category", value: "Bottomwear · Tailored Trousers" },
        { label: "Fabric & Weight", value: "320 GSM Structured Twill" },
        { label: "Silhouette Fit", value: "Relaxed Fit" },
        { label: "Size Ratio Set", value: "28 – 36" },
        { label: "Minimum Order Qty", value: "Editable (Editable MOQ)" },
        { label: "Availability", value: "Ready Stock" },
        { label: "Origin & Billing", value: "Manufactured in India · GST Invoice Included" },
      ],
      sizeChartType: "bottomwear",
      shippingTerms: [
        { title: "Dispatch Lead Time", detail: "Ready stock dispatches within 48 hours." },
        { title: "Sample Assurance", detail: "Sample units available for retail trial before bulk cartons." },
      ],
    },
    sizeChart: [
      { size: "28", waist: '29"', hip: '40"', thigh: '25.5"', length: '40.5"' },
      { size: "30", waist: '31"', hip: '42"', thigh: '26.5"', length: '41.0"' },
      { size: "32", waist: '33"', hip: '44"', thigh: '27.5"', length: '41.5"' },
      { size: "34", waist: '35"', hip: '46"', thigh: '28.5"', length: '42.0"' },
      { size: "36", waist: '37"', hip: '48"', thigh: '29.5"', length: '42.5"' },
    ],
  },
];

async function seedDatabase() {
  const rawMongoUri = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/B2B";
  const mongoUri = rawMongoUri.trim().replace(/;+$/, "");

  console.log(`[Seed] Connecting to MongoDB: ${mongoUri}`);

  try {
    await mongoose.connect(mongoUri);
    console.log("[Seed] Connected successfully to MongoDB");

    for (const prod of SAMPLE_PRODUCTS) {
      await Product.findOneAndUpdate(
        { sku: prod.sku },
        { $set: prod },
        { upsert: true, new: true }
      );
      console.log(`[Seed] Synced product: ${prod.sku} (${prod.name}) with ${prod.colors.length} color variants`);
    }

    const total = await Product.countDocuments();
    console.log(`[Seed] Completed! Database now contains ${total} wholesale products.`);
  } catch (err) {
    console.error("[Seed] Error executing product seed:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("[Seed] MongoDB connection closed.");
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { SAMPLE_PRODUCTS, seedDatabase };


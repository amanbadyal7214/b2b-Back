const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const userRoutes = require("./Routes/Userroute");
const adminRoutes = require("./Routes/Adminroute");
const categoryRoutes = require("./Routes/Categoryroute");
const productTypeRoutes = require("./Routes/ProductTyperoute");
const sizeRoutes = require("./Routes/Sizeroute");
const colorRoutes = require("./Routes/Colorroute");
const fitRoutes = require("./Routes/Fitroute");
const fabricRoutes = require("./Routes/Fabricroute");
const moqRoutes = require("./Routes/Moqroute");
const productRoutes = require("./Routes/Productroute");
const cartRoutes = require("./Routes/Cartroute");
const wishlistRoutes = require("./Routes/Wishlistroute");
const pincodeRoutes = require("./Routes/Pincoderoute");
const checkoutRoutes = require("./Routes/Checkoutroute");
const orderRoutes = require("./Routes/Orderroute");
const paymentRoutes = require("./Routes/Paymentroute");
const inventoryRoutes = require("./Routes/Inventoryroute");
const featuredCollectionRoutes = require("./Routes/FeaturedCollectionroute");
const { autoSeedPincodesIfEmpty } = require("./Controller/Pincodecontroller");
const { bootstrapAllProductsInventory } = require("./Services/inventoryService");
const { startStockLockCron } = require("./Jobs/stockLockCron");
const StockLock = require("./Model/StockLockModel");

const app = express();

// CORS setup
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-guest-id", "X-Guest-Id"],
  })
);

// Body parser
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));

// Static uploads directory for lookbook PDFs and media
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Service status & endpoint map
app.get("/", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.json({
    status: "Online",
    database: isDbConnected ? "Connected" : "Disconnected",
    service: "Buddy Vs Buff B2B Wholesale API",
    version: "2.4.0-LUX",
    endpoints: {
      adminAccess: "POST /api/admin-access or POST /api/admin/access",
      adminProfile: "GET /api/admin/profile (Requires Bearer token)",
      users: "POST /api/users/register, POST /api/users/login",
      categories: "GET, POST, PUT, DELETE /api/categories",
      productTypes: "GET, POST, PUT, DELETE /api/product-types",
      sizes: "GET, POST, PUT, DELETE /api/sizes (Seed: POST /api/sizes/seed)",
    },
  });
});

app.get("/health", (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? "Healthy" : "Degraded",
    database: isDbConnected ? "Connected" : "Disconnected",
    readyState: mongoose.connection.readyState,
  });
});

// Database readiness check for API routes
app.use("/api", (req, res, next) => {
  // If MongoDB is disconnected (0) or disconnecting (3), fail fast with clear message
  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    return res.status(503).json({
      success: false,
      message: "Database connection unavailable. MongoDB is not connected.",
      error: "MongoDB connection is disconnected. Please ensure MongoDB service is running.",
    });
  }
  next();
});

// Admin Routes (Directly supports /api/admin-access, /api/admin/access, etc.)
app.use("/api/admin", adminRoutes);
app.use("/api", adminRoutes);

// User & Retailer Routes
app.use("/api/users", userRoutes);
app.use("/api/user", userRoutes);
app.use("/api/retailers", userRoutes);
app.use("/api/retailer", userRoutes);

// Product Category Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/category", categoryRoutes);

// Featured Collections & Product Reels Routes
app.use("/api/featured-collections", featuredCollectionRoutes);
app.use("/api/featured-collection", featuredCollectionRoutes);
app.use("/api/collections/featured", featuredCollectionRoutes);
app.use("/api/reels", featuredCollectionRoutes);

// Product Type Routes
app.use("/api/product-types", productTypeRoutes);
app.use("/api/product-type", productTypeRoutes);

// Product Size Routes
app.use("/api/sizes", sizeRoutes);
app.use("/api/size", sizeRoutes);

// Product Color Routes
app.use("/api/colors", colorRoutes);
app.use("/api/color", colorRoutes);
app.use("/api/colours", colorRoutes);
app.use("/api/colour", colorRoutes);

// Product Fit Routes
app.use("/api/fits", fitRoutes);
app.use("/api/fit", fitRoutes);

// Product Fabric & GSM Routes
app.use("/api/fabrics", fabricRoutes);
app.use("/api/fabric", fabricRoutes);
app.use("/api/fabric-gsm", fabricRoutes);

// Product MOQ & Pack Type Routes
app.use("/api/moq-types", moqRoutes);
app.use("/api/moq-type", moqRoutes);
app.use("/api/moqs", moqRoutes);
app.use("/api/moq", moqRoutes);
app.use("/api/pack-types", moqRoutes);
app.use("/api/pack-type", moqRoutes);

// Wholesale Products Catalog & Variant Routes
app.use("/api/products", productRoutes);
app.use("/api/product", productRoutes);

// Shopping Bag (Cart) & Wishlist Routes (Myntra SKU & Style architecture)
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);

// Serviceable Pincodes & Delivery Network Routes
app.use("/api/pincodes", pincodeRoutes);
app.use("/api/pincode", pincodeRoutes);

// Checkout, Order & Payment Routes (Full e-commerce flow: Add to Cart -> Order Placed)
app.use("/api/checkout", checkoutRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payment", paymentRoutes);

// SKU Inventory Management, Stock Locks, Audit Movements & Multi-Warehouse Routes
app.use("/api/inventory", inventoryRoutes);
app.use("/api/warehouses", inventoryRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
      code: err.code,
      field: err.field,
    });
  }
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// MongoDB Connection & Lifecycle
const rawMongoUri = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/B2B";
let mongoUri = rawMongoUri.trim().replace(/;+$/, "");

// Normalize localhost to 127.0.0.1 to avoid IPv6 (::1) lookup timeouts on Node.js 18+ Windows
if (mongoUri.includes("localhost:27017")) {
  mongoUri = mongoUri.replace("localhost:27017", "127.0.0.1:27017");
}

mongoose.connection.on("connected", async () => {
  console.log(`[Database] MongoDB connected successfully to ${mongoUri.replace(/:([^:@]{4})[^:@]*@/, ":****@")}`);
  autoSeedPincodesIfEmpty();

  // Migrate away from legacy TTL index on StockLock.expiresAt so cron releases reserved stock safely
  try {
    const indexes = await StockLock.collection.indexes();
    const ttlIdx = indexes.find(
      (idx) => idx.key && idx.key.expiresAt === 1 && idx.expireAfterSeconds !== undefined
    );
    if (ttlIdx) {
      await StockLock.collection.dropIndex(ttlIdx.name);
      await StockLock.collection.createIndex({ expiresAt: 1 });
      console.log("[Inventory] Migrated StockLock.expiresAt from TTL index to standard cron index.");
    }
  } catch (idxErr) {
    // Collection may not exist yet; safe to ignore
  }

  // Bootstrap default warehouse & sync any unindexed catalog SKUs into Inventory
  bootstrapAllProductsInventory()
    .then((res) => {
      console.log(`[Inventory] Ready: ${res.skusSynced} SKU(s) synced across ${res.productsCount} product(s).`);
    })
    .catch((err) => {
      console.warn("[Inventory] Bootstrap note:", err.message);
    });

  // Start automatic 60-second lock expiry cron job
  startStockLockCron(60 * 1000);
});

mongoose.connection.on("error", (err) => {
  console.error("[Database] MongoDB connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("[Database] MongoDB connection disconnected.");
});

mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("[Database] Initial MongoDB connection established.");
  })
  .catch((err) => {
    console.error("[Database] Failed to establish initial MongoDB connection:", err.message);
    console.error("[Database] Ensure MongoDB service is running locally on port 27017 or verify MONGO_URL in Backend/.env");
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] BVB Backend API is running on http://localhost:${PORT}`);
});

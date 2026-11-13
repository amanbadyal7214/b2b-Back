const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const userRoutes = require("./Routes/Userroute");
const adminRoutes = require("./Routes/Adminroute");
const categoryRoutes = require("./Routes/Categoryroute");
const productTypeRoutes = require("./Routes/ProductTyperoute");

const app = express();

// CORS setup
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parser
app.use(express.json());

// Service status & endpoint map
app.get("/", (req, res) => {
  res.json({
    status: "Online",
    service: "Buddy Vs Buff B2B Wholesale API",
    version: "2.4.0-LUX",
    endpoints: {
      adminAccess: "POST /api/admin-access or POST /api/admin/access",
      adminProfile: "GET /api/admin/profile (Requires Bearer token)",
      users: "POST /api/users/register, POST /api/users/login",
      categories: "GET, POST, PUT, DELETE /api/categories",
      productTypes: "GET, POST, PUT, DELETE /api/product-types",
    },
  });
});

// Admin Routes (Directly supports /api/admin-access, /api/admin/access, etc.)
app.use("/api/admin", adminRoutes);
app.use("/api", adminRoutes);

// User Routes
app.use("/api/users", userRoutes);

// Product Category Routes
app.use("/api/categories", categoryRoutes);
app.use("/api/category", categoryRoutes);

// Product Type Routes
app.use("/api/product-types", productTypeRoutes);
app.use("/api/product-type", productTypeRoutes);

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
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// MongoDB Connection
const rawMongoUri = process.env.MONGO_URL || "mongodb://localhost:27017/B2B";
const mongoUri = rawMongoUri.trim().replace(/;+$/, "");

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("Connected to MongoDB successfully");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err.message);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

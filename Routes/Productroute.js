const express = require("express");
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  seedProducts,
} = require("../Controller/Productcontroller");
const { upload } = require("../Config/cloudinary");

// Seeding endpoint (GET or POST)
router.get("/seed", seedProducts);
router.post("/seed", seedProducts);

// Standard Product endpoints
router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", upload.single("image"), createProduct);
router.put("/:id", upload.single("image"), updateProduct);
router.delete("/:id", deleteProduct);

module.exports = router;


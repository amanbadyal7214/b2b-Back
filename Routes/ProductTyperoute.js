const express = require("express");
const router = express.Router();
const {
  getProductTypes,
  getProductTypeById,
  createProductType,
  updateProductType,
  deleteProductType,
} = require("../Controller/ProductTypecontroller");

// Product Type CRUD endpoints
router.get("/", getProductTypes);
router.get("/:id", getProductTypeById);
router.post("/", createProductType);
router.put("/:id", updateProductType);
router.delete("/:id", deleteProductType);

module.exports = router;


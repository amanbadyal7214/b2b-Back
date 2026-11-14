const express = require("express");
const router = express.Router();
const sizeController = require("../Controller/Sizecontroller");

// Seed standard sizes
router.post("/seed", sizeController.seedSizes);

// Standard CRUD
router.get("/", sizeController.getSizes);
router.post("/", sizeController.createSize);
router.get("/:id", sizeController.getSizeById);
router.put("/:id", sizeController.updateSize);
router.delete("/:id", sizeController.deleteSize);

module.exports = router;


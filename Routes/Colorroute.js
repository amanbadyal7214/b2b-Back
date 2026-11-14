const express = require("express");
const router = express.Router();
const colorController = require("../Controller/Colorcontroller");

// Base: /api/colors
router.get("/", colorController.getColors);
router.get("/:id", colorController.getColorById);
router.post("/", colorController.createColor);
router.put("/:id", colorController.updateColor);
router.delete("/:id", colorController.deleteColor);
router.patch("/:id/status", colorController.toggleColorStatus);

module.exports = router;


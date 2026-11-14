const express = require("express");
const router = express.Router();
const fabricController = require("../Controller/Fabriccontroller");

// Base: /api/fabrics
router.get("/", fabricController.getFabrics);
router.get("/:id", fabricController.getFabricById);
router.post("/", fabricController.createFabric);
router.put("/:id", fabricController.updateFabric);
router.delete("/:id", fabricController.deleteFabric);
router.patch("/:id/status", fabricController.toggleFabricStatus);

module.exports = router;


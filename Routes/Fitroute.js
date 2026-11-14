const express = require("express");
const router = express.Router();
const fitController = require("../Controller/Fitcontroller");

// Base: /api/fits
router.get("/", fitController.getFits);
router.get("/:id", fitController.getFitById);
router.post("/", fitController.createFit);
router.put("/:id", fitController.updateFit);
router.delete("/:id", fitController.deleteFit);
router.patch("/:id/status", fitController.toggleFitStatus);

module.exports = router;


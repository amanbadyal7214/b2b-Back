const express = require("express");
const router = express.Router();
const moqController = require("../Controller/Moqcontroller");

// Base: /api/moq-types
router.get("/", moqController.getMoqs);
router.get("/:id", moqController.getMoqById);
router.post("/", moqController.createMoq);
router.put("/:id", moqController.updateMoq);
router.delete("/:id", moqController.deleteMoq);
router.patch("/:id/status", moqController.toggleMoqStatus);

module.exports = router;


const express = require("express");
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../Controller/Categorycontroller");
const { upload } = require("../Config/cloudinary");

// Category REST endpoints with image upload support
router.get("/", getCategories);
router.post("/", upload.single("image"), createCategory);
router.put("/:id", upload.single("image"), updateCategory);
router.delete("/:id", deleteCategory);

module.exports = router;


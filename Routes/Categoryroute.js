const express = require("express");
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../Controller/Categorycontroller");
const { upload } = require("../Config/cloudinary");

const categoryUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
  { name: "cataloguePdf", maxCount: 1 },
]);

// Category REST endpoints with image & catalogue PDF upload support
router.get("/", getCategories);
router.post("/", categoryUpload, createCategory);
router.put("/:id", categoryUpload, updateCategory);
router.delete("/:id", deleteCategory);

module.exports = router;


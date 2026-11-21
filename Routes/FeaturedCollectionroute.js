const express = require("express");
const router = express.Router();
const {
  getFeaturedCollections,
  getFeaturedCollectionById,
  createFeaturedCollection,
  updateFeaturedCollection,
  deleteFeaturedCollection,
  seedFeaturedCollections,
} = require("../Controller/FeaturedCollectioncontroller");
const { upload } = require("../Config/cloudinary");

const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "poster", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

// Featured Collection REST endpoints
router.get("/", getFeaturedCollections);
router.get("/:id", getFeaturedCollectionById);
router.post("/seed", seedFeaturedCollections);
router.post("/", uploadFields, createFeaturedCollection);
router.put("/:id", uploadFields, updateFeaturedCollection);
router.delete("/:id", deleteFeaturedCollection);

module.exports = router;

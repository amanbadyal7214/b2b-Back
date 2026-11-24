const express = require("express");
const router = express.Router();
const { getOurStory, updateOurStory } = require("../Controller/OurStorycontroller");
const { upload } = require("../Config/cloudinary");

// Public endpoint to read story content
router.get("/", getOurStory);

// Admin update endpoints supporting optional image file upload
router.put("/", upload.single("image"), updateOurStory);
router.post("/", upload.single("image"), updateOurStory);

module.exports = router;

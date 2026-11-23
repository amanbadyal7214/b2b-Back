const express = require("express");
const router = express.Router();
const {
  getBlogs,
  getBlogBySlug,
  getBlogCategories,
  getFeaturedBlogs,
  getAdminBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
  togglePublishBlog,
} = require("../Controller/Blogcontroller");

// Public endpoints
router.get("/", getBlogs);
router.get("/featured", getFeaturedBlogs);
router.get("/categories", getBlogCategories);
router.get("/admin/all", getAdminBlogs);
router.get("/:slug", getBlogBySlug);

// Admin / editorial endpoints
router.post("/", createBlog);
router.put("/:id", updateBlog);
router.delete("/:id", deleteBlog);
router.patch("/:id/toggle-publish", togglePublishBlog);

module.exports = router;

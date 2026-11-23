const Blog = require("../Model/BlogModel");

// Helper to generate a clean URL-friendly slug
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// Seed articles for initial launch if collection is empty
const INITIAL_BLOGS = [
  {
    title: "The Economics of 240 GSM Luxury Tees: Why High-GSM Knits Double Retailer Sell-Through",
    slug: "economics-of-240-gsm-luxury-tees",
    excerpt:
      "Modern streetwear boutiques are phasing out 180 GSM carded cotton. Discover why 240+ GSM combed single jersey commands 2.4x higher retail margins with zero return rates.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80",
    category: "Fabric & GSM",
    tags: ["240 GSM", "Streetwear", "Single Jersey", "Retail Margins"],
    author: {
      name: "BVB Textile Technologist",
      role: "Lead Fabric Engineer, Tiruppur Mill",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    },
    readingTime: 5,
    status: "published",
    featured: true,
    views: 428,
    contentHtml: `
      <h2>The Shift Towards Heavyweight Streetwear Knits</h2>
      <p>Over the last decade, Indian fast-fashion retail was dominated by 160–180 GSM carded cotton. While cost-effective for promotional campaigns, lightweight knits suffer from high shrinkage, collar curling after 2 washes, and poor drape.</p>
      
      <p>Today, Gen-Z and millennial streetwear consumers demand structured, boxy silhouettes that hold shape throughout the day. This has made <strong>240 GSM 100% Ring-Spun Combed Cotton</strong> the gold standard for independent retail boutiques.</p>

      <blockquote>"When a customer touches a 240 GSM garment on the rack, the tactile weight immediately communicates luxury worth ₹1,299 to ₹1,799 retail prices."</blockquote>

      <h3>1. Dimensional Stability & Zero Collar Curl</h3>
      <p>Buddy Vs Buff blank tees utilize high-density circular knitting with 24-gauge compact yarn. We pair this with 1x1 heavy lycra ribbed collars (320 GSM) with twin-needle reinforced edge-stitching, ensuring the neckline never warps or sags.</p>

      <h3>2. The Retail Math: Markup Comparison</h3>
      <ul>
        <li><strong>Standard 180 GSM Tee:</strong> Factory wholesale ₹180 → Retail selling price ₹499 → Gross Profit ₹319</li>
        <li><strong>BVB 240 GSM Atelier Tee:</strong> Factory wholesale ₹340 → Retail selling price ₹1,299 → Gross Profit ₹959 (300% Margin Increase)</li>
      </ul>

      <p>By upgrading your store’s basic tier to genuine heavyweight fabrics, boutique stockists reduce customer return rates to under 0.6% and cultivate high repeat store visits.</p>
    `,
  },
  {
    title: "Eliminating the Middleman: How Tiruppur Direct Sourcing Protects Boutique Margins",
    slug: "eliminating-middleman-tiruppur-direct-sourcing",
    excerpt:
      "Traditional multi-tier wholesale layers siphon up to 42% of clothing value before goods reach retailer racks. Here is how mill-direct manufacturing unlocks factory prices.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=80",
    category: "Wholesale Economics",
    tags: ["Supply Chain", "Factory Direct", "Tiruppur", "Trade Pass"],
    author: {
      name: "Karan Mehta",
      role: "Head of Retail Partnerships",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
    },
    readingTime: 4,
    status: "published",
    featured: false,
    views: 312,
    contentHtml: `
      <h2>The Traditional 4-Layer Wholesale Friction</h2>
      <p>For decades, boutique owners in tier-1 and tier-2 cities travelled to regional wholesale mandis like Gandhi Nagar (Delhi) or Surat. In this legacy pipeline, garments pass through multiple hands:</p>
      <ol>
        <li>Spinning & Knitting Mill (Tiruppur/Ludhiana)</li>
        <li>Commission Agent / Buying House (+8-12%)</li>
        <li>State Wholesaler / Stockist (+15-18%)</li>
        <li>City Sub-Distributor (+10-15%)</li>
      </ol>
      <p>By the time a basic cotton hoodie reached the retail rack, each layer had added transit delays, markup, and broken size ratios.</p>

      <h2>The BVB Direct-to-Boutique Pipeline</h2>
      <p>Buddy Vs Buff establishes a direct bridge between our Tiruppur knitting mills and your store counter. Through the Retailer Trade Pass portal, verified shop owners access unified GST invoicing, factory wholesale rates, and guaranteed 48-hour dispatch.</p>

      <h3>Key Advantages for Verified Stockists</h3>
      <ul>
        <li><strong>Single Consolidated Invoice:</strong> Fully compliant GSTR-1 input tax credit on every purchase.</li>
        <li><strong>No Minimum 500-Pc Commitments:</strong> Order 15 to 30 pcs per style pack with perfect size breakdowns.</li>
        <li><strong>Deadstock Protection:</strong> Low MOQ test drops allow you to gauge local footfall response before placing bulk repeat reorders.</li>
      </ul>
    `,
  },
  {
    title: "Pre-Pack Sizing Ratios Explained: S:M:L:XL:2XL Assortment Math for Modern Boutiques",
    slug: "pre-pack-sizing-ratios-explained-b2b-math",
    excerpt:
      "Avoid dead stock on extreme sizes. Master how 1:2:2:2:1 size distribution matches actual Indian streetwear demographic sales data.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1200&q=80",
    category: "Sizing & Pack Ratios",
    tags: ["Inventory Management", "Size Ratios", "B2B Ordering", "Deadstock"],
    author: {
      name: "Sneha Varma",
      role: "Merchandising Director",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
    },
    readingTime: 4,
    status: "published",
    featured: false,
    views: 289,
    contentHtml: `
      <h2>Why Unbalanced Size Ordering Causes Dead Inventory</h2>
      <p>Every fashion retailer dreads the clearance rack filled with leftover XS or 3XL sizes that lock up valuable store working capital. In standard wholesale, sellers often force arbitrary ratios that favor mill production rather than store sales reality.</p>

      <h2>The Golden 1:2:2:2:1 Streetwear Distribution</h2>
      <p>Based on aggregated point-of-sale data across 500+ BVB boutique partners in India, the optimal size distribution for oversized and relaxed fit streetwear is:</p>
      <ul>
        <li><strong>Small (S):</strong> 12.5% (Ratio 1) — Young teen demographic or fitted aesthetic</li>
        <li><strong>Medium (M):</strong> 25% (Ratio 2) — High turnover standard sizing</li>
        <li><strong>Large (L):</strong> 25% (Ratio 2) — #1 most requested oversized fit</li>
        <li><strong>Extra Large (XL):</strong> 25% (Ratio 2) — Loose street drape</li>
        <li><strong>Double XL (2XL):</strong> 12.5% (Ratio 1) — Big & tall clientele</li>
      </ul>

      <p>All Buddy Vs Buff master wholesale carton packs are pre-assorted in this exact ratio, ensuring your inventory sells through uniformly across the entire rack without stranded singles.</p>
    `,
  },
  {
    title: "Loopback vs Fleece: Curating Winter Hoodies with 380 GSM Heavyweight Terry",
    slug: "loopback-vs-fleece-curating-winter-hoodies-380-gsm",
    excerpt:
      "Understand the technical difference between brushed fleece and unbrushed French terry loopback knit, and why luxury boutiques choose loopback for all-weather luxury.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1200&q=80",
    category: "Fabric & GSM",
    tags: ["380 GSM", "French Terry", "Winter Wear", "Hoodies"],
    author: {
      name: "BVB Textile Technologist",
      role: "Lead Fabric Engineer, Tiruppur Mill",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
    },
    readingTime: 6,
    status: "published",
    featured: true,
    views: 519,
    contentHtml: `
      <h2>The Anatomy of 380 GSM French Terry Loopback</h2>
      <p>When selecting winter and transition-season outerwear for your retail store, fabric choice dictates whether a hoodie looks like budget loungewear or high-end designer apparel.</p>

      <h3>Brushed Fleece vs Unbrushed Loopback</h3>
      <p><strong>Brushed fleece</strong> involves shearing loop yarns to create a fuzzy interior. While initially soft, cheap fleece sheds lint onto undergarments, pills quickly, and traps sweat.</p>

      <p><strong>Unbrushed French Terry Loopback</strong>, on the other hand, preserves the circular knitting loop loops on the reverse side. This creates natural micro air pockets for thermoregulation, high breathability, and exceptional drape.</p>

      <h3>Key Specs of BVB Heavyweight Hoodies:</h3>
      <ul>
        <li><strong>Fabric Weight:</strong> 380–400 GSM genuine heavyweight cotton-poly blend for shape retention</li>
        <li><strong>Hood Construction:</strong> Double-layered 3-panel hood that stands upright without collapsing</li>
        <li><strong>Drawstrings:</strong> Heavy braided flat cords with gunmetal aglets</li>
        <li><strong>Pocket Reinforcement:</strong> Bar-tacked stress points on kangaroo pouch corners</li>
      </ul>
    `,
  },
];

// Seed on demand helper
const ensureSeedData = async () => {
  try {
    const count = await Blog.countDocuments();
    if (count === 0) {
      await Blog.insertMany(INITIAL_BLOGS);
      console.log("Seeded initial editorial blog articles successfully.");
    }
  } catch (err) {
    console.error("Error seeding initial blog articles:", err.message);
  }
};

/**
 * PUBLIC: Get Published Blogs with Search, Category & Pagination
 * GET /api/blogs
 */
exports.getBlogs = async (req, res) => {
  try {
    await ensureSeedData();

    const {
      search,
      category,
      tag,
      status = "published",
      featured,
      page = 1,
      limit = 12,
      sort = "publishedAt",
    } = req.query;

    const query = {};

    // For public frontend, enforce published only
    if (status && status !== "all") {
      query.status = status;
    }

    if (category && category !== "All") {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }

    if (tag) {
      query.tags = { $in: [tag] };
    }

    if (featured === "true" || featured === true) {
      query.featured = true;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { title: searchRegex },
        { excerpt: searchRegex },
        { category: searchRegex },
        { tags: { $in: [searchRegex] } },
      ];
    }

    const currentPage = Math.max(1, parseInt(page, 10));
    const itemsPerPage = Math.max(1, parseInt(limit, 10));
    const skip = (currentPage - 1) * itemsPerPage;

    const sortOrder = sort === "views" ? { views: -1 } : { publishedAt: -1, createdAt: -1 };

    const [blogs, total] = await Promise.all([
      Blog.find(query).sort(sortOrder).skip(skip).limit(itemsPerPage).lean(),
      Blog.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: blogs,
      total,
      page: currentPage,
      totalPages: Math.ceil(total / itemsPerPage) || 1,
    });
  } catch (error) {
    console.error("getBlogs Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch editorial articles",
      error: error.message,
    });
  }
};

/**
 * PUBLIC: Get Single Blog by Slug with View Increment
 * GET /api/blogs/:slug
 */
exports.getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    // Increment view count atomically
    const blog = await Blog.findOneAndUpdate(
      { slug: slug.toLowerCase().trim() },
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Fetch up to 3 related articles in the same category or latest
    const relatedBlogs = await Blog.find({
      _id: { $ne: blog._id },
      status: "published",
      $or: [{ category: blog.category }, { featured: true }],
    })
      .sort({ publishedAt: -1 })
      .limit(3)
      .lean();

    return res.status(200).json({
      success: true,
      data: blog,
      related: relatedBlogs,
    });
  } catch (error) {
    console.error("getBlogBySlug Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load article detail",
      error: error.message,
    });
  }
};

/**
 * PUBLIC: Get Blog Categories with Article Count
 * GET /api/blogs/categories
 */
exports.getBlogCategories = async (req, res) => {
  try {
    await ensureSeedData();

    const categories = await Blog.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const formatted = categories.map((cat) => ({
      name: cat._id || "General",
      count: cat.count,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error("getBlogCategories Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch blog categories",
      error: error.message,
    });
  }
};

/**
 * PUBLIC: Get Featured Blogs
 * GET /api/blogs/featured
 */
exports.getFeaturedBlogs = async (req, res) => {
  try {
    await ensureSeedData();

    let featured = await Blog.find({ status: "published", featured: true })
      .sort({ publishedAt: -1 })
      .limit(4)
      .lean();

    if (!featured || featured.length === 0) {
      featured = await Blog.find({ status: "published" })
        .sort({ views: -1, publishedAt: -1 })
        .limit(4)
        .lean();
    }

    return res.status(200).json({
      success: true,
      data: featured,
    });
  } catch (error) {
    console.error("getFeaturedBlogs Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch featured articles",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Get All Blogs (Drafts + Published) with stats
 * GET /api/blogs/admin/all
 */
exports.getAdminBlogs = async (req, res) => {
  try {
    await ensureSeedData();

    const { search, category, status } = req.query;
    const filter = {};

    if (status && status !== "ALL") {
      filter.status = status;
    }

    if (category && category !== "ALL") {
      filter.category = category;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { title: searchRegex },
        { slug: searchRegex },
        { category: searchRegex },
        { tags: { $in: [searchRegex] } },
      ];
    }

    const [blogs, totalArticles, publishedCount, draftCount, totalViewsAgg] = await Promise.all([
      Blog.find(filter).sort({ createdAt: -1 }).lean(),
      Blog.countDocuments(),
      Blog.countDocuments({ status: "published" }),
      Blog.countDocuments({ status: "draft" }),
      Blog.aggregate([{ $group: { _id: null, totalViews: { $sum: "$views" } } }]),
    ]);

    const totalViews = totalViewsAgg.length > 0 ? totalViewsAgg[0].totalViews : 0;

    return res.status(200).json({
      success: true,
      data: blogs,
      stats: {
        totalArticles,
        publishedCount,
        draftCount,
        totalViews,
      },
    });
  } catch (error) {
    console.error("getAdminBlogs Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin articles",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Create New Blog
 * POST /api/blogs
 */
exports.createBlog = async (req, res) => {
  try {
    const {
      title,
      slug: customSlug,
      excerpt,
      contentHtml,
      coverImageUrl,
      category = "Fabric & GSM",
      tags = [],
      author = {},
      status = "published",
      featured = false,
      linkedProductIds = [],
    } = req.body;

    if (!title || !contentHtml || !excerpt) {
      return res.status(400).json({
        success: false,
        message: "Title, excerpt, and contentHtml are required",
      });
    }

    // Generate or clean slug
    let baseSlug = customSlug ? slugify(customSlug) : slugify(title);
    if (!baseSlug) {
      baseSlug = `article-${Date.now()}`;
    }

    // Check for duplicate slug and resolve if needed
    let finalSlug = baseSlug;
    let counter = 1;
    while (await Blog.findOne({ slug: finalSlug })) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Calculate reading time automatically
    const textOnly = contentHtml.replace(/<[^>]*>?/gm, " ");
    const words = textOnly.trim().split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(words / 200));

    const newBlog = new Blog({
      title: title.trim(),
      slug: finalSlug,
      excerpt: excerpt.trim(),
      contentHtml,
      coverImageUrl:
        coverImageUrl ||
        "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=80",
      category: category.trim(),
      tags: Array.isArray(tags)
        ? tags
        : typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      author: {
        name: author.name || "Buddy Vs Buff Textile Lab",
        role: author.role || "Senior Fabric Technologist",
        avatar:
          author.avatar ||
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
      },
      readingTime,
      status: status === "draft" ? "draft" : "published",
      featured: Boolean(featured),
      linkedProductIds: Array.isArray(linkedProductIds) ? linkedProductIds : [],
      publishedAt: status === "published" ? new Date() : null,
    });

    await newBlog.save();

    return res.status(201).json({
      success: true,
      message: "Article published successfully",
      data: newBlog,
    });
  } catch (error) {
    console.error("createBlog Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create article",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Update Existing Blog
 * PUT /api/blogs/:id
 */
exports.updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug: customSlug,
      excerpt,
      contentHtml,
      coverImageUrl,
      category,
      tags,
      author,
      status,
      featured,
      linkedProductIds,
    } = req.body;

    const existingBlog = await Blog.findById(id);
    if (!existingBlog) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    if (title) existingBlog.title = title.trim();
    if (excerpt) existingBlog.excerpt = excerpt.trim();
    if (contentHtml) {
      existingBlog.contentHtml = contentHtml;
      // Recompute reading time
      const textOnly = contentHtml.replace(/<[^>]*>?/gm, " ");
      const words = textOnly.trim().split(/\s+/).filter(Boolean).length;
      existingBlog.readingTime = Math.max(1, Math.ceil(words / 200));
    }
    if (coverImageUrl) existingBlog.coverImageUrl = coverImageUrl;
    if (category) existingBlog.category = category.trim();

    if (tags !== undefined) {
      existingBlog.tags = Array.isArray(tags)
        ? tags
        : typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
    }

    if (author) {
      existingBlog.author = {
        name: author.name || existingBlog.author.name,
        role: author.role || existingBlog.author.role,
        avatar: author.avatar || existingBlog.author.avatar,
      };
    }

    if (status && ["draft", "published"].includes(status)) {
      if (existingBlog.status !== "published" && status === "published" && !existingBlog.publishedAt) {
        existingBlog.publishedAt = new Date();
      }
      existingBlog.status = status;
    }

    if (featured !== undefined) {
      existingBlog.featured = Boolean(featured);
    }

    if (linkedProductIds !== undefined) {
      existingBlog.linkedProductIds = Array.isArray(linkedProductIds) ? linkedProductIds : [];
    }

    // Handle slug update if requested
    if (customSlug) {
      const cleanSlug = slugify(customSlug);
      if (cleanSlug && cleanSlug !== existingBlog.slug) {
        const slugExists = await Blog.findOne({ slug: cleanSlug, _id: { $ne: id } });
        if (slugExists) {
          return res.status(400).json({
            success: false,
            message: "Slug already exists. Please choose a unique URL slug.",
          });
        }
        existingBlog.slug = cleanSlug;
      }
    }

    await existingBlog.save();

    return res.status(200).json({
      success: true,
      message: "Article updated successfully",
      data: existingBlog,
    });
  } catch (error) {
    console.error("updateBlog Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update article",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Toggle Publish / Draft
 * PATCH /api/blogs/:id/toggle-publish
 */
exports.togglePublishBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    const nextStatus = blog.status === "published" ? "draft" : "published";
    blog.status = nextStatus;
    if (nextStatus === "published" && !blog.publishedAt) {
      blog.publishedAt = new Date();
    }

    await blog.save();

    return res.status(200).json({
      success: true,
      message: `Article is now ${nextStatus}`,
      data: blog,
    });
  } catch (error) {
    console.error("togglePublishBlog Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle article status",
      error: error.message,
    });
  }
};

/**
 * ADMIN: Delete Blog
 * DELETE /api/blogs/:id
 */
exports.deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Blog.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Article deleted permanently",
      data: deleted,
    });
  } catch (error) {
    console.error("deleteBlog Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete article",
      error: error.message,
    });
  }
};

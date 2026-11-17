const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../Model/UserModel");

/**
 * Helper to compute discount tier and assigned slab from order volume string
 */
const calculateSlabAndTier = (orderVolume = "") => {
  if (!orderVolume) {
    return {
      assignedSlab: "",
      slabTag: "",
      rebatePercent: 0,
    };
  }
  const vol = String(orderVolume).toLowerCase();
  if (vol.includes("150") || vol.includes("stockist")) {
    return {
      assignedSlab: "Stockist Direct · 12% + Free Freight",
      slabTag: "150+ PCS / ORDER",
      rebatePercent: 12,
    };
  }
  if (vol.includes("300") || vol.includes("oem") || vol.includes("private label")) {
    return {
      assignedSlab: "Private Label & OEM Mill Line",
      slabTag: "300+ PCS / COLOURWAY",
      rebatePercent: 15,
    };
  }
  if (vol.includes("20") || vol.includes("starter")) {
    return {
      assignedSlab: "Starter Assortment (20–49 pcs)",
      slabTag: "20–49 PCS / ORDER",
      rebatePercent: 0,
    };
  }
  if (vol.includes("50") || vol.includes("boutique")) {
    return {
      assignedSlab: "Boutique Partner · 6% Off",
      slabTag: "50–149 PCS / ORDER",
      rebatePercent: 6,
    };
  }
  return {
    assignedSlab: orderVolume,
    slabTag: orderVolume,
    rebatePercent: 0,
  };
};

/**
 * Helper to generate JWT token
 */
const generateUserToken = (user) => {
  const secret = process.env.JWT_SECRET || "bvb_secret_key";
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      appRef: user.appRef,
    },
    secret,
    { expiresIn: "7d" }
  );
};

/**
 * Controller: registerUser / registerRetailer
 * POST /api/users/register
 * Handles B2B Store Application Form & standard user registration
 */
const registerUser = async (req, res) => {
  try {
    const {
      ownerName,
      name,
      storeName,
      companyName,
      email,
      phone,
      mobile,
      storeFormat,
      orderVolume,
      gstin,
      unregisteredGst,
      cityState,
      city,
      state,
      pincode,
      categories,
      requestSampleKit,
      password,
    } = req.body;

    // Resolve unified fields without static mock fallbacks
    const resolvedName = (ownerName || name || "").trim();
    const resolvedStoreName = (storeName || companyName || "").trim();
    const resolvedEmail = (email || "").trim().toLowerCase();
    const resolvedPhone = (phone || mobile || "").trim();
    const resolvedPassword = typeof password === "string" ? password.trim() : "";

    // Validation
    if (!resolvedEmail) {
      return res.status(400).json({
        success: false,
        message: "Business email is required.",
      });
    }

    if (!resolvedName) {
      return res.status(400).json({
        success: false,
        message: "Buyer or owner name is required.",
      });
    }

    if (!resolvedStoreName) {
      return res.status(400).json({
        success: false,
        message: "Store or legal entity name is required.",
      });
    }

    if (!resolvedPassword) {
      return res.status(400).json({
        success: false,
        message: "Account password is required.",
      });
    }

    if (resolvedPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // Check if retailer with this email already exists
    let existingUser = await User.findOne({ email: resolvedEmail });

    if (existingUser) {
      existingUser.ownerName = resolvedName;
      existingUser.name = resolvedName;
      existingUser.storeName = resolvedStoreName;
      existingUser.companyName = resolvedStoreName;
      if (resolvedPhone) {
        existingUser.phone = resolvedPhone;
        existingUser.mobile = resolvedPhone;
      }
      if (storeFormat !== undefined) existingUser.storeFormat = storeFormat.trim();
      if (orderVolume !== undefined) existingUser.orderVolume = orderVolume.trim();
      if (typeof unregisteredGst === "boolean") existingUser.unregisteredGst = unregisteredGst;
      if (gstin !== undefined) existingUser.gstin = gstin.trim().toUpperCase();
      if (cityState !== undefined) existingUser.cityState = cityState.trim();
      if (pincode !== undefined) existingUser.pincode = pincode.trim();
      if (Array.isArray(categories)) existingUser.categories = categories;
      if (typeof requestSampleKit === "boolean") existingUser.requestSampleKit = requestSampleKit;

      const tierCalc = calculateSlabAndTier(orderVolume || existingUser.orderVolume);
      existingUser.assignedSlab = tierCalc.assignedSlab;
      existingUser.discountTier = {
        slab: tierCalc.slabTag,
        rebatePercent: tierCalc.rebatePercent,
      };

      if (resolvedPassword && resolvedPassword.length >= 6) {
        existingUser.password = resolvedPassword;
      }

      await existingUser.save();

      const token = generateUserToken(existingUser);

      return res.status(200).json({
        success: true,
        message: `Store application details updated for ${existingUser.storeName}.`,
        token,
        user: existingUser,
        application: {
          appRef: existingUser.appRef,
          ownerName: existingUser.ownerName,
          storeName: existingUser.storeName,
          email: existingUser.email,
          phone: existingUser.phone || "",
          storeFormat: existingUser.storeFormat || "",
          orderVolume: existingUser.orderVolume || "",
          assignedSlab: existingUser.assignedSlab || "",
          gstin: existingUser.unregisteredGst
            ? "Unregistered / Applied Pending"
            : existingUser.gstin || "",
          unregisteredGst: existingUser.unregisteredGst,
          cityState: existingUser.cityState || "",
          pincode: existingUser.pincode || "",
          categories: existingUser.categories || [],
          requestSampleKit: existingUser.requestSampleKit,
          status: existingUser.status,
          reviewNotice: "Reviewed within 4 business hours",
        },
        tradePass: existingUser.tradePass,
      });
    }

    // New Store Application Registration
    const tierCalc = calculateSlabAndTier(orderVolume);
    const appRef = `BVB-REG-${Math.floor(100000 + Math.random() * 900000)}`;
    const passCode = `BVB-TP-${appRef.replace("BVB-REG-", "")}`;

    const newUser = new User({
      name: resolvedName,
      ownerName: resolvedName,
      storeName: resolvedStoreName,
      companyName: resolvedStoreName,
      email: resolvedEmail,
      phone: resolvedPhone || "",
      mobile: resolvedPhone || "",
      password: resolvedPassword,
      storeFormat: storeFormat ? storeFormat.trim() : "",
      orderVolume: orderVolume ? orderVolume.trim() : "",
      assignedSlab: tierCalc.assignedSlab || "",
      discountTier: {
        slab: tierCalc.slabTag || "",
        rebatePercent: tierCalc.rebatePercent || 0,
      },
      gstin: unregisteredGst ? "" : (gstin || "").trim().toUpperCase(),
      unregisteredGst: Boolean(unregisteredGst),
      cityState: cityState ? cityState.trim() : "",
      city: city ? city.trim() : "",
      state: state ? state.trim() : "",
      pincode: pincode ? pincode.trim() : "",
      categories: Array.isArray(categories) ? categories : [],
      requestSampleKit: Boolean(requestSampleKit),
      sampleKitStatus: requestSampleKit ? "requested" : "none",
      appRef,
      tradePass: {
        passCode,
        issuedAt: new Date(),
        status: "active",
        rebate: tierCalc.assignedSlab || "",
      },
      role: "retailer",
      status: "pending",
    });

    await newUser.save();

    const token = generateUserToken(newUser);

    return res.status(201).json({
      success: true,
      message: `Retailer application ${appRef} registered successfully for ${newUser.storeName}.`,
      token,
      user: newUser,
      application: {
        appRef: newUser.appRef,
        ownerName: newUser.ownerName,
        storeName: newUser.storeName,
        email: newUser.email,
        phone: newUser.phone || "",
        storeFormat: newUser.storeFormat || "",
        orderVolume: newUser.orderVolume || "",
        assignedSlab: newUser.assignedSlab || "",
        gstin: newUser.unregisteredGst
          ? "Unregistered / Applied Pending"
          : newUser.gstin || "",
        unregisteredGst: newUser.unregisteredGst,
        cityState: newUser.cityState || "",
        pincode: newUser.pincode || "",
        categories: newUser.categories || [],
        requestSampleKit: newUser.requestSampleKit,
        status: newUser.status,
        reviewNotice: "Reviewed within 4 business hours",
      },
      tradePass: newUser.tradePass,
    });
  } catch (error) {
    console.error("[registerUser] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error registering retailer store application.",
      error: error.message,
    });
  }
};

/**
 * Controller: loginUser
 * POST /api/users/login
 */
const loginUser = async (req, res) => {
  try {
    const { email, password, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required.",
      });
    }

    let query = {};
    if (email) {
      query.email = email.trim().toLowerCase();
    } else if (phone) {
      query.phone = phone.trim();
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No registered retailer store found with these credentials.",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required for login.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials. Please verify your password.",
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateUserToken(user);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.ownerName || user.name} (${user.storeName || user.companyName}).`,
      token,
      user,
      application: {
        appRef: user.appRef,
        ownerName: user.ownerName || user.name,
        storeName: user.storeName || user.companyName,
        email: user.email,
        phone: user.phone || "",
        storeFormat: user.storeFormat || "",
        orderVolume: user.orderVolume || "",
        assignedSlab: user.assignedSlab || "",
        status: user.status,
      },
      tradePass: user.tradePass,
    });
  } catch (error) {
    console.error("[loginUser] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error logging in.",
      error: error.message,
    });
  }
};

/**
 * Controller: getProfile
 * GET /api/users/profile
 */
const getProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Retailer profile not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
      tradePass: user.tradePass,
      application: {
        appRef: user.appRef,
        ownerName: user.ownerName || user.name,
        storeName: user.storeName || user.companyName,
        email: user.email,
        phone: user.phone || "",
        storeFormat: user.storeFormat || "",
        orderVolume: user.orderVolume || "",
        assignedSlab: user.assignedSlab || "",
        gstin: user.gstin || "",
        unregisteredGst: user.unregisteredGst,
        cityState: user.cityState || "",
        pincode: user.pincode || "",
        categories: user.categories || [],
        requestSampleKit: user.requestSampleKit,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("[getProfile] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching profile.",
      error: error.message,
    });
  }
};

/**
 * Controller: updateProfile
 * PUT /api/users/profile
 */
const updateProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const {
      ownerName,
      storeName,
      phone,
      gstin,
      cityState,
      pincode,
      categories,
      billingAddress,
      shippingAddress,
    } = req.body;

    if (ownerName) {
      user.ownerName = ownerName.trim();
      user.name = ownerName.trim();
    }
    if (storeName) {
      user.storeName = storeName.trim();
      user.companyName = storeName.trim();
    }
    if (phone) {
      user.phone = phone.trim();
      user.mobile = phone.trim();
    }
    if (gstin !== undefined) {
      user.gstin = gstin.trim().toUpperCase();
      user.unregisteredGst = !gstin;
    }
    if (cityState !== undefined) user.cityState = cityState.trim();
    if (pincode !== undefined) user.pincode = pincode.trim();
    if (Array.isArray(categories)) user.categories = categories;
    if (billingAddress) user.billingAddress = { ...user.billingAddress, ...billingAddress };
    if (shippingAddress) user.shippingAddress = { ...user.shippingAddress, ...shippingAddress };

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Retailer profile updated successfully.",
      user,
    });
  } catch (error) {
    console.error("[updateProfile] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating profile.",
      error: error.message,
    });
  }
};

/**
 * Controller: getAllRetailers
 * GET /api/users
 */
const getAllRetailers = async (req, res) => {
  try {
    const { search, status, storeFormat, page = 1, limit = 50 } = req.query;

    const filter = { role: "retailer" };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (storeFormat && storeFormat !== "all") {
      filter.storeFormat = new RegExp(storeFormat, "i");
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { name: new RegExp(q, "i") },
        { ownerName: new RegExp(q, "i") },
        { storeName: new RegExp(q, "i") },
        { companyName: new RegExp(q, "i") },
        { email: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") },
        { gstin: new RegExp(q, "i") },
        { appRef: new RegExp(q, "i") },
        { cityState: new RegExp(q, "i") },
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [retailers, totalCount, pendingCount, verifiedCount] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
      User.countDocuments({ role: "retailer", status: "pending" }),
      User.countDocuments({ role: "retailer", status: "verified" }),
    ]);

    return res.status(200).json({
      success: true,
      retailers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit)),
      },
      stats: {
        total: totalCount,
        pending: pendingCount,
        verified: verifiedCount,
      },
    });
  } catch (error) {
    console.error("[getAllRetailers] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching retailers list.",
      error: error.message,
    });
  }
};

/**
 * Controller: getRetailerById
 * GET /api/users/:id
 */
const getRetailerById = async (req, res) => {
  try {
    const { id } = req.params;

    let retailer = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      retailer = await User.findById(id);
    }
    if (!retailer) {
      retailer = await User.findOne({ appRef: id });
    }

    if (!retailer) {
      return res.status(404).json({
        success: false,
        message: "Retailer store not found.",
      });
    }

    return res.status(200).json({
      success: true,
      retailer,
    });
  } catch (error) {
    console.error("[getRetailerById] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching retailer.",
      error: error.message,
    });
  }
};

/**
 * Controller: updateRetailerStatus
 * PATCH /api/users/:id/status
 */
const updateRetailerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!["pending", "verified", "rejected", "suspended"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed: pending, verified, rejected, suspended",
      });
    }

    const retailer = await User.findById(id);
    if (!retailer) {
      return res.status(404).json({
        success: false,
        message: "Retailer store not found.",
      });
    }

    retailer.status = status;
    if (adminNotes !== undefined) retailer.adminNotes = adminNotes;
    retailer.reviewedAt = new Date();
    if (req.admin) retailer.reviewedBy = req.admin._id;

    if (retailer.tradePass) {
      retailer.tradePass.status = status === "verified" ? "active" : status;
    }

    await retailer.save();

    return res.status(200).json({
      success: true,
      message: `Retailer ${retailer.storeName} status updated to ${status}.`,
      retailer,
    });
  } catch (error) {
    console.error("[updateRetailerStatus] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating retailer status.",
      error: error.message,
    });
  }
};

/**
 * Controller: deleteRetailer
 * DELETE /api/users/:id
 */
const deleteRetailer = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await User.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Retailer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Retailer ${deleted.storeName || deleted.name} deleted successfully.`,
    });
  } catch (error) {
    console.error("[deleteRetailer] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting retailer.",
      error: error.message,
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  getAllRetailers,
  getRetailerById,
  updateRetailerStatus,
  deleteRetailer,
};

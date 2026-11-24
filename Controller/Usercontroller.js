const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../Model/UserModel");
const Order = require("../Model/OrderModel");
const Referral = require("../Model/ReferralModel");
const { checkAntiAbuse, getReferralConfig } = require("../Services/rewardLedgerService");

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

    // Process Partner Referral Code if supplied during registration
    const incomingRefCode = (req.body.referralCode || req.body.ref || req.query.ref || "").trim().toUpperCase();
    if (incomingRefCode) {
      try {
        const referrer = await User.findOne({ referralCode: incomingRefCode });
        if (referrer && String(referrer._id) !== String(newUser._id)) {
          const clientIp = req.ip || req.headers["x-forwarded-for"] || "";
          const antiAbuse = await checkAntiAbuse(
            referrer,
            {
              phone: resolvedPhone,
              email: resolvedEmail,
              gstin: newUser.gstin,
              pan: req.body.pan || "",
            },
            clientIp
          );

          newUser.referredBy = referrer._id;
          newUser.referredByCode = incomingRefCode;
          newUser.registrationIp = clientIp;
          await newUser.save();

          const refConfig = await getReferralConfig();
          await Referral.create({
            referralCode: incomingRefCode,
            referrerId: referrer._id,
            referrerName: referrer.ownerName || referrer.name,
            referrerStoreName: referrer.storeName || referrer.companyName || referrer.name,
            referredId: newUser._id,
            referredName: newUser.name,
            referredStoreName: newUser.storeName || newUser.companyName || newUser.name,
            status: "pending",
            rewardAmount: refConfig.referrerRewardAmount,
            refereeRewardAmount: refConfig.refereeRewardAmount,
            fraudFlags: antiAbuse.flags || [],
            isFraudFlagged: antiAbuse.isFraudFlagged,
            notes: antiAbuse.isFraudFlagged
              ? `Automated security note: ${antiAbuse.flags.map((f) => f.details).join("; ")}`
              : "Registered via partner referral link.",
          });
        }
      } catch (refErr) {
        console.warn("[registerUser] Referral attachment note:", refErr?.message);
      }
    }

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
 * GET /api/users or GET /api/retailers
 */
const getAllRetailers = async (req, res) => {
  try {
    const {
      search,
      status,
      storeFormat,
      sampleKitStatus,
      role,
      page = 1,
      limit = 50,
    } = req.query;

    // Filter to retailers/buyers (exclude system admins by default)
    const filter = role ? { role } : { role: { $ne: "admin" } };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (sampleKitStatus && sampleKitStatus !== "all") {
      filter.sampleKitStatus = sampleKitStatus;
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
        { mobile: new RegExp(q, "i") },
        { gstin: new RegExp(q, "i") },
        { appRef: new RegExp(q, "i") },
        { cityState: new RegExp(q, "i") },
        { city: new RegExp(q, "i") },
        { state: new RegExp(q, "i") },
        { "tradePass.passCode": new RegExp(q, "i") },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Math.min(200, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [
      retailers,
      totalCount,
      pendingCount,
      verifiedCount,
      suspendedCount,
      sampleKitCount,
    ] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
      User.countDocuments({ role: { $ne: "admin" }, status: "pending" }),
      User.countDocuments({ role: { $ne: "admin" }, status: "verified" }),
      User.countDocuments({ role: { $ne: "admin" }, status: "suspended" }),
      User.countDocuments({ role: { $ne: "admin" }, sampleKitStatus: "requested" }),
    ]);

    // Aggregate order metrics for this batch of retailers
    const userIds = retailers.map((r) => r._id);
    let orderStatsMap = {};
    let totalGMV = 0;

    if (userIds.length > 0) {
      try {
        const orderAgg = await Order.aggregate([
          { $match: { userId: { $in: userIds } } },
          {
            $group: {
              _id: "$userId",
              orderCount: { $sum: 1 },
              totalSpent: {
                $sum: {
                  $cond: [
                    { $in: ["$paymentStatus", ["paid", "captured", "success"]] },
                    { $ifNull: ["$pricing.totalPayable", 0] },
                    0,
                  ],
                },
              },
              lastOrderAt: { $max: "$createdAt" },
              lastOrderId: { $last: "$orderId" },
            },
          },
        ]);

        orderAgg.forEach((agg) => {
          orderStatsMap[String(agg._id)] = {
            orderCount: agg.orderCount || 0,
            totalSpent: agg.totalSpent || 0,
            lastOrderAt: agg.lastOrderAt || null,
            lastOrderId: agg.lastOrderId || null,
          };
        });
      } catch (aggErr) {
        console.warn("[getAllRetailers] Order aggregation warning:", aggErr.message);
      }
    }

    // Global revenue summary from paid/successful orders
    try {
      const gmvAgg = await Order.aggregate([
        { $match: { paymentStatus: { $in: ["paid", "captured", "success"] } } },
        { $group: { _id: null, total: { $sum: "$pricing.totalPayable" } } },
      ]);
      totalGMV = gmvAgg[0]?.total || 0;
    } catch {
      // ignore
    }

    const enrichedRetailers = retailers.map((r) => ({
      ...r,
      metrics: orderStatsMap[String(r._id)] || {
        orderCount: 0,
        totalSpent: 0,
        lastOrderAt: null,
        lastOrderId: null,
      },
    }));

    return res.status(200).json({
      success: true,
      retailers: enrichedRetailers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: Math.ceil(totalCount / limitNum) || 1,
      },
      stats: {
        total: totalCount,
        pending: pendingCount,
        verified: verifiedCount,
        suspended: suspendedCount,
        sampleKitsRequested: sampleKitCount,
        totalGMV,
      },
    });
  } catch (error) {
    console.error("[getAllRetailers] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching retailers directory.",
      error: error.message,
    });
  }
};

/**
 * Controller: getRetailerById
 * GET /api/users/:id or GET /api/retailers/:id
 */
const getRetailerById = async (req, res) => {
  try {
    const { id } = req.params;

    let retailer = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      retailer = await User.findById(id).lean();
    }
    if (!retailer) {
      retailer = await User.findOne({ appRef: id }).lean();
    }

    if (!retailer) {
      return res.status(404).json({
        success: false,
        message: "Retailer store not found.",
      });
    }

    // Pull recent order manifests for this retailer
    let orders = [];
    try {
      orders = await Order.find({ userId: retailer._id })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();
    } catch (orderErr) {
      console.warn("[getRetailerById] Order lookup warning:", orderErr.message);
    }

    const paidOrders = orders.filter((o) =>
      ["paid", "captured", "success"].includes(o.paymentStatus)
    );
    const totalSpent = paidOrders.reduce(
      (sum, o) => sum + (o.pricing?.totalPayable || 0),
      0
    );

    return res.status(200).json({
      success: true,
      retailer,
      orders,
      metrics: {
        totalOrders: orders.length,
        paidOrders: paidOrders.length,
        totalSpent,
        lastOrderAt: orders[0]?.createdAt || null,
      },
    });
  } catch (error) {
    console.error("[getRetailerById] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching retailer detail.",
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
    const {
      status,
      assignedSlab,
      discountTier,
      sampleKitStatus,
      adminNotes,
      gstin,
      unregisteredGst,
      storeName,
      ownerName,
      phone,
    } = req.body;

    const retailer = await User.findById(id);
    if (!retailer) {
      return res.status(404).json({
        success: false,
        message: "Retailer store not found.",
      });
    }

    if (status) {
      if (!["pending", "verified", "rejected", "suspended"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Allowed: pending, verified, rejected, suspended",
        });
      }
      retailer.status = status;
      if (retailer.tradePass) {
        retailer.tradePass.status = status === "verified" ? "active" : status;
      }
    }

    if (assignedSlab !== undefined) retailer.assignedSlab = assignedSlab.trim();
    if (discountTier !== undefined) retailer.discountTier = discountTier;
    if (sampleKitStatus !== undefined) retailer.sampleKitStatus = sampleKitStatus;
    if (adminNotes !== undefined) retailer.adminNotes = adminNotes;
    if (gstin !== undefined) retailer.gstin = gstin.trim().toUpperCase();
    if (typeof unregisteredGst === "boolean") retailer.unregisteredGst = unregisteredGst;
    if (storeName) {
      retailer.storeName = storeName.trim();
      retailer.companyName = storeName.trim();
    }
    if (ownerName) {
      retailer.ownerName = ownerName.trim();
      retailer.name = ownerName.trim();
    }
    if (phone) {
      retailer.phone = phone.trim();
      retailer.mobile = phone.trim();
    }

    retailer.reviewedAt = new Date();
    if (req.admin) retailer.reviewedBy = req.admin._id;

    await retailer.save();

    return res.status(200).json({
      success: true,
      message: `Retailer ${retailer.storeName || retailer.name} profile updated successfully.`,
      retailer,
    });
  } catch (error) {
    console.error("[updateRetailerStatus] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating retailer.",
      error: error.message,
    });
  }
};

/**
 * Controller: verifyRetailer
 * PATCH /api/users/:id/verify
 */
const verifyRetailer = async (req, res) => {
  try {
    const { id } = req.params;
    const { isVerified = true, adminNotes, assignedSlab } = req.body;

    const retailer = await User.findById(id);
    if (!retailer) {
      return res.status(404).json({
        success: false,
        message: "Retailer store not found.",
      });
    }

    const nextStatus = isVerified ? "verified" : "pending";
    retailer.status = nextStatus;
    if (assignedSlab) retailer.assignedSlab = assignedSlab.trim();
    if (adminNotes !== undefined) retailer.adminNotes = adminNotes;
    retailer.reviewedAt = new Date();
    if (req.admin) retailer.reviewedBy = req.admin._id;

    if (retailer.tradePass) {
      retailer.tradePass.status = isVerified ? "active" : "pending";
      if (assignedSlab) retailer.tradePass.rebate = assignedSlab.trim();
    }

    await retailer.save();

    return res.status(200).json({
      success: true,
      message: `Retailer ${retailer.storeName || retailer.name} is now ${nextStatus}.`,
      retailer,
    });
  } catch (error) {
    console.error("[verifyRetailer] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error verifying retailer.",
      error: error.message,
    });
  }
};

/**
 * Controller: updateSampleKitStatus
 * PATCH /api/users/:id/sample-kit
 */
const updateSampleKitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { sampleKitStatus } = req.body;

    if (!["none", "requested", "dispatched", "credited"].includes(sampleKitStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sample kit status. Allowed: none, requested, dispatched, credited",
      });
    }

    const retailer = await User.findById(id);
    if (!retailer) {
      return res.status(404).json({
        success: false,
        message: "Retailer store not found.",
      });
    }

    retailer.sampleKitStatus = sampleKitStatus;
    if (sampleKitStatus === "dispatched" || sampleKitStatus === "credited") {
      retailer.requestSampleKit = true;
    }

    await retailer.save();

    return res.status(200).json({
      success: true,
      message: `Sample kit status updated to ${sampleKitStatus} for ${retailer.storeName || retailer.name}.`,
      retailer,
    });
  } catch (error) {
    console.error("[updateSampleKitStatus] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating sample kit status.",
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
  verifyRetailer,
  updateSampleKitStatus,
  deleteRetailer,
};

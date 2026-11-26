const jwt = require("jsonwebtoken");
const Admin = require("../Model/AdminModel");

/**
 * Controller: adminAccess (Admin Login API)
 * Authenticates an administrator against MongoDB records and issues a signed JWT.
 * API Name: admin access
 */
const adminAccess = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    // 1. Validate required fields
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Corporate email is required for administrative access.",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Secure access passphrase is required.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 2. Query administrative account from database
    const admin = await Admin.findOne({ email: cleanEmail });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or passphrase. Access denied.",
      });
    }

    // 3. Verify account active state
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Administrative access has been suspended. Contact corporate security.",
      });
    }

    // 4. Validate passphrase with bcrypt
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      admin.loginAttempts = (admin.loginAttempts || 0) + 1;
      await admin.save();

      return res.status(401).json({
        success: false,
        message: "Invalid email or passphrase. Access denied.",
      });
    }

    // 5. Update session telemetry
    admin.lastLogin = new Date();
    admin.loginAttempts = 0;
    await admin.save();

    // 6. Generate signed JWT token
    const secret = process.env.JWT_SECRET || "bvb_admin_secret_2026";
    const expiresIn = rememberMe
      ? "30d"
      : process.env.JWT_EXPIRES_IN
      ? process.env.JWT_EXPIRES_IN.trim()
      : "1d";

    const defaultAllModules = [
      "orders",
      "products",
      "inventory",
      "retailers",
      "invoices",
      "pincodes",
      "blog",
      "referrals",
      "roles",
    ];

    const payload = {
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      clearance: admin.clearance,
      badge: admin.badge,
      modules: admin.role === "Super Administrator" ? defaultAllModules : (admin.modules && admin.modules.length > 0 ? admin.modules : defaultAllModules),
    };

    const token = jwt.sign(payload, secret, { expiresIn });

    // 7. Return authorized payload
    return res.status(200).json({
      success: true,
      message: "Admin access granted successfully.",
      apiName: "admin access",
      token,
      expiresIn,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        clearance: admin.clearance,
        badge: admin.badge,
        modules: payload.modules,
        loginTime: admin.lastLogin,
      },
    });
  } catch (error) {
    console.error("[adminAccess] Error processing administrative login:", error);
    const isTimeoutOrDbError =
      error.message?.includes("buffering timed out") ||
      error.name === "MongooseError" ||
      error.name === "MongoServerSelectionError";

    return res.status(isTimeoutOrDbError ? 503 : 500).json({
      success: false,
      message: isTimeoutOrDbError
        ? "Database connection unavailable. MongoDB is not reachable."
        : "Internal server error during administrative authorization.",
      error: error.message,
    });
  }
};

/**
 * Controller: getAdminProfile
 * Returns authenticated administrator session profile from DB
 */
const getAdminProfile = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      admin: req.admin,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve administrator profile.",
      error: error.message,
    });
  }
};

const ALL_AVAILABLE_MODULES = [
  "orders",
  "products",
  "inventory",
  "retailers",
  "invoices",
  "pincodes",
  "blog",
  "referrals",
  "roles",
];

/**
 * Controller: getAllAdmins
 * Returns all administrator and staff accounts with their assigned modules
 */
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      admins: admins.map((a) => ({
        id: a._id,
        _id: a._id,
        name: a.name,
        email: a.email,
        role: a.role,
        clearance: a.clearance,
        badge: a.badge,
        modules: a.role === "Super Administrator" ? ALL_AVAILABLE_MODULES : (a.modules && a.modules.length > 0 ? a.modules : ALL_AVAILABLE_MODULES),
        isActive: a.isActive,
        lastLogin: a.lastLogin,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("[getAllAdmins] Error fetching staff accounts:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve administrator directory.",
      error: error.message,
    });
  }
};

/**
 * Controller: createAdmin
 * Provisions a new real administrator account in MongoDB with specific module access
 */
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, clearance, badge, modules } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await Admin.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An administrative account with this email already exists.",
      });
    }

    // First account created in system gets Super Administrator role
    const totalAdmins = await Admin.countDocuments();
    const isFirst = totalAdmins === 0;
    const assignedRole = isFirst ? "Super Administrator" : (role || "Admin");
    const assignedClearance = isFirst ? "Tier 1 • Full Governance" : (clearance || "Tier 2 • Department Governance");
    const assignedBadge = isFirst ? "Super Admin" : (badge || "Staff");

    const assignedModules = isFirst || assignedRole === "Super Administrator"
      ? ALL_AVAILABLE_MODULES
      : (Array.isArray(modules) && modules.length > 0 ? modules : ["orders", "products"]);

    const newAdmin = await Admin.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      role: assignedRole,
      clearance: assignedClearance,
      badge: assignedBadge,
      modules: assignedModules,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Administrator account provisioned successfully.",
      admin: {
        id: newAdmin._id,
        _id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        clearance: newAdmin.clearance,
        badge: newAdmin.badge,
        modules: newAdmin.modules,
        isActive: newAdmin.isActive,
      },
    });
  } catch (error) {
    console.error("[createAdmin] Error provisioning admin:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create administrator account.",
      error: error.message,
    });
  }
};

/**
 * Controller: updateAdmin
 * Updates role, assigned module permissions, or active status of staff user
 */
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, modules, isActive, password, clearance, badge } = req.body;

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Administrator account not found.",
      });
    }

    if (name) admin.name = name.trim();
    if (role) admin.role = role.trim();
    if (clearance) admin.clearance = clearance.trim();
    if (badge) admin.badge = badge.trim();
    if (typeof isActive === "boolean") admin.isActive = isActive;

    if (Array.isArray(modules)) {
      admin.modules = admin.role === "Super Administrator" ? ALL_AVAILABLE_MODULES : modules;
    }

    if (password && password.trim().length >= 6) {
      admin.password = password;
    }

    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Administrator permissions updated successfully.",
      admin: {
        id: admin._id,
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        clearance: admin.clearance,
        badge: admin.badge,
        modules: admin.modules,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    console.error("[updateAdmin] Error updating administrator:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update administrator account.",
      error: error.message,
    });
  }
};

/**
 * Controller: deleteAdmin
 * Removes a staff/sub-admin account with safety guards
 */
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.admin && String(req.admin._id) === String(id)) {
      return res.status(400).json({
        success: false,
        message: "Security restriction: You cannot delete your own active administrator account.",
      });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Administrator account not found.",
      });
    }

    if (admin.role === "Super Administrator") {
      const superCount = await Admin.countDocuments({ role: "Super Administrator" });
      if (superCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete the sole Super Administrator account of the platform.",
        });
      }
    }

    await Admin.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: `Administrator "${admin.name}" removed successfully.`,
    });
  } catch (error) {
    console.error("[deleteAdmin] Error deleting administrator:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove administrator account.",
      error: error.message,
    });
  }
};

module.exports = {
  adminAccess,
  adminLogin: adminAccess,
  getAdminProfile,
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  ALL_AVAILABLE_MODULES,
};

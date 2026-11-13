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

    const payload = {
      id: admin._id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      clearance: admin.clearance,
      badge: admin.badge,
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
        loginTime: admin.lastLogin,
      },
    });
  } catch (error) {
    console.error("[adminAccess] Error processing administrative login:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during administrative authorization.",
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

/**
 * Controller: createAdmin
 * Provisions a new real administrator account in MongoDB
 */
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, clearance, badge } = req.body;

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
    const assignedRole = totalAdmins === 0 ? "Super Administrator" : (role || "Admin");
    const assignedClearance = totalAdmins === 0 ? "Tier 1 • Full Governance" : (clearance || "Tier 2 • Department Governance");
    const assignedBadge = totalAdmins === 0 ? "Super Admin" : (badge || "Admin");

    const newAdmin = await Admin.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      role: assignedRole,
      clearance: assignedClearance,
      badge: assignedBadge,
    });

    return res.status(201).json({
      success: true,
      message: "Administrator account provisioned successfully.",
      admin: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        clearance: newAdmin.clearance,
        badge: newAdmin.badge,
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

module.exports = {
  adminAccess,
  adminLogin: adminAccess,
  getAdminProfile,
  createAdmin,
};

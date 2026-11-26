const jwt = require("jsonwebtoken");
const Admin = require("../Model/AdminModel");
const User = require("../Model/UserModel");

/**
 * Middleware to verify Admin JWT Token from Authorization header
 */
const verifyAdminToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No authorization token provided.",
      });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "bvb_admin_secret_2026";

    const decoded = jwt.verify(token, secret);

    // Verify admin still exists and is active
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Administrator account does not exist.",
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Administrative access has been suspended.",
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid authorization token.",
    });
  }
};

/**
 * Middleware to check specific administrative roles / clearances
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!allowedRoles.includes(req.admin.role) && req.admin.role !== "Super Administrator") {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Requires clearance: ${allowedRoles.join(" or ")}`,
      });
    }

    next();
  };
};

/**
 * Middleware to verify standard Retailer/Customer User JWT Token
 */
const verifyUserToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in.",
      });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "bvb_secret_key";

    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account does not exist or has been removed.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authorization token.",
    });
  }
};

/**
 * Optional User Token Middleware
 * Allows guest access while attaching req.user if a valid token is provided
 */
const optionalUserToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const secret = process.env.JWT_SECRET || "bvb_secret_key";
      try {
        const decoded = jwt.verify(token, secret);
        const user = await User.findById(decoded.id).select("-password");
        if (user) {
          req.user = user;
        }
      } catch {
        // Token invalid or expired - treat as guest
        req.user = null;
      }
    } else {
      req.user = null;
    }
    next();
  } catch (err) {
    req.user = null;
    next();
  }
};

/**
 * Middleware to check if admin has access to a specific module (RBAC)
 */
const requireModule = (moduleName) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (req.admin.role === "Super Administrator") {
      return next();
    }

    const modules = req.admin.modules || [];
    if (!modules.includes(moduleName)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. You do not have permission to access the '${moduleName}' module.`,
      });
    }

    next();
  };
};

module.exports = {
  verifyAdminToken,
  requireRole,
  requireModule,
  verifyUserToken,
  optionalUserToken,
};


const jwt = require("jsonwebtoken");
const Admin = require("../Model/AdminModel");

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

module.exports = {
  verifyAdminToken,
  requireRole,
};


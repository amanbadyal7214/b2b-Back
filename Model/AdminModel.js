const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Admin name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Admin email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Admin password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    role: {
      type: String,
      default: "Super Administrator",
      trim: true,
    },
    clearance: {
      type: String,
      default: "Tier 1 • Full Governance",
    },
    badge: {
      type: String,
      default: "Super Admin",
    },
    // Granular Module-Level Permissions (RBAC)
    modules: {
      type: [String],
      default: [
        "orders",
        "products",
        "inventory",
        "retailers",
        "inquiries",
        "invoices",
        "pincodes",
        "blog",
        "referrals",
        "roles",
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook: Hash password with bcrypt before saving if modified
adminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password helper method
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Hide password from JSON serialization
adminSchema.methods.toJSON = function () {
  const adminObj = this.toObject();
  delete adminObj.password;
  return adminObj;
};

const Admin = mongoose.model("Admin", adminSchema);

module.exports = Admin;


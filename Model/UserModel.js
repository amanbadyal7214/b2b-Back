const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    // Buyer / Owner Name
    name: {
      type: String,
      required: [true, "Buyer or Owner name is required"],
      trim: true,
    },
    ownerName: {
      type: String,
      trim: true,
    },

    // Store / Legal Entity Name
    storeName: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
    },

    // Business Email
    email: {
      type: String,
      required: [true, "Business email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    // WhatsApp / Mobile Number
    phone: {
      type: String,
      trim: true,
    },
    mobile: {
      type: String,
      trim: true,
    },

    // Password for account login
    password: {
      type: String,
      required: [true, "Account password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },

    // Store Format (e.g., Independent Menswear Boutique, Multi-Brand Retail, Regional Chain)
    storeFormat: {
      type: String,
      trim: true,
    },

    // Opening Order Volume (e.g., Boutique Partner (50–149 pcs), Stockist Direct (150+ pcs))
    orderVolume: {
      type: String,
      trim: true,
    },

    // Assigned Slab & Discount Tier
    assignedSlab: {
      type: String,
      trim: true,
    },
    discountTier: {
      slab: { type: String },
      rebatePercent: { type: Number },
    },

    // GSTIN Number
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },

    // Applying without GSTIN (New Store / Pending)
    unregisteredGst: {
      type: Boolean,
      default: false,
    },

    // Location: City & State, Pincode
    cityState: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },

    // Sourcing Categories (Selected by the retailer)
    categories: {
      type: [String],
      default: [],
    },

    // 3-Piece Verification Sample Kit
    requestSampleKit: {
      type: Boolean,
      default: false,
    },
    sampleKitStatus: {
      type: String,
      enum: ["none", "requested", "dispatched", "credited"],
      default: "none",
    },

    // Unique Application Reference (e.g. BVB-REG-104928)
    appRef: {
      type: String,
      trim: true,
      index: true,
    },

    // Live Trade Pass
    tradePass: {
      passCode: { type: String },
      issuedAt: { type: Date, default: Date.now },
      status: {
        type: String,
        enum: ["active", "pending", "revoked"],
        default: "active",
      },
      rebate: { type: String },
    },

    // Role & Clearance
    role: {
      type: String,
      enum: ["retailer", "wholesaler", "admin", "user"],
      default: "retailer",
    },

    // Store Application Status
    status: {
      type: String,
      enum: ["pending", "verified", "rejected", "suspended"],
      default: "pending",
    },

    adminNotes: {
      type: String,
    },
    reviewedAt: {
      type: Date,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Addresses
    billingAddress: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      country: { type: String },
    },
    shippingAddress: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      country: { type: String },
    },

    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook: field synchronization, appRef generation, and password hashing
userSchema.pre("save", async function () {
  // Sync name <-> ownerName
  if (!this.name && this.ownerName) this.name = this.ownerName;
  if (!this.ownerName && this.name) this.ownerName = this.name;

  // Sync storeName <-> companyName
  if (!this.companyName && this.storeName) this.companyName = this.storeName;
  if (!this.storeName && this.companyName) this.storeName = this.companyName;

  // Sync phone <-> mobile
  if (!this.phone && this.mobile) this.phone = this.mobile;
  if (!this.mobile && this.phone) this.mobile = this.phone;

  // Auto-generate unique application reference if missing
  if (!this.appRef) {
    this.appRef = `BVB-REG-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  // Auto-generate Trade Pass
  if (!this.tradePass || !this.tradePass.passCode) {
    const codeNum = this.appRef.replace("BVB-REG-", "");
    this.tradePass = {
      passCode: `BVB-TP-${codeNum}`,
      issuedAt: new Date(),
      status: "active",
      rebate: this.assignedSlab || "",
    };
  }

  // Sample kit state
  if (this.requestSampleKit && (!this.sampleKitStatus || this.sampleKitStatus === "none")) {
    this.sampleKitStatus = "requested";
  }

  // Only hash password if modified and present
  if (!this.isModified("password") || !this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare Password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Exclude password when converting to JSON
userSchema.methods.toJSON = function () {
  const userObj = this.toObject();
  delete userObj.password;
  return userObj;
};

const User = mongoose.model("User", userSchema);

module.exports = User;

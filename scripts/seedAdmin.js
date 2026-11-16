const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const Admin = require("../Model/AdminModel");

async function seedAdmin() {
  const rawMongoUri = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/B2B";
  let mongoUri = rawMongoUri.trim().replace(/;+$/, "");
  if (mongoUri.includes("localhost:27017")) {
    mongoUri = mongoUri.replace("localhost:27017", "127.0.0.1:27017");
  }

  console.log(`[SeedAdmin] Connecting to MongoDB: ${mongoUri}`);

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log("[SeedAdmin] Connected to MongoDB successfully.");

    // Ensure admin@buddyvsbuff.com exists
    const adminEmail = "admin@buddyvsbuff.com";
    let adminAcc = await Admin.findOne({ email: adminEmail });
    if (!adminAcc) {
      console.log(`[SeedAdmin] Creating primary administrator: ${adminEmail}`);
      adminAcc = new Admin({
        name: "Corporate Administrator",
        email: adminEmail,
        password: "BVB•Executive2026",
        role: "Super Administrator",
        clearance: "Tier 1 • Full Governance",
        badge: "Super Admin",
        isActive: true,
      });
      await adminAcc.save();
      console.log(`[SeedAdmin] Account created: ${adminEmail}`);
    }

    // Ensure superadmin@buddyvsbuff.com exists
    const superAdminEmail = "superadmin@buddyvsbuff.com";
    let superAdminAcc = await Admin.findOne({ email: superAdminEmail });
    if (!superAdminAcc) {
      console.log(`[SeedAdmin] Creating super administrator: ${superAdminEmail}`);
      superAdminAcc = new Admin({
        name: "Aman Badyal",
        email: superAdminEmail,
        password: "BVB•Executive2026",
        role: "Super Administrator",
        clearance: "Tier 1 • Full Governance",
        badge: "Super Admin",
        isActive: true,
      });
      await superAdminAcc.save();
      console.log(`[SeedAdmin] Account created: ${superAdminEmail}`);
    }

    const allAdmins = await Admin.find({}).select("name email role isActive");
    console.log("=========================================");
    console.log(" BVB Administrative Accounts In Database:");
    console.log("=========================================");
    allAdmins.forEach((adm, idx) => {
      console.log(`  ${idx + 1}. ${adm.name} (${adm.email})`);
      console.log(`     Role: ${adm.role} | Active: ${adm.isActive}`);
    });
    console.log("=========================================");
    console.log("Default Passphrase for seeded accounts: BVB•Executive2026");
    console.log("=========================================");
  } catch (err) {
    console.error("[SeedAdmin] Error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("[SeedAdmin] MongoDB connection closed.");
  }
}

if (require.main === module) {
  seedAdmin();
}

module.exports = { seedAdmin };

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const dotenv = require("dotenv");

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
  secure: true,
});

// Configure Multer in-memory storage for buffer uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (JPG, PNG, WEBP, AVIF, GIF) are allowed"), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter,
});

/**
 * Upload buffer or base64 to Cloudinary
 * @param {Buffer|string} fileSource - Buffer from req.file.buffer or base64 data URI
 * @param {string} folder - Target Cloudinary folder
 * @returns {Promise<{ url: string, public_id: string }>}
 */
const uploadToCloudinary = async (fileSource, folder = "b2b_categories") => {
  const isCloudinaryConfigured =
    Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
    Boolean(process.env.CLOUDINARY_API_KEY) &&
    Boolean(process.env.CLOUDINARY_API_SECRET);

  if (!isCloudinaryConfigured) {
    console.warn(
      "[Cloudinary] Credentials missing in .env (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)."
    );
    // If base64 string provided, return it as fallback data URL
    if (typeof fileSource === "string" && fileSource.startsWith("data:image")) {
      return { url: fileSource, public_id: "" };
    }
    // If buffer provided, convert to base64 data URI
    if (Buffer.isBuffer(fileSource)) {
      const dataUri = `data:image/jpeg;base64,${fileSource.toString("base64")}`;
      return { url: dataUri, public_id: "" };
    }
    return { url: "", public_id: "" };
  }

  // Upload buffer via stream
  if (Buffer.isBuffer(fileSource)) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        },
        (error, result) => {
          if (error) {
            console.error("[Cloudinary Stream Error]:", error);
            return reject(error);
          }
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      );
      uploadStream.end(fileSource);
    });
  }

  // Upload base64 or remote URL string
  if (typeof fileSource === "string" && fileSource.trim()) {
    const result = await cloudinary.uploader.upload(fileSource, {
      folder,
      resource_type: "image",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });
    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  }

  return { url: "", public_id: "" };
};

/**
 * Remove image from Cloudinary by public ID
 */
const deleteFromCloudinary = async (public_id) => {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id);
  } catch (err) {
    console.warn("[Cloudinary Delete Warning]:", err.message);
  }
};

module.exports = {
  cloudinary,
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
};


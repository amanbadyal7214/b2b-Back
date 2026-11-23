const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const dotenv = require("dotenv");

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || "").trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
  secure: true,
});

// Configure Multer in-memory storage for buffer uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/") ||
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only image, video, and PDF files are allowed (JPG, PNG, WEBP, AVIF, MP4, PDF)"), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB file limit to support short video reels
    fieldSize: 60 * 1024 * 1024, // 60MB limit for non-file text/json fields (fixes LIMIT_FIELD_VALUE)
    fields: 50, // Allow up to 50 non-file fields
  },
  fileFilter,
});

/**
 * Upload buffer or base64 to Cloudinary
 * @param {Buffer|string} fileSource - Buffer from req.file.buffer or base64 data URI
 * @param {string} folder - Target Cloudinary folder
 * @param {string} resourceType - "image", "video", or "auto"
 * @returns {Promise<{ url: string, public_id: string }>}
 */
const uploadToCloudinary = async (fileSource, folder = "b2b_categories", resourceType = "auto") => {
  const isCloudinaryConfigured =
    Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
    Boolean(process.env.CLOUDINARY_API_KEY) &&
    Boolean(process.env.CLOUDINARY_API_SECRET);

  if (!isCloudinaryConfigured) {
    console.warn(
      "[Cloudinary] Credentials missing in .env (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)."
    );
    // If base64 string provided, return it as fallback data URL
    if (typeof fileSource === "string" && (fileSource.startsWith("data:image") || fileSource.startsWith("data:video") || fileSource.startsWith("http"))) {
      return { url: fileSource, public_id: "" };
    }
    // If buffer provided, convert to base64 data URI
    if (Buffer.isBuffer(fileSource)) {
      let mime = "image/jpeg";
      if (resourceType === "video") mime = "video/mp4";
      if (resourceType === "raw" || resourceType === "pdf") mime = "application/pdf";
      const dataUri = `data:${mime};base64,${fileSource.toString("base64")}`;
      return { url: dataUri, public_id: "" };
    }
    return { url: "", public_id: "" };
  }

  // Upload buffer via stream
  if (Buffer.isBuffer(fileSource)) {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        folder,
        resource_type: resourceType,
      };
      if (resourceType === "image") {
        uploadOptions.transformation = [{ quality: "auto", fetch_format: "auto" }];
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
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
    const uploadOptions = {
      folder,
      resource_type: resourceType,
    };
    if (resourceType === "image") {
      uploadOptions.transformation = [{ quality: "auto", fetch_format: "auto" }];
    }

    const result = await cloudinary.uploader.upload(fileSource, uploadOptions);
    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  }

  return { url: "", public_id: "" };
};

/**
 * Remove image or video from Cloudinary by public ID
 */
const deleteFromCloudinary = async (public_id, resourceType = "image") => {
  if (!public_id) return;
  try {
    await cloudinary.uploader.destroy(public_id, { resource_type: resourceType });
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


const cloudinary = require("cloudinary").v2;

// Validate required environment variables
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn("⚠️  Cloudinary credentials not found in environment variables");
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "daaavzzzf",
  api_key: process.env.CLOUDINARY_API_KEY || "189183574785781",
  api_secret: process.env.CLOUDINARY_API_SECRET || "T8Yw9tvkLnCoxfSuhbTyPGcwZBo",
});

module.exports = cloudinary;

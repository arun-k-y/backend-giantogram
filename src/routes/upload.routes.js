const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const cloudinary = require("cloudinary").v2;
const User = require("./models/User"); // Your user model
// Optional: You can still use session-based auth or other methods
// const auth = require('./middleware/auth'); // Your auth middleware

const router = express.Router();

// Cloudinary configuration (optional - for cloud storage)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Ensure upload directory exists
const ensureUploadDir = async () => {
  try {
    await fs.access("uploads/profiles");
  } catch {
    await fs.mkdir("uploads/profiles", { recursive: true });
  }
};

// Configure multer for local storage
const localStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/profiles/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// Configure multer for memory storage (for cloud upload)
const memoryStorage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// Multer configurations
const uploadLocal = multer({
  storage: localStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1, // Only one file at a time
  },
});

const uploadMemory = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1,
  },
});

// Helper function to delete old profile picture
const deleteOldProfilePicture = async (user) => {
  if (user.profilePicture && !user.profilePicture.startsWith("http")) {
    // Local file - delete from filesystem
    try {
      await fs.unlink(user.profilePicture);
    } catch (error) {
      console.log("Error deleting old profile picture:", error.message);
    }
  } else if (user.profilePicturePublicId) {
    // Cloud file - delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(user.profilePicturePublicId);
    } catch (error) {
      console.log("Error deleting from Cloudinary:", error.message);
    }
  }
};

// Route 1: Upload to local storage
router.post("/upload-local", async (req, res) => {
  try {
    await ensureUploadDir();

    uploadLocal.single("profilePicture")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res
              .status(400)
              .json({ error: "File too large. Maximum size is 5MB." });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      try {
        // Get userId from request body, query params, or session
        const userId = req.body.userId || req.query.userId;

        if (!userId) {
          // Clean up uploaded file if no user ID provided
          await fs.unlink(req.file.path);
          return res.status(400).json({ error: "User ID is required" });
        }

        const user = await User.findById(userId);
        if (!user) {
          // Clean up uploaded file if user not found
          await fs.unlink(req.file.path);
          return res.status(404).json({ error: "User not found" });
        }

        // Delete old profile picture
        await deleteOldProfilePicture(user);

        // Update user with new profile picture
        user.profilePicture = req.file.path;
        user.profilePicturePublicId = null; // Clear cloud ID
        user.isProfileComplete = user.checkProfileComplete();

        await user.save();

        res.json({
          success: true,
          message: "Profile picture uploaded successfully",
          data: {
            profilePicture: user.profilePicture,
            fileName: req.file.filename,
            fileSize: req.file.size,
            isProfileComplete: user.isProfileComplete,
          },
        });
      } catch (error) {
        // Clean up uploaded file on error
        await fs.unlink(req.file.path);
        res.status(500).json({ error: "Database error: " + error.message });
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

// Route 2: Upload to Cloudinary
router.post("/upload-cloud", async (req, res) => {
  uploadMemory.single("profilePicture")(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ error: "File too large. Maximum size is 5MB." });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // Get userId from request body, query params, or session
      const userId = req.body.userId || req.query.userId;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Upload to Cloudinary
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "profile_pictures",
              public_id: `user_${user._id}_${Date.now()}`,
              transformation: [
                { width: 400, height: 400, crop: "fill" },
                { quality: "auto:good" },
              ],
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          )
          .end(req.file.buffer);
      });

      // Delete old profile picture
      await deleteOldProfilePicture(user);

      // Update user with new profile picture
      user.profilePicture = result.secure_url;
      user.profilePicturePublicId = result.public_id;
      user.isProfileComplete = user.checkProfileComplete();

      await user.save();

      res.json({
        success: true,
        message: "Profile picture uploaded successfully to cloud",
        data: {
          profilePicture: user.profilePicture,
          publicId: user.profilePicturePublicId,
          fileSize: req.file.size,
          isProfileComplete: user.isProfileComplete,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Upload error: " + error.message });
    }
  });
});

// Route 3: Upload with Base64 (for mobile apps)
router.post("/upload-base64", async (req, res) => {
  try {
    const { imageData, fileName, userId } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: "No image data provided" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Validate base64 format
    const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
    if (!base64Regex.test(imageData)) {
      return res
        .status(400)
        .json({
          error:
            "Invalid image format. Only JPEG, PNG, GIF, and WebP are allowed.",
        });
    }

    // Extract base64 data
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Check file size (5MB limit)
    if (buffer.length > 5 * 1024 * 1024) {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 5MB." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(imageData, {
      folder: "profile_pictures",
      public_id: `user_${user._id}_${Date.now()}`,
      transformation: [
        { width: 400, height: 400, crop: "fill" },
        { quality: "auto:good" },
      ],
    });

    // Delete old profile picture
    await deleteOldProfilePicture(user);

    // Update user
    user.profilePicture = result.secure_url;
    user.profilePicturePublicId = result.public_id;
    user.isProfileComplete = user.checkProfileComplete();

    await user.save();

    res.json({
      success: true,
      message: "Profile picture uploaded successfully from base64",
      data: {
        profilePicture: user.profilePicture,
        publicId: user.profilePicturePublicId,
        isProfileComplete: user.isProfileComplete,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Upload error: " + error.message });
  }
});

// Route 4: Get user profile picture
router.get("/profile-picture/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    const user = await User.findById(userId).select("profilePicture username");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.profilePicture) {
      return res.status(404).json({ error: "No profile picture found" });
    }

    // If it's a local file, serve it
    if (!user.profilePicture.startsWith("http")) {
      try {
        await fs.access(user.profilePicture);
        return res.sendFile(path.resolve(user.profilePicture));
      } catch {
        return res
          .status(404)
          .json({ error: "Profile picture file not found" });
      }
    }

    // If it's a URL, redirect to it
    res.redirect(user.profilePicture);
  } catch (error) {
    res.status(500).json({ error: "Server error: " + error.message });
  }
});

// Route 5: Delete profile picture
router.delete("/profile-picture/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.profilePicture) {
      return res.status(400).json({ error: "No profile picture to delete" });
    }

    // Delete the file
    await deleteOldProfilePicture(user);

    // Update user
    user.profilePicture = null;
    user.profilePicturePublicId = null;
    user.isProfileComplete = user.checkProfileComplete();

    await user.save();

    res.json({
      success: true,
      message: "Profile picture deleted successfully",
      data: {
        isProfileComplete: user.isProfileComplete,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Delete error: " + error.message });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 5MB." });
    }
    return res.status(400).json({ error: error.message });
  }

  res.status(500).json({ error: "Internal server error" });
});

module.exports = router;

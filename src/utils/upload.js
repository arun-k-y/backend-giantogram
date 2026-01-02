const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Determine the correct temp directory based on the environment
const getTempDir = () => {
  // Cloud Run and other cloud platforms use /tmp
  if (process.env.RENDER || process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT) {
    const tmpPath = "/tmp";
    // Ensure /tmp exists (it should on most systems, but check anyway)
    if (!fs.existsSync(tmpPath)) {
      try {
        fs.mkdirSync(tmpPath, { recursive: true });
      } catch (err) {
        console.warn("Could not create /tmp directory:", err.message);
      }
    }
    return tmpPath;
  }
  
  // Local development - use relative tmp directory
  const tmpPath = path.join(__dirname, "..", "tmp");
  if (!fs.existsSync(tmpPath)) {
    try {
      fs.mkdirSync(tmpPath, { recursive: true });
    } catch (err) {
      console.error("Could not create tmp directory:", err.message);
      throw err;
    }
  }
  return tmpPath;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const destPath = getTempDir();
      cb(null, destPath);
    } catch (err) {
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    // Sanitize filename to prevent path traversal and special characters
    const sanitizedName = file.originalname
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9.-]/g, "")
      .substring(0, 100); // Limit filename length
    cb(null, `${Date.now()}-${sanitizedName}`);
  },
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

module.exports = upload;

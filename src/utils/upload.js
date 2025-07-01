const multer = require("multer");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isRender = process.env.RENDER; // RENDER env var exists on Render.com
    const destPath = isRender ? "/tmp" : "tmp";
    cb(null, destPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`);
  },
});

const upload = multer({ storage });

module.exports = upload;

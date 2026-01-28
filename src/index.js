// Load environment variables
require('dotenv').config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const mongoose = require("mongoose");
const authRoutes = require("./routes/auth.routes.js");
const authRoutes2 = require("./routes/user.routes.js");
const uploadRoutes = require("./routes/user.routes.js");
const notificationRoutes = require("./routes/notification.routes.js");
const { validateEnvironmentVariables, corsConfig, rateLimitConfig } = require("./config/security.js");

const cors = require("cors"); // Import the cors middleware
const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit(rateLimitConfig);
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const PORT = process.env.PORT || 2001;

// Add logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(cors(corsConfig));

app.get("/", (req, res) => {
  res.send(`Hello, this is the server running on port ${PORT}`);
});

// Validate environment variables on startup
validateEnvironmentVariables();

app.listen(PORT, () => {
  console.log("🚀 Server started on port", PORT);
  console.log("🔒 Security middleware enabled");
});

const connectWithRetry = () => {
  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/auth";
  const isCloud = mongoUri.startsWith("mongodb+srv://") || mongoUri.includes(".mongodb.net");
  if (!process.env.MONGODB_URI) {
    console.warn("⚠️  MONGODB_URI not set, using local MongoDB");
  }
  
  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log("Connected to MongoDB!");
      console.log(isCloud ? "✅ Using MongoDB Atlas (cloud)" : "✅ Using local MongoDB");
      console.log(
        `[${new Date().toISOString()}] Database connection established`
      );
    })
    .catch((err) => {
      console.error("Failed to connect to MongoDB:", err);
      console.log("Retrying in 5 seconds...");
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

mongoose.connection.on("error", (err) => {
  console.error(`[${new Date().toISOString()}] MongoDB connection error:`, err);
});

mongoose.connection.on("disconnected", () => {
  console.log(
    `[${new Date().toISOString()}] MongoDB disconnected. Attempting to reconnect...`
  );
  connectWithRetry();
});

// app.use("/uploads", express.static("uploads"));
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// const uploadsPath = path.join(__dirname, "uploads/profile_pictures");
// if (!fs.existsSync(uploadsPath)) {
//   fs.mkdirSync(uploadsPath, { recursive: true });
// }

const tmpDir = path.join(__dirname, "..", "tmp"); // or just "tmp" if relative
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}
app.use("/api/auth", authRoutes);
app.use("/v2/auth", authRoutes2);
app.use("/v2/upload", uploadRoutes);
app.use("/api/notifications", notificationRoutes);
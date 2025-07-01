const express = require("express");
const path = require("path");
const fs = require("fs");

const mongoose = require("mongoose");
const authRoutes = require("./routes/auth.routes.js");
const authRoutes2 = require("./routes/user.routes.js");
const uploadRoutes = require("./routes/user.routes.js");

const cors = require("cors"); // Import the cors middleware
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 2001;

// Add logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // ✅ PATCH added
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.get("/", (req, res) => {
  res.send(`Hello, this is the server running on port ${PORT}`);
});

app.listen(PORT, () => {
  console.log("server started on port", PORT);
});

const connectWithRetry = () => {
  mongoose
    .connect(
      "mongodb+srv://test:J62woiyoKXiosIUn@cluster0.okfsytr.mongodb.net/auth",
      { useNewUrlParser: true, useUnifiedTopology: true }
    )

    // .connect("mongodb://127.0.0.1:27017/auth", {
    //   useNewUrlParser: true,
    //   useUnifiedTopology: true,
    // })
    .then(() => {
      console.log("Connected to MongoDB!");
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

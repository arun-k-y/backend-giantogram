const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth.routes.js");
const authRoutes2 = require("./routes/user.routes.js");
const uploadRoutes = require("./routes/user.routes.js");

const cors = require("cors"); // Import the cors middleware
const app = express();
app.use(express.json());

const PORT = 2001;

// Use the cors middleware
// app.use(
//   cors({
//     origin: "http://localhost:8082", // Update this to match the frontend's origin
//     methods: "GET,POST,PUT,DELETE", // Specify the methods you want to allow
//     credentials: true, // Enable sending of cookies or other credentials
//   })
// );

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

// mongodb+srv://test:J62woiyoKXiosIUn@cluster0.okfsytr.mongodb.net/
// mongoose
//   .connect("mongodb://127.0.0.1:27017/auth")
//   .then(() => console.log("Connected to MongoDB!"))
//   .catch((err) => console.error("Failed to connect to MongoDB:", err));

mongoose
  .connect(
    "mongodb+srv://test:J62woiyoKXiosIUn@cluster0.okfsytr.mongodb.net/auth"
  )
  .then(() => console.log("Connected to MongoDB!"))
  .catch((err) => console.error("Failed to connect to MongoDB:", err));
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/v2/auth", authRoutes2);
app.use("/v2/upload", uploadRoutes);

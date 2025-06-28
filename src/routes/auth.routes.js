const express = require("express");
const jwt = require("jsonwebtoken");
const {
  signin,
  signup,
  logout,
  verify2FA,
  deactivateUser,
  reactivateUser,
  forgotPassword,
  resetPassword,
  resend2FA,
  uploadProfilePicture,
  setPassword,
  forgotPasswordUsername,
} = require("../controller/auth.controller.js");
const auth = require("../middleware/auth.js");
const upload = require("../utils/upload.js");
const User = require("../model/user.modal.js");

const router = express.Router();

router.post("/signup", signup);

router.post("/signin", signin);

router.get("/logout", logout);

router.post("/verify-email", verify2FA);

router.patch("/deactivate", auth, deactivateUser);

router.patch("/reactivate", auth, reactivateUser);

router.post("/forgot-password", forgotPassword);

router.post("/forgot-password-username", forgotPasswordUsername);

router.post("/reset-password", resetPassword);

router.post("/resend-2fa", resend2FA);

router.get("/hello", (req, res) => {
  res.json({ message: "Hello from the /hello route!" });
});

router.get("/protected", auth, (req, res) => {
  res.send({ message: "This is protected content", user: req.user });
});

router.post(
  "/upload-profile",
  auth,
  upload.single("profilePicture"),
  uploadProfilePicture
);

router.post("/set-password", auth, setPassword);

// POST /api/recovery
router.post("/add-recovery", auth, async (req, res) => {
  console.log("req.body...", req.body);
  const { emails = [], phones = [] } = req.body;
  console.log("Recovery emails:", emails);
  console.log("Recovery phones:", phones);
  if (emails.length > 4 || phones.length > 4) {
    return res.status(400).json({
      message: "Maximum 4 emails and 4 phone numbers are allowed.",
    });
  }

  try {
    await User.findByIdAndUpdate(req.user, {
      recoveryEmails: emails,
      recoveryPhones: phones,
    });
    res.json({ message: "Recovery methods updated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update" });
  }
});

router.post("/recovery", async (req, res) => {
  try {
    let user;
    // First, check if the Authorization header is provided for authentication
    const authHeader = req.header("Authorization");

    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Token provided, attempt to authenticate the user
      const token = authHeader.replace("Bearer ", "").trim();

      try {
        const decoded = jwt.verify(token, "your_jwt_secret");
        user = await User.findById(decoded._id).select(
          "recoveryEmails recoveryPhones mobile email"
        );
        if (!user) {
          return res.status(401).json({ error: "User not found." });
        }
      } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token." });
      }
    } else {
      // If no token, try to find user using the username in the body
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ message: "Username is required" });
      }

      user = await User.findOne({ username }).select(
        "recoveryEmails recoveryPhones mobile email"
      );
      console.log("User found:", user);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
    }

    // If user is found, return the recovery information
    res.json({
      emails: user.recoveryEmails || [],
      phones: user.recoveryPhones || [],
      mobile: user.mobile || "",
      email: user.email || "",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/delete-profile-picture", auth, async (req, res) => {
  try {
    const user = req.user;

    // Delete file from filesystem if needed
    if (user.profilePicture) {
      const fs = require("fs");
      const filePath = `./uploads/profile_pictures/${path.basename(
        user.profilePicture
      )}`;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    user.profilePicture = null;
    await user.save();

    res.json({ message: "Profile picture deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// router.get("/me", auth, (req, res) => {
//   const user = req.user.toObject();
//   delete user.password;
//   res.status(200).json({ user });
// });

module.exports = router;

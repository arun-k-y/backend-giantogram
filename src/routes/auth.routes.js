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
  sendResetCodeForUsernameRecovery,
  sendResetAfterUsernameSelection,
  verifyResetCode,
  requestOtp,
} = require("../controller/auth.controller.js");
const auth = require("../middleware/auth.js");
const upload = require("../utils/upload.js");
const User = require("../model/user.model.js");

const router = express.Router();

router.post("/signup", signup);

router.post("/signin", signin);

router.get("/logout", logout);

router.post("/verify-email", verify2FA);

router.patch("/deactivate", auth, deactivateUser);

router.patch("/reactivate", auth, reactivateUser);

router.post("/forgot-password", forgotPassword);

router.post("/forgot-password-username", sendResetCodeForUsernameRecovery);

router.post("/reset-password", resetPassword);

router.post("/request-otp", requestOtp);

router.post(
  "/send-reset-after-username-selection",
  sendResetAfterUsernameSelection
);

router.post("/verify-reset-code", verifyResetCode);

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
        if (!process.env.JWT_SECRET) {
          console.warn("⚠️  JWT_SECRET not found in environment variables");
        }

        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "your_jwt_secret"
        );
        user = await User.findById(decoded._id).select(
          "recoveryEmails recoveryPhones mobile email"
        );
        if (!user) {
          return res
            .status(401)
            .json({ code: 401, message: "User not found." });
        }
      } catch (err) {
        return res
          .status(401)
          .json({ code: 401, message: "Invalid or expired token." });
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
    // Include both recovery options and primary email/mobile
    const recoveryEmails = user.recoveryEmails || [];
    const recoveryPhones = user.recoveryPhones || [];

    // Include primary email if not already in recovery emails
    const allEmails = [...recoveryEmails];
    if (user.email && !allEmails.includes(user.email)) {
      allEmails.push(user.email);
    }

    // Include primary mobile if not already in recovery phones
    const allPhones = [...recoveryPhones];
    if (user.mobile && !allPhones.includes(user.mobile)) {
      allPhones.push(user.mobile);
    }

    res.json({
      emails: allEmails,
      phones: allPhones,
      mobile: user.mobile || "",
      email: user.email || "",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// router.get("/me", auth, (req, res) => {
//   const user = req.user.toObject();
//   delete user.password;
//   res.status(200).json({ user });
// });

module.exports = router;

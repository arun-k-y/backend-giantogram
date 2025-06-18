const express = require("express");
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
} = require("../controller/auth.controller.js");
const auth = require("../middleware/auth.js");
const upload = require("../utils/upload.js");

const router = express.Router();

router.post("/signup", signup);

router.post("/signin", signin);

router.get("/logout", logout);

router.post("/verify-email", verify2FA);

router.patch("/deactivate", auth, deactivateUser);

router.patch("/reactivate", auth, reactivateUser);

router.post("/forgot-password", forgotPassword);

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

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
    },
    mobile: {
      type: String,
      required: false,
    },
    password: {
      type: String,
      required: false,
      minlength: 6,
    },
    profilePicture: {
      type: String,
      required: false,
      default: null,
    },
    profilePicturePublicId: {
      type: String,
      required: false,
      default: null,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: false,
    },
    dob: {
      type: Date,
      required: true,
    },
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    twoFACode: String,
    twoFACodeExpiry: Date,
    isDeactivated: {
      type: Boolean,
      default: false,
    },
    passwordResetCode: { type: String, default: null },
    passwordResetExpiry: { type: Date, default: null },
    recoveryEmails: { type: [String], default: [] },
    recoveryPhones: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to hash the password before saving
userSchema.pre("save", async function (next) {
  const user = this;
  if (user.isModified("password")) {
    user.password = await bcrypt.hash(user.password, 10);
  }
  next();
});

// Method to generate an auth token for the user
userSchema.methods.generateAuthToken = function () {
  const user = this;
  
  if (!process.env.JWT_SECRET) {
    console.warn("⚠️  JWT_SECRET not found in environment variables");
  }
  
  const token = jwt.sign(
    { _id: user._id, username: user.username },
    process.env.JWT_SECRET || "your_jwt_secret" // Use environment variable
    // { expiresIn: "1h" }
  );
  return token;
};

// Method to check if profile is complete
userSchema.methods.checkProfileComplete = function () {
  const user = this;
  return !!user.profilePicture;
};

// Method to compare given password with the hashed password in the database
userSchema.methods.comparePassword = async function (candidatePassword) {
  const user = this;

  // Defensive checks to avoid passing undefined into bcrypt
  if (!user.password) {
    // No password set on account (e.g., created via OTP-only flow)
    return false;
  }

  if (typeof candidatePassword !== "string" || candidatePassword.length === 0) {
    return false;
  }

  return bcrypt.compare(candidatePassword, user.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;

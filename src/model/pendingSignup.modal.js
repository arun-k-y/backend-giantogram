const mongoose = require("mongoose");

const pendingSignupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
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
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: false,
    },
    dob: {
      type: Date,
      required: true,
    },
    password: {
      type: String,
      required: false,
    },
    twoFACode: {
      type: String,
      required: true,
    },
    twoFACodeExpiry: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-delete expired pending signups after 10 minutes
pendingSignupSchema.index({ twoFACodeExpiry: 1 }, { expireAfterSeconds: 600 });

// Index for quick lookup by email/mobile/username
pendingSignupSchema.index({ email: 1 });
pendingSignupSchema.index({ mobile: 1 });
pendingSignupSchema.index({ username: 1 });

const PendingSignup = mongoose.model("PendingSignup", pendingSignupSchema);

module.exports = PendingSignup;

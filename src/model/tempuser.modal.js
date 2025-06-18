const mongoose = require("mongoose");

const tempUserSchema = new mongoose.Schema(
  {
    username: String,
    email: String,
    password: String,
    twoFACode: String,
    twoFACodeExpiry: Date,
  },
  {
    timestamps: true,
  }
);

const TempUser = mongoose.model("TempUser", tempUserSchema);

module.exports = TempUser;

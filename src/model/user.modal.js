const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// const userSchema = new mongoose.Schema(
//   {
//     username: {
//       type: String,
//       required: true,
//       unique: true,
//       trim: true,
//     },
//     email: {
//       type: String,
//       required: false,
//       unique: true,
//       sparse: true, // allow multiple docs with null
//       trim: true,
//       lowercase: true,
//     },
//     mobile: {
//       type: String,
//       required: false,
//       sparse: true, // allow multiple docs with null

//       unique: true,
//       sparse: true,
//     },
//     password: {
//       type: String,
//       required: true,
//       minlength: 6,
//     },
//     gender: {
//       type: String,
//       enum: ["Male", "Female", "Other"], // optional constraint
//       required: false,
//     },
//     dob: {
//       type: Date,
//       required: true,
//     },
//     twoFACode: String,
//     twoFACodeExpiry: Date,
//     isDeactivated: {
//       type: Boolean,
//       default: false,
//     },
//     passwordResetCode: { type: String, default: null },
//     passwordResetExpiry: { type: Date, default: null },
//   },
//   {
//     timestamps: true,
//   }
// );
// const userSchema = new mongoose.Schema(
//   {
//     username: {
//       type: String,
//       required: true,
//       unique: true,
//       trim: true,
//     },
//     email: {
//       type: String,
//       required: false,
//       unique: true,
//       sparse: true, // allow multiple docs with null
//       trim: true,
//       lowercase: true,
//     },
//     mobile: {
//       type: String,
//       required: false,
//       sparse: true, // allow multiple docs with null
//       unique: true,
//     },
//     password: {
//       type: String,
//       required: true,
//       minlength: 6,
//     },
//     profilePicture: {
//       type: String, // URL or file path to the profile picture
//       required: false,
//       default: null,
//     },
//     profilePicturePublicId: {
//       type: String, // For Cloudinary or other cloud storage
//       required: false,
//       default: null,
//     },
//     gender: {
//       type: String,
//       enum: ["Male", "Female", "Other"],
//       required: false,
//     },
//     dob: {
//       type: Date,
//       required: true,
//     },
//     isProfileComplete: {
//       type: Boolean,
//       default: false, // Track if user has completed profile setup
//     },
//     twoFACode: String,
//     twoFACodeExpiry: Date,
//     isDeactivated: {
//       type: Boolean,
//       default: false,
//     },
//     passwordResetCode: { type: String, default: null },
//     passwordResetExpiry: { type: Date, default: null },
//   },
//   {
//     timestamps: true,
//   }
// );

// // Pre-save hook to hash the password before saving
// userSchema.pre("save", async function (next) {
//   const user = this;
//   if (user.isModified("password")) {
//     user.password = await bcrypt.hash(user.password, 10);
//   }
//   next();
// });

// // Method to generate an auth token for the user
// userSchema.methods.generateAuthToken = function () {
//   const user = this;
//   const token = jwt.sign(
//     { _id: user._id, username: user.username },
//     "your_jwt_secret",
//     { expiresIn: "1h" }
//   );
//   return token;
// };

// // Method to check if profile is complete
// userSchema.methods.checkProfileComplete = function () {
//   const user = this;
//   return !!user.profilePicture;
// };

// // Method to compare given password with the hashed password in the database
// userSchema.methods.comparePassword = async function (candidatePassword) {
//   const user = this;
//   return bcrypt.compare(candidatePassword, user.password);
// };

// const User = mongoose.model("User", userSchema);

// module.exports = User;


const userSchema = new mongoose.Schema(
  {
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
      // Remove unique from schema definition
      // We'll handle this with a custom index
    },
    mobile: {
      type: String,
      required: false,
      // Remove unique from schema definition
      // We'll handle this with a custom index
    },
    password: {
      type: String,
      required: true,
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
  },
  {
    timestamps: true,
  }
);

// Create custom indexes with proper sparse configuration
userSchema.index(
  { email: 1 }, 
  { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { 
      email: { $exists: true, $ne: null, $ne: "" } 
    }
  }
);

userSchema.index(
  { mobile: 1 }, 
  { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { 
      mobile: { $exists: true, $ne: null, $ne: "" } 
    }
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
  const token = jwt.sign(
    { _id: user._id, username: user.username },
    process.env.JWT_SECRET || "your_jwt_secret", // Use environment variable
    { expiresIn: "1h" }
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
  return bcrypt.compare(candidatePassword, user.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
const User = require("../model/user.modal.js");
const sendEmail = require("../utils/sendEmail.js");
const sendSMS = require("../utils/sendSMS.js"); // You'll need to implement this
const {
  isValidEmail,
  isValidMobile,
  getIdentifierType,
} = require("../utils/validators");

const cloudinary = require("../config/cloudinary.js");
function maskEmail(email) {
  const [local, domain] = email.split("@");
  return local.slice(0, 2) + "****@" + domain;
}

function maskPhone(phone) {
  return phone.replace(/.(?=.{4})/g, "*");
}
const signup = async (req, res) => {
  try {
    const { name, username, email, mobile, password, gender, dob } = req.body;
    if (!username || (!email && !mobile) || !name || !dob) {
      return res.status(400).send({
        code: "MISSING_FIELDS",
        message:
          "Username, password, DOB, and either email or mobile are required",
      });
    }

    if (email && !isValidEmail(email)) {
      return res
        .status(400)
        .send({ code: "INVALID_EMAIL", message: "Enter Valid Gmail" });
    }

    if (mobile && !isValidMobile(mobile)) {
      return res
        .status(400)
        .send({ code: "INVALID_MOBILE", message: "Enter Valid Number" });
    }

    // if (password.length < 8) {
    //   return res.status(400).send({
    //     code: "WEAK_PASSWORD",
    //     message: "Password must be at least 8 characters long",
    //   });
    // }

    const birthDate = new Date(dob);
    const age = new Date().getFullYear() - birthDate.getFullYear();
    // if (age < 13 || age > 150) {
    //   return res.status(400).send({
    //     code: "INVALID_AGE",
    //     message: "You must be between 13 and 150 years old",
    //   });
    // }

    if (age < 13) {
      return res.status(400).send({
        code: "INVALID_AGE",
        message: "At least User have to be 13 years old",
      });
    }

    if (age > 150) {
      return res.status(400).send({
        code: "INVALID_AGE",
        message: "At most User have to be 150 years old",
      });
    }

    const [usernameExists, emailExists, mobileExists] = await Promise.all([
      User.findOne({ username }),
      email ? User.findOne({ email }) : null,
      mobile ? User.findOne({ mobile }) : null,
    ]);

    if (usernameExists)
      return res
        .status(400)
        .send({ code: "USERNAME_TAKEN", message: "Username Already In Use" });
    // if (emailExists)
    //   return res
    //     .status(400)
    //     .send({ code: "EMAIL_TAKEN", message: "Email already exists" });
    // if (mobileExists)
    //   return res
    //     .status(400)
    //     .send({ code: "MOBILE_TAKEN", message: "Mobile already exists" });

    const cleanGender = gender?.trim() || undefined;
    const user = new User({
      name,
      username,
      email,
      mobile,
      // password,
      dob,
      gender: cleanGender,
    });

    // 2FA Code Generation
    const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    user.twoFACode = twoFACode;
    user.twoFACodeExpiry = expiry;

    await user.save({ validateBeforeSave: false });

    // Delivery Preference (fallback to available method)
    let deliveryMethod = email ? "email" : "sms";

    try {
      if (deliveryMethod === "email") {
        await sendEmail(
          email,
          "Giantogram Verification Code",
          `Hi ${username},\n\nWelcome to Giantogram!\n\nYour verification code is: ${twoFACode}\n\nThis code expires in 5 minutes.`
        );
      } else {
        await sendSMS(
          mobile,
          `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code expires in 5 minutes.`
        );
      }

      const userObj = user.toObject();
      delete userObj.password;
      delete userObj.twoFACode;
      delete userObj.passwordResetCode;
      delete userObj.twoFACodeExpiry;
      delete userObj.email;

      return res.status(201).send({
        code: 201,
        message: `Account created. A verification code has been sent to your ${deliveryMethod}.`,
        user: userObj,
        deliveryMethod,
        maskedDestination:
          deliveryMethod === "email"
            ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
            : mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
      });
    } catch (deliveryError) {
      console.error("Failed to deliver 2FA after signup:", deliveryError);
      return res.status(500).send({
        code: "DELIVERY_ERROR",
        message: "Account created, but failed to send verification code.",
      });
    }
  } catch (error) {
    console.error("Signup error:", error);
    return res
      .status(500)
      .send({ code: "UNKNOWN_ERROR", message: error.message });
  }
};

const signin = async (req, res) => {
  try {
    const { identifier, password, preferredMethod } = req.body; // identifier can be email or mobile

    if (!identifier || !password) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Identifier (email or mobile) and password are required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid email or mobile number or username format",
      });
    }

    // Find user by email or mobile
    // const query =
    //   identifierType === "email"
    //     ? { email: identifier }
    //     : { mobile: identifier };

    const query =
      identifierType === "email"
        ? { email: identifier }
        : identifierType === "mobile"
        ? { mobile: identifier }
        : identifierType === "username"
        ? { username: identifier }
        : null;

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(401)
        .json({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ code: "INVALID_PASSWORD", message: "Invalid password" });
    }

    // Generate 6-digit 2FA code
    const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    user.twoFACode = twoFACode;
    user.twoFACodeExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    // Determine delivery method for 2FA code
    let deliveryMethod = preferredMethod;

    // If no preferred method specified, use available method
    if (!deliveryMethod) {
      if (user.email && user.mobile) {
        deliveryMethod = "email"; // Default to email if both available
      } else if (user.email) {
        deliveryMethod = "email";
      } else if (user.mobile) {
        deliveryMethod = "sms";
      }
    }

    // Validate preferred method is available
    if (deliveryMethod === "email" && !user.email) {
      return res.status(400).json({
        code: "EMAIL_NOT_AVAILABLE",
        message: "Email verification requested but no email on file",
      });
    }

    if (deliveryMethod === "sms" && !user.mobile) {
      return res.status(400).json({
        code: "MOBILE_NOT_AVAILABLE",
        message: "SMS verification requested but no mobile number on file",
      });
    }

    try {
      if (deliveryMethod === "email") {
        await sendEmail(
          user.email,
          "Giantogram Verification Code",
          `Hello,

We received a request to sign in to your account. Please use the verification code below to continue:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. If you didn't request this, you can safely ignore this email.

Thanks,
Giantogram`
        );
      } else if (deliveryMethod === "sms") {
        await sendSMS(
          user.mobile,
          `Giantogram verification code: ${twoFACode}. This code will expire in 5 minutes.`
        );
      }

      res.status(200).json({
        code: 200,
        message: `A verification code has been sent to your ${
          deliveryMethod === "email" ? "email" : "mobile"
        }. Please enter it to continue.`,
        deliveryMethod,
        maskedDestination:
          deliveryMethod === "email"
            ? user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
            : user.mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
      });
    } catch (deliveryError) {
      console.error("Delivery error:", deliveryError);
      res.status(500).json({
        code: "DELIVERY_ERROR",
        message: "Failed to send verification code",
      });
    }
  } catch (error) {
    console.error("Signin error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
  }
};

const logout = (req, res) => {
  res.send("Logout route");
};

const verify2FA = async (req, res) => {
  try {
    const { identifier, code } = req.body; // identifier can be email or mobile

    if (!identifier || !code) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Identifier and OTP are required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid email or mobile number or username format",
      });
    }

    const query =
      identifierType === "email"
        ? { email: identifier }
        : identifierType === "mobile"
        ? { mobile: identifier }
        : identifierType === "username"
        ? { username: identifier }
        : null;

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(401)
        .json({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    if (user.twoFACode !== code) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid or expired code" });
    }

    if (user.twoFACodeExpiry < new Date()) {
      return res.status(400).json({ code: 400, message: "Code expired" });
    }

    // Clear 2FA fields after successful verification
    user.twoFACode = null;
    user.twoFACodeExpiry = null;
    await user.save({ validateBeforeSave: false });

    const userObj = user.toObject();
    delete userObj?.password;

    const token = user.generateAuthToken();
    const profilePicture = user.checkProfileComplete();
    res.status(200).json({
      code: 200,
      message: "Login successful",
      token,
      user: userObj,
      profilePicture,
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Email or mobile number or username is required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email, mobile number or username format",
      });
    }

    // Find user by email or mobile
    const query =
      identifierType === "email"
        ? { email: identifier }
        : identifierType === "mobile"
        ? { mobile: identifier }
        : identifierType === "username"
        ? { username: identifier }
        : null;

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(404)
        .json({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    if (user.isDeactivated) {
      return res.status(400).json({
        code: "ALREADY_DEACTIVATED",
        message: "User already deactivated",
      });
    }

    user.isDeactivated = true;
    await user.save({ validateBeforeSave: false });
    const userObj = user.toObject();
    delete userObj?.password;

    res.status(200).json({
      code: 200,
      message: "User successfully deactivated",
      user: userObj,
    });
  } catch (error) {
    console.error("Deactivate error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
  }
};

const reactivateUser = async (req, res) => {
  try {
    const { identifier } = req.body; // can be email or mobile

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Email or mobile number or username is required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email, mobile number or username format",
      });
    }

    // Find user by email or mobile
    const query =
      identifierType === "email"
        ? { email: identifier }
        : identifierType === "mobile"
        ? { mobile: identifier }
        : identifierType === "username"
        ? { username: identifier }
        : null;
    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(404)
        .json({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    if (!user.isDeactivated) {
      return res
        .status(400)
        .json({ code: "NOT_DEACTIVATED", message: "User is already active" });
    }

    user.isDeactivated = false;
    await user.save({ validateBeforeSave: false });
    const userObj = user.toObject();
    delete userObj?.password;

    res.status(200).json({
      code: 200,
      message: "User successfully reactivated",
      user: userObj,
    });
  } catch (error) {
    console.error("Reactivate error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
  }
};

// const forgotPassword = async (req, res) => {
//   try {
//     const { identifier, preferredMethod } = req.body; // identifier can be email or mobile

//     if (!identifier) {
//       return res.status(400).json({
//         code: "MISSING_IDENTIFIER",
//         message: "Email, mobile or username number is required",
//       });
//     }

//     const identifierType = getIdentifierType(identifier);
//     if (!identifierType) {
//       return res.status(400).json({
//         code: "INVALID_IDENTIFIER",
//         message: "Invalid email, mobile or username format",
//       });
//     }

//     const query =
//       identifierType === "email"
//         ? { email: identifier }
//         : identifierType === "mobile"
//         ? { mobile: identifier }
//         : identifierType === "username"
//         ? { username: identifier }
//         : null;

//     const user = await User.findOne(query);

//     if (!user) {
//       // For security, don't reveal if email/mobile exists or not
//       return res.status(401).json({
//         code: "USER_NOT_FOUND",
//         message: "User not found",
//       });
//     }

//     // Generate 6-digit reset code
//     const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
//     const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

//     user.passwordResetCode = resetCode;
//     user.passwordResetExpiry = expiry;
//     await user.save({ validateBeforeSave: false });

//     // Determine delivery method for reset code
//     let deliveryMethod = preferredMethod;

//     // If no preferred method specified, use the same method as identifier
//     // if (!deliveryMethod) {
//     //   if (identifierType === "email") {
//     //     deliveryMethod = "email";
//     //   } else if (identifierType === "mobile") {
//     //     deliveryMethod = "sms";
//     //   }
//     // }

//     // // If user wants different method, check if it's available
//     // if (deliveryMethod === "email" && !user.email) {
//     //   deliveryMethod = "sms";
//     // } else if (deliveryMethod === "sms" && !user.mobile) {
//     //   deliveryMethod = "email";
//     // }
// console.log("user....", user);
//     try {
//       if (user.email) {
//         await sendEmail(
//           user.email,
//           "Giantogram Password Reset Code",
//           `Hello,

// We received a request to reset your password. Please use the reset code below to create a new password:

// Reset Code: ${resetCode}

// This code will expire in 15 minutes. If you didn't request a password reset, you can safely ignore this email.

// Thanks,
// Giantogram`
//         );
//       } else if ( user.mobile) {
//         await sendSMS(
//           user.mobile,
//           `Giantogram password reset code: ${resetCode}. This code will expire in 15 minutes.`
//         );
//       }

//       res.status(200).json({
//         code: 200,
//         message:
//           "If an account with that identifier exists, a password reset code has been sent.",
//       });
//     } catch (deliveryError) {
//       console.error("Password reset delivery error:", deliveryError);
//       res.status(200).json({
//         code: 200,
//         message:
//           "If an account with that identifier exists, a password reset code has been sent.",
//       });
//     }
//   } catch (error) {
//     console.error("Forgot password error:", error);
//     res
//       .status(500)
//       .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
//   }
// };

// const forgotPassword = async (req, res) => {
//   try {
//     const { identifier, preferredMethod } = req.body;

//     if (!identifier) {
//       return res.status(400).json({
//         code: "MISSING_IDENTIFIER",
//         message: "Email, mobile or username is required",
//       });
//     }

//     const identifierType = getIdentifierType(identifier);
//     if (!identifierType) {
//       return res.status(400).json({
//         code: "INVALID_IDENTIFIER",
//         message: "Invalid email, mobile or username format",
//       });
//     }

//     const query =
//       identifierType === "email"
//         ? { email: identifier }
//         : identifierType === "mobile"
//         ? { mobile: identifier }
//         : identifierType === "username"
//         ? { username: identifier }
//         : null;

//     const user = await User.findOne(query);

//     if (!user) {
//       return res.status(401).json({
//         code: "USER_NOT_FOUND",
//         message: "User not found",
//       });
//     }

//     // If identifier is username and recovery options exist, return them
//     if (
//       identifierType === "username" &&
//       ((user.recoveryEmails && user.recoveryEmails.length > 0) ||
//         (user.recoveryPhones && user.recoveryPhones.length > 0))
//     ) {
//       const maskedEmails = user.recoveryEmails.map(maskEmail);
//       const maskedPhones = user.recoveryPhones.map(maskPhone);

//       return res.status(200).json({
//         code: "CHOOSE_RECOVERY_METHOD",
//         redirect: true,
//         emails: maskedEmails,
//         phones: maskedPhones,
//         identifier: user.username,
//         message: "Multiple recovery options found. Please choose one.",
//       });
//     }

//     const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
//     const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

//     user.passwordResetCode = resetCode;
//     user.passwordResetExpiry = expiry;
//     await user.save({ validateBeforeSave: false });

//     try {
//       if (user.email) {
//         await sendEmail(
//           user.email,
//           "Giantogram Password Reset Code",
//           `Hello,

// We received a request to reset your password. Use this code:

// Reset Code: ${resetCode}

// It expires in 15 minutes.

// – Giantogram`
//         );
//       } else if (user.mobile) {
//         await sendSMS(
//           user.mobile,
//           `Giantogram reset code: ${resetCode}. Expires in 15 mins.`
//         );
//       }

//       res.status(200).json({
//         code: 200,
//         message: "Reset code sent if contact method exists.",
//       });
//     } catch (deliveryError) {
//       console.error("Delivery failed:", deliveryError);
//       res.status(500).json({
//         code: "DELIVERY_FAILED",
//         message: "Failed to send reset code",
//       });
//     }
//   } catch (error) {
//     console.error("Forgot password error:", error);
//     res.status(500).json({
//       code: "UNKNOWN_ERROR",
//       message: "An unexpected error occurred",
//     });
//   }
// };

// const forgotPassword = async (req, res) => {
//   try {
//     const { identifier, preferredMethod } = req.body;
//     console.log("🔐 Forgot Password request received", { identifier, preferredMethod });

//     if (!identifier) {
//       console.warn("⚠️ Missing identifier in request body");
//       return res.status(400).json({
//         code: "MISSING_IDENTIFIER",
//         message: "Email, mobile or username is required",
//       });
//     }

//     const identifierType = getIdentifierType(identifier);
//     console.log("📌 Detected identifier type:", identifierType);

//     if (!identifierType) {
//       console.warn("❌ Invalid identifier format:", identifier);
//       return res.status(400).json({
//         code: "INVALID_IDENTIFIER",
//         message: "Invalid email, mobile or username format",
//       });
//     }

//     const query =
//       identifierType === "email"
//         ? { email: identifier }
//         : identifierType === "mobile"
//         ? { mobile: identifier }
//         : identifierType === "username"
//         ? { username: identifier }
//         : null;

//     console.log("🔍 Querying user with:", query);
//     const user = await User.findOne(query);

//     if (!user) {
//       console.warn("👤 User not found for identifier:", identifier);
//       return res.status(401).json({
//         code: "USER_NOT_FOUND",
//         message: "User not found",
//       });
//     }

//     console.log("✅ User found:", {
//       id: user._id,
//       username: user.username,
//       email: user.email,
//       mobile: user.mobile,
//     });

//     if (
//       identifierType === "username" &&
//       ((user.recoveryEmails && user.recoveryEmails.length > 0) ||
//         (user.recoveryPhones && user.recoveryPhones.length > 0))
//     ) {
//       const maskedEmails = user.recoveryEmails.map(maskEmail);
//       const maskedPhones = user.recoveryPhones.map(maskPhone);

//       console.log("🔄 Recovery options found for username:", {
//         emails: maskedEmails,
//         phones: maskedPhones,
//       });

//       return res.status(200).json({
//         code: "CHOOSE_RECOVERY_METHOD",
//         redirect: true,
//         emails: maskedEmails,
//         phones: maskedPhones,
//         identifier: user.username,
//         message: "Multiple recovery options found. Please choose one.",
//       });
//     }

//     const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
//     const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

//     user.passwordResetCode = resetCode;
//     user.passwordResetExpiry = expiry;
//     await user.save({ validateBeforeSave: false });

//     console.log("📨 Generated reset code:", resetCode, "Expires at:", expiry.toISOString());

//     try {
//       if (user.email) {
//         console.log("📧 Sending reset code to email:", user.email);
//         await sendEmail(
//           user.email,
//           "Giantogram Password Reset Code",
//           `Hello,

// We received a request to reset your password. Use this code:

// Reset Code: ${resetCode}

// It expires in 15 minutes.

// – Giantogram`
//         );
//       } else if (user.mobile) {
//         console.log("📱 Sending reset code to mobile:", user.mobile);
//         await sendSMS(
//           user.mobile,
//           `Giantogram reset code: ${resetCode}. Expires in 15 mins.`
//         );
//       } else {
//         console.warn("⚠️ No email or mobile found to send the reset code.");
//       }

//       console.log("✅ Reset code sent successfully.");
//       res.status(200).json({
//         code: 200,
//         message: "Reset code sent if contact method exists.",
//       });
//     } catch (deliveryError) {
//       console.error("🚨 Delivery failed:", deliveryError);
//       res.status(500).json({
//         code: "DELIVERY_FAILED",
//         message: "Failed to send reset code",
//       });
//     }
//   } catch (error) {
//     console.error("🔥 Forgot password error:", error);
//     res.status(500).json({
//       code: "UNKNOWN_ERROR",
//       message: "An unexpected error occurred",
//     });
//   }
// };


// const forgotPassword = async (req, res) => {
//   try {
//     const { identifier } = req.body;

//     if (!identifier) {
//       return res.status(400).json({
//         code: "MISSING_IDENTIFIER",
//         message: "Email, mobile or username is required",
//       });
//     }

//     const identifierType = getIdentifierType(identifier);
//     if (!identifierType) {
//       return res.status(400).json({
//         code: "INVALID_IDENTIFIER",
//         message: "Invalid email, mobile or username format",
//       });
//     }

//     let users = [];

//     if (identifierType === "username") {
//       const user = await User.findOne({ username: identifier });
//       if (!user) {
//         return res.status(401).json({
//           code: "USER_NOT_FOUND",
//           message: "Username not found",
//         });
//       }
//       users = [user];
//     } else if (identifierType === "email") {
//       users = await User.find({ email: identifier });
//     } else if (identifierType === "mobile") {
//       users = await User.find({ mobile: identifier });
//     }

//     if (!users || users.length === 0) {
//       return res.status(401).json({
//         code: "USER_NOT_FOUND",
//         message: "No users found linked to the provided identifier",
//       });
//     }

//     // If multiple usernames are found, return options
//     if (users.length > 1) {
//       const usernames = users.map((u) => ({
//         id: u._id,
//         username: u.username,
//       }));

//       return res.status(200).json({
//         code: "MULTIPLE_USERS_FOUND",
//         message: "Multiple accounts found. Please choose a username.",
//         usernames,
//       });
//     }

//     // Proceed to send reset code to the single matched user
//     const user = users[0];
//     const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
//     const expiry = new Date(Date.now() + 15 * 60 * 1000);

//     user.passwordResetCode = resetCode;
//     user.passwordResetExpiry = expiry;
//     await user.save({ validateBeforeSave: false });

//     if (user.email) {
//       await sendEmail(
//         user.email,
//         "Giantogram Password Reset Code",
//         `Your reset code is ${resetCode}. It will expire in 15 minutes.`
//       );
//     } else if (user.mobile) {
//       await sendSMS(user.mobile, `Reset code: ${resetCode}. Valid for 15 mins.`);
//     }

//     return res.status(200).json({
//       code: "RESET_CODE_SENT",
//       message: "Reset code sent to your email or mobile.",
//     });
//   } catch (error) {
//     console.error("Forgot password error:", error);
//     res.status(500).json({
//       code: "SERVER_ERROR",
//       message: "An unexpected error occurred.",
//     });
//   }
// };

const forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Email, mobile or username is required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid email, mobile or username format",
      });
    }

    // 💡 1. If identifier is a username → return recovery options if present
    if (identifierType === "username") {
      const user = await User.findOne({ username: identifier });

      if (!user) {
        return res.status(401).json({
          code: "USER_NOT_FOUND",
          message: "Username not found",
        });
      }

      const hasRecoveryOptions =
        (user.recoveryEmails && user.recoveryEmails.length > 0) ||
        (user.recoveryPhones && user.recoveryPhones.length > 0);

      if (hasRecoveryOptions) {
        return res.status(200).json({
          code: "CHOOSE_RECOVERY_METHOD",
          redirect: true,
          identifier: user.username,
          emails: user.recoveryEmails.map(maskEmail),
          phones: user.recoveryPhones.map(maskPhone),
          message: "Multiple recovery options found. Please choose one.",
        });
      }

      // Proceed to send reset code directly if no recovery options
      return sendResetCode(user, res);
    }

    // 💡 2. If identifier is email or mobile → return linked usernames
    const query = identifierType === "email" ? { email: identifier } : { mobile: identifier };
    const users = await User.find(query);

    if (!users || users.length === 0) {
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "No accounts found linked to this " + identifierType,
      });
    }

    if (users.length > 1) {
      return res.status(200).json({
        code: "MULTIPLE_USERS_FOUND",
        message: "Multiple accounts found. Please choose a username.",
        usernames: users.map((u) => ({ id: u._id, username: u.username })),
      });
    }

    // Single user → send code
    return sendResetCode(users[0], res);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      code: "SERVER_ERROR",
      message: "An unexpected error occurred.",
    });
  }
};

// 🔄 Reusable reset code handler
async function sendResetCode(user, res) {
  try {
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry

    user.passwordResetCode = resetCode;
    user.passwordResetExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    if (user.email) {
      await sendEmail(user.email, "Giantogram Reset Code", `Reset code: ${resetCode}`);
    } else if (user.mobile) {
      await sendSMS(user.mobile, `Reset code: ${resetCode}`);
    }

    return res.status(200).json({
      code: "RESET_CODE_SENT",
      message: "Reset code sent successfully.",
    });
  } catch (error) {
    console.error("Send code failed:", error);
    return res.status(500).json({
      code: "DELIVERY_FAILED",
      message: "Failed to send reset code.",
    });
  }
}



const sendResetCodeForUsernameRecovery = async (req, res) => {
  try {
    const { username, identifier, preferredMethod } = req.body; // identifier can be email or mobile

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Email or mobile number is required",
      });
    }

    const identifierType = getIdentifierType(identifier);

    const user = await User.findOne({ username });

    if (!user) {
      // For security, don't reveal if email/mobile exists or not
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    if (
      !user.recoveryEmails.includes(identifier) &&
      !user.recoveryPhones.includes(identifier)
    ) {
      return res.status(400).json({
        code: "INVALID_RECOVERY_METHOD",
        message: "Identifier is not a valid recovery method for this user",
      });
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    user.passwordResetCode = resetCode;
    user.passwordResetExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    // Determine delivery method for reset code
    let deliveryMethod = preferredMethod;

    try {
      console.log("identifierType", identifierType);
      if (identifierType === "email") {
        await sendEmail(
          identifier,
          "Giantogram Password Reset Code",
          `Hello,

We received a request to reset your password. Please use the reset code below to create a new password:

Reset Code: ${resetCode}

This code will expire in 15 minutes. If you didn't request a password reset, you can safely ignore this email.

Thanks,
Giantogram`
        );
      } else if (identifierType === "mobile") {
        await sendSMS(
          identifier,
          `Giantogram password reset code: ${resetCode}. This code will expire in 15 minutes.`
        );
      }

      res.status(200).json({
        code: 200,
        message:
          "If an account with that identifier exists, a password reset code has been sent.",
      });
    } catch (deliveryError) {
      console.error("Password reset delivery error:", deliveryError);
      res.status(200).json({
        code: 200,
        message:
          "If an account with that identifier exists, a password reset code has been sent.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { identifier, resetCode, newPassword } = req.body;

    console.log({ identifier, resetCode, newPassword });

    if (!newPassword) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Enter Password",
      });
    }

    if (newPassword?.trim()?.length < 8) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Password must contain 8 characters",
      });
    }

    if (!resetCode || resetCode?.trim()?.length === 0) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Enter OTP",
      });
    }

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Username, monile or email is required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid email, mobile or username format",
      });
    }

    // Find user by email or mobile
    // const query =
    //   identifierType === "email"
    //     ? { email: identifier }
    //     : { mobile: identifier };

    const query =
      identifierType === "email"
        ? { email: identifier }
        : identifierType === "mobile"
        ? { mobile: identifier }
        : identifierType === "username"
        ? { username: identifier }
        : null;
    const user = await User.findOne(query);

    if (!user) {
      return res.status(400).json({
        code: "INVALID_RESET",
        message: "Invalid reset code or identifier",
      });
    }

    if (user.passwordResetCode !== resetCode) {
      return res.status(400).json({
        code: "INVALID_RESET_CODE",
        message: "Invalid reset code",
      });
    }

    if (user.passwordResetExpiry < new Date()) {
      return res.status(400).json({
        code: "RESET_CODE_EXPIRED",
        message: "Reset code has expired. Please request a new one.",
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordResetCode = null;
    user.passwordResetExpiry = null;

    // Clear any existing 2FA codes for security
    user.twoFACode = null;
    user.twoFACodeExpiry = null;

    await user.save({ validateBeforeSave: false });

    // Send confirmation to both email and mobile if available
    const confirmationMessage = `Hello,

Your password has been successfully changed. If you didn't make this change, please contact our support team immediately.

Thanks,
Giantogram`;

    try {
      if (user.email) {
        await sendEmail(
          user.email,
          "Giantogram Password Changed",
          confirmationMessage
        );
      }
      if (user.mobile) {
        await sendSMS(
          user.mobile,
          "Giantogram: Your password has been successfully changed. If you didn't make this change, please contact support."
        );
      }
    } catch (notificationError) {
      console.error("Password change notification error:", notificationError);
      // Don't fail the password reset if notification fails
    }

    res.status(200).json({
      code: 200,
      message: "Password has been successfully reset",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
  }
};

const resend2FA = async (req, res) => {
  try {
    const { identifier, preferredMethod } = req.body;

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Email, mobile or username is required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid email, mobile or username format",
      });
    }

    // Find user by email or mobile
    const query =
      identifierType === "email"
        ? { email: identifier }
        : identifierType === "mobile"
        ? { mobile: identifier }
        : identifierType === "username"
        ? { username: identifier }
        : null;

    const user = await User.findOne(query);

    if (!user) {
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // Generate new 6-digit 2FA code
    const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    user.twoFACode = twoFACode;
    user.twoFACodeExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    // Determine delivery method for 2FA code
    let deliveryMethod = preferredMethod;

    // If no preferred method specified, use available method
    if (!deliveryMethod) {
      if (user.email && user.mobile) {
        deliveryMethod = "email"; // Default to email if both available
      } else if (user.email) {
        deliveryMethod = "email";
      } else if (user.mobile) {
        deliveryMethod = "sms";
      }
    }

    // Validate preferred method is available
    if (deliveryMethod === "email" && !user.email) {
      return res.status(400).json({
        code: "EMAIL_NOT_AVAILABLE",
        message: "Email verification requested but no email on file",
      });
    }

    if (deliveryMethod === "sms" && !user.mobile) {
      return res.status(400).json({
        code: "MOBILE_NOT_AVAILABLE",
        message: "SMS verification requested but no mobile number on file",
      });
    }

    try {
      if (deliveryMethod === "email") {
        await sendEmail(
          user.email,
          "Giantogram Verification Code",
          `Hello,

We received a request to resend your verification code. Please use the code below to continue:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. If you didn't request this, you can safely ignore this email.

Thanks,
Giantogram`
        );
      } else if (deliveryMethod === "sms") {
        await sendSMS(
          user.mobile,
          `Giantogram verification code: ${twoFACode}. This code will expire in 5 minutes.`
        );
      }

      res.status(200).json({
        code: 200,
        message: `A new verification code has been sent to your ${
          deliveryMethod === "email" ? "email" : "mobile"
        }.`,
        deliveryMethod,
        maskedDestination:
          deliveryMethod === "email"
            ? user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
            : user.mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
      });
    } catch (deliveryError) {
      console.error("Delivery error:", deliveryError);
      res.status(500).json({
        code: "DELIVERY_ERROR",
        message: "Failed to send verification code",
      });
    }
  } catch (error) {
    console.error("Resend 2FA error:", error);
    res.status(500).json({
      code: "UNKNOWN_ERROR",
      message: "An unexpected error occurred",
    });
  }
};

const setPassword = async (req, res) => {
  console.log("Request Body:", req.body);

  try {
    const { password } = req.body;

    const { user } = req; // The user is now attached to `req` by the `auth` middleware

    console.log("user....", user, password);
    if (!password) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Enter Passowrd",
      });
    }

    if (password?.trim()?.length < 8) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Password must contain 8 characters",
      });
    }
    // console.log("usr....", req)
    const user1 = await User.findOne(user._id);

    // Update password
    user1.password = password;

    await user1.save({ validateBeforeSave: false });

    // Send confirmation to both email and mobile if available
    const confirmationMessage = `Hello,

Your password has been successfully set.

Thanks,
Giantogram`;

    try {
      if (user1.email) {
        await sendEmail(
          user1.email,
          "Giantogram Password Set",
          confirmationMessage
        );
      }
      if (user1.mobile) {
        await sendSMS(
          user1.mobile,
          "Giantogram: Your password has been successfully set."
        );
      }
    } catch (notificationError) {
      console.error("Password change notification error:", notificationError);
      // Don't fail the password reset if notification fails
    }

    res.status(200).json({
      code: 200,
      message: "Password has been successfully set",
    });
  } catch (error) {
    console.error("Set password error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An unexpected error occurred" });
  }
};

const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ code: "NO_FILE", message: "No file uploaded" });
    }

    const user = req.user;

    // Optional: Extract public_id from old URL to delete old image
    if (user.profilePicture) {
      const publicIdMatch = user.profilePicture.match(
        /\/profile_pictures\/([^/.]+)/
      );
      if (publicIdMatch?.[1]) {
        await cloudinary.uploader.destroy(
          `profile_pictures/${publicIdMatch[1]}`
        );
      }
    }

    // Upload new image with a fixed public_id to overwrite or create new
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "profile_pictures",
      public_id: user._id.toString(), // So it's always the same ID per user
      overwrite: true,
      resource_type: "image",
    });

    // Save the new URL
    user.profilePicture = result.secure_url;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      code: 200,
      message: "Uploaded successfully",
      profilePicture: user.profilePicture,
    });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ code: "UPLOAD_ERROR", message: err.message });
  }
};



const sendResetAfterUsernameSelection = async (req, res) => {
  try {
    const { identifier, username } = req.body;

    if (!identifier || !username) {
      return res.status(400).json({
        code: "MISSING_DATA",
        message: "Both username and identifier are required",
      });
    }

    const identifierType = getIdentifierType(identifier);

    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid email or mobile format",
      });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message: "Username does not exist",
      });
    }

    // Generate OTP
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiry

    user.passwordResetCode = resetCode;
    user.passwordResetExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    try {
      if (identifierType === "email") {
        await sendEmail(
          identifier,
          "Giantogram Password Reset Code",
          `Hello ${username},

We received a request to reset your password.

Your reset code is: ${resetCode}

This code expires in 15 minutes.

– Team Giantogram`
        );
      } else if (identifierType === "mobile") {
        await sendSMS(
          identifier,
          `Giantogram reset code for ${username}: ${resetCode}. Expires in 15 minutes.`
        );
      }

      return res.status(200).json({
        code: "RESET_SENT",
        message: "Reset code sent to provided contact",
      });
    } catch (err) {
      console.error("Reset delivery error:", err);
      return res.status(500).json({
        code: "DELIVERY_FAILED",
        message: "Failed to send reset code",
      });
    }
  } catch (err) {
    console.error("Error in sendResetAfterUsernameSelection:", err);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "An unexpected error occurred",
    });
  }
};



module.exports = {
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
  sendResetAfterUsernameSelection
};

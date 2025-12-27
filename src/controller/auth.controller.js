const User = require("../model/user.modal.js");
const sendEmail = require("../utils/sendEmail.js");
const sendSMS = require("../utils/sendSMS.js");
const {
  isValidEmail,
  isValidMobile,
  getIdentifierType,
} = require("../utils/validators");

const cloudinary = require("../config/cloudinary.js");
const { validatePassword } = require("../config/security.js");

function maskEmail(email) {
  const [local, domain] = email.split("@");
  return local.slice(0, 2) + "****@" + domain;
}

function maskPhone(phone) {
  return phone.replace(/.(?=.{4})/g, "*");
}

const APP_HASH = process.env.APP_HASH || "vqWGL1M7Unb";

const requestOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        code: "MISSING_MOBILE",
        message: "Mobile Number Is Required",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // valid for 5 mins

    let user = await User.findOne({ mobile });

    if (!user) {
      let username;
      do {
        username = `user${Math.floor(100000 + Math.random() * 900000)}`;
      } while (await User.findOne({ username }));

      user = new User({
        mobile,
        username,
        name: "Giantogram User",
        dob: new Date("2000-01-01"),
      });
    }

    user.twoFACode = otp;
    user.twoFACodeExpiry = expiry;

    await user.save({ validateBeforeSave: false });

    const message = `<#> Your Giantogram OTP is: ${otp}\n${APP_HASH}`;

    await sendSMS(mobile, message);

    res.status(200).json({
      code: 200,
      message: "OTP Sent Successfully",
      deliveryMethod: "sms",
    });
  } catch (err) {
    console.error("OTP SEND ERROR:", err);
    res.status(500).json({
      code: "OTP_SEND_FAILED",
      message: "Failed To Send OTP",
    });
  }
};

const signup = async (req, res) => {
  try {
    const { name, username, email, mobile, gender, dob } = req.body;
    if (!username || (!email && !mobile) || !name || !dob) {
      return res.status(400).send({
        code: "MISSING_FIELDS",
        message:
          "Username, Password, DOB, And Either Email Or Mobile Are Required",
      });
    }

    if (email && !isValidEmail(email)) {
      return res
        .status(400)
        .send({ code: "INVALID_EMAIL", message: "Enter Valid Gmail/Email" });
    }

    if (mobile && !isValidMobile(mobile)) {
      return res
        .status(400)
        .send({ code: "INVALID_MOBILE", message: "Enter Valid Number" });
    }

    const birthDate = new Date(dob);
    const age = new Date().getFullYear() - birthDate.getFullYear();

    if (age < 13) {
      return res.status(400).send({
        code: "INVALID_AGE",
        message: "At Least User Have To Be 13 Teen Years Old",
      });
    }

    if (age > 150) {
      return res.status(400).send({
        code: "INVALID_AGE",
        message: "User Can Have Maximum Of 150 Years Only",
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
        message: "Account Created, But Failed To Send Verification Code.",
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

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Identifier (Email, Mobile, Or Username) Is Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      // Identify what type of identifier the user was trying to enter
      let errorMessage = "Invalid email or mobile number or username format";

      if (identifier.includes("@")) {
        errorMessage = "Enter Valid Email/Gmail";
      } else if (/^\d+$/.test(identifier)) {
        // Numeric input without + prefix - suggest selecting country code
        errorMessage = "Enter Valid Username or select country code for mobile number";
      } else if (identifier.trim().length > 0) {
        errorMessage = "Enter Valid Username";
      }

      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: errorMessage,
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

    // If password is not provided, check if account exists and respond accordingly
    if (!password) {
      if (!user) {
        // Account doesn't exist - return appropriate error message based on identifier type
        let errorMessage = "No account found";
        
        if (identifierType === "email") {
          errorMessage = "Enter Valid Email/Gmail";
        } else if (identifierType === "mobile") {
          errorMessage = "Enter Valid Number";
        } else if (identifierType === "username") {
          // If it's a 10-digit number treated as username, suggest it might need country code
          // if (/^\d{10}$/.test(identifier)) {
          //   errorMessage = "Enter Valid Username or select country code for mobile number";
          // } else {
            errorMessage = "Enter Valid Username";
          // }
        }
        
        return res.status(400).json({
          code: "ACCOUNT_NOT_FOUND",
          message: errorMessage,
        });
      }
      // Account exists - ask for password
      return res.status(400).json({
        code: "PASSWORD_REQUIRED",
        message: "Password Is Required",
      });
    }

    // If account doesn't exist, create user with dummy data and send OTP
    if (!user) {
      // For username, if account doesn't exist, return error (can't create account without email/mobile for OTP)
      if (identifierType === "username") {
        return res.status(401).json({
          code: "USER_NOT_FOUND",
          message: "Enter Valid Username",
        });
      }

      // Create user with dummy data for email/mobile
      const dummyData = {
        name: "Giantogram User",
        dob: new Date("2000-01-01"),
      };

      // Set identifier based on type
      if (identifierType === "email") {
        dummyData.email = identifier;
        // Generate username for email-based account
        let username;
        do {
          username = `user${Math.floor(100000 + Math.random() * 900000)}`;
        } while (await User.findOne({ username }));
        dummyData.username = username;
      } else if (identifierType === "mobile") {
        dummyData.mobile = identifier;
        // Generate username for mobile-based account
        let username;
        do {
          username = `user${Math.floor(100000 + Math.random() * 900000)}`;
        } while (await User.findOne({ username }));
        dummyData.username = username;
      }

      // Set password
      dummyData.password = password;

      user = new User(dummyData);

      // Generate 6-digit 2FA code
      const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      user.twoFACode = twoFACode;
      user.twoFACodeExpiry = expiry;
      await user.save({ validateBeforeSave: false });

      // Determine delivery method
      let deliveryMethod = preferredMethod || (identifierType === "email" ? "email" : "sms");

      try {
        if (deliveryMethod === "email" && user.email) {
          await sendEmail(
            user.email,
            "Giantogram Verification Code",
            `Hello,

Welcome to Giantogram! Please use the verification code below to verify your account:

Verification Code: ${twoFACode}

This code will expire in 5 minutes.

Thanks,
Giantogram`
          );
        } else if (deliveryMethod === "sms" && user.mobile) {
          await sendSMS(
            user.mobile,
            `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code will expire in 5 minutes.`
          );
        } else {
          // Should not happen, but handle gracefully
          return res.status(500).json({
            code: "DELIVERY_ERROR",
            message: "Unable to send verification code. Please try again.",
          });
        }

        return res.status(200).json({
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
        return res.status(500).json({
          code: "DELIVERY_ERROR",
          message: "Failed To Send Verification Code",
        });
      }
    }

    // If the account doesn't have a password (e.g., created via OTP-only flow), inform the client
    if (!user.password) {
      return res.status(400).json({
        code: "PASSWORD_NOT_SET",
        message:
          "This account does not have a password. Please use OTP sign-in or set a password first.",
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ code: "INVALID_PASSWORD", message: "Invalid Password" });
    }

    // Password is valid - skip OTP and return token directly
    const userObj = user.toObject();
    delete userObj?.password;
    delete userObj?.twoFACode;
    delete userObj?.twoFACodeExpiry;

    const token = user.generateAuthToken();
    const profilePicture = user.checkProfileComplete();

    return res.status(200).json({
      code: 200,
      message: "Login Successful",
      token,
      user: userObj,
      profilePicture,
      skipOtp: true, // Flag to indicate OTP was skipped
    });
  } catch (error) {
    console.error("Signin error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An Unexpected Error Occurred" });
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
        message: "Identifier And OTP Are Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email Or Mobile Number Or Username Format",
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
        .json({ code: "USER_NOT_FOUND", message: "No Account Found" });
    }

    if (user.twoFACode !== code) {
      return res
        .status(400)
        .json({ code: 400, message: "Enter Valid OTP" });
    }

    if (user.twoFACodeExpiry < new Date()) {
      return res.status(400).json({ code: 400, message: "Code Expired" });
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
      message: "Login Successful",
      token,
      user: userObj,
      profilePicture,
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An Unexpected Error Occurred" });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Email Or Mobile Number Or Username Is Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email, Mobile Number Or Username Format",
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
        .json({ code: "USER_NOT_FOUND", message: "No Account Found" });
    }

    if (user.isDeactivated) {
      return res.status(400).json({
        code: "ALREADY_DEACTIVATED",
        message: "User Already Deactivated",
      });
    }

    user.isDeactivated = true;
    await user.save({ validateBeforeSave: false });
    const userObj = user.toObject();
    delete userObj?.password;

    res.status(200).json({
      code: 200,
      message: "User Successfully Deactivated",
      user: userObj,
    });
  } catch (error) {
    console.error("Deactivate error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An Unexpected Error Occurred" });
  }
};

const reactivateUser = async (req, res) => {
  try {
    const { identifier } = req.body; // can be email or mobile

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Email Or Mobile Number Or Username Is Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email, Mobile Number Or Username Format",
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
        .json({ code: "USER_NOT_FOUND", message: "No Account Found" });
    }

    if (!user.isDeactivated) {
      return res
        .status(400)
        .json({ code: "NOT_DEACTIVATED", message: "User Is Already Active" });
    }

    user.isDeactivated = false;
    await user.save({ validateBeforeSave: false });
    const userObj = user.toObject();
    delete userObj?.password;

    res.status(200).json({
      code: 200,
      message: "User Successfully Reactivated",
      user: userObj,
    });
  } catch (error) {
    console.error("Reactivate error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An Unexpected Error Occurred" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Enter Username, Email Or Number",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Enter A Valid Username, Email Or Number",
      });
    }

    // 💡 1. If identifier is a username → always return recovery options
    // Username is always associated with one number or email, so always show choose-recovery
    if (identifierType === "username") {
      const user = await User.findOne({ username: identifier });

      if (!user) {
        return res.status(401).json({
          code: "USER_NOT_FOUND",
          message: "No Account Found",
        });
      }

      // Always return CHOOSE_RECOVERY_METHOD for username
      // Include both recovery options (if any) and primary email/mobile
      const recoveryEmails = user.recoveryEmails || [];
      const recoveryPhones = user.recoveryPhones || [];

      // Include primary email/mobile if not already in recovery options
      const allEmails = [...recoveryEmails];
      if (user.email && !allEmails.includes(user.email)) {
        allEmails.push(user.email);
      }

      const allPhones = [...recoveryPhones];
      if (user.mobile && !allPhones.includes(user.mobile)) {
        allPhones.push(user.mobile);
      }

      return res.status(200).json({
        code: "CHOOSE_RECOVERY_METHOD",
        redirect: true,
        identifier: user.username,
        emails: allEmails.map(maskEmail),
        phones: allPhones.map(maskPhone),
        message: "Please Choose A Recovery Method.",
      });
    }

    // 💡 2. If identifier is email or mobile → return linked usernames
    const query =
      identifierType === "email"
        ? { email: identifier }
        : { mobile: identifier };
    const users = await User.find(query);

    if (!users || users.length === 0) {
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "No Account Found",
      });
    }

    if (users.length > 1) {
      return res.status(200).json({
        code: "MULTIPLE_USERS_FOUND",
        message: "Multiple Accounts Found. Please Choose A Username.",
        usernames: users.map((u) => ({ id: u._id, username: u.username })),
      });
    }

    // Single user → send code
    return sendResetCode(users[0], res);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      code: "SERVER_ERROR",
      message: "An Unexpected Error Occurred.",
    });
  }
};

// 🔄 Reusable reset code handler
async function sendResetCode(user, res, username = null) {
  try {
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    user.passwordResetCode = resetCode;
    user.passwordResetExpiry = expiry;
    await user.save({ validateBeforeSave: false });

    if (user.email) {
      await sendEmail(
        user.email,
        "Giantogram Password Reset Code",
        `Password Reset code: ${resetCode}`
      );
      return res.status(200).json({
        code: "RESET_CODE_SENT",
        message: "Password Reset Code Sent Has Been Sent To Your Email.",
        maskedDestination: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        deliveryMethod: "email",
        username: username || user.username, // Include username for frontend navigation
      });
    } else if (user.mobile) {
      await sendSMS(user.mobile, `Password Reset code: ${resetCode}`);
      return res.status(200).json({
        code: "RESET_CODE_SENT",
        message: "Password Reset Code Sent Has Been Sent To Your Mobile.",
        maskedDestination: user.mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
        deliveryMethod: "mobile",
        username: username || user.username, // Include username for frontend navigation
      });
    }
  } catch (error) {
    console.error("Send code failed:", error);
    return res.status(500).json({
      code: "DELIVERY_FAILED",
      message: "Failed To Send Reset Code.",
    });
  }
}

const sendResetCodeForUsernameRecovery = async (req, res) => {
  try {
    const { username, identifier, preferredMethod } = req.body; // identifier can be email or mobile

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_IDENTIFIER",
        message: "Email Or Mobile Number Is Required",
      });
    }

    const identifierType = getIdentifierType(identifier);

    const user = await User.findOne({ username });

    if (!user) {
      // For security, don't reveal if email/mobile exists or not
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "No Account Found",
      });
    }

    // Check if identifier is a valid recovery method
    // It can be in recoveryEmails/recoveryPhones OR be the user's primary email/mobile
    const isRecoveryEmail =
      user.recoveryEmails && user.recoveryEmails.includes(identifier);
    const isRecoveryPhone =
      user.recoveryPhones && user.recoveryPhones.includes(identifier);
    const isPrimaryEmail = user.email === identifier;
    const isPrimaryMobile = user.mobile === identifier;

    if (
      !isRecoveryEmail &&
      !isRecoveryPhone &&
      !isPrimaryEmail &&
      !isPrimaryMobile
    ) {
      return res.status(400).json({
        code: "INVALID_RECOVERY_METHOD",
        message: "Identifier Is Not A Valid Recovery Method For This User",
      });
    }

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

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

This code will expire in 5 minutes. If you didn't request a password reset, you can safely ignore this email.

Thanks,
Giantogram`
        );
      } else if (identifierType === "mobile") {
        await sendSMS(
          identifier,
          `Giantogram password reset code: ${resetCode}. This code will expire in 5 minutes.`
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
      .json({ code: "UNKNOWN_ERROR", message: "An Unexpected Error Occurred" });
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

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        code: "INVALID_PASSWORD",
        message: passwordValidation.message,
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
        message: "Username, Mobile Or Email Is Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email, Mobile Or Username Format",
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
      return res.status(400).json({
        code: "INVALID_RESET",
        message: "Invalid Reset Code Or Identifier",
      });
    }

    if (user.passwordResetCode !== resetCode) {
      return res.status(400).json({
        code: "INVALID_RESET_CODE",
        message: "Invalid Reset Code",
      });
    }

    if (user.passwordResetExpiry < new Date()) {
      return res.status(400).json({
        code: "RESET_CODE_EXPIRED",
        message: "Reset Code Has Expired. Please Request A New One.",
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

    // Generate auth token for automatic login after password reset
    const token = user.generateAuthToken();
    const userObj = user.toObject();
    delete userObj?.password;
    delete userObj?.passwordResetCode;
    delete userObj?.passwordResetExpiry;
    delete userObj?.twoFACode;
    delete userObj?.twoFACodeExpiry;

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
      message: "Password Has Been Successfully Reset",
      token,
      user: userObj,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An Unexpected Error Occurred" });
  }
};

const resend2FA = async (req, res) => {
  try {
    const { identifier, preferredMethod } = req.body;

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Email, Mobile Or Username Is Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email, Mobile Or Username Format",
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
        message: "No Account Found",
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
        message: "Email Verification Requested But No Email On File",
      });
    }

    if (deliveryMethod === "sms" && !user.mobile) {
      return res.status(400).json({
        code: "MOBILE_NOT_AVAILABLE",
        message: "SMS Verification Requested But No Mobile Number On File",
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
        message: "Failed To Send Verification Code",
      });
    }
  } catch (error) {
    console.error("Resend 2FA error:", error);
    res.status(500).json({
      code: "UNKNOWN_ERROR",
      message: "An Unexpected Error Occurred",
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
        message: "Enter Password",
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        code: "INVALID_PASSWORD",
        message: passwordValidation.message,
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
      message: "Password Has Been Successfully Set",
    });
  } catch (error) {
    console.error("Set password error:", error);
    res
      .status(500)
      .json({ code: "UNKNOWN_ERROR", message: "An Unexpected Error Occurred" });
  }
};

const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ code: "NO_FILE", message: "No File Uploaded" });
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
      message: "Uploaded Successfully",
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
        message: "Both Username And Identifier Are Required",
      });
    }

    const identifierType = getIdentifierType(identifier);

    if (!identifierType) {
      return res.status(400).json({
        code: "INVALID_IDENTIFIER",
        message: "Invalid Email Or Mobile Format",
      });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        message: "No Account Found",
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

Password reset code: ${resetCode}

This code expires in 15 minutes.

– Team Giantogram`
        );
      } else if (identifierType === "mobile") {
        await sendSMS(
          identifier,
          `Giantogram Password reset code for ${username}: ${resetCode}. Expires in 15 minutes.`
        );
      }

      return res.status(200).json({
        code: "RESET_SENT",
        message: "Reset Code Sent To Provided Contact",
        maskedDestination:
          identifierType === "email"
            ? maskEmail(identifier)
            : maskPhone(identifier),
        deliveryMethod: identifierType,
      });
    } catch (err) {
      console.error("Reset delivery error:", err);
      return res.status(500).json({
        code: "DELIVERY_FAILED",
        message: "Failed To Send Reset Code",
      });
    }
  } catch (err) {
    console.error("Error in sendResetAfterUsernameSelection:", err);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: "An Unexpected Error Occurred",
    });
  }
};

const verifyResetCode = async (req, res) => {
  try {
    const { identifier, username, code } = req.body;

    if (!code) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Reset Code Is Required",
      });
    }

    // If username is provided, use it to find the user (username is unique)
    // Otherwise, fall back to identifier lookup
    let user;
    if (username) {
      user = await User.findOne({ username });
    } else if (identifier) {
      const identifierType = getIdentifierType(identifier);
      if (!identifierType) {
        return res.status(400).json({
          code: "INVALID_IDENTIFIER",
          message: "Invalid Email, Mobile Or Username Format",
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

      user = await User.findOne(query);
    } else {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Either Identifier Or Username Is Required",
      });
    }

    if (!user) {
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "No Account Found",
      });
    }

    if (user.passwordResetCode !== code) {
      return res.status(400).json({
        code: "INVALID_RESET_CODE",
        message: "Enter Valid OTP",
      });
    }

    if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({
        code: "RESET_CODE_EXPIRED",
        message: "Reset Code Has Expired. Please Request A New One.",
      });
    }

    // Don't clear the reset code yet - it will be cleared when password is set
    // Return success with user info
    const userObj = user.toObject();
    delete userObj?.password;

    res.status(200).json({
      code: 200,
      message: "Reset Code Verified Successfully",
      user: userObj,
      hasRecoveryOptions:
        (user.recoveryEmails && user.recoveryEmails.length > 0) ||
        (user.recoveryPhones && user.recoveryPhones.length > 0),
    });
  } catch (error) {
    console.error("Verify reset code error:", error);
    res.status(500).json({
      code: "SERVER_ERROR",
      message: "An Unexpected Error Occurred",
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
  sendResetAfterUsernameSelection,
  verifyResetCode,
  requestOtp,
};

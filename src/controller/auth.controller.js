const User = require("../model/user.modal.js");
const PendingSignup = require("../model/pendingSignup.modal.js");
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

    // Validate name length (max 25 characters)
    if (name && name.trim().length > 25) {
      return res.status(400).send({
        code: "INVALID_NAME",
        message: "Name Cannot Exceed 25 Characters",
      });
    }

    // Validate username doesn't contain spaces
    if (username.includes(" ")) {
      return res.status(400).send({
        code: "INVALID_USERNAME",
        message: "Username Cannot Contain Spaces",
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

    // Check if username already exists in User collection (only username is unique)
    const usernameExists = await User.findOne({ username });

    if (usernameExists)
      return res
        .status(400)
        .send({ code: "USERNAME_TAKEN", message: "Username Already In Use" });

    // Check if there's already a pending signup for this username
    const pendingUsername = await PendingSignup.findOne({ username });

    if (pendingUsername) {
      // Delete old pending signup if exists
      await PendingSignup.deleteMany({ username });
    }

    const cleanGender = gender?.trim() || undefined;

    // 2FA Code Generation
    const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store signup data in PendingSignup instead of creating User
    const pendingSignup = new PendingSignup({
      name,
      username,
      email,
      mobile,
      dob,
      gender: cleanGender,
      twoFACode,
      twoFACodeExpiry: expiry,
    });

    await pendingSignup.save();

    // Delivery Preference (fallback to available method)
    let deliveryMethod = email ? "email" : "sms";

    try {
      if (deliveryMethod === "email") {
        await sendEmail(
          email,
          "Welcome to Giantogram - Verify Your Account",
          `Hello ${name || username},

Welcome to Giantogram! We're excited to have you join our community.

To complete your account registration, please use the verification code below:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Please enter it in the app to verify your account and start using Giantogram.

If you didn't create an account with Giantogram, please ignore this email.

Best regards,
The Giantogram Team`
        );
      } else {
        await sendSMS(
          mobile,
          `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code expires in 5 minutes.`
        );
      }

      return res.status(200).send({
        code: 200,
        message: `A verification code has been sent to your ${deliveryMethod}. Please verify to create your account.`,
        deliveryMethod,
        maskedDestination:
          deliveryMethod === "email"
            ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
            : mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
      });
    } catch (deliveryError) {
      console.error("Failed to deliver 2FA after signup:", deliveryError);
      // Delete pending signup if OTP delivery fails
      await PendingSignup.deleteOne({ _id: pendingSignup._id });
      return res.status(500).send({
        code: "DELIVERY_ERROR",
        message: "Failed To Send Verification Code. Please Try Again.",
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

    console.log("Signin request:", {
      identifier,
      hasPassword: !!password,
      preferredMethod,
    });

    if (!identifier) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Identifier (Email, Mobile, Or Username) Is Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    console.log("Identifier type detected:", identifierType);
    if (!identifierType) {
      // Identify what type of identifier the user was trying to enter
      let errorMessage = "Invalid email or mobile number or username format";

      if (identifier.includes("@")) {
        errorMessage = "Enter Valid Email/Gmail";
      } else if (/^\d+$/.test(identifier)) {
        // Numeric input without + prefix - suggest selecting country code
        errorMessage =
          "Enter Valid Username or select country code for mobile number";
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
    console.log(
      "User found:",
      !!user,
      "Password provided:",
      !!password,
      "Password value:",
      password
    );

    // Check if password is provided (not empty string)
    const hasPassword = password && password.trim().length > 0;

    // If password is not provided, check if account exists and respond accordingly
    if (!hasPassword) {
      if (!user) {
        // Account doesn't exist and no password - allow account creation flow
        // If identifier is username, we can't send OTP (no email/mobile to send to)
        // User must use email/mobile to create account
        if (identifierType === "username") {
          return res.status(400).json({
            code: "ACCOUNT_NOT_FOUND",
            message:
              "No account found with this username. Please use your email or mobile number to login or create an account.",
          });
        }

        // Generate unique username
        let username;
        do {
          username = `user${Math.floor(100000 + Math.random() * 900000)}`;
        } while (
          (await User.findOne({ username })) ||
          (await PendingSignup.findOne({ username }))
        );

        // Generate 6-digit 2FA code
        const twoFACode = Math.floor(
          100000 + Math.random() * 900000
        ).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Determine email/mobile based on identifier type
        const email = identifierType === "email" ? identifier : undefined;
        const mobile = identifierType === "mobile" ? identifier : undefined;

        // Check if there's already a pending signup for this identifier
        const existingPending = await PendingSignup.findOne(
          identifierType === "email"
            ? { email }
            : identifierType === "mobile"
            ? { mobile }
            : { username: identifier }
        );

        // Delete old pending signup if exists
        if (existingPending) {
          await PendingSignup.deleteOne({ _id: existingPending._id });
        }

        // Create pending signup with dummy data (no password since user didn't provide one)
        const pendingSignup = new PendingSignup({
          name: "Giantogram User",
          username,
          email,
          mobile,
          dob: new Date("2000-01-01"),
          twoFACode,
          twoFACodeExpiry: expiry,
        });

        await pendingSignup.save();

        // Determine delivery method
        let deliveryMethod = preferredMethod || (email ? "email" : "sms");

        try {
          if (deliveryMethod === "email" && email) {
            await sendEmail(
              email,
              "Welcome to Giantogram - Verify Your Account",
              `Hello Giantogram User,

Welcome to Giantogram! We're excited to have you join our community.

To complete your account registration, please use the verification code below:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Please enter it in the app to verify your account and start using Giantogram.

If you didn't create an account with Giantogram, please ignore this email.

Best regards,
The Giantogram Team`
            );
          } else if (deliveryMethod === "sms" && mobile) {
            await sendSMS(
              mobile,
              `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code expires in 5 minutes.`
            );
          } else {
            // If requested method not available, try the other one
            if (email && deliveryMethod === "sms") {
              deliveryMethod = "email";
              await sendEmail(
                email,
                "Welcome to Giantogram - Verify Your Account",
                `Hello Giantogram User,

Welcome to Giantogram! We're excited to have you join our community.

To complete your account registration, please use the verification code below:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Please enter it in the app to verify your account and start using Giantogram.

If you didn't create an account with Giantogram, please ignore this email.

Best regards,
The Giantogram Team`
              );
            } else if (mobile && deliveryMethod === "email") {
              deliveryMethod = "sms";
              await sendSMS(
                mobile,
                `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code expires in 5 minutes.`
              );
            } else {
              // Delete pending signup if we can't send OTP
              await PendingSignup.deleteOne({ _id: pendingSignup._id });
              return res.status(400).json({
                code: "DELIVERY_METHOD_UNAVAILABLE",
                message:
                  "Unable to send verification code. Please check your identifier.",
              });
            }
          }

          console.log(
            "Sending ACCOUNT_CREATION_REQUIRED response (no password provided)"
          );
          return res.status(200).json({
            code: "ACCOUNT_CREATION_REQUIRED",
            message: `A verification code has been sent to your ${
              deliveryMethod === "email" ? "email" : "mobile"
            }. Please verify to create your account.`,
            deliveryMethod,
            maskedDestination:
              deliveryMethod === "email"
                ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
                : mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
            identifier: identifier,
          });
        } catch (deliveryError) {
          console.error(
            "Failed to deliver OTP for account creation:",
            deliveryError
          );
          await PendingSignup.deleteOne({ _id: pendingSignup._id });
          return res.status(500).json({
            code: "DELIVERY_ERROR",
            message: "Failed To Send Verification Code. Please Try Again.",
          });
        }
      }
      // Account exists but no password provided
      // If account has no password set, allow OTP login
      if (!user.password) {
        // Generate OTP for login
        const twoFACode = Math.floor(
          100000 + Math.random() * 900000
        ).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        user.twoFACode = twoFACode;
        user.twoFACodeExpiry = expiry;
        await user.save({ validateBeforeSave: false });

        // Determine delivery method
        let deliveryMethod = preferredMethod;
        if (!deliveryMethod) {
          if (user.email && user.mobile) {
            deliveryMethod = "email"; // Default to email if both available
          } else if (user.email) {
            deliveryMethod = "email";
          } else if (user.mobile) {
            deliveryMethod = "sms";
          }
        }

        // Send OTP
        try {
          if (deliveryMethod === "email" && user.email) {
            await sendEmail(
              user.email,
              "Giantogram - Sign In Verification Code",
              `Hello ${user.name || user.username},

We received a request to sign in to your Giantogram account.

Please use the verification code below to complete your sign-in:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Enter it in the app to access your account.

If you didn't request this sign-in, please ignore this email.

Stay secure,
The Giantogram Team`
            );
          } else if (deliveryMethod === "sms" && user.mobile) {
            await sendSMS(
              user.mobile,
              `Giantogram verification code: ${twoFACode}. This code will expire in 5 minutes.`
            );
          } else {
            return res.status(400).json({
              code: "DELIVERY_METHOD_UNAVAILABLE",
              message:
                "Unable to send verification code. No email or mobile on file.",
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

      // Account exists and has password - ask for password
      return res.status(400).json({
        code: "PASSWORD_REQUIRED",
        message: "Password Is Required",
      });
    }

    if (!user) {
      console.log(
        "User not found - creating account. Identifier type:",
        identifierType
      );
      // Account doesn't exist - create pending signup with dummy data and send OTP
      // If identifier is username, we can't send OTP (no email/mobile)
      if (identifierType === "username") {
        console.log(
          "Username identifier - cannot create account without email/mobile"
        );
        return res.status(400).json({
          code: "ACCOUNT_NOT_FOUND",
          message:
            "No account found with this username. Please use email or mobile number to create an account.",
        });
      }

      // Generate unique username
      let username;
      do {
        username = `user${Math.floor(100000 + Math.random() * 900000)}`;
      } while (
        (await User.findOne({ username })) ||
        (await PendingSignup.findOne({ username }))
      );

      // Generate 6-digit 2FA code
      const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Determine email/mobile based on identifier type
      const email = identifierType === "email" ? identifier : undefined;
      const mobile = identifierType === "mobile" ? identifier : undefined;

      // Check if there's already a pending signup for this identifier
      const existingPending = await PendingSignup.findOne(
        identifierType === "email"
          ? { email }
          : identifierType === "mobile"
          ? { mobile }
          : { username: identifier }
      );

      // Delete old pending signup if exists
      if (existingPending) {
        await PendingSignup.deleteOne({ _id: existingPending._id });
      }

      // Create pending signup with dummy data
      // Store password if provided (will be hashed when user is created)
      const pendingSignup = new PendingSignup({
        name: "Giantogram User",
        username,
        email,
        mobile,
        dob: new Date("2000-01-01"),
        password: password, // Store password to save when account is created
        twoFACode,
        twoFACodeExpiry: expiry,
      });

      await pendingSignup.save();

      // Determine delivery method
      let deliveryMethod = preferredMethod || (email ? "email" : "sms");

      try {
        if (deliveryMethod === "email" && email) {
          await sendEmail(
            email,
            "Welcome to Giantogram - Verify Your Account",
            `Hello Giantogram User,

Welcome to Giantogram! We're excited to have you join our community.

To complete your account registration, please use the verification code below:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Please enter it in the app to verify your account and start using Giantogram.

If you didn't create an account with Giantogram, please ignore this email.

Best regards,
The Giantogram Team`
          );
        } else if (deliveryMethod === "sms" && mobile) {
          await sendSMS(
            mobile,
            `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code expires in 5 minutes.`
          );
        } else {
          // If requested method not available, try the other one
          if (email && deliveryMethod === "sms") {
            deliveryMethod = "email";
            await sendEmail(
              email,
              "Welcome to Giantogram - Verify Your Account",
              `Hello Giantogram User,

Welcome to Giantogram! We're excited to have you join our community.

To complete your account registration, please use the verification code below:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Please enter it in the app to verify your account and start using Giantogram.

If you didn't create an account with Giantogram, please ignore this email.

Best regards,
The Giantogram Team`
            );
          } else if (mobile && deliveryMethod === "email") {
            deliveryMethod = "sms";
            await sendSMS(
              mobile,
              `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code expires in 5 minutes.`
            );
          } else {
            // Delete pending signup if we can't send OTP
            await PendingSignup.deleteOne({ _id: pendingSignup._id });
            return res.status(400).json({
              code: "DELIVERY_METHOD_UNAVAILABLE",
              message:
                "Unable to send verification code. Please check your identifier.",
            });
          }
        }

        console.log("Sending ACCOUNT_CREATION_REQUIRED response");
        return res.status(200).json({
          code: "ACCOUNT_CREATION_REQUIRED",
          message: `A verification code has been sent to your ${
            deliveryMethod === "email" ? "email" : "mobile"
          }. Please verify to create your account.`,
          deliveryMethod,
          maskedDestination:
            deliveryMethod === "email"
              ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
              : mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
          identifier: identifier, // Return the identifier for OTP verification
        });
      } catch (deliveryError) {
        console.error(
          "Failed to deliver OTP for account creation:",
          deliveryError
        );
        // Delete pending signup if OTP delivery fails
        await PendingSignup.deleteOne({ _id: pendingSignup._id });
        return res.status(500).json({
          code: "DELIVERY_ERROR",
          message: "Failed To Send Verification Code. Please Try Again.",
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

    // Check if account is deactivated - return user data with token so frontend can show reactivate modal
    // We still return a token so the user can reactivate without re-entering credentials
    const userObj = user.toObject();
    delete userObj?.password;

    // If account is deactivated, return token and user data so frontend can show reactivate modal
    if (user.isDeactivated) {
      const token = user.generateAuthToken();
      const profilePicture = user.checkProfileComplete();

      return res.status(200).json({
        code: 200,
        message: "Account is deactivated",
        token,
        user: userObj,
        profilePicture,
        skipOtp: true,
      });
    }

    // Password is valid and account is active - skip OTP and return token directly
    const token = user.generateAuthToken();
    const profilePicture = user.checkProfileComplete();

    res.status(200).json({
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

    console.log("Verify2FA request:", { identifier, code });

    if (!identifier || !code) {
      return res.status(400).json({
        code: "MISSING_FIELDS",
        message: "Identifier And OTP Are Required",
      });
    }

    const identifierType = getIdentifierType(identifier);
    console.log("Verify2FA identifier type:", identifierType);
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

    console.log("Verify2FA query:", query);

    // First check for pending signup (signup flow)
    const pendingSignup = await PendingSignup.findOne(query);
    console.log("Pending signup found:", !!pendingSignup);

    if (pendingSignup) {
      // This is a signup flow - verify OTP and create account
      // Check if OTP was requested
      if (!pendingSignup.twoFACode || !pendingSignup.twoFACodeExpiry) {
        return res.status(400).json({
          code: "OTP_NOT_REQUESTED",
          message: "Please Request A New OTP Code",
        });
      }

      // Check if OTP has expired
      if (pendingSignup.twoFACodeExpiry < new Date()) {
        return res.status(400).json({
          code: "CODE_EXPIRED",
          message: "Code Expired. Please Request A New One.",
        });
      }

      // Check if OTP matches
      if (pendingSignup.twoFACode !== code) {
        return res.status(400).json({
          code: "INVALID_CODE",
          message: "Enter Valid OTP",
        });
      }

      // Check again if username already exists (race condition check - only username is unique)
      const usernameExists = await User.findOne({
        username: pendingSignup.username,
      });

      if (usernameExists) {
        // Account was created in the meantime, delete pending signup
        await PendingSignup.deleteOne({ _id: pendingSignup._id });
        return res.status(400).json({
          code: "ACCOUNT_EXISTS",
          message: "Account Already Exists. Please Login Instead.",
        });
      }

      // Create the user account
      console.log("Creating user from pending signup:", {
        name: pendingSignup.name,
        username: pendingSignup.username,
        email: pendingSignup.email,
        mobile: pendingSignup.mobile,
        dob: pendingSignup.dob,
        hasPassword: !!pendingSignup.password,
      });

      // Build user object - only include password if it exists
      const userData = {
        name: pendingSignup.name,
        username: pendingSignup.username,
        email: pendingSignup.email,
        mobile: pendingSignup.mobile,
        dob: pendingSignup.dob,
        gender: pendingSignup.gender,
      };

      // Only add password if it was provided
      if (pendingSignup.password && pendingSignup.password.trim().length > 0) {
        userData.password = pendingSignup.password;
      }

      const user = new User(userData);

      try {
        await user.save({ validateBeforeSave: false });
        console.log("User created successfully:", user._id);
      } catch (saveError) {
        console.error("Error saving user:", saveError);
        throw saveError;
      }

      // Delete pending signup after successful account creation
      await PendingSignup.deleteOne({ _id: pendingSignup._id });

      const userObj = user.toObject();
      delete userObj?.password;

      const token = user.generateAuthToken();
      const profilePicture = user.checkProfileComplete();
      return res.status(200).json({
        code: 200,
        message: "Account Created Successfully",
        token,
        user: userObj,
        profilePicture,
      });
    }

    // Check for existing user (login flow)
    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(401)
        .json({ code: "USER_NOT_FOUND", message: "No Account Found" });
    }

    // Check if OTP was requested
    if (!user.twoFACode || !user.twoFACodeExpiry) {
      return res.status(400).json({
        code: "OTP_NOT_REQUESTED",
        message: "Please Request A New OTP Code",
      });
    }

    // Check if OTP has expired
    if (user.twoFACodeExpiry < new Date()) {
      return res.status(400).json({
        code: "CODE_EXPIRED",
        message: "Code Expired. Please Request A New One.",
      });
    }

    // Check if OTP matches
    if (user.twoFACode !== code) {
      return res.status(400).json({
        code: "INVALID_CODE",
        message: "Enter Valid OTP",
      });
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
    console.error("Error stack:", error.stack);
    console.error("Error details:", {
      message: error.message,
      name: error.name,
    });
    res.status(500).json({
      code: "UNKNOWN_ERROR",
      message: "An Unexpected Error Occurred",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
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

    // 💡 2. If identifier is email or mobile → always return usernames (even if single user)
    // This ensures consistent flow: user selects username → then chooses recovery method
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

    // Always return MULTIPLE_USERS_FOUND for email/mobile (even if single user)
    // This ensures user always sees username selection screen
    return res.status(200).json({
      code: "MULTIPLE_USERS_FOUND",
      message:
        users.length > 1
          ? "Multiple Accounts Found. Please Choose A Username."
          : "Please Choose A Username.",
      usernames: users.map((u) => ({ id: u._id, username: u.username })),
    });
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
        "Giantogram - Password Reset Code",
        `Hello ${user.name || user.username},

We received a request to reset the password for your Giantogram account.

Please use the reset code below to create a new password:

Reset Code: ${resetCode}

This code will expire in 5 minutes. Enter it in the app to reset your password.

If you didn't request a password reset:
- You can safely ignore this email
- Your password will remain unchanged
- If you're concerned about account security, please contact our support team

Stay secure,
The Giantogram Team`
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
          "Giantogram - Password Reset Code",
          `Hello,

We received a request to reset the password for your Giantogram account.

Please use the reset code below to create a new password:

Reset Code: ${resetCode}

This code will expire in 5 minutes. Enter it in the app to reset your password.

Security Tips:
- Never share your reset code with anyone
- Choose a strong, unique password
- If you didn't request this reset, please ignore this email

If you're concerned about account security, please contact our support team immediately.

Stay secure,
The Giantogram Team`
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
    const confirmationMessage = `Hello ${user.name || user.username},

Your Giantogram account password has been successfully changed.

If you made this change, you can safely ignore this email.

If you didn't make this change:
- Your account may be compromised
- Please contact our support team immediately
- Consider reviewing your account security settings

Account Details:
- Username: ${user.username}
- Time: ${new Date().toLocaleString()}

Stay secure,
The Giantogram Team`;

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

    // First check for pending signup (signup flow)
    const pendingSignup = await PendingSignup.findOne(query);

    if (pendingSignup) {
      // This is a signup flow - resend OTP for pending signup
      const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      pendingSignup.twoFACode = twoFACode;
      pendingSignup.twoFACodeExpiry = expiry;
      await pendingSignup.save();

      // Determine delivery method
      let deliveryMethod =
        preferredMethod || (pendingSignup.email ? "email" : "sms");

      try {
        if (deliveryMethod === "email" && pendingSignup.email) {
          await sendEmail(
            pendingSignup.email,
            "Giantogram - New Verification Code",
            `Hello ${pendingSignup.name || pendingSignup.username},

We've generated a new verification code for your Giantogram account registration.

Please use the verification code below to complete your account setup:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Enter it in the app to verify your account.

If you didn't request a new code, you can safely ignore this email.

Best regards,
The Giantogram Team`
          );
        } else if (deliveryMethod === "sms" && pendingSignup.mobile) {
          await sendSMS(
            pendingSignup.mobile,
            `Welcome to Giantogram! Your verification code is: ${twoFACode}. This code expires in 5 minutes.`
          );
        } else {
          return res.status(400).json({
            code: "DELIVERY_METHOD_UNAVAILABLE",
            message: "Requested Delivery Method Not Available",
          });
        }

        return res.status(200).json({
          code: 200,
          message: `A new verification code has been sent to your ${
            deliveryMethod === "email" ? "email" : "mobile"
          }.`,
          deliveryMethod,
          maskedDestination:
            deliveryMethod === "email"
              ? pendingSignup.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
              : pendingSignup.mobile.replace(/(.{2})(.*)(.{2})/, "$1***$3"),
        });
      } catch (deliveryError) {
        console.error("Delivery error:", deliveryError);
        return res.status(500).json({
          code: "DELIVERY_ERROR",
          message: "Failed To Send Verification Code",
        });
      }
    }

    // Check for existing user (login flow)
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
          "Giantogram - New Sign In Verification Code",
          `Hello ${user.name || user.username},

We've generated a new verification code for your Giantogram account sign-in.

Please use the verification code below to complete your sign-in:

Verification Code: ${twoFACode}

This code will expire in 5 minutes. Enter it in the app to access your account.

If you didn't request a new verification code:
- You can safely ignore this email
- Your account remains secure
- If you're concerned, please contact our support team

Stay secure,
The Giantogram Team`
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
    const confirmationMessage = `Hello ${user1.name || user1.username},

Your Giantogram account password has been successfully set.

Your account is now secured with a password. You can use this password along with your username, email, or mobile number to sign in to your account.

Security Tips:
- Never share your password with anyone
- Use a unique password that you don't use elsewhere
- Consider enabling two-factor authentication for added security

If you didn't set this password:
- Please contact our support team immediately
- Consider changing your password right away

Account Details:
- Username: ${user1.username}
- Time: ${new Date().toLocaleString()}

Stay secure,
The Giantogram Team`;

    try {
      if (user1.email) {
        await sendEmail(
          user1.email,
          "Giantogram - Password Successfully Set",
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
    // Check if file was uploaded
    if (!req.file) {
      console.error("Upload error: No file received");
      return res
        .status(400)
        .json({ code: "NO_FILE", message: "No File Uploaded" });
    }

    // Check if user is authenticated
    if (!req.user) {
      console.error("Upload error: User not authenticated");
      return res
        .status(401)
        .json({ code: "UNAUTHORIZED", message: "User not authenticated" });
    }

    const user = req.user;

    // Check if file path exists
    if (!req.file.path) {
      console.error("Upload error: File path is missing");
      return res
        .status(400)
        .json({ code: "INVALID_FILE", message: "File path is missing" });
    }

    // Verify file actually exists on disk
    const fs = require("fs");
    if (!fs.existsSync(req.file.path)) {
      console.error(
        "Upload error: File does not exist at path:",
        req.file.path
      );
      return res
        .status(400)
        .json({ code: "FILE_NOT_FOUND", message: "Uploaded file not found" });
    }

    // Check Cloudinary configuration
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error("Upload error: Cloudinary credentials not configured");
      return res
        .status(500)
        .json({
          code: "CONFIG_ERROR",
          message: "Upload service not configured",
        });
    }

    // Optional: Extract public_id from old URL to delete old image
    if (user.profilePicture) {
      try {
        const publicIdMatch = user.profilePicture.match(
          /\/profile_pictures\/([^/.]+)/
        );
        if (publicIdMatch?.[1]) {
          await cloudinary.uploader.destroy(
            `profile_pictures/${publicIdMatch[1]}`
          );
        }
      } catch (deleteErr) {
        // Log but don't fail if old image deletion fails
        console.warn(
          "Failed to delete old profile picture:",
          deleteErr.message
        );
      }
    }

    // Upload new image with a fixed public_id to overwrite or create new
    let result;
    try {
      result = await cloudinary.uploader.upload(req.file.path, {
        folder: "profile_pictures",
        public_id: user._id.toString(), // So it's always the same ID per user
        overwrite: true,
        resource_type: "image",
      });

      // Clean up temporary file after successful upload
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.warn("Failed to delete temporary file:", cleanupErr.message);
        // Don't fail the request if cleanup fails
      }
    } catch (uploadErr) {
      // Clean up temporary file even if upload fails
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupErr) {
        console.warn(
          "Failed to delete temporary file after error:",
          cleanupErr.message
        );
      }

      console.error("Cloudinary upload error:", uploadErr);
      return res.status(500).json({
        code: "UPLOAD_ERROR",
        message: `Failed to upload image: ${uploadErr.message}`,
      });
    }

    if (!result || !result.secure_url) {
      console.error("Upload error: Invalid response from Cloudinary");
      return res.status(500).json({
        code: "UPLOAD_ERROR",
        message: "Invalid response from upload service",
      });
    }

    // Save the new URL
    try {
      user.profilePicture = result.secure_url;
      await user.save({ validateBeforeSave: false });
    } catch (saveErr) {
      console.error("Database save error:", saveErr);
      return res.status(500).json({
        code: "SAVE_ERROR",
        message: `Failed to save profile picture: ${saveErr.message}`,
      });
    }

    res.status(200).json({
      code: 200,
      message: "Uploaded Successfully",
      profilePicture: user.profilePicture,
      url: user.profilePicture, // Also include 'url' for backward compatibility
    });
  } catch (err) {
    console.error("Upload profile picture error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      code: "UPLOAD_ERROR",
      message: err.message || "An unexpected error occurred during upload",
    });
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
          "Giantogram - Password Reset Code",
          `Hello ${username},

We received a request to reset the password for your Giantogram account.

Please use the reset code below to create a new password:

Reset Code: ${resetCode}

This code will expire in 15 minutes. Enter it in the app to reset your password.

Security Reminders:
- Never share your reset code with anyone
- Choose a strong, unique password
- If you didn't request this reset, please ignore this email

If you're concerned about account security, please contact our support team immediately.

Stay secure,
The Giantogram Team`
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

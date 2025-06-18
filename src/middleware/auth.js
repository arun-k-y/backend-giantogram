// const jwt = require("jsonwebtoken");

// const auth = async(req, res, next) => {
//   const token = req.header("Authorization")?.replace("Bearer ", "");

//   //   const authHeader = req.headers.authorization;

//   // if (!authHeader || !authHeader.startsWith("Bearer ")) {
//   //   return res.status(401).json({
//   //     code: "AUTH_HEADER_MISSING",
//   //     message: "Authorization header missing or malformed",
//   //   });
//   // }

//   // const token = authHeader.split(" ")[1];

//   // // Verify token
//   const decoded = jwt.verify(token, process.env.JWT_SECRET);
//   const user = await User.findById(decoded._id);

//   if (!token) {
//     return res.status(401).json({ error: "Access denied. No token provided." });
//   }

//   try {
//     const decoded = jwt.verify(token, "your_jwt_secret"); // Match your secret
//     req.user = decoded; // Add user data to request object
//     next();
//   } catch (err) {
//     res.status(400).json({ error: "Invalid token." });
//   }
// };

// module.exports = auth;

const jwt = require("jsonwebtoken");
const User = require("../model/user.modal.js"); // make sure this path is correct

const auth = async (req, res, next) => {
    console.log("inside auth")

  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        code: "AUTH_HEADER_MISSING",
        message: "Authorization header missing or malformed",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const decoded = jwt.verify(token, "your_jwt_secret");
    const user = await User.findById(decoded._id);

    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    req.user = user; // Attach full user to req
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

module.exports = auth;

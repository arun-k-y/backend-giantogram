const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.js");

router.get("/protected",auth,  (req, res) => {
  res.send({ message: "This is protected content", user: req.user });
});

module.exports = router;

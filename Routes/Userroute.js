const express = require("express");
const router = express.Router();
const { registerUser, loginUser } = require("../Controller/Usercontroller");
const { adminAccess } = require("../Controller/Admincontroller");

router.post("/register", registerUser);
router.post("/login", loginUser);

// Also accept admin-access under user route if requested
router.post("/admin-access", adminAccess);

module.exports = router;


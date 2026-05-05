const express = require("express");
const router = express.Router();

const User = require("../models/User");
const generateToken = require("../utils/generateToken");

router.post("/register", async (req, res) => {
  try {
    const { code, email, password } = req.body;

    if (!code || !email || !password) {
      return res
        .status(400)
        .json({ message: "Code, email and password are required" });
    }

    const exists = await User.findOne({ $or: [{ email }, { code }] });

    if (exists) {
      return res
        .status(409)
        .json({ message: "User with this email or code already exists" });
    }

    const user = await User.create({ code, email, password });
    const token = generateToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    user.lastLogin = Date.now();

    await user.save();

    const token = generateToken(user);

    res.status(200).json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/me", async (req, res) => {
  try {
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();

const Department = require("../models/Department");
const generateToken = require("../utils/generateToken");

router.get("/departments", async (req, res) => {
  try {
    const departments = await Department.find();
    res.status(200).json({ departments });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/departments/:id", async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }
    res.status(200).json({ department });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/departments", async (req, res) => {
  try {
    const { name } = req.body;
    const department = await Department.create({ name });
    res.status(201).json({ department });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/departments/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      { name, color?, description? },
      { new: true },
    );
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }
    res.status(200).json({ department });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.delete("/departments/:id", async (req, res) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);
    if (!department) {
        return res.status(404).json({ message: "Department not found" });
    }
    res.status(200).json({ message: "Department deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;

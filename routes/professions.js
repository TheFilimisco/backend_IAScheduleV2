const express = require("express");
const router = express.Router();

const Profession = require("../models/Profession");

router.get("/", async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    const professions = await Profession.find(filter);
    res.status(200).json({ professions });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const profession = await Profession.findById(req.params.id).populate("departmentId");
    if (!profession) {
      return res.status(404).json({ error: "Profession not found" });
    }
    res.status(200).json({ profession });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, departmentId, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const exists = await Profession.findOne({ name: name.trim() });
    if (exists) {
      return res.status(409).json({ error: "Profession with this name already exists" });
    }

    const profession = await Profession.create({ name, departmentId, description });
    res.status(201).json({ profession });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { name, departmentId, description, isActive } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (departmentId !== undefined) updates.departmentId = departmentId;
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.isActive = isActive;

    const profession = await Profession.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!profession) {
      return res.status(404).json({ error: "Profession not found" });
    }
    res.status(200).json({ profession });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const profession = await Profession.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!profession) {
      return res.status(404).json({ error: "Profession not found" });
    }
    res.status(200).json({ message: "Profession deactivated", profession });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;

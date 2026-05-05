const express = require("express");
const router = express.Router();

const Department = require("../models/Department");
const Employee = require("../models/Employee");

router.get("/", async (req, res) => {
  try {
    const departments = await Department.find();
    res.status(200).json({ departments });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/:id", async (req, res) => {
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

router.get("/:name", async (req, res) => {
  try {
    const department = await Department.findOne({ name: req.params.name });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }
    res.status(200).json({ department });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, color, description, managerId } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    const department = await Department.create({
      name,
      color,
      description,
      managerId,
    });
    res.status(201).json({ department });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { name, color, description, managerId } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;
    if (description !== undefined) updates.description = description;
    if (managerId !== undefined) updates.managerId = managerId;
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      updates,
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

router.delete("/:id", async (req, res) => {
  try {
    const employees = await Employee.find({ departmentId: req.params.id });
    if (employees.length > 0) {
      return res.status(409).json({
        message: "Cannot delete department with assigned employees",
      });
    }

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

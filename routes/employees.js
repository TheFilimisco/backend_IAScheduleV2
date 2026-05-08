const express = require("express");
const router = express.Router();

const Employee = require("../models/Employee");
const Department = require("../models/Department");

router.get("/by-department", async (req, res) => {
  try {
    const employees = await Employee.find({ status: "active" }).populate(
      "departmentId",
    );
    const grouped = {};
    for (const emp of employees) {
      const deptName = emp.departmentId?.name || "Sin departamento";
      if (!grouped[deptName]) grouped[deptName] = [];
      grouped[deptName].push(`${emp.firstName} ${emp.lastName}`);
    }
    res.status(200).json(grouped);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    const employees = await Employee.find(filter)
      .populate("departmentId")
      .populate("professionId");
    res.status(200).json({ employees });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate("departmentId")
      .populate("professionId")
      .populate("managerId");
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }
    res.status(200).json({ employee });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { code, firstName, lastName, email, professionId, departmentId, birthday, schedule, role, managerId } = req.body;

    if (!code || !firstName || !lastName || !email) {
      return res.status(400).json({ error: "code, firstName, lastName and email are required" });
    }

    if (departmentId) {
      const dept = await Department.findById(departmentId);
      if (!dept) {
        return res.status(404).json({ error: "Department not found" });
      }
    }

    const exists = await Employee.findOne({ $or: [{ email }, { code }] });
    if (exists) {
      return res.status(409).json({ error: "Employee with this email or code already exists" });
    }

    const employee = await Employee.create({
      code, firstName, lastName, email, professionId, departmentId, birthday, schedule, role, managerId,
    });

    res.status(201).json({ employee });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { code, firstName, lastName, email, professionId, departmentId, birthday, schedule, role, managerId, status } = req.body;

    const updates = {};
    if (code !== undefined) updates.code = code;
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (email !== undefined) updates.email = email;
    if (professionId !== undefined) updates.professionId = professionId;
    if (departmentId !== undefined) updates.departmentId = departmentId;
    if (birthday !== undefined) updates.birthday = birthday;
    if (schedule !== undefined) updates.schedule = schedule;
    if (role !== undefined) updates.role = role;
    if (managerId !== undefined) updates.managerId = managerId;
    if (status !== undefined) updates.status = status;

    const employee = await Employee.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
      .populate("departmentId")
      .populate("professionId");

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.status(200).json({ employee });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { status: "inactive" },
      { new: true },
    );

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.status(200).json({ message: "Employee deactivated", employee });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;

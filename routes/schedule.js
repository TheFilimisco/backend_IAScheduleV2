const express = require("express");
const router = express.Router();
const Department = require("../models/Department");
const Employee = require("../models/Employee");
const Task = require("../models/Task");

router.get("/", async (req, res) => {
  try {
    const departments = await Department.find();
    const employees = await Employee.find({ status: "active" })
      .populate("departmentId")
      .populate("professionId");
    const tasks = await Task.find();

    res.status(200).json({ departments, employees, tasks });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.get("/sections", async (req, res) => {
  try {
    const departments = await Department.find();
    const employees = await Employee.find({ status: "active" });
    const tasks = await Task.find();

    res.status(200).json([
      { title: "Departments", items: departments },
      { title: "Employees", items: employees },
      { title: "Tasks", items: tasks },
    ]);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

router.get("/employees-by-dept", async (req, res) => {
  try {
    const employees = await Employee.find({ status: "active" }).populate("departmentId");
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

router.get("/enums", async (req, res) => {
  try {
    res.status(200).json({
      schedules: ["morning", "early", "late", "night", "flexible"],
      roles: ["employee", "supervisor", "manager", "trainee"],
      priorities: ["low", "medium", "high", "urgent"],
      statuses: ["pending", "in_progress", "completed", "blocked"],
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;

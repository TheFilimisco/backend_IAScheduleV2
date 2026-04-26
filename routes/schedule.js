const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const Task = require('../models/Task');

// GET /api/schedule
// Devuelve la carga inicial del calendario y estado (todos los dptos, empleados y tareas)
router.get('/', async (req, res) => {
  try {
    const departments = await Department.find();
    const employees = await Employee.find();
    const tasks = await Task.find();

    res.json({ departments, employees, tasks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los datos del schedule' });
  }
});

module.exports = router;

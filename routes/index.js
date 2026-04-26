const express = require('express');
const router = express.Router();

const iaRoutes = require('./ia');
const scheduleRoutes = require('./schedule');

router.use('/ia', iaRoutes);
router.use('/schedule', scheduleRoutes);

// Pendiente añadir las rutas CRUD
// router.use('/departments', require('./departments'));
// router.use('/employees', require('./employees'));
// router.use('/tasks', require('./tasks'));

module.exports = router;

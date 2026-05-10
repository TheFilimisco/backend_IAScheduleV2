const express = require("express");
const router = express.Router();

const iaRoutes = require("./ia");
const scheduleRoutes = require("./schedule");

router.use("/ia", iaRoutes);
router.use("/schedule", scheduleRoutes);
router.use("/departments", require("./departments"));
router.use("/employees", require("./employees"));
router.use("/professions", require("./professions"));
router.use("/tasks", require("./tasks"));

module.exports = router;

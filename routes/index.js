const express = require("express");
const router = express.Router();

const iaRoutes = require("./ia");
const scheduleRoutes = require("./schedule");

router.use("/ia", iaRoutes);
router.use("/schedule", scheduleRoutes);
router.use("/auth", require("./auth"));
router.use("/departments", require("./departments"));
router.use("/employees", require("./employees"));

module.exports = router;

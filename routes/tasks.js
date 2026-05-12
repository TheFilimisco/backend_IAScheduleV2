const express = require("express");
const router = express.Router();

const Task = require("../models/Task");
const logTaskChange = require("../utils/historyLogger");
const checkOverlap = require("../utils/overlapChecker");

router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.assigneeId) filter.assigneeId = req.query.assigneeId;
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.date) {
      const day = new Date(req.query.date);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.startDate = { $gte: day, $lt: nextDay };
    }
    const tasks = await Task.find(filter)
      .populate("assigneeId")
      .populate("departmentId");
    res.status(200).json({ tasks });
  } catch (err) {
    console.error("[Tasks GET] ", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("assigneeId")
      .populate("departmentId")
      .populate("createdBy");
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.status(200).json({ task });
  } catch (err) {
    console.error("[Tasks GET/:id] ", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, priority, status, departmentId, assigneeId, createdBy, startDate, durationMinutes } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const duration = durationMinutes || 60;
    let dueDate = null;

    if (startDate) {
      dueDate = new Date(new Date(startDate).getTime() + duration * 60000);

      if (assigneeId) {
        const overlap = await checkOverlap(assigneeId, startDate, duration);
        if (overlap) {
          return res.status(409).json({
            error: "Task overlaps with an existing task",
            code: "OVERLAP_CONFLICT",
            details: { conflictingTask: overlap.title, id: overlap._id },
          });
        }
      }
    }

    const task = await Task.create({
      title, description, priority, status, departmentId, assigneeId, createdBy, startDate: startDate || null, dueDate, durationMinutes: duration,
    });

    await logTaskChange(task._id, "CREATED", createdBy, null, task.toJSON());

    res.status(201).json({ task });
  } catch (err) {
    console.error("[Tasks POST] ", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const previousState = task.toJSON();
    const { title, description, priority, status, departmentId, assigneeId, startDate, durationMinutes } = req.body;

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (priority !== undefined) task.priority = priority;
    if (status !== undefined) task.status = status;
    if (departmentId !== undefined) task.departmentId = departmentId;
    if (assigneeId !== undefined) task.assigneeId = assigneeId;
    if (startDate !== undefined) task.startDate = startDate;
    if (durationMinutes !== undefined) task.durationMinutes = durationMinutes;

    if (task.startDate) {
      task.dueDate = new Date(new Date(task.startDate).getTime() + task.durationMinutes * 60000);

      if (task.assigneeId) {
        const needsOverlapCheck =
          startDate !== undefined || assigneeId !== undefined || durationMinutes !== undefined;

        if (needsOverlapCheck) {
          const overlap = await checkOverlap(task.assigneeId, task.startDate, task.durationMinutes, task._id);
          if (overlap) {
            return res.status(409).json({
              error: "Task overlaps with an existing task",
              code: "OVERLAP_CONFLICT",
              details: { conflictingTask: overlap.title, id: overlap._id },
            });
          }
        }
      }
    } else {
      task.dueDate = null;
    }

    await task.save();
    const newState = task.toJSON();

    let action = "UPDATED";
    if (status !== undefined) action = "STATUS_CHANGED";
    if (durationMinutes !== undefined) action = "DURATION_CHANGED";
    if (assigneeId !== undefined && !previousState.assigneeId) action = "SCHEDULED";
    if (assigneeId !== undefined && previousState.assigneeId) action = "REASSIGNED";
    if (startDate !== undefined && previousState.startDate) action = "RESCHEDULED";
    if (startDate !== undefined && !previousState.startDate) action = "SCHEDULED";

    await logTaskChange(task._id, action, req.body.changedBy, previousState, newState);

    res.status(200).json({ task });
  } catch (err) {
    console.error("[Tasks PUT] ", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const previousState = task.toJSON();
    await Task.findByIdAndDelete(req.params.id);

    await logTaskChange(task._id, "DELETED", null, previousState, null);

    res.status(200).json({ message: "Task deleted" });
  } catch (err) {
    console.error("[Tasks DELETE] ", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

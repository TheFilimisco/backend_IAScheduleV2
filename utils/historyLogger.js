const HistoryTask = require("../models/HistoryTask");

const logTaskChange = async (taskId, action, changedBy, previousState, newState) => {
  const changes = {};

  if (previousState && newState) {
    const fields = ["title", "description", "priority", "status", "departmentId", "assigneeId", "startDate", "dueDate", "durationMinutes"];
    for (const field of fields) {
      const prev = String(previousState[field] ?? "");
      const next = String(newState[field] ?? "");
      if (prev !== next) {
        changes[field] = { from: previousState[field], to: newState[field] };
      }
    }
  }

  await HistoryTask.create({
    taskId,
    action,
    changedBy: changedBy || null,
    previousState: previousState || null,
    newState: newState || null,
    changes,
  });
};

module.exports = logTaskChange;

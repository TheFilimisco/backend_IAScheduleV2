const Task = require("../models/Task");

const checkOverlap = async (assigneeId, startDate, durationMinutes, excludeTaskId) => {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const filter = {
    assigneeId,
    startDate: { $lt: end },
    dueDate: { $gt: start },
  };
  if (excludeTaskId) filter._id = { $ne: excludeTaskId };
  return await Task.findOne(filter).select("title startDate durationMinutes").lean();
};

module.exports = checkOverlap;

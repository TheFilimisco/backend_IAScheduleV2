const mongoose = require('mongoose');

const historyTaskSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  action: { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  previousState: { type: mongoose.Schema.Types.Mixed },
  newState: { type: mongoose.Schema.Types.Mixed },
  changes: { type: mongoose.Schema.Types.Mixed },
  comments: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('HistoryTask', historyTaskSchema);

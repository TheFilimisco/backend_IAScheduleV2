const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'blocked'], default: 'pending' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  startDate: { type: Date },
  dueDate: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);

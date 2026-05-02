const mongoose = require('mongoose');

const historyTaskSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  // Tipo de cambio estandarizado para filtrar el historial fácilmente
  action: {
    type: String,
    required: true,
    enum: [
      'CREATED',          // Tarea creada por primera vez
      'SCHEDULED',        // startDate/dueDate asignados por primera vez (drag a celda)
      'RESCHEDULED',      // Cambio de fecha u hora (mover en el calendario)
      'REASSIGNED',       // Cambio de empleado asignado (assigneeId)
      'DURATION_CHANGED', // Cambio de durationMinutes (resize de tarjeta)
      'STATUS_CHANGED',   // Cambio de estado: pending -> in_progress, etc.
      'DELETED'           // Tarea eliminada
    ]
  },

  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  previousState: { type: mongoose.Schema.Types.Mixed }, // Snapshot de los campos ANTES del cambio
  newState: { type: mongoose.Schema.Types.Mixed }, // Snapshot de los campos DESPUÉS del cambio
  changes: { type: mongoose.Schema.Types.Mixed }, // Descripción legible de qué cambió
  comments: { type: String }                       // Nota opcional del administrador

}, { timestamps: true }); // createdAt = fecha exacta del cambio

module.exports = mongoose.model('HistoryTask', historyTaskSchema);

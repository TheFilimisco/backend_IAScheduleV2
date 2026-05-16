const mongoose = require('mongoose');
const { toLocalParts } = require("../utils/timezone");

const taskSchema = new mongoose.Schema({
  // Datos Fundamentales
  title: { type: String, required: true },
  description: { type: String },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'blocked'], default: 'pending' },

  // Relaciones
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Única fuente de verdad del tiempo.
  // Cuando la tarea no está agendada aún, ambos son null.
  startDate: { type: Date, default: null },
  dueDate: { type: Date, default: null },

  // Duración base en MINUTOS (lo único que se sabe al crear la tarea sin agendar).
  // Ej: 90 = tarea de 1h 30min
  durationMinutes: { type: Number, required: true, default: 60 },

  // Comentario del empleado al completar la tarea
  comment: { type: String, default: null },

}, { timestamps: true });

taskSchema.index({ assigneeId: 1, startDate: 1, dueDate: 1 });
taskSchema.index({ startDate: 1 });
taskSchema.index({ departmentId: 1 });

// Transformación automática para el Frontend al hacer res.json().
// Estos campos se calculan desde los datos reales, NO se guardan en la BD.
taskSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;

    if (ret.startDate) {
      const local = toLocalParts(new Date(ret.startDate));
      ret.startHour = local.hour;
      ret.dateStr = local.dateStr;
    } else {
      ret.startHour = null;
      ret.dateStr = null;
    }

    // Duración en horas para el ancho visual de la tarjeta en el calendario
    // Ej: durationMinutes=90 -> duration=1.5 (columnas y media de ancho)
    ret.duration = ret.durationMinutes / 60;
  }
});

module.exports = mongoose.model('Task', taskSchema);

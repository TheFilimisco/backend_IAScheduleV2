const mongoose = require('mongoose');

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

}, { timestamps: true });

// Transformación automática para el Frontend al hacer res.json().
// Estos campos se calculan desde los datos reales, NO se guardan en la BD.
taskSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;

    // Derivados de UI para el calendario
    if (ret.startDate) {
      const start = new Date(ret.startDate);
      // startHour soporta minutos: 10.5 = 10:30, 14.75 = 14:45
      ret.startHour = start.getHours() + (start.getMinutes() / 60);
      // dateStr para filtrar por día en el calendario
      ret.dateStr = start.toDateString(); // Ej: "Fri May 02 2026"
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

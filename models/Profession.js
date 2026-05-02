const mongoose = require('mongoose');

const professionSchema = new mongoose.Schema({
  // Nombre único de la profesión (ej: "Developer", "UX Designer", "Account Manager")
  name: { type: String, required: true, unique: true, trim: true },

  // Departamento al que pertenece típicamente esta profesión (opcional)
  // Permite filtrar profesiones relevantes según el departamento seleccionado
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

  // Descripción breve de la profesión (opcional)
  description: { type: String, trim: true },

  // Si está activa o fue archivada (para no borrar, solo desactivar)
  isActive: { type: Boolean, default: true }

}, { timestamps: true });

// Índice para búsquedas rápidas por nombre
professionSchema.index({ name: 1 });

professionSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
  }
});

module.exports = mongoose.model('Profession', professionSchema);

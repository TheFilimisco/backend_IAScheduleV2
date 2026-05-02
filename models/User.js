const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // 'code' es el identificador único visible del usuario (antes 'nickname')
  code: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false }, // select:false → no se devuelve por defecto
  role: { type: String, enum: ['admin', 'employee'], default: 'employee' },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  lastLogin: { type: Date }
}, { timestamps: true });

// ── Seguridad: hashear contraseña automáticamente antes de guardar ──────────
userSchema.pre('save', async function (next) {
  // Solo hashear si la contraseña fue modificada (no en cada save)
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Método para verificar contraseña en el login ────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  // Necesita fetch explícito de password porque tiene select:false
  return bcrypt.compare(candidatePassword, this.password);
};

// ── toJSON: NUNCA enviar la contraseña al cliente ───────────────────────────
userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.password; // 🔒 Nunca sale del servidor
  }
});

module.exports = mongoose.model('User', userSchema);

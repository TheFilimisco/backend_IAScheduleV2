const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  // Referencia a la colección Profession (el admin gestiona la lista desde la UI)
  professionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profession' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  birthday: { type: Date },
  schedule: {
    type: String,
    enum: ['morning', 'early', 'late', 'night', 'flexible']
    // morning  → 9am - 5pm
    // early    → 8am - 4pm
    // late     → 10am - 6pm
    // night    → Turno de noche
    // flexible → Sin horario fijo
  },
  role: {
    type: String,
    enum: ['employee', 'supervisor', 'manager', 'trainee'],
    default: 'employee'
    // employee   → Empleado estándar
    // supervisor → Lidera un equipo dentro del departamento
    // manager    → Gestor del departamento
    // trainee    → En prácticas o período de formación
  },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);

# Backend Design — IAScheduleV2

## Contexto y Objetivo

El frontend es un dashboard de scheduling que combina calendario (empleados x horas), drag-and-drop de tareas, gestion de departamentos y un chat bar con IA. El backend ya tiene Express + Mongoose con modelos bien definidos y dos stubs (`/api/schedule`, `/api/ia/schedule`). Falta: rutas CRUD, autenticacion JWT, y el agente IA que opera sobre la BD via lenguaje natural.

---

## 1. Estructura de Carpetas Final

```
backend_IAScheduleV2/
├── server.js                  (existe — no tocar mucho)
├── config/
│   └── db.js                  Extraer la conexion de Mongoose de server.js
├── middleware/
│   ├── auth.js                Verificar JWT, inyectar req.user
│   └── roleGuard.js           Funcion factory para restringir por rol
├── models/                    (ya existen todos, no modificar)
├── routes/
│   ├── index.js               (existe — descomentar y agregar)
│   ├── auth.js                NUEVO
│   ├── departments.js         NUEVO
│   ├── employees.js           NUEVO
│   ├── tasks.js               NUEVO
│   ├── professions.js         NUEVO
│   ├── schedule.js            (existe — extender)
│   └── ia.js                  (existe — reescribir)
├── services/
│   └── aiAgent.js             Definicion del agente LangChain + tools
└── utils/
    ├── generateToken.js       Helper para firmar JWT
    └── historyLogger.js       Funcion reutilizable para escribir HistoryTask
```

**Dependencias nuevas:** `bcryptjs`, `jsonwebtoken`, `@langchain/langgraph`, `@langchain/core`

---

## 2. Sistema de Autenticacion

### Flujo general

```
Cliente envía { email, password }
        ↓
  POST /api/auth/login
        ↓
  Servidor valida con bcrypt (User.comparePassword)
        ↓
  Firma JWT con { id, role, code } → devuelve { token, user }
        ↓
  Cliente guarda token en localStorage/cookie
        ↓
  Todas las requests siguientes envían: Authorization: Bearer <token>
        ↓
  middleware/auth.js verifica token, inyecta req.user
        ↓
  middleware/roleGuard.js verifica si req.user.role es permitido
```

### Endpoints de auth

| Metodo | Ruta | Publico? | Que hace |
|--------|------|----------|----------|
| POST | `/api/auth/register` | Si | Crea User, devuelve JWT |
| POST | `/api/auth/login` | Si | Valida credenciales, devuelve JWT |
| GET | `/api/auth/me` | No (token) | Devuelve el user actual con su empleado populado |

### Decisiones de diseno

- **JWT payload**: solo `{ id, role, code }`. Nada sensible. Expira en 7 dias.
- **Passwords**: ya tienes el `pre('save')` con bcrypt en User.js. Solo asegurate de que `bcryptjs` este en `package.json` (esta importado pero no instalado).
- **roleGuard** es una funcion factory — la invocas como `roleGuard('admin')` y te devuelve un middleware. Asi puedes ponerlo por ruta:

```js
// Ejemplo de uso (NO copiar entero, solo patron):
router.post('/', auth, roleGuard('admin'), async (req, res) => {
  // solo admins llegan aqui
});
```

### Variables de entorno nuevas

```
JWT_SECRET=<string-larga-aleatoria-minimo-32-chars>
JWT_EXPIRES_IN=7d
```

---

## 3. Rutas CRUD — Tabla de Contratos

Todas las rutas CRUD siguen el mismo patron REST. Aqui el contrato completo:

### 3.1 Departments

| Metodo | Ruta | Rol | Body/Query | Respuesta |
|--------|------|-----|------------|-----------|
| GET | `/api/departments` | any | — | `[{ id, name, description, color }]` |
| GET | `/api/departments/:id` | any | — | `{ id, name, description, color, managerId }` |
| POST | `/api/departments` | admin | `{ name, description?, color? }` | `201` + departamento creado |
| PUT | `/api/departments/:id` | admin | campos a actualizar | departamento actualizado |
| DELETE | `/api/departments/:id` | admin | — | Validar que no tenga empleados → 409 si tiene |

### 3.2 Employees

| Metodo | Ruta | Rol | Body/Query | Respuesta |
|--------|------|-----|------------|-----------|
| GET | `/api/employees` | any | `?departmentId=x` (opcional) | Lista filtrada, populate dept + profession |
| GET | `/api/employees/by-department` | any | — | `{ "Design": ["Juan","Carlos"], ... }` |
| GET | `/api/employees/:id` | any | — | Empleado completo populado |
| POST | `/api/employees` | admin | Todos los campos del schema | `201` |
| PUT | `/api/employees/:id` | admin | campos parciales | empleado actualizado |
| DELETE | `/api/employees/:id` | admin | — | **Soft delete**: cambiar `status: 'inactive'` |

**Importante**: `/by-department` debe ir ANTES de `/:id` en el router, o Express lo interpretara como `id = "by-department"`.

### 3.3 Tasks

| Metodo | Ruta | Rol | Body/Query | Respuesta |
|--------|------|-----|------------|-----------|
| GET | `/api/tasks` | any | `?date=YYYY-MM-DD`, `?assigneeId=x`, `?departmentId=x` | Lista con virtuals (startHour, dateStr, duration) |
| GET | `/api/tasks/:id` | any | — | Tarea completa |
| POST | `/api/tasks` | admin | `{ title, description?, priority?, assigneeId?, startDate?, durationMinutes? }` | `201` con tarea creada |
| PUT | `/api/tasks/:id` | admin | campos parciales | tarea actualizada |
| DELETE | `/api/tasks/:id` | admin | — | Eliminar + log en HistoryTask |

**Reglas de negocio criticas en Tasks:**
1. **Overlap check**: antes de POST o PUT que involucre `assigneeId + startDate`, consultar si hay tareas que se solapan. Si hay conflicto → `409` con `code: 'OVERLAP_CONFLICT'`
2. **dueDate se calcula**: `dueDate = startDate + durationMinutes`. Nunca dejar que el cliente la envie directamente.
3. **Cada mutacion escribe HistoryTask** (via `utils/historyLogger.js`)

### 3.4 Professions

| Metodo | Ruta | Rol | Body/Query | Respuesta |
|--------|------|-----|------------|-----------|
| GET | `/api/professions` | any | — | `["Developer", "Designer", ...]` (solo nombres) |
| POST | `/api/professions` | admin | `{ name, departmentId?, description? }` | `201` |
| PUT | `/api/professions/:id` | admin | campos parciales | profesion actualizada |
| DELETE | `/api/professions/:id` | admin | — | Soft delete: `isActive: false` |

---

## 4. Schedule — Endpoints Agregados

Estos endpoints son los que alimentan el `fetchData()` del frontend. Extienden el `routes/schedule.js` que ya existe.

| Metodo | Ruta | Que devuelve |
|--------|------|-------------|
| GET | `/api/schedule` | (ya existe) `{ departments, employees, tasks }` |
| GET | `/api/schedule/sections` | `[{title: "Departaments", items: [...]}, {title: "Employees", items: [...]}, {title: "Tasks", items: [...]}]` |
| GET | `/api/schedule/employees-by-dept` | `{ "Design": ["Juan","Carlos"], "Marketing": ["Gabriel","Ana"] }` |
| GET | `/api/schedule/enums` | `{ schedules: ['morning','early',...], roles: ['employee','supervisor',...] }` |

### Mapping frontend → backend

El frontend hace fetch a URLs planas. Tienes dos opciones:

**Opcion A — Aliases en `routes/index.js`** (recomendada):
```js
// Solo el patron, no copiar literal:
router.get('/sections', auth, redirigir a /schedule/sections);
router.get('/employees-by-dept', auth, redirigir a /schedule/employees-by-dept);
router.get('/schedules', auth, redirigir a /schedule/enums);
```

**Opcion B**: Cambiar las URLs en el `dashboardStore.ts` del frontend.

Tabla completa de mapping:

| Frontend llama a | Backend real |
|------------------|-------------|
| `GET /api/tasks` | `GET /api/tasks` (directo) |
| `GET /api/sections` | `GET /api/schedule/sections` (alias) |
| `GET /api/employees-by-dept` | `GET /api/schedule/employees-by-dept` (alias) |
| `GET /api/professions` | `GET /api/professions` (directo) |
| `GET /api/schedules` | `GET /api/schedule/enums` (alias) |
| `POST /api/ai/chat` | `POST /api/ia/schedule` (alias o cambiar frontend) |

---

## 5. Overlap Check — Logica central

Este es el corazon de la validacion de negocio. Lo necesitas en las rutas de tasks Y en los tools del agente IA.

### Concepto

Dos tareas se solapan si y solo si:
```
tarea_existente.start < nueva_tarea.end  AND  tarea_existente.end > nueva_tarea.start
```

En Mongoose, como `end` no se guarda (se calcula), la query es:
```
Para la tarea existente:
  - start < nueva.startDate + nueva.durationMinutes
  - start + durationMinutes > nueva.startDate
  - assigneeId == mismo empleado
  - _id != la tarea que estamos editando (en PUT)
```

### Donde aplicarlo

1. **POST /api/tasks** — si viene con `assigneeId + startDate`
2. **PUT /api/tasks/:id** — si cambia `assigneeId`, `startDate`, o `durationMinutes`
3. **AI tools**: `create_task`, `assign_task`, `move_task`

Recomendacion: extraer una funcion `checkOverlap(assigneeId, startDate, durationMinutes, excludeTaskId?)` reutilizable que devuelva `null` (sin conflicto) o la tarea que conflictua.

---

## 6. History Logger — Patron de Auditoria

### Cuando logear

| Accion en la ruta | Valor de `action` en HistoryTask |
|-------------------|----------------------------------|
| POST /tasks | `CREATED` |
| PUT /tasks (cambia startDate) | `RESCHEDULED` |
| PUT /tasks (cambia assigneeId) | `REASSIGNED` |
| PUT /tasks (cambia durationMinutes) | `DURATION_CHANGED` |
| PUT /tasks (cambia status) | `STATUS_CHANGED` |
| DELETE /tasks | `DELETED` |
| AI asigna tarea | `SCHEDULED` |

### Patron de uso

Crear una funcion en `utils/historyLogger.js` que reciba:
- `taskId` — ObjectId de la tarea
- `action` — string del enum
- `changedBy` — `req.user.id` (o null si es el agente IA)
- `previousState` — snapshot ANTES del cambio (con `task.toJSON()`)
- `newState` — snapshot DESPUES del cambio

El campo `changes` del modelo se puede calcular comparando los dos snapshots campo a campo (solo los que cambiaron).

---

## 7. Agente IA — Arquitectura

### Flujo

```
Usuario escribe: "Asigna Design Landing a @Juan manana a las 10"
        ↓
  Frontend → POST /api/ia/schedule { prompt: "..." }
        ↓
  routes/ia.js → llama a services/aiAgent.js
        ↓
  aiAgent.js crea un ReAct Agent (LangChain) con:
    - LLM: GPT-4o-mini
    - 9 tools conectados a Mongoose
    - System prompt con reglas de negocio
        ↓
  El LLM decide que tools llamar (puede encadenar varios)
        ↓
  Cada tool ejecuta queries/mutaciones en MongoDB
        ↓
  El LLM genera respuesta en lenguaje natural
        ↓
  Backend devuelve { message: "Listo, asigne Design Landing a Juan..." }
```

### Tools que necesita el agente (9 total)

| Tool | Descripcion | Parametros clave |
|------|-------------|-----------------|
| `list_employees` | Buscar empleados, opcionalmente por departamento | `departmentName?` |
| `list_tasks` | Buscar tareas por fecha o empleado | `date?`, `assigneeName?` |
| `create_task` | Crear tarea nueva, opcionalmente asignarla | `title`, `assigneeName?`, `date?`, `startHour?`, `durationMinutes?` |
| `assign_task` | Asignar tarea existente a un empleado en un horario | `taskTitle`, `assigneeName`, `date`, `startHour` |
| `move_task` | Mover tarea a otra fecha/hora/empleado | `taskTitle`, `newDate?`, `newStartHour?`, `newAssigneeName?` |
| `delete_task` | Eliminar una tarea | `taskTitle` |
| `check_availability` | Verificar si un empleado esta libre | `employeeName`, `date`, `startHour`, `durationMinutes?` |
| `get_schedule_summary` | Resumen del dia agrupado por empleado | `date` |
| `list_departments` | Listar departamentos con sus empleados | (sin parametros) |

### Como definir los tools

Usa `tool()` de `@langchain/core/tools` con schemas de Zod. Cada tool es una funcion `async` que:
1. Recibe los parametros validados por Zod
2. Hace queries/mutaciones a Mongoose
3. Devuelve un **string** JSON con el resultado (el LLM lo lee como texto)

Ejemplo conceptual de como se ve un tool:
```js
// Solo el patron, adaptar a tu caso:
const miTool = tool(
  async ({ parametro1, parametro2 }) => {
    // query a MongoDB
    // return JSON.stringify(resultado)
  },
  {
    name: 'nombre_del_tool',
    description: 'Que hace este tool (el LLM lee esto para decidir cuando usarlo)',
    schema: z.object({
      parametro1: z.string().describe('Descripcion para el LLM'),
      parametro2: z.number().optional()
    })
  }
);
```

### Para crear el agente

Usa `createReactAgent` de `@langchain/langgraph/prebuilt`. Le pasas:
- `llm`: instancia de ChatOpenAI
- `tools`: array de todos los tools
- `messageModifier`: el system prompt

### System prompt — reglas que debe seguir el agente

El system prompt debe incluir:
- Que es (asistente de scheduling)
- Que `@Nombre` se refiere a entidades del sistema (quitar el @ al usar tools)
- Nunca solapar tareas del mismo empleado
- Respetar horarios de cada tipo de schedule (morning=9-17, early=8-16, etc.)
- Tareas exclusivas por dia
- Duracion default: 60 minutos
- Confirmar siempre en lenguaje natural lo que hizo
- Incluir la fecha de hoy para que el agente sepa interpretar "manana", "esta semana", etc.

### Respuesta al frontend

```json
{
  "message": "Listo! Asigne 'Design Landing' a Juan manana a las 10:00 por 2 horas."
}
```

El frontend puede refrescar datos despues con un nuevo `fetchData()`.

---

## 8. Errores — Formato Consistente

Usar siempre esta estructura:

```json
{
  "error": "Mensaje legible para humanos",
  "code": "OVERLAP_CONFLICT",
  "details": { ... }
}
```

Codigos HTTP:
- `400` — validacion (falta campo requerido, formato malo)
- `401` — sin token o token expirado
- `403` — rol insuficiente (employee intenta crear departamento)
- `404` — recurso no encontrado
- `409` — conflicto (overlap, email duplicado, departamento con empleados)

---

## 9. Orden de Implementacion

```
Fase 1: Infraestructura
  └── Instalar deps (bcryptjs, jsonwebtoken, @langchain/langgraph, @langchain/core)
  └── Crear carpetas (config/, middleware/, services/, utils/)

Fase 2: Auth
  └── utils/generateToken.js
  └── middleware/auth.js
  └── middleware/roleGuard.js
  └── routes/auth.js (register, login, me)

Fase 3: CRUD (en este orden por dependencias)
  └── routes/departments.js
  └── routes/employees.js (depende de Department para populate)
  └── routes/professions.js
  └── routes/tasks.js (depende de Employee + Department + incluye overlap check)

Fase 4: Schedule agregados
  └── Extender routes/schedule.js con /sections, /employees-by-dept, /enums

Fase 5: Auditoria
  └── utils/historyLogger.js
  └── Integrar en routes/tasks.js (cada mutacion logea)

Fase 6: Agente IA
  └── services/aiAgent.js (tools + agent)
  └── Reescribir routes/ia.js para usar el agente

Fase 7: Cableado final
  └── Actualizar routes/index.js (descomentar rutas + aliases)
  └── Probar flujo completo
```

---

## 10. Verificacion

1. `npm run dev` → confirmar conexion a MongoDB
2. Registrar admin via POST `/api/auth/register`
3. Login → guardar token
4. Crear departamento → crear empleado en el → crear tarea → asignar tarea
5. Intentar solapar dos tareas → confirmar 409
6. Probar AI: `POST /api/ia/schedule` con `{ "prompt": "Asigna Design Landing a Juan manana a las 10" }`
7. Prender frontend con `NEXT_PUBLIC_USE_API=true` → verificar que el calendario carga datos reales

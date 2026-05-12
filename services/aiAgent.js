const { ChatOpenAI } = require("@langchain/openai");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { tool } = require("@langchain/core/tools");
const { z } = require("zod");

const Department = require("../models/Department");
const Employee = require("../models/Employee");
const Task = require("../models/Task");
const Profession = require("../models/Profession");
const logTaskChange = require("../utils/historyLogger");
const checkOverlap = require("../utils/overlapChecker");
const escapeRegex = require("../utils/escapeRegex");

const buildUTCDate = (dateStr, hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour % 1) * 60);
  return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
};

const SCHEDULE_HOURS = {
  morning: [9, 17],
  early: [8, 16],
  late: [10, 18],
  night: [22, 6],
  flexible: [0, 24],
};

const isWithinSchedule = (schedule, startHour, endHour) => {
  const [sStart, sEnd] = SCHEDULE_HOURS[schedule] || [0, 24];
  if (sStart < sEnd) return startHour >= sStart && endHour <= sEnd;
  return startHour >= sStart || endHour <= sEnd;
};

const findEmployee = async (name) => {
  const parts = name.trim().split(/\s+/);
  const filter = { status: "active" };
  if (parts.length >= 2) {
    filter.firstName = new RegExp(escapeRegex(parts[0]), "i");
    filter.lastName = new RegExp(escapeRegex(parts.slice(1).join(" ")), "i");
  } else {
    filter.$or = [
      { firstName: new RegExp(escapeRegex(parts[0]), "i") },
      { lastName: new RegExp(escapeRegex(parts[0]), "i") },
    ];
  }
  return await Employee.findOne(filter);
};

const findDepartment = async (name) => {
  return await Department.findOne({ name: new RegExp(escapeRegex(name), "i") });
};

const findTaskByTitle = async (title) => {
  const exactMatches = await Task.find({ title }).limit(5);
  if (exactMatches.length === 1) return { task: exactMatches[0] };
  if (exactMatches.length > 1) {
    const details = exactMatches.map((t) => {
      const assignee = t.assigneeId ? `assignee:${t.assigneeId}` : "sin asignar";
      const date = t.startDate ? t.startDate.toISOString().split("T")[0] : "sin fecha";
      return `'${t.title}' (${date}, ${assignee}, id:${t._id})`;
    });
    return { error: `Multiples tareas con ese nombre: ${details.join(", ")}. Usa el id para especificar cual.` };
  }
  const escaped = escapeRegex(title);
  const regexMatches = await Task.find({ title: new RegExp(escaped, "i") }).limit(5);
  if (regexMatches.length === 0) return { error: `Tarea '${title}' no encontrada` };
  if (regexMatches.length > 1) {
    return { error: `Multiples tareas coinciden: ${regexMatches.map((t) => t.title).join(", ")}. Se mas especifico.` };
  }
  return { task: regexMatches[0] };
};

// ── Department Tools ──

const listDepartments = tool(
  async () => {
    const [departments, employees] = await Promise.all([
      Department.find(),
      Employee.find({ status: "active" }, "firstName lastName departmentId"),
    ]);
    const empsByDept = {};
    for (const e of employees) {
      const key = String(e.departmentId);
      if (!empsByDept[key]) empsByDept[key] = [];
      empsByDept[key].push(`${e.firstName} ${e.lastName}`);
    }
    return JSON.stringify(
      departments.map((d) => ({
        id: d._id,
        name: d.name,
        color: d.color,
        description: d.description,
        employees: empsByDept[String(d._id)] || [],
      }))
    );
  },
  {
    name: "list_departments",
    description: "List all departments with their employees.",
    schema: z.object({}),
  }
);

const createDepartment = tool(
  async ({ name, description, color }) => {
    const exists = await Department.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (exists) return JSON.stringify({ error: `Department '${name}' already exists` });
    const dept = await Department.create({ name, description, color });
    return JSON.stringify({ success: true, department: { id: dept._id, name: dept.name, color: dept.color } });
  },
  {
    name: "create_department",
    description: "Create a new department.",
    schema: z.object({
      name: z.string().describe("Department name"),
      description: z.string().optional().describe("Department description"),
      color: z.string().optional().describe("Hex color for the UI, e.g. #6b7280"),
    }),
  }
);

const updateDepartment = tool(
  async ({ departmentName, newName, description, color }) => {
    const dept = await findDepartment(departmentName);
    if (!dept) return JSON.stringify({ error: `Department '${departmentName}' not found` });
    if (newName !== undefined) dept.name = newName;
    if (description !== undefined) dept.description = description;
    if (color !== undefined) dept.color = color;
    await dept.save();
    return JSON.stringify({ success: true, department: { id: dept._id, name: dept.name } });
  },
  {
    name: "update_department",
    description: "Update a department's name, description, or color.",
    schema: z.object({
      departmentName: z.string().describe("Current department name"),
      newName: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      color: z.string().optional().describe("New hex color"),
    }),
  }
);

const deleteDepartment = tool(
  async ({ departmentName }) => {
    const dept = await findDepartment(departmentName);
    if (!dept) return JSON.stringify({ error: `Department '${departmentName}' not found` });
    const empCount = await Employee.countDocuments({ departmentId: dept._id, status: "active" });
    if (empCount > 0) return JSON.stringify({ error: `Cannot delete '${dept.name}', it has ${empCount} active employees` });
    await Department.findByIdAndDelete(dept._id);
    return JSON.stringify({ success: true, deleted: dept.name });
  },
  {
    name: "delete_department",
    description: "Delete a department. Fails if it has active employees.",
    schema: z.object({
      departmentName: z.string().describe("Department name to delete"),
    }),
  }
);

// ── Employee Tools ──

const listEmployees = tool(
  async ({ departmentName }) => {
    const filter = { status: "active" };
    if (departmentName) {
      const dept = await findDepartment(departmentName);
      if (!dept) return JSON.stringify({ error: `Department '${departmentName}' not found` });
      filter.departmentId = dept._id;
    }
    const employees = await Employee.find(filter)
      .populate("departmentId")
      .populate("professionId");
    return JSON.stringify(
      employees.map((e) => ({
        id: e._id,
        name: `${e.firstName} ${e.lastName}`,
        code: e.code,
        email: e.email,
        department: e.departmentId?.name,
        profession: e.professionId?.name,
        schedule: e.schedule,
        role: e.role,
      }))
    );
  },
  {
    name: "list_employees",
    description: "List employees, optionally filtered by department name.",
    schema: z.object({
      departmentName: z.string().optional().describe("Department name to filter by"),
    }),
  }
);

const createEmployee = tool(
  async ({ firstName, lastName, email, code, departmentName, schedule, role }) => {
    const empCode = code || `EMP-${firstName.substring(0, 2).toUpperCase()}${lastName.substring(0, 2).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const empEmail = email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`;

    const exists = await Employee.findOne({ $or: [{ email: empEmail }, { code: empCode }] });
    if (exists) return JSON.stringify({ error: `Employee with email '${empEmail}' or code '${empCode}' already exists` });

    const employeeData = {
      firstName,
      lastName,
      email: empEmail,
      code: empCode,
      schedule: schedule || "morning",
      role: role || "employee",
      status: "active",
    };

    if (departmentName) {
      const dept = await findDepartment(departmentName);
      if (!dept) return JSON.stringify({ error: `Department '${departmentName}' not found` });
      employeeData.departmentId = dept._id;
    }

    const employee = await Employee.create(employeeData);
    return JSON.stringify({ success: true, employee: { id: employee._id, name: `${employee.firstName} ${employee.lastName}`, code: employee.code, email: employee.email } });
  },
  {
    name: "create_employee",
    description: "Create a new employee. Auto-generates code and email if not provided.",
    schema: z.object({
      firstName: z.string().describe("First name"),
      lastName: z.string().describe("Last name"),
      email: z.string().optional().describe("Email address"),
      code: z.string().optional().describe("Employee code"),
      departmentName: z.string().optional().describe("Department name to assign to"),
      schedule: z.enum(["morning", "early", "late", "night", "flexible"]).optional().describe("Work schedule type"),
      role: z.enum(["employee", "supervisor", "manager", "trainee"]).optional().describe("Employee role"),
    }),
  }
);

const updateEmployee = tool(
  async ({ employeeName, firstName, lastName, email, departmentName, schedule, role }) => {
    const emp = await findEmployee(employeeName);
    if (!emp) return JSON.stringify({ error: `Employee '${employeeName}' not found` });

    if (firstName !== undefined) emp.firstName = firstName;
    if (lastName !== undefined) emp.lastName = lastName;
    if (email !== undefined) emp.email = email;
    if (schedule !== undefined) emp.schedule = schedule;
    if (role !== undefined) emp.role = role;

    if (departmentName !== undefined) {
      const dept = await findDepartment(departmentName);
      if (!dept) return JSON.stringify({ error: `Department '${departmentName}' not found` });
      emp.departmentId = dept._id;
    }

    await emp.save();
    return JSON.stringify({ success: true, employee: { id: emp._id, name: `${emp.firstName} ${emp.lastName}` } });
  },
  {
    name: "update_employee",
    description: "Update an employee's details.",
    schema: z.object({
      employeeName: z.string().describe("Current employee name to find"),
      firstName: z.string().optional().describe("New first name"),
      lastName: z.string().optional().describe("New last name"),
      email: z.string().optional().describe("New email"),
      departmentName: z.string().optional().describe("New department name"),
      schedule: z.enum(["morning", "early", "late", "night", "flexible"]).optional().describe("New schedule"),
      role: z.enum(["employee", "supervisor", "manager", "trainee"]).optional().describe("New role"),
    }),
  }
);

const deleteEmployee = tool(
  async ({ employeeName }) => {
    const emp = await findEmployee(employeeName);
    if (!emp) return JSON.stringify({ error: `Employee '${employeeName}' not found` });

    const futureTasks = await Task.countDocuments({
      assigneeId: emp._id,
      startDate: { $gte: new Date() },
      status: { $in: ["pending", "in_progress"] },
    });
    if (futureTasks > 0) {
      return JSON.stringify({ error: `${emp.firstName} ${emp.lastName} has ${futureTasks} future tasks. Reassign them before deactivating.` });
    }

    emp.status = "inactive";
    await emp.save();
    return JSON.stringify({ success: true, deactivated: `${emp.firstName} ${emp.lastName}` });
  },
  {
    name: "delete_employee",
    description: "Deactivate an employee (soft delete). Fails if they have future tasks.",
    schema: z.object({
      employeeName: z.string().describe("Employee name to deactivate"),
    }),
  }
);

// ── Profession Tools ──

const listProfessions = tool(
  async () => {
    const professions = await Profession.find({ isActive: true }).populate("departmentId");
    return JSON.stringify(
      professions.map((p) => ({
        id: p._id,
        name: p.name,
        description: p.description,
        department: p.departmentId?.name,
      }))
    );
  },
  {
    name: "list_professions",
    description: "List all active professions.",
    schema: z.object({}),
  }
);

const createProfession = tool(
  async ({ name, description, departmentName }) => {
    const exists = await Profession.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (exists) return JSON.stringify({ error: `Profession '${name}' already exists` });

    const profData = { name, description };
    if (departmentName) {
      const dept = await findDepartment(departmentName);
      if (!dept) return JSON.stringify({ error: `Department '${departmentName}' not found` });
      profData.departmentId = dept._id;
    }

    const profession = await Profession.create(profData);
    return JSON.stringify({ success: true, profession: { id: profession._id, name: profession.name } });
  },
  {
    name: "create_profession",
    description: "Create a new profession.",
    schema: z.object({
      name: z.string().describe("Profession name"),
      description: z.string().optional().describe("Profession description"),
      departmentName: z.string().optional().describe("Department this profession belongs to"),
    }),
  }
);

const deleteProfession = tool(
  async ({ professionName }) => {
    const prof = await Profession.findOne({ name: new RegExp(escapeRegex(professionName), "i"), isActive: true });
    if (!prof) return JSON.stringify({ error: `Profession '${professionName}' not found` });
    prof.isActive = false;
    await prof.save();
    return JSON.stringify({ success: true, deactivated: prof.name });
  },
  {
    name: "delete_profession",
    description: "Deactivate a profession (soft delete).",
    schema: z.object({
      professionName: z.string().describe("Profession name to deactivate"),
    }),
  }
);

// ── Task Tools ──

const listTasks = tool(
  async ({ date, assigneeName }) => {
    const filter = {};
    if (date) {
      const day = new Date(date);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      filter.startDate = { $gte: day, $lt: nextDay };
    }
    if (assigneeName) {
      const emp = await findEmployee(assigneeName);
      if (!emp) return JSON.stringify({ error: `Employee '${assigneeName}' not found` });
      filter.assigneeId = emp._id;
    }
    const tasks = await Task.find(filter).populate("assigneeId").populate("departmentId").limit(50);
    return JSON.stringify(
      tasks.map((t) => ({
        id: t._id,
        title: t.title,
        assignee: t.assigneeId ? `${t.assigneeId.firstName} ${t.assigneeId.lastName}` : null,
        department: t.departmentId?.name,
        startDate: t.startDate,
        durationMinutes: t.durationMinutes,
        status: t.status,
        priority: t.priority,
      }))
    );
  },
  {
    name: "list_tasks",
    description: "List tasks, optionally filtered by date (YYYY-MM-DD) and/or employee name. Max 50 results.",
    schema: z.object({
      date: z.string().optional().describe("Date in YYYY-MM-DD format"),
      assigneeName: z.string().optional().describe("Employee name"),
    }),
  }
);

const createTask = tool(
  async ({ title, description, priority, assigneeName, date, startHour, durationMinutes }) => {
    const duration = durationMinutes || 60;
    const taskData = { title, description, priority, durationMinutes: duration };

    if (assigneeName) {
      const emp = await findEmployee(assigneeName);
      if (!emp) return JSON.stringify({ error: `Employee '${assigneeName}' not found` });
      taskData.assigneeId = emp._id;
      if (emp.departmentId) taskData.departmentId = emp.departmentId;

      if (date && startHour !== undefined) {
        const endHour = startHour + duration / 60;
        if (!isWithinSchedule(emp.schedule, startHour, endHour)) {
          return JSON.stringify({ error: `Task falls outside ${emp.firstName}'s schedule (${emp.schedule}: ${SCHEDULE_HOURS[emp.schedule].join("-")})` });
        }
      }
    }

    if (date && startHour !== undefined) {
      const startDate = buildUTCDate(date, startHour);
      taskData.startDate = startDate;
      taskData.dueDate = new Date(startDate.getTime() + duration * 60000);

      if (taskData.assigneeId) {
        const overlap = await checkOverlap(taskData.assigneeId, taskData.startDate, duration);
        if (overlap) return JSON.stringify({ error: `Overlap conflict with task '${overlap.title}'` });
      }
    } else if (date && startHour === undefined) {
      return JSON.stringify({ error: "startHour is required when date is specified" });
    }

    const task = await Task.create(taskData);
    await logTaskChange(task._id, "CREATED", null, null, task.toJSON());
    return JSON.stringify({ success: true, task: { id: task._id, title: task.title, startDate: task.startDate, durationMinutes: task.durationMinutes } });
  },
  {
    name: "create_task",
    description: "Create a new task, optionally assigning it to an employee at a specific date and time.",
    schema: z.object({
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Task priority"),
      assigneeName: z.string().optional().describe("Employee name to assign to"),
      date: z.string().optional().describe("Date in YYYY-MM-DD format"),
      startHour: z.number().optional().describe("Start hour (e.g. 10, 14.5 for 2:30 PM)"),
      durationMinutes: z.number().optional().describe("Duration in minutes, default 60"),
    }),
  }
);

const assignTask = tool(
  async ({ taskTitle, assigneeName, date, startHour }) => {
    const result = await findTaskByTitle(taskTitle);
    if (result.error) return JSON.stringify(result);
    const task = result.task;

    const emp = await findEmployee(assigneeName);
    if (!emp) return JSON.stringify({ error: `Employee '${assigneeName}' not found` });

    const endHour = startHour + task.durationMinutes / 60;
    if (!isWithinSchedule(emp.schedule, startHour, endHour)) {
      return JSON.stringify({ error: `Task falls outside ${emp.firstName}'s schedule (${emp.schedule}: ${SCHEDULE_HOURS[emp.schedule].join("-")})` });
    }

    const previousState = task.toJSON();
    const startDate = buildUTCDate(date, startHour);

    const overlap = await checkOverlap(emp._id, startDate, task.durationMinutes, task._id);
    if (overlap) return JSON.stringify({ error: `Overlap conflict with task '${overlap.title}'` });

    task.assigneeId = emp._id;
    task.startDate = startDate;
    task.dueDate = new Date(startDate.getTime() + task.durationMinutes * 60000);
    if (emp.departmentId) task.departmentId = emp.departmentId;
    await task.save();

    await logTaskChange(task._id, "SCHEDULED", null, previousState, task.toJSON());
    return JSON.stringify({ success: true, task: { id: task._id, title: task.title, assignee: `${emp.firstName} ${emp.lastName}`, startDate: task.startDate } });
  },
  {
    name: "assign_task",
    description: "Assign an existing task to an employee at a specific date and time.",
    schema: z.object({
      taskTitle: z.string().describe("Title of the task to assign"),
      assigneeName: z.string().describe("Employee name to assign to"),
      date: z.string().describe("Date in YYYY-MM-DD format"),
      startHour: z.number().describe("Start hour (e.g. 10, 14.5 for 2:30 PM)"),
    }),
  }
);

const moveTask = tool(
  async ({ taskTitle, newDate, newStartHour, newAssigneeName }) => {
    const result = await findTaskByTitle(taskTitle);
    if (result.error) return JSON.stringify(result);
    const task = result.task;

    const previousState = task.toJSON();
    const actions = [];

    if (newAssigneeName) {
      const emp = await findEmployee(newAssigneeName);
      if (!emp) return JSON.stringify({ error: `Employee '${newAssigneeName}' not found` });
      task.assigneeId = emp._id;
      if (emp.departmentId) task.departmentId = emp.departmentId;
      actions.push("REASSIGNED");
    }

    if (newDate) {
      const hour = newStartHour !== undefined ? newStartHour : (task.startDate ? task.startDate.getUTCHours() + task.startDate.getUTCMinutes() / 60 : 9);
      const startDate = buildUTCDate(newDate, hour);
      task.startDate = startDate;
      task.dueDate = new Date(startDate.getTime() + task.durationMinutes * 60000);
      actions.push("RESCHEDULED");
    } else if (newStartHour !== undefined && task.startDate) {
      const dateStr = task.startDate.toISOString().split("T")[0];
      const newStart = buildUTCDate(dateStr, newStartHour);
      task.startDate = newStart;
      task.dueDate = new Date(newStart.getTime() + task.durationMinutes * 60000);
      actions.push("RESCHEDULED");
    }

    if (task.assigneeId && task.startDate) {
      const emp = await Employee.findById(task.assigneeId);
      if (emp) {
        const startHour = task.startDate.getUTCHours() + task.startDate.getUTCMinutes() / 60;
        const endHour = startHour + task.durationMinutes / 60;
        if (!isWithinSchedule(emp.schedule, startHour, endHour)) {
          return JSON.stringify({ error: `Task falls outside ${emp.firstName}'s schedule (${emp.schedule}: ${SCHEDULE_HOURS[emp.schedule].join("-")})` });
        }
      }

      const overlap = await checkOverlap(task.assigneeId, task.startDate, task.durationMinutes, task._id);
      if (overlap) return JSON.stringify({ error: `Overlap conflict with task '${overlap.title}'` });
    }

    await task.save();
    const action = actions[actions.length - 1] || "RESCHEDULED";
    await logTaskChange(task._id, action, null, previousState, task.toJSON());
    return JSON.stringify({ success: true, task: { id: task._id, title: task.title, startDate: task.startDate } });
  },
  {
    name: "move_task",
    description: "Move a task to a different date, time, or employee.",
    schema: z.object({
      taskTitle: z.string().describe("Title of the task to move"),
      newDate: z.string().optional().describe("New date in YYYY-MM-DD format"),
      newStartHour: z.number().optional().describe("New start hour"),
      newAssigneeName: z.string().optional().describe("New employee name to reassign to"),
    }),
  }
);

const updateTask = tool(
  async ({ taskTitle, newTitle, description, priority, status, durationMinutes }) => {
    const result = await findTaskByTitle(taskTitle);
    if (result.error) return JSON.stringify(result);
    const task = result.task;

    const previousState = task.toJSON();

    if (newTitle !== undefined) task.title = newTitle;
    if (description !== undefined) task.description = description;
    if (priority !== undefined) task.priority = priority;
    if (status !== undefined) task.status = status;
    if (durationMinutes !== undefined) {
      task.durationMinutes = durationMinutes;
      if (task.startDate) task.dueDate = new Date(new Date(task.startDate).getTime() + durationMinutes * 60000);
    }

    if (task.assigneeId && task.startDate && durationMinutes !== undefined) {
      const overlap = await checkOverlap(task.assigneeId, task.startDate, task.durationMinutes, task._id);
      if (overlap) return JSON.stringify({ error: `Overlap conflict with task '${overlap.title}'` });
    }

    await task.save();

    let action = "UPDATED";
    if (status !== undefined) action = "STATUS_CHANGED";
    if (durationMinutes !== undefined) action = "DURATION_CHANGED";

    await logTaskChange(task._id, action, null, previousState, task.toJSON());
    return JSON.stringify({ success: true, task: { id: task._id, title: task.title, status: task.status } });
  },
  {
    name: "update_task",
    description: "Update a task's title, description, priority, status, or duration.",
    schema: z.object({
      taskTitle: z.string().describe("Current task title to find"),
      newTitle: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("New priority"),
      status: z.enum(["pending", "in_progress", "completed", "blocked"]).optional().describe("New status"),
      durationMinutes: z.number().optional().describe("New duration in minutes"),
    }),
  }
);

const deleteTask = tool(
  async ({ taskTitle }) => {
    const result = await findTaskByTitle(taskTitle);
    if (result.error) return JSON.stringify(result);
    const task = result.task;
    const previousState = task.toJSON();
    await Task.findByIdAndDelete(task._id);
    await logTaskChange(task._id, "DELETED", null, previousState, null);
    return JSON.stringify({ success: true, deleted: task.title });
  },
  {
    name: "delete_task",
    description: "Delete a task by its title.",
    schema: z.object({
      taskTitle: z.string().describe("Title of the task to delete"),
    }),
  }
);

const checkAvailability = tool(
  async ({ employeeName, date, startHour, durationMinutes }) => {
    const emp = await findEmployee(employeeName);
    if (!emp) return JSON.stringify({ error: `Employee '${employeeName}' not found` });

    const duration = durationMinutes || 60;
    const endHour = startHour + duration / 60;

    if (!isWithinSchedule(emp.schedule, startHour, endHour)) {
      return JSON.stringify({ available: false, reason: `Outside ${emp.firstName}'s schedule (${emp.schedule}: ${SCHEDULE_HOURS[emp.schedule].join("-")})` });
    }

    const startDate = buildUTCDate(date, startHour);

    const overlap = await checkOverlap(emp._id, startDate, duration);
    if (overlap) {
      return JSON.stringify({ available: false, conflictsWith: overlap.title, conflictStart: overlap.startDate, conflictDuration: overlap.durationMinutes });
    }
    return JSON.stringify({ available: true, employee: `${emp.firstName} ${emp.lastName}`, date, startHour, durationMinutes: duration });
  },
  {
    name: "check_availability",
    description: "Check if an employee is available at a specific date and time. Also validates against their work schedule.",
    schema: z.object({
      employeeName: z.string().describe("Employee name"),
      date: z.string().describe("Date in YYYY-MM-DD format"),
      startHour: z.number().describe("Start hour (e.g. 10, 14.5)"),
      durationMinutes: z.number().optional().describe("Duration in minutes, default 60"),
    }),
  }
);

const getScheduleSummary = tool(
  async ({ date }) => {
    const day = new Date(date);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const tasks = await Task.find({
      startDate: { $gte: day, $lt: nextDay },
    }).populate("assigneeId").populate("departmentId");

    const byEmployee = {};
    for (const t of tasks) {
      const name = t.assigneeId ? `${t.assigneeId.firstName} ${t.assigneeId.lastName}` : "Unassigned";
      if (!byEmployee[name]) byEmployee[name] = [];
      const start = new Date(t.startDate);
      byEmployee[name].push({
        title: t.title,
        time: `${start.getUTCHours()}:${String(start.getUTCMinutes()).padStart(2, "0")}`,
        duration: `${t.durationMinutes}min`,
        status: t.status,
      });
    }

    return JSON.stringify({ date, totalTasks: tasks.length, byEmployee });
  },
  {
    name: "get_schedule_summary",
    description: "Get a summary of all tasks for a specific date, grouped by employee.",
    schema: z.object({
      date: z.string().describe("Date in YYYY-MM-DD format"),
    }),
  }
);

// ── All Tools ──

const allTools = [
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listProfessions,
  createProfession,
  deleteProfession,
  listTasks,
  createTask,
  assignTask,
  moveTask,
  updateTask,
  deleteTask,
  checkAvailability,
  getScheduleSummary,
];

// ── Agent ──

const llm = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "gpt-4o-mini",
  temperature: 0,
});

const runAgent = async (prompt) => {
  const today = new Date().toISOString().split("T")[0];
  const dayName = new Date().toLocaleDateString("es-ES", { weekday: "long" });
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const systemPrompt =
    `You are a scheduling assistant for a company. Today is ${dayName}, ${today}. Tomorrow is ${tomorrow}. ` +
    `You manage departments, employees, professions, and tasks. ` +
    `When the user mentions @Name, remove the @ and use the name to search. ` +
    `Rules: ` +
    `1. Never overlap tasks for the same employee. Always check availability before assigning. ` +
    `2. Respect employee schedules: morning=9-17, early=8-16, late=10-18, night=22-6, flexible=any. ` +
    `3. Default task duration is 60 minutes unless specified. ` +
    `4. When creating employees, auto-generate code and email if not provided. ` +
    `5. Deleting employees is a soft delete (deactivation). Deleting professions is also soft delete. ` +
    `6. Cannot delete a department that has active employees. ` +
    `7. Always confirm what you did in natural language (Spanish). ` +
    `8. If a conflict exists, suggest the next available slot. ` +
    `9. You can chain multiple operations in a single request (e.g. create employees then assign tasks). ` +
    `10. Do NOT perform destructive operations (delete all, drop, etc.) unless the user is very specific about what to delete.`;

  const agent = createReactAgent({
    llm,
    tools: allTools,
    messageModifier: systemPrompt,
    recursionLimit: 25,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const result = await agent.invoke(
      { messages: [{ role: "user", content: prompt }] },
      { signal: controller.signal }
    );
    const lastMessage = result.messages[result.messages.length - 1];
    return lastMessage.content;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { runAgent };

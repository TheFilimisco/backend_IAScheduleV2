const { ChatOpenAI } = require("@langchain/openai");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { tool } = require("@langchain/core/tools");
const { z } = require("zod");

const Department = require("../models/Department");
const Employee = require("../models/Employee");
const Task = require("../models/Task");
const logTaskChange = require("../utils/historyLogger");

const checkOverlap = async (assigneeId, startDate, durationMinutes, excludeTaskId) => {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const filter = {
    assigneeId,
    startDate: { $lt: end },
    dueDate: { $gt: start },
  };
  if (excludeTaskId) filter._id = { $ne: excludeTaskId };
  return await Task.findOne(filter);
};

const listDepartments = tool(
  async () => {
    const departments = await Department.find();
    const result = [];
    for (const dept of departments) {
      const employees = await Employee.find({ departmentId: dept._id, status: "active" });
      result.push({
        id: dept._id,
        name: dept.name,
        color: dept.color,
        employees: employees.map((e) => `${e.firstName} ${e.lastName}`),
      });
    }
    return JSON.stringify(result);
  },
  {
    name: "list_departments",
    description: "List all departments with their employees. Use this to see the organizational structure.",
    schema: z.object({}),
  }
);

const listEmployees = tool(
  async ({ departmentName }) => {
    const filter = { status: "active" };
    if (departmentName) {
      const dept = await Department.findOne({ name: new RegExp(departmentName, "i") });
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
      const parts = assigneeName.trim().split(/\s+/);
      const empFilter = { status: "active" };
      if (parts.length >= 2) {
        empFilter.firstName = new RegExp(parts[0], "i");
        empFilter.lastName = new RegExp(parts.slice(1).join(" "), "i");
      } else {
        empFilter.$or = [
          { firstName: new RegExp(parts[0], "i") },
          { lastName: new RegExp(parts[0], "i") },
        ];
      }
      const emp = await Employee.findOne(empFilter);
      if (!emp) return JSON.stringify({ error: `Employee '${assigneeName}' not found` });
      filter.assigneeId = emp._id;
    }
    const tasks = await Task.find(filter).populate("assigneeId").populate("departmentId");
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
    description: "List tasks, optionally filtered by date (YYYY-MM-DD) and/or employee name.",
    schema: z.object({
      date: z.string().optional().describe("Date in YYYY-MM-DD format"),
      assigneeName: z.string().optional().describe("Employee full name or first name"),
    }),
  }
);

const createTask = tool(
  async ({ title, description, priority, assigneeName, date, startHour, durationMinutes }) => {
    const duration = durationMinutes || 60;
    const taskData = { title, description, priority, durationMinutes: duration };

    if (assigneeName) {
      const parts = assigneeName.trim().split(/\s+/);
      const empFilter = { status: "active" };
      if (parts.length >= 2) {
        empFilter.firstName = new RegExp(parts[0], "i");
        empFilter.lastName = new RegExp(parts.slice(1).join(" "), "i");
      } else {
        empFilter.$or = [
          { firstName: new RegExp(parts[0], "i") },
          { lastName: new RegExp(parts[0], "i") },
        ];
      }
      const emp = await Employee.findOne(empFilter);
      if (!emp) return JSON.stringify({ error: `Employee '${assigneeName}' not found` });
      taskData.assigneeId = emp._id;
      if (emp.departmentId) taskData.departmentId = emp.departmentId;
    }

    if (date && startHour !== undefined) {
      const startDate = new Date(date);
      startDate.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);
      taskData.startDate = startDate;
      taskData.dueDate = new Date(startDate.getTime() + duration * 60000);

      if (taskData.assigneeId) {
        const overlap = await checkOverlap(taskData.assigneeId, taskData.startDate, duration);
        if (overlap) return JSON.stringify({ error: `Overlap conflict with task '${overlap.title}'` });
      }
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
    const task = await Task.findOne({ title: new RegExp(taskTitle, "i") });
    if (!task) return JSON.stringify({ error: `Task '${taskTitle}' not found` });

    const parts = assigneeName.trim().split(/\s+/);
    const empFilter = { status: "active" };
    if (parts.length >= 2) {
      empFilter.firstName = new RegExp(parts[0], "i");
      empFilter.lastName = new RegExp(parts.slice(1).join(" "), "i");
    } else {
      empFilter.$or = [
        { firstName: new RegExp(parts[0], "i") },
        { lastName: new RegExp(parts[0], "i") },
      ];
    }
    const emp = await Employee.findOne(empFilter);
    if (!emp) return JSON.stringify({ error: `Employee '${assigneeName}' not found` });

    const previousState = task.toJSON();
    const startDate = new Date(date);
    startDate.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);

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
    const task = await Task.findOne({ title: new RegExp(taskTitle, "i") });
    if (!task) return JSON.stringify({ error: `Task '${taskTitle}' not found` });

    const previousState = task.toJSON();
    let action = "RESCHEDULED";

    if (newAssigneeName) {
      const parts = newAssigneeName.trim().split(/\s+/);
      const empFilter = { status: "active" };
      if (parts.length >= 2) {
        empFilter.firstName = new RegExp(parts[0], "i");
        empFilter.lastName = new RegExp(parts.slice(1).join(" "), "i");
      } else {
        empFilter.$or = [
          { firstName: new RegExp(parts[0], "i") },
          { lastName: new RegExp(parts[0], "i") },
        ];
      }
      const emp = await Employee.findOne(empFilter);
      if (!emp) return JSON.stringify({ error: `Employee '${newAssigneeName}' not found` });
      task.assigneeId = emp._id;
      if (emp.departmentId) task.departmentId = emp.departmentId;
      action = "REASSIGNED";
    }

    if (newDate) {
      const startDate = new Date(newDate);
      const hour = newStartHour !== undefined ? newStartHour : (task.startDate ? task.startDate.getHours() + task.startDate.getMinutes() / 60 : 9);
      startDate.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
      task.startDate = startDate;
      task.dueDate = new Date(startDate.getTime() + task.durationMinutes * 60000);
      action = "RESCHEDULED";
    } else if (newStartHour !== undefined && task.startDate) {
      task.startDate.setHours(Math.floor(newStartHour), (newStartHour % 1) * 60, 0, 0);
      task.dueDate = new Date(task.startDate.getTime() + task.durationMinutes * 60000);
      action = "RESCHEDULED";
    }

    if (task.assigneeId && task.startDate) {
      const overlap = await checkOverlap(task.assigneeId, task.startDate, task.durationMinutes, task._id);
      if (overlap) return JSON.stringify({ error: `Overlap conflict with task '${overlap.title}'` });
    }

    await task.save();
    await logTaskChange(task._id, action, null, previousState, task.toJSON());
    return JSON.stringify({ success: true, task: { id: task._id, title: task.title, startDate: task.startDate } });
  },
  {
    name: "move_task",
    description: "Move a task to a different date, time, or employee.",
    schema: z.object({
      taskTitle: z.string().describe("Title of the task to move"),
      newDate: z.string().optional().describe("New date in YYYY-MM-DD format"),
      newStartHour: z.number().optional().describe("New start hour (e.g. 10, 14.5)"),
      newAssigneeName: z.string().optional().describe("New employee name to reassign to"),
    }),
  }
);

const deleteTask = tool(
  async ({ taskTitle }) => {
    const task = await Task.findOne({ title: new RegExp(taskTitle, "i") });
    if (!task) return JSON.stringify({ error: `Task '${taskTitle}' not found` });

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
    const parts = employeeName.trim().split(/\s+/);
    const empFilter = { status: "active" };
    if (parts.length >= 2) {
      empFilter.firstName = new RegExp(parts[0], "i");
      empFilter.lastName = new RegExp(parts.slice(1).join(" "), "i");
    } else {
      empFilter.$or = [
        { firstName: new RegExp(parts[0], "i") },
        { lastName: new RegExp(parts[0], "i") },
      ];
    }
    const emp = await Employee.findOne(empFilter);
    if (!emp) return JSON.stringify({ error: `Employee '${employeeName}' not found` });

    const duration = durationMinutes || 60;
    const startDate = new Date(date);
    startDate.setHours(Math.floor(startHour), (startHour % 1) * 60, 0, 0);

    const overlap = await checkOverlap(emp._id, startDate, duration);
    if (overlap) {
      return JSON.stringify({ available: false, conflictsWith: overlap.title, conflictStart: overlap.startDate, conflictDuration: overlap.durationMinutes });
    }
    return JSON.stringify({ available: true, employee: `${emp.firstName} ${emp.lastName}`, date, startHour, durationMinutes: duration });
  },
  {
    name: "check_availability",
    description: "Check if an employee is available at a specific date and time.",
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
        time: `${start.getHours()}:${String(start.getMinutes()).padStart(2, "0")}`,
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

const allTools = [
  listDepartments,
  listEmployees,
  listTasks,
  createTask,
  assignTask,
  moveTask,
  deleteTask,
  checkAvailability,
  getScheduleSummary,
];

const runAgent = async (prompt) => {
  const llm = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o-mini",
    temperature: 0,
  });

  const today = new Date().toISOString().split("T")[0];
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const systemPrompt =
    `You are a scheduling assistant for a company. Today is ${dayName}, ${today}. ` +
    `You manage tasks, employees, and departments. ` +
    `When the user mentions @Name, remove the @ and use the name to search employees. ` +
    `Rules: ` +
    `1. Never overlap tasks for the same employee. Always check availability before assigning. ` +
    `2. Respect employee schedules: morning=9-17, early=8-16, late=10-18, night=22-6, flexible=any. ` +
    `3. Default task duration is 60 minutes unless specified. ` +
    `4. When the user says 'tomorrow', use ${new Date(Date.now() + 86400000).toISOString().split("T")[0]}. ` +
    `5. Always confirm what you did in natural language (Spanish). ` +
    `6. If a conflict exists, suggest the next available slot.`;

  const agent = createReactAgent({
    llm,
    tools: allTools,
    messageModifier: systemPrompt,
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: prompt }],
  });

  const lastMessage = result.messages[result.messages.length - 1];
  return lastMessage.content;
};

module.exports = { runAgent };

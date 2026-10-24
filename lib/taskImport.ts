import { TASK_KINDS, type TaskKind } from "./types";

/**
 * Importing tasks from JSON - a whole workplan in one go.
 *
 * Pure, so the import dialog's help text, the server action and the tests all
 * read the same rules. Nothing here touches the database.
 */

export type ImportedTask = {
  title: string;
  kind: TaskKind;
  /** YYYY-MM-DD */
  start: string | null;
  due: string | null;
  /** HH:MM, only meaningful with a due date. */
  dueTime: string | null;
  weight: number | null;
  priority: boolean;
  notes: string | null;
  subtasks: string[];
  /** Titles of other tasks (in this file, or already in Studio). */
  dependsOn: string[];
  backlog: boolean;
  done: boolean;
};

export type TaskImport = {
  tasks: ImportedTask[];
  /** One message per rejected entry, naming it by position and title. */
  errors: string[];
};

/** What the help dialog shows - and what the tests parse, so it can't rot. */
export const EXAMPLE_IMPORT = {
  tasks: [
    {
      title: "Literature review",
      start: "2026-11-02",
      due: "2026-11-27",
      kind: "COURSEWORK",
      weight: 10,
      notes: "Cover transformers and state-space models.",
      subtasks: ["Collect 30 papers", "Write first draft"],
    },
    {
      title: "Interim report",
      due: "2026-12-15",
      dueTime: "12:00",
      priority: true,
      dependsOn: ["Literature review"],
    },
    { title: "Try a second dataset", backlog: true },
  ],
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function validDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** The first of these keys that's present, so `due`, `dueDate` and `deadline` all work. */
function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
}

export function parseTaskImport(input: unknown): TaskImport {
  const list = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { tasks?: unknown }).tasks)
      ? (input as { tasks: unknown[] }).tasks
      : null;
  if (!list) return { tasks: [], errors: ['Expected a list of tasks, or an object with a "tasks" list.'] };

  const tasks: ImportedTask[] = [];
  const errors: string[] = [];

  list.forEach((raw, i) => {
    const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    const title = o ? pick(o, "title", "name") : undefined;
    const name = typeof title === "string" && title.trim() ? title.trim() : null;
    const at = `Task ${i + 1}${name ? ` (“${name}”)` : ""}`;
    if (!o || !name) { errors.push(`${at}: needs a "title".`); return; }

    const problems: string[] = [];

    const kindRaw = pick(o, "kind", "type");
    let kind: TaskKind = "OTHER";
    if (kindRaw !== undefined) {
      const k = String(kindRaw).trim().toUpperCase();
      if ((TASK_KINDS as readonly string[]).includes(k)) kind = k as TaskKind;
      else problems.push(`kind “${kindRaw}” isn't one of ${TASK_KINDS.join(", ")}`);
    }

    const date = (label: string, v: unknown): string | null => {
      if (v === undefined) return null;
      if (typeof v === "string" && validDate(v.trim())) return v.trim();
      problems.push(`${label} “${v}” should be a real date like 2026-12-15`);
      return null;
    };
    const start = date("start", pick(o, "start", "startsAt", "startDate"));
    const due = date("due", pick(o, "due", "dueDate", "deadline", "dueAt"));
    if (start && due && start > due) problems.push("start is after due");

    const timeRaw = pick(o, "dueTime", "time");
    let dueTime: string | null = null;
    if (timeRaw !== undefined) {
      if (typeof timeRaw === "string" && TIME.test(timeRaw.trim())) dueTime = timeRaw.trim().padStart(5, "0");
      else problems.push(`dueTime “${timeRaw}” should look like 17:30`);
    }

    const weightRaw = pick(o, "weight", "gradeWeight");
    let weight: number | null = null;
    if (weightRaw !== undefined) {
      const w = typeof weightRaw === "number" ? weightRaw : Number(String(weightRaw).replace("%", ""));
      if (Number.isFinite(w) && w >= 0 && w <= 100) weight = w;
      else problems.push(`weight “${weightRaw}” should be a percentage from 0 to 100`);
    }

    const strings = (label: string, v: unknown): string[] => {
      if (v === undefined) return [];
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.map((x) => x.trim()).filter(Boolean);
      problems.push(`${label} should be a list of text`);
      return [];
    };
    const subtasks = strings("subtasks", pick(o, "subtasks", "items", "checklist"));
    const dependsOn = strings("dependsOn", pick(o, "dependsOn", "after"));

    const bool = (label: string, v: unknown): boolean => {
      if (v === undefined) return false;
      if (typeof v === "boolean") return v;
      problems.push(`${label} should be true or false`);
      return false;
    };
    const priority = bool("priority", pick(o, "priority", "high"));
    const backlog = bool("backlog", o.backlog);
    const done = bool("done", pick(o, "done", "completed"));

    const notesRaw = pick(o, "notes", "description");
    if (notesRaw !== undefined && typeof notesRaw !== "string") problems.push("notes should be text");

    if (problems.length) { errors.push(`${at}: ${problems.join("; ")}.`); return; }
    tasks.push({
      title: name, kind, start, due, dueTime: due ? dueTime : null, weight, priority,
      notes: typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null,
      subtasks, dependsOn, backlog, done,
    });
  });

  return { tasks, errors };
}

import { addDays, endOfDay, isSameDay, startOfDay, startOfWeek } from "../dates";
import { parseTask } from "../parse";

/**
 * Livio's todo list: which group a todo falls in, how its due date reads, and
 * how a typed due date is understood. Pure, so it's tested and shared by the
 * page and Livio's home.
 */

export type TodoLike = {
  id: string;
  title: string;
  dueAt: Date | null;
  priority: number;
  doneAt: Date | null;
  createdAt: Date;
};

export const GROUPS = ["overdue", "today", "week", "later", "none"] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_LABEL: Record<Group, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No date",
};

/** Overdue means from a day already gone: something due at 9am is still
 *  today's at noon. This week runs to the end of Sunday. */
export function groupOf(t: Pick<TodoLike, "dueAt">, now: Date): Group {
  if (!t.dueAt) return "none";
  if (t.dueAt < startOfDay(now)) return "overdue";
  if (isSameDay(t.dueAt, now)) return "today";
  if (t.dueAt <= endOfDay(addDays(startOfWeek(now), 6))) return "week";
  return "later";
}

/** Priority first, then soonest, then oldest - the order you'd tackle them. */
function compare(a: TodoLike, b: TodoLike): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const da = a.dueAt?.getTime() ?? Infinity;
  const db = b.dueAt?.getTime() ?? Infinity;
  if (da !== db) return da - db;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export type TodoGroup<T> = { key: Group; label: string; items: T[] };

/** Open todos by group, empty groups left out; done ones, latest first. */
export function groupTodos<T extends TodoLike>(todos: T[], now: Date): { groups: TodoGroup<T>[]; done: T[] } {
  const open = todos.filter((t) => !t.doneAt);
  const groups = GROUPS.map((key) => ({
    key,
    label: GROUP_LABEL[key],
    items: open.filter((t) => groupOf(t, now) === key).sort(compare),
  })).filter((g) => g.items.length);
  const done = todos.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.getTime() - a.doneAt!.getTime());
  return { groups, done };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 23:59 is Studio's "sometime that day" - no time worth showing. */
export function hasTime(d: Date): boolean {
  return !(d.getHours() === 23 && d.getMinutes() === 59);
}

/** "Today 17:00", "Tomorrow", "Fri", "3 Nov", "3 Nov 2027". */
export function dueLabel(d: Date, now: Date): string {
  const today = startOfDay(now);
  const days = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  const day =
    days === 0 ? "Today"
    : days === 1 ? "Tomorrow"
    : days === -1 ? "Yesterday"
    : days > 1 && days < 7 ? WEEKDAYS[d.getDay()]
    : `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  return hasTime(d) ? `${day} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : day;
}

/**
 * A due date as typed: "fri", "fri 5pm", "3 nov", "in 2 weeks", "17:30" (today).
 * Empty clears it. A date without a time is the end of that day. Returns
 * `undefined` for anything that isn't a date.
 */
export function parseDue(text: string, now: Date = new Date()): Date | null | undefined {
  const t = text.trim();
  if (!t || /^(-|none|clear)$/i.test(t)) return null;
  const p = parseTask(t, [], now);
  if (p.title || (!p.dueDate && !p.dueTime)) return undefined;
  const [y, m, d] = (p.dueDate ?? "").split("-").map(Number);
  const base = p.dueDate ? new Date(y, m - 1, d) : startOfDay(now);
  const [hh, mm] = (p.dueTime ?? "23:59").split(":").map(Number);
  base.setHours(hh, mm, 0, 0);
  return base;
}

/** What a due date looks like typed back into the editor. */
export function dueText(d: Date | null): string {
  if (!d) return "";
  const date = `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`;
  return hasTime(d) ? `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : date;
}

type Course = { id: string; shortName: string; code: string; name: string };

/**
 * Studio's one-line parser, with one difference: a course only counts when
 * it's asked for with @. Studio's composer also takes a bare short name, which
 * is right there - but in Livio "finish the project plan" shouldn't vanish
 * into the Project course.
 */
export function parseTodo(text: string, courses: Course[], now: Date = new Date()) {
  const asked = courses.filter((c) =>
    [c.shortName, c.code].some((n) => n && new RegExp(`(^|\\s)@${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i").test(text)),
  );
  return parseTask(text, asked, now);
}

/**
 * What a title typed on the phone already says: "problem sheet @fp fri !"
 * arrives with its course, due date and priority set and the words taken
 * out. A Deadline set in Notion itself wins over a date in the title.
 */
export function triageFromTitle(title: string, courses: Course[], now: Date = new Date()) {
  const p = parseTodo(title, courses, now);
  const due = p.dueDate || p.dueTime ? parseDue([p.dueDate, p.dueTime].filter(Boolean).join(" "), now) ?? null : null;
  return {
    title: p.title.trim() || title.trim(),
    courseId: p.courseId,
    dueAt: due,
    priority: p.priority,
  };
}

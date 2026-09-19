import { TASK_KINDS } from "./types";
import { hhmmToMin } from "./events";

/**
 * Turning a task edit into a database patch — kept pure so it can be tested,
 * because the date logic is easy to get subtly wrong.
 *
 * Rules:
 * - Only fields present in the edit are touched.
 * - A class (lecture/lab/seminar) is "due" at its start time, so its date and
 *   start time move together: changing either keeps dueAt consistent.
 * - A deadline with a date but no time falls back to 23:59 ("that day").
 */

export type TaskEdit = {
  title?: string;
  courseId?: string | null;
  kind?: string;
  notes?: string | null;
  dueDate?: string | null;   // YYYY-MM-DD, or null to clear
  dueTime?: string | null;   // HH:MM
  startTime?: string | null; // HH:MM — classes only
  endTime?: string | null;   // HH:MM — classes only
  gradeWeight?: number | null;
  priority?: boolean;
  cancelled?: boolean;
  examDiet?: string | null;
  /** Planned start (YYYY-MM-DD), drawn as a bar on the project timeline. */
  startDate?: string | null;
};

type Existing = { dueAt: Date | null; startMin: number | null; endMin: number | null };

export type TaskPatch = {
  title?: string;
  courseId?: string | null;
  kind?: string;
  notes?: string | null;
  gradeWeight?: number | null;
  priority?: number;
  cancelled?: boolean;
  examDiet?: string | null;
  startMin?: number | null;
  endMin?: number | null;
  dueAt?: Date | null;
  startsAt?: Date | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function buildTaskPatch(
  existing: Existing,
  data: TaskEdit,
): { ok: true; patch: TaskPatch } | { ok: false; error: string } {
  const patch: TaskPatch = {};

  if (data.title !== undefined) {
    const title = data.title.trim();
    if (!title) return { ok: false, error: "A task needs a title." };
    patch.title = title;
  }
  if (data.courseId !== undefined) patch.courseId = data.courseId || null;
  if (data.kind !== undefined) {
    if (!(TASK_KINDS as readonly string[]).includes(data.kind)) {
      return { ok: false, error: `Unknown task type: ${data.kind}` };
    }
    patch.kind = data.kind;
  }
  if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
  if (data.gradeWeight !== undefined) {
    const w = data.gradeWeight;
    if (w != null && (!Number.isFinite(w) || w < 0 || w > 100)) {
      return { ok: false, error: "Grade weight must be between 0 and 100." };
    }
    patch.gradeWeight = w;
  }
  if (data.priority !== undefined) patch.priority = data.priority ? 1 : 0;
  if (data.cancelled !== undefined) patch.cancelled = data.cancelled;
  if (data.examDiet !== undefined) patch.examDiet = data.examDiet?.trim() || null;

  // A time that was supplied but doesn't parse is an error, not a silent clear.
  if (data.startTime && hhmmToMin(data.startTime) == null) return { ok: false, error: "Start time isn't a valid time." };
  if (data.endTime && hhmmToMin(data.endTime) == null) return { ok: false, error: "End time isn't a valid time." };
  if (data.dueTime && hhmmToMin(data.dueTime) == null) return { ok: false, error: "Time isn't a valid time." };

  if (data.startTime !== undefined) patch.startMin = hhmmToMin(data.startTime);
  if (data.endTime !== undefined) patch.endMin = hhmmToMin(data.endTime);

  const startMin = data.startTime !== undefined ? hhmmToMin(data.startTime) : existing.startMin;
  const endMin = data.endTime !== undefined ? hhmmToMin(data.endTime) : existing.endMin;
  if (startMin != null && endMin != null && endMin <= startMin) {
    return { ok: false, error: "End time must be after start time." };
  }

  if (data.dueDate !== undefined) {
    if (!data.dueDate) {
      patch.dueAt = null;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) return { ok: false, error: "That date isn't valid." };
      const [y, m, d] = data.dueDate.split("-").map(Number);
      const time = startMin != null ? `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}` : data.dueTime || "23:59";
      const [hh, mm] = time.split(":").map(Number);
      patch.dueAt = new Date(y, m - 1, d, hh, mm, 0, 0);
    }
  } else if (data.startTime !== undefined && existing.dueAt && startMin != null) {
    // Moving only a class's start time moves its date-time with it.
    const d = new Date(existing.dueAt);
    d.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    patch.dueAt = d;
  }

  if (data.startDate !== undefined) {
    if (!data.startDate) patch.startsAt = null;
    else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) return { ok: false, error: "That start date isn't valid." };
      const [y, m, d] = data.startDate.split("-").map(Number);
      patch.startsAt = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }

  // A task can't be planned to start after it's due.
  const start = patch.startsAt !== undefined ? patch.startsAt : undefined;
  const due = patch.dueAt !== undefined ? patch.dueAt : existing.dueAt;
  if (start && due && start > due) return { ok: false, error: "The start date is after the due date." };

  return { ok: true, patch };
}

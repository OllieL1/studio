"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { DEFAULT_ITEMS } from "@/lib/types";
import { normaliseWeights } from "@/lib/progress";
import { distributeMinutes } from "@/lib/split";
import { upsertEvent, deleteEvent, isGoogleConfigured } from "@/lib/google";
import {
  addTaskItem, removeTaskItem, setCourseRevisionMode, setTaskDone, toggleTaskItem,
} from "@/lib/tasks";

function refresh() {
  revalidatePath("/", "layout");
}

/* ── Checklist items ─────────────────────────────────────────────────────
   Thin wrappers over lib/tasks.ts, which holds the logic so it stays
   testable — revalidatePath needs a request context these actions have and
   a test does not.                                                          */

export async function toggleItem(itemId: string) {
  await toggleTaskItem(db, itemId);
  refresh();
}

export async function toggleTask(taskId: string) {
  await setTaskDone(db, taskId);
  refresh();
}

export async function addItem(taskId: string, label: string) {
  await addTaskItem(db, taskId, label);
  refresh();
}

export async function deleteItem(itemId: string) {
  await removeTaskItem(db, itemId);
  refresh();
}

/* ── Tasks ─────────────────────────────────────────────────────────────── */

export type NewTaskInput = {
  title: string;
  courseId: string | null;
  kind: string;
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:MM
  gradeWeight: number | null;
  notes: string | null;
  priority: boolean;
  items: string[];
  dependsOn: string[];
};

export async function createTask(input: NewTaskInput) {
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "A title is required." };

  let dueAt: Date | null = null;
  if (input.dueDate) {
    const [y, m, d] = input.dueDate.split("-").map(Number);
    const [hh, mm] = (input.dueTime || "23:59").split(":").map(Number);
    dueAt = new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  // Explicit subtasks win; otherwise fall back to the kind's default checklist
  // so a lecture created by hand still gets its three parts.
  const labels = input.items.map((s) => s.trim()).filter(Boolean);
  const itemLabels = labels.length > 0 ? labels : (DEFAULT_ITEMS[input.kind] ?? []);

  const task = await db.task.create({
    data: {
      title,
      courseId: input.courseId,
      kind: input.kind,
      dueAt,
      gradeWeight: input.gradeWeight,
      notes: input.notes?.trim() || null,
      priority: input.priority ? 1 : 0,
      items: { create: itemLabels.map((label, i) => ({ label, position: i })) },
    },
  });

  if (input.dependsOn.length > 0) {
    await db.taskDependency.createMany({
      data: input.dependsOn.map((prerequisiteId) => ({
        dependentId: task.id,
        prerequisiteId,
      })),
    });
  }

  refresh();
  return { ok: true as const, id: task.id };
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    notes?: string | null;
    dueDate?: string | null;
    dueTime?: string | null;
    gradeWeight?: number | null;
    priority?: boolean;
    cancelled?: boolean;
    examDiet?: string | null;
  },
) {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
  if (data.gradeWeight !== undefined) patch.gradeWeight = data.gradeWeight;
  if (data.priority !== undefined) patch.priority = data.priority ? 1 : 0;
  if (data.cancelled !== undefined) patch.cancelled = data.cancelled;
  if (data.examDiet !== undefined) patch.examDiet = data.examDiet;
  if (data.dueDate !== undefined) {
    if (!data.dueDate) patch.dueAt = null;
    else {
      const [y, m, d] = data.dueDate.split("-").map(Number);
      const [hh, mm] = (data.dueTime || "23:59").split(":").map(Number);
      patch.dueAt = new Date(y, m - 1, d, hh, mm, 0, 0);
    }
  }
  await db.task.update({ where: { id }, data: patch });
  refresh();
}

/** Where the handwritten notes for this lecture physically live. */
export async function setNotebookLocation(
  taskId: string,
  notebook: string | null,
  pages: string | null,
) {
  await db.task.update({
    where: { id: taskId },
    data: {
      notebook: notebook?.trim() || null,
      notebookPages: pages?.trim() || null,
    },
  });
  refresh();
}

/** Save typed notes (markdown) for a lecture. */
export async function saveNotes(taskId: string, markdown: string) {
  await db.task.update({
    where: { id: taskId },
    data: { notesMd: markdown.trim() ? markdown : null },
  });
  refresh();
  return { ok: true as const };
}

export async function deleteTask(id: string) {
  await db.task.delete({ where: { id } });
  refresh();
}

export async function addDependency(dependentId: string, prerequisiteId: string) {
  if (dependentId === prerequisiteId) return;
  await db.taskDependency.upsert({
    where: { dependentId_prerequisiteId: { dependentId, prerequisiteId } },
    update: {},
    create: { dependentId, prerequisiteId },
  });
  refresh();
}

export async function removeDependency(dependentId: string, prerequisiteId: string) {
  await db.taskDependency
    .delete({ where: { dependentId_prerequisiteId: { dependentId, prerequisiteId } } })
    .catch(() => {});
  refresh();
}

/* ── Courses ───────────────────────────────────────────────────────────── */

export async function updateCourseWeights(
  courseId: string,
  lecture: number,
  lab: number,
  assessment: number,
) {
  const w = normaliseWeights(lecture, lab, assessment);
  await db.course.update({
    where: { id: courseId },
    data: { lectureWeight: w.lecture, labWeight: w.lab, assessmentWeight: w.assessment },
  });
  refresh();
}

/**
 * Mark a course for revision (or stand it down again).
 *
 * Adds an unticked "Revised" part to every lecture, re-opening the course for
 * exam prep without unticking the attendance/notes history or creating a
 * parallel set of revision tasks.
 */
export async function setRevisionMode(courseId: string, on: boolean) {
  const res = await setCourseRevisionMode(db, courseId, on);
  refresh();
  return res;
}

export async function updateCourse(
  courseId: string,
  data: { name?: string; shortName?: string; colour?: string },
) {
  await db.course.update({ where: { id: courseId }, data });
  refresh();
}

/* ── Timer ─────────────────────────────────────────────────────────────── */

/** Start the global timer. Server-side state, so it survives reloads, tab
 *  closes and crashes — the whole point of not using localStorage. */
export async function startTimer() {
  const existing = await db.activeTimer.findUnique({ where: { id: "singleton" } });
  if (existing) return { startedAt: existing.startedAt };

  const timer = await db.activeTimer.create({
    data: { id: "singleton", startedAt: new Date() },
  });
  refresh();
  return { startedAt: timer.startedAt };
}

/** Abandon a running timer without recording anything. */
export async function cancelTimer() {
  await db.activeTimer.deleteMany({ where: { id: "singleton" } });
  refresh();
}

/** A subject and its slice of the session, in minutes. */
export type CourseSlice = { courseId: string; minutes: number };

export type StopTimerInput = {
  name: string;
  courses: CourseSlice[];
  taskIds: string[];
  minutes: number; // adjusted, never above the wall-clock elapsed
  focus: number;
  notes: string | null;
};

/**
 * Force the per-subject slices to sum to the session total.
 *
 * The client already apportions them, but the duration is clamped
 * server-side and a stale or hand-crafted request could disagree — so the
 * slices are re-derived here from their ratios. The session total is always
 * the authority. `distributeMinutes` handles the all-zero case by falling
 * back to an even split, so no time is ever lost.
 */
function reconcileSlices(slices: CourseSlice[], total: number): CourseSlice[] {
  if (slices.length === 0) return [];
  const minutes = distributeMinutes(
    total,
    slices.map((s) => s.minutes),
  );
  return slices.map((s, i) => ({ courseId: s.courseId, minutes: minutes[i] }));
}

export async function stopTimer(input: StopTimerInput) {
  const timer = await db.activeTimer.findUnique({ where: { id: "singleton" } });
  if (!timer) return { ok: false as const, error: "No timer is running." };

  const endedAt = new Date();
  const rawMinutes = Math.max(
    0,
    Math.round((endedAt.getTime() - timer.startedAt.getTime()) / 60000),
  );

  // Adjustment is down-only (AIM.md). Clamp rather than reject, so a stale
  // form can never inflate a session.
  const minutes = Math.max(0, Math.min(Math.round(input.minutes), rawMinutes));
  const focus = Math.max(0, Math.min(100, Math.round(input.focus)));
  const name = input.name.trim() || "Study session";
  const slices = reconcileSlices(input.courses, minutes);

  await db.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        name,
        startedAt: timer.startedAt,
        endedAt,
        minutes,
        rawMinutes,
        focus,
        notes: input.notes?.trim() || null,
        courses: { create: slices },
        tasks: { create: input.taskIds.map((taskId) => ({ taskId })) },
      },
    });
    await tx.activeTimer.deleteMany({ where: { id: "singleton" } });
    return session;
  });

  refresh();
  return { ok: true as const };
}

/** Persist a name typed while the timer is still running, so it isn't lost. */
export async function setTimerDraftName(name: string) {
  await db.activeTimer
    .update({ where: { id: "singleton" }, data: { draftName: name } })
    .catch(() => {});
}

/* ── Sessions ──────────────────────────────────────────────────────────── */

export async function deleteSession(id: string) {
  await db.session.delete({ where: { id } });
  refresh();
}

export async function updateSession(
  id: string,
  data: { name?: string; focus?: number; notes?: string | null },
) {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name.trim() || "Study session";
  if (data.focus !== undefined) patch.focus = Math.max(0, Math.min(100, Math.round(data.focus)));
  if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
  await db.session.update({ where: { id }, data: patch });
  refresh();
}

/** Log a session that happened away from the keyboard. */
export async function logManualSession(input: {
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  minutes: number;
  focus: number;
  courses: CourseSlice[];
  taskIds: string[];
  notes: string | null;
}) {
  const [y, m, d] = input.date.split("-").map(Number);
  const [hh, mm] = input.startTime.split(":").map(Number);
  const startedAt = new Date(y, m - 1, d, hh, mm, 0, 0);
  const minutes = Math.max(1, Math.round(input.minutes));
  const endedAt = new Date(startedAt.getTime() + minutes * 60000);

  await db.session.create({
    data: {
      name: input.name.trim() || "Study session",
      startedAt,
      endedAt,
      minutes,
      rawMinutes: minutes,
      focus: Math.max(0, Math.min(100, Math.round(input.focus))),
      notes: input.notes?.trim() || null,
      courses: { create: reconcileSlices(input.courses, minutes) },
      tasks: { create: input.taskIds.map((taskId) => ({ taskId })) },
    },
  });
  refresh();
  return { ok: true as const };
}


/* ── Google Calendar ────────────────────────────────────────────────────── */

/**
 * Push a task to Google Calendar, creating the event or updating the one we
 * created before. Tasks with a time get a one-hour slot ending at the
 * deadline; tasks with only a date become all-day events.
 */
export async function pushToCalendar(taskId: string) {
  if (!isGoogleConfigured()) {
    return { ok: false as const, error: "Google Calendar isn't set up yet — see Settings." };
  }

  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { course: true },
  });
  if (!task) return { ok: false as const, error: "Task not found." };
  if (!task.dueAt) return { ok: false as const, error: "Give the task a date first." };

  // A 23:59 deadline is really "sometime that day", so treat it as all-day.
  const allDay = task.startMin == null && isEndOfDay(task.dueAt);
  const start = task.startMin != null
    ? task.dueAt
    : allDay
      ? task.dueAt
      : new Date(task.dueAt.getTime() - 60 * 60 * 1000);
  const end = task.endMin != null
    ? new Date(task.dueAt.getTime() + (task.endMin - task.startMin!) * 60000)
    : allDay
      ? task.dueAt
      : task.dueAt;

  const res = await upsertEvent(
    {
      summary: task.course ? `${task.course.shortName}: ${task.title}` : task.title,
      description: [
        task.notes,
        task.gradeWeight != null ? `Worth ${task.gradeWeight}% of the course.` : null,
        task.course ? `${task.course.name} (${task.course.code})` : null,
        `Added from Study Planner.`,
      ].filter(Boolean).join("\n\n"),
      start,
      end,
      allDay,
    },
    task.calendarEventId,
  );

  if (!res.ok) return { ok: false as const, error: res.error };

  await db.task.update({
    where: { id: taskId },
    data: { calendarEventId: res.eventId },
  });
  refresh();
  return { ok: true as const, htmlLink: res.htmlLink };
}

/** Remove a task's calendar event and forget the link. */
export async function removeFromCalendar(taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task?.calendarEventId) return { ok: true as const };

  await deleteEvent(task.calendarEventId);
  await db.task.update({ where: { id: taskId }, data: { calendarEventId: null } });
  refresh();
  return { ok: true as const };
}

/** Disconnect Google entirely. Events already created are left in place. */
export async function disconnectGoogle() {
  await db.googleAuth.deleteMany({ where: { id: "singleton" } });
  await db.task.updateMany({ data: { calendarEventId: null } });
  refresh();
}

export async function setCalendarTarget(calendarId: string) {
  await db.googleAuth.update({
    where: { id: "singleton" },
    data: { calendarId },
  });
  refresh();
}

function isEndOfDay(d: Date): boolean {
  return d.getHours() === 23 && d.getMinutes() === 59;
}

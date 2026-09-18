import type { PrismaClient } from "@prisma/client";
import { REVISION_ITEM_LABEL } from "./types";

/**
 * Task-completion domain logic.
 *
 * Kept out of app/actions.ts so it can be exercised directly: server actions
 * call revalidatePath, which needs a live request context and therefore can't
 * run from a test or a script. The actions are thin wrappers over these.
 */

type DB = PrismaClient;

/**
 * Keep Task.doneAt in step with its checklist.
 *
 * Truth lives in the items; doneAt is a denormalised convenience for sorting
 * and filtering. A task with no items has no checklist to consult, so its own
 * doneAt stands and this is a no-op.
 */
export async function syncTaskDone(db: DB, taskId: string): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { items: true },
  });
  if (!task || task.items.length === 0) return;

  const allDone = task.items.every((i) => i.doneAt);
  if (allDone && !task.doneAt) {
    await db.task.update({ where: { id: taskId }, data: { doneAt: new Date() } });
  } else if (!allDone && task.doneAt) {
    await db.task.update({ where: { id: taskId }, data: { doneAt: null } });
  }
}

/** Tick or untick one checklist item, then reconcile the parent task. */
export async function toggleTaskItem(db: DB, itemId: string): Promise<void> {
  const item = await db.taskItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  await db.taskItem.update({
    where: { id: itemId },
    data: { doneAt: item.doneAt ? null : new Date() },
  });
  await syncTaskDone(db, item.taskId);
}

/** Tick or untick a whole task, including every item, so "done" is unambiguous. */
export async function setTaskDone(db: DB, taskId: string): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { items: true },
  });
  if (!task) return;

  const isDone = task.items.length ? task.items.every((i) => i.doneAt) : !!task.doneAt;
  const now = isDone ? null : new Date();

  await db.$transaction([
    db.taskItem.updateMany({ where: { taskId }, data: { doneAt: now } }),
    db.task.update({ where: { id: taskId }, data: { doneAt: now } }),
  ]);
}

/**
 * Append a subtask.
 *
 * Subtasks are equally weighted within their task — progress is simply
 * done/total (see lib/progress.ts), so adding a fifth subtask makes each
 * worth a fifth.
 */
export async function addTaskItem(db: DB, taskId: string, label: string): Promise<void> {
  const trimmed = label.trim();
  if (!trimmed) return;

  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { items: { select: { id: true } } },
  });
  if (!task) return;

  // Adding the first subtask to a task that's already ticked off would
  // otherwise un-complete it, because completion switches from the task's own
  // doneAt to its checklist. Create that first item already done, so marking
  // a task complete and then breaking it down doesn't undo the tick.
  const inheritDone = task.items.length === 0 && task.doneAt !== null;

  await db.taskItem.create({
    data: {
      taskId,
      label: trimmed,
      position: task.items.length,
      doneAt: inheritDone ? task.doneAt : null,
    },
  });
  await syncTaskDone(db, taskId);
}

/** Rename a subtask. Empty labels are rejected rather than blanking it. */
export async function renameTaskItem(db: DB, itemId: string, label: string): Promise<boolean> {
  const trimmed = label.trim();
  if (!trimmed) return false;
  await db.taskItem.update({ where: { id: itemId }, data: { label: trimmed } });
  return true;
}

/** Remove a subtask, handing completion back to the task if it was the last. */
export async function removeTaskItem(db: DB, itemId: string): Promise<void> {
  const item = await db.taskItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  await db.taskItem.delete({ where: { id: itemId } });

  const remaining = await db.taskItem.count({ where: { taskId: item.taskId } });
  if (remaining === 0) {
    // Carry the removed item's verdict across so the task doesn't silently flip.
    await db.task.update({
      where: { id: item.taskId },
      data: { doneAt: item.doneAt ?? null },
    });
  } else {
    await syncTaskDone(db, item.taskId);
  }
}

/* ── Revision mode ──────────────────────────────────────────────────────── */


/** Lecture-like kinds, i.e. the ones revision re-opens. */
const LECTURE_KINDS = ["LECTURE", "SEMINAR"];

/**
 * Turn revision mode on or off for a course.
 *
 * ON  — every lecture gains an unticked "Revised" part at the end of its
 *       checklist. Attendance and notes stay ticked, because they genuinely
 *       happened; the lecture simply drops from 3/3 to 3/4 and the course
 *       re-opens. This is the whole point: no unticking by hand, no duplicate
 *       revision tasks.
 * OFF — the "Revised" parts are removed and every lecture returns to exactly
 *       the state it was in before, including its doneAt.
 *
 * Idempotent in both directions, and safe to run twice.
 */
export async function setCourseRevisionMode(
  db: DB,
  courseId: string,
  on: boolean,
): Promise<{ lecturesAffected: number }> {
  const lectures = await db.task.findMany({
    where: { courseId, kind: { in: LECTURE_KINDS }, cancelled: false },
    include: { items: true },
  });

  let affected = 0;

  for (const lecture of lectures) {
    const existing = lecture.items.find((i) => i.label === REVISION_ITEM_LABEL);

    if (on) {
      if (existing) continue; // already re-opened
      await db.taskItem.create({
        data: {
          taskId: lecture.id,
          label: REVISION_ITEM_LABEL,
          // Always last, so it reads as the final step.
          position: Math.max(0, ...lecture.items.map((i) => i.position + 1)),
          doneAt: null,
        },
      });
      affected++;
    } else {
      if (!existing) continue;
      await db.taskItem.delete({ where: { id: existing.id } });
      affected++;
    }

    await syncTaskDone(db, lecture.id);
  }

  await db.course.update({ where: { id: courseId }, data: { revisionMode: on } });
  return { lecturesAffected: affected };
}

/** How far through revision a course is — ticked "Revised" parts over total. */
export async function revisionProgress(
  db: DB,
  courseId: string,
): Promise<{ revised: number; total: number }> {
  const items = await db.taskItem.findMany({
    where: {
      label: REVISION_ITEM_LABEL,
      task: { is: { courseId, cancelled: false } },
    },
    select: { doneAt: true },
  });
  return { revised: items.filter((i) => i.doneAt).length, total: items.length };
}

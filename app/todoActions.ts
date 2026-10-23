"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { deleteEvent } from "@/lib/google";
import { visibleCourseWhere } from "@/lib/types";
import { addDays, toISODate } from "@/lib/dates";
import { parseTodo } from "@/lib/livio/todo";
import {
  dismissInboxItem, enterInboxItem, notionDoneSync, pullNotion, restoreInboxItem,
  type InboxItem, type PullResult,
} from "@/lib/notionSync";
import { setTaskDone } from "@/lib/tasks";
import { pushToCalendar, removeFromCalendar } from "./actions";

/*
 * Livio todos are Studio tasks without a course. Give one a course and it
 * moves to Studio, where that course's tasks live; the page says so and
 * offers it back. Like careers, the page edits optimistically and swaps in
 * what these return.
 */

export type TodoRow = {
  id: string;
  title: string;
  dueAt: Date | null;
  priority: number;
  doneAt: Date | null;
  createdAt: Date;
  calendarEventId: string | null;
  notionPageId: string | null;
};

export type InboxRow = InboxItem;

export type TodoCourse = { id: string; name: string; shortName: string; code: string; colour: string };

const select = {
  id: true, title: true, dueAt: true, priority: true, doneAt: true, createdAt: true, calendarEventId: true, notionPageId: true,
} as const;

/** Open course-less tasks, plus the last fortnight's finished ones. */
export async function listTodos(): Promise<TodoRow[]> {
  return db.task.findMany({
    where: {
      courseId: null,
      cancelled: false,
      OR: [{ doneAt: null }, { doneAt: { gte: addDays(new Date(), -14) } }],
    },
    select,
  });
}

export async function listInbox(): Promise<InboxRow[]> {
  return db.notionInboxItem.findMany({ orderBy: { pulledAt: "asc" } });
}

export async function listTodoCourses(): Promise<TodoCourse[]> {
  return db.course.findMany({
    where: visibleCourseWhere(),
    orderBy: { position: "asc" },
    select: { id: true, name: true, shortName: true, code: true, colour: true },
  });
}

export type Moved = { movedTo: string };

async function courseName(id: string) {
  return (await db.course.findUnique({ where: { id }, select: { shortName: true, name: true } }))?.shortName ?? "Studio";
}

/**
 * One line in: "renew railcard fri 5pm !". Studio's parser reads the date,
 * time and priority; asking for a course ("@fp") sends it straight to Studio.
 */
export async function createTodo(text: string): Promise<{ row: TodoRow } | Moved | { error: string }> {
  const courses = await listTodoCourses();
  const p = parseTodo(text, courses);
  const title = p.title.trim();
  if (!title) return { error: "Give it a name." };
  let dueAt: Date | null = null;
  if (p.dueDate || p.dueTime) {
    // A time alone ("5pm") is today's - today here, not in UTC.
    const [y, m, d] = (p.dueDate ?? toISODate(new Date())).split("-").map(Number);
    const [hh, mm] = (p.dueTime ?? "23:59").split(":").map(Number);
    dueAt = new Date(y, m - 1, d, hh, mm);
  }
  const task = await db.task.create({
    data: { title, kind: "OTHER", courseId: p.courseId, dueAt, priority: p.priority ? 1 : 0 },
    select,
  });
  if (p.courseId) return { movedTo: await courseName(p.courseId) };
  return { row: task };
}

export type TodoPatch = Partial<{ title: string; dueAt: Date | null; priority: number; courseId: string | null }>;

export async function updateTodo(id: string, patch: TodoPatch): Promise<{ row: TodoRow } | Moved> {
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined && patch.title.trim()) data.title = patch.title.trim();
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.courseId !== undefined) data.courseId = patch.courseId;
  const row = await db.task.update({ where: { id }, data, select });

  // An event already on the calendar follows its new date or name; one whose
  // date was cleared comes off.
  if (row.calendarEventId && (patch.dueAt !== undefined || patch.title !== undefined)) {
    if (row.dueAt) await pushToCalendar(id);
    else await removeFromCalendar(id);
  }
  if (patch.courseId) return { movedTo: await courseName(patch.courseId) };
  return { row: await db.task.findUniqueOrThrow({ where: { id }, select }) };
}

export async function toggleTodo(id: string): Promise<TodoRow> {
  await setTaskDone(db, id);
  after(() => notionDoneSync(id));
  return db.task.findUniqueOrThrow({ where: { id }, select });
}

export type TodoSnapshot = TodoRow & { notes: string | null };

/** Deleted outright - its calendar event too - but handed back for undo. */
export async function deleteTodo(id: string): Promise<TodoSnapshot | null> {
  const task = await db.task.findUnique({ where: { id }, select: { ...select, notes: true } });
  if (!task) return null;
  if (task.calendarEventId) await deleteEvent(task.calendarEventId).catch(() => false);
  await db.task.delete({ where: { id } });
  return task;
}

export async function restoreTodo(t: TodoSnapshot): Promise<TodoRow> {
  const { calendarEventId: _gone, ...rest } = t;
  void _gone;
  return db.task.create({ data: { ...rest, kind: "OTHER" }, select });
}

/** On the calendar if it isn't, off if it is. */
export async function toggleTodoCalendar(id: string): Promise<{ row: TodoRow; error?: string }> {
  const task = await db.task.findUniqueOrThrow({ where: { id }, select });
  const res = task.calendarEventId ? await removeFromCalendar(id) : await pushToCalendar(id);
  const row = await db.task.findUniqueOrThrow({ where: { id }, select });
  return "error" in res && res.error ? { row, error: res.error } : { row };
}

/* ── The Notion inbox ───────────────────────────────────────────────────── */

export async function pullInbox(force: boolean): Promise<PullResult> {
  return pullNotion(force);
}

export type InboxPatch = Partial<{ title: string; dueAt: Date | null; courseId: string | null; priority: boolean; toCalendar: boolean }>;

export async function updateInbox(id: string, patch: InboxPatch): Promise<InboxRow> {
  const data = { ...patch };
  if (data.title !== undefined) data.title = data.title.trim() || "Untitled";
  return db.notionInboxItem.update({ where: { id }, data });
}

/** In it goes: a task (in Studio if it was given a course), ticked Synced. */
export async function enterInbox(id: string): Promise<({ row: TodoRow } | Moved | { gone: true }) & { calendarError?: string }> {
  const entered = await enterInboxItem(id);
  if (!entered) return { gone: true };
  let calendarError: string | undefined;
  if (entered.toCalendar && entered.dueAt) {
    const res = await pushToCalendar(entered.taskId);
    if (!res.ok) calendarError = res.error;
  }
  const task = await db.task.findUniqueOrThrow({ where: { id: entered.taskId }, select: { ...select, courseId: true } });
  const { courseId, ...row } = task;
  if (courseId) return { movedTo: await courseName(courseId), calendarError };
  return { row, calendarError };
}

export async function dismissInbox(id: string): Promise<InboxRow | null> {
  return dismissInboxItem(id);
}

export async function undismissInbox(item: InboxRow): Promise<void> {
  await restoreInboxItem(item);
}

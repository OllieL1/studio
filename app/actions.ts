"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { DEFAULT_ITEMS, isStudyLocation } from "@/lib/types";
import { normaliseWeights } from "@/lib/progress";
import { distributeMinutes } from "@/lib/split";
import { inclusiveEnd, resolveEventTimes, type EventInput } from "@/lib/events";
import { buildTaskPatch, type TaskEdit } from "@/lib/taskEdit";
import { upsertEvent, deleteEvent, isGoogleConfigured } from "@/lib/google";
import { getHistorySince, isSpotifyConfigured } from "@/lib/spotify";
import { buildListening } from "@/lib/music";
import { backupNow } from "@/lib/backup";
import {
  addTaskItem, removeTaskItem, renameTaskItem, setCourseRevisionMode, setTaskDone, toggleTaskItem,
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

export async function renameItem(itemId: string, label: string) {
  const ok = await renameTaskItem(db, itemId, label);
  refresh();
  return { ok };
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
  /** Push to Google Calendar once created. Ignored if the task has no date. */
  addToCalendar?: boolean;
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

  // The task is already saved at this point, so a Google failure is reported
  // back as a warning rather than losing what was typed.
  let calendarWarning: string | null = null;
  let onCalendar = false;
  if (input.addToCalendar) {
    if (!dueAt) {
      calendarWarning = "Task added, but not put on your calendar - it has no date.";
    } else {
      const res = await pushToCalendar(task.id);
      if (res.ok) onCalendar = true;
      else calendarWarning = `Task added, but Google Calendar refused: ${res.error}`;
    }
  }

  refresh();
  return { ok: true as const, id: task.id, onCalendar, calendarWarning };
}

/**
 * Edit any property of a task.
 *
 * The patch is built by lib/taskEdit.ts (pure, tested). If the task is already
 * on Google Calendar, the event is updated to match — a changed deadline
 * shouldn't leave a stale event behind. A Google failure never blocks the edit.
 */
export async function updateTask(id: string, data: TaskEdit) {
  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) return { ok: false as const, error: "Task not found." };

  const built = buildTaskPatch(existing, data);
  if (!built.ok) return built;

  await db.task.update({ where: { id }, data: built.patch });

  let calendarWarning: string | null = null;
  if (existing.calendarEventId && isGoogleConfigured()) {
    const res = await pushToCalendar(id);
    if (!res.ok) calendarWarning = `Saved, but Google Calendar wasn't updated: ${res.error}`;
  }

  refresh();
  return { ok: true as const, calendarWarning };
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
  credits?: number,
) {
  const w = normaliseWeights(lecture, lab, assessment);
  const c = credits != null && Number.isFinite(credits) ? Math.round(credits) : undefined;
  if (c !== undefined && (c < 1 || c > 200)) return { ok: false as const, error: "Credits must be between 1 and 200." };
  await db.course.update({
    where: { id: courseId },
    data: { lectureWeight: w.lecture, labWeight: w.lab, assessmentWeight: w.assessment, ...(c !== undefined ? { credits: c } : {}) },
  });
  refresh();
  return { ok: true as const };
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
  // A discarded session's music samples go with it.
  await db.listeningSample.deleteMany({});
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
  location: string | null;
  locationNote: string | null;
};

/** An unknown location is dropped rather than stored, and the free-text place
 *  only means anything for "other". */
function cleanLocation(location: string | null | undefined, note: string | null | undefined) {
  if (!isStudyLocation(location)) return { location: null, locationNote: null };
  return { location, locationNote: location === "other" ? note?.trim().slice(0, 60) || null : null };
}

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

  const session = await db.$transaction(async (tx) => {
    const created = await tx.session.create({
      data: {
        name,
        startedAt: timer.startedAt,
        endedAt,
        minutes,
        rawMinutes,
        focus,
        notes: input.notes?.trim() || null,
        ...cleanLocation(input.location, input.locationNote),
        courses: { create: slices },
        tasks: { create: input.taskIds.map((taskId) => ({ taskId })) },
      },
    });
    await tx.activeTimer.deleteMany({ where: { id: "singleton" } });
    return created;
  });

  // The session is safely saved. Music is extra: if Spotify is slow or down,
  // the session still stands — it's just logged without a soundtrack.
  let music: { tracks: number } | null = null;
  try {
    music = await attachListening(session.id, timer.startedAt, endedAt);
  } catch {
    music = null;
  }

  // Session saved - now refresh the local backup. Never fails the session.
  const backup = await backupNow().catch(() => null);
  refresh();
  return { ok: true as const, music, backup };
}

/**
 * Fold what played during a session into SessionTracks: now-playing samples
 * taken while the timer ran, plus Spotify's history for any stretch the app
 * wasn't open. Marks the session as music-tracked even when nothing played —
 * that's a genuine "studied in silence", which the stats need.
 */
async function attachListening(sessionId: string, start: Date, end: Date) {
  if (!isSpotifyConfigured()) return null;
  const auth = await db.spotifyAuth.findUnique({ where: { id: "singleton" }, select: { id: true } });
  if (!auth) return null;

  const [rawSamples, history] = await Promise.all([
    db.listeningSample.findMany({
      where: { sampledAt: { gte: new Date(start.getTime() - 60_000), lte: end } },
      orderBy: { sampledAt: "asc" },
    }),
    // Look back one long track before the start, so a song already playing
    // when the timer started is still found.
    getHistorySince(new Date(start.getTime() - 15 * 60_000)),
  ]);

  const plays = buildListening({
    start,
    end,
    samples: rawSamples.map((x) => ({
      spotifyId: x.spotifyId, kind: x.kind === "episode" ? "episode" : "track",
      title: x.title, artist: x.artist, artists: x.artists, album: x.album,
      imageUrl: x.imageUrl, url: x.url, durationMs: x.durationMs,
      at: x.sampledAt, progressMs: x.progressMs, isPlaying: x.isPlaying,
    })),
    history: history.map((h) => ({ ...h, kind: "track" as const })),
  });

  await db.$transaction([
    db.sessionTrack.createMany({
      data: plays.map((p) => ({
        sessionId,
        spotifyId: p.spotifyId,
        kind: p.kind,
        title: p.title,
        artist: p.artist,
        artists: p.artists,
        album: p.album,
        imageUrl: p.imageUrl,
        url: p.url,
        startedAt: p.startedAt,
        minutes: Math.round(p.minutes * 100) / 100,
      })),
    }),
    db.session.update({ where: { id: sessionId }, data: { musicTracked: true } }),
    // Samples are raw material — consumed now, and never left to pile up.
    db.listeningSample.deleteMany({ where: { sampledAt: { lte: end } } }),
  ]);

  return { tracks: plays.length };
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
  location?: string | null;
  locationNote?: string | null;
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
      ...cleanLocation(input.location, input.locationNote),
      courses: { create: reconcileSlices(input.courses, minutes) },
      tasks: { create: input.taskIds.map((taskId) => ({ taskId })) },
    },
  });
  const backup = await backupNow().catch(() => null);
  refresh();
  return { ok: true as const, backup };
}

/**
 * Edit a session after the fact: what it was called, where it was, how it
 * went, and how its time divides between subjects. Timing is deliberately not
 * editable - the clock is the one part of the log that should stay honest.
 */
export async function updateSession(input: {
  id: string;
  name: string;
  focus: number;
  notes: string | null;
  location: string | null;
  locationNote: string | null;
  courses: CourseSlice[];
}) {
  const session = await db.session.findUnique({ where: { id: input.id }, select: { minutes: true } });
  if (!session) return { ok: false as const, error: "Session not found." };

  const slices = reconcileSlices(input.courses, session.minutes);

  await db.$transaction(async (tx) => {
    await tx.sessionCourse.deleteMany({ where: { sessionId: input.id } });
    await tx.session.update({
      where: { id: input.id },
      data: {
        name: input.name.trim() || "Study session",
        focus: Math.max(0, Math.min(100, Math.round(input.focus))),
        notes: input.notes?.trim() || null,
        ...cleanLocation(input.location, input.locationNote),
        courses: { create: slices },
      },
    });
  });

  const backup = await backupNow().catch(() => null);
  refresh();
  return { ok: true as const, backup };
}


/* ── Google Calendar ────────────────────────────────────────────────────── */

/**
 * Push a task to Google Calendar, creating the event or updating the one we
 * created before. Tasks with a time get a one-hour slot ending at the
 * deadline; tasks with only a date become all-day events.
 */
export async function pushToCalendar(taskId: string) {
  if (!isGoogleConfigured()) {
    return { ok: false as const, error: "Google Calendar isn't set up yet - see Settings." };
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
        `Added from Studio.`,
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

/** Whether one-click calendar sync is available right now. */
export async function googleStatus() {
  if (!isGoogleConfigured()) return { configured: false, connected: false };
  const auth = await db.googleAuth.findUnique({ where: { id: "singleton" }, select: { id: true } });
  return { configured: true, connected: !!auth };
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

/* ── Uni events ─────────────────────────────────────────────────────────────
   Calendar entries that aren't work: supervisor meetings, talks, fairs.
   All-day events store an exclusive end (midnight after the last day), the
   same convention Google uses, so the two never disagree about span.        */


/** Push (or update) a uni event on Google. Returns a warning string on failure. */
async function syncEventToGoogle(eventId: string): Promise<string | null> {
  const ev = await db.event.findUnique({ where: { id: eventId }, include: { course: true } });
  if (!ev) return "Event not found.";

  const res = await upsertEvent(
    {
      summary: ev.course ? `${ev.course.shortName}: ${ev.title}` : ev.title,
      description: [ev.location ? `Where: ${ev.location}` : null, ev.notes, "Added from Studio."]
        .filter(Boolean)
        .join("\n\n"),
      start: ev.startAt,
      // upsertEvent treats an all-day end as inclusive and adds a day itself.
      end: ev.allDay ? inclusiveEnd(ev.endAt) : ev.endAt,
      allDay: ev.allDay,
    },
    ev.calendarEventId,
  );
  if (!res.ok) return res.error;

  await db.event.update({ where: { id: eventId }, data: { calendarEventId: res.eventId } });
  return null;
}

export async function createUniEvent(input: EventInput) {
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Give the event a title." };
  const times = resolveEventTimes(input);
  if (!times.ok) return { ok: false as const, error: times.error };

  const ev = await db.event.create({
    data: {
      title,
      startAt: times.startAt,
      endAt: times.endAt,
      allDay: input.allDay,
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      courseId: input.courseId || null,
    },
  });

  let warning: string | null = null;
  if (input.syncToGoogle) {
    const w = await syncEventToGoogle(ev.id);
    if (w) warning = `Saved, but not synced to Google: ${w}`;
  }

  refresh();
  return { ok: true as const, id: ev.id, warning };
}

/**
 * Edit a uni event. Turning sync off removes it from Google; editing a synced
 * event updates the Google copy rather than making a second one.
 */
export async function updateUniEvent(id: string, input: EventInput) {
  const existing = await db.event.findUnique({ where: { id } });
  if (!existing) return { ok: false as const, error: "Event not found." };

  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "Give the event a title." };
  const times = resolveEventTimes(input);
  if (!times.ok) return { ok: false as const, error: times.error };

  await db.event.update({
    where: { id },
    data: {
      title,
      startAt: times.startAt,
      endAt: times.endAt,
      allDay: input.allDay,
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      courseId: input.courseId || null,
    },
  });

  let warning: string | null = null;
  if (input.syncToGoogle) {
    const w = await syncEventToGoogle(id);
    if (w) warning = `Saved, but not synced to Google: ${w}`;
  } else if (existing.calendarEventId) {
    await deleteEvent(existing.calendarEventId);
    await db.event.update({ where: { id }, data: { calendarEventId: null } });
  }

  refresh();
  return { ok: true as const, warning };
}

/** Delete a uni event, and its Google copy if it has one. */
export async function deleteUniEvent(id: string) {
  const existing = await db.event.findUnique({ where: { id } });
  if (!existing) return { ok: true as const };
  if (existing.calendarEventId) await deleteEvent(existing.calendarEventId);
  await db.event.delete({ where: { id } });
  refresh();
  return { ok: true as const };
}


/* ── Spotify ────────────────────────────────────────────────────────────── */

export async function disconnectSpotify() {
  await db.spotifyAuth.deleteMany({ where: { id: "singleton" } });
  refresh();
}


/* ── Local backup ───────────────────────────────────────────────────────── */

/** Back up now, from Settings. Same rules as the automatic one. */
export async function runBackup() {
  const res = await backupNow();
  refresh();
  return res;
}

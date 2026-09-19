"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveEventTimes } from "@/lib/events";
import { upsertEvent, deleteEvent, isGoogleConfigured } from "@/lib/google";
import { lookupPaper, makeCiteKey, PAPER_STATUSES, type PaperMeta } from "@/lib/papers";
import { draftAgenda } from "@/lib/project";
import { isTaskDone } from "@/lib/progress";
import { shortAuthors } from "@/lib/papers";

function refresh() {
  revalidatePath("/", "layout");
}

async function projectCourse() {
  return db.course.findFirst({ where: { isProject: true } });
}

/* ── Project settings ───────────────────────────────────────────────────── */

export async function updateProjectSettings(data: { repoUrl?: string | null; hoursTarget?: number | null }) {
  const course = await projectCourse();
  if (!course) return { ok: false as const, error: "No project course found." };
  const patch: { repoUrl?: string | null; hoursTarget?: number | null } = {};
  if (data.repoUrl !== undefined) {
    const url = data.repoUrl?.trim() || null;
    if (url && !/^https?:\/\//i.test(url)) return { ok: false as const, error: "That doesn't look like a link - it should start with https://" };
    patch.repoUrl = url;
  }
  if (data.hoursTarget !== undefined) {
    const h = data.hoursTarget;
    if (h != null && (!Number.isFinite(h) || h <= 0 || h > 5000)) return { ok: false as const, error: "Hours target must be a positive number." };
    patch.hoursTarget = h;
  }
  await db.course.update({ where: { id: course.id }, data: patch });
  refresh();
  return { ok: true as const };
}

/* ── Meetings ───────────────────────────────────────────────────────────── */

export type MeetingInput = {
  title: string;
  date: string;      // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  location: string | null;
  syncToGoogle: boolean;
};

async function syncMeeting(id: string): Promise<string | null> {
  const m = await db.meeting.findUnique({ where: { id } });
  if (!m) return "Meeting not found.";
  const res = await upsertEvent(
    {
      summary: m.title,
      description: [m.location ? `Where: ${m.location}` : null, "Added from Studio."].filter(Boolean).join("\n\n"),
      start: m.startAt,
      end: m.endAt,
      allDay: false,
    },
    m.calendarEventId,
  );
  if (!res.ok) return res.error;
  await db.meeting.update({ where: { id }, data: { calendarEventId: res.eventId } });
  return null;
}

export async function createMeeting(input: MeetingInput) {
  const title = input.title.trim() || "Supervisor meeting";
  const t = resolveEventTimes({ date: input.date, startTime: input.startTime, endTime: input.endTime, allDay: false });
  if (!t.ok) return { ok: false as const, error: t.error };
  const course = await projectCourse();
  const m = await db.meeting.create({
    data: { title, startAt: t.startAt, endAt: t.endAt, location: input.location?.trim() || null, courseId: course?.id ?? null },
  });
  let warning: string | null = null;
  if (input.syncToGoogle && isGoogleConfigured()) {
    const w = await syncMeeting(m.id);
    if (w) warning = `Saved, but not synced to Google: ${w}`;
  }
  refresh();
  return { ok: true as const, id: m.id, warning };
}

export async function updateMeeting(id: string, input: MeetingInput) {
  const existing = await db.meeting.findUnique({ where: { id } });
  if (!existing) return { ok: false as const, error: "Meeting not found." };
  const t = resolveEventTimes({ date: input.date, startTime: input.startTime, endTime: input.endTime, allDay: false });
  if (!t.ok) return { ok: false as const, error: t.error };
  await db.meeting.update({
    where: { id },
    data: { title: input.title.trim() || "Supervisor meeting", startAt: t.startAt, endAt: t.endAt, location: input.location?.trim() || null },
  });
  let warning: string | null = null;
  if (input.syncToGoogle && isGoogleConfigured()) {
    const w = await syncMeeting(id);
    if (w) warning = `Saved, but not synced to Google: ${w}`;
  } else if (!input.syncToGoogle && existing.calendarEventId) {
    await deleteEvent(existing.calendarEventId);
    await db.meeting.update({ where: { id }, data: { calendarEventId: null } });
  }
  refresh();
  return { ok: true as const, warning };
}

export async function deleteMeeting(id: string) {
  const m = await db.meeting.findUnique({ where: { id } });
  if (!m) return { ok: true as const };
  if (m.calendarEventId) await deleteEvent(m.calendarEventId);
  // Action items created from it are kept - they're real work - just unlinked.
  await db.meeting.delete({ where: { id } });
  refresh();
  return { ok: true as const };
}

export async function saveMeetingText(id: string, field: "agenda" | "notes", markdown: string) {
  await db.meeting.update({ where: { id }, data: { [field]: markdown.trim() ? markdown : null } });
  refresh();
  return { ok: true as const };
}

export async function setMeetingPrep(meetingId: string, taskId: string, on: boolean) {
  if (on) {
    await db.meetingPrep.upsert({
      where: { meetingId_taskId: { meetingId, taskId } },
      update: {},
      create: { meetingId, taskId },
    });
  } else {
    await db.meetingPrep.deleteMany({ where: { meetingId, taskId } });
  }
  refresh();
}

/**
 * Turn an action item into a real task on the project, linked back to the
 * meeting. Kind "OTHER", so actions show in lists and on the schedule
 * without shifting the project's progress bar.
 */
export async function addMeetingAction(meetingId: string, title: string, dueDate: string | null) {
  const clean = title.trim();
  if (!clean) return { ok: false as const, error: "Give the action a title." };
  const m = await db.meeting.findUnique({ where: { id: meetingId } });
  if (!m) return { ok: false as const, error: "Meeting not found." };
  let dueAt: Date | null = null;
  if (dueDate) {
    const [y, mo, d] = dueDate.split("-").map(Number);
    dueAt = new Date(y, mo - 1, d, 23, 59);
  }
  await db.task.create({
    data: { title: clean, kind: "OTHER", courseId: m.courseId, fromMeetingId: m.id, dueAt },
  });
  refresh();
  return { ok: true as const };
}

/** Build an agenda from what's happened since the previous meeting. */
export async function draftAgendaFor(meetingId: string): Promise<string> {
  const m = await db.meeting.findUnique({
    where: { id: meetingId },
    include: { prep: { include: { task: { include: { items: true } } } } },
  });
  if (!m) return "";
  const prev = await db.meeting.findFirst({
    where: { startAt: { lt: m.startAt } },
    orderBy: { startAt: "desc" },
  });
  const since = prev?.startAt ?? null;
  const from = since ?? new Date(0);

  const [sessions, done, readPapers, addedPapers, actions, upcoming] = await Promise.all([
    m.courseId
      ? db.sessionCourse.findMany({
          where: { courseId: m.courseId, session: { startedAt: { gte: from, lt: m.startAt } } },
          select: { minutes: true },
        })
      : Promise.resolve([] as { minutes: number }[]),
    db.task.findMany({
      where: { courseId: m.courseId ?? undefined, doneAt: { gte: from, lt: m.startAt } },
      select: { title: true },
      orderBy: { doneAt: "asc" },
    }),
    db.paper.findMany({ where: { readAt: { gte: from, lt: m.startAt } }, select: { title: true, authors: true } }),
    db.paper.count({ where: { createdAt: { gte: from, lt: m.startAt } } }),
    db.task.findMany({
      where: { fromMeetingId: { not: null }, fromMeeting: { startAt: { lt: m.startAt } } },
      include: { items: true, fromMeeting: true },
    }),
    db.task.findMany({
      where: { courseId: m.courseId ?? undefined, dueAt: { gte: m.startAt, lt: new Date(m.startAt.getTime() + 21 * 86_400_000) } },
      include: { items: true },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  const day = (d: Date) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;

  return draftAgenda({
    meetingTitle: m.title,
    since,
    minutesLogged: sessions.reduce((s, x) => s + x.minutes, 0),
    sessions: sessions.length,
    tasksDone: done,
    papersRead: readPapers.map((p) => ({ title: p.title, authors: shortAuthors(p.authors, 2) })),
    papersAdded: addedPapers,
    openActions: actions.filter((t) => !isTaskDone(t)).map((t) => ({ title: t.title, fromMeeting: t.fromMeeting ? day(t.fromMeeting.startAt) : null })),
    upcoming: upcoming.filter((t) => !isTaskDone(t)).map((t) => ({ title: t.title, due: t.dueAt! })),
    prepOutstanding: m.prep.filter((p) => !isTaskDone(p.task)).map((p) => ({ title: p.task.title })),
  });
}

/* ── Papers ─────────────────────────────────────────────────────────────── */

export async function lookupPaperDetails(input: string) {
  return lookupPaper(input);
}

export type PaperInput = Omit<PaperMeta, "authors"> & {
  authors: string[];
  status: string;
  tags: string | null;
  notes: string | null;
};

export async function createPaper(input: PaperInput) {
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "A paper needs a title." };
  if (input.doi) {
    const dup = await db.paper.findFirst({ where: { doi: input.doi } });
    if (dup) return { ok: false as const, error: `Already in your library: "${dup.title}".` };
  }
  if (input.arxivId) {
    const dup = await db.paper.findFirst({ where: { arxivId: input.arxivId } });
    if (dup) return { ok: false as const, error: `Already in your library: "${dup.title}".` };
  }
  const taken = new Set((await db.paper.findMany({ select: { citeKey: true } })).map((p) => p.citeKey));
  const citeKey = makeCiteKey({ authors: input.authors, year: input.year, title }, taken);
  const status = (PAPER_STATUSES as readonly string[]).includes(input.status) ? input.status : "to-read";
  const course = await projectCourse();
  const p = await db.paper.create({
    data: {
      title,
      authors: input.authors.map((a) => a.trim()).filter(Boolean).join("; "),
      year: input.year,
      venue: input.venue?.trim() || null,
      url: input.url?.trim() || null,
      doi: input.doi,
      arxivId: input.arxivId,
      kind: input.kind,
      status,
      tags: normaliseTags(input.tags),
      notes: input.notes?.trim() || null,
      citeKey,
      courseId: course?.id ?? null,
      readAt: status === "read" ? new Date() : null,
    },
  });
  refresh();
  return { ok: true as const, id: p.id, citeKey };
}

export async function updatePaper(
  id: string,
  data: { status?: string; tags?: string | null; notes?: string | null; title?: string; authors?: string; year?: number | null; venue?: string | null; url?: string | null },
) {
  const existing = await db.paper.findUnique({ where: { id } });
  if (!existing) return { ok: false as const, error: "Paper not found." };
  const patch: Record<string, unknown> = {};
  if (data.status !== undefined) {
    if (!(PAPER_STATUSES as readonly string[]).includes(data.status)) return { ok: false as const, error: "Unknown status." };
    patch.status = data.status;
    // First time it's marked read, remember when - feeds the meeting agenda.
    if (data.status === "read" && !existing.readAt) patch.readAt = new Date();
    if (data.status !== "read") patch.readAt = null;
  }
  if (data.tags !== undefined) patch.tags = normaliseTags(data.tags);
  if (data.notes !== undefined) patch.notes = data.notes?.trim() ? data.notes : null;
  if (data.title !== undefined) {
    if (!data.title.trim()) return { ok: false as const, error: "A paper needs a title." };
    patch.title = data.title.trim();
  }
  if (data.authors !== undefined) patch.authors = data.authors;
  if (data.year !== undefined) patch.year = data.year;
  if (data.venue !== undefined) patch.venue = data.venue?.trim() || null;
  if (data.url !== undefined) patch.url = data.url?.trim() || null;
  await db.paper.update({ where: { id }, data: patch });
  refresh();
  return { ok: true as const };
}

export async function deletePaper(id: string) {
  await db.paper.delete({ where: { id } }).catch(() => {});
  refresh();
}

function normaliseTags(tags: string | null | undefined): string | null {
  if (!tags) return null;
  const list = [...new Set(tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
  return list.length ? list.join(", ") : null;
}

import { db } from "./db";
import { addDays, startOfDay, startOfWeek as startOfWeekOf, toISODate, atMinutes } from "./dates";
import { visibleCourseWhere } from "./types";
import { dietOrder, isBlocked, type CalendarItem } from "./calendar";
import { isTaskDone, readinessFor } from "./progress";
import { isGoogleConfigured, listEventsInRange } from "./google";

const CLASS_KINDS = ["LECTURE", "LAB", "SEMINAR"];

export type ActiveNow = {
  id: string;
  kind: "class" | "meeting" | "event";
  /** Whether it's on right now, or the soonest thing still to come. */
  status: "active" | "upcoming";
  title: string;
  subtitle: string | null;
  href: string;
  /** Active: when it ends. Upcoming: when it starts. */
  at: string;
  colour: string | null;
};

/** How far ahead "upcoming" is willing to look - far enough to bridge a
 *  weekend, not so far that "next" stops meaning anything. */
const UPCOMING_HORIZON_DAYS = 14;

/**
 * What's on right now, or - if nothing is - the soonest thing that will be:
 * a class, a project meeting, or a uni event. For the header's live badge.
 * Google's own calendar is left out: those items have nowhere in the app to
 * open to, and this is about what *you* scheduled, not everything on the feed.
 *
 * Where more than one is active, whichever ends soonest wins; where more
 * than one is upcoming, whichever starts soonest does.
 */
export async function getActiveNow(now: Date = new Date()): Promise<ActiveNow | null> {
  const day = startOfDay(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const courseWhere = visibleCourseWhere();

  const [classes, meetings, events] = await Promise.all([
    db.task.findMany({
      where: {
        cancelled: false,
        kind: { in: CLASS_KINDS },
        dueAt: { gte: day, lt: addDays(day, 1) },
        startMin: { lte: nowMin },
        endMin: { gt: nowMin },
        OR: [{ courseId: null }, { course: { is: courseWhere } }],
      },
      include: { course: true },
    }),
    db.meeting.findMany({
      where: { startAt: { lte: now }, endAt: { gt: now } },
      include: { course: true },
    }),
    db.event.findMany({
      where: { allDay: false, startAt: { lte: now }, endAt: { gt: now } },
      include: { course: true },
    }),
  ]);

  const dayIso = toISODate(day);
  const active: ActiveNow[] = [
    ...classes.map((t): ActiveNow => ({
      id: t.id,
      kind: "class",
      status: "active",
      title: t.title,
      subtitle: t.course?.shortName ?? null,
      href: t.kind === "LAB" ? `/tasks/${t.id}` : `/lectures/${t.id}`,
      at: atMinutes(dayIso, t.endMin!).toISOString(),
      colour: t.course?.colour ?? null,
    })),
    ...meetings.map((m): ActiveNow => ({
      id: m.id,
      kind: "meeting",
      status: "active",
      title: m.title,
      subtitle: m.course?.shortName ?? null,
      href: `/project/meetings/${m.id}`,
      at: m.endAt.toISOString(),
      colour: m.course?.colour ?? null,
    })),
    ...events.map((e): ActiveNow => ({
      id: e.id,
      kind: "event",
      status: "active",
      title: e.title,
      subtitle: e.location ?? e.course?.shortName ?? null,
      href: `/calendar?date=${toISODate(e.startAt)}&view=week`,
      at: e.endAt.toISOString(),
      colour: e.course?.colour ?? null,
    })),
  ];
  if (active.length) return active.sort((a, b) => a.at.localeCompare(b.at))[0];

  // Nothing on right now - the soonest thing coming up instead, so the
  // badge is worth a glance between classes too, not just during one.
  const horizon = addDays(day, UPCOMING_HORIZON_DAYS);
  const [nextClass, nextMeeting, nextEvent] = await Promise.all([
    db.task.findFirst({
      where: {
        cancelled: false,
        kind: { in: CLASS_KINDS },
        dueAt: { gt: now, lt: horizon },
        OR: [{ courseId: null }, { course: { is: courseWhere } }],
      },
      include: { course: true },
      orderBy: { dueAt: "asc" },
    }),
    db.meeting.findFirst({
      where: { startAt: { gt: now, lt: horizon } },
      include: { course: true },
      orderBy: { startAt: "asc" },
    }),
    db.event.findFirst({
      where: { allDay: false, startAt: { gt: now, lt: horizon } },
      include: { course: true },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const upcoming: ActiveNow[] = [
    ...(nextClass ? [{
      id: nextClass.id,
      kind: "class" as const,
      status: "upcoming" as const,
      title: nextClass.title,
      subtitle: nextClass.course?.shortName ?? null,
      href: nextClass.kind === "LAB" ? `/tasks/${nextClass.id}` : `/lectures/${nextClass.id}`,
      at: nextClass.dueAt!.toISOString(),
      colour: nextClass.course?.colour ?? null,
    }] : []),
    ...(nextMeeting ? [{
      id: nextMeeting.id,
      kind: "meeting" as const,
      status: "upcoming" as const,
      title: nextMeeting.title,
      subtitle: nextMeeting.course?.shortName ?? null,
      href: `/project/meetings/${nextMeeting.id}`,
      at: nextMeeting.startAt.toISOString(),
      colour: nextMeeting.course?.colour ?? null,
    }] : []),
    ...(nextEvent ? [{
      id: nextEvent.id,
      kind: "event" as const,
      status: "upcoming" as const,
      title: nextEvent.title,
      subtitle: nextEvent.location ?? nextEvent.course?.shortName ?? null,
      href: `/calendar?date=${toISODate(nextEvent.startAt)}&view=week`,
      at: nextEvent.startAt.toISOString(),
      colour: nextEvent.course?.colour ?? null,
    }] : []),
  ];

  if (!upcoming.length) return null;
  return upcoming.sort((a, b) => a.at.localeCompare(b.at))[0];
}

/**
 * Everything on the calendar between `start` and `end`.
 *
 * Google events that this app created (a pushed task, or a synced uni event)
 * are dropped from the Google feed — the local copy is richer and editable,
 * and showing both would put every synced item on the calendar twice.
 */
export async function getCalendarItems(start: Date, end: Date, { withPlan = true }: { withPlan?: boolean } = {}) {
  const courseWhere = visibleCourseWhere();

  const [tasks, events, syncedTaskIds, syncedEventIds, auth, planBlocks] = await Promise.all([
    db.task.findMany({
      where: {
        cancelled: false,
        dueAt: { gte: start, lt: end },
        OR: [{ courseId: null }, { course: { is: courseWhere } }],
      },
      include: { course: true, items: { select: { doneAt: true } } },
    }),
    db.event.findMany({
      where: { startAt: { lt: end }, endAt: { gt: start } },
      include: { course: true },
    }),
    db.task.findMany({ where: { calendarEventId: { not: null } }, select: { calendarEventId: true } }),
    db.event.findMany({ where: { calendarEventId: { not: null } }, select: { calendarEventId: true } }),
    isGoogleConfigured()
      ? db.googleAuth.findUnique({ where: { id: "singleton" }, select: { id: true } })
      : Promise.resolve(null),
    // Every synced block, removed or not: its Google copy is never shown as
    // a Google event, only (while it's still planned) as the block itself.
    db.planBlock.findMany({
      where: { OR: [{ calendarEventId: { not: null } }, { deletedAt: null, startAt: { lt: end }, endAt: { gt: start } }] },
      include: { course: true },
    }),
  ]);

  const items: CalendarItem[] = [];

  for (const t of tasks) {
    const dueAt = t.dueAt!;
    const base = {
      id: `task-${t.id}`,
      title: t.title,
      colour: t.course?.colour ?? null,
      courseShort: t.course?.shortName ?? null,
      courseId: t.courseId,
      done: isTaskDone(t),
      kind: t.kind,
      gradeWeight: t.gradeWeight,
      location: null,
      editable: false,
      onGoogle: !!t.calendarEventId,
      notes: t.notes,
    };

    if (CLASS_KINDS.includes(t.kind)) {
      const minutes = t.startMin != null && t.endMin != null ? t.endMin - t.startMin : 60;
      items.push({
        ...base,
        source: "class",
        start: dueAt.toISOString(),
        end: new Date(dueAt.getTime() + minutes * 60000).toISOString(),
        allDay: false,
        blocked: false,
        href: t.kind === "LAB" ? `/tasks/${t.id}` : `/lectures/${t.id}`,
      });
    } else {
      // A deadline is a moment, not a span — it sits in the all-day row with
      // its time shown, rather than as a sliver in the hour grid. `start`
      // keeps the real time so the label can show it.
      items.push({
        ...base,
        source: "deadline",
        start: dueAt.toISOString(),
        end: addDays(startOfDay(dueAt), 1).toISOString(),
        allDay: true,
        blocked: isBlocked(t.kind, t.gradeWeight),
        href: `/tasks/${t.id}`,
      });
    }
  }

  for (const e of events) {
    items.push({
      id: `event-${e.id}`,
      source: "event",
      title: e.title,
      start: e.startAt.toISOString(),
      end: e.endAt.toISOString(),
      allDay: e.allDay,
      colour: e.course?.colour ?? null,
      courseShort: e.course?.shortName ?? null,
      courseId: e.courseId,
      href: null,
      blocked: false,
      done: false,
      kind: null,
      gradeWeight: null,
      location: e.location,
      editable: true,
      onGoogle: !!e.calendarEventId,
      notes: e.notes,
    });
  }

  // Project meetings.
  const meetings = await db.meeting.findMany({
    where: { startAt: { lt: end }, endAt: { gt: start } },
    include: { course: true, prep: { include: { task: { include: { items: { select: { doneAt: true } } } } } } },
  });
  for (const m of meetings) {
    const prepDone = m.prep.filter((p) => isTaskDone(p.task)).length;
    items.push({
      id: `meeting-${m.id}`,
      source: "meeting",
      title: m.title,
      start: m.startAt.toISOString(),
      end: m.endAt.toISOString(),
      allDay: false,
      colour: m.course?.colour ?? null,
      courseShort: m.course?.shortName ?? null,
      courseId: m.courseId,
      href: `/project/meetings/${m.id}`,
      blocked: false,
      done: m.endAt < new Date(),
      kind: null,
      gradeWeight: null,
      location: m.location,
      editable: false,
      onGoogle: !!m.calendarEventId,
      notes: m.prep.length ? `Prep ${prepDone}/${m.prep.length} done` : null,
    });
  }
  const meetingGoogleIds = meetings.map((m) => m.calendarEventId).filter(Boolean) as string[];

  // The weekly schedule's planned blocks.
  if (withPlan) {
    for (const b of planBlocks) {
      if (b.deletedAt || b.startAt >= end || b.endAt <= start) continue;
      items.push({
        id: `plan-${b.id}`,
        source: "plan",
        title: b.title,
        start: b.startAt.toISOString(),
        end: b.endAt.toISOString(),
        allDay: false,
        colour: b.course?.colour ?? null,
        courseShort: b.course?.shortName ?? null,
        courseId: b.courseId,
        href: `/plan?from=${toISODate(startOfWeekOf(b.startAt))}&days=7`,
        blocked: false,
        done: false,
        kind: null,
        gradeWeight: null,
        location: null,
        editable: false,
        onGoogle: !!b.calendarEventId,
        notes: null,
      });
    }
  }
  const planGoogleIds = planBlocks.map((b) => b.calendarEventId).filter(Boolean) as string[];

  let googleError: string | null = null;
  const googleConnected = !!auth;

  if (googleConnected) {
    const ours = new Set(
      [...[...syncedTaskIds, ...syncedEventIds].map((x) => x.calendarEventId).filter(Boolean) as string[], ...meetingGoogleIds, ...planGoogleIds],
    );
    const { events: google, error } = await listEventsInRange(start, end);
    googleError = error;

    for (const g of google) {
      if (ours.has(g.id)) continue;
      items.push({
        id: `google-${g.calendarId}-${g.id}`,
        source: "google",
        title: g.summary,
        start: g.start.toISOString(),
        end: g.end.toISOString(),
        allDay: g.allDay,
        colour: null,
        courseShort: null,
        courseId: null,
        href: g.htmlLink,
        blocked: false,
        done: false,
        kind: null,
        gradeWeight: null,
        location: g.location,
        editable: false,
        onGoogle: true,
        notes: g.calendarName,
      });
    }
  }

  return { items, googleConnected, googleError };
}

/** The side panel: what's coming, with the heavy hitters flagged. */
export async function getCalendarSidebar(now: Date = new Date(), weeks = 6) {
  const from = startOfDay(now);
  const to = addDays(from, weeks * 7);
  const courseWhere = visibleCourseWhere();

  const [deadlines, exams, deps] = await Promise.all([
    db.task.findMany({
      where: {
        cancelled: false,
        kind: { in: ["COURSEWORK", "QUIZ", "OTHER"] },
        dueAt: { gte: from, lt: to },
        OR: [{ courseId: null }, { course: { is: courseWhere } }],
      },
      include: { course: true, items: { select: { doneAt: true } } },
      orderBy: { dueAt: "asc" },
    }),
    db.task.findMany({
      where: {
        cancelled: false,
        kind: "EXAM",
        OR: [{ courseId: null }, { course: { is: courseWhere } }],
      },
      include: {
        course: { include: { tasks: { where: { cancelled: false }, include: { items: { select: { doneAt: true } } } } } },
        items: { select: { doneAt: true } },
      },
    }),
    db.taskDependency.findMany({
      where: { dependent: { kind: "EXAM" } },
      include: { prerequisite: { include: { items: { select: { doneAt: true } } } } },
    }),
  ]);

  const open = deadlines.filter((t) => !isTaskDone(t));

  const prereqs = new Map<string, typeof deps[number]["prerequisite"][]>();
  for (const d of deps) {
    prereqs.set(d.dependentId, [...(prereqs.get(d.dependentId) ?? []), d.prerequisite]);
  }

  return {
    upcoming: open.map((t) => ({
      id: t.id,
      title: t.title,
      dueAt: t.dueAt!.toISOString(),
      kind: t.kind,
      gradeWeight: t.gradeWeight,
      blocked: isBlocked(t.kind, t.gradeWeight),
      colour: t.course?.colour ?? null,
      courseShort: t.course?.shortName ?? null,
      subtasksDone: t.items.filter((i) => i.doneAt).length,
      subtasksTotal: t.items.length,
    })),
    exams: exams
      .filter((e) => !isTaskDone(e))
      .map((e) => {
        const r = readinessFor(e, e.course, prereqs.get(e.id) ?? [], e.course?.tasks ?? []);
        return {
          id: e.id,
          title: e.title,
          dueAt: e.dueAt?.toISOString() ?? null,
          examDiet: e.examDiet,
          colour: e.course?.colour ?? null,
          courseName: e.course?.name ?? null,
          courseShort: e.course?.shortName ?? null,
          ready: r.ready,
          total: r.total,
          basis: r.basis,
        };
      })
      .sort((a, b) => {
        // Dated exams first in date order; undated ones after, grouped by diet.
        if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return dietOrder(a.examDiet) - dietOrder(b.examDiet);
      }),
    windowWeeks: weeks,
  };
}


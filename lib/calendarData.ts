import { db } from "./db";
import { addDays, startOfDay } from "./dates";
import { visibleCourseWhere } from "./types";
import { dietOrder, isBlocked, type CalendarItem } from "./calendar";
import { isTaskDone, examReadiness } from "./progress";
import { isGoogleConfigured, listEventsInRange } from "./google";

const CLASS_KINDS = ["LECTURE", "LAB", "SEMINAR"];

/**
 * Everything on the calendar between `start` and `end`.
 *
 * Google events that this app created (a pushed task, or a synced uni event)
 * are dropped from the Google feed — the local copy is richer and editable,
 * and showing both would put every synced item on the calendar twice.
 */
export async function getCalendarItems(start: Date, end: Date) {
  const courseWhere = visibleCourseWhere();

  const [tasks, events, syncedTaskIds, syncedEventIds, auth] = await Promise.all([
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

  let googleError: string | null = null;
  const googleConnected = !!auth;

  if (googleConnected) {
    const ours = new Set(
      [...syncedTaskIds, ...syncedEventIds].map((x) => x.calendarEventId).filter(Boolean) as string[],
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
      include: { course: true, items: { select: { doneAt: true } } },
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
        const r = examReadiness(prereqs.get(e.id) ?? []);
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


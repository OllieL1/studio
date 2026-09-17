import { db } from "./db";
import { computeCourseProgress, examReadiness, overallProgress, type CourseProgress, type ExamReadiness } from "./progress";
import { endOfDay, startOfDay, startOfWeek, addDays } from "./dates";
import { visibleCourseWhere } from "./types";

const taskInclude = {
  items: { orderBy: { position: "asc" } },
} as const;

export type TaskWithItems = Awaited<ReturnType<typeof getTask>>;

export async function getTask(id: string) {
  return db.task.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      course: true,
      dependsOn: { include: { prerequisite: { include: { items: true } } } },
    },
  });
}

export type CourseWithProgress = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  colour: string;
  lectureWeight: number;
  labWeight: number;
  assessmentWeight: number;
  progress: CourseProgress;
  exams: { id: string; title: string; examDiet: string | null; dueAt: Date | null; readiness: ExamReadiness }[];
  nextDue: { id: string; title: string; dueAt: Date | null; kind: string } | null;
  minutes: number;
};

/** Every course with progress computed, plus exam readiness and total time.
 *  One query per concern rather than N+1 per course. */
export async function getCourses(): Promise<CourseWithProgress[]> {
  const courses = await db.course.findMany({
    where: visibleCourseWhere(),
    orderBy: { position: "asc" },
    include: { tasks: { include: taskInclude } },
  });

  // Exam prerequisites, resolved in one pass.
  const deps = await db.taskDependency.findMany({
    include: { prerequisite: { include: { items: true } } },
  });
  const prereqsByExam = new Map<string, typeof deps[number]["prerequisite"][]>();
  for (const d of deps) {
    const list = prereqsByExam.get(d.dependentId) ?? [];
    list.push(d.prerequisite);
    prereqsByExam.set(d.dependentId, list);
  }

  // Each row carries this subject's own slice of its session, so summing is
  // correct for evenly-split and unevenly-split sessions alike.
  const timeByCourse = await db.sessionCourse.groupBy({
    by: ["courseId"],
    _sum: { minutes: true },
  });
  const minutesByCourse = new Map(
    timeByCourse.map((t) => [t.courseId, t._sum.minutes ?? 0]),
  );

  const now = new Date();

  return courses.map((c) => {
    const progress = computeCourseProgress(c, c.tasks);

    const exams = c.tasks
      .filter((t) => t.kind === "EXAM")
      .map((t) => ({
        id: t.id,
        title: t.title,
        examDiet: t.examDiet,
        dueAt: t.dueAt,
        readiness: examReadiness(prereqsByExam.get(t.id) ?? []),
      }));

    const nextDue =
      c.tasks
        .filter((t) => !t.cancelled && t.dueAt && t.dueAt >= now && t.kind !== "EXAM")
        .filter((t) => !(t.items.length ? t.items.every((i) => i.doneAt) : t.doneAt))
        .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0] ?? null;

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      shortName: c.shortName,
      colour: c.colour,
      lectureWeight: c.lectureWeight,
      labWeight: c.labWeight,
      assessmentWeight: c.assessmentWeight,
      progress,
      exams,
      nextDue: nextDue
        ? { id: nextDue.id, title: nextDue.title, dueAt: nextDue.dueAt, kind: nextDue.kind }
        : null,
      minutes: minutesByCourse.get(c.id) ?? 0,
    };
  });
}

export function getOverall(courses: CourseWithProgress[]) {
  return overallProgress(courses);
}

/** Tasks scheduled for, or due on, a given day. */
export async function getDayTasks(day: Date) {
  return db.task.findMany({
    where: { cancelled: false, dueAt: { gte: startOfDay(day), lte: endOfDay(day) } },
    include: { items: { orderBy: { position: "asc" } }, course: true },
    orderBy: [{ startMin: "asc" }, { dueAt: "asc" }],
  });
}

/** Upcoming deadlines (non-class work), for the home page radar. */
export async function getUpcoming(days = 21, limit = 8) {
  const now = new Date();
  const tasks = await db.task.findMany({
    where: {
      cancelled: false,
      kind: { in: ["COURSEWORK", "QUIZ", "OTHER"] },
      dueAt: { gte: startOfDay(now), lte: endOfDay(addDays(now, days)) },
    },
    include: { items: true, course: true },
    orderBy: { dueAt: "asc" },
  });
  return tasks
    .filter((t) => !(t.items.length ? t.items.every((i) => i.doneAt) : t.doneAt))
    .slice(0, limit);
}

/** Anything past its deadline and not finished. */
export async function getOverdue(limit = 6) {
  const tasks = await db.task.findMany({
    where: { cancelled: false, kind: { not: "EXAM" }, dueAt: { lt: startOfDay(new Date()) } },
    include: { items: true, course: true },
    orderBy: { dueAt: "desc" },
    take: 60,
  });
  return tasks
    .filter((t) => !(t.items.length ? t.items.every((i) => i.doneAt) : t.doneAt))
    .slice(0, limit);
}

export async function getActiveTimer() {
  return db.activeTimer.findUnique({ where: { id: "singleton" } });
}

export async function getSessions(sinceDays?: number) {
  return db.session.findMany({
    where: sinceDays
      ? { startedAt: { gte: startOfDay(addDays(new Date(), -sinceDays)) } }
      : undefined,
    include: { courses: true, tasks: true },
    orderBy: { startedAt: "desc" },
  });
}

/** Headline numbers for the home page tiles. */
export async function getHeadlineStats() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);

  const [today, week, all] = await Promise.all([
    db.session.aggregate({ _sum: { minutes: true }, _count: true, where: { startedAt: { gte: todayStart } } }),
    db.session.aggregate({ _sum: { minutes: true }, _count: true, where: { startedAt: { gte: weekStart } } }),
    db.session.aggregate({ _sum: { minutes: true }, _avg: { focus: true }, _count: true }),
  ]);

  // Streak: consecutive days back from today with at least one session.
  const recent = await db.session.findMany({
    where: { startedAt: { gte: addDays(todayStart, -400) } },
    select: { startedAt: true },
  });
  const daysWithWork = new Set(recent.map((s) => startOfDay(s.startedAt).getTime()));
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = addDays(todayStart, -i).getTime();
    if (daysWithWork.has(d)) streak++;
    else if (i > 0 || !daysWithWork.has(todayStart.getTime())) break;
  }

  return {
    todayMinutes: today._sum.minutes ?? 0,
    todaySessions: today._count,
    weekMinutes: week._sum.minutes ?? 0,
    weekSessions: week._count,
    totalMinutes: all._sum.minutes ?? 0,
    totalSessions: all._count,
    avgFocus: all._avg.focus ?? 0,
    streak,
  };
}

/** Daily study minutes for the last `days` days, oldest first. Gaps filled
 *  with zero so the chart has a continuous axis. */
export async function getDailySeries(days = 30) {
  const from = startOfDay(addDays(new Date(), -(days - 1)));
  const sessions = await db.session.findMany({
    where: { startedAt: { gte: from } },
    select: { startedAt: true, minutes: true, focus: true },
  });
  const byDay = new Map<number, { minutes: number; focusWeighted: number }>();
  for (const s of sessions) {
    const k = startOfDay(s.startedAt).getTime();
    const cur = byDay.get(k) ?? { minutes: 0, focusWeighted: 0 };
    cur.minutes += s.minutes;
    cur.focusWeighted += s.focus * s.minutes;
    byDay.set(k, cur);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    const e = byDay.get(d.getTime());
    return {
      date: d,
      minutes: e?.minutes ?? 0,
      focus: e && e.minutes > 0 ? e.focusWeighted / e.minutes : null,
    };
  });
}

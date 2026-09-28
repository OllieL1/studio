import { db } from "./db";
import { addDays } from "./dates";
import { computeCourseProgress, isTaskDone } from "./progress";
import { projectPace, projectSessions, weekKey, PROJECT_DEADLINE, PROJECT_TIMELINE_START } from "./project";
import { byDayOfWeek, byHourOfDay, headline } from "./stats";

export type TimelineItem = {
  id: string;
  row: "meeting" | "deadline" | "task";
  title: string;
  /** ISO. For points, start === end. */
  start: string;
  end: string;
  done: boolean;
  href: string;
  weight: number | null;
};

/** Everything the /project workspace shows. */
export async function getProject() {
  const course = await db.course.findFirst({
    where: { isProject: true },
    include: { tasks: { where: { cancelled: false }, include: { items: true }, orderBy: [{ dueAt: "asc" }, { title: "asc" }] } },
  });
  if (!course) return null;

  const now = new Date();

  const [slices, meetings, papers, sessions] = await Promise.all([
    db.sessionCourse.findMany({
      where: { courseId: course.id },
      select: { minutes: true, session: { select: { startedAt: true } } },
    }),
    db.meeting.findMany({
      orderBy: { startAt: "asc" },
      include: {
        prep: { include: { task: { include: { items: true } } } },
        actions: { include: { items: true } },
      },
    }),
    db.paper.findMany({
      orderBy: { createdAt: "desc" },
      include: { tagLinks: { include: { tag: { select: { name: true } } } } },
    }),
    db.session.findMany({
      where: { courses: { some: { courseId: course.id } } },
      include: { courses: true, tasks: true },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  // ── Time stats: each session cut down to its project slice.
  const projectTime = projectSessions(sessions, course.id);
  const time = {
    headline: headline(projectTime),
    byHour: byHourOfDay(projectTime),
    byDay: byDayOfWeek(projectTime),
    recent: projectTime.slice(0, 8).map((s) => ({
      id: s.id, name: s.name, startedAt: s.startedAt, minutes: s.minutes, focus: s.focus,
      shared: (sessions.find((x) => x.id === s.id)?.courses.length ?? 1) > 1,
    })),
  };

  // ── Pace: project minutes per week from the timeline start to this week.
  const loggedMinutes = slices.reduce((s, x) => s + x.minutes, 0);
  const byWeek = new Map<number, number>();
  for (const s of slices) {
    const k = weekKey(s.session.startedAt);
    byWeek.set(k, (byWeek.get(k) ?? 0) + s.minutes);
  }
  // From the timeline start, or the first logged session if that's earlier.
  const firstSession = slices.reduce<Date | null>((min, s) => (!min || s.session.startedAt < min ? s.session.startedAt : min), null);
  const seriesStart = new Date(Math.min(weekKey(PROJECT_TIMELINE_START), firstSession ? weekKey(firstSession) : Infinity));
  const weeklyMinutes: number[] = [];
  for (let d = seriesStart; d.getTime() <= weekKey(now); d = addDays(d, 7)) {
    weeklyMinutes.push(byWeek.get(d.getTime()) ?? 0);
  }
  const pace = projectPace({ loggedMinutes, targetHours: course.hoursTarget ?? 400, weeklyMinutes, now });

  // ── Timeline items.
  const items: TimelineItem[] = [];
  for (const m of meetings) {
    items.push({
      id: `m-${m.id}`, row: "meeting", title: m.title,
      start: m.startAt.toISOString(), end: m.startAt.toISOString(),
      done: m.startAt < now, href: `/project/meetings/${m.id}`, weight: null,
    });
  }
  for (const t of course.tasks) {
    if (!t.dueAt && !t.startsAt) continue;
    const isDeadline = ["COURSEWORK", "EXAM", "QUIZ"].includes(t.kind) && !t.startsAt;
    const end = (t.dueAt ?? t.startsAt)!;
    items.push({
      id: `t-${t.id}`,
      row: isDeadline ? "deadline" : "task",
      title: t.title,
      start: (t.startsAt ?? end).toISOString(),
      end: end.toISOString(),
      done: isTaskDone(t),
      href: `/tasks/${t.id}`,
      weight: t.gradeWeight,
    });
  }

  const upcomingMeetings = meetings.filter((m) => m.endAt >= now);
  const pastMeetings = meetings.filter((m) => m.endAt < now).reverse();

  return {
    course: {
      id: course.id,
      name: course.name,
      code: course.code,
      colour: course.colour,
      repoUrl: course.repoUrl,
      moodleUrl: course.moodleUrl,
      hoursTarget: course.hoursTarget ?? 400,
      credits: course.credits,
      lectureWeight: course.lectureWeight,
      labWeight: course.labWeight,
      assessmentWeight: course.assessmentWeight,
    },
    time,
    progress: computeCourseProgress(course, course.tasks),
    tasks: course.tasks,
    pace,
    weeklyMinutes,
    weeklyStart: seriesStart,
    meetings: { upcoming: upcomingMeetings, past: pastMeetings, all: meetings },
    papers,
    timeline: { items, from: PROJECT_TIMELINE_START, to: PROJECT_DEADLINE },
  };
}

export type ProjectData = NonNullable<Awaited<ReturnType<typeof getProject>>>;

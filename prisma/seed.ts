/**
 * Population script for semester 1, 26/27 — transcribed from claude/SUBJECTS.md.
 *
 * Idempotent: courses are upserted by code, and a task is only created if one
 * with the same title doesn't already exist on that course. Re-running never
 * destroys completion state, sessions, or tasks you added yourself.
 *
 *   npm run seed
 *
 * Nothing here is hardcoded in the app — edit this file (or the UI) and re-run.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ITEMS, TERM_START, TERM_WEEKS } from "../lib/types";
import { addWeeks, atMinutes, isoDayOfWeek, parseLocalDate, toISODate } from "../lib/dates";

const db = new PrismaClient();

const H = (hours: number, mins = 0) => hours * 60 + mins;
const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

type SlotSpec = { kind: string; day: number; start: number; end: number };
type TaskSpec = {
  title: string;
  kind: string;
  due?: string;          // YYYY-MM-DD
  dueMin?: number;       // minutes from midnight; defaults to 23:59
  weight?: number;       // % of final course mark
  examDiet?: string;
  items?: string[];
  notes?: string;
};
type WeeklySpec = { title: string; kind: string; count: number; totalWeight?: number; dueDay: number; dueMin: number };

type CourseSpec = {
  code: string;
  name: string;
  shortName: string;
  colour: string;
  /** 1 = semester 1, 2 = semester 2, 3 = all year. See lib/types.ts. */
  semester: number;
  /** The dissertation project - gets the /project workspace and a pace tracker. */
  isProject?: boolean;
  hoursTarget?: number;
  /** Credits (default 10). Overall progress is weighted by these. */
  credits?: number;
  lectureWeight: number;
  labWeight: number;
  assessmentWeight: number;
  slots: SlotSpec[];
  tasks: TaskSpec[];
  weekly?: WeeklySpec[];
};

/* ── The courses ──────────────────────────────────────────────────────── */

const COURSES: CourseSpec[] = [
  {
    code: "COMPSCI5113",
    name: "Coaching Software Teams",
    shortName: "Coaching",
    colour: "#8A4430",
    semester: 3, // runs across both semesters
    lectureWeight: 35, labWeight: 0, assessmentWeight: 65,
    slots: [
      { kind: "LECTURE", day: TUE, start: H(10), end: H(12) },
      { kind: "LECTURE", day: TUE, start: H(16), end: H(17) },
    ],
    weekly: [
      // "Quiz (weekly) | x10 | 18%" → 1.8% each.
      { title: "Weekly Quiz", kind: "QUIZ", count: 10, totalWeight: 18, dueDay: FRI, dueMin: H(23, 59) },
    ],
    tasks: [
      // Mini Coaching Exercise Reports | 20% across 4 submissions.
      { title: "Mini Coaching Exercise Report 1", kind: "COURSEWORK", due: "2026-10-09", weight: 5 },
      { title: "Mini Coaching Exercise Report 2", kind: "COURSEWORK", due: "2026-10-23", weight: 5 },
      { title: "Mini Coaching Exercise Report 3", kind: "COURSEWORK", due: "2026-11-06", weight: 5 },
      { title: "Mini Coaching Exercise Report 4", kind: "COURSEWORK", due: "2026-11-27", weight: 5 },
      // Coaching Review | 4% across 5 submissions (last three fall in 2027).
      { title: "Coaching Review 1", kind: "COURSEWORK", due: "2026-10-21", weight: 0.8 },
      { title: "Coaching Review 2", kind: "COURSEWORK", due: "2026-11-11", weight: 0.8 },
      { title: "Coaching Review 3", kind: "COURSEWORK", due: "2026-12-09", weight: 0.8 },
      { title: "Coaching Review 4", kind: "COURSEWORK", due: "2027-01-27", weight: 0.8 },
      { title: "Coaching Review 5", kind: "COURSEWORK", due: "2027-03-03", weight: 0.8 },
      { title: "Coaching Plan", kind: "COURSEWORK", due: "2026-11-23", weight: 12 },
      { title: "Final Coaching Exercise Report", kind: "COURSEWORK", due: "2027-03-08", weight: 28 },
      { title: "Workshop", kind: "COURSEWORK", due: "2027-03-08", weight: 20 },
    ],
  },
  {
    code: "COMPSCI4038",
    name: "Professional Software Issues", // PSI
    shortName: "PSI",
    colour: "#B28944",
    semester: 1,
    lectureWeight: 35, labWeight: 0, assessmentWeight: 65,
    slots: [
      { kind: "LECTURE", day: TUE, start: H(14), end: H(15) },
      { kind: "SEMINAR", day: TUE, start: H(15), end: H(16) },
    ],
    tasks: [
      // No published weights — left null so they're equal-weighted until set.
      { title: "Draft Essay (Peer Review)", kind: "COURSEWORK", due: "2026-11-02", dueMin: H(16, 30) },
      { title: "Final Essay", kind: "COURSEWORK", due: "2026-11-20", dueMin: H(16, 30) },
      { title: "Exam", kind: "EXAM", examDiet: "December 2026", notes: "Date TBC" },
    ],
  },
  {
    code: "COMPSCI5025",
    name: "Research Methods & Techniques", // RMT
    shortName: "RMT",
    colour: "#3D6924",
    semester: 1,
    lectureWeight: 35, labWeight: 0, assessmentWeight: 65,
    slots: [{ kind: "LECTURE", day: TUE, start: H(13), end: H(14) }],
    tasks: [
      { title: "Coursework", kind: "COURSEWORK", due: "2026-11-24", weight: 40 },
      { title: "Exam", kind: "EXAM", weight: 60, examDiet: "April/May 2027" },
    ],
  },
  {
    code: "COMPSCI5101",
    name: "Placement Year Review",
    shortName: "Placement",
    colour: "#0C9F8B",
    semester: 1,
    // No timetabled teaching — the whole course is its three submissions.
    lectureWeight: 0, labWeight: 0, assessmentWeight: 100,
    slots: [],
    tasks: [
      { title: "Presentation - Upload", kind: "COURSEWORK", due: "2026-09-24" },
      { title: "Presentation - Present", kind: "COURSEWORK", due: "2026-09-25" },
      // 07/08 and 19/08 in SUBJECTS.md were typos for October (see AIM.md).
      { title: "Report / Essay", kind: "COURSEWORK", due: "2026-10-07" },
      { title: "Poster (Project Proposal)", kind: "COURSEWORK", due: "2026-10-19" },
    ],
  },
  {
    code: "COMPSCI4021",
    name: "Functional Programming",
    shortName: "FP",
    colour: "#2D6FA0",
    semester: 1,
    // The only course with labs, so it gets a real lab share.
    lectureWeight: 30, labWeight: 20, assessmentWeight: 50,
    slots: [
      { kind: "LECTURE", day: MON, start: H(14), end: H(15) },
      { kind: "LECTURE", day: THU, start: H(12), end: H(13) },
      { kind: "LAB", day: FRI, start: H(11), end: H(12) },
    ],
    weekly: [
      { title: "Weekly Quiz", kind: "QUIZ", count: 10, totalWeight: 5, dueDay: FRI, dueMin: H(23, 59) },
    ],
    tasks: [
      { title: "In-Person Class Test", kind: "COURSEWORK", due: "2026-10-16", weight: 15 },
      { title: "Programming Exercise", kind: "COURSEWORK", due: "2026-11-27", weight: 20 },
      { title: "Exam", kind: "EXAM", weight: 60, examDiet: "April/May 2027" },
    ],
  },
  {
    code: "COMPSCI5006",
    name: "Constraint Programming",
    shortName: "CP",
    colour: "#A284C6",
    semester: 1,
    lectureWeight: 35, labWeight: 0, assessmentWeight: 65,
    slots: [
      { kind: "LECTURE", day: WED, start: H(9), end: H(11) },
      { kind: "LECTURE", day: WED, start: H(13), end: H(14) },
    ],
    tasks: [
      // No published weights — equal-weighted until set.
      { title: "Assessment #1 - In-Person Class Test", kind: "COURSEWORK", due: "2026-10-28" },
      { title: "Poster Topic Choice", kind: "COURSEWORK", due: "2026-10-30" },
      { title: "Assessment #2 - In-Person Class Test", kind: "COURSEWORK", due: "2026-11-11" },
      { title: "Poster Submission", kind: "COURSEWORK", due: "2026-11-20" },
      { title: "Poster Presentation", kind: "COURSEWORK", due: "2026-11-25" },
    ],
  },
  {
    code: "COMPSCI5082",
    name: "Project",
    shortName: "Project",
    colour: "#A35760",
    isProject: true,
    hoursTarget: 400, // 40 credits at ~10 notional hours each
    credits: 40,
    semester: 3, // spans the whole year
    lectureWeight: 0, labWeight: 0, assessmentWeight: 100,
    slots: [],
    tasks: [
      // Break this down into subtasks in the app as the work takes shape.
      // The final submission works like an exam: it lands at the very end, so
      // it's kept out of the progress bar and tracked by readiness instead.
      { title: "Final Project", kind: "EXAM", due: "2027-03-26" },
    ],
  },

  /* ── Semester 2 ─────────────────────────────────────────────────────────
     Shells only — codes, timetables and deadlines to be filled in when
     published. Hidden from the UI until 1 Jan 2027 (SEMESTER_2_VISIBLE_FROM),
     so they don't clutter semester 1. Colours continue the validated palette
     in course order; see scripts/palette/.                                  */
  {
    code: "S2-ASP",
    name: "Advanced Systems Programming",
    shortName: "ASP",
    colour: "#A68E30",
    semester: 2,
    lectureWeight: 35, labWeight: 0, assessmentWeight: 65,
    slots: [],
    tasks: [],
  },
  {
    code: "S2-ANS",
    name: "Advanced Networked Systems",
    shortName: "ANS",
    colour: "#93474F",
    semester: 2,
    lectureWeight: 35, labWeight: 0, assessmentWeight: 65,
    slots: [],
    tasks: [],
  },
  {
    code: "S2-SPRE",
    name: "SPRE",
    shortName: "SPRE",
    colour: "#4F63A0",
    semester: 2,
    lectureWeight: 35, labWeight: 0, assessmentWeight: 65,
    slots: [],
    tasks: [],
  },
];

/* ── Seeding ──────────────────────────────────────────────────────────── */

async function main() {
  const termStart = parseLocalDate(TERM_START);
  let createdTasks = 0;
  let createdCourses = 0;

  for (const [index, spec] of COURSES.entries()) {
    const existing = await db.course.findUnique({ where: { code: spec.code } });
    const course = await db.course.upsert({
      where: { code: spec.code },
      update: {
        name: spec.name,
        shortName: spec.shortName,
        colour: spec.colour,
        position: index,
        semester: spec.semester,
        ...(spec.isProject ? { isProject: true } : {}),
        ...(spec.hoursTarget ? { hoursTarget: spec.hoursTarget } : {}),
      },
      create: {
        code: spec.code,
        name: spec.name,
        shortName: spec.shortName,
        colour: spec.colour,
        position: index,
        semester: spec.semester,
        isProject: spec.isProject ?? false,
        hoursTarget: spec.hoursTarget ?? null,
        credits: spec.credits ?? 10,
        lectureWeight: spec.lectureWeight,
        labWeight: spec.labWeight,
        assessmentWeight: spec.assessmentWeight,
      },
    });
    if (!existing) createdCourses++;

    // Timetable slots — replaced wholesale, they carry no user state.
    await db.scheduleSlot.deleteMany({ where: { courseId: course.id } });
    for (const s of spec.slots) {
      await db.scheduleSlot.create({
        data: {
          courseId: course.id,
          kind: s.kind,
          dayOfWeek: s.day,
          startMin: s.start,
          endMin: s.end,
        },
      });
    }

    const have = new Set(
      (
        await db.task.findMany({
          where: { courseId: course.id },
          select: { title: true },
        })
      ).map((t) => t.title),
    );

    const add = async (t: TaskSpec & { startMin?: number; endMin?: number; weekStart?: Date }) => {
      if (have.has(t.title)) return;
      have.add(t.title);
      const dueAt = t.due ? atMinutes(t.due, t.dueMin ?? H(23, 59)) : null;
      await db.task.create({
        data: {
          courseId: course.id,
          title: t.title,
          kind: t.kind,
          dueAt,
          startMin: t.startMin ?? null,
          endMin: t.endMin ?? null,
          weekStart: t.weekStart ?? null,
          gradeWeight: t.weight ?? null,
          examDiet: t.examDiet ?? null,
          notes: t.notes ?? null,
          items: {
            create: (t.items ?? DEFAULT_ITEMS[t.kind] ?? []).map((label, i) => ({
              label,
              position: i,
            })),
          },
        },
      });
      createdTasks++;
    };

    // ── Timetabled classes: every instance across the 10 teaching weeks.
    // Numbered chronologically per kind, so "Lecture 7" is unambiguous even
    // when a course has two lectures a week.
    const instances: { spec: SlotSpec; date: Date; week: number }[] = [];
    for (let w = 0; w < TERM_WEEKS; w++) {
      const weekStart = addWeeks(termStart, w);
      for (const s of spec.slots) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + (s.day - isoDayOfWeek(weekStart)));
        instances.push({ spec: s, date, week: w + 1 });
      }
    }
    instances.sort((a, b) => {
      const d = a.date.getTime() - b.date.getTime();
      return d !== 0 ? d : a.spec.start - b.spec.start;
    });

    const counters: Record<string, number> = {};
    for (const inst of instances) {
      counters[inst.spec.kind] = (counters[inst.spec.kind] ?? 0) + 1;
      const label =
        inst.spec.kind === "LAB" ? "Lab" : inst.spec.kind === "SEMINAR" ? "Seminar" : "Lecture";
      await add({
        title: `${label} ${counters[inst.spec.kind]}`,
        kind: inst.spec.kind,
        due: toISODate(inst.date),
        dueMin: inst.spec.start,
        startMin: inst.spec.start,
        endMin: inst.spec.end,
        weekStart: addWeeks(termStart, inst.week - 1),
      });
    }

    // ── Weekly recurring assessments (quizzes).
    for (const wk of spec.weekly ?? []) {
      const each = wk.totalWeight != null ? wk.totalWeight / wk.count : undefined;
      for (let i = 0; i < wk.count; i++) {
        const weekStart = addWeeks(termStart, i);
        const date = new Date(weekStart);
        date.setDate(date.getDate() + (wk.dueDay - isoDayOfWeek(weekStart)));
        await add({
          title: `${wk.title} ${i + 1}`,
          kind: wk.kind,
          due: toISODate(date),
          dueMin: wk.dueMin,
          weight: each,
          weekStart,
        });
      }
    }

    // ── Fixed assessments and exams.
    for (const t of spec.tasks) await add(t);

    // ── Exam dependencies: an exam is advisory-dependent on every lecture
    // for its course, which drives the readiness indicator. Never blocking.
    const exams = await db.task.findMany({
      where: { courseId: course.id, kind: "EXAM" },
    });
    const lectures = await db.task.findMany({
      where: { courseId: course.id, kind: { in: ["LECTURE", "SEMINAR"] } },
      select: { id: true },
    });
    for (const exam of exams) {
      for (const lec of lectures) {
        await db.taskDependency.upsert({
          where: {
            dependentId_prerequisiteId: {
              dependentId: exam.id,
              prerequisiteId: lec.id,
            },
          },
          update: {},
          create: { dependentId: exam.id, prerequisiteId: lec.id },
        });
      }
    }
  }

  const totals = {
    courses: await db.course.count(),
    tasks: await db.task.count(),
    items: await db.taskItem.count(),
    deps: await db.taskDependency.count(),
  };

  console.log(
    `\n  Seed complete.\n` +
      `  ${createdCourses} new course(s), ${createdTasks} new task(s).\n\n` +
      `  Totals: ${totals.courses} courses · ${totals.tasks} tasks · ` +
      `${totals.items} checklist items · ${totals.deps} dependency links\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

/** Enum-ish unions. Stored as String in the DB so the schema stays portable
 *  (SQLite has no native enums); these are the single source of truth. */

export const TASK_KINDS = [
  "LECTURE",
  "LAB",
  "SEMINAR",
  "COURSEWORK",
  "QUIZ",
  "EXAM",
  "OTHER",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const SLOT_KINDS = ["LECTURE", "LAB", "SEMINAR"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

/** Which progress category a task counts toward.
 *  EXAM is deliberately absent: exams resolve only at the very end of the
 *  year, so counting them would peg every course's bar low all year. They
 *  surface as a separate readiness card instead. */
export type ProgressCategory = "lecture" | "lab" | "assessment";

export function categoryOf(kind: string): ProgressCategory | null {
  switch (kind) {
    case "LECTURE":
    case "SEMINAR":
      return "lecture";
    case "LAB":
      return "lab";
    case "COURSEWORK":
    case "QUIZ":
      return "assessment";
    case "EXAM":
    case "OTHER":
    default:
      return null;
  }
}

/** Default checklist for each task kind. Lectures get three parts, labs two —
 *  per AIM.md. Coursework starts empty; you add your own subtasks. */
export const DEFAULT_ITEMS: Record<string, string[]> = {
  LECTURE: ["Attendance", "Typed Notes", "Handwritten Notes"],
  SEMINAR: ["Attendance", "Typed Notes", "Handwritten Notes"],
  LAB: ["Attendance", "Lab Completion"],
  COURSEWORK: [],
  QUIZ: [],
  EXAM: [],
  OTHER: [],
};

/** Kinds whose checklist is yours to define, so the row offers an "add
 *  subtask" affordance even when the task has none yet. Lectures and labs
 *  have a canonical set of parts and don't need prompting — though they can
 *  still gain extra ones once expanded. */
export const SUBTASKABLE_KINDS = ["COURSEWORK", "QUIZ", "EXAM", "OTHER"] as const;

export function canAddSubtasks(kind: string): boolean {
  return (SUBTASKABLE_KINDS as readonly string[]).includes(kind);
}

export const TASK_KIND_LABEL: Record<string, string> = {
  LECTURE: "Lecture",
  LAB: "Lab",
  SEMINAR: "Seminar",
  COURSEWORK: "Coursework",
  QUIZ: "Quiz",
  EXAM: "Exam",
  OTHER: "Task",
};

/** Semester 1 teaching window, per AIM.md. */
export const TERM_START = "2026-09-28"; // Monday, week 1
export const TERM_WEEKS = 10; // through w/b 30 Nov 2026

/* ── Semesters ─────────────────────────────────────────────────────────── */

export const SEMESTER = { ONE: 1, TWO: 2, FULL_YEAR: 3 } as const;

/** Semester-2 courses stay out of the UI entirely until this date. */
export const SEMESTER_2_VISIBLE_FROM = new Date(2027, 0, 1); // 1 Jan 2027

/**
 * Whether a course should appear anywhere in the UI yet.
 *
 * Semester-2 courses are seeded now so their shells exist, but showing them
 * through autumn would just be noise — they appear on 1 Jan 2027.
 * Full-year courses (Coaching) and semester-1 courses are always visible.
 */
export function isCourseVisible(
  course: { semester: number },
  now: Date = new Date(),
): boolean {
  if (course.semester !== SEMESTER.TWO) return true;
  return now >= SEMESTER_2_VISIBLE_FROM;
}

/** The Prisma `where` clause equivalent, so hidden courses never leave the DB. */
export function visibleCourseWhere(now: Date = new Date()) {
  return now >= SEMESTER_2_VISIBLE_FROM
    ? { archived: false }
    : { archived: false, semester: { not: SEMESTER.TWO } };
}

/* ── Revision mode ─────────────────────────────────────────────────────── */

/** The 4th lecture part added when a course is marked for revision. */
export const REVISION_ITEM_LABEL = "Revised";

/** Notebooks, named by cover design rather than content. */
export const NOTEBOOKS = ["Space", "Physics", "Computing"] as const;
export type Notebook = (typeof NOTEBOOKS)[number];

import { categoryOf, type ProgressCategory } from "./types";

/* ──────────────────────────────────────────────────────────────────────────
   Progress model (agreed in AIM.md → Clarifications)

   A course's bar is a weighted blend of three categories — lecture, lab and
   assessment — whose weights sum to 100.

   Two rules make it behave sensibly:

   1. EXAMS ARE EXCLUDED. An exam resolves in one moment at the very end of
      the year. Counting it would peg every course's bar low for months and
      then jump it. Exams get a readiness card instead (see examReadiness).

   2. ABSENT CATEGORIES RESCALE. Most courses have no labs. Rather than show
      an empty lab bar or silently lose that weight, the weights of the
      categories that *do* have tasks are renormalised to sum to 100.

   Within a category, a task's own completion is the fraction of its checklist
   items done (a lecture with 2 of 3 parts ticked is 2/3 complete). Assessment
   tasks are then combined weighted by their real grade weight where one is
   known, and equal-weighted where it isn't.
   ────────────────────────────────────────────────────────────────────────── */

export type ProgressTask = {
  id: string;
  kind: string;
  gradeWeight: number | null;
  cancelled: boolean;
  doneAt: Date | null;
  items: { doneAt: Date | null }[];
};

export type ProgressCourse = {
  lectureWeight: number;
  labWeight: number;
  assessmentWeight: number;
};

export type CategoryProgress = {
  category: ProgressCategory;
  /** 0–1 completion within this category. */
  ratio: number;
  /** Weight actually applied after rescaling, 0–100. */
  weight: number;
  /** Raw configured weight before rescaling, for the settings UI. */
  configuredWeight: number;
  /** Fully-completed task count / total, for "8/10 lectures" style copy. */
  done: number;
  total: number;
  /** Granular item counts, for "23/30 parts". */
  itemsDone: number;
  itemsTotal: number;
  present: boolean;
};

export type CourseProgress = {
  /** 0–100, the headline number. */
  percent: number;
  categories: CategoryProgress[];
  tasksDone: number;
  tasksTotal: number;
};

/** Completion of a single task as a 0–1 fraction of its checklist. */
export function taskRatio(t: ProgressTask): number {
  if (t.items.length === 0) return t.doneAt ? 1 : 0;
  const done = t.items.filter((i) => i.doneAt !== null).length;
  return done / t.items.length;
}

export function isTaskDone(t: ProgressTask): boolean {
  if (t.items.length === 0) return t.doneAt !== null;
  return t.items.every((i) => i.doneAt !== null);
}

const EPSILON = 1e-9;

export function computeCourseProgress(
  course: ProgressCourse,
  tasks: ProgressTask[],
): CourseProgress {
  const live = tasks.filter((t) => !t.cancelled);

  const configured: Record<ProgressCategory, number> = {
    lecture: course.lectureWeight,
    lab: course.labWeight,
    assessment: course.assessmentWeight,
  };

  const buckets: Record<ProgressCategory, ProgressTask[]> = {
    lecture: [],
    lab: [],
    assessment: [],
  };

  for (const t of live) {
    const cat = categoryOf(t.kind);
    if (cat) buckets[cat].push(t);
  }

  const order: ProgressCategory[] = ["lecture", "lab", "assessment"];

  // A category is "present" only if it has tasks AND a non-zero weight.
  // Either alone should not consume part of the bar.
  const present = order.filter(
    (c) => buckets[c].length > 0 && configured[c] > 0,
  );
  const presentWeightSum = present.reduce((s, c) => s + configured[c], 0);

  const categories: CategoryProgress[] = order.map((cat) => {
    const list = buckets[cat];
    const isPresent = present.includes(cat);

    const ratio =
      cat === "assessment" ? weightedRatio(list) : simpleRatio(list);

    const itemsTotal = list.reduce(
      (s, t) => s + (t.items.length === 0 ? 1 : t.items.length),
      0,
    );
    const itemsDone = list.reduce(
      (s, t) =>
        s +
        (t.items.length === 0
          ? t.doneAt
            ? 1
            : 0
          : t.items.filter((i) => i.doneAt).length),
      0,
    );

    return {
      category: cat,
      ratio,
      // Rescale so present categories sum to exactly 100.
      weight:
        isPresent && presentWeightSum > EPSILON
          ? (configured[cat] / presentWeightSum) * 100
          : 0,
      configuredWeight: configured[cat],
      done: list.filter(isTaskDone).length,
      total: list.length,
      itemsDone,
      itemsTotal,
      present: isPresent,
    };
  });

  const percent = categories.reduce((s, c) => s + c.ratio * c.weight, 0);

  return {
    percent: clamp(percent),
    categories,
    tasksDone: live.filter(isTaskDone).length,
    tasksTotal: live.length,
  };
}

/** Unweighted mean of task ratios — used for lectures and labs, where every
 *  class genuinely counts the same. */
function simpleRatio(tasks: ProgressTask[]): number {
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((s, t) => s + (t.items.length || 1), 0);
  if (total < EPSILON) return 0;
  const done = tasks.reduce(
    (s, t) =>
      s +
      (t.items.length === 0
        ? t.doneAt
          ? 1
          : 0
        : t.items.filter((i) => i.doneAt).length),
    0,
  );
  return done / total;
}

/** Grade-weighted mean — used for assessments. Tasks with a known grade
 *  weight contribute proportionally; unweighted ones share the mean weight
 *  of the known ones (or 1 each if no weights are known at all), so mixing
 *  weighted and unweighted assessments never silently distorts the result. */
function weightedRatio(tasks: ProgressTask[]): number {
  if (tasks.length === 0) return 0;

  const known = tasks.filter((t) => t.gradeWeight != null && t.gradeWeight > 0);
  const fallback =
    known.length > 0
      ? known.reduce((s, t) => s + (t.gradeWeight as number), 0) / known.length
      : 1;

  let num = 0;
  let den = 0;
  for (const t of tasks) {
    const w = t.gradeWeight != null && t.gradeWeight > 0 ? t.gradeWeight : fallback;
    num += taskRatio(t) * w;
    den += w;
  }
  return den < EPSILON ? 0 : num / den;
}

/** Overall progress across courses — the mean of each course's percentage,
 *  so a course with 60 lecture instances doesn't drown out one with 8. */
export function overallProgress(
  courses: { progress: CourseProgress }[],
): number {
  const counted = courses.filter((c) => c.progress.tasksTotal > 0);
  if (counted.length === 0) return 0;
  return clamp(
    counted.reduce((s, c) => s + c.progress.percent, 0) / counted.length,
  );
}

/** Exam readiness: how much of the exam's advisory prerequisite chain is
 *  done. Purely informational — nothing is ever blocked (AIM.md). */
export type ExamReadiness = {
  ready: number;
  total: number;
  ratio: number;
};

export function examReadiness(prereqs: ProgressTask[]): ExamReadiness {
  const live = prereqs.filter((t) => !t.cancelled);
  const ready = live.filter(isTaskDone).length;
  return {
    ready,
    total: live.length,
    ratio: live.length === 0 ? 0 : ready / live.length,
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Normalise three weights to sum to 100, preserving ratios. Used by the
 *  per-course weight editor so the stored values always total 100. */
export function normaliseWeights(
  lecture: number,
  lab: number,
  assessment: number,
): { lecture: number; lab: number; assessment: number } {
  const sum = lecture + lab + assessment;
  if (sum <= 0) return { lecture: 35, lab: 0, assessment: 65 };
  const scale = 100 / sum;
  // Round two, derive the third, so the total is exactly 100.
  const l = Math.round(lecture * scale);
  const b = Math.round(lab * scale);
  return { lecture: l, lab: b, assessment: 100 - l - b };
}

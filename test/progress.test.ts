/**
 * Tests for the progress engine — the rules agreed in AIM.md.
 * Plain assertions, no framework: `npm test`.
 */
import assert from "node:assert/strict";
import {
  computeCourseProgress, examReadiness, normaliseWeights,
  overallProgress, type ProgressTask,
} from "../lib/progress";

let passed = 0;
const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const D = new Date("2026-10-01");

/** Build a task with `done` of `parts` checklist items ticked. */
function task(
  kind: string,
  parts: number,
  done: number,
  gradeWeight: number | null = null,
): ProgressTask {
  return {
    id: Math.random().toString(36).slice(2),
    kind,
    gradeWeight,
    cancelled: false,
    doneAt: parts === 0 && done > 0 ? D : null,
    items: Array.from({ length: parts }, (_, i) => ({ doneAt: i < done ? D : null })),
  };
}

const W = (lecture: number, lab: number, assessment: number) => ({
  lectureWeight: lecture,
  labWeight: lab,
  assessmentWeight: assessment,
});

const approx = (a: number, b: number, msg: string) =>
  assert.ok(Math.abs(a - b) < 0.001, `${msg} — expected ${b}, got ${a}`);

/* ── Category weighting ─────────────────────────────────────────────── */

test("all lectures done, nothing else → exactly the lecture weight", () => {
  const p = computeCourseProgress(W(30, 20, 50), [
    task("LECTURE", 3, 3), task("LECTURE", 3, 3),
    task("LAB", 2, 0),
    task("COURSEWORK", 0, 0, 20),
  ]);
  approx(p.percent, 30, "lecture-only completion");
});

test("partial lecture completion scales linearly", () => {
  const p = computeCourseProgress(W(30, 20, 50), [
    task("LECTURE", 3, 3), task("LECTURE", 3, 0),   // 3 of 6 parts
    task("LAB", 2, 0),
    task("COURSEWORK", 0, 0, 20),
  ]);
  approx(p.percent, 15, "half the lecture parts");
});

test("everything done → 100", () => {
  const p = computeCourseProgress(W(30, 20, 50), [
    task("LECTURE", 3, 3), task("LAB", 2, 2), task("COURSEWORK", 0, 1, 20),
  ]);
  approx(p.percent, 100, "full completion");
});

/* ── Absent categories rescale ──────────────────────────────────────── */

test("a course with no labs redistributes the lab weight", () => {
  // Configured 30/20/50, but no lab tasks exist. Lectures and assessment
  // rescale to 37.5 / 62.5.
  const p = computeCourseProgress(W(30, 20, 50), [
    task("LECTURE", 3, 3),
    task("COURSEWORK", 0, 0, 40),
  ]);
  approx(p.percent, 37.5, "rescaled lecture weight");

  const lab = p.categories.find((c) => c.category === "lab")!;
  assert.equal(lab.present, false, "lab category should be absent");
  assert.equal(lab.weight, 0, "absent lab carries no weight");

  const sum = p.categories.filter((c) => c.present).reduce((s, c) => s + c.weight, 0);
  approx(sum, 100, "present weights sum to 100");
});

test("a zero-weight category never consumes part of the bar", () => {
  const p = computeCourseProgress(W(0, 0, 100), [
    task("LECTURE", 3, 0),           // exists, but weighted 0
    task("COURSEWORK", 0, 1, 50),
  ]);
  approx(p.percent, 100, "assessment-only course");
});

/* ── Exams are excluded ─────────────────────────────────────────────── */

test("an unfinished exam does not drag the bar down", () => {
  const withoutExam = computeCourseProgress(W(35, 0, 65), [
    task("LECTURE", 3, 3), task("COURSEWORK", 0, 1, 40),
  ]);
  const withExam = computeCourseProgress(W(35, 0, 65), [
    task("LECTURE", 3, 3), task("COURSEWORK", 0, 1, 40),
    task("EXAM", 0, 0, 60),          // 60% of the grade, untouched
  ]);
  approx(withExam.percent, withoutExam.percent, "exam excluded from bar");
  approx(withExam.percent, 100, "course reads complete without the exam");
});

/* ── Assessment grade weighting ─────────────────────────────────────── */

test("assessments are weighted by real grade weight", () => {
  // 40% coursework done, 60% exam ignored → assessment category is 100%.
  const p = computeCourseProgress(W(0, 0, 100), [
    task("COURSEWORK", 0, 1, 40),
    task("EXAM", 0, 0, 60),
  ]);
  approx(p.percent, 100, "only non-exam assessments count");
});

test("a heavier assessment moves the bar more", () => {
  const heavyDone = computeCourseProgress(W(0, 0, 100), [
    task("COURSEWORK", 0, 1, 80), task("COURSEWORK", 0, 0, 20),
  ]);
  const lightDone = computeCourseProgress(W(0, 0, 100), [
    task("COURSEWORK", 0, 0, 80), task("COURSEWORK", 0, 1, 20),
  ]);
  approx(heavyDone.percent, 80, "80% piece done");
  approx(lightDone.percent, 20, "20% piece done");
});

test("unweighted assessments are equal-weighted among themselves", () => {
  const p = computeCourseProgress(W(0, 0, 100), [
    task("COURSEWORK", 0, 1), task("COURSEWORK", 0, 0),
  ]);
  approx(p.percent, 50, "two unweighted, one done");
});

test("mixing weighted and unweighted does not distort", () => {
  // The unweighted task takes the mean of the known weights (30), so the
  // three tasks are 30/30/30 → one done is a third.
  const p = computeCourseProgress(W(0, 0, 100), [
    task("COURSEWORK", 0, 1, 20), task("COURSEWORK", 0, 0, 40), task("COURSEWORK", 0, 0),
  ]);
  approx(p.percent, 20 / 90 * 100, "mixed weighting");
});

/* ── Cancelled tasks ────────────────────────────────────────────────── */

test("cancelled tasks are ignored entirely", () => {
  const cancelled = task("LECTURE", 3, 0);
  cancelled.cancelled = true;
  const p = computeCourseProgress(W(100, 0, 0), [task("LECTURE", 3, 3), cancelled]);
  approx(p.percent, 100, "cancelled lecture excluded");
});

/* ── Edge cases ─────────────────────────────────────────────────────── */

test("an empty course is 0, not NaN", () => {
  const p = computeCourseProgress(W(35, 0, 65), []);
  approx(p.percent, 0, "empty course");
  assert.ok(Number.isFinite(p.percent), "must be finite");
});

test("all-zero weights fall back rather than divide by zero", () => {
  const p = computeCourseProgress(W(0, 0, 0), [task("LECTURE", 3, 3)]);
  assert.ok(Number.isFinite(p.percent), "must be finite");
  approx(p.percent, 0, "no weight means no contribution");
});

test("progress is always clamped to 0–100", () => {
  const p = computeCourseProgress(W(50, 50, 50), [
    task("LECTURE", 1, 1), task("LAB", 1, 1), task("COURSEWORK", 0, 1, 10),
  ]);
  assert.ok(p.percent >= 0 && p.percent <= 100, `clamped, got ${p.percent}`);
  approx(p.percent, 100, "over-weighted course still caps at 100");
});

/* ── Overall ────────────────────────────────────────────────────────── */

test("overall is the mean of courses, not of tasks", () => {
  // A course with 100 tasks must not drown out one with 2.
  const big = computeCourseProgress(W(100, 0, 0),
    Array.from({ length: 100 }, () => task("LECTURE", 1, 0)));
  const small = computeCourseProgress(W(100, 0, 0), [task("LECTURE", 1, 1)]);
  approx(overallProgress([{ progress: big }, { progress: small }]), 50, "mean of courses");
});

test("courses with no tasks are left out of the overall mean", () => {
  const empty = computeCourseProgress(W(35, 0, 65), []);
  const done = computeCourseProgress(W(100, 0, 0), [task("LECTURE", 1, 1)]);
  approx(overallProgress([{ progress: empty }, { progress: done }]), 100, "empty course ignored");
});

/* ── Exam readiness ─────────────────────────────────────────────────── */

test("exam readiness counts fully-complete prerequisites only", () => {
  const r = examReadiness([
    task("LECTURE", 3, 3), task("LECTURE", 3, 2), task("LECTURE", 3, 0),
  ]);
  assert.equal(r.ready, 1);
  assert.equal(r.total, 3);
  approx(r.ratio, 1 / 3, "readiness ratio");
});

test("exam readiness with no prerequisites is 0, not NaN", () => {
  const r = examReadiness([]);
  assert.ok(Number.isFinite(r.ratio));
  assert.equal(r.ratio, 0);
});

/* ── Weight normalisation ───────────────────────────────────────────── */

test("weights always normalise to exactly 100", () => {
  for (const [l, b, a] of [[30, 20, 50], [1, 1, 1], [70, 0, 30], [33, 33, 33], [5, 2, 9]]) {
    const w = normaliseWeights(l, b, a);
    assert.equal(w.lecture + w.lab + w.assessment, 100, `${l}/${b}/${a} → ${JSON.stringify(w)}`);
  }
});

test("normalising all-zero weights falls back to a sane default", () => {
  const w = normaliseWeights(0, 0, 0);
  assert.equal(w.lecture + w.lab + w.assessment, 100);
});

/* ── Run ────────────────────────────────────────────────────────────── */

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[31m${(e as Error).message}\x1b[0m`);
  }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

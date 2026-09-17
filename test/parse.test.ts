/** Tests for the one-line task parser. */
import assert from "node:assert/strict";
import { parseTask, type ParseCourse } from "../lib/parse";

const COURSES: ParseCourse[] = [
  { id: "fp", shortName: "FP", code: "COMPSCI4021", name: "Functional Programming" },
  { id: "cp", shortName: "CP", code: "COMPSCI5006", name: "Constraint Programming" },
  { id: "rmt", shortName: "RMT", code: "COMPSCI5025", name: "Research Methods" },
];

// Fixed "now" so weekday and year inference are deterministic.
const NOW = new Date(2026, 8, 15, 10, 0, 0); // Tue 15 Sep 2026

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const p = (s: string) => parseTask(s, COURSES, NOW);

test("plain text is just a title", () => {
  const r = p("read chapter four");
  assert.equal(r.title, "read chapter four");
  assert.equal(r.courseId, null);
  assert.equal(r.dueDate, null);
});

test("course by short name", () => {
  const r = p("FP programming exercise");
  assert.equal(r.courseId, "fp");
  assert.equal(r.title, "programming exercise");
});

test("course by @ prefix", () => {
  assert.equal(p("@CP poster").courseId, "cp");
});

test("course by full code", () => {
  assert.equal(p("COMPSCI5025 coursework").courseId, "rmt");
});

test("a bare kind keyword infers the kind but stays in the title", () => {
  const r = p("FP lab 3");
  assert.equal(r.kind, "LAB");
  assert.equal(r.title, "lab 3", "the word is the name of the thing");
});

test("an explicit #kind is consumed", () => {
  const r = p("#quiz week 2");
  assert.equal(r.kind, "QUIZ");
  assert.equal(r.title, "week 2");
});

test("a one-word task keeps its word", () => {
  assert.equal(p("coursework").title, "coursework");
  assert.equal(p("essay").title, "essay");
});

test("the earliest keyword wins", () => {
  assert.equal(p("lab report due friday").kind, "LAB");
});

test("ISO date", () => {
  assert.equal(p("essay 2026-11-20").dueDate, "2026-11-20");
});

test("UK day/month date", () => {
  assert.equal(p("coursework 24/11").dueDate, "2026-11-24");
});

test("day/month/year date", () => {
  assert.equal(p("report 08/03/2027").dueDate, "2027-03-08");
});

test("spelled month, day first", () => {
  assert.equal(p("poster 19 oct").dueDate, "2026-10-19");
});

test("spelled month, month first", () => {
  assert.equal(p("poster oct 19").dueDate, "2026-10-19");
});

test("a past month rolls to next year", () => {
  // March is behind us on 15 Sep 2026, so "3 mar" means 2027.
  assert.equal(p("final report 8 mar").dueDate, "2027-03-08");
});

test("today and tomorrow", () => {
  assert.equal(p("revision today").dueDate, "2026-09-15");
  assert.equal(p("revision tomorrow").dueDate, "2026-09-16");
});

test("relative days and weeks", () => {
  assert.equal(p("draft in 3d").dueDate, "2026-09-18");
  assert.equal(p("draft in 2 weeks").dueDate, "2026-09-29");
});

test("weekday resolves forward", () => {
  // Tue 15 Sep → "fri" is 18 Sep.
  assert.equal(p("essay fri").dueDate, "2026-09-18");
});

test("same weekday means next week, not today", () => {
  // It IS Tuesday; "tue" should mean the following Tuesday.
  assert.equal(p("standup tue").dueDate, "2026-09-22");
});

test("12-hour time", () => {
  const r = p("essay 5pm");
  assert.equal(r.dueTime, "17:00");
});

test("24-hour and dotted time", () => {
  assert.equal(p("essay 16:30").dueTime, "16:30");
  assert.equal(p("essay 16.30").dueTime, "16:30");
});

test("midday and midnight edges", () => {
  assert.equal(p("a 12am").dueTime, "00:00");
  assert.equal(p("a 12pm").dueTime, "12:00");
});

test("priority flag", () => {
  const r = p("essay !");
  assert.equal(r.priority, true);
  assert.equal(r.title, "essay");
});

test("grade weight", () => {
  const r = p("coursework 40%");
  assert.equal(r.gradeWeight, 40);
  assert.equal(r.title, "coursework");
});

test("everything at once", () => {
  const r = p("FP programming exercise fri 5pm ! 20%");
  assert.equal(r.courseId, "fp");
  assert.equal(r.title, "programming exercise");
  assert.equal(r.dueDate, "2026-09-18");
  assert.equal(r.dueTime, "17:00");
  assert.equal(r.priority, true);
  assert.equal(r.gradeWeight, 20);
});

test("a real AIM.md deadline parses correctly", () => {
  const r = p("RMT coursework 24/11 40%");
  assert.equal(r.courseId, "rmt");
  assert.equal(r.title, "coursework");
  assert.equal(r.dueDate, "2026-11-24");
  assert.equal(r.gradeWeight, 40);
});

test("matched tokens are reported for display", () => {
  const r = p("FP essay fri 20%");
  const types = r.matched.map((m) => m.type).sort();
  assert.deepEqual(types, ["course", "date", "weight"]);
});

test("empty input yields an empty title, not a crash", () => {
  const r = p("");
  assert.equal(r.title, "");
  assert.equal(r.courseId, null);
});

test("course name inside a word is not matched", () => {
  // "CP" must not be pulled out of "CPU".
  const r = p("read about CPU caches");
  assert.equal(r.courseId, null);
  assert.equal(r.title, "read about CPU caches");
});

let failed = 0, passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

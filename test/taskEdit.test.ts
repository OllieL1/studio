/** Task edits → database patches. */
import assert from "node:assert/strict";
import { buildTaskPatch } from "../lib/taskEdit";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const deadline = { dueAt: new Date(2026, 10, 24, 23, 59), startMin: null, endMin: null };
const lecture = { dueAt: new Date(2026, 9, 1, 10, 0), startMin: 600, endMin: 720 };

const patch = (e: Parameters<typeof buildTaskPatch>[0], d: Parameters<typeof buildTaskPatch>[1]) => {
  const r = buildTaskPatch(e, d);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return (r as { ok: true; patch: ReturnType<typeof buildTaskPatch> extends infer X ? X extends { patch: infer P } ? P : never : never }).patch;
};
const fails = (e: Parameters<typeof buildTaskPatch>[0], d: Parameters<typeof buildTaskPatch>[1]) =>
  assert.equal(buildTaskPatch(e, d).ok, false);

test("only supplied fields are patched", () => {
  const p = patch(deadline, { title: "Renamed" });
  assert.deepEqual(Object.keys(p), ["title"]);
});

test("titles are trimmed, and blank titles rejected", () => {
  assert.equal(patch(deadline, { title: "  Essay  " }).title, "Essay");
  fails(deadline, { title: "   " });
});

test("moving a deadline's date keeps the time given", () => {
  const p = patch(deadline, { dueDate: "2026-11-30", dueTime: "16:30" });
  assert.equal(p.dueAt!.getDate(), 30);
  assert.equal(p.dueAt!.getHours(), 16);
  assert.equal(p.dueAt!.getMinutes(), 30);
});

test("a deadline date without a time falls back to 23:59", () => {
  const p = patch(deadline, { dueDate: "2026-11-30", dueTime: null });
  assert.equal(p.dueAt!.getHours(), 23);
  assert.equal(p.dueAt!.getMinutes(), 59);
});

test("clearing the date clears dueAt", () => {
  assert.equal(patch(deadline, { dueDate: null }).dueAt, null);
});

test("a class's new date uses its start time, not a due time", () => {
  const p = patch(lecture, { dueDate: "2026-10-08", dueTime: "23:59" });
  assert.equal(p.dueAt!.getDate(), 8);
  assert.equal(p.dueAt!.getHours(), 10, "10:00 start, not 23:59");
});

test("moving only a class's start time moves its dueAt the same day", () => {
  const p = patch(lecture, { startTime: "14:00", endTime: "15:00" });
  assert.equal(p.startMin, 840);
  assert.equal(p.dueAt!.getDate(), 1, "same day");
  assert.equal(p.dueAt!.getHours(), 14);
});

test("changing a class's date and start together is consistent", () => {
  const p = patch(lecture, { dueDate: "2026-10-15", startTime: "09:00", endTime: "11:00" });
  assert.equal(p.dueAt!.getDate(), 15);
  assert.equal(p.dueAt!.getHours(), 9);
});

test("an end time at or before the start is rejected", () => {
  fails(lecture, { startTime: "14:00", endTime: "13:00" });
  fails(lecture, { endTime: "09:00" }); // before the existing 10:00 start
});

test("a malformed time is an error, not a silent clear", () => {
  fails(lecture, { startTime: "25:00" });
  fails(deadline, { dueDate: "2026-11-30", dueTime: "4.30pm" });
});

test("a malformed date is rejected", () => {
  fails(deadline, { dueDate: "30/11/2026" });
});

test("grade weight is validated, and can be cleared", () => {
  assert.equal(patch(deadline, { gradeWeight: 40 }).gradeWeight, 40);
  assert.equal(patch(deadline, { gradeWeight: null }).gradeWeight, null);
  fails(deadline, { gradeWeight: 120 });
  fails(deadline, { gradeWeight: -5 });
  fails(deadline, { gradeWeight: Number.NaN });
});

test("unknown task types are rejected", () => {
  fails(deadline, { kind: "HOMEWORK" });
  assert.equal(patch(deadline, { kind: "EXAM" }).kind, "EXAM");
});

test("priority maps to the stored integer", () => {
  assert.equal(patch(deadline, { priority: true }).priority, 1);
  assert.equal(patch(deadline, { priority: false }).priority, 0);
});

test("empty notes, course and diet become null", () => {
  const p = patch(deadline, { notes: "   ", courseId: "", examDiet: "  " });
  assert.equal(p.notes, null);
  assert.equal(p.courseId, null);
  assert.equal(p.examDiet, null);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

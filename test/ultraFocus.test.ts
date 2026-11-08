/** Pausing and ultra focus: studied time excludes pauses; the lock keeps you on one course's pages. */
import assert from "node:assert/strict";
import { activeLock, lockAllows, lockHome, pausedTotalAfterResume, studiedMs } from "../lib/ultraFocus";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const at = (min: number) => new Date(2026, 10, 8, 10, min);
const MIN = 60_000;

test("studied time leaves out pauses, finished and ongoing", () => {
  const start = at(0);
  assert.equal(studiedMs({ startedAt: start, pausedAt: null, pausedMs: 0 }, at(30)), 30 * MIN);
  // Paused at 20 minutes: the clock stands still however long the pause runs.
  assert.equal(studiedMs({ startedAt: start, pausedAt: at(20), pausedMs: 0 }, at(50)), 20 * MIN);
  // Resumed at 35: 15 minutes of pause banked, and the clock runs again.
  const banked = pausedTotalAfterResume({ startedAt: start, pausedAt: at(20), pausedMs: 0 }, at(35));
  assert.equal(banked, 15 * MIN);
  assert.equal(studiedMs({ startedAt: start, pausedAt: null, pausedMs: banked }, at(45)), 30 * MIN);
  // Resuming when not paused changes nothing.
  assert.equal(pausedTotalAfterResume({ startedAt: start, pausedAt: null, pausedMs: banked }, at(50)), banked);
});

test("a lock holds until its time, then it's gone", () => {
  const t = { lockCourseId: "c1", lockUntil: at(50) };
  assert.deepEqual(activeLock(t, at(49)), { courseId: "c1", until: at(50) });
  assert.equal(activeLock(t, at(50)), null);
  assert.equal(activeLock({ lockCourseId: null, lockUntil: at(50) }, at(0)), null);
  assert.equal(activeLock(null), null);
});

test("a course lock allows the course's pages, its tasks and PDFs - nothing else", () => {
  const c = { id: "c1", isProject: false };
  assert.equal(lockHome(c), "/courses/c1");
  for (const p of ["/courses/c1", "/courses/c1/", "/courses/c1/notes", "/pdf"]) assert.equal(lockAllows(p, c), "yes", p);
  for (const p of ["/", "/calendar", "/courses/c2", "/courses/c10", "/project", "/settings", "/livio", "/livio/todo", "/lectures", "/stats"])
    assert.equal(lockAllows(p, c), "no", p);
  assert.deepEqual(lockAllows("/lectures/t9", c), { task: "t9" });
  assert.deepEqual(lockAllows("/tasks/t9/notes/n1", c), { task: "t9" });
});

test("the project lock allows everything under /project", () => {
  const c = { id: "p1", isProject: true };
  assert.equal(lockHome(c), "/project");
  for (const p of ["/project", "/project/nexus/n1", "/project/meetings/m1", "/courses/p1"]) assert.equal(lockAllows(p, c), "yes", p);
  assert.equal(lockAllows("/projects", c), "no");
  assert.equal(lockAllows("/", c), "no");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

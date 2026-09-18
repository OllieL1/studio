/** Per-task time attribution and metrics. */
import assert from "node:assert/strict";
import { computeTaskMetrics, attributedMinutes, type TaskSession } from "../lib/taskStats";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const approx = (a: number, b: number, m: string) =>
  assert.ok(Math.abs(a - b) < 0.001, `${m} — expected ${b}, got ${a}`);

const s = (day: number, hour: number, minutes: number, focus: number, taskCount = 1): TaskSession => ({
  id: `${day}-${hour}`, name: "x",
  startedAt: new Date(2026, 9, day, hour, 0), minutes, focus, taskCount,
});

test("a session tagged to one task gives it all the time", () => {
  approx(attributedMinutes(s(1, 10, 90, 80)), 90, "sole task");
});

test("a session tagged to several tasks is shared evenly", () => {
  approx(attributedMinutes(s(1, 10, 90, 80, 3)), 30, "a third each");
});

test("sharing never double-counts across tasks", () => {
  // One 120m session tagged to 4 tasks → 30m each → 120m in total.
  const perTask = attributedMinutes(s(1, 10, 120, 70, 4));
  approx(perTask * 4, 120, "shares sum back to the session");
});

test("totals, averages and span", () => {
  const m = computeTaskMetrics([s(1, 10, 60, 80), s(3, 14, 120, 50), s(3, 18, 30, 90)]);
  approx(m.minutes, 210, "total");
  assert.equal(m.sessions, 3);
  assert.equal(m.activeDays, 2, "two distinct days");
  approx(m.avgSessionMinutes!, 70, "210 / 3");
  // Focus weighted by minutes: (80*60 + 50*120 + 90*30) / 210
  approx(m.avgFocus!, (4800 + 6000 + 2700) / 210, "time-weighted focus");
  assert.equal(m.firstWorked!.getDate(), 1);
  assert.equal(m.lastWorked!.getDate(), 3);
});

test("focus is weighted by attributed, not raw, minutes", () => {
  // A long shared session shouldn't dominate focus as if it were all this task's.
  const m = computeTaskMetrics([s(1, 10, 60, 100, 1), s(2, 10, 240, 0, 4)]);
  // attributed: 60 @100, 60 @0 → 50
  approx(m.avgFocus!, 50, "equal attributed time → equal pull on focus");
});

test("cumulative time only ever grows", () => {
  const m = computeTaskMetrics([s(5, 9, 40, 70), s(1, 9, 20, 70), s(3, 9, 30, 70)]);
  const vals = m.cumulative.map((c) => c.minutes);
  assert.deepEqual(vals, [20, 50, 90], "sorted by date and running");
});

test("shared sessions are flagged for the UI", () => {
  assert.equal(computeTaskMetrics([s(1, 10, 60, 80, 1)]).hasSharedSessions, false);
  assert.equal(computeTaskMetrics([s(1, 10, 60, 80, 2)]).hasSharedSessions, true);
});

test("no sessions gives zeros and nulls, not NaN", () => {
  const m = computeTaskMetrics([]);
  assert.equal(m.minutes, 0);
  assert.equal(m.avgFocus, null);
  assert.equal(m.avgSessionMinutes, null);
  assert.equal(m.firstWorked, null);
  assert.deepEqual(m.cumulative, []);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

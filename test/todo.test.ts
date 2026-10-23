/** Livio's todo rules (lib/livio/todo.ts). */
import assert from "node:assert/strict";
import { dueLabel, dueText, groupOf, groupTodos, parseDue, parseTodo, type TodoLike } from "../lib/livio/todo";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

// Thursday 22 October 2026, noon.
const NOW = new Date(2026, 9, 22, 12, 0);
const at = (d: number, h = 23, m = 59, month = 9) => new Date(2026, month, d, h, m);
let n = 0;
const todo = (over: Partial<TodoLike> = {}): TodoLike => ({
  id: `t${++n}`, title: "x", dueAt: null, priority: 0, doneAt: null, createdAt: new Date(2026, 9, 1, n), ...over,
});

test("todos fall into overdue, today, this week, later and no date", () => {
  assert.equal(groupOf({ dueAt: at(21) }, NOW), "overdue");
  // Earlier today is still today, not overdue.
  assert.equal(groupOf({ dueAt: at(22, 9, 0) }, NOW), "today");
  assert.equal(groupOf({ dueAt: at(22) }, NOW), "today");
  assert.equal(groupOf({ dueAt: at(25) }, NOW), "week"); // Sunday
  assert.equal(groupOf({ dueAt: at(26, 0, 0) }, NOW), "later"); // Monday
  assert.equal(groupOf({ dueAt: null }, NOW), "none");
});

test("groups come in order, empty ones left out, each priority-first then soonest", () => {
  const a = todo({ title: "late", dueAt: at(20) });
  const b = todo({ title: "fri", dueAt: at(23) });
  const c = todo({ title: "sat !", dueAt: at(24), priority: 1 });
  const d = todo({ title: "someday" });
  const e = todo({ title: "done", dueAt: at(23), doneAt: at(21, 10, 0) });
  const { groups, done } = groupTodos([d, b, c, a, e], NOW);
  assert.deepEqual(groups.map((g) => g.key), ["overdue", "week", "none"]);
  assert.deepEqual(groups[1].items.map((t) => t.title), ["sat !", "fri"]);
  assert.deepEqual(done.map((t) => t.title), ["done"]);
});

test("due dates read the way you'd say them", () => {
  assert.equal(dueLabel(at(22), NOW), "Today");
  assert.equal(dueLabel(at(22, 17, 0), NOW), "Today 17:00");
  assert.equal(dueLabel(at(23), NOW), "Tomorrow");
  assert.equal(dueLabel(at(21), NOW), "Yesterday");
  assert.equal(dueLabel(at(27), NOW), "Tue");
  assert.equal(dueLabel(at(3, 23, 59, 10), NOW), "3 Nov");
  assert.equal(dueLabel(new Date(2027, 0, 5, 23, 59), NOW), "5 Jan 2027");
});

test("typed due dates take a day, a time, or both", () => {
  const fri = parseDue("fri", NOW)!;
  assert.deepEqual([fri.getDate(), fri.getHours(), fri.getMinutes()], [23, 23, 59]);
  const fri5 = parseDue("fri 5pm", NOW)!;
  assert.deepEqual([fri5.getDate(), fri5.getHours()], [23, 17]);
  const time = parseDue("17:30", NOW)!;
  assert.deepEqual([time.getDate(), time.getHours(), time.getMinutes()], [22, 17, 30]);
  assert.equal(parseDue("", NOW), null);
  assert.equal(parseDue("someday", NOW), undefined);
});

test("a due date typed back reads as it parses", () => {
  assert.equal(dueText(at(3, 23, 59, 10)), "3 nov");
  assert.equal(dueText(at(23, 17, 0)), "23 oct 17:00");
  for (const d of [at(3, 23, 59, 10), at(23, 17, 0)]) {
    assert.equal(parseDue(dueText(d), NOW)?.getTime(), d.getTime());
  }
});

const COURSES = [
  { id: "p", shortName: "Project", code: "COMPSCI5018P", name: "Individual Project" },
  { id: "fp", shortName: "FP", code: "COMPSCI4021", name: "Functional Programming" },
];

test("a course needs an @ - a bare short name stays in the title", () => {
  const plain = parseTodo("finish the project plan fri", COURSES, NOW);
  assert.equal(plain.courseId, null);
  assert.equal(plain.title, "finish the project plan");
  const asked = parseTodo("exercise 3 @fp fri !", COURSES, NOW);
  assert.equal(asked.courseId, "fp");
  assert.equal(asked.title, "exercise 3");
  assert.equal(asked.priority, true);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

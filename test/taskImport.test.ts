/** Importing tasks from JSON (lib/taskImport.ts). */
import assert from "node:assert/strict";
import { EXAMPLE_IMPORT, parseTaskImport } from "../lib/taskImport";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

test("the example in the help dialog imports cleanly", () => {
  const r = parseTaskImport(EXAMPLE_IMPORT);
  assert.deepEqual(r.errors, []);
  assert.equal(r.tasks.length, 3);
  assert.equal(r.tasks[0].kind, "COURSEWORK");
  assert.deepEqual(r.tasks[0].subtasks, ["Collect 30 papers", "Write first draft"]);
  assert.deepEqual(r.tasks[1].dependsOn, ["Literature review"]);
  assert.equal(r.tasks[1].dueTime, "12:00");
  assert.equal(r.tasks[2].backlog, true);
});

test("a bare list works, and only a title is required", () => {
  const r = parseTaskImport([{ title: "  One  " }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.tasks[0].title, "One");
  assert.equal(r.tasks[0].kind, "OTHER");
  assert.equal(r.tasks[0].due, null);
});

test("friendly aliases are understood", () => {
  const r = parseTaskImport([{ name: "A", deadline: "2026-12-01", type: "exam", gradeWeight: "20%", completed: true }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.tasks[0].due, "2026-12-01");
  assert.equal(r.tasks[0].kind, "EXAM");
  assert.equal(r.tasks[0].weight, 20);
  assert.equal(r.tasks[0].done, true);
});

test("a bad entry is reported by position and name, and the good ones still come through", () => {
  const r = parseTaskImport([{ title: "Fine" }, { title: "Bad", due: "2026-02-30", kind: "nope" }, { due: "2026-01-01" }]);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Task 2 \(“Bad”\).*kind.*real date/);
  assert.match(r.errors[1], /Task 3: needs a "title"/);
});

test("start after due, a stray time and a bad weight are caught", () => {
  const r = parseTaskImport([{ title: "X", start: "2026-12-05", due: "2026-12-01", dueTime: "25:00", weight: 150 }]);
  assert.equal(r.tasks.length, 0);
  assert.match(r.errors[0], /start is after due/);
  assert.match(r.errors[0], /dueTime/);
  assert.match(r.errors[0], /weight/);
});

test("something that isn't a list is refused whole", () => {
  assert.equal(parseTaskImport({ foo: 1 }).tasks.length, 0);
  assert.equal(parseTaskImport("hi").errors.length, 1);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

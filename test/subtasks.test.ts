/**
 * Subtask behaviour, exercised against the real database.
 *
 * Creates a throwaway course, works on it, and removes it — your own data is
 * never touched.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { addTaskItem, removeTaskItem, setTaskDone, toggleTaskItem } from "../lib/tasks";
import { computeCourseProgress } from "../lib/progress";

const db = new PrismaClient();
const SCRATCH = "__TEST_SCRATCH__";

const tests: [string, (ctx: Ctx) => Promise<void>][] = [];
const test = (n: string, f: (ctx: Ctx) => Promise<void>) => tests.push([n, f]);

type Ctx = { courseId: string; taskId: string };

/** Course progress, recomputed from the database. */
async function percent(courseId: string): Promise<number> {
  const c = await db.course.findUnique({
    where: { id: courseId },
    include: { tasks: { include: { items: true } } },
  });
  return computeCourseProgress(c!, c!.tasks).percent;
}

async function taskDone(taskId: string): Promise<boolean> {
  const t = await db.task.findUnique({ where: { id: taskId } });
  return t?.doneAt != null;
}

async function items(taskId: string) {
  return db.taskItem.findMany({ where: { taskId }, orderBy: { position: "asc" } });
}

const approx = (a: number, b: number, m: string) =>
  assert.ok(Math.abs(a - b) < 0.001, `${m} — expected ${b}, got ${a}`);

/* ── Equal weighting ────────────────────────────────────────────────── */

test("subtasks are equally weighted within a task", async ({ courseId, taskId }) => {
  for (const l of ["Lit review", "Implementation", "Evaluation", "Write-up"]) {
    await addTaskItem(db, taskId, l);
  }
  const list = await items(taskId);
  assert.equal(list.length, 4);

  approx(await percent(courseId), 0, "nothing ticked");
  await toggleTaskItem(db, list[0].id);
  approx(await percent(courseId), 25, "1 of 4");
  await toggleTaskItem(db, list[1].id);
  approx(await percent(courseId), 50, "2 of 4");
  await toggleTaskItem(db, list[2].id);
  approx(await percent(courseId), 75, "3 of 4");
  await toggleTaskItem(db, list[3].id);
  approx(await percent(courseId), 100, "4 of 4");
});

test("completing every subtask marks the task done", async ({ taskId }) => {
  assert.equal(await taskDone(taskId), true);
});

test("unticking one subtask un-completes the task", async ({ courseId, taskId }) => {
  const list = await items(taskId);
  await toggleTaskItem(db, list[0].id);
  assert.equal(await taskDone(taskId), false, "task should no longer be done");
  approx(await percent(courseId), 75, "back to 3 of 4");
});

test("adding a subtask re-weights the rest", async ({ courseId, taskId }) => {
  // 3 of 4 done = 75%. Adding a fifth makes it 3 of 5 = 60%.
  await addTaskItem(db, taskId, "Viva prep");
  approx(await percent(courseId), 60, "3 of 5");
});

test("removing a subtask re-weights the rest", async ({ courseId, taskId }) => {
  const list = await items(taskId);
  await removeTaskItem(db, list[4].id); // drop the fifth again
  approx(await percent(courseId), 75, "back to 3 of 4");
});

/* ── Edge cases around the checklist appearing and disappearing ─────── */

test("adding the first subtask to a completed task keeps it complete", async ({ courseId, taskId }) => {
  for (const i of await items(taskId)) await removeTaskItem(db, i.id);
  assert.equal((await items(taskId)).length, 0, "checklist cleared");

  // Tick the bare task, then break it down.
  if (!(await taskDone(taskId))) await setTaskDone(db, taskId);
  assert.equal(await taskDone(taskId), true);
  approx(await percent(courseId), 100, "bare task ticked");

  await addTaskItem(db, taskId, "Retro-added subtask");
  assert.equal(await taskDone(taskId), true, "must not silently un-complete");
  approx(await percent(courseId), 100, "still complete");
});

test("a second subtask added to a completed task does un-complete it", async ({ courseId, taskId }) => {
  // Only the *first* inherits completion; after that the checklist governs.
  await addTaskItem(db, taskId, "Genuinely outstanding work");
  assert.equal(await taskDone(taskId), false);
  approx(await percent(courseId), 50, "1 of 2");
});

test("removing the last subtask hands its verdict back to the task", async ({ courseId, taskId }) => {
  const list = await items(taskId);
  await removeTaskItem(db, list[1].id);  // remove the undone one
  await removeTaskItem(db, (await items(taskId))[0].id); // remove the done one
  assert.equal((await items(taskId)).length, 0);
  assert.equal(await taskDone(taskId), true, "task inherits the completed verdict");
  approx(await percent(courseId), 100, "task counts as done");
});

test("an empty label is ignored rather than creating a blank subtask", async ({ taskId }) => {
  const before = (await items(taskId)).length;
  await addTaskItem(db, taskId, "   ");
  assert.equal((await items(taskId)).length, before, "no blank subtask created");
});

test("labels are trimmed", async ({ taskId }) => {
  await addTaskItem(db, taskId, "  Padded label  ");
  const list = await items(taskId);
  assert.equal(list[list.length - 1].label, "Padded label");
});

/* ── Run ────────────────────────────────────────────────────────────── */

(async () => {
  // Clean up anything a previous interrupted run left behind.
  await db.course.deleteMany({ where: { code: SCRATCH } });

  const course = await db.course.create({
    data: {
      code: SCRATCH, name: "Scratch", shortName: "Scratch", colour: "#8A4430",
      lectureWeight: 0, labWeight: 0, assessmentWeight: 100, position: 999,
    },
  });
  const task = await db.task.create({
    data: { courseId: course.id, title: "Scratch coursework", kind: "COURSEWORK" },
  });
  const ctx: Ctx = { courseId: course.id, taskId: task.id };

  let passed = 0, failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(ctx); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
    catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
  }

  await db.course.delete({ where: { id: course.id } });
  const leftover = await db.course.count({ where: { code: SCRATCH } });
  assert.equal(leftover, 0, "scratch course removed");

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();

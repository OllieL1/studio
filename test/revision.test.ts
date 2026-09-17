/**
 * Revision mode, exercised against the real database on a throwaway course.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { setCourseRevisionMode, revisionProgress, toggleTaskItem, setTaskDone } from "../lib/tasks";
import { computeCourseProgress } from "../lib/progress";
import { REVISION_ITEM_LABEL } from "../lib/types";

const db = new PrismaClient();
const SCRATCH = "__TEST_REVISION__";

const tests: [string, (c: Ctx) => Promise<void>][] = [];
const test = (n: string, f: (c: Ctx) => Promise<void>) => tests.push([n, f]);
type Ctx = { courseId: string };

async function lectureProgress(courseId: string) {
  const c = await db.course.findUnique({
    where: { id: courseId },
    include: { tasks: { include: { items: true } } },
  });
  const p = computeCourseProgress(c!, c!.tasks);
  return p.categories.find((x) => x.category === "lecture")!;
}

const approx = (a: number, b: number, m: string) =>
  assert.ok(Math.abs(a - b) < 0.001, `${m} — expected ${b}, got ${a}`);

test("all lectures complete before revision", async ({ courseId }) => {
  const lec = await lectureProgress(courseId);
  approx(lec.ratio * 100, 100, "lectures fully done");
  assert.equal(lec.done, 4, "all 4 lectures complete");
});

test("turning revision on adds a 4th part to every lecture", async ({ courseId }) => {
  const res = await setCourseRevisionMode(db, courseId, true);
  assert.equal(res.lecturesAffected, 4);

  const items = await db.taskItem.findMany({
    where: { label: REVISION_ITEM_LABEL, task: { is: { courseId } } },
  });
  assert.equal(items.length, 4, "one Revised part per lecture");
  assert.ok(items.every((i) => i.doneAt === null), "all start unticked");
});

test("the original three parts stay ticked", async ({ courseId }) => {
  const other = await db.taskItem.findMany({
    where: { task: { is: { courseId } }, label: { not: REVISION_ITEM_LABEL } },
  });
  assert.ok(other.length > 0);
  assert.ok(other.every((i) => i.doneAt !== null), "attendance/notes history preserved");
});

test("lectures drop to 3/4, re-opening the course", async ({ courseId }) => {
  const lec = await lectureProgress(courseId);
  approx(lec.ratio * 100, 75, "3 of 4 parts");
  assert.equal(lec.done, 0, "no lecture counts as complete now");
});

test("the course is flagged as in revision", async ({ courseId }) => {
  const c = await db.course.findUnique({ where: { id: courseId } });
  assert.equal(c!.revisionMode, true);
});

test("turning it on twice changes nothing", async ({ courseId }) => {
  const res = await setCourseRevisionMode(db, courseId, true);
  assert.equal(res.lecturesAffected, 0, "idempotent");
  const items = await db.taskItem.findMany({
    where: { label: REVISION_ITEM_LABEL, task: { is: { courseId } } },
  });
  assert.equal(items.length, 4, "no duplicates");
});

test("ticking Revised closes the lecture again", async ({ courseId }) => {
  const items = await db.taskItem.findMany({
    where: { label: REVISION_ITEM_LABEL, task: { is: { courseId } } },
    orderBy: { id: "asc" },
  });
  await toggleTaskItem(db, items[0].id);

  let prog = await revisionProgress(db, courseId);
  assert.equal(prog.revised, 1);
  assert.equal(prog.total, 4);

  const lec = await lectureProgress(courseId);
  approx(lec.ratio * 100, (13 / 16) * 100, "13 of 16 parts");
  assert.equal(lec.done, 1, "one lecture fully revised");

  for (const i of items.slice(1)) await toggleTaskItem(db, i.id);
  prog = await revisionProgress(db, courseId);
  assert.equal(prog.revised, 4, "all revised");
  approx((await lectureProgress(courseId)).ratio * 100, 100, "course closed again");
});

test("turning revision off removes the parts and restores the course", async ({ courseId }) => {
  const res = await setCourseRevisionMode(db, courseId, false);
  assert.equal(res.lecturesAffected, 4);

  const items = await db.taskItem.findMany({
    where: { label: REVISION_ITEM_LABEL, task: { is: { courseId } } },
  });
  assert.equal(items.length, 0, "Revised parts removed");

  const lec = await lectureProgress(courseId);
  approx(lec.ratio * 100, 100, "back to the original 3/3");
  assert.equal(lec.done, 4);

  const c = await db.course.findUnique({ where: { id: courseId } });
  assert.equal(c!.revisionMode, false);
});

test("revision only touches lectures, not coursework", async ({ courseId }) => {
  await setCourseRevisionMode(db, courseId, true);
  const cw = await db.task.findFirst({
    where: { courseId, kind: "COURSEWORK" },
    include: { items: true },
  });
  assert.ok(cw, "coursework exists");
  assert.equal(
    cw!.items.filter((i) => i.label === REVISION_ITEM_LABEL).length,
    0,
    "coursework untouched by revision mode",
  );
  await setCourseRevisionMode(db, courseId, false);
});

(async () => {
  await db.course.deleteMany({ where: { code: SCRATCH } });
  const course = await db.course.create({
    data: {
      code: SCRATCH, name: "Scratch Revision", shortName: "Rev", colour: "#8A4430",
      lectureWeight: 100, labWeight: 0, assessmentWeight: 0, position: 998,
    },
  });

  // Four fully-completed lectures plus one piece of coursework.
  for (let i = 1; i <= 4; i++) {
    const t = await db.task.create({
      data: {
        courseId: course.id, title: `Lecture ${i}`, kind: "LECTURE",
        items: { create: ["Attendance", "Typed Notes", "Handwritten Notes"].map((label, p) => ({ label, position: p })) },
      },
    });
    await setTaskDone(db, t.id);
  }
  await db.task.create({
    data: { courseId: course.id, title: "Coursework", kind: "COURSEWORK" },
  });

  const ctx: Ctx = { courseId: course.id };
  let passed = 0, failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(ctx); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
    catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
  }

  await db.course.delete({ where: { id: course.id } });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
})();

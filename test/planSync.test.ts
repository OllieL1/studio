/**
 * Weekly schedule → Google Calendar sync, against the real database with
 * Google stubbed out. Uses a week in 2099 and a throwaway Google login, and
 * removes both. If a real Google login exists it's left alone and the
 * tests are skipped.
 */
import assert from "node:assert/strict";
process.env.GOOGLE_CLIENT_ID ||= "test-client";
process.env.GOOGLE_CLIENT_SECRET ||= "test-secret";

import { db } from "../lib/db";
import { syncPlanRange } from "../lib/planSync";

const WEEK = new Date(2099, 0, 5); // a Monday no one is planning yet
const at = (day: number, h: number) => new Date(2099, 0, 5 + day, h);

type Call = { method: string; url: string; body: { summary?: string } | null };
let calls: Call[] = [];
let offline = false;
let calendars = [{ id: "studio-cal", summary: "Studio" }, { id: "primary", summary: "Me", primary: true }];
let nextId = 1;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (offline) throw new TypeError("fetch failed");
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (url.includes("/calendarList")) return Response.json({ items: calendars });
  if (method === "DELETE") return new Response(null, { status: 204 });
  if (method === "PATCH") return Response.json({ id: url.split("/events/")[1], htmlLink: "x" });
  return Response.json({ id: `ev${nextId++}`, htmlLink: "x" });
}) as typeof fetch;

const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);
const writes = () => calls.filter((c) => c.method !== "GET");

async function reset() {
  await db.planBlock.deleteMany({ where: { startAt: { gte: WEEK, lt: new Date(2099, 0, 12) } } });
  await db.googleAuth.update({ where: { id: "singleton" }, data: { planCalendarId: null } });
  calls = [];
}

test("the first sync finds the Studio calendar and creates each block once", async () => {
  await reset();
  await db.planBlock.create({ data: { title: "Exercise 3", startAt: at(1, 9), endAt: at(1, 11) } });
  await db.planBlock.create({ data: { title: "Essay", startAt: at(2, 14), endAt: at(2, 16) } });

  const res = await syncPlanRange(WEEK, 7);
  assert.equal(res.ok, true);
  assert.deepEqual([res.created, res.updated, res.removed], [2, 0, 0]);
  assert.ok(writes().every((c) => c.method === "POST" && c.url.includes("/calendars/studio-cal/events")), "written to Studio");
  const auth = await db.googleAuth.findUniqueOrThrow({ where: { id: "singleton" } });
  assert.equal(auth.planCalendarId, "studio-cal", "the choice is remembered");

  calls = [];
  const again = await syncPlanRange(WEEK, 7);
  assert.deepEqual([again.created, again.updated, again.removed], [0, 0, 0]);
  assert.equal(writes().length, 0, "a second sync with no changes touches nothing");
});

test("a moved or renamed block is patched in place, never duplicated", async () => {
  await reset();
  const b = await db.planBlock.create({ data: { title: "Exercise 3", startAt: at(1, 9), endAt: at(1, 11) } });
  await syncPlanRange(WEEK, 7);
  const { calendarEventId } = await db.planBlock.findUniqueOrThrow({ where: { id: b.id } });

  calls = [];
  await db.planBlock.update({ where: { id: b.id }, data: { startAt: at(1, 10), endAt: at(1, 12), title: "Exercise 4" } });
  const res = await syncPlanRange(WEEK, 7);
  assert.deepEqual([res.created, res.updated], [0, 1]);
  assert.equal(writes().length, 1);
  assert.equal(writes()[0].method, "PATCH");
  assert.ok(writes()[0].url.endsWith(`/events/${calendarEventId}`));
  assert.equal(writes()[0].body?.summary, "Exercise 4");
});

test("a removed block's event is deleted, then the block is gone for good", async () => {
  await reset();
  const b = await db.planBlock.create({ data: { title: "Essay", startAt: at(2, 14), endAt: at(2, 16) } });
  await syncPlanRange(WEEK, 7);
  await db.planBlock.update({ where: { id: b.id }, data: { deletedAt: new Date() } });

  calls = [];
  const res = await syncPlanRange(WEEK, 7);
  assert.equal(res.removed, 1);
  assert.equal(writes()[0].method, "DELETE");
  assert.equal(await db.planBlock.findUnique({ where: { id: b.id } }), null);
});

test("only the range being synced is touched", async () => {
  await reset();
  await db.planBlock.create({ data: { title: "Monday", startAt: at(0, 9), endAt: at(0, 10) } });
  await db.planBlock.create({ data: { title: "Friday", startAt: at(4, 9), endAt: at(4, 10) } });
  const res = await syncPlanRange(WEEK, 3);
  assert.equal(res.created, 1);
  assert.equal(writes()[0].body?.summary, "Monday");
});

test("offline: nothing is lost, the rest goes next time", async () => {
  await reset();
  await db.planBlock.create({ data: { title: "Exercise 3", startAt: at(1, 9), endAt: at(1, 11) } });
  await db.googleAuth.update({ where: { id: "singleton" }, data: { planCalendarId: "studio-cal" } });
  offline = true;
  const res = await syncPlanRange(WEEK, 7);
  offline = false;
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /reach Google/);
  const again = await syncPlanRange(WEEK, 7);
  assert.equal(again.created, 1);
});

test("with no Studio calendar and none chosen, it says where to choose one", async () => {
  await reset();
  calendars = [{ id: "primary", summary: "Me", primary: true }];
  await db.planBlock.create({ data: { title: "Exercise 3", startAt: at(1, 9), endAt: at(1, 11) } });
  const res = await syncPlanRange(WEEK, 7);
  calendars = [{ id: "studio-cal", summary: "Studio" }, { id: "primary", summary: "Me", primary: true }];
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /Settings/);
  assert.equal(writes().length, 0);
});

(async () => {
  if (await db.googleAuth.findUnique({ where: { id: "singleton" } })) {
    console.log("  - skipped: a real Google login is connected, and these tests won't touch it\n");
    process.exit(0);
  }
  await db.googleAuth.create({
    data: { accessToken: "test", refreshToken: "test", expiresAt: new Date(Date.now() + 3_600_000), scope: "test" },
  });
  let passed = 0, failed = 0;
  try {
    for (const [name, fn] of tests) {
      try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
      catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
    }
  } finally {
    await db.planBlock.deleteMany({ where: { startAt: { gte: WEEK, lt: new Date(2099, 0, 12) } } });
    await db.googleAuth.delete({ where: { id: "singleton" } });
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();

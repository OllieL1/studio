import assert from "node:assert/strict";
import { buildDays, navKeys, dayJump } from "../lib/planView";
import type { CalendarItem } from "../lib/calendar";
import { parseEntry, resolveSlot, planRange, syncPlan, syncState, blockHash, eventSummary, fmtLength, type SyncBlock } from "../lib/plan";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const courses = [
  { id: "fp", shortName: "FP", code: "COMPSCI4021", name: "Functional Programming" },
  { id: "psi", shortName: "PSI", code: "COMPSCI4038", name: "Professional Software Issues" },
];
const hm = (h: number, m = 0) => h * 60 + m;

/* ── Parsing ── */

test("a range with a course and a title", () => {
  const p = parseEntry("FP exercise 3 9-11", courses);
  assert.equal(p.title, "exercise 3");
  assert.equal(p.courseId, "fp");
  assert.deepEqual([p.start, p.end], [hm(9), hm(11)]);
});

test("every way of writing a range", () => {
  const cases: [string, number, number][] = [
    ["x 20-21", hm(20), hm(21)],
    ["x 9 - 11", hm(9), hm(11)],
    ["x 9.30-11", hm(9, 30), hm(11)],
    ["x 9:30-11:15", hm(9, 30), hm(11, 15)],
    ["x 2-4", hm(14), hm(16)],
    ["x 2-4pm", hm(14), hm(16)],
    ["x 11-1", hm(11), hm(13)],
    ["x 12-2", hm(12), hm(14)],
    ["x 7-9", hm(19), hm(21)],
    ["x 9-11pm", hm(21), hm(23)],
    ["x 10-2pm", hm(10), hm(14)],
    ["x 9am to 1", hm(9), hm(13)],
    ["x 8–9", hm(8), hm(9)],
    ["x 22-24", hm(22), hm(24)],
  ];
  for (const [raw, s, e] of cases) {
    const p = parseEntry(raw, courses);
    assert.deepEqual([p.start, p.end, p.title], [s, e, "x"], raw);
  }
});

test("the time can sit anywhere in the line", () => {
  const p = parseEntry("20-21 PSI reading", courses);
  assert.deepEqual([p.title, p.courseId, p.start, p.end], ["reading", "psi", hm(20), hm(21)]);
});

test("single start times only in an unmistakable form", () => {
  assert.equal(parseEntry("essay 14:00", courses).start, hm(14));
  assert.equal(parseEntry("essay 3pm", courses).start, hm(15));
  assert.equal(parseEntry("essay at 4", courses).start, hm(16));
  const quiz = parseEntry("Weekly quiz 4", courses);
  assert.equal(quiz.start, null, "a bare number stays in the title");
  assert.equal(quiz.title, "Weekly quiz 4");
});

test("durations", () => {
  assert.equal(parseEntry("essay 2h", courses).duration, 120);
  assert.equal(parseEntry("essay 1.5h", courses).duration, 90);
  assert.equal(parseEntry("essay 1h30", courses).duration, 90);
  assert.equal(parseEntry("essay 45m", courses).duration, 45);
  assert.equal(parseEntry("essay 45m", courses).title, "essay");
});

test("nonsense ranges are left as text", () => {
  const p = parseEntry("x 25-26", courses);
  assert.equal(p.start, null);
  assert.equal(p.title, "x 25-26");
});

/* ── Slotting ── */

test("an untimed entry follows the one above, or ends where the one below starts", () => {
  const lecture = { start: hm(9), end: hm(11) };
  assert.deepEqual(resolveSlot({ start: null, end: null, duration: null }, lecture, "below"), { start: hm(11), end: hm(12) });
  assert.deepEqual(resolveSlot({ start: null, end: null, duration: 90 }, lecture, "below"), { start: hm(11), end: hm(12, 30) });
  assert.deepEqual(resolveSlot({ start: null, end: null, duration: null }, lecture, "above"), { start: hm(8), end: hm(9) });
  assert.deepEqual(resolveSlot({ start: null, end: null, duration: null }, null, "below"), { start: hm(9), end: hm(10) });
});

test("a typed time beats the anchor", () => {
  const lecture = { start: hm(9), end: hm(11) };
  assert.deepEqual(resolveSlot({ start: hm(14), end: null, duration: null }, lecture, "below"), { start: hm(14), end: hm(15) });
  assert.deepEqual(resolveSlot({ start: hm(14), end: null, duration: 30 }, lecture, "below"), { start: hm(14), end: hm(14, 30) });
  assert.deepEqual(resolveSlot({ start: hm(14), end: hm(16), duration: null }, lecture, "below"), { start: hm(14), end: hm(16) });
});

test("slots never run past midnight", () => {
  const late = { start: hm(22), end: hm(23, 30) };
  assert.deepEqual(resolveSlot({ start: null, end: null, duration: null }, late, "below"), { start: hm(23, 30), end: hm(24) });
});

/* ── Ranges ── */

test("ranges default to this week and recognise next week", () => {
  const now = new Date(2026, 9, 21, 15); // Wed 21 Oct
  const a = planRange({}, now);
  assert.equal(a.from.getDate(), 19);
  assert.deepEqual([a.days, a.preset], [7, "this"]);
  assert.equal(planRange({ from: "2026-10-26", days: "7" }, now).preset, "next");
  const c = planRange({ from: "2026-10-22", days: "3" }, now);
  assert.deepEqual([c.from.getDate(), c.days, c.preset], [22, 3, "custom"]);
  assert.equal(planRange({ days: "99" }, now).days, 14);
});

/* ── Sync ── */

const block = (o: Partial<SyncBlock> = {}): SyncBlock => ({
  id: "b", title: "Exercise 3", courseShort: "FP",
  startAt: new Date(2026, 9, 21, 9), endAt: new Date(2026, 9, 21, 11),
  calendarEventId: null, syncedHash: null, deletedAt: null, ...o,
});

test("the Google title carries the course once", () => {
  assert.equal(eventSummary(block()), "FP · Exercise 3");
  assert.equal(eventSummary(block({ title: "FP revision" })), "FP revision");
  assert.equal(eventSummary(block({ courseShort: null })), "Exercise 3");
});

test("sync creates the new, patches the changed, deletes the removed, leaves the rest", () => {
  const synced = block({ id: "same", calendarEventId: "g1" });
  synced.syncedHash = blockHash(synced);
  const moved = block({ id: "moved", calendarEventId: "g2", syncedHash: blockHash(block()) , startAt: new Date(2026, 9, 21, 10) });
  const renamed = block({ id: "renamed", calendarEventId: "g3", syncedHash: blockHash(block()), title: "Exercise 4" });
  const gone = block({ id: "gone", calendarEventId: "g4", syncedHash: "x", deletedAt: new Date() });
  const neverSent = block({ id: "never", deletedAt: new Date() });
  const fresh = block({ id: "fresh" });

  const ops = syncPlan([synced, moved, renamed, gone, neverSent, fresh]);
  assert.deepEqual(ops.create.map((b) => b.id), ["fresh"]);
  assert.deepEqual(ops.update.map((b) => b.id), ["moved", "renamed"]);
  assert.deepEqual(ops.remove.map((b) => b.id), ["gone"]);
  assert.equal(syncState(synced), "synced");
});

test("lengths read naturally", () => {
  assert.deepEqual([fmtLength(45), fmtLength(60), fmtLength(90)], ["45m", "1h", "1h 30m"]);
});

/* ── The days ── */

const item = (id: string, start: Date, end: Date, o: Partial<CalendarItem> = {}): CalendarItem => ({
  id, source: "class", title: id, start: start.toISOString(), end: end.toISOString(), allDay: false,
  colour: null, courseShort: null, courseId: null, href: null, blocked: false, done: false, kind: null,
  gradeWeight: null, location: null, editable: false, onGoogle: false, notes: null, ...o,
});
const d = (day: number, h: number, m = 0) => new Date(2026, 9, 19 + day, h, m);

test("each day is fixed events and blocks in time order, deadlines above", () => {
  const days = buildDays({
    from: d(0, 0), days: 3,
    fixed: [
      item("lec", d(0, 10), d(0, 12)),
      item("due", d(0, 23, 59), d(1, 0), { source: "deadline", allDay: true }),
      item("skip", d(0, 14), d(0, 15)),
    ],
    blocks: [
      { id: "late", title: "late", courseId: null, start: d(0, 20).toISOString(), end: d(0, 21).toISOString() },
      { id: "early", title: "early", courseId: null, start: d(0, 9).toISOString(), end: d(0, 10).toISOString() },
    ],
    hidden: new Set(["skip"]),
    showHidden: new Set(),
  });
  assert.deepEqual(days[0].rows.map((r) => r.key), ["b:early", "lec", "b:late"]);
  assert.deepEqual(days[0].chips.map((c) => c.item.id), ["due"]);
  assert.equal(days[0].hiddenCount, 1);
  assert.equal(days[0].plannedMinutes, 120);
  assert.equal(days[1].chips.length, 0, "a deadline stays on its own day");
  assert.deepEqual(days[1].rows.map((r) => r.type), ["empty"]);
  assert.deepEqual(navKeys(days).length, 5);
  assert.equal(dayJump(days, "lec", 1), days[1].rows[0].key);
  assert.equal(dayJump(days, days[2].rows[0].key, 1), days[2].rows[0].key, "→ on the last day stays put");
});

test("a left-off event can be shown again to put it back", () => {
  const days = buildDays({
    from: d(0, 0), days: 1, fixed: [item("skip", d(0, 14), d(0, 15))], blocks: [],
    hidden: new Set(["skip"]), showHidden: new Set(["2026-10-19"]),
  });
  const row = days[0].rows[0];
  assert.ok(row.type === "fixed" && row.hidden);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

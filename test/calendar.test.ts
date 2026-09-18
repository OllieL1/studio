/** Calendar ranges, day placement and week-view overlap layout. */
import assert from "node:assert/strict";
import {
  viewRange, shiftAnchor, daysTouched, itemsByDay, layoutDay, hourWindow, isBlocked,
  type CalendarItem,
  dietOrder,
} from "../lib/calendar";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const D = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const item = (id: string, start: Date, end: Date, extra: Partial<CalendarItem> = {}): CalendarItem => ({
  id, source: "event", title: id, start: start.toISOString(), end: end.toISOString(),
  allDay: false, colour: null, courseShort: null, href: null, blocked: false, done: false,
  kind: null, gradeWeight: null, location: null, editable: false, onGoogle: false, notes: null,
  courseId: null, ...extra,
});

/* ── Ranges ── */

test("month view is always six Monday-start weeks", () => {
  for (const month of [1, 2, 3, 8, 9, 10, 11, 12]) {
    const r = viewRange("month", D(2026, month, 15));
    assert.equal(r.days.length, 42, `month ${month}`);
    assert.equal(r.days[0].getDay(), 1, `month ${month} starts on a Monday`);
  }
});

test("month view contains the whole month", () => {
  // October 2026 starts on a Thursday.
  const r = viewRange("month", D(2026, 10, 20));
  const iso = r.days.map((d) => `${d.getMonth() + 1}-${d.getDate()}`);
  assert.ok(iso.includes("10-1") && iso.includes("10-31"));
  assert.equal(r.days[0].getDate(), 28, "starts Mon 28 Sep");
});

test("week view is Monday to Sunday", () => {
  const r = viewRange("week", D(2026, 10, 1)); // a Thursday
  assert.equal(r.days.length, 7);
  assert.equal(r.days[0].getDay(), 1);
  assert.equal(r.days[0].getDate(), 28, "Mon 28 Sep");
  assert.equal(r.days[6].getDate(), 4, "Sun 4 Oct");
});

test("paging months never skips one from a 31st", () => {
  // Naive date+1 month from 31 Jan lands in March.
  const next = shiftAnchor("month", D(2027, 1, 31), 1);
  assert.equal(next.getMonth(), 1, "February");
});

test("paging weeks moves seven days", () => {
  const next = shiftAnchor("week", D(2026, 9, 28), 1);
  assert.equal(next.getDate(), 5);
  assert.equal(next.getMonth(), 9, "October");
});

/* ── Day placement ── */

test("a timed event lands on its own day", () => {
  assert.deepEqual(daysTouched(item("a", D(2026, 10, 1, 10), D(2026, 10, 1, 11))), ["2026-10-01"]);
});

test("a one-day all-day event with exclusive end appears once", () => {
  const i = item("a", D(2026, 10, 3), D(2026, 10, 4), { allDay: true });
  assert.deepEqual(daysTouched(i), ["2026-10-03"]);
});

test("a multi-day all-day event spans each day", () => {
  const i = item("a", D(2026, 10, 3), D(2026, 10, 6), { allDay: true });
  assert.deepEqual(daysTouched(i), ["2026-10-03", "2026-10-04", "2026-10-05"]);
});

test("a timed event ending at midnight doesn't spill into tomorrow", () => {
  const i = item("a", D(2026, 10, 1, 22), D(2026, 10, 2, 0));
  assert.deepEqual(daysTouched(i), ["2026-10-01"]);
});

test("an overnight timed event touches both days", () => {
  const i = item("a", D(2026, 10, 1, 23), D(2026, 10, 2, 1));
  assert.deepEqual(daysTouched(i), ["2026-10-01", "2026-10-02"]);
});

test("a zero-length deadline still lands on its day", () => {
  const t = D(2026, 11, 20, 16, 30);
  assert.deepEqual(daysTouched(item("a", t, t)), ["2026-11-20"]);
});

test("blocked items sort to the top of a day", () => {
  const map = itemsByDay([
    item("normal", D(2026, 10, 1, 9), D(2026, 10, 1, 10)),
    item("exam", D(2026, 10, 1, 14), D(2026, 10, 1, 16), { blocked: true }),
  ]);
  assert.deepEqual(map.get("2026-10-01")!.map((i) => i.id), ["exam", "normal"]);
});

/* ── Blocking ── */

test("exams are always blocked; big coursework is; small is not", () => {
  assert.equal(isBlocked("EXAM", null), true);
  assert.equal(isBlocked("COURSEWORK", 40), true);
  assert.equal(isBlocked("COURSEWORK", 15), true, "threshold is inclusive");
  assert.equal(isBlocked("COURSEWORK", 5), false);
  assert.equal(isBlocked("COURSEWORK", null), false, "unknown weight isn't assumed big");
  assert.equal(isBlocked("LECTURE", 99), false);
});

/* ── Week layout ── */

const day = D(2026, 10, 1);

test("non-overlapping items each take the full width", () => {
  const p = layoutDay([
    item("a", D(2026, 10, 1, 9), D(2026, 10, 1, 10)),
    item("b", D(2026, 10, 1, 10), D(2026, 10, 1, 11)),
  ], day);
  assert.ok(p.every((x) => x.cols === 1 && x.col === 0), "back-to-back is not an overlap");
});

test("two overlapping items sit side by side", () => {
  const p = layoutDay([
    item("a", D(2026, 10, 1, 9), D(2026, 10, 1, 11)),
    item("b", D(2026, 10, 1, 10), D(2026, 10, 1, 12)),
  ], day);
  const a = p.find((x) => x.item.id === "a")!;
  const b = p.find((x) => x.item.id === "b")!;
  assert.equal(a.cols, 2);
  assert.equal(b.cols, 2);
  assert.notEqual(a.col, b.col);
});

test("a freed column is reused within a cluster", () => {
  // a 9–12 spans the cluster; b 9–10 ends; c 10:30–11 should reuse b's column.
  const p = layoutDay([
    item("a", D(2026, 10, 1, 9), D(2026, 10, 1, 12)),
    item("b", D(2026, 10, 1, 9), D(2026, 10, 1, 10)),
    item("c", D(2026, 10, 1, 10, 30), D(2026, 10, 1, 11)),
  ], day);
  const cols = Object.fromEntries(p.map((x) => [x.item.id, x]));
  assert.equal(cols.a.cols, 2, "only ever two at once");
  assert.equal(cols.c.col, cols.b.col, "c takes the column b vacated");
});

test("nothing is ever drawn over something else", () => {
  const items = [
    item("a", D(2026, 10, 1, 9), D(2026, 10, 1, 13)),
    item("b", D(2026, 10, 1, 9, 30), D(2026, 10, 1, 10, 30)),
    item("c", D(2026, 10, 1, 10), D(2026, 10, 1, 11)),
    item("d", D(2026, 10, 1, 12), D(2026, 10, 1, 14)),
    item("e", D(2026, 10, 1, 15), D(2026, 10, 1, 16)),
  ];
  const p = layoutDay(items, day);
  for (const x of p) {
    for (const y of p) {
      if (x === y) continue;
      const overlapsInTime = x.top < y.bottom && y.top < x.bottom;
      if (overlapsInTime) assert.notEqual(x.col, y.col, `${x.item.id} and ${y.item.id} collide`);
    }
  }
  assert.equal(p.find((x) => x.item.id === "e")!.cols, 1, "a later separate item is its own cluster");
});

test("all-day items are left out of the timed layout", () => {
  const p = layoutDay([item("a", D(2026, 10, 1), D(2026, 10, 2), { allDay: true })], day);
  assert.equal(p.length, 0);
});

test("an item from the day before is clipped to midnight", () => {
  const p = layoutDay([item("a", D(2026, 9, 30, 22), D(2026, 10, 1, 2))], day);
  assert.equal(p[0].top, 0);
  assert.equal(p[0].bottom, 120);
});

test("very short items get a clickable minimum height", () => {
  const t = D(2026, 10, 1, 9);
  const p = layoutDay([item("a", t, new Date(t.getTime() + 60000))], day, 20);
  assert.equal(p[0].bottom - p[0].top, 20);
});

/* ── Exam diets ── */

test("exam diets sort chronologically, not alphabetically", () => {
  const diets = ["April/May 2027", "December 2026", "August 2027"];
  const sorted = [...diets].sort((a, b) => dietOrder(a) - dietOrder(b));
  assert.deepEqual(sorted, ["December 2026", "April/May 2027", "August 2027"]);
});

test("an unparseable or missing diet sorts last", () => {
  const sorted = ["TBC", "December 2026", null].sort((a, b) => dietOrder(a) - dietOrder(b));
  assert.equal(sorted[0], "December 2026");
});

/* ── Hour window ── */

test("default window is 08:00–20:00", () => {
  const w = hourWindow([item("a", D(2026, 10, 1, 10), D(2026, 10, 1, 11))], [day]);
  assert.deepEqual(w, { from: 8, to: 20 });
});

test("window widens to fit an early start and a late finish", () => {
  const w = hourWindow([
    item("early", D(2026, 10, 1, 7), D(2026, 10, 1, 8)),
    item("late", D(2026, 10, 1, 20), D(2026, 10, 1, 21, 30)),
  ], [day]);
  assert.deepEqual(w, { from: 7, to: 22 });
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

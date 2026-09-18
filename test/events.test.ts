/** Uni-event time resolution — especially all-day exclusive ends. */
import assert from "node:assert/strict";
import { resolveEventTimes, hhmmToMin, inclusiveEnd } from "../lib/events";
import { daysTouched } from "../lib/calendar";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const ok = (r: ReturnType<typeof resolveEventTimes>) => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r as { ok: true; startAt: Date; endAt: Date };
};

test("a timed event resolves to local start and end", () => {
  const r = ok(resolveEventTimes({ date: "2026-10-01", startTime: "15:00", endTime: "15:30", allDay: false }));
  assert.equal(r.startAt.getHours(), 15);
  assert.equal(r.endAt.getMinutes(), 30);
  assert.equal(r.startAt.getDate(), 1, "local date, not shifted by UTC");
});

test("a one-day all-day event ends at the following midnight (exclusive)", () => {
  const r = ok(resolveEventTimes({ date: "2026-10-01", allDay: true }));
  assert.equal(r.startAt.getDate(), 1);
  assert.equal(r.endAt.getDate(), 2);
  assert.equal(r.endAt.getHours(), 0);
});

test("a one-day all-day event shows on exactly one calendar day", () => {
  const r = ok(resolveEventTimes({ date: "2026-10-01", allDay: true }));
  const days = daysTouched({ start: r.startAt.toISOString(), end: r.endAt.toISOString(), allDay: true });
  assert.deepEqual(days, ["2026-10-01"]);
});

test("a three-day all-day event spans exactly three days", () => {
  const r = ok(resolveEventTimes({ date: "2026-10-01", endDate: "2026-10-03", allDay: true }));
  const days = daysTouched({ start: r.startAt.toISOString(), end: r.endAt.toISOString(), allDay: true });
  assert.deepEqual(days, ["2026-10-01", "2026-10-02", "2026-10-03"]);
});

test("all-day across a month boundary", () => {
  const r = ok(resolveEventTimes({ date: "2026-10-31", endDate: "2026-11-01", allDay: true }));
  assert.equal(r.endAt.getMonth(), 10, "November");
  assert.equal(r.endAt.getDate(), 2);
});

test("all-day across the clocks going back (25 Oct 2026, UK)", () => {
  // A naive +24h would land at 23:00 on the 25th, and the event would lose a day.
  const r = ok(resolveEventTimes({ date: "2026-10-24", endDate: "2026-10-25", allDay: true }));
  assert.equal(r.endAt.getDate(), 26);
  assert.equal(r.endAt.getHours(), 0, "still midnight after DST ends");
});

test("inclusive end steps back a calendar day, even when clocks go forward", () => {
  // 28 Mar 2027 is a 23-hour day in the UK. An all-day event on the 28th has
  // exclusive end 29 Mar 00:00; its inclusive last day must be the 28th.
  const r = ok(resolveEventTimes({ date: "2027-03-28", allDay: true }));
  const last = inclusiveEnd(r.endAt);
  assert.equal(last.getDate(), 28, "not the 27th");

  // Demonstrate the bug this replaces.
  const naive = new Date(r.endAt.getTime() - 24 * 60 * 60 * 1000);
  if (Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/London") {
    assert.equal(naive.getDate(), 27, "subtracting 24h lands on the wrong day");
  }
});

test("inclusive end on an ordinary day", () => {
  const r = ok(resolveEventTimes({ date: "2026-10-01", endDate: "2026-10-03", allDay: true }));
  assert.equal(inclusiveEnd(r.endAt).getDate(), 3);
});

test("an end date before the start is rejected", () => {
  const r = resolveEventTimes({ date: "2026-10-05", endDate: "2026-10-01", allDay: true });
  assert.equal(r.ok, false);
});

test("an end time at or before the start is rejected", () => {
  assert.equal(resolveEventTimes({ date: "2026-10-01", startTime: "15:00", endTime: "15:00", allDay: false }).ok, false);
  assert.equal(resolveEventTimes({ date: "2026-10-01", startTime: "15:00", endTime: "14:00", allDay: false }).ok, false);
});

test("missing times on a timed event are rejected", () => {
  assert.equal(resolveEventTimes({ date: "2026-10-01", startTime: null, endTime: "15:00", allDay: false }).ok, false);
});

test("a malformed date is rejected", () => {
  assert.equal(resolveEventTimes({ date: "01/10/2026", allDay: true }).ok, false);
});

test("hhmmToMin validates its input", () => {
  assert.equal(hhmmToMin("09:30"), 570);
  assert.equal(hhmmToMin("9:30"), 570);
  assert.equal(hhmmToMin("24:00"), null);
  assert.equal(hhmmToMin("12:60"), null);
  assert.equal(hhmmToMin(""), null);
  assert.equal(hhmmToMin(null), null);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

/** Livio home's rules (lib/livio/home.ts). */
import assert from "node:assert/strict";
import { attention, careersSummary, dailyAverage, splitDay } from "../lib/livio/home";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const NOW = new Date(2026, 9, 23, 14, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const row = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2), type: "COLD_EMAIL", status: "EMAIL_SENT", company: "Co", role: null,
  deadline: null, sentAt: daysAgo(1), statusChangedAt: null, createdAt: daysAgo(30), ...over,
}) as Parameters<typeof careersSummary>[0][number];

test("careers: the stalest first, this week's deadlines soonest first, the pipeline in order", () => {
  const s = careersSummary([
    row({ company: "Monzo", sentAt: daysAgo(16) }),
    row({ company: "Revolut", sentAt: daysAgo(20), status: "WAITING" }),
    row({ company: "Skyscanner", status: "INTERVIEW" }),
    row({ type: "APPLICATION", company: "Google", status: "APPLIED", deadline: new Date(2026, 9, 29) }),
    row({ type: "APPLICATION", company: "Stripe", status: "TODO", deadline: new Date(2026, 9, 24) }),
    row({ type: "APPLICATION", company: "Far off", status: "TODO", deadline: new Date(2026, 11, 1) }),
    row({ type: "APPLICATION", company: "Missed", status: "TODO", deadline: new Date(2026, 9, 20) }),
    row({ company: "Done", status: "REJECTED", sentAt: daysAgo(40) }),
  ], NOW);
  assert.deepEqual(s.stale.map((x) => [x.company, x.days]), [["Revolut", 20], ["Monzo", 16]]);
  assert.deepEqual(s.deadlines.map((d) => d.company), ["Stripe", "Google"]);
  assert.deepEqual(s.pipeline.map((p) => `${p.label} ${p.count}`), ["To Do 3", "Email Sent 1", "Applied 1", "Waiting 1", "Interview 1"]);
  assert.equal(s.open, 7);
});

test("attention lists only what's there, worst first", () => {
  const a = attention({ overdueTodos: 0, overdueStudio: 2, stale: 1, dueSoon: 0, inbox: 3 });
  assert.deepEqual(a.map((x) => x.label), ["2 overdue in Studio", "1 cold email to chase", "3 tasks from Notion to sort"]);
  assert.ok(a[0].studio);
  assert.deepEqual(attention({ overdueTodos: 0, overdueStudio: 0, stale: 0, dueSoon: 0, inbox: 0 }), []);
});

test("the daily average leaves today out and counts the empty days", () => {
  const series = [
    { date: new Date(2026, 9, 21), minutes: 120 },
    { date: new Date(2026, 9, 22), minutes: 0 },
    { date: new Date(2026, 9, 23), minutes: 10 }, // today, still going
  ];
  assert.equal(dailyAverage(series, NOW), 60);
  assert.equal(dailyAverage([{ date: new Date(2026, 9, 23), minutes: 10 }], NOW), null);
});

test("now sits before the first thing that hasn't finished", () => {
  const at = (h: number) => new Date(2026, 9, 23, h).toISOString();
  const items = [
    { id: "c", start: at(15), end: at(16), allDay: false },
    { id: "a", start: at(9), end: at(10), allDay: false },
    { id: "b", start: at(13), end: at(15), allDay: false }, // under way at 14:00
    { id: "d", start: at(0), end: at(23), allDay: true },
  ];
  const d = splitDay(items, NOW);
  assert.deepEqual(d.timed.map((i) => i.id), ["a", "b", "c"]);
  assert.deepEqual(d.allDay.map((i) => i.id), ["d"]);
  assert.equal(d.nowAt, 1);
  assert.equal(splitDay(items, new Date(2026, 9, 23, 22)).nowAt, 3);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

/** Location analytics: grouping, focus weighting, and unknown handling. */
import assert from "node:assert/strict";
import { byLocation, type StatSession } from "../lib/stats";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const session = (over: Partial<StatSession>): StatSession => ({
  id: Math.random().toString(36).slice(2),
  name: "s",
  startedAt: new Date(2026, 8, 21, 10, 0),
  endedAt: new Date(2026, 8, 21, 11, 0),
  minutes: 60,
  rawMinutes: 60,
  focus: 70,
  courses: [],
  tasks: [],
  ...over,
});

test("groups by location and ranks by time", () => {
  const r = byLocation([
    session({ location: "library", minutes: 120 }),
    session({ location: "flat", minutes: 30 }),
    session({ location: "library", minutes: 60 }),
  ]);
  assert.deepEqual(r.rows.map((x) => x.key), ["library", "flat"]);
  assert.equal(r.rows[0].minutes, 180);
  assert.equal(r.rows[0].sessions, 2);
  assert.equal(r.rows[0].avgSession, 90);
  assert.equal(r.totalKnownMinutes, 210);
});

test("every Other place is one bucket", () => {
  const r = byLocation([
    session({ location: "other", locationNote: "Train", minutes: 30 }),
    session({ location: "other", locationNote: "Mum's", minutes: 30 }),
  ]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].minutes, 60);
});

test("sessions without a location are reported, not folded in", () => {
  const r = byLocation([
    session({ location: "campus", minutes: 60 }),
    session({ location: null, minutes: 45 }),
    session({ location: "nonsense", minutes: 15 }),
  ]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.totalKnownMinutes, 60);
  assert.equal(r.unknownMinutes, 60);
  assert.equal(r.unknownSessions, 2);
  assert.equal(r.rows[0].share, 1);
});

test("focus is weighted by minutes, not by session count", () => {
  const r = byLocation([
    session({ location: "coffee", minutes: 180, focus: 90 }),
    session({ location: "coffee", minutes: 20, focus: 40 }),
  ]);
  assert.ok(Math.abs(r.rows[0].focus! - 85) < 0.01, `got ${r.rows[0].focus}`);
});

test("best focus ignores places with barely any time", () => {
  const r = byLocation([
    session({ location: "library", minutes: 300, focus: 80 }),
    session({ location: "home", minutes: 20, focus: 100 }),
  ]);
  assert.equal(r.bestFocus?.key, "library");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

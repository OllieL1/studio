/** Tests for session time apportionment. */
import assert from "node:assert/strict";
import { distributeMinutes, evenSplit, resolveSplit } from "../lib/split";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test("an even split of a divisible total", () => {
  assert.deepEqual(evenSplit(60, 2), [30, 30]);
  assert.deepEqual(evenSplit(90, 3), [30, 30, 30]);
});

test("an even split never loses the remainder", () => {
  assert.deepEqual(evenSplit(50, 3), [17, 17, 16]);
  assert.equal(sum(evenSplit(50, 3)), 50);
  assert.deepEqual(evenSplit(49, 2), [25, 24]);
});

test("proportional split by percentage", () => {
  assert.deepEqual(distributeMinutes(100, [75, 25]), [75, 25]);
  assert.deepEqual(distributeMinutes(120, [50, 50]), [60, 60]);
});

test("percentages need not sum to 100 — only the ratio matters", () => {
  assert.deepEqual(distributeMinutes(100, [3, 1]), [75, 25]);
  assert.deepEqual(distributeMinutes(60, [2, 2, 2]), [20, 20, 20]);
});

test("explicit minutes that overshoot are scaled back to the total", () => {
  // Asked for 90+90 in a 120m session → scaled to 60/60.
  assert.deepEqual(distributeMinutes(120, [90, 90]), [60, 60]);
  assert.equal(sum(distributeMinutes(120, [90, 90])), 120);
});

test("largest-remainder keeps the sum exact where naive rounding would not", () => {
  // 100/3 = 33.33 each; naive round → 33+33+33 = 99, losing a minute.
  const r = distributeMinutes(100, [1, 1, 1]);
  assert.equal(sum(r), 100);
  assert.deepEqual(r, [34, 33, 33]);
});

test("the sum is exact across many awkward cases", () => {
  for (const total of [0, 1, 7, 49, 50, 97, 121, 1439]) {
    for (const weights of [[1, 1], [1, 2], [3, 1, 1], [5, 3, 2, 1], [1, 1, 1, 1, 1, 1, 1]]) {
      const r = distributeMinutes(total, weights);
      assert.equal(sum(r), total, `total ${total} weights ${weights} → ${r}`);
      assert.ok(r.every((v) => v >= 0 && Number.isInteger(v)), "whole, non-negative minutes");
    }
  }
});

test("a zero-minute session splits to zeros, not NaN", () => {
  const r = distributeMinutes(0, [70, 30]);
  assert.deepEqual(r, [0, 0]);
});

test("all-zero weights fall back to an even split rather than losing time", () => {
  const r = distributeMinutes(60, [0, 0]);
  assert.equal(sum(r), 60);
  assert.deepEqual(r, [30, 30]);
});

test("negative or non-finite weights are treated as zero", () => {
  const r = distributeMinutes(60, [30, -10, NaN]);
  assert.equal(sum(r), 60);
  assert.equal(r[0], 60, "the only valid weight takes everything");
});

test("a single subject takes the whole session", () => {
  assert.deepEqual(distributeMinutes(83, [1]), [83]);
  assert.deepEqual(evenSplit(83, 1), [83]);
});

test("no subjects yields no slices", () => {
  assert.deepEqual(distributeMinutes(60, []), []);
  assert.deepEqual(evenSplit(60, 0), []);
});

test("resolveSplit ignores weights in equal mode", () => {
  assert.deepEqual(resolveSplit("equal", 60, [99, 1]), [30, 30]);
});

test("resolveSplit honours weights in percent and minutes mode", () => {
  assert.deepEqual(resolveSplit("percent", 60, [75, 25]), [45, 15]);
  assert.deepEqual(resolveSplit("minutes", 60, [45, 15]), [45, 15]);
});

test("a fractional total is rounded before splitting", () => {
  const r = distributeMinutes(60.6, [1, 1]);
  assert.equal(sum(r), 61);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

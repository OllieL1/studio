/** Line diffs: Myers against a brute-force LCS, hunks, stats, word marking. */
import assert from "node:assert/strict";
import { diffLines, diffSeq, diffStats, splitLines, toHunks, wordSegments } from "../lib/diff";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

/** Length of the longest common subsequence, the slow obvious way. */
function lcs<T>(a: T[], b: T[]): number {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
  }
  return t[a.length][b.length];
}

let seed = 7;
const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };

test("the edit script rebuilds both sides, and is the shortest there is", () => {
  for (let round = 0; round < 400; round++) {
    const a = Array.from({ length: rand(12) }, () => "abcd"[rand(4)]);
    const b = Array.from({ length: rand(12) }, () => "abcd"[rand(4)]);
    const steps = diffSeq(a, b);
    assert.deepEqual(steps.filter((s) => s.op !== "add").map((s) => a[s.a]), a);
    assert.deepEqual(steps.filter((s) => s.op !== "del").map((s) => b[s.b]), b);
    for (const s of steps) if (s.op === "eq") assert.equal(a[s.a], b[s.b]);
    assert.equal(steps.filter((s) => s.op === "eq").length, lcs(a, b), `${a.join("")} → ${b.join("")}`);
  }
});

test("empty sides", () => {
  assert.deepEqual(diffSeq([], []), []);
  assert.deepEqual(diffSeq(["x"], []).map((s) => s.op), ["del"]);
  assert.deepEqual(diffSeq([], ["x", "y"]).map((s) => s.op), ["add", "add"]);
});

test("a trailing newline ends a line rather than starting one", () => {
  assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
  assert.deepEqual(splitLines("a\nb"), ["a", "b"]);
  assert.deepEqual(splitLines(""), []);
  assert.deepEqual(splitLines("\n"), [""]);
});

test("lines are numbered on each side, and counted", () => {
  const lines = diffLines("one\ntwo\nthree\n", "one\n2\nthree\nfour\n");
  assert.deepEqual(lines.map((l) => [l.op, l.oldNo, l.newNo]), [
    ["eq", 1, 1], ["del", 2, null], ["add", null, 2], ["eq", 3, 3], ["add", null, 4],
  ]);
  assert.deepEqual(diffStats(lines), { added: 2, removed: 1 });
});

test("an edited line marks just the words that changed", () => {
  const seg = wordSegments("Use small commits always", "Use tiny commits always");
  assert.deepEqual(seg.old, [{ text: "Use ", changed: false }, { text: "small", changed: true }, { text: " commits always", changed: false }]);
  assert.deepEqual(seg.new.filter((s) => s.changed).map((s) => s.text), ["tiny"]);
  const [del, add] = diffLines("Use small commits always", "Use tiny commits always");
  assert.ok(del.segments && add.segments);
});

test("a line rewritten from scratch isn't word-marked", () => {
  const [del, add] = diffLines("completely different words here", "nothing alike at all");
  assert.equal(del.segments, undefined);
  assert.equal(add.segments, undefined);
});

test("hunks carry three lines of context and git's @@ numbers", () => {
  const before = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join("\n");
  const after = before.replace("l5", "L5").replace("l17", "L17");
  const hunks = toHunks(diffLines(before, after));
  assert.equal(hunks.length, 2);
  assert.deepEqual([hunks[0].oldStart, hunks[0].oldLines, hunks[0].newStart, hunks[0].newLines], [2, 7, 2, 7]);
  assert.equal(hunks[0].lines[0].text, "l2");
  assert.deepEqual([hunks[1].oldStart, hunks[1].oldLines], [14, 7]);
});

test("nearby changes share one hunk", () => {
  const before = Array.from({ length: 12 }, (_, i) => `l${i}`).join("\n");
  const after = before.replace("l3", "x").replace("l8", "y");
  assert.equal(toHunks(diffLines(before, after)).length, 1);
});

test("no changes, no hunks; a new file is one all-green hunk", () => {
  assert.deepEqual(toHunks(diffLines("same\n", "same\n")), []);
  const [h] = toHunks(diffLines("", "# New\n\nbody\n"));
  assert.deepEqual([h.oldStart, h.oldLines, h.newStart, h.newLines], [0, 0, 1, 3]);
  assert.ok(h.lines.every((l) => l.op === "add"));
});

test("a long doc diffs quickly", () => {
  const before = Array.from({ length: 4000 }, (_, i) => `line ${i} ${i % 7}`).join("\n");
  const after = before.split("\n").map((l, i) => (i % 97 === 0 ? `${l} edited` : l)).join("\n");
  const t = performance.now();
  const lines = diffLines(before, after);
  assert.ok(performance.now() - t < 200, `${performance.now() - t}ms`);
  assert.equal(diffStats(lines).added, Math.ceil(4000 / 97));
});

test("a total rewrite of a huge doc falls back to all-out, all-in", () => {
  const before = Array.from({ length: 3000 }, (_, i) => `old ${i}`).join("\n");
  const after = Array.from({ length: 3000 }, (_, i) => `new ${i}`).join("\n");
  const t = performance.now();
  const stats = diffStats(diffLines(before, after));
  assert.deepEqual(stats, { added: 3000, removed: 3000 });
  assert.ok(performance.now() - t < 1500, `${performance.now() - t}ms`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

/** The enhancement queue: lib/enhancements.ts and scripts/queue/lib.mjs. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { movedPosition, nextKind, parseEnhancement, prefixKind, withAnswer } from "../lib/enhancements.ts";
// @ts-expect-error - plain .mjs, no types
import { applyResolutions, formatQueue, readQueue, readResolutions, recordResolution } from "../scripts/queue/lib.mjs";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

test("a prefix sets the kind; first line is the title, the rest the body", () => {
  assert.deepEqual(parseEnhancement("bug: timer jumps\nafter sleep\n\non the ThinkPad"), {
    kind: "bug", title: "timer jumps", body: "after sleep\n\non the ThinkPad",
  });
  assert.equal(parseEnhancement("Feat:dark mode for PDFs").kind, "feature");
  assert.equal(parseEnhancement("TWEAK : wider margins").title, "wider margins");
  // No prefix: the chip's kind, and the text untouched.
  assert.deepEqual(parseEnhancement("debug: overlay", "tweak"), { kind: "tweak", title: "debug: overlay", body: "" });
  assert.equal(prefixKind("bug: x"), "bug");
  assert.equal(prefixKind("bugs are bad"), null);
});

test("a long first line is split, never cut: every word survives", () => {
  const long = "Allow the creation of a focus mode. This is where I am studying and I want to go into ultra focus mode. Studio becomes ultra minimal and only gives me access to the task I have picked i.e. only the project page, or only a course page with its lecture. Upon selection of the task, I select an amount of time that I want to be in the ultra focus mode.";
  const r = parseEnhancement(`feat: ${long}\nAnd a second line.`);
  assert.equal(r.title, "Allow the creation of a focus mode.");
  assert.ok(r.body.startsWith("This is where I am studying"));
  assert.ok(r.body.includes("an amount of time that I want to be in the ultra focus mode."));
  assert.ok(r.body.endsWith("And a second line."));
  assert.equal(r.title.length + 1 + r.body.length - "\n\nAnd a second line.".length, long.length);

  // No early sentence break: the title is a word-boundary cut with "…",
  // and the body carries the whole line so it reads as written.
  const run = "word ".repeat(80).trim();
  const r2 = parseEnhancement(run);
  assert.ok(r2.title.endsWith("…") && r2.title.length <= 161);
  assert.equal(r2.body, run);

  // Short lines are untouched.
  assert.deepEqual(parseEnhancement("Short. Two sentences."), { kind: "feature", title: "Short. Two sentences.", body: "" });
});

test("Tab cycles kinds both ways", () => {
  assert.equal(nextKind("bug"), "feature");
  assert.equal(nextKind("tweak"), "bug");
  assert.equal(nextKind("bug", true), "tweak");
});

test("moving goes halfway between the new neighbours, and stops at the ends", () => {
  const rows = [{ id: "a", position: 1 }, { id: "b", position: 2 }, { id: "c", position: 3 }];
  assert.equal(movedPosition(rows, "c", -1), 1.5);
  assert.equal(movedPosition(rows, "b", -1), 0);
  assert.equal(movedPosition(rows, "a", 1), 2.5);
  assert.equal(movedPosition(rows, "a", -1), null);
  assert.equal(movedPosition(rows, "c", 1), null);
});

test("an answer travels with the item, under the question it answers", () => {
  assert.equal(withAnswer("Slow render", "Which machine?", "ThinkPad, Edge"), "Slow render\n\n**Claude asked:** Which machine?\n\n**Answer:** ThinkPad, Edge");
  assert.equal(withAnswer("", null, "yes"), "**Answer:** yes");
});

/* ── The repo side: reading, recording, and applying at deploy ───────── */

const migration = readFileSync(new URL("../prisma/migrations/20261106120000_enhancements/migration.sql", import.meta.url), "utf8");
const freshDb = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  const add = db.prepare(`INSERT INTO Enhancement (id, number, kind, title, body, app, path, status, position, createdAt, updatedAt)
                          VALUES (?, ?, ?, ?, '', 'studio', '/lectures', ?, ?, 0, 0)`);
  add.run("e1", 1, "bug", "Timer jumps", "queued", 2);
  add.run("e2", 2, "feature", "Dark PDFs", "queued", 1);
  add.run("e3", 3, "tweak", "Old", "done", 0);
  add.run("e4", 4, "bug", "Slow", "question", 3);
  return db;
};

test("the queue reads top-down, questions after, closed ones left out", () => {
  const rows = readQueue(freshDb());
  assert.deepEqual(rows.map((r: { number: number }) => r.number), [2, 1, 4]);
  const md = formatQueue(rows, "test");
  assert.match(md, /2 queued, 1 waiting/);
  assert.ok(md.indexOf("#2 [feature]") < md.indexOf("#1 [bug]"));
});

test("resolutions are recorded one per item, latest wins", () => {
  const file = join(mkdtempSync(join(tmpdir(), "queue-")), "resolved.json");
  recordResolution(file, { id: "e1", number: 1, title: "Timer jumps", status: "question", note: "Which machine?", at: "2026-11-06T10:00:00.000Z" });
  recordResolution(file, { id: "e1", number: 1, title: "Timer jumps", status: "done", note: "Fixed", at: "2026-11-06T11:00:00.000Z" });
  const all = readResolutions(file);
  assert.equal(all.length, 1);
  assert.equal(all[0].status, "done");
  assert.throws(() => recordResolution(file, { id: "e2", number: 2, title: "x", status: "queued", note: "n" }));
  assert.throws(() => recordResolution(file, { id: "e2", number: 2, title: "x", status: "done", note: " " }));
});

test("deploy applies each resolution once, and never undoes an answered question", () => {
  const db = freshDb();
  const at = "2026-11-06T10:00:00.000Z";
  const entries = [
    { id: "e1", number: 1, title: "Timer jumps", status: "done", note: "Fixed it", at },
    { id: "e4", number: 4, title: "Slow", status: "question", note: "Which machine?", at },
    { id: "gone", number: 9, title: "From dev.db", status: "done", note: "n", at },
  ];
  const applied = applyResolutions(db, entries, (id: string) => (id === "e1" ? "abc1234" : null));
  assert.deepEqual(applied.map((e: { id: string }) => e.id), ["e1", "e4"]);
  const e1 = db.prepare(`SELECT status, resolution, "commit", resolvedAt FROM Enhancement WHERE id = 'e1'`).get() as Record<string, unknown>;
  assert.deepEqual({ ...e1 }, { status: "done", resolution: "Fixed it", commit: "abc1234", resolvedAt: Date.parse(at) });

  // Running it again changes nothing.
  assert.equal(applyResolutions(db, entries).length, 0);

  // Answered in the app and re-queued: the same question isn't re-applied...
  db.exec(`UPDATE Enhancement SET status = 'queued', resolution = NULL WHERE id = 'e4'`);
  assert.equal(applyResolutions(db, entries).length, 0);
  assert.equal((db.prepare(`SELECT status FROM Enhancement WHERE id = 'e4'`).get() as { status: string }).status, "queued");

  // ...but Claude's next, newer resolution is.
  const later = [{ ...entries[1], status: "done", note: "Fixed on the ThinkPad", at: "2026-11-07T09:00:00.000Z" }];
  assert.equal(applyResolutions(db, later).length, 1);
});

test("a database from before the queue is left alone", () => {
  assert.deepEqual(applyResolutions(new DatabaseSync(":memory:"), [{ id: "x", at: "2026-01-01" }]), []);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

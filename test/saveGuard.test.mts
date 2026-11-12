/** Saving without overwriting newer work: a stale editor's save is refused, not written. */
import assert from "node:assert/strict";
import { CONFLICT, createSaver, isConflict, storedTaskNotes } from "../lib/editor/saveGuard.ts";

const tests: [string, () => Promise<void> | void][] = [];
const test = (n: string, f: () => Promise<void> | void) => tests.push([n, f]);

/** A note in the database, written only when the save expects what's there - as updateNote does. */
const store = (body: string) => {
  const db = { body, writes: 0 };
  const send = async (text: string, expected: string) => {
    if (db.body !== expected) return CONFLICT;
    db.body = text;
    db.writes++;
    return { ok: true };
  };
  return { db, send };
};

test("saves go through while nothing else has written", async () => {
  const { db, send } = store("");
  const s = createSaver("", send);
  assert.equal(await s.save("### Essay"), "saved");
  assert.equal(await s.save("### Essay\n\n> quote"), "saved");
  assert.equal(db.body, "### Essay\n\n> quote");
});

test("an unchanged text isn't sent", async () => {
  const { db, send } = store("a");
  const s = createSaver("a", send);
  assert.equal(await s.save("a"), "unchanged");
  assert.equal(db.writes, 0);
});

test("12 Nov: a page restored by Back with an old copy can't save over the newer note", async () => {
  const { db, send } = store("### Essay #1\n\n>");
  const restored = createSaver("### Essay #1\n\n>\n\n", send); // loaded at 11:27
  const live = createSaver("### Essay #1\n\n>", send);
  await live.save("### Essay #1\n\n> How should we…\n\n**Ethical Section**\n\n- strong");
  const kept = db.body;

  // The stale page's first blur.
  assert.equal(await restored.save("### Essay #1\n\n>"), "conflict");
  assert.equal(db.body, kept);
  // And it stays stopped, whatever is typed next.
  assert.equal(await restored.save("### Essay #1\n\n>\n\ntest"), "stopped");
  assert.equal(db.body, kept);
  assert.equal(restored.stopped, true);
  // Still "unsaved", so the tab warns before closing.
  assert.equal(restored.stored, "### Essay #1\n\n>\n\n");
});

test("two tabs: the second to save is refused", async () => {
  const { db, send } = store("base");
  const a = createSaver("base", send);
  const b = createSaver("base", send);
  assert.equal(await a.save("from a"), "saved");
  assert.equal(await b.save("from b"), "conflict");
  assert.equal(db.body, "from a");
});

test("a save that throws is retried with the same expectation", async () => {
  let fail = true;
  const { db, send } = store("x");
  const s = createSaver("x", async (t, e) => {
    if (fail) throw new Error("offline");
    return send(t, e);
  });
  await assert.rejects(s.save("y"));
  assert.equal(s.stored, "x");
  fail = false;
  assert.equal(await s.save("y"), "saved");
  assert.equal(db.body, "y");
});

test("saves queued behind each other chain their expectations", async () => {
  const { db, send } = store("0");
  const s = createSaver("0", send);
  // Fired without waiting, as the debounce and a blur can - Next runs them in order.
  const [one, two] = [s.save("1"), s.save("2")];
  assert.deepEqual(await Promise.all([one, two]), ["saved", "saved"]);
  assert.equal(db.body, "2");
});

test("a stale page reset to what's stored saves against that", async () => {
  const { db, send } = store("newer");
  const s = createSaver("older", send);
  s.rebase("newer");
  assert.equal(await s.save("newer, then more"), "saved");
  assert.equal(db.body, "newer, then more");
});

test("rebasing can't restart a stopped editor", async () => {
  const { send } = store("newer");
  const s = createSaver("older", send);
  assert.equal(await s.save("older + typing"), "conflict");
  s.rebase("newer");
  assert.equal(await s.save("anything"), "stopped");
});

test("what counts as a conflict", () => {
  assert.equal(isConflict(CONFLICT), true);
  assert.equal(isConflict({ ok: true }), false);
  assert.equal(isConflict(undefined), false);
});

test("empty task notes are stored as null", () => {
  assert.equal(storedTaskNotes("  \n"), null);
  assert.equal(storedTaskNotes("# Notes"), "# Notes");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

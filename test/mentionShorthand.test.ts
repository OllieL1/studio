/** The active block's `@[Label]` stand-in for a mention - compacting,
 *  expanding, inserting and atomically deleting one. */
import assert from "node:assert/strict";
import { serializeMention } from "../lib/mentions";
import {
  compactMentions, deleteShorthandBefore, expandMentions, insertMentionShorthand, mentionIndexAt,
} from "../lib/editor/mentionShorthand";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const lora = serializeMention("paper", "hu2021lora", "LoRA");
const peft = serializeMention("tag", "peft", "peft");

test("compacting replaces a mention with its label in brackets", () => {
  const { text, tokens } = compactMentions(`See ${lora} for details.`);
  assert.equal(text, "See @[LoRA] for details.");
  assert.deepEqual(tokens, [lora]);
});

test("expanding restores the exact original text", () => {
  const md = `See ${lora} and ${peft} together.`;
  const { text, tokens } = compactMentions(md);
  assert.equal(expandMentions(text, tokens), md);
});

test("plain text with no mentions round-trips untouched", () => {
  const { text, tokens } = compactMentions("Just a normal paragraph.");
  assert.equal(text, "Just a normal paragraph.");
  assert.deepEqual(tokens, []);
  assert.equal(expandMentions(text, tokens), "Just a normal paragraph.");
});

test("two mentions sharing a label expand back to their own tokens", () => {
  const a = serializeMention("task", "task-a", "Fix bug");
  const b = serializeMention("task", "task-b", "Fix bug");
  const md = `${a} then ${b}`;
  const { text, tokens } = compactMentions(md);
  assert.equal(text, "@[Fix bug] then @[Fix bug]");
  assert.equal(expandMentions(text, tokens), md);
});

test("mentionIndexAt counts shorthand mentions before a position", () => {
  const text = "@[LoRA] and @[peft] and ";
  assert.equal(mentionIndexAt(text, 0), 0);
  assert.equal(mentionIndexAt(text, text.indexOf("and")), 1);
  assert.equal(mentionIndexAt(text, text.length), 2);
});

test("inserting a mention replaces the typed query and records its token", () => {
  // "See @lora" with the query "@lora" spanning 4..9, caret at the end.
  const r = insertMentionShorthand("See @lora", 4, 9, [], lora, "LoRA");
  assert.equal(r.text, "See @[LoRA] ");
  assert.equal(r.caret, 12);
  assert.deepEqual(r.tokens, [lora]);
});

test("inserting a second mention slots its token in at the right position", () => {
  const r = insertMentionShorthand("@[LoRA]  ", 8, 8, [lora], peft, "peft");
  assert.deepEqual(r.tokens, [lora, peft]);
});

test("inserting a mention before an existing one slots in ahead of it", () => {
  const text = "before @[LoRA]";
  const r = insertMentionShorthand(text, 0, 0, [lora], peft, "peft");
  assert.deepEqual(r.tokens, [peft, lora]);
  assert.equal(r.text, "@[peft] before @[LoRA]");
});

test("backspace right after a mention removes it whole", () => {
  // Only the token itself goes - same as deleting any other word leaves the
  // spaces either side of it exactly where they were.
  const r = deleteShorthandBefore("See @[LoRA] now", 11, [lora]);
  assert.ok(r);
  assert.equal(r!.text, "See  now");
  assert.equal(r!.caret, 4);
  assert.deepEqual(r!.tokens, []);
});

test("backspace elsewhere finds no mention to delete", () => {
  assert.equal(deleteShorthandBefore("See @[LoRA] now", 15, [lora]), null);
  assert.equal(deleteShorthandBefore("plain text", 5, []), null);
});

test("deleting a mention that isn't the last removes only its own token", () => {
  const text = "@[LoRA] and @[peft]";
  const at = text.indexOf(" and");
  const r = deleteShorthandBefore(text, at, [lora, peft]);
  assert.ok(r);
  assert.equal(r!.text, " and @[peft]");
  assert.deepEqual(r!.tokens, [peft]);
});

test("a mangled mention with no matching token is left as plain text", () => {
  // Simulates a selection that partially destroyed a later mention, leaving
  // the tokens list one entry longer than the surviving `@[...]` runs.
  assert.equal(expandMentions("@[LoRA]", [lora, peft]), lora);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

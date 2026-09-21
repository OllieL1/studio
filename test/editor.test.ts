/** The live editor's block model: splitting, joining, typing helpers, inserts. */
import assert from "node:assert/strict";
import {
  applyInsert, caretLine, classify, filterInserts, INSERTS,
  joinBlocks, listContinuation, sourceOffset, splitBlocks,
} from "../lib/editor/blocks";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const kinds = (md: string) => splitBlocks(md).map((b) => b.kind);
const texts = (md: string) => splitBlocks(md).map((b) => b.text);

test("splits paragraphs on blank lines", () => {
  assert.deepEqual(texts("one\n\ntwo"), ["one", "two"]);
  assert.deepEqual(kinds("one\n\ntwo"), ["paragraph", "paragraph"]);
});

test("a heading is its own block", () => {
  assert.deepEqual(texts("# Title\nbody text"), ["# Title", "body text"]);
  assert.deepEqual(kinds("# Title\nbody text"), ["heading", "paragraph"]);
});

test("a list stays one block, so it renders as one list", () => {
  const md = "- one\n- two\n  - nested\n- three";
  assert.equal(splitBlocks(md).length, 1);
  assert.equal(splitBlocks(md)[0].kind, "list");
});

test("fenced code keeps its blank lines and its fences", () => {
  const md = "before\n\n```py\nx = 1\n\ny = 2\n```\n\nafter";
  const b = splitBlocks(md);
  assert.deepEqual(b.map((x) => x.kind), ["paragraph", "code", "paragraph"]);
  assert.equal(b[1].text, "```py\nx = 1\n\ny = 2\n```");
});

test("an unclosed fence still ends the document cleanly", () => {
  const b = splitBlocks("```\nnever closed");
  assert.equal(b.length, 1);
  assert.equal(b[0].kind, "code");
});

test("a table is one block", () => {
  const md = "| a | b |\n| --- | --- |\n| 1 | 2 |";
  assert.equal(splitBlocks(md).length, 1);
  assert.equal(splitBlocks(md)[0].kind, "table");
});

test("quotes group, rules stand alone", () => {
  assert.deepEqual(kinds("> one\n> two\n\n---\n\nend"), ["quote", "rule", "paragraph"]);
});

test("a list directly after a paragraph is a separate block", () => {
  assert.deepEqual(kinds("intro text\n- one\n- two"), ["paragraph", "list"]);
});

test("round-trips ordinary notes unchanged", () => {
  const md = [
    "# Lecture 1", "", "Intro paragraph with **bold**.", "", "## Section", "",
    "- one", "- two", "", "```js", "const x = 1;", "```", "", "| a | b |", "| --- | --- |", "| 1 | 2 |",
    "", "> quoted", "", "---", "", "Closing line.",
  ].join("\n");
  assert.equal(joinBlocks(splitBlocks(md)), md);
});

test("empty input still gives one editable block", () => {
  const b = splitBlocks("");
  assert.equal(b.length, 1);
  assert.equal(b[0].text, "");
});

test("classify recognises each kind", () => {
  assert.equal(classify("## x"), "heading");
  assert.equal(classify("1. x"), "list");
  assert.equal(classify("* x"), "list");
  assert.equal(classify("> x"), "quote");
  assert.equal(classify("***"), "rule");
  assert.equal(classify("~~~"), "code");
  assert.equal(classify("plain"), "paragraph");
});

test("Enter continues a bullet list", () => {
  const text = "- one";
  const r = listContinuation(text, text.length);
  assert.deepEqual(r, { insert: "\n- " });
});

test("Enter increments a numbered list", () => {
  const text = "1. one\n2. two";
  const r = listContinuation(text, text.length);
  assert.deepEqual(r, { insert: "\n3. " });
});

test("Enter on an empty item leaves the list", () => {
  const text = "- one\n- ";
  const r = listContinuation(text, text.length);
  assert.ok(r && "exit" in r);
  assert.equal((r as { text: string }).text, "- one\n");
});

test("Enter continues a checklist as a checklist", () => {
  const text = "- [ ] one";
  assert.deepEqual(listContinuation(text, text.length), { insert: "\n- [ ] " });
});

test("Enter outside a list does nothing special", () => {
  assert.equal(listContinuation("plain text", 5), null);
});

test("caretLine locates the caret", () => {
  const text = "one\ntwo\nthree";
  assert.deepEqual(caretLine(text, 0), { line: 0, lines: 3, column: 0 });
  assert.deepEqual(caretLine(text, 5), { line: 1, lines: 3, column: 1 });
});

test("the insert menu filters by label and by keyword", () => {
  assert.equal(filterInserts("tab")[0].key, "table");
  assert.equal(filterInserts("todo")[0].key, "todo");
  assert.equal(filterInserts("")?.length, INSERTS.length);
  assert.deepEqual(filterInserts("zzzz"), []);
});

test("applying an insert replaces the trigger and places the caret", () => {
  // "text [tab" with the menu open from index 5.
  const r = applyInsert("text [tab", 5, 9, INSERTS.find((i) => i.key === "h2")!);
  assert.equal(r.text, "text ## ");
  assert.equal(r.caret, 8);
});

test("a multi-line insert puts the caret inside it", () => {
  const code = INSERTS.find((i) => i.key === "code")!;
  const r = applyInsert("[", 0, 1, code);
  assert.equal(r.text, "```\n\n```");
  assert.equal(r.caret, 4);
});

test("clicking in rendered text maps back into the markdown", () => {
  // "Hello world" rendered from "**Hello** world": clicking before "world"
  // (visible offset 6) should land after the bold markers.
  const md = "**Hello** world";
  assert.equal(md.slice(sourceOffset(md, 6)).startsWith("world"), true);
});

test("heading and list markers don't count as visible text", () => {
  // Visible text is "Title" and "item"; the markers are skipped.
  assert.ok("## Title".slice(sourceOffset("## Title", 1)).startsWith("itle"));
  assert.ok("- item".slice(sourceOffset("- item", 3)).startsWith("m"));
});

test("a link's url is skipped but its label is not", () => {
  // Visible text is "see the paper now" - 14 characters puts us at " now".
  const md = "see [the paper](https://example.com) now";
  assert.ok(md.slice(sourceOffset(md, 14)).trimStart().startsWith("now"));
  // And a click inside the label lands inside the label, not the url.
  assert.ok(md.slice(sourceOffset(md, 8)).startsWith("paper"));
});

test("display maths is its own block, kept whole", () => {
  const md = "Before\n\n$$\n\\int_0^1 x^2 dx\n$$\n\nAfter";
  const b = splitBlocks(md);
  assert.deepEqual(b.map((x) => x.kind), ["paragraph", "math", "paragraph"]);
  assert.equal(b[1].text, "$$\n\\int_0^1 x^2 dx\n$$");
  assert.equal(joinBlocks(b), md);
});

test("single-line maths closes itself", () => {
  const b = splitBlocks("$$x^2$$\n\nnext");
  assert.deepEqual(b.map((x) => x.kind), ["math", "paragraph"]);
});

test("inline maths stays inside its paragraph", () => {
  const b = splitBlocks("Cost is $O(n)$ per step.");
  assert.equal(b.length, 1);
  assert.equal(b[0].kind, "paragraph");
});

test("the menu offers equations", () => {
  assert.equal(filterInserts("equation")[0].key, "math");
  assert.equal(filterInserts("latex").length >= 2, true);
});

test("block-level inserts are flagged, inline ones are not", () => {
  const byKey = Object.fromEntries(INSERTS.map((i) => [i.key, i]));
  for (const k of ["table", "code", "math", "quote", "rule", "bullet", "h2"]) {
    assert.equal(byKey[k].block, true, `${k} should start its own block`);
  }
  for (const k of ["bold", "italic", "inline", "imath", "link"]) {
    assert.equal(byKey[k].block, undefined, `${k} should stay inline`);
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

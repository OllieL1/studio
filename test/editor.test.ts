/** The live editor's block model: splitting, joining, typing helpers, inserts. */
import assert from "node:assert/strict";
import {
  applyInsert, caretLine, classify, filterInserts, indentLines, INSERTS,
  joinBlocks, listContinuation, parseCallout, parseColumns, serializeCallout,
  serializeColumns, sourceOffset, splitBlocks,
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
  const r = applyInsert("text [tab", 5, 9, INSERTS.find((i) => i.key === "h1")!);
  assert.equal(r.text, "text # ");
  assert.equal(r.caret, 7);
});

test("the three heading levels skip a step each time", () => {
  const byKey = Object.fromEntries(INSERTS.map((i) => [i.key, i]));
  assert.equal(byKey.h1.snippet, "# |");
  assert.equal(byKey.h2.snippet, "### |");
  assert.equal(byKey.h3.snippet, "###### |");
  for (const k of ["h1", "h2", "h3"]) assert.equal(classify(byKey[k].snippet.replace("|", "x")), "heading");
});

test("headings are findable by level, and by name", () => {
  assert.equal(filterInserts("h1")[0].key, "h1");
  assert.equal(filterInserts("h3")[0].key, "h3");
  assert.equal(filterInserts("heading").map((i) => i.key).slice(0, 3).join(","), "h1,h2,h3");
});

test("columns answer to \"2\" as well as \"two\", spaced or not", () => {
  for (const q of ["2", "two", "2col", "2 col", "two col", "2 columns", "two columns", "2 c"]) {
    assert.equal(filterInserts(q)[0]?.key, "columns", `"${q}" should offer two columns`);
  }
});

test("a digit still finds a heading when nothing else matches", () => {
  // "3" isn't a columns keyword, so Heading 3 is the only sensible answer.
  assert.equal(filterInserts("3")[0].key, "h3");
  assert.equal(filterInserts("h2")[0].key, "h2");
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

/* ── Tab indentation ── */

test("Tab indents the caret's line", () => {
  const r = indentLines("- one\n- two", 8, 8);
  assert.equal(r.text, "- one\n  - two");
  assert.equal(r.start, 10);
});

test("Shift-Tab takes an indent back off", () => {
  const r = indentLines("- one\n  - two", 10, 10, true);
  assert.equal(r.text, "- one\n- two");
});

test("Shift-Tab on an unindented line changes nothing", () => {
  const r = indentLines("- one", 2, 2, true);
  assert.equal(r.text, "- one");
});

test("Tab shifts every line of a selection", () => {
  const text = "- one\n- two\n- three";
  const r = indentLines(text, 0, text.length);
  assert.equal(r.text, "  - one\n  - two\n  - three");
});

/* ── Callouts ── */

test("a callout is its own block and round-trips", () => {
  const md = "before\n\n> [!note] Watch out\n> the pivot matters\n\nafter";
  const b = splitBlocks(md);
  assert.deepEqual(b.map((x) => x.kind), ["paragraph", "callout", "paragraph"]);
  assert.equal(joinBlocks(b), md);
});

test("a callout's title and body come apart and back together", () => {
  const md = "> [!note] Watch out\n> the pivot matters\n> in the worst case";
  const { title, body } = parseCallout(md);
  assert.equal(title, "Watch out");
  assert.equal(body, "the pivot matters\nin the worst case");
  assert.equal(serializeCallout(title, body), md);
});

test("a callout with no title still works", () => {
  assert.equal(parseCallout("> [!note]\n> just this").title, "");
  assert.equal(serializeCallout("", "just this"), "> [!note]\n> just this");
});

test("a plain quote is still a quote", () => {
  assert.equal(classify("> quoted"), "quote");
  assert.equal(classify("> [!note] hi"), "callout");
});

/* ── Columns ── */

test("a columns block is kept whole", () => {
  const md = "::: columns\nleft side\n|||\nright side\n:::";
  const b = splitBlocks(`intro\n\n${md}\n\nafter`);
  assert.deepEqual(b.map((x) => x.kind), ["paragraph", "columns", "paragraph"]);
  assert.equal(b[1].text, md);
});

test("columns come apart into two sides and back", () => {
  const md = serializeColumns("## Proof\n- base case", "## Intuition\nhalving twice");
  const [left, right] = parseColumns(md);
  assert.equal(left, "## Proof\n- base case");
  assert.equal(right, "## Intuition\nhalving twice");
  assert.equal(serializeColumns(left, right), md);
});

test("a half-typed columns block doesn't lose what's there", () => {
  const [left, right] = parseColumns("::: columns\nonly this");
  assert.equal(left, "only this");
  assert.equal(right, "");
});

test("blank lines inside a column stay inside it", () => {
  const md = serializeColumns("one\n\ntwo", "three");
  assert.equal(splitBlocks(md).length, 1);
  assert.deepEqual(parseColumns(md), ["one\n\ntwo", "three"]);
});

test("a word in the label beats a keyword in another entry", () => {
  // "Table" lists "columns" as a keyword; typing "column" must still offer
  // Two columns first.
  assert.equal(filterInserts("column")[0].key, "columns");
  assert.equal(filterInserts("columns")[0].key, "columns");
  assert.equal(filterInserts("table")[0].key, "table");
  assert.equal(filterInserts("grid")[0].key, "table");
  assert.equal(filterInserts("callout")[0].key, "callout");
});

test("the menu offers callouts and columns as block inserts", () => {
  const byKey = Object.fromEntries(INSERTS.map((i) => [i.key, i]));
  assert.equal(byKey.callout.block, true);
  assert.equal(byKey.columns.block, true);
  assert.match(byKey.callout.snippet, /\[!note\]/);
  assert.match(byKey.columns.snippet, /::: columns/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

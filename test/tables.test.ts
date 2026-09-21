/** Markdown tables as a grid: parsing, serialising, and grid edits. */
import assert from "node:assert/strict";
import {
  addColumn, addRow, emptyTable, nextCell, parseTable, removeColumn,
  removeRow, serializeTable, setAlign, setCell,
} from "../lib/editor/tables";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const md = "| Term | Meaning |\n| --- | --- |\n| Cohesion | Related parts |\n| Coupling | Dependence |";

test("parses header, alignment and rows", () => {
  const t = parseTable(md)!;
  assert.deepEqual(t.header, ["Term", "Meaning"]);
  assert.deepEqual(t.align, ["left", "left"]);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows[0], ["Cohesion", "Related parts"]);
});

test("reads colons as alignment", () => {
  const t = parseTable("| a | b | c |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |")!;
  assert.deepEqual(t.align, ["left", "center", "right"]);
});

test("survives a half-typed table", () => {
  const t = parseTable("| a | b |")!;
  assert.deepEqual(t.header, ["a", "b"]);
  assert.deepEqual(t.rows, []);
});

test("pads ragged rows to the widest", () => {
  const t = parseTable("| a | b | c |\n| --- | --- | --- |\n| 1 |")!;
  assert.deepEqual(t.rows[0], ["1", "", ""]);
});

test("round-trips through markdown", () => {
  const t = parseTable(md)!;
  const again = parseTable(serializeTable(t))!;
  assert.deepEqual(again, t);
});

test("serialised markdown is aligned and re-parsable", () => {
  const out = serializeTable(parseTable(md)!);
  assert.ok(out.startsWith("| Term"));
  assert.equal(out.split("\n").length, 4);
  assert.deepEqual(parseTable(out)!.rows[1], ["Coupling", "Dependence"]);
});

test("a pipe inside a cell survives a round trip", () => {
  const t = setCell(parseTable(md)!, 0, 1, "a | b");
  assert.deepEqual(parseTable(serializeTable(t))!.rows[0], ["Cohesion", "a | b"]);
});

test("alignment survives a round trip", () => {
  const t = setAlign(parseTable(md)!, 1, "right");
  assert.deepEqual(parseTable(serializeTable(t))!.align, ["left", "right"]);
});

test("rows and columns can be added and removed", () => {
  let t = parseTable(md)!;
  t = addRow(t, 0);
  assert.equal(t.rows.length, 3);
  assert.deepEqual(t.rows[1], ["", ""]);
  t = addColumn(t, 0);
  assert.equal(t.header.length, 3);
  assert.equal(t.rows[0].length, 3);
  t = removeColumn(t, 1);
  assert.equal(t.header.length, 2);
  t = removeRow(t, 0);
  assert.equal(t.rows.length, 2);
});

test("the last row and column can't be removed away", () => {
  let t = emptyTable(1, 1);
  t = removeRow(t, 0);
  assert.equal(t.rows.length, 1);
  t = removeColumn(t, 0);
  assert.equal(t.header.length, 1);
});

test("Tab walks the grid and then asks for a new row", () => {
  const t = parseTable(md)!;
  assert.deepEqual(nextCell(t, -1, 0), { row: -1, col: 1 });
  assert.deepEqual(nextCell(t, -1, 1), { row: 0, col: 0 });
  assert.deepEqual(nextCell(t, 0, 0, true), { row: -1, col: 1 });
  assert.equal(nextCell(t, 1, 1), "append");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

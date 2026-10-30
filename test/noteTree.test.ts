/** The notes browser: tags as tree folders, what sits at the root, and filtering. */
import assert from "node:assert/strict";
import { buildTree, filterItems, visibleRows, type BrowserItem, type FileItem, type NoteItem } from "../lib/noteTree";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const note = (id: string, tags: string[] = [], day = 1, pinned = false): NoteItem => ({
  kind: "note", id, title: `Note ${id}`, pinned, updatedAt: new Date(2026, 9, day), tags, excerpt: "", words: 0,
});
const file = (id: string, filename: string, day = 1): FileItem => ({
  kind: "file", id, filename, ext: filename.split(".").pop()!, size: 10, createdAt: new Date(2026, 9, day),
});

test("each tag is a folder, A to Z", () => {
  const t = buildTree([note("a", ["zeta"]), note("b", ["Alpha"]), note("c", ["mid"])]);
  assert.deepEqual(t.folders.map((f) => f.tag), ["Alpha", "mid", "zeta"]);
});

test("a note with two tags sits in both folders", () => {
  const t = buildTree([note("a", ["one", "two"])]);
  assert.deepEqual(t.folders.map((f) => f.items.map((i) => i.id)), [["a"], ["a"]]);
  assert.equal(t.root.length, 0);
});

test("tags differing only in case are one folder", () => {
  const t = buildTree([note("a", ["LoRA"]), note("b", ["lora"])]);
  assert.equal(t.folders.length, 1);
  assert.equal(t.folders[0].items.length, 2);
});

test("untagged notes, then files, sit at the root", () => {
  const t = buildTree([file("f", "spec.pdf", 9), note("a", [], 1), note("b", ["x"])]);
  assert.deepEqual(t.root.map((i) => i.id), ["a", "f"]);
});

test("pinned first, then most recently updated", () => {
  const t = buildTree([note("old", [], 1), note("new", [], 5), note("pin", [], 2, true)]);
  assert.deepEqual(t.root.map((i) => i.id), ["pin", "new", "old"]);
});

test("files newest first", () => {
  const t = buildTree([file("a", "a.pdf", 1), file("b", "b.docx", 3)]);
  assert.deepEqual(t.root.map((i) => i.id), ["b", "a"]);
});

test("search matches note titles, tags and filenames", () => {
  const items: BrowserItem[] = [note("a", ["draft"]), file("f", "Marking scheme.docx")];
  assert.deepEqual(filterItems(items, "marking", null).map((i) => i.id), ["f"]);
  assert.deepEqual(filterItems(items, "DRAFT", null).map((i) => i.id), ["a"]);
  assert.equal(filterItems(items, "  ", null).length, 2);
});

test("a tag filter leaves files out", () => {
  const items: BrowserItem[] = [note("a", ["Draft"]), note("b"), file("f", "spec.pdf")];
  assert.deepEqual(filterItems(items, "", "draft").map((i) => i.id), ["a"]);
});

test("collapsed folders hide their rows; keys stay unique", () => {
  const t = buildTree([note("a", ["one", "two"]), note("b")]);
  const all = visibleRows(t, new Set());
  assert.deepEqual(all.map((r) => r.type), ["folder", "item", "folder", "item", "item"]);
  assert.equal(new Set(all.map((r) => r.key)).size, all.length);
  const shut = visibleRows(t, new Set(["#one"]));
  assert.deepEqual(shut.map((r) => r.type), ["folder", "folder", "item", "item"]);
  assert.equal(shut[0].type === "folder" && shut[0].open, false);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

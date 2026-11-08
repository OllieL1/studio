/** The Claude knowledge base: doc paths, titles, the index, and git blob ids. */
import assert from "node:assert/strict";
import { applyChanges, buildIndex, docHref, folderOf, isDocPath, normalizeDocPath, starterBody, summaryOf, titleOf } from "../lib/kb";
import { blobSha } from "../lib/blobSha";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const path = (input: string) => {
  const r = normalizeDocPath(input);
  return r.ok ? r.path : `error: ${r.error}`;
};

test("a typed name becomes a .md path", () => {
  assert.equal(path("Plan"), "Plan.md");
  assert.equal(path(" notes/ideas/Plan "), "notes/ideas/Plan.md");
  assert.equal(path("/notes//x.md/"), "notes/x.md");
  assert.equal(path("notes\\win"), "notes/win.md");
  assert.equal(path("Already.MD"), "Already.MD");
});

test("paths that would escape, hide, or break a Windows clone are refused", () => {
  for (const bad of ["", "  ", "../x", "a/./b", "a/../b", ".hidden", "a/.git/x", "what?", "a:b", 'say"hi"', "INDEX.md", "index"]) {
    assert.ok(path(bad).startsWith("error:"), `${JSON.stringify(bad)} → ${path(bad)}`);
  }
});

test("the index isn't a doc; other markdown is", () => {
  assert.equal(isDocPath("INDEX.md"), false);
  assert.equal(isDocPath("notes/INDEX.md"), true);
  assert.equal(isDocPath("README.md"), true);
  assert.equal(isDocPath("logo.png"), false);
});

test("folders are the path's directories", () => {
  assert.equal(folderOf("a.md"), "");
  assert.equal(folderOf("x/y/a.md"), "x/y");
});

test("the title is the first # heading, else the file's name", () => {
  assert.equal(titleOf("x/how-i-work.md", "Intro\n\n# How I work ##\n"), "How I work");
  assert.equal(titleOf("x/how-i-work.md", "## Not a title\nbody"), "how-i-work");
  assert.equal(titleOf("Plan.md", starterBody("notes/Plan.md")), "Plan");
});

test("the summary is plain text after the title", () => {
  assert.equal(summaryOf("# Title\n\nUse **pnpm**, see [docs](http://x).\n\n- one\n- [x] two"), "Use pnpm, see docs. · one · two");
  assert.equal(summaryOf("# T\n```js\ncode\n```\nafter"), "after");
  assert.equal(summaryOf("a ".repeat(100), 10).length, 10);
});

test("doc links carry any character through the query string", () => {
  assert.equal(docHref("a b/c&d.md"), "/project/claude?path=a%20b%2Fc%26d.md");
});

test("the index groups by folder, root first, A to Z", () => {
  const idx = buildIndex([
    { path: "z/last.md", body: "# Last\n\nAt the end." },
    { path: "README.md", body: "# KB\n\nWhat this is." },
    { path: "a/b.md", body: "No heading here" },
    { path: "INDEX.md", body: "old index" },
    { path: "logo.png", body: "" },
  ]);
  const lines = idx.split("\n").filter((l) => l.startsWith("- ") || l.startsWith("## "));
  assert.deepEqual(lines, [
    "- [KB](README.md) - What this is.",
    "## a/",
    "- [b](a/b.md) - No heading here",
    "## z/",
    "- [Last](z/last.md) - At the end.",
  ]);
  assert.ok(idx.endsWith("\n"));
  assert.match(buildIndex([]), /No docs yet/);
});

test("index links are URL-encoded so spaces don't break them", () => {
  assert.match(buildIndex([{ path: "my notes/a b.md", body: "" }]), /\(my%20notes\/a%20b\.md\)/);
});

test("changes apply in order: edits, adds, deletes", () => {
  const out = applyChanges(
    [{ path: "a.md", body: "1" }, { path: "b.md", body: "2" }],
    [{ path: "a.md", content: "one" }, { path: "b.md", delete: true }, { path: "c.md", content: "3" }],
  );
  assert.deepEqual(out, [{ path: "a.md", body: "one" }, { path: "c.md", body: "3" }]);
});

test("blob ids match git's", () => {
  // `printf 'hello\n' | git hash-object --stdin`
  assert.equal(blobSha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
  assert.equal(blobSha(""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  // Multi-byte: the header counts bytes, not characters.
  assert.equal(blobSha("é\n"), "c6003325155f475bd7c87731607525dce73be9cf");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

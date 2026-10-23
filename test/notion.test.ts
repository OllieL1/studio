/** The Notion connection's pure parts (lib/notion.ts). */
import assert from "node:assert/strict";
import { parseDatabaseId, schemaProblems } from "../lib/notion";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const ID = "1f2e3d4c-5b6a-7980-a1b2-c3d4e5f60718";

test("a share link with a view gives the database, not the view", () => {
  assert.equal(
    parseDatabaseId("https://www.notion.so/ollie/To-do-1f2e3d4c5b6a7980a1b2c3d4e5f60718?v=99998888777766665555444433332222"),
    ID,
  );
});

test("a title ending in hex letters doesn't eat into the id", () => {
  assert.equal(parseDatabaseId("https://www.notion.so/Reading-Feed-1f2e3d4c5b6a7980a1b2c3d4e5f60718"), ID);
});

test("bare ids work with or without dashes", () => {
  assert.equal(parseDatabaseId("1f2e3d4c5b6a7980a1b2c3d4e5f60718"), ID);
  assert.equal(parseDatabaseId(` ${ID} `), ID);
  assert.equal(parseDatabaseId("1F2E3D4C5B6A7980A1B2C3D4E5F60718"), ID);
});

test("anything without an id is rejected", () => {
  assert.equal(parseDatabaseId("https://www.notion.so/ollie/To-do"), null);
  assert.equal(parseDatabaseId(""), null);
});

test("the expected schema passes, with Status as status or select", () => {
  const props = { Task: { type: "title" }, Status: { type: "status" }, Deadline: { type: "date" }, Synced: { type: "checkbox" } };
  assert.deepEqual(schemaProblems(props), []);
  assert.deepEqual(schemaProblems({ ...props, Status: { type: "select" } }), []);
});

test("missing and mistyped columns are each named", () => {
  const problems = schemaProblems({ Task: { type: "title" }, Deadline: { type: "rich_text" }, Synced: { type: "checkbox" } });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Status/);
  assert.match(problems[1], /Deadline.*rich_text/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

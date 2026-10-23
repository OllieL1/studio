/** The Notion connection's pure parts (lib/notion.ts). */
import assert from "node:assert/strict";
import { notionDate, pageToTask, parseDatabaseId, schemaProblems, type NotionPage } from "../lib/notion";

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

const page = (props: NotionPage["properties"]): NotionPage => ({ id: "p1", properties: props });

test("a page maps to its title, deadline and status", () => {
  const t = pageToTask(page({
    Task: { type: "title", title: [{ plain_text: "Book " }, { plain_text: "dentist" }] },
    Status: { type: "status", status: { name: "In Progress" } },
    Deadline: { type: "date", date: { start: "2026-11-03" } },
    Synced: { type: "checkbox", checkbox: false },
  }));
  assert.equal(t.title, "Book dentist");
  assert.equal(t.status, "In Progress");
  assert.equal(t.statusType, "status");
  assert.equal(t.dueAt?.getDate(), 3);
});

test("a select Status is read, and remembered as a select", () => {
  const t = pageToTask(page({ Task: { type: "title", title: [] }, Status: { type: "select", select: { name: "Done" } } }));
  assert.equal(t.status, "Done");
  assert.equal(t.statusType, "select");
  assert.equal(t.title, "Untitled");
});

test("blank deadlines and statuses come through as null", () => {
  const t = pageToTask(page({
    Task: { type: "title", title: [{ plain_text: "x" }] },
    Status: { type: "status", status: null },
    Deadline: { type: "date", date: null },
  }));
  assert.equal(t.dueAt, null);
  assert.equal(t.status, null);
});

test("a date-only deadline is the end of that day; a timed one keeps its time", () => {
  const d = notionDate("2026-11-03");
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 10, 3, 23, 59]);
  assert.equal(notionDate("2026-11-03T17:00:00.000Z").toISOString(), "2026-11-03T17:00:00.000Z");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

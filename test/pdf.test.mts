/** The PDF exports: they build, they're valid PDFs, and they paginate. */
import assert from "node:assert/strict";
import { buildPapersPdf } from "../lib/pdf/papers";
import { buildSchedulePdf, type SchedItem } from "../lib/pdf/schedule";

const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);

const pages = (buf: Buffer) => buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
const isPdf = (buf: Buffer) => buf.subarray(0, 4).toString() === "%PDF";

const paper = (over: Record<string, unknown> = {}) => ({
  title: "A paper", authors: "Surname, A.; Other, B.", year: 2026, venue: "Venue",
  url: null, doi: "10.1234/x", arxivId: null, kind: "article", status: "read",
  tags: "one, two", notes: null, notesAt: null, citeKey: "surname2026a", ...over,
});

test("papers: builds a valid PDF", async () => {
  const buf = await buildPapersPdf([paper()], { subtitle: "Project", generatedAt: new Date(2026, 8, 20) });
  assert.ok(isPdf(buf));
  assert.equal(pages(buf), 1);
});

test("papers: markdown notes don't break the build", async () => {
  const notes = "## Heading\n\n**bold** and *em* and `code` and [link](https://example.com)\n\n- bullet\n1. numbered\n\n> quote\n\n```\nfenced code\n```\n";
  const buf = await buildPapersPdf([paper({ notes, notesAt: new Date(2026, 8, 18) })], {
    subtitle: "Project", generatedAt: new Date(2026, 8, 20),
  });
  assert.ok(isPdf(buf));
});

test("papers: a long library runs to several pages", async () => {
  const many = Array.from({ length: 30 }, (_, i) => paper({ title: `Paper ${i}`, citeKey: `k${i}`, notes: "A note.\n\n- one\n- two" }));
  const buf = await buildPapersPdf(many, { subtitle: "Project", generatedAt: new Date(2026, 8, 20) });
  assert.ok(pages(buf) > 1, `expected multiple pages, got ${pages(buf)}`);
});

const schedInput = (items: SchedItem[], undated: string[] = []) => ({
  course: { name: "MSci Project", code: "COMPSCI5082", colour: "#b4532a", hoursTarget: 400 },
  pace: { loggedHours: 12, neededPerWeek: 14.2, recentPerWeek: 3, weeksLeft: 27 },
  progress: { percent: 22, tasksDone: 4, tasksTotal: 18 },
  timeline: { items, from: new Date(2026, 8, 21), to: new Date(2027, 2, 26, 23, 59) },
  undated,
  generatedAt: new Date(2026, 10, 12),
});

const item = (over: Partial<SchedItem> & { id: string; row: SchedItem["row"] }): SchedItem => ({
  title: "Item", start: new Date(2026, 9, 5).toISOString(), end: new Date(2026, 9, 12).toISOString(),
  done: false, weight: null, ...over,
});

test("schedule: builds a valid landscape PDF", async () => {
  const buf = await buildSchedulePdf(schedInput([
    item({ id: "m", row: "meeting" }),
    item({ id: "d", row: "deadline", title: "Status report", weight: 15 }),
    item({ id: "t", row: "task", title: "Literature review" }),
  ]));
  assert.ok(isPdf(buf));
  assert.equal(pages(buf), 1);
  // A4 landscape is 842 x 595pt.
  assert.match(buf.toString("latin1"), /\/MediaBox \[0 0 841\.89 595\.28\]/);
});

test("schedule: an empty project still produces a page", async () => {
  const buf = await buildSchedulePdf(schedInput([], ["Decide the evaluation metric"]));
  assert.ok(isPdf(buf));
  assert.equal(pages(buf), 1);
});

test("schedule: a busy project spills onto more pages", async () => {
  const items: SchedItem[] = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(2026, 8, 21 + i * 4);
    items.push(item({ id: `m${i}`, row: "meeting", title: `Meeting ${i}`, start: d.toISOString(), end: d.toISOString() }));
  }
  const buf = await buildSchedulePdf(schedInput(items));
  assert.ok(pages(buf) > 1, `expected multiple pages, got ${pages(buf)}`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

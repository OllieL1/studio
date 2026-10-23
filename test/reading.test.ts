/** Livio's reading list rules (lib/reading.ts). */
import assert from "node:assert/strict";
import {
  authorLine, datesForStatus, dayOf, daysToRead, defaultOrder, guessType, ratingFromKey, readingStats, stars, toMarkdown,
} from "../lib/reading";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const NOW = new Date(2026, 9, 23, 15, 0);
const day = (m: number, d: number, y = 2026) => new Date(y, m, d);

test("number keys rate, and the same key again takes half off", () => {
  assert.equal(ratingFromKey(null, 4), 4);
  assert.equal(ratingFromKey(4, 4), 3.5);
  assert.equal(ratingFromKey(3.5, 4), 4);
  assert.equal(ratingFromKey(5, 5), 4.5);
  assert.equal(ratingFromKey(1, 1), 0.5);
  assert.equal(ratingFromKey(3, 0), null);
});

test("stars draw whole and half", () => {
  assert.equal(stars(4.5), "★★★★½");
  assert.equal(stars(3), "★★★");
  assert.equal(stars(0.5), "½");
  assert.equal(stars(null), "");
});

test("a status change fills only the dates still empty", () => {
  assert.deepEqual(datesForStatus("READING", { startedAt: null, finishedAt: null }, NOW), { startedAt: day(9, 23) });
  assert.deepEqual(datesForStatus("FINISHED", { startedAt: day(9, 1), finishedAt: null }, NOW), { finishedAt: day(9, 23) });
  // Read in one sitting: never marked as started.
  assert.deepEqual(datesForStatus("FINISHED", { startedAt: null, finishedAt: null }, NOW), { startedAt: day(9, 23), finishedAt: day(9, 23) });
  assert.deepEqual(datesForStatus("WANT", { startedAt: null, finishedAt: null }, NOW), {});
  assert.deepEqual(datesForStatus("READING", { startedAt: day(9, 1), finishedAt: null }, NOW), {});
});

test("days count both ends", () => {
  assert.equal(daysToRead({ startedAt: day(9, 1), finishedAt: day(9, 1) }), 1);
  assert.equal(daysToRead({ startedAt: day(9, 1), finishedAt: day(9, 10) }), 10);
  assert.equal(daysToRead({ startedAt: null, finishedAt: day(9, 10) }), null);
  assert.equal(dayOf(day(9, 23), NOW), 1);
  assert.equal(dayOf(day(9, 12), NOW), 12);
});

test("a link's type is guessed from where it lives", () => {
  assert.equal(guessType("https://www.goodreads.com/book/show/1", false), "BOOK");
  assert.equal(guessType("https://www.amazon.co.uk/Dune/dp/B00B7NPRY8", false), "BOOK");
  assert.equal(guessType("https://someone.substack.com/p/a-post", false), "BLOG");
  assert.equal(guessType("https://example.com/blog/my-post", false), "BLOG");
  assert.equal(guessType("https://paulgraham.com/", false), "WEBSITE");
  assert.equal(guessType("https://www.bbc.co.uk/news/articles/xyz", false), "ARTICLE");
  assert.equal(guessType("https://arxiv.org/abs/2401.00001", true), "PAPER");
});

test("authors read as you'd say them", () => {
  assert.equal(authorLine(["Herbert, Frank"]), "Frank Herbert");
  assert.equal(authorLine(["Hunt, Andrew", "Thomas, David"]), "Andrew Hunt & David Thomas");
  assert.equal(authorLine(["A, B", "C, D", "E, F"]), "B A et al.");
  assert.equal(authorLine([]), null);
});

const items = [
  { type: "BOOK", status: "FINISHED", rating: 4, startedAt: day(8, 1), finishedAt: day(8, 10), createdAt: day(7, 1) },
  { type: "BOOK", status: "FINISHED", rating: 5, startedAt: day(9, 1), finishedAt: day(9, 2), createdAt: day(8, 1) },
  { type: "BLOG", status: "FINISHED", rating: null, startedAt: day(9, 5), finishedAt: day(9, 5), createdAt: day(9, 5) },
  { type: "ARTICLE", status: "FINISHED", rating: 3, startedAt: day(0, 5, 2025), finishedAt: day(0, 6, 2025), createdAt: day(0, 5, 2025) },
  { type: "BOOK", status: "READING", rating: null, startedAt: day(9, 20), finishedAt: null, createdAt: day(9, 20) },
  { type: "PAPER", status: "WANT", rating: null, startedAt: null, finishedAt: null, createdAt: day(9, 21) },
];

test("stats count this year's finished, average the rated, and split by type", () => {
  const s = readingStats(items, NOW);
  assert.equal(s.finishedThisYear, 3);
  assert.equal(s.averageRating, 4); // 4, 5, 3 - the unrated blog doesn't drag it down
  assert.deepEqual(s.byType, [{ type: "BOOK", count: 2 }, { type: "BLOG", count: 1 }]);
  assert.equal(s.perMonth.length, 12);
  assert.equal(s.perMonth[11].count, 2); // October
  assert.equal(s.perMonth[10].count, 1); // September
  assert.equal(s.ratings.find((r) => r.rating === 5)?.count, 1);
  assert.equal(Math.round(s.averageDays! * 100) / 100, (10 + 2 + 1 + 2) / 4);
});

test("default order: reading, wanted, then the log newest first", () => {
  const order = defaultOrder(items).map((i) => `${i.status}:${i.type}`);
  assert.deepEqual(order, ["READING:BOOK", "WANT:PAPER", "FINISHED:BLOG", "FINISHED:BOOK", "FINISHED:BOOK", "FINISHED:ARTICLE"]);
});

test("markdown export links titles and quotes takeaways", () => {
  const md = toMarkdown(
    [{ title: "Dune", author: "Frank Herbert", link: "https://x.com/dune", takeaway: "Fear is the mind-killer.", ...items[1] }],
    "Reading",
  );
  assert.match(md, /^# Reading\n/);
  assert.match(md, /- \*\*\[Dune\]\(https:\/\/x\.com\/dune\)\*\* - Frank Herbert ★★★★★/);
  assert.match(md, /Book · Finished · 2 Oct 2026/);
  assert.match(md, /> Fear is the mind-killer\./);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

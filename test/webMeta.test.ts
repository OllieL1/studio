/** Reading a web page's details, and what a web link looks like as BibTeX. */
import assert from "node:assert/strict";
import { fetchableUrl, parseWebMeta } from "../lib/webMeta";
import { normaliseAuthor, toBibtex } from "../lib/papers";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
let passed = 0, failed = 0;

const page = (head: string) => `<!doctype html><html><head>${head}</head><body>hi</body></html>`;

test("Open Graph and article tags give title, author, year and site", () => {
  const m = parseWebMeta(
    page(`<title>Ignored | Blog</title>
      <meta property="og:title" content="Why Pull Requests &amp; Reviews Matter">
      <meta property="og:site_name" content="Example Engineering">
      <meta name="author" content="Jane Doe">
      <meta property="article:published_time" content="2024-03-09T10:00:00Z">`),
    "https://www.example.com/post",
  );
  assert.equal(m.title, "Why Pull Requests & Reviews Matter");
  assert.deepEqual(m.authors, ["Jane Doe"]);
  assert.equal(m.year, 2024);
  assert.equal(m.venue, "Example Engineering");
  assert.equal(m.kind, "web");
});

test("scholarly citation_* tags win, and mark the page as an article", () => {
  const m = parseWebMeta(
    page(`<meta name="citation_title" content="A Study">
      <meta name="citation_author" content="Hu, Edward">
      <meta name="citation_author" content="Shen, Yelong">
      <meta name="citation_journal_title" content="Journal of Things">
      <meta name="citation_publication_date" content="2021/06/17">
      <meta name="citation_doi" content="https://doi.org/10.1000/xyz">
      <meta property="og:title" content="Not this">`),
    "https://journal.example/a",
  );
  assert.equal(m.title, "A Study");
  assert.deepEqual(m.authors, ["Hu, Edward", "Shen, Yelong"]);
  assert.equal(m.year, 2021);
  assert.equal(m.venue, "Journal of Things");
  assert.equal(m.doi, "10.1000/xyz");
  assert.equal(m.kind, "article");
});

test("JSON-LD fills in what the meta tags don't, including @graph", () => {
  const ld = JSON.stringify({ "@graph": [{ "@type": "BlogPosting", headline: "From LD", datePublished: "2022-01-05", author: [{ name: "Sam Lee" }], publisher: { name: "LD Press" } }] });
  const m = parseWebMeta(page(`<script type="application/ld+json">${ld}</script>`), "https://x.example/p");
  assert.equal(m.title, "From LD");
  assert.deepEqual(m.authors, ["Sam Lee"]);
  assert.equal(m.year, 2022);
  assert.equal(m.venue, "LD Press");
});

test("a bare page falls back to <title>, and the site name to its host", () => {
  const m = parseWebMeta(page("<title>  Plain &#38; simple </title>"), "https://www.docs.example.org/a/b");
  assert.equal(m.title, "Plain & simple");
  assert.deepEqual(m.authors, []);
  assert.equal(m.year, null);
  assert.equal(m.venue, "docs.example.org");
});

test("a trailing site name is dropped from the title, but a real subtitle is kept", () => {
  const wiki = parseWebMeta(page(`<meta property="og:title" content="Software engineering - Wikipedia">`), "https://en.wikipedia.org/wiki/Software_engineering");
  assert.equal(wiki.title, "Software engineering");
  const kept = parseWebMeta(page(`<meta property="og:title" content="Rust - a language for everyone">`), "https://blog.example.com/rust");
  assert.equal(kept.title, "Rust - a language for everyone");
});

test("an author profile URL isn't taken for a name", () => {
  const m = parseWebMeta(page(`<meta property="article:author" content="https://example.com/people/jane">`), "https://e.example/");
  assert.deepEqual(m.authors, []);
});

test("only public http(s) addresses are fetched", () => {
  assert.ok(fetchableUrl("https://example.com/a"));
  assert.ok(fetchableUrl("http://example.com"));
  for (const bad of ["file:///etc/passwd", "ftp://example.com", "http://localhost:3111", "http://127.0.0.1", "http://10.0.0.5", "http://192.168.1.1", "http://172.20.0.1", "http://169.254.169.254", "http://[::1]/", "http://printer.local", "not a url"]) {
    assert.equal(fetchableUrl(bad), null, bad);
  }
  assert.ok(fetchableUrl("http://172.32.0.1"), "172.32 is public");
});

test("people are put surname first; organisations are left alone", () => {
  assert.equal(normaliseAuthor("Jane Doe"), "Doe, Jane");
  assert.equal(normaliseAuthor("Doe, Jane"), "Doe, Jane");
  assert.equal(normaliseAuthor("Mozilla Foundation"), "Mozilla Foundation");
  assert.equal(normaliseAuthor("GitHub Engineering"), "GitHub Engineering");
  assert.equal(normaliseAuthor("Plato"), "Plato");
});

test("a web page exports as @misc with its URL and the date it was accessed", () => {
  const bib = toBibtex([{
    citeKey: "doe2024why", title: "Why PRs matter", authors: "Doe, Jane; Mozilla Foundation", year: 2024,
    venue: "Example Engineering", doi: null, arxivId: null, url: "https://example.com/post", kind: "web",
    createdAt: new Date("2026-10-20T12:00:00Z"),
  }]);
  assert.match(bib, /^@misc\{doe2024why,/);
  assert.match(bib, /author = \{Doe, Jane and \{Mozilla Foundation\}\}/);
  assert.match(bib, /howpublished = \{Example Engineering\}/);
  assert.match(bib, /url = \{https:\/\/example.com\/post\}/);
  assert.match(bib, /urldate = \{2026-10-20\}/);
});

for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

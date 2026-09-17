/** Markdown rendering, TOC extraction and sanitisation. */
import assert from "node:assert/strict";
import { renderMarkdown, extractToc, wordCount, slugify } from "../lib/markdown";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

test("headings get ids for anchor links", () => {
  const html = renderMarkdown("# Monads\n## The Laws");
  assert.ok(/id="monads"/.test(html));
  assert.ok(/id="the-laws"/.test(html));
});

test("fenced code is syntax highlighted", () => {
  const html = renderMarkdown("```haskell\nreturn :: a -> m a\n```");
  assert.ok(html.includes("hljs"), "highlight applied");
  assert.ok(html.includes("code-lang"), "language label rendered");
});

test("an unknown language still renders, unhighlighted", () => {
  const html = renderMarkdown("```notalanguage\nx = 1\n```");
  assert.ok(html.includes("code-block"));
  assert.ok(html.includes("x = 1"));
});

test("code is HTML-escaped, not executed", () => {
  const html = renderMarkdown("```\n<script>alert(1)</script>\n```");
  assert.ok(!html.includes("<script>"), "no live script tag");
  assert.ok(html.includes("&lt;script&gt;"), "escaped instead");
});

test("GFM tables and task lists render", () => {
  const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo");
  assert.ok(html.includes("<table"));
  assert.ok(html.includes('type="checkbox"'));
});

test("injected HTML is sanitised away", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>');
  assert.ok(!html.includes("onerror"));
  assert.ok(!html.toLowerCase().includes("javascript:"));
});

test("a # inside a code fence is not a heading", () => {
  const toc = extractToc("# Real\n\n```bash\n# not a heading\n```\n\n## Also real");
  assert.deepEqual(toc.map((t) => t.text), ["Real", "Also real"]);
});

test("TOC respects the depth limit", () => {
  const toc = extractToc("# a\n## b\n### c\n#### d", 3);
  assert.deepEqual(toc.map((t) => t.depth), [1, 2, 3]);
});

test("duplicate heading text still yields usable slugs", () => {
  assert.equal(slugify("The Laws"), "the-laws");
  assert.equal(slugify("C++ & Rust!"), "c-rust");
  assert.equal(slugify("   "), "section", "never empty");
});

test("word count ignores code fences and markup", () => {
  const n = wordCount("# Title\n\nOne two three.\n\n```\nthis code is not prose at all\n```");
  assert.ok(n >= 4 && n <= 6, `expected ~4-6 words, got ${n}`);
});

test("empty markdown renders to nothing, not a crash", () => {
  assert.equal(renderMarkdown("").trim(), "");
  assert.deepEqual(extractToc(""), []);
  assert.equal(wordCount(""), 0);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

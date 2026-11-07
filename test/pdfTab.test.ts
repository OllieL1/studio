/** PDF tabs: /pdf frames only Studio's own files, and nothing in a title or path escapes the page. */
import assert from "node:assert/strict";
import { isPdfSrc, pdfTab, pdfTabHtml } from "../lib/pdfTab";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

test("links carry the source and title through the query string", () => {
  const href = pdfTab("/api/project/notes/pdf?ids=a,b", "Notes & more");
  const q = new URL(href, "http://x").searchParams;
  assert.equal(new URL(href, "http://x").pathname, "/pdf");
  assert.equal(q.get("src"), "/api/project/notes/pdf?ids=a,b");
  assert.equal(q.get("title"), "Notes & more");
  assert.equal(new URL(pdfTab("/api/stats/pdf"), "http://x").searchParams.has("title"), false);
});

test("only frames Studio's /api routes", () => {
  assert.ok(isPdfSrc("/api/uploads/abc"));
  assert.ok(isPdfSrc("/api/lectures/pdf?id=1"));
  for (const bad of ["https://evil.example/x.pdf", "//evil.example/api/x", "/\\evil.example", "/settings", "javascript:alert(1)", "/api/x\n"])
    assert.equal(isPdfSrc(bad), false, bad);
});

test("escapes the title and source into the page", () => {
  const html = pdfTabHtml('/api/x?a=1&b="2"', "<script>alert(1)</script>");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('src="/api/x?a=1&amp;b=&quot;2&quot;"'));
  // PNG as well as SVG - not every browser takes an SVG icon.
  assert.ok(html.includes('href="/pdf-icon.svg?v=2"'));
  assert.ok(/rel="icon" href="\/pdf-icon-32\.png\?v=2" type="image\/png"/.test(html));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

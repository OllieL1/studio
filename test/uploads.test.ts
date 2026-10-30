/** What can be attached to a task: the extension says what a file claims to be, the bytes must agree. */
import assert from "node:assert/strict";
import { checkUpload, dataDir, extOf, MAX_UPLOAD_BYTES } from "../lib/uploads";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const bytes = (s: string) => Buffer.from(s, "latin1");
const pdf = bytes("%PDF-1.7\n...");
// A zip's local header, then the entry name as plain text.
const docx = bytes("PK\x03\x04....[Content_Types].xml....word/document.xml");
const pptx = bytes("PK\x03\x04....[Content_Types].xml....ppt/slides/slide1.xml");

test("reads extensions, ignoring case", () => {
  assert.equal(extOf("Spec.PDF"), "pdf");
  assert.equal(extOf("a.b.docx"), "docx");
  assert.equal(extOf("README"), "");
});

test("accepts a real pdf, docx and pptx", () => {
  for (const [name, b, mime] of [
    ["spec.pdf", pdf, "application/pdf"],
    ["brief.docx", docx, "wordprocessingml"],
    ["lecture.pptx", pptx, "presentationml"],
  ] as const) {
    const r = checkUpload(name, b);
    assert.ok(r.ok, name);
    assert.ok(r.ok && r.mime.includes(mime), name);
  }
});

test("turns away other types", () => {
  const r = checkUpload("notes.txt", bytes("hello"));
  assert.equal(r.ok, false);
});

test("the bytes must match the extension", () => {
  assert.equal(checkUpload("virus.pdf", bytes("MZ\x90\x00")).ok, false);
  assert.equal(checkUpload("slides.pptx", docx).ok, false, "a Word file renamed .pptx");
  assert.equal(checkUpload("brief.docx", bytes("PK\x03\x04 just a zip")).ok, false, "any old zip");
  assert.equal(checkUpload("brief.docx", pdf).ok, false);
});

test("empty and oversized files are refused", () => {
  assert.equal(checkUpload("a.pdf", Buffer.alloc(0)).ok, false);
  const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
  big.write("%PDF");
  const r = checkUpload("a.pdf", big);
  assert.ok(!r.ok && r.error.includes("MB"));
});

test("uploads sit beside the database, wherever Prisma finds it", () => {
  // Relative to schema.prisma's folder, as Prisma reads it - not the repo root.
  assert.equal(dataDir("file:./dev.db", "/repo/prisma"), "/repo/prisma");
  assert.equal(dataDir("file:../data/studio.db?connection_limit=1", "/repo/prisma"), "/repo/data");
  // The stick's absolute path is taken as it is.
  assert.equal(dataDir("file:/Volumes/STICK/studio/data/studio.db", "/repo/prisma"), "/Volumes/STICK/studio/data");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

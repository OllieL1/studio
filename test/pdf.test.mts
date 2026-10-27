/** The PDF exports: they build, they're valid PDFs, and they paginate. */
import assert from "node:assert/strict";
import { buildPapersPdf } from "../lib/pdf/papers";
import { buildSchedulePdf, type SchedItem } from "../lib/pdf/schedule";
import { buildStatsPdf } from "../lib/pdf/stats";
import { buildLecturesPdf, type PdfLecture } from "../lib/pdf/lectures";
import { buildNotesPdf, type PdfNote } from "../lib/pdf/notes";
import { measureMath } from "../lib/pdf/math";
import { newDoc, MARGIN } from "../lib/pdf/doc";
import { notesStyle, parseInline, renderMarkdown, wrapCode } from "../lib/pdf/markdown";
import { byDayOfWeek, byHourOfDay, byLocation, bySubject, focusByLength, focusDistribution, headline, rollingMean, type StatSession } from "../lib/stats";

const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);

const pages = (buf: Buffer) => buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
const isPdf = (buf: Buffer) => buf.subarray(0, 4).toString() === "%PDF";

const paper = (over: Record<string, unknown> = {}) => ({
  title: "A paper", authors: "Surname, A.; Other, B.", year: 2026, venue: "Venue",
  url: null, doi: "10.1234/x", arxivId: null, kind: "article", status: "read",
  tags: ["one", "two"], notes: null, notesAt: null, citeKey: "surname2026a", ...over,
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

/* ── Stats ── */

const statsSessions = (n: number): StatSession[] =>
  Array.from({ length: n }, (_, i) => {
    const startedAt = new Date(2026, 8, 1 + (i % 28), 9 + (i % 8), 0);
    const minutes = 30 + (i % 5) * 25;
    return {
      id: `s${i}`, name: `Session ${i}`, startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * 60000),
      minutes, rawMinutes: minutes + (i % 3), focus: 50 + (i % 5) * 10,
      courses: [{ courseId: i % 2 ? "c1" : "c2", minutes }], tasks: [],
      location: ["library", "flat", "coffee", null][i % 4],
    };
  });

const statsInput = (sessions: StatSession[]) => {
  const daily = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(2026, 8, 1 + i);
    const day = sessions.filter((s) => s.startedAt.toDateString() === date.toDateString());
    const mins = day.reduce((t, s) => t + s.minutes, 0);
    return { date, minutes: mins, focus: mins > 0 ? day.reduce((t, s) => t + s.focus * s.minutes, 0) / mins : null };
  });
  return {
    rangeLabel: "All time", generatedAt: new Date(2026, 8, 30),
    headline: headline(sessions), byHour: byHourOfDay(sessions), byDay: byDayOfWeek(sessions),
    daily, focusTrend: rollingMean(daily.map((d) => d.focus), 7),
    focusBands: focusDistribution(sessions), focusByLength: focusByLength(sessions),
    subjects: bySubject(sessions, [
      { id: "c1", name: "Coaching Software Teams", shortName: "Coaching", colour: "#5b7c99" },
      { id: "c2", name: "MSci Project", shortName: "Project", colour: "#b4532a" },
    ]),
    places: byLocation(sessions),
    music: null,
  };
};

test("stats: builds a valid PDF without music", async () => {
  const buf = await buildStatsPdf(statsInput(statsSessions(40)));
  assert.ok(isPdf(buf));
  assert.ok(pages(buf) >= 1);
});

test("stats: a single session still renders every section it can", async () => {
  const buf = await buildStatsPdf(statsInput(statsSessions(1)));
  assert.ok(isPdf(buf));
});

test("stats: sections flow onto more pages as they fill", async () => {
  const buf = await buildStatsPdf(statsInput(statsSessions(200)));
  assert.ok(pages(buf) > 1, `expected multiple pages, got ${pages(buf)}`);
});

/* ── Lectures ── */

const lecture = (over: Partial<PdfLecture> = {}): PdfLecture => ({
  id: "l1", title: "Lecture 1: Modularity", dueAt: new Date(2026, 8, 28),
  notesMd: "# Overview\n\nSome notes.", notebook: null, notebookPages: null,
  parts: [{ label: "Attendance", done: true }, { label: "Typed notes", done: true }],
  ...over,
});

const course = { name: "Coaching Software Teams", code: "COMPSCI5079", colour: "#5b7c99" };

test("lectures: a single lecture is one document, no cover", async () => {
  const buf = await buildLecturesPdf({ course, lectures: [lecture()], generatedAt: new Date(2026, 8, 20) });
  assert.ok(isPdf(buf));
  assert.equal(pages(buf), 1);
});

test("lectures: a bundle gets a cover, contents and a page per lecture", async () => {
  const lectures = Array.from({ length: 4 }, (_, i) => lecture({ id: `l${i}`, title: `Lecture ${i + 1}` }));
  const buf = await buildLecturesPdf({ course, lectures, generatedAt: new Date(2026, 8, 20) });
  // cover + contents + one page each, at least.
  assert.ok(pages(buf) >= 6, `expected 6+ pages, got ${pages(buf)}`);
});

test("lectures: a lecture with no typed notes still gets its page", async () => {
  const buf = await buildLecturesPdf({
    course,
    lectures: [lecture({ notesMd: null }), lecture({ id: "l2", title: "Second" })],
    generatedAt: new Date(2026, 8, 20),
  });
  assert.ok(isPdf(buf));
  assert.ok(pages(buf) >= 4);
});

test("lectures: code fences with arrows and operators don't crash the font", async () => {
  // JetBrains Mono's ligatures for "->" and ">=" broke fontkit outright, so
  // this is a regression guard on whichever mono face is bundled.
  const notesMd = [
    "```haskell",
    "compose :: (b -> c) -> (a -> b) -> a -> c",
    "compose g f = \\x -> g (f x)",
    "```",
    "",
    "Inline `a -> b`, `x >= y`, `p != q`, `<!-- c -->` and `|>`.",
  ].join("\n");
  const buf = await buildLecturesPdf({ course, lectures: [lecture({ notesMd })], generatedAt: new Date(2026, 8, 20) });
  assert.ok(isPdf(buf));
});

const note = (over: Partial<PdfNote> = {}): PdfNote => ({
  id: "n1",
  title: "Key links",
  body: "Some notes.\n\n- @u[https://example.com|Example] - a link chip\n- tagged @#[motive]\n",
  tags: ["motive"],
  pinned: false,
  updatedAt: new Date(2026, 8, 28),
  ...over,
});

test("notes: a single note is one document, no cover", async () => {
  const buf = await buildNotesPdf({ notes: [note()], course: { name: "Project", code: "CS5" }, generatedAt: new Date(2026, 8, 28) });
  assert.ok(isPdf(buf));
  assert.equal(pages(buf), 1);
});

test("notes: a bundle gets a cover, contents and a page per note", async () => {
  const notes = Array.from({ length: 5 }, (_, i) => note({ id: `n${i}`, title: `Note ${i + 1}` }));
  const buf = await buildNotesPdf({ notes, course: { name: "Project", code: "CS5" }, generatedAt: new Date(2026, 8, 28) });
  assert.ok(pages(buf) >= 7, `expected 7+ pages, got ${pages(buf)}`);
});

test("notes: an empty note and one with no project still build", async () => {
  const buf = await buildNotesPdf({
    notes: [note({ body: "" }), note({ id: "n2", title: "Second", tags: [] })],
    course: null,
    generatedAt: new Date(2026, 8, 28),
  });
  assert.ok(isPdf(buf));
  assert.ok(pages(buf) >= 4);
});

test("notes: markdown, mentions and maths all render", async () => {
  const body = "# Heading\n\n$$x^2$$\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> quote\n\n- one\n  - nested\n- two\n\n@r[hu2021lora|LoRA] and @t[abc|A task]\n";
  const buf = await buildNotesPdf({ notes: [note({ body })], course: null, generatedAt: new Date(2026, 8, 28) });
  assert.ok(isPdf(buf));
});

test("maths: LaTeX is measured as a drawable box", async () => {
  const m = measureMath("T(n) = 2T(n/2) + O(n)", 10, true);
  assert.ok(m, "should typeset");
  assert.ok(m!.width > 10 && m!.height > 5, `got ${m!.width} x ${m!.height}`);
  // The size has to be in user units: "pt" is re-scaled by svg-to-pdfkit and
  // the equation comes out 4/3 too wide.
  assert.match(m!.svg, /width="[\d.]+"/);
  assert.ok(!/width="[\d.]+(ex|pt)"/.test(m!.svg), "size must be unitless");
  assert.ok(m!.svg.includes("<path"), "glyphs should be paths, not font references");
});

test("maths: inline is smaller than display, and sits on the baseline", async () => {
  const inline = measureMath("x^2", 10, false)!;
  const display = measureMath("x^2", 11.5, true)!;
  assert.ok(display.width > inline.width);
  assert.ok(inline.descent >= 0);
});

test("maths: LaTeX that doesn't parse gives nothing back, so callers fall back", async () => {
  assert.equal(measureMath("\\frac{1}", 10, false), null);
  assert.equal(measureMath("\\begin{nope}x\\end{nope}", 10, true), null);
});

test("lectures: equations are typeset into the page", async () => {
  const notesMd = "Inline $O(n \\log n)$ cost.\n\n$$\nT(n) = 2T(n/2) + O(n)\n$$\n\n$$x^2$$\n";
  const buf = await buildLecturesPdf({ course, lectures: [lecture({ notesMd })], generatedAt: new Date(2026, 8, 20) });
  assert.ok(isPdf(buf));
  assert.equal(pages(buf), 1);
  // Typeset maths is drawn as filled paths; the plain version has none.
  const plain = await buildLecturesPdf({
    course,
    lectures: [lecture({ notesMd: "Inline cost.\n\nT(n) = 2T(n/2)\n" })],
    generatedAt: new Date(2026, 8, 20),
  });
  assert.ok(buf.length > plain.length + 2000, `maths should add vector content (${buf.length} vs ${plain.length})`);
});

test("lectures: tables, quotes, rules and nested lists all render", async () => {
  const notesMd = [
    "# Heading", "", "| Term | Meaning |", "| --- | --- |", "| Cohesion | Related parts |", "",
    "## Sub", "", "- one", "  - nested", "1. first", "", "> quoted", "", "---", "",
    "**bold**, *em*, `code`, [link](https://example.com), ![pic](https://example.com/a.png)",
  ].join("\n");
  const buf = await buildLecturesPdf({ course, lectures: [lecture({ notesMd })], generatedAt: new Date(2026, 8, 20) });
  assert.ok(isPdf(buf));
});

test("lectures: a bundle with no course still builds", async () => {
  const buf = await buildLecturesPdf({ course: null, lectures: [lecture(), lecture({ id: "l2" })], generatedAt: new Date(2026, 8, 20) });
  assert.ok(isPdf(buf));
});


/* ── Code blocks ─────────────────────────────────────────────────────────── */

/** Render markdown the way the exports do, recording every row of text drawn and where. */
async function drawn(md: string) {
  const { doc, done } = newDoc({ title: "t", subject: "t", createdAt: new Date(2026, 9, 1) });
  const calls: { page: number; text: string; x: number; y: number }[] = [];
  let page = 0;
  const addPage = doc.addPage.bind(doc);
  doc.addPage = ((...a: Parameters<typeof addPage>) => { page++; return addPage(...a); }) as typeof doc.addPage;
  const text = doc.text.bind(doc) as (...a: unknown[]) => unknown;
  (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (...a: unknown[]) => {
    const [t, x, y] = a;
    if (typeof x === "number" && typeof y === "number") calls.push({ page, text: String(t), x, y });
    return text(...a);
  };
  const style = notesStyle(doc);
  renderMarkdown(doc, md, { ...style, ensure: (h) => { if (doc.y + h > doc.page.height - MARGIN) doc.addPage(); } });
  const size = style.size * 0.86;
  const measure = (s: string) => doc.font("mono").fontSize(size).widthOfString(s);
  const dims = { width: doc.page.width, height: doc.page.height };
  doc.end();
  await done;
  return { calls, pages: page + 1, measure, ...dims };
}

const squash = (s: string) => s.replace(/\s+/g, "");

test("code: wrapping keeps a short line whole and trims what trails it", async () => {
  assert.deepEqual(wrapCode("let x = 1;", 40), ["let x = 1;"]);
  assert.deepEqual(wrapCode("let x = 1;   ", 40), ["let x = 1;"]);
  assert.deepEqual(wrapCode("", 40), [""]);
});

test("code: tabs become spaces, so indentation survives", async () => {
  assert.deepEqual(wrapCode("\t\treturn x;", 40), ["        return x;"]);
});

test("code: a long line breaks at a space and hangs under its own indent", async () => {
  const rows = wrapCode("    call(alpha, beta, gamma, delta, epsilon, zeta, eta, theta)", 30);
  assert.ok(rows.length > 1);
  for (const r of rows) assert.ok(r.length <= 30, `"${r}" is ${r.length} wide`);
  assert.ok(rows[1].startsWith("      "), "continuation hangs two in from the line's indent");
  assert.ok(!/^ {7}/.test(rows[1]), "...and no further");
  assert.equal(squash(rows.join("")), squash("    call(alpha, beta, gamma, delta, epsilon, zeta, eta, theta)"));
});

test("code: with no space to break at, a long token is cut to fit - and nothing is lost", async () => {
  const line = "x".repeat(250);
  const rows = wrapCode(line, 40);
  for (const r of rows) assert.ok(r.length <= 40);
  assert.equal(squash(rows.join("")), line);
});

test("code: a line indented past the width still terminates and still fits", async () => {
  const line = " ".repeat(60) + "deeplyNested(" + "y".repeat(100) + ")";
  const rows = wrapCode(line, 20);
  for (const r of rows) assert.ok(r.length <= 20, `"${r}"`);
  assert.equal(squash(rows.join("")), squash(line));
});

test("code: a long line wraps inside the page instead of running onto the next line", async () => {
  const long = "callSomething(" + "argument, ".repeat(40) + "last);";
  const md = ["Before.", "", "```", "first line", long, "final line", "```", "", "After."].join("\n");
  const r = await drawn(md);
  const code = r.calls.filter((c) => c.x === MARGIN + 8);
  assert.ok(code.length >= 5, `the long line should wrap onto extra rows, got ${code.length} rows`);
  for (const c of code) {
    assert.ok(c.x + r.measure(c.text) <= r.width - MARGIN, `"${c.text.slice(0, 20)}..." runs off the right margin`);
  }
  const ys = code.map((c) => `${c.page}:${c.y.toFixed(2)}`);
  assert.equal(new Set(ys).size, ys.length, "two rows drawn at the same spot - one is on top of the other");
  assert.equal(squash(code.map((c) => c.text).join("")), squash(["first line", long, "final line"].join("")), "nothing lost");
});

test("code: a block taller than a page flows across pages rather than piling up", async () => {
  const body = Array.from({ length: 140 }, (_, i) => `  step${i}(); // number ${i}`);
  const r = await drawn(["Intro.", "", "```", ...body, "```", "", "Outro."].join("\n"));
  const code = r.calls.filter((c) => c.x === MARGIN + 8);
  assert.equal(code.length, 140);
  // The old renderer made a page per line past the first: 140 rows came to ~100 pages.
  assert.ok(r.pages >= 2 && r.pages <= 5, `expected 2-5 pages, got ${r.pages}`);
  for (const c of code) {
    assert.ok(c.y >= MARGIN && c.y <= r.height - MARGIN, `row at y=${c.y} on page ${c.page} is outside the margins`);
  }
  const spots = code.map((c) => `${c.page}:${c.y.toFixed(2)}`);
  assert.equal(new Set(spots).size, spots.length, "rows overlap");
  const order = code.map((c) => Number(/number (\d+)/.exec(c.text)![1]));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "rows came out of order");
});

test("code: the page break never leaves a block's first row stranded alone", async () => {
  // Fill a page with prose so the block starts close to the foot of it.
  const prose = Array.from({ length: 44 }, (_, i) => `Paragraph ${i} of filler text.`).join("\n\n");
  const body = Array.from({ length: 12 }, (_, i) => `row${i}();`);
  const r = await drawn([prose, "", "```", ...body, "```"].join("\n"));
  const code = r.calls.filter((c) => c.x === MARGIN + 8);
  assert.equal(code.length, 12);
  const firstPage = code[0].page;
  const onFirst = code.filter((c) => c.page === firstPage).length;
  assert.ok(onFirst >= 3 || onFirst === 12, `the block opened with just ${onFirst} row(s) at the foot of a page`);
});

test("inline: code, maths and links inside bold and italic keep their own look", async () => {
  const runs = (s: string) => parseInline(s).map((r) => [r.text, r.font]);
  assert.deepEqual(runs("**the `foo` function** next"), [["the ", "bold"], ["foo", "mono"], [" function", "bold"], [" next", "body"]]);
  assert.deepEqual(runs("*it $x^2$ is*"), [["it ", "italic"], ["x^2", "maths"], [" is", "italic"]]);
  assert.deepEqual(runs("**see [docs](https://a.b)**").map(([, f]) => f), ["bold", "bold"]);
  assert.equal(parseInline("**see [docs](https://a.b)**")[1].link, "https://a.b");
  // No bold-italic face: italic inside bold stays bold.
  assert.deepEqual(runs("**very _much_ so**").map(([, f]) => f), ["bold", "bold", "bold"]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

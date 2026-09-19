/** Papers (link parsing, cite keys, BibTeX) and project maths (pace, timeline, agenda). */
import assert from "node:assert/strict";
import { parsePaperInput, makeCiteKey, toBibtex, shortAuthors, toSurnameFirst } from "../lib/papers";
import { projectPace, timelineWeeks, timelinePosition, stackRows, draftAgenda, projectSessions, PROJECT_DEADLINE } from "../lib/project";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const approx = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 0.01, `${m} — expected ${b}, got ${a}`);

/* ── Project time ── */

test("project sessions keep only the project's slice", () => {
  const at = new Date(2026, 9, 5, 10, 0);
  const base = { name: "s", startedAt: at, endedAt: new Date(at.getTime() + 120 * 60000), focus: 80, tasks: [] };
  const out = projectSessions([
    { ...base, id: "a", minutes: 120, rawMinutes: 150, courses: [{ courseId: "P", minutes: 90 }, { courseId: "X", minutes: 30 }] },
    { ...base, id: "b", minutes: 60, rawMinutes: 60, courses: [{ courseId: "X", minutes: 60 }] },
    { ...base, id: "c", minutes: 45, rawMinutes: 45, courses: [{ courseId: "P", minutes: 45 }] },
  ], "P");
  assert.deepEqual(out.map((s) => s.id), ["a", "c"]);
  assert.equal(out[0].minutes, 90);
  approx(out[0].rawMinutes, 112.5, "raw minutes scale with the slice");
  assert.deepEqual(out[0].courses, [{ courseId: "P", minutes: 90 }]);
  assert.equal(out[1].minutes, 45);
});

/* ── Link parsing ── */

test("arXiv links in every common form", () => {
  for (const s of ["https://arxiv.org/abs/2106.09685", "https://arxiv.org/pdf/2106.09685v2", "arxiv.org/html/2106.09685v1", "arXiv:2106.09685", "2106.09685"]) {
    assert.equal(parsePaperInput(s).arxivId, "2106.09685", s);
  }
});

test("old-style arXiv ids", () => {
  assert.equal(parsePaperInput("https://arxiv.org/abs/cs/0101001").arxivId, "cs/0101001");
});

test("DOIs from publisher links and bare", () => {
  assert.equal(parsePaperInput("https://dl.acm.org/doi/10.1145/3368089.3409747").doi, "10.1145/3368089.3409747");
  assert.equal(parsePaperInput("https://doi.org/10.1109/ICSE.2019.00012").doi, "10.1109/ICSE.2019.00012");
  assert.equal(parsePaperInput("https://link.springer.com/article/10.1007/s10664-020-09876-5").doi, "10.1007/s10664-020-09876-5");
  assert.equal(parsePaperInput("10.1145/3368089.3409747").doi, "10.1145/3368089.3409747");
});

test("trailing junk is stripped from a DOI", () => {
  assert.equal(parsePaperInput("see 10.1145/3368089.3409747.").doi, "10.1145/3368089.3409747");
  assert.equal(parsePaperInput("https://dl.acm.org/doi/pdf/10.1145/3368089.3409747").doi, "10.1145/3368089.3409747");
});

test("a link with no identifier keeps its URL but no id", () => {
  const r = parsePaperInput("https://ieeexplore.ieee.org/document/8812345");
  assert.equal(r.doi, null);
  assert.equal(r.arxivId, null);
  assert.equal(r.url, "https://ieeexplore.ieee.org/document/8812345");
});

/* ── Cite keys & authors ── */

test("cite key from first author, year and first meaningful word", () => {
  assert.equal(makeCiteKey({ authors: ["Hu, Edward J."], year: 2021, title: "LoRA: Low-Rank Adaptation" }, new Set()), "hu2021lora");
  assert.equal(makeCiteKey({ authors: ["Smith, J"], year: 2020, title: "The Art of Testing" }, new Set()), "smith2020art", "skips 'The'");
});

test("cite keys are ASCII and unique", () => {
  const taken = new Set(["muller2019deep"]);
  assert.equal(makeCiteKey({ authors: ["Müller, Anna"], year: 2019, title: "Deep learning" }, taken), "muller2019deepb");
});

test("surname-first conversion", () => {
  assert.equal(toSurnameFirst("Edward J. Hu"), "Hu, Edward J.");
  assert.equal(toSurnameFirst("Hu, Edward"), "Hu, Edward");
});

test("short author lists", () => {
  assert.equal(shortAuthors("Hu, E; Shen, Y; Wallis, P; Allen-Zhu, Z"), "Hu, Shen, Wallis et al.");
  assert.equal(shortAuthors("Hu, E"), "Hu");
  assert.equal(shortAuthors(""), "Unknown");
});

/* ── BibTeX ── */

test("BibTeX entry has the right type, fields and escaping", () => {
  const bib = toBibtex([{
    citeKey: "smith2020art", title: "Testing & Debugging: 100% coverage", authors: "Smith, J; Doe, A",
    year: 2020, venue: "Proc. ICSE", doi: "10.1/x", arxivId: null, url: "https://doi.org/10.1/x", kind: "inproceedings",
  }]);
  assert.ok(bib.startsWith("@inproceedings{smith2020art,"));
  assert.ok(bib.includes("author = {Smith, J and Doe, A}"));
  assert.ok(bib.includes("booktitle = {Proc. ICSE}"));
  assert.ok(bib.includes("{Testing \\& Debugging: 100\\% coverage}"), "& and % escaped, title brace-protected");
  assert.ok(!bib.includes("eprint"), "no empty fields");
});

test("arXiv preprints become @misc with eprint", () => {
  const bib = toBibtex([{ citeKey: "hu2021lora", title: "LoRA", authors: "Hu, E", year: 2021, venue: "arXiv", doi: null, arxivId: "2106.09685", url: null, kind: "preprint" }]);
  assert.ok(bib.startsWith("@misc{hu2021lora,"));
  assert.ok(bib.includes("eprint = {2106.09685}") && bib.includes("archivePrefix = {arXiv}"));
});

/* ── Pace ── */

const now = new Date(2026, 9, 5, 12); // Mon 5 Oct 2026

test("pace: needed hours per week spread over the time left", () => {
  const p = projectPace({ loggedMinutes: 100 * 60, targetHours: 400, weeklyMinutes: [0, 0, 0, 0, 0], now });
  const weeks = (PROJECT_DEADLINE.getTime() - now.getTime()) / (7 * 86_400_000);
  approx(p.neededPerWeek!, 300 / weeks, "300h over the remaining weeks");
  approx(p.share, 0.25, "a quarter done");
});

test("pace: on track when recent weeks meet the needed rate", () => {
  const p = projectPace({ loggedMinutes: 60 * 60, targetHours: 400, weeklyMinutes: [900, 900, 900, 900, 60], now });
  assert.equal(p.status, "on-track", `recent ${p.recentPerWeek} vs needed ${p.neededPerWeek}`);
  approx(p.recentPerWeek, 15, "the partial current week is ignored");
});

test("pace: behind, not started, and done", () => {
  assert.equal(projectPace({ loggedMinutes: 600, targetHours: 400, weeklyMinutes: [60, 60, 60, 60, 0], now }).status, "behind");
  assert.equal(projectPace({ loggedMinutes: 0, targetHours: 400, weeklyMinutes: [], now }).status, "not-started");
  assert.equal(projectPace({ loggedMinutes: 401 * 60, targetHours: 400, weeklyMinutes: [], now }).status, "done");
});

test("pace: under two full weeks of history is 'early', not 'behind'", () => {
  assert.equal(projectPace({ loggedMinutes: 80, targetHours: 400, weeklyMinutes: [80], now }).status, "early");
  assert.equal(projectPace({ loggedMinutes: 80, targetHours: 400, weeklyMinutes: [80, 0], now }).status, "early");
  assert.equal(projectPace({ loggedMinutes: 80, targetHours: 400, weeklyMinutes: [80, 0, 0], now }).status, "behind");
});

test("month labels sit on the first week that starts in that month", () => {
  const w = timelineWeeks(new Date(2026, 8, 21), new Date(2026, 9, 20));
  const oct = w.find((x) => x.monthLabel === "Oct")!;
  assert.equal(oct.start.getMonth(), 9, "Monday is in October");
  assert.equal(oct.start.getDate(), 5, "w/b 5 Oct, not 28 Sep");
});

test("pace after the deadline doesn't divide by zero", () => {
  const p = projectPace({ loggedMinutes: 60, targetHours: 400, weeklyMinutes: [], now: new Date(2027, 5, 1) });
  assert.equal(p.neededPerWeek, null);
  assert.equal(p.weeksLeft, 0);
});

/* ── Timeline ── */

test("timeline weeks run Monday to Monday and label month changes", () => {
  const w = timelineWeeks(new Date(2026, 8, 23), new Date(2026, 10, 3));
  assert.equal(w[0].start.getDay(), 1);
  assert.equal(w[0].start.getDate(), 21, "w/b 21 Sep");
  assert.equal(w[0].monthLabel, "Sep");
  assert.ok(w.some((x) => x.monthLabel === "Oct") && w.some((x) => x.monthLabel === "Nov"));
  assert.equal(w.filter((x) => x.monthLabel).length, 3, "each month labelled once");
});

test("timeline positions are fractions, clamped to the range", () => {
  const w = timelineWeeks(new Date(2026, 8, 21), new Date(2026, 9, 11)); // 3 weeks
  approx(timelinePosition(new Date(2026, 8, 21), w), 0, "start");
  approx(timelinePosition(new Date(2026, 8, 28), w), 1 / 3, "one week in");
  approx(timelinePosition(new Date(2025, 0, 1), w), 0, "before clamps");
  approx(timelinePosition(new Date(2028, 0, 1), w), 1, "after clamps");
});

test("overlapping bars go on separate rows; later ones reuse freed rows", () => {
  const rows = stackRows([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 12, end: 20 }]);
  assert.deepEqual(rows, [0, 1, 0]);
});

/* ── Agenda ── */

test("agenda draft gathers the facts and leaves room for questions", () => {
  const md = draftAgenda({
    meetingTitle: "Supervisor meeting", since: new Date(2026, 9, 1), minutesLogged: 330, sessions: 4,
    tasksDone: [{ title: "Lit review outline" }], papersRead: [{ title: "LoRA", authors: "Hu et al." }], papersAdded: 2,
    openActions: [{ title: "Email ethics form", fromMeeting: "Thu 1 Oct" }], upcoming: [{ title: "Proposal", due: new Date(2026, 9, 16) }],
    prepOutstanding: [{ title: "Read Smith 2021" }],
  });
  for (const s of ["Since last meeting (Thu 1 Oct)", "**5h 30m** on the project across 4 sessions", "Lit review outline", "LoRA (Hu et al.)", "2 papers added", "Email ethics form _(from Thu 1 Oct)_", "Read Smith 2021", "Proposal - Fri 16 Oct", "Questions / blockers"]) {
    assert.ok(md.includes(s), `missing: ${s}`);
  }
});

test("agenda for the first meeting with nothing logged", () => {
  const md = draftAgenda({ meetingTitle: "x", since: null, minutesLogged: 0, sessions: 0, tasksDone: [], papersRead: [], papersAdded: 0, openActions: [], upcoming: [], prepOutstanding: [] });
  assert.ok(md.includes("Since the start") && md.includes("No project time logged"));
  assert.ok(!md.includes("## Open actions"), "empty sections are left out");
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

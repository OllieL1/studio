/** Livio's table engine (lib/livio/table.ts). */
import assert from "node:assert/strict";
import {
  completions, highlightRanges, matchRanges, parseCommand, parseDateInput, parseQuery,
  resolveField, rowMatches, sortRows, viewFromParams, viewToSearch, type Field, type PageCommand,
} from "../lib/livio/table";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

const FIELDS: Field[] = [
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "sent", label: "Sent", aliases: ["date", "date sent"] },
  { key: "deadline", label: "Deadline", aliases: ["due"] },
  { key: "contact", label: "Contact" },
];
const COMMANDS: PageCommand[] = [
  { name: "cold email", hint: "New cold email", arg: "company" },
  { name: "application", hint: "New application", arg: "company" },
];
// A Thursday.
const NOW = new Date(2026, 9, 22, 15, 0);
const ymd = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : String(d);

test("fields resolve by key, label, alias or unambiguous prefix", () => {
  assert.equal(resolveField(FIELDS, "company"), "company");
  assert.equal(resolveField(FIELDS, "comp"), "company");
  assert.equal(resolveField(FIELDS, "date sent"), "sent");
  assert.equal(resolveField(FIELDS, "due"), "deadline");
  // "co" could be company or contact.
  assert.equal(resolveField(FIELDS, "co"), null);
  assert.equal(resolveField(FIELDS, "s"), null);
});

test("the built-in commands parse", () => {
  assert.deepEqual(parseCommand(":s goo status:wait", COMMANDS, FIELDS), { kind: "search", query: "goo status:wait" });
  assert.deepEqual(parseCommand("s", COMMANDS, FIELDS), { kind: "search", query: "" });
  assert.deepEqual(parseCommand("f", COMMANDS, FIELDS), { kind: "filter" });
  assert.deepEqual(parseCommand("help", COMMANDS, FIELDS), { kind: "help" });
  assert.deepEqual(parseCommand("^ comp", COMMANDS, FIELDS), { kind: "sort", dir: "asc", field: "company", text: "comp" });
  assert.deepEqual(parseCommand("!^deadline", COMMANDS, FIELDS), { kind: "sort", dir: "desc", field: "deadline", text: "deadline" });
});

test("search keeps the query's own capitals", () => {
  assert.deepEqual(parseCommand("s Goldman Sachs", COMMANDS, FIELDS), { kind: "search", query: "Goldman Sachs" });
});

test("page commands run by full name with an argument, or by a unique prefix", () => {
  assert.deepEqual(parseCommand("cold email Monzo Bank", COMMANDS, FIELDS), { kind: "run", name: "cold email", arg: "Monzo Bank" });
  assert.deepEqual(parseCommand("cold", COMMANDS, FIELDS), { kind: "run", name: "cold email", arg: "" });
  assert.deepEqual(parseCommand("app", COMMANDS, FIELDS), { kind: "run", name: "application", arg: "" });
  assert.equal(parseCommand("nonsense", COMMANDS, FIELDS).kind, "unknown");
});

test("aliases take an argument too", () => {
  const cmds = [{ name: "new", hint: "", arg: "title", aliases: ["n"] }, { name: "upload", hint: "", aliases: ["u"] }];
  assert.deepEqual(parseCommand("n Plan for Monday", cmds, []), { kind: "run", name: "new", arg: "Plan for Monday" });
  assert.deepEqual(parseCommand(":u", cmds, []), { kind: "run", name: "upload", arg: "" });
  assert.deepEqual(parseCommand("new", cmds, []), { kind: "run", name: "new", arg: "" });
});

test("off a table, there's no search, sort or filter", () => {
  const cmds = [{ name: "files", hint: "" }, { name: "summary", hint: "", aliases: ["s"] }];
  assert.deepEqual(parseCommand("s", cmds, [], false), { kind: "run", name: "summary", arg: "" });
  assert.equal(parseCommand("f", cmds, [], false).kind, "run", "f is a prefix of files");
  assert.equal(parseCommand("^ title", cmds, [], false).kind, "unknown");
  assert.deepEqual(parseCommand("help", cmds, [], false), { kind: "help" });
  assert.deepEqual(completions("", cmds, [], false).map((c) => c.label), ["files", "summary", "help"]);
});

test("completions follow what's typed", () => {
  assert.deepEqual(completions("co", COMMANDS, FIELDS).map((c) => c.label), ["cold email"]);
  assert.deepEqual(completions("^ d", COMMANDS, FIELDS).map((c) => c.fill), ["^ sent", "^ deadline"]);
  assert.equal(completions("", COMMANDS, FIELDS).length, COMMANDS.length + 5);
  assert.deepEqual(completions("s google", COMMANDS, FIELDS), []);
});

test("queries split into words, phrases and field:value pairs", () => {
  assert.deepEqual(parseQuery('goo status:wait "back and" https://x.com', FIELDS), {
    terms: ["goo", "back and", "https://x.com"],
    scoped: [{ field: "status", value: "wait" }],
  });
  assert.deepEqual(parseQuery('role:"software eng"', FIELDS).scoped, [{ field: "role", value: "software eng" }]);
});

test("matching is substring first, then close fuzzy", () => {
  assert.deepEqual(matchRanges("Google", "oog"), [[1, 4]]);
  assert.deepEqual(matchRanges("Google", "ggle"), [[0, 1], [3, 4], [4, 5], [5, 6]]);
  // Letters in order but scattered across a sentence aren't a match.
  assert.equal(matchRanges("Graduate opportunities in global operations", "goo"), null);
  assert.equal(matchRanges("Google", "gx"), null);
});

test("every word must match somewhere and every field:value in its field", () => {
  const row = { company: "Google", role: "SWE Intern", status: "Waiting" };
  assert.ok(rowMatches(row, parseQuery("goo intern", FIELDS)));
  assert.ok(rowMatches(row, parseQuery("goo status:wait", FIELDS)));
  assert.ok(!rowMatches(row, parseQuery("goo status:offer", FIELDS)));
  assert.ok(!rowMatches(row, parseQuery("role:google", FIELDS)));
});

test("highlights merge overlapping matches", () => {
  assert.deepEqual(highlightRanges("Goodlord", "company", parseQuery("goo good", FIELDS)), [[0, 4]]);
  assert.deepEqual(highlightRanges("Waiting", "status", parseQuery("status:wait", FIELDS)), [[0, 4]]);
  assert.deepEqual(highlightRanges("Waiting", "role", parseQuery("status:wait", FIELDS)), []);
});

test("sorting puts blanks last both ways and sunk rows under the rest", () => {
  const rows = [
    { n: "b", v: 2, closed: false },
    { n: "x", v: null, closed: false },
    { n: "a", v: 1, closed: true },
    { n: "c", v: 3, closed: false },
  ];
  const by = (dir: "asc" | "desc") =>
    sortRows(rows, { field: "v", dir }, (r) => r.v, (r) => r.closed).map((r) => r.n).join("");
  assert.equal(by("asc"), "bcxa");
  assert.equal(by("desc"), "cbxa");
  // No sort: only the sinking, otherwise the order given.
  assert.equal(sortRows(rows, null, (r) => r.v, (r) => r.closed).map((r) => r.n).join(""), "bxca");
});

test("strings sort naturally and without regard to case", () => {
  const rows = ["item 10", "Item 2", "apple"].map((n) => ({ n }));
  assert.deepEqual(sortRows(rows, { field: "n", dir: "asc" }, (r) => r.n).map((r) => r.n), ["apple", "Item 2", "item 10"]);
});

test("the view round-trips through the URL", () => {
  const view = { q: "goo", sort: { field: "deadline", dir: "desc" as const }, filters: { status: ["WAITING", "INTERVIEW"] }, hideClosed: true, layout: "grid" as const };
  const search = viewToSearch(view);
  assert.equal(search, "?q=goo&sort=-deadline&status=WAITING%2CINTERVIEW&hide=closed&layout=grid");
  assert.deepEqual(viewFromParams(Object.fromEntries(new URLSearchParams(search)), ["status", "type"]), view);
  // The default layout stays out of the URL, and a bad one falls back to it.
  assert.equal(viewToSearch({ q: "", sort: null, filters: {}, hideClosed: false, layout: "fit" }), "");
  assert.equal(viewFromParams({ layout: "sideways" }, []).layout, "fit");
});

test("deadlines lean forward", () => {
  assert.equal(ymd(parseDateInput("fri", "future", NOW)), "2026-10-23");
  assert.equal(ymd(parseDateInput("3 nov", "future", NOW)), "2026-11-03");
  assert.equal(ymd(parseDateInput("20/11", "future", NOW)), "2026-11-20");
});

test("sent dates lean back", () => {
  // Thursday 22 Oct: "fri" is the 16th, "thu" is today... a week ago.
  assert.equal(ymd(parseDateInput("fri", "past", NOW)), "2026-10-16");
  assert.equal(ymd(parseDateInput("mon", "past", NOW)), "2026-10-19");
  assert.equal(ymd(parseDateInput("3 oct", "past", NOW)), "2026-10-03");
  assert.equal(ymd(parseDateInput("1 dec", "past", NOW)), "2025-12-01");
  assert.equal(ymd(parseDateInput("yesterday", "past", NOW)), "2026-10-21");
  assert.equal(ymd(parseDateInput("5 days ago", "past", NOW)), "2026-10-17");
  assert.equal(ymd(parseDateInput("2w ago", "past", NOW)), "2026-10-08");
  assert.equal(ymd(parseDateInput("today", "past", NOW)), "2026-10-22");
  // An explicit year means exactly that.
  assert.equal(ymd(parseDateInput("2026-12-01", "past", NOW)), "2026-12-01");
});

test("'last fri' leans back even in a deadline", () => {
  assert.equal(ymd(parseDateInput("last fri", "future", NOW)), "2026-10-16");
});

test("empty clears, and non-dates are refused", () => {
  assert.equal(parseDateInput("", "past", NOW), null);
  assert.equal(parseDateInput("none", "future", NOW), null);
  assert.equal(parseDateInput("whenever", "future", NOW), undefined);
  assert.equal(parseDateInput("fri afternoon", "future", NOW), undefined);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

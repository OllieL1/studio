import { parseTask } from "../parse";
import { addDays, startOfDay } from "../dates";

/**
 * The engine behind Livio's keyboard tables: the `:` command grammar, search,
 * sorting, filters, the view's URL form and typed dates. Pure, so every rule
 * here is tested and the components only draw.
 *
 *   :s goo status:wait      search, with field:value narrowing
 *   :f                      open the filter menu
 *   :^ company              sort ascending      :!^ deadline   descending
 *   :help                   keybinds
 *   :cold email Google      a page's own command, with an argument
 */

export type Field = {
  key: string;
  label: string;
  /** Other words that should find this field: `sent` for "date sent". */
  aliases?: string[];
};

export type PageCommand = {
  name: string;
  hint: string;
  /** Shown after the name when the command takes an argument. */
  arg?: string;
};

export type ParsedCommand =
  | { kind: "search"; query: string }
  | { kind: "sort"; field: string | null; dir: "asc" | "desc"; text: string }
  | { kind: "filter" }
  | { kind: "help" }
  | { kind: "run"; name: string; arg: string }
  | { kind: "unknown"; text: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** A field from what was typed: its key, label or an alias, in full or as an
 *  unambiguous prefix (`comp` → company). */
export function resolveField(fields: Field[], text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  const names = (f: Field) => [f.key, f.label, ...(f.aliases ?? [])].map(norm);
  const exact = fields.find((f) => names(f).includes(t));
  if (exact) return exact.key;
  const prefixed = fields.filter((f) => names(f).some((n) => n.startsWith(t)));
  return prefixed.length === 1 ? prefixed[0].key : null;
}

export function parseCommand(input: string, commands: PageCommand[], fields: Field[]): ParsedCommand {
  const text = norm(input.replace(/^:/, ""));
  const raw = input.replace(/^:/, "").trim();

  const sort = /^(!?)\^\s*(.*)$/.exec(text);
  if (sort) return { kind: "sort", dir: sort[1] ? "desc" : "asc", field: resolveField(fields, sort[2]), text: sort[2] };

  const search = /^(?:s|search)(?:\s+([\s\S]*))?$/.exec(text);
  if (search) return { kind: "search", query: raw.replace(/^(?:s|search)\s*/i, "") };

  if (text === "f" || text === "filter" || text === "filters") return { kind: "filter" };
  if (text === "help" || text === "?" || text === "h") return { kind: "help" };

  // A full name, then anything after it is the argument; the longest name
  // wins so "cold email" isn't read as "cold" + "email".
  const byLength = [...commands].sort((a, b) => b.name.length - a.name.length);
  for (const c of byLength) {
    const n = norm(c.name);
    if (text === n || text.startsWith(`${n} `)) {
      return { kind: "run", name: c.name, arg: raw.slice(c.name.length).trim() };
    }
  }
  // Or an unambiguous start of one: "cold" runs "cold email".
  const prefixed = commands.filter((c) => norm(c.name).startsWith(text));
  if (text && prefixed.length === 1) return { kind: "run", name: prefixed[0].name, arg: "" };

  return { kind: "unknown", text: raw };
}

export type Completion = { label: string; hint: string; fill: string };

const BUILTINS: Completion[] = [
  { label: "s", hint: "Search", fill: "s " },
  { label: "f", hint: "Filter", fill: "f" },
  { label: "^", hint: "Sort ascending by a property", fill: "^ " },
  { label: "!^", hint: "Sort descending by a property", fill: "!^ " },
  { label: "help", hint: "Keyboard shortcuts", fill: "help" },
];

/** Suggestions for what's been typed so far. Tab or ↓ picks one. */
export function completions(input: string, commands: PageCommand[], fields: Field[]): Completion[] {
  const text = norm(input.replace(/^:/, ""));

  const sort = /^(!?)\^\s*(.*)$/.exec(text);
  if (sort) {
    const prefix = sort[1] ? "!^" : "^";
    return fields
      .filter((f) => [f.key, f.label, ...(f.aliases ?? [])].some((n) => norm(n).startsWith(sort[2])))
      .map((f) => ({ label: `${prefix} ${f.label.toLowerCase()}`, hint: sort[1] ? "Z → A, newest first" : "A → Z, oldest first", fill: `${prefix} ${f.key}` }));
  }
  if (/^(?:s|search)\s/.test(text)) return [];

  const page = commands.map((c) => ({ label: c.name, hint: c.hint, fill: c.arg ? `${c.name} ` : c.name }));
  const all = [...page, ...BUILTINS];
  return text ? all.filter((c) => norm(c.label).startsWith(text) || norm(c.hint).startsWith(text)) : all;
}

/* ── Search ─────────────────────────────────────────────────────────────── */

export type Query = { terms: string[]; scoped: { field: string; value: string }[] };

/** Words, "quoted phrases", and field:value pairs whose field resolves. A
 *  pair whose field doesn't resolve stays a plain word - a URL has colons. */
export function parseQuery(q: string, fields: Field[]): Query {
  const out: Query = { terms: [], scoped: [] };
  for (const m of q.matchAll(/(\S+?):"([^"]*)"|"([^"]*)"|(\S+)/g)) {
    const [, qField, qValue, phrase, word] = m;
    if (qField !== undefined) {
      const field = resolveField(fields, qField);
      if (field) { out.scoped.push({ field, value: qValue }); continue; }
    }
    if (phrase !== undefined) { if (phrase.trim()) out.terms.push(phrase); continue; }
    const token = word ?? m[0];
    const colon = token.indexOf(":");
    if (colon > 0 && colon < token.length - 1) {
      const field = resolveField(fields, token.slice(0, colon));
      if (field) { out.scoped.push({ field, value: token.slice(colon + 1) }); continue; }
    }
    out.terms.push(token);
  }
  return out;
}

export type Range = [start: number, end: number];

/**
 * Where `term` occurs in `text`: a substring if there is one, otherwise the
 * letters in order, close together and inside one word ("gogl" finds
 * "Google"). Close means at most three times the term's length - loose
 * enough for a typo, tight enough that three letters don't match every long
 * sentence.
 */
export function matchRanges(text: string, term: string): Range[] | null {
  const t = term.toLowerCase();
  const s = text.toLowerCase();
  if (!t) return [];
  const at = s.indexOf(t);
  if (at >= 0) return [[at, at + t.length]];
  if (t.length < 3) return null;

  // Try each start, keep the tightest subsequence.
  let best: number[] | null = null;
  for (let start = s.indexOf(t[0]); start >= 0; start = s.indexOf(t[0], start + 1)) {
    const idx = [start];
    let i = start + 1;
    for (let k = 1; k < t.length; k++) {
      const next = s.indexOf(t[k], i);
      if (next < 0) { idx.length = 0; break; }
      idx.push(next);
      i = next + 1;
    }
    if (!idx.length) break;
    if (!best || idx[idx.length - 1] - idx[0] < best[best.length - 1] - best[0]) best = idx;
  }
  if (!best || best[best.length - 1] - best[0] + 1 > t.length * 3) return null;
  // Within one word: "goo" shouldn't find "global operations".
  if (/\s/.test(s.slice(best[0], best[best.length - 1]))) return null;
  return best.map((i) => [i, i + 1] as Range);
}

/** Every word somewhere in the row, and every field:value in its field. */
export function rowMatches(texts: Record<string, string>, query: Query): boolean {
  const values = Object.values(texts);
  return (
    query.terms.every((t) => values.some((v) => matchRanges(v, t))) &&
    query.scoped.every(({ field, value }) => matchRanges(texts[field] ?? "", value) !== null)
  );
}

/** The ranges to highlight in one field's text, merged and in order. */
export function highlightRanges(text: string, field: string, query: Query): Range[] {
  const words = [...query.terms, ...query.scoped.filter((s) => s.field === field).map((s) => s.value)];
  const ranges = words.flatMap((w) => matchRanges(text, w) ?? []).sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r] as Range);
  }
  return merged;
}

/* ── Sort and filter ────────────────────────────────────────────────────── */

export type Sort = { field: string; dir: "asc" | "desc" };
export type SortValue = string | number | null;

const collator = new Intl.Collator("en-GB", { numeric: true, sensitivity: "base" });

/**
 * Sorted by the chosen field, blanks last whichever way. Rows that `sink`
 * (closed ones) always go below the rest, each half sorted the same way.
 * Stable, so ties keep the order they came in.
 */
export function sortRows<R>(rows: R[], sort: Sort | null, value: (row: R, field: string) => SortValue, sink?: (row: R) => boolean): R[] {
  const dir = sort?.dir === "desc" ? -1 : 1;
  const compare = (a: R, b: R) => {
    const sa = sink?.(a) ? 1 : 0;
    const sb = sink?.(b) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (!sort) return 0;
    const va = value(a, sort.field);
    const vb = value(b, sort.field);
    const blankA = va === null || va === "";
    const blankB = vb === null || vb === "";
    if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1;
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
    return c * dir;
  };
  return rows.map((r, i) => [r, i] as const).sort((a, b) => compare(a[0], b[0]) || a[1] - b[1]).map(([r]) => r);
}

/* ── The view, in the URL ───────────────────────────────────────────────── */

export type View = {
  q: string;
  sort: Sort | null;
  /** Field → the values to keep. A field that isn't here isn't filtered. */
  filters: Record<string, string[]>;
  hideClosed: boolean;
};

export const EMPTY_VIEW: View = { q: "", sort: null, filters: {}, hideClosed: false };

type Params = Record<string, string | string[] | undefined>;

/** ?q=goo&sort=-deadline&status=WAITING,INTERVIEW&hide=closed */
export function viewFromParams(params: Params, filterKeys: string[]): View {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const s = one("sort");
  const filters: Record<string, string[]> = {};
  for (const k of filterKeys) {
    const values = one(k).split(",").filter(Boolean);
    if (values.length) filters[k] = values;
  }
  return {
    q: one("q"),
    sort: s ? { field: s.replace(/^-/, ""), dir: s.startsWith("-") ? "desc" : "asc" } : null,
    filters,
    hideClosed: one("hide") === "closed",
  };
}

export function viewToSearch(view: View): string {
  const p = new URLSearchParams();
  if (view.q) p.set("q", view.q);
  if (view.sort) p.set("sort", `${view.sort.dir === "desc" ? "-" : ""}${view.sort.field}`);
  for (const [k, values] of Object.entries(view.filters)) if (values.length) p.set(k, values.join(","));
  if (view.hideClosed) p.set("hide", "closed");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ── Typed dates ────────────────────────────────────────────────────────── */

const WEEKDAY = /^(?:last\s+)?(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i;
const EXPLICIT_YEAR = /\d{4}|\/\d{1,2}\/\d{2,4}/;

/**
 * A date as typed into a cell: everything Studio's quick-add understands
 * ("fri", "3 nov", "20/11", "in 2 weeks", "2026-11-20"), plus "yesterday" and
 * "5 days ago". Empty clears the cell.
 *
 * `direction` decides which way a vague date leans. A deadline is ahead of
 * you, so "fri" is this coming Friday; a sent date is behind you, so "fri" is
 * the Friday just gone and "3 oct" is the last 3 October, not next year's.
 * Returns `undefined` when the text isn't a date at all.
 */
export function parseDateInput(text: string, direction: "past" | "future", now: Date = new Date()): Date | null | undefined {
  const t = norm(text);
  if (!t || t === "-" || t === "none" || t === "clear") return null;
  const today = startOfDay(now);
  if (t === "yesterday") return addDays(today, -1);
  const ago = /^(\d{1,3})\s*(d|days?|w|weeks?)\s+ago$/.exec(t);
  if (ago) return addDays(today, -Number(ago[1]) * (ago[2].startsWith("w") ? 7 : 1));

  const parsed = parseTask(t.replace(/^last\s+/, ""), [], now);
  if (!parsed.dueDate || parsed.title) return undefined;
  const [y, m, d] = parsed.dueDate.split("-").map(Number);
  let date = new Date(y, m - 1, d);

  // "last fri" leans back whichever field it's typed into.
  if ((direction === "past" || t.startsWith("last ")) && date > today) {
    if (WEEKDAY.test(t)) date = addDays(date, -7);
    else if (!EXPLICIT_YEAR.test(t) && !/^(tomorrow|in\s)/.test(t)) date = new Date(y - 1, m - 1, d);
  }
  return date;
}

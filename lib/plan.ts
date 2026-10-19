import { addDays, startOfDay, startOfWeek, toISODate } from "./dates";

/* ──────────────────────────────────────────────────────────────────────────
   Weekly schedule

   The plan is a list of time blocks laid over the fixed week (classes,
   meetings, Google events). Blocks are typed one line at a time, the same
   way as the quick-add box:

     "FP exercise 3 9-11"   → 09:00–11:00, Functional Programming
     "20-21 PSI reading"    → 20:00–21:00
     "essay 2h"             → two hours, straight after the entry above

   Everything here is pure, so the parsing and the sync diff are testable.
   ────────────────────────────────────────────────────────────────────────── */

export type PlanCourse = { id: string; shortName: string; code: string; name: string };

export type ParsedEntry = {
  title: string;
  courseId: string | null;
  /** Minutes from midnight, when a time was typed. */
  start: number | null;
  end: number | null;
  /** "2h", "90m" - a length without a time. */
  duration: number | null;
  matched: { text: string; type: "time" | "duration" | "course" }[];
};

/** How long a block is when nothing says otherwise. */
export const DEFAULT_MINUTES = 60;
/** Where the first block of an empty day starts. */
export const DAY_START = 9 * 60;

const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?`;

export function parseEntry(raw: string, courses: PlanCourse[]): ParsedEntry {
  let text = ` ${raw} `;
  const out: ParsedEntry = { title: "", courseId: null, start: null, end: null, duration: null, matched: [] };

  const eat = (re: RegExp, type: ParsedEntry["matched"][number]["type"], fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (!m || fn(m) === false) return false;
    out.matched.push({ text: m[0].trim(), type });
    text = text.replace(m[0], " ");
    return true;
  };

  // Duration first, so "1.5h" isn't read as a time of 1:50.
  eat(/\s(\d{1,2})h(\d{2})(?=\s)/i, "duration", (m) => { out.duration = Number(m[1]) * 60 + Number(m[2]); }) ||
    eat(/\s(\d{1,2}(?:\.\d+)?)\s*(?:h|hrs?|hours?)(?=\s)/i, "duration", (m) => { out.duration = Math.round(Number(m[1]) * 60); }) ||
    eat(/\s(\d{1,3})\s*(?:m|mins?|minutes?)(?=\s)/i, "duration", (m) => { out.duration = Number(m[1]); });
  if (out.duration !== null && out.duration <= 0) out.duration = null;

  // A range: "9-11", "9 - 11", "9.30-11", "2-4pm", "9am to 1".
  const rangeFound = eat(new RegExp(String.raw`\s${T}\s*(?:-|–|—|to)\s*${T}(?=\s)`, "i"), "time", (m) => {
    const r = resolveRange(
      { h: Number(m[1]), m: Number(m[2] ?? 0), ap: m[3]?.toLowerCase() },
      { h: Number(m[4]), m: Number(m[5] ?? 0), ap: m[6]?.toLowerCase() },
    );
    if (!r) return false;
    out.start = r.start;
    out.end = r.end;
  });

  // A single start time, only in an unmistakable form - "14:00", "9.30",
  // "3pm", "at 4" - so "Weekly quiz 4" keeps its number.
  if (!rangeFound) {
    eat(/\s(?:at\s+)?(\d{1,2})[:.](\d{2})\s*(am|pm)?(?=\s)/i, "time", (m) => {
      const s = clock({ h: Number(m[1]), m: Number(m[2]), ap: m[3]?.toLowerCase() });
      if (s === null) return false;
      out.start = s;
    }) ||
      eat(/\s(?:at\s+)?(\d{1,2})\s*(am|pm)(?=\s)/i, "time", (m) => {
        const s = clock({ h: Number(m[1]), m: 0, ap: m[2].toLowerCase() });
        if (s === null) return false;
        out.start = s;
      }) ||
      eat(/\sat\s+(\d{1,2})(?=\s)/i, "time", (m) => {
        const s = clock({ h: Number(m[1]), m: 0 });
        if (s === null) return false;
        out.start = s;
      });
  }

  // Course: "@fp", or a bare short name / code - as the quick-add box.
  for (const c of courses) {
    const re = new RegExp(String.raw`\s@?(${escapeRe(c.shortName)}|${escapeRe(c.code)})(?=\s)`, "i");
    if (eat(re, "course", () => { out.courseId = c.id; })) break;
  }

  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}

type Clock = { h: number; m: number; ap?: string };

/**
 * A typed hour as minutes from midnight. With no am/pm, 1–7 means the
 * afternoon - nobody time-blocks 3am - and 8–23 is taken as written.
 */
function clock({ h, m, ap }: Clock, assumePm = true): number | null {
  if (h > 24 || m > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && assumePm && h >= 1 && h <= 7) h += 12;
  const v = h * 60 + m;
  return v > 24 * 60 ? null : v;
}

function resolveRange(a: Clock, b: Clock): { start: number; end: number } | null {
  // "9-11pm" means 21–23, "10-2pm" means 10–14: an am/pm on the end alone
  // carries to the start only when the start can't be morning.
  let start = clock(a);
  let end = clock(b);
  if (start === null || end === null) return null;
  if (!a.ap && b.ap === "pm" && start < 12 * 60 && start + 12 * 60 < end) start += 12 * 60;
  if (!a.ap && b.ap === "am" && start >= 12 * 60 && start - 12 * 60 < end) start -= 12 * 60;
  // "11-1" runs into the afternoon.
  if (end <= start && !b.ap && end + 12 * 60 > start && end < 12 * 60) end += 12 * 60;
  if (end <= start) return null;
  return { start, end: Math.min(end, 24 * 60) };
}

/**
 * Where a block goes. A typed time wins; otherwise it slots in beside the
 * entry it was added from - straight after it when added below, ending
 * as it starts when added above - so time blocking stays one keystroke.
 */
export function resolveSlot(
  parsed: Pick<ParsedEntry, "start" | "end" | "duration">,
  anchor: { start: number; end: number } | null,
  direction: "below" | "above",
): { start: number; end: number } {
  const length = parsed.duration ?? DEFAULT_MINUTES;
  if (parsed.start !== null) {
    const end = parsed.end ?? Math.min(parsed.start + length, 24 * 60);
    return { start: parsed.start, end: Math.max(end, parsed.start + 5) };
  }
  if (!anchor) return { start: DAY_START, end: Math.min(DAY_START + length, 24 * 60) };
  if (direction === "below") {
    const start = Math.min(anchor.end, 24 * 60 - 5);
    return { start, end: Math.min(start + length, 24 * 60) };
  }
  const end = Math.max(anchor.start, 5);
  return { start: Math.max(end - length, 0), end };
}

/** "09:00" for 540. 1440 reads as "24:00". */
export function fmtMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "1h", "1h 30m", "45m". */
export function fmtLength(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* ── Ranges ──────────────────────────────────────────────────────────────── */

export const MAX_DAYS = 14;

export type PlanRange = { from: Date; days: number; preset: "this" | "next" | "custom" };

/**
 * The range a /plan link asks for. Defaults to this week from Monday; a
 * from/days pair that lands on a whole week is still called that week.
 */
export function planRange(params: { from?: string; days?: string }, now: Date = new Date()): PlanRange {
  const thisWeek = startOfWeek(now);
  const from = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? parseISO(params.from) : thisWeek;
  const days = clampDays(Number(params.days) || 7);
  const preset =
    days === 7 && sameDay(from, thisWeek) ? "this"
      : days === 7 && sameDay(from, addDays(thisWeek, 7)) ? "next"
        : "custom";
  return { from: startOfDay(from), days, preset };
}

export function clampDays(n: number) {
  return Math.min(MAX_DAYS, Math.max(1, Math.round(n)));
}

export function rangeHref(from: Date, days: number) {
  return `/plan?from=${toISODate(from)}&days=${days}`;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "19 – 25 Oct", "28 Oct – 3 Nov", "21 Oct" for one day. */
export function rangeLabel(from: Date, days: number) {
  const to = addDays(from, days - 1);
  if (days === 1) return `${from.getDate()} ${MONTH[from.getMonth()]}`;
  return from.getMonth() === to.getMonth()
    ? `${from.getDate()} – ${to.getDate()} ${MONTH[to.getMonth()]}`
    : `${from.getDate()} ${MONTH[from.getMonth()]} – ${to.getDate()} ${MONTH[to.getMonth()]}`;
}

function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a: Date, b: Date) {
  return toISODate(a) === toISODate(b);
}

/* ── Sync ────────────────────────────────────────────────────────────────── */

export type SyncBlock = {
  id: string;
  title: string;
  courseShort: string | null;
  startAt: Date;
  endAt: Date;
  calendarEventId: string | null;
  syncedHash: string | null;
  deletedAt: Date | null;
};

/** The Google event's title: "FP · Exercise 3", or just the title. */
export function eventSummary(b: Pick<SyncBlock, "title" | "courseShort">) {
  return b.courseShort && !b.title.toLowerCase().startsWith(b.courseShort.toLowerCase())
    ? `${b.courseShort} · ${b.title}`
    : b.title;
}

/** Everything Google is told about a block. Change any of it and it re-syncs. */
export function blockHash(b: Pick<SyncBlock, "title" | "courseShort" | "startAt" | "endAt">) {
  return `${eventSummary(b)}|${b.startAt.toISOString()}|${b.endAt.toISOString()}`;
}

export type SyncState = "new" | "changed" | "removed" | "synced";

export function syncState(b: SyncBlock): SyncState {
  if (b.deletedAt) return "removed";
  if (!b.calendarEventId) return "new";
  return b.syncedHash === blockHash(b) ? "synced" : "changed";
}

/**
 * What a sync has to do, block by block: create the new, patch the
 * changed, delete the removed - never a second copy of anything already
 * on Google. Removed blocks that never reached Google need nothing.
 */
export function syncPlan(blocks: SyncBlock[]) {
  const ops = { create: [] as SyncBlock[], update: [] as SyncBlock[], remove: [] as SyncBlock[] };
  for (const b of blocks) {
    const s = syncState(b);
    if (s === "new") ops.create.push(b);
    else if (s === "changed") ops.update.push(b);
    else if (s === "removed" && b.calendarEventId) ops.remove.push(b);
  }
  return ops;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

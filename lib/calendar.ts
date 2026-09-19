import { addDays, fmtDate, fmtDateYear, fmtMonthYear, startOfDay, startOfWeek, toISODate } from "./dates";

/* ──────────────────────────────────────────────────────────────────────────
   Calendar model

   Everything that can appear on the calendar — deadlines, classes, uni
   events and Google events — is normalised into one CalendarItem shape so
   the month and week views render a single list rather than four.
   ────────────────────────────────────────────────────────────────────────── */

export type CalendarSource = "deadline" | "class" | "event" | "meeting" | "google";
export type CalendarView = "month" | "week";

export type CalendarItem = {
  id: string;
  source: CalendarSource;
  title: string;
  /** ISO strings — these cross the server/client boundary. */
  start: string;
  end: string;
  allDay: boolean;
  colour: string | null;
  courseShort: string | null;
  href: string | null;
  /** Exams and heavily-weighted coursework, drawn as blocked-out days. */
  blocked: boolean;
  done: boolean;
  kind: string | null;
  gradeWeight: number | null;
  location: string | null;
  /** Local uni events can be edited in place; everything else links out. */
  editable: boolean;
  onGoogle: boolean;
  notes: string | null;
  courseId: string | null;
};

/** Coursework at or above this share of a course's mark is blocked out like an exam. */
export const BIG_WEIGHT_THRESHOLD = 15;

export function isBlocked(kind: string, gradeWeight: number | null): boolean {
  if (kind === "EXAM") return true;
  return kind === "COURSEWORK" && gradeWeight != null && gradeWeight >= BIG_WEIGHT_THRESHOLD;
}

/* ── Ranges ─────────────────────────────────────────────────────────────── */

/**
 * The span a view shows. Month is always six full Monday-start weeks, so the
 * grid never changes height between months — nothing jumps as you page through.
 */
export function viewRange(view: CalendarView, anchor: Date): { start: Date; end: Date; days: Date[] } {
  if (view === "week") {
    const start = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return { start, end: addDays(start, 7), days };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return { start, end: addDays(start, 42), days };
}

/** The anchor date for the previous / next page of a view. */
export function shiftAnchor(view: CalendarView, anchor: Date, dir: -1 | 1): Date {
  if (view === "week") return addDays(anchor, 7 * dir);
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}

export function viewTitle(view: CalendarView, anchor: Date): string {
  if (view === "month") {
    return fmtMonthYear(anchor);
  }
  const { start } = viewRange("week", anchor);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const a = sameMonth ? String(start.getDate()) : fmtDate(start);
  const b = fmtDateYear(end);
  return `${a} – ${b}`;
}

/* ── Placing items on days ──────────────────────────────────────────────── */

/**
 * Every local day an item touches. An all-day item's end is exclusive (as in
 * Google), so a one-day event on the 3rd spans [3rd, 4th) and appears once.
 */
export function daysTouched(item: Pick<CalendarItem, "start" | "end" | "allDay">): string[] {
  const s = new Date(item.start);
  let e = new Date(item.end);
  if (e <= s) e = new Date(s.getTime() + 1); // zero-length points still land on their day

  const out: string[] = [];
  let d = startOfDay(s);
  // Timed items ending exactly at midnight don't spill into the next day.
  const last = item.allDay || (e.getHours() === 0 && e.getMinutes() === 0 && e > s)
    ? new Date(e.getTime() - 1)
    : e;
  const stop = startOfDay(last).getTime();
  while (d.getTime() <= stop) {
    out.push(toISODate(d));
    d = addDays(d, 1);
    if (out.length > 62) break; // guard against a runaway multi-month event
  }
  return out;
}

export function itemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    for (const day of daysTouched(item)) {
      const list = map.get(day) ?? [];
      list.push(item);
      map.set(day, list);
    }
  }
  for (const list of map.values()) list.sort(dayOrder);
  return map;
}

/** Blocked items first, then all-day, then by time, then title. */
export function dayOrder(a: CalendarItem, b: CalendarItem): number {
  if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const t = new Date(a.start).getTime() - new Date(b.start).getTime();
  return t !== 0 ? t : a.title.localeCompare(b.title);
}

/* ── Week view layout ───────────────────────────────────────────────────── */

export type PlacedItem = {
  item: CalendarItem;
  /** Minutes from midnight, clamped to the day. */
  top: number;
  bottom: number;
  /** Which column within its overlap cluster, and how many columns there are. */
  col: number;
  cols: number;
};

/**
 * Lay out one day's timed items so overlapping ones sit side by side.
 *
 * Items are grouped into clusters of transitively-overlapping events; within
 * a cluster each item takes the first column that's free at its start time,
 * and every item in the cluster shares the cluster's column count. This is
 * the standard calendar layout — no item is ever drawn over another.
 */
export function layoutDay(items: CalendarItem[], day: Date, minHeight = 20): PlacedItem[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const spans = items
    .filter((i) => !i.allDay)
    .map((item) => {
      const s = Math.max(new Date(item.start).getTime(), dayStart);
      const e = Math.min(new Date(item.end).getTime(), dayEnd);
      const top = (s - dayStart) / 60000;
      // Very short items still get a clickable minimum height.
      const bottom = Math.max((e - dayStart) / 60000, top + minHeight);
      return { item, top, bottom };
    })
    .filter((x) => x.bottom > x.top)
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const placed: PlacedItem[] = [];
  let cluster: { item: CalendarItem; top: number; bottom: number; col: number }[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols = cluster.reduce((m, x) => Math.max(m, x.col + 1), 0);
    for (const x of cluster) placed.push({ ...x, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const span of spans) {
    if (span.top >= clusterEnd && cluster.length > 0) flush();

    // First column whose last occupant has finished by the time this starts.
    const colEnds: number[] = [];
    for (const x of cluster) colEnds[x.col] = Math.max(colEnds[x.col] ?? -Infinity, x.bottom);
    let col = 0;
    while (colEnds[col] !== undefined && colEnds[col] > span.top) col++;

    cluster.push({ ...span, col });
    clusterEnd = Math.max(clusterEnd, span.bottom);
  }
  if (cluster.length > 0) flush();

  return placed;
}

/** The hour window a week view shows: 08:00–20:00, widened to fit anything outside it. */
export function hourWindow(items: CalendarItem[], days: Date[]): { from: number; to: number } {
  let from = 8;
  let to = 20;
  const first = startOfDay(days[0]).getTime();
  const last = addDays(startOfDay(days[days.length - 1]), 1).getTime();

  for (const i of items) {
    if (i.allDay) continue;
    const s = new Date(i.start);
    const e = new Date(i.end);
    if (e.getTime() <= first || s.getTime() >= last) continue;
    from = Math.min(from, s.getHours());
    const endHour = e.getMinutes() > 0 ? e.getHours() + 1 : e.getHours();
    // An item running past midnight shouldn't stretch the view to 24:00.
    if (startOfDay(e).getTime() === startOfDay(s).getTime()) to = Math.max(to, endHour);
  }
  return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Sortable key for an exam diet label, e.g. "December 2026" → 202612,
 * "April/May 2027" → 202704. Alphabetical order would put April 2027 before
 * December 2026. Unparseable labels sort last.
 */
export function dietOrder(diet: string | null): number {
  if (!diet) return Number.MAX_SAFE_INTEGER;
  const year = diet.match(/(20\d{2})/)?.[1];
  const month = diet.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/)?.[1];
  if (!year) return Number.MAX_SAFE_INTEGER;
  return Number(year) * 100 + (month ? MONTH_INDEX[month] : 12);
}

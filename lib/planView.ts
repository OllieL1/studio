import type { CalendarItem } from "./calendar";
import { addDays, startOfDay, toISODate } from "./dates";

/* ──────────────────────────────────────────────────────────────────────────
   The schedule as the editor draws it: one section per day, each a
   chronological list of fixed events and planned blocks. Pure, so the
   ordering and the keyboard path through it are testable.
   ────────────────────────────────────────────────────────────────────────── */

export type BlockLike = { id: string; title: string; courseId: string | null; start: string; end: string };

export type Row<B extends BlockLike = BlockLike> =
  | { key: string; type: "fixed"; item: CalendarItem; start: number; end: number; hidden: boolean }
  | { key: string; type: "block"; block: B; start: number; end: number }
  | { key: string; type: "empty" };

export type PlanDay<B extends BlockLike = BlockLike> = {
  iso: string;
  date: Date;
  /** Deadlines and all-day events: shown above the day, not in its timeline. */
  chips: { item: CalendarItem; hidden: boolean }[];
  rows: Row<B>[];
  hiddenCount: number;
  plannedMinutes: number;
};

export const blockKey = (id: string) => `b:${id}`;
export const emptyKey = (iso: string) => `empty:${iso}`;

/** Minutes of `day` an interval covers, clamped to the day. Null if it misses. */
function onDay(startISO: string, endISO: string, day: Date): { start: number; end: number } | null {
  const d0 = day.getTime();
  const d1 = addDays(day, 1).getTime();
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  if (e <= d0 || s >= d1) return null;
  return { start: Math.round((Math.max(s, d0) - d0) / 60000), end: Math.round((Math.min(e, d1) - d0) / 60000) };
}

export function buildDays<B extends BlockLike>({
  from, days, fixed, blocks, hidden, showHidden,
}: {
  from: Date;
  days: number;
  fixed: CalendarItem[];
  blocks: B[];
  hidden: Set<string>;
  /** Days whose left-off events are shown (struck through) so they can be put back. */
  showHidden: Set<string>;
}): PlanDay<B>[] {
  const out: PlanDay<B>[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(startOfDay(from), i);
    const iso = toISODate(date);
    const reveal = showHidden.has(iso);
    const chips: PlanDay<B>["chips"] = [];
    const rows: Row<B>[] = [];
    let hiddenCount = 0;

    for (const item of fixed) {
      const span = onDay(item.start, item.end, date);
      // Deadlines are a moment stored as all-day; they belong to their own day only.
      if (!span || (item.source === "deadline" && toISODate(new Date(item.start)) !== iso)) continue;
      const isHidden = hidden.has(item.id);
      if (isHidden) hiddenCount++;
      if (isHidden && !reveal) continue;
      if (item.allDay) chips.push({ item, hidden: isHidden });
      else rows.push({ key: item.id, type: "fixed", item, ...span, hidden: isHidden });
    }

    let plannedMinutes = 0;
    for (const block of blocks) {
      if (toISODate(new Date(block.start)) !== iso) continue;
      const span = onDay(block.start, block.end, date);
      if (!span) continue;
      plannedMinutes += span.end - span.start;
      rows.push({ key: blockKey(block.id), type: "block", block, ...span });
    }

    rows.sort((a, b) => {
      if (a.type === "empty" || b.type === "empty") return 0;
      return a.start - b.start
        || (a.type === b.type ? 0 : a.type === "fixed" ? -1 : 1)
        || a.end - b.end;
    });
    out.push({ iso, date, chips, rows: rows.length ? rows : [{ key: emptyKey(iso), type: "empty" }], hiddenCount, plannedMinutes });
  }
  return out;
}

/** Every row the arrow keys can land on, in reading order. */
export function navKeys(days: PlanDay[]): string[] {
  return days.flatMap((d) => d.rows.map((r) => r.key));
}

/** Where ← / → go: the first row of the previous or next day. */
export function dayJump(days: PlanDay[], key: string | null, dir: -1 | 1): string | null {
  if (!days.length) return null;
  const at = key ? days.findIndex((d) => d.rows.some((r) => r.key === key)) : -1;
  const target = days[Math.min(days.length - 1, Math.max(0, at === -1 ? 0 : at + dir))];
  return target.rows[0].key;
}

/** Minutes of free time between two rows worth pointing out. */
export const GAP_WORTH_SHOWING = 60;

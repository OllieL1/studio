/**
 * Uni-event time handling, kept out of app/actions.ts so it's testable.
 *
 * All-day events store an **exclusive** end — midnight after the last day —
 * the same convention Google uses, so a synced event never disagrees with
 * Google about how many days it spans.
 */

export type EventInput = {
  title: string;
  date: string;              // YYYY-MM-DD
  endDate?: string | null;   // YYYY-MM-DD, all-day only; defaults to `date`
  startTime?: string | null; // HH:MM, timed only
  endTime?: string | null;   // HH:MM, timed only
  allDay: boolean;
  location?: string | null;
  notes?: string | null;
  courseId?: string | null;
  syncToGoogle: boolean;
};

export function hhmmToMin(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function parseLocal(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function resolveEventTimes(
  input: Pick<EventInput, "date" | "endDate" | "startTime" | "endTime" | "allDay">,
): { ok: true; startAt: Date; endAt: Date } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Pick a date." };

  if (input.allDay) {
    const startAt = parseLocal(input.date);
    const last = input.endDate ? parseLocal(input.endDate) : startAt;
    if (last < startAt) return { ok: false, error: "The end date is before the start." };
    const endAt = new Date(last);
    endAt.setDate(endAt.getDate() + 1); // exclusive
    return { ok: true, startAt, endAt };
  }

  const s = hhmmToMin(input.startTime);
  const e = hhmmToMin(input.endTime);
  if (s == null) return { ok: false, error: "Pick a start time." };
  if (e == null) return { ok: false, error: "Pick an end time." };
  if (e <= s) return { ok: false, error: "End time must be after the start time." };

  const startAt = parseLocal(input.date);
  startAt.setHours(Math.floor(s / 60), s % 60, 0, 0);
  const endAt = parseLocal(input.date);
  endAt.setHours(Math.floor(e / 60), e % 60, 0, 0);
  return { ok: true, startAt, endAt };
}

/**
 * The last day an all-day event covers, from its exclusive end.
 *
 * Steps back one *calendar* day rather than 24 hours: the day the clocks go
 * forward is only 23 hours long, and subtracting 24h would land on the day
 * before — turning a one-day event into a zero-length one.
 */
export function inclusiveEnd(exclusiveEnd: Date): Date {
  const d = new Date(exclusiveEnd);
  d.setDate(d.getDate() - 1);
  return d;
}

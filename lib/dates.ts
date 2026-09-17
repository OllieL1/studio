/** Date helpers. Everything is computed in **local time** — this is a
 *  single-user app running on one machine, and "today" should mean the day
 *  Ollie is actually looking at, not a UTC day boundary. */

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Local midnight at the start of the given date. */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

/** ISO 1–7 where Monday = 1, matching ScheduleSlot.dayOfWeek. */
export function isoDayOfWeek(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Whole days from today to `d` — negative means overdue. Compares day
 *  boundaries, not elapsed hours, so "due at 16:30 today" reads as 0 not -1. */
export function daysUntil(d: Date, from: Date = new Date()): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(d).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Local-time Date at a given `YYYY-MM-DD` plus minutes-from-midnight. */
export function atMinutes(isoDate: string, minutes: number): Date {
  const [y, m, day] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** `YYYY-MM-DD` in local time (not toISOString, which shifts to UTC). */
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "2h 15m" / "45m" / "3h". Used everywhere a duration is displayed. */
export function fmtDuration(mins: number): string {
  if (mins < 1) return "0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "01:23:45" for the live timer. */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Human-relative deadline copy: "Overdue by 2d", "Today", "In 5d". */
export function fmtRelative(d: Date, from: Date = new Date()): string {
  const n = daysUntil(d, from);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${Math.abs(n)}d overdue`;
  if (n < 7) return `In ${n}d`;
  if (n < 14) return "Next week";
  return `In ${Math.floor(n / 7)}w`;
}

/** Urgency band for a deadline, driving the semantic colours. */
export type Urgency = "overdue" | "soon" | "upcoming" | "far" | "none";

export function urgencyOf(due: Date | null, done: boolean): Urgency {
  if (done || !due) return "none";
  const n = daysUntil(due);
  if (n < 0) return "overdue";
  if (n <= 3) return "soon";
  if (n <= 10) return "upcoming";
  return "far";
}

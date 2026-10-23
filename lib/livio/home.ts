import { addDays, endOfDay, startOfDay } from "../dates";
import { isClosed, isStale, quietDays, STATUS_LABEL, STATUSES, type CareerStatus } from "../careers";

/**
 * Livio's home: what needs attention, what today holds, how the study's
 * going and where the job hunt stands - each boiled down to the few lines
 * worth reading at a glance. Pure, so tested.
 */

type CareerLike = {
  id: string;
  type: string;
  status: string;
  company: string;
  role: string | null;
  deadline: Date | null;
  sentAt: Date | null;
  statusChangedAt: Date | null;
  createdAt: Date;
};

export type CareersSummary = {
  stale: { id: string; company: string; days: number }[];
  /** Applications due in the next seven days, soonest first. */
  deadlines: { id: string; company: string; role: string | null; deadline: Date }[];
  /** Open entries by status, in pipeline order, empty ones left out. */
  pipeline: { status: CareerStatus; label: string; count: number }[];
  open: number;
};

export function careersSummary(rows: CareerLike[], now: Date): CareersSummary {
  const open = rows.filter((r) => !isClosed(r.status));
  const until = endOfDay(addDays(now, 7));
  return {
    stale: rows
      .filter((r) => isStale(r, now))
      .map((r) => ({ id: r.id, company: r.company || "Untitled", days: quietDays(r, now)! }))
      .sort((a, b) => b.days - a.days),
    deadlines: open
      .filter((r) => r.type === "APPLICATION" && r.deadline && r.deadline >= startOfDay(now) && r.deadline <= until)
      .map((r) => ({ id: r.id, company: r.company || "Untitled", role: r.role, deadline: r.deadline! }))
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime()),
    pipeline: STATUSES.filter((s) => !isClosed(s))
      .map((status) => ({ status, label: STATUS_LABEL[status], count: open.filter((r) => r.status === status).length }))
      .filter((p) => p.count),
    open: open.length,
  };
}

export type Attention = { key: string; count: number; label: string; tone: "danger" | "warn" | "info"; href: string; studio?: boolean };

/** The things worth a look, worst first; nothing at all when all is well. */
export function attention(c: {
  overdueTodos: number;
  overdueStudio: number;
  stale: number;
  dueSoon: number;
  inbox: number;
}): Attention[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const items: Attention[] = [
    { key: "overdue-todos", count: c.overdueTodos, label: plural(c.overdueTodos, "overdue todo", "overdue todos"), tone: "danger", href: "/livio/todo" },
    { key: "overdue-studio", count: c.overdueStudio, label: plural(c.overdueStudio, "overdue in Studio", "overdue in Studio"), tone: "danger", href: "/", studio: true },
    { key: "due-soon", count: c.dueSoon, label: plural(c.dueSoon, "due in the next 48 hours", "due in the next 48 hours"), tone: "warn", href: "/livio/todo" },
    { key: "stale", count: c.stale, label: plural(c.stale, "cold email to chase", "cold emails to chase"), tone: "warn", href: "/livio/careers" },
    { key: "inbox", count: c.inbox, label: plural(c.inbox, "task from Notion to sort", "tasks from Notion to sort"), tone: "info", href: "/livio/todo" },
  ];
  return items.filter((i) => i.count > 0);
}

/**
 * Minutes studied on an average day, over the days before today - today
 * isn't over, so counting it would drag the average down every morning.
 * Days with nothing count, or a single long day would read as the norm.
 */
export function dailyAverage(series: { date: Date; minutes: number }[], now: Date): number | null {
  const before = series.filter((d) => d.date < startOfDay(now));
  if (!before.length) return null;
  return before.reduce((s, d) => s + d.minutes, 0) / before.length;
}

type Timed = { start: string; end: string; allDay: boolean };

/**
 * Today split for drawing: the all-day things (deadlines, all-day events),
 * the timed ones in order, and where "now" falls among them - before the
 * first thing that hasn't finished yet.
 */
export function splitDay<T extends Timed>(items: T[], now: Date): { allDay: T[]; timed: T[]; nowAt: number } {
  const allDay = items.filter((i) => i.allDay);
  const timed = items.filter((i) => !i.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const nowAt = timed.findIndex((i) => new Date(i.end) > now);
  return { allDay, timed, nowAt: nowAt < 0 ? timed.length : nowAt };
}

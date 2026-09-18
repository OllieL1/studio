import { startOfDay, isoDayOfWeek, DAY_SHORT } from "./dates";

/**
 * Time-tracking metrics for a single task.
 *
 * A session can be tagged to several tasks, and it records no split between
 * them — so its time is shared evenly across the tasks it was tagged to.
 * Attributing the whole session to every task would double-count; this keeps
 * the sum of all tasks' time equal to the time actually logged.
 */

export type TaskSession = {
  id: string;
  name: string;
  startedAt: Date;
  minutes: number;
  focus: number;
  /** How many tasks this session was tagged to, including this one. */
  taskCount: number;
};

export type TaskMetrics = {
  minutes: number;
  sessions: number;
  avgFocus: number | null;
  avgSessionMinutes: number | null;
  firstWorked: Date | null;
  lastWorked: Date | null;
  activeDays: number;
  /** True when at least one session was shared with other tasks. */
  hasSharedSessions: boolean;
  byWeekday: { label: string; minutes: number }[];
  /** Cumulative minutes over time, oldest first — shows momentum on the task. */
  cumulative: { date: Date; minutes: number }[];
};

export function attributedMinutes(s: TaskSession): number {
  return s.minutes / Math.max(1, s.taskCount);
}

export function computeTaskMetrics(sessions: TaskSession[]): TaskMetrics {
  const sorted = [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const minutes = sorted.reduce((s, x) => s + attributedMinutes(x), 0);

  const focusWeighted = sorted.reduce((s, x) => s + x.focus * attributedMinutes(x), 0);

  const byDay = new Map<number, number>();
  const weekday = new Array(7).fill(0);
  for (const s of sorted) {
    const k = startOfDay(s.startedAt).getTime();
    byDay.set(k, (byDay.get(k) ?? 0) + attributedMinutes(s));
    weekday[isoDayOfWeek(s.startedAt) - 1] += attributedMinutes(s);
  }

  let running = 0;
  const cumulative = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, m]) => {
      running += m;
      return { date: new Date(t), minutes: running };
    });

  return {
    minutes,
    sessions: sorted.length,
    avgFocus: minutes > 0 ? focusWeighted / minutes : null,
    avgSessionMinutes: sorted.length > 0 ? minutes / sorted.length : null,
    firstWorked: sorted[0]?.startedAt ?? null,
    lastWorked: sorted[sorted.length - 1]?.startedAt ?? null,
    activeDays: byDay.size,
    hasSharedSessions: sorted.some((s) => s.taskCount > 1),
    byWeekday: weekday.map((m, i) => ({ label: DAY_SHORT[i], minutes: m })),
    cumulative,
  };
}

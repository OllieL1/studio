/**
 * Pausing and Rapt Mode (called "ultra focus" in the code) - pure, so the timer bar, the proxy (proxy.ts) and
 * the server actions share one set of rules, and the tests can pin them.
 *
 * Rapt Mode locks Studio to one course - its page, its lectures and
 * tasks - or to the project, until a chosen time. The only ways out are
 * that time arriving or the session ending. It's enforced on the server, in
 * the proxy, so a reload, a typed address or a bookmark can't step round it.
 */

export type TimerClock = { startedAt: Date; pausedAt: Date | null; pausedMs: number };

/** Time actually studied: since the start, less every pause (including one still going). */
export function studiedMs(t: TimerClock, now = new Date()): number {
  const until = t.pausedAt ?? now;
  return Math.max(0, until.getTime() - t.startedAt.getTime() - t.pausedMs);
}

/** Ending a pause: what it adds to the paused total. */
export function pausedTotalAfterResume(t: TimerClock, now = new Date()): number {
  return t.pausedMs + (t.pausedAt ? Math.max(0, now.getTime() - t.pausedAt.getTime()) : 0);
}

/** Rapt Mode's quick picks, in minutes; anything else is typed (parseDuration). */
export const LOCK_PRESETS = [25, 50, 90] as const;
export const LOCK_MIN_MINUTES = 5;
export const LOCK_MAX_MINUTES = 240;

/**
 * A typed length in minutes, or null if it isn't one. Takes the ways a time
 * gets written in a hurry: "75", "75m", "75 min", "2h", "1.5h", "1h 15",
 * "1h15m", "1 hour 15 minutes", "1:15".
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  const clock = t.match(/^(\d+):(\d{1,2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hm = t.match(/^(\d+(?:\.\d+)?) ?(?:h|hr|hrs|hour|hours)(?: ?(\d+) ?(?:m|min|mins|minute|minutes)?)?$/);
  if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2] ?? 0));
  const m = t.match(/^(\d+) ?(?:m|min|mins|minute|minutes)?$/);
  if (m) return Number(m[1]);
  return null;
}

/** "25m", "90m", "1h 15m" - how a length reads back. */
export function fmtLockLength(min: number): string {
  if (min < 60 || LOCK_PRESETS.includes(min as (typeof LOCK_PRESETS)[number])) return `${min}m`;
  return min % 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min / 60}h`;
}

export type Lock = { courseId: string; until: Date };

/** The lock in force, or null - a lock whose time has come is no lock. */
export function activeLock(t: { lockCourseId: string | null; lockUntil: Date | null } | null, now = new Date()): Lock | null {
  if (!t?.lockCourseId || !t.lockUntil || t.lockUntil.getTime() <= now.getTime()) return null;
  return { courseId: t.lockCourseId, until: t.lockUntil };
}

/** Where a locked Studio lives: the project page, or the course's page. */
export const lockHome = (course: { id: string; isProject: boolean }) =>
  course.isProject ? "/project" : `/courses/${course.id}`;

/**
 * May this path be visited under the lock? "task" means it's a lecture or
 * task page, allowed only if that task belongs to the locked course - the
 * caller looks it up.
 */
export function lockAllows(
  path: string,
  course: { id: string; isProject: boolean },
): "yes" | "no" | { task: string } {
  const p = path.replace(/\/+$/, "") || "/";
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  // A PDF exported from the locked pages opens in a tab of its own.
  if (under("/pdf")) return "yes";
  if (under(`/courses/${course.id}`)) return "yes";
  if (course.isProject && under("/project")) return "yes";
  const task = p.match(/^\/(?:tasks|lectures)\/([^/]+)/);
  if (task) return { task: task[1] };
  return "no";
}

import { db } from "./db";
import { addDays, endOfDay, startOfDay } from "./dates";
import { visibleCourseWhere } from "./types";
import { getCalendarItems } from "./calendarData";
import { isGoogleConfigured, listCalendars } from "./google";
import { syncState, type SyncState } from "./plan";
import { DEFAULT_SLEEP, type Sleep } from "./planView";

const PLAN_DUE_KINDS = ["COURSEWORK", "QUIZ"];

/** A planned block as the editor sees it. ISO strings cross to the client. */
export type PlanBlockView = {
  id: string;
  title: string;
  courseId: string | null;
  start: string;
  end: string;
  state: SyncState;
};

const blockInclude = { course: { select: { shortName: true } } } as const;

type BlockRow = Awaited<ReturnType<typeof db.planBlock.findFirstOrThrow<{ include: typeof blockInclude }>>>;

export function toView(b: BlockRow): PlanBlockView {
  return {
    id: b.id,
    title: b.title,
    courseId: b.courseId,
    start: b.startAt.toISOString(),
    end: b.endAt.toISOString(),
    state: syncState({ ...b, courseShort: b.course?.shortName ?? null }),
  };
}

export async function blockView(id: string) {
  return toView(await db.planBlock.findUniqueOrThrow({ where: { id }, include: blockInclude }));
}

/** Everything the /plan page shows for a range. */
export async function getPlan(from: Date, days: number) {
  const start = startOfDay(from);
  const end = addDays(start, days);
  const [{ items, googleConnected, googleError }, blocks, hidden, courses, target, sleep] = await Promise.all([
    getCalendarItems(start, end, { withPlan: false }),
    db.planBlock.findMany({ where: { startAt: { gte: start, lt: end } }, include: blockInclude, orderBy: { startAt: "asc" } }),
    db.planHidden.findMany({ select: { key: true } }),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, code: true, colour: true },
    }),
    planCalendar({ lookup: true }),
    getSleep(),
  ]);

  return {
    // Only coursework and quizzes are "due" on the plan - ad-hoc tasks and
    // the rest have their own lists and would crowd each day's header.
    fixed: items.filter((i) => i.source !== "deadline" || PLAN_DUE_KINDS.includes(i.kind ?? "")),
    blocks: blocks.filter((b) => !b.deletedAt).map(toView),
    /** Removed blocks whose Google event is still to be deleted. */
    removed: blocks.filter((b) => b.deletedAt).length,
    hidden: hidden.map((h) => h.key),
    courses,
    googleConnected,
    googleError,
    calendar: target,
    sleep,
  };
}

export async function getSleep(): Promise<Sleep> {
  try {
    const p = await db.preference.findUnique({ where: { id: "singleton" }, select: { sleepOn: true, sleepFrom: true, sleepTo: true } });
    return p ? { on: p.sleepOn, from: p.sleepFrom, to: p.sleepTo } : DEFAULT_SLEEP;
  } catch {
    // An older database without the columns yet.
    return DEFAULT_SLEEP;
  }
}

/**
 * The Google calendar planned blocks are written to: the one chosen in
 * Settings, else one called "Studio" (remembered once found). `lookup`
 * allows the network call that finds it; without it only a saved choice
 * counts.
 */
export async function planCalendar({ lookup }: { lookup: boolean }): Promise<{ id: string; name: string | null } | null> {
  if (!isGoogleConfigured()) return null;
  const auth = await db.googleAuth.findUnique({ where: { id: "singleton" }, select: { planCalendarId: true } });
  if (!auth) return null;
  if (!lookup) return auth.planCalendarId ? { id: auth.planCalendarId, name: null } : null;

  let calendars: { id: string; summary: string }[] = [];
  try {
    calendars = await listCalendars();
  } catch {
    // Offline: a saved choice still stands, it just can't be named.
    return auth.planCalendarId ? { id: auth.planCalendarId, name: null } : null;
  }
  if (auth.planCalendarId) {
    return { id: auth.planCalendarId, name: calendars.find((c) => c.id === auth.planCalendarId)?.summary ?? null };
  }
  const studio = calendars.find((c) => c.summary.trim().toLowerCase() === "studio");
  if (!studio) return null;
  await db.googleAuth.update({ where: { id: "singleton" }, data: { planCalendarId: studio.id } });
  return { id: studio.id, name: studio.summary };
}

/** Today's planned blocks, for the home page. */
export async function getDayPlan(day: Date) {
  return db.planBlock.findMany({
    where: { deletedAt: null, startAt: { gte: startOfDay(day), lte: endOfDay(day) } },
    include: { course: { select: { shortName: true, colour: true } } },
    orderBy: { startAt: "asc" },
  });
}

import { after } from "next/server";
import { db } from "./db";
import { firePushcut } from "./pushcut";

/**
 * The two timers - study and Sovrano - never count the same minute. Starting
 * (or resuming) one pauses the other if it's running; the paused one waits
 * for a resume by hand. A pause, not a stop: the session's still yours to log.
 */

/** Pause the Sovrano timer if it's running. Called as study starts or resumes. */
export async function pauseSovranoIfRunning(now = new Date()) {
  await db.sovranoTimer.updateMany({ where: { id: "singleton", pausedAt: null }, data: { pausedAt: now } });
}

/** Pause the study timer if it's running. Called as Sovrano starts or resumes. */
export async function pauseStudyIfRunning(now = new Date()) {
  const { count } = await db.activeTimer.updateMany({ where: { id: "singleton", pausedAt: null }, data: { pausedAt: now } });
  // The same as pausing it from the bar: phone Focus goes off with it.
  if (count > 0) after(() => firePushcut("end"));
}

/** The running Sovrano clock, as the bar and the hotkey want it. */
export async function getSovranoClock() {
  const t = await db.sovranoTimer.findUnique({ where: { id: "singleton" } });
  return t ? { startedAt: t.startedAt.toISOString(), pausedAt: t.pausedAt?.toISOString() ?? null, pausedMs: t.pausedMs } : null;
}

/** Projects for the log dialog: most recently worked first, each with the platform it was last worked under. */
export async function getSovranoProjects() {
  const projects = await db.sovranoProject.findMany({
    select: {
      id: true,
      name: true,
      rateCents: true,
      sessions: { orderBy: { startedAt: "desc" }, take: 1, select: { platform: true, startedAt: true } },
    },
  });
  return projects
    .map((p) => ({ id: p.id, name: p.name, rateCents: p.rateCents, lastPlatform: p.sessions[0]?.platform ?? null, lastAt: p.sessions[0]?.startedAt.getTime() ?? 0 }))
    .sort((a, b) => b.lastAt - a.lastAt || a.name.localeCompare(b.name))
    .map(({ lastAt: _, ...p }) => p);
}

export type SovranoProjectOption = Awaited<ReturnType<typeof getSovranoProjects>>[number];
export type SovranoClock = NonNullable<Awaited<ReturnType<typeof getSovranoClock>>>;

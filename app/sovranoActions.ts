"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { pausedTotalAfterResume, studiedMs } from "@/lib/ultraFocus";
import { centsFor, isPlatform, type Platform, type SovSession } from "@/lib/sovrano";
import { pauseStudyIfRunning } from "@/lib/sovranoData";

/*
 * Sovrano - paid work, timed. The timer is server state like the study one
 * (a singleton row), so it survives reloads, closed tabs and crashes. Both
 * apps show it, so a change refreshes both layouts.
 */

function refresh() {
  revalidatePath("/", "layout");
  revalidatePath("/livio", "layout");
}

/* ── The timer ─────────────────────────────────────────────────────────── */

/** Start a session - or, if one's already going, say when it started. Pauses study. */
export async function startSovrano() {
  const existing = await db.sovranoTimer.findUnique({ where: { id: "singleton" } });
  if (existing) return { startedAt: existing.startedAt.toISOString(), fresh: false };
  const now = new Date();
  await pauseStudyIfRunning(now);
  const t = await db.sovranoTimer.create({ data: { id: "singleton", startedAt: now } });
  refresh();
  return { startedAt: t.startedAt.toISOString(), fresh: true };
}

export async function pauseSovrano() {
  await db.sovranoTimer.updateMany({ where: { id: "singleton", pausedAt: null }, data: { pausedAt: new Date() } });
  refresh();
}

/** Back to work: the pause is banked, and study pauses if it was running. */
export async function resumeSovrano() {
  const t = await db.sovranoTimer.findUnique({ where: { id: "singleton" } });
  if (!t?.pausedAt) return;
  const now = new Date();
  await pauseStudyIfRunning(now);
  await db.sovranoTimer.update({ where: { id: "singleton" }, data: { pausedAt: null, pausedMs: pausedTotalAfterResume(t, now) } });
  refresh();
}

/** Throw the running session away, unlogged. */
export async function cancelSovrano() {
  await db.sovranoTimer.deleteMany({ where: { id: "singleton" } });
  refresh();
}

export type StopSovranoInput = {
  name: string;
  /** An existing project - or `newProject` to make one. */
  projectId: string | null;
  newProject?: string | null;
  platform: string;
  /** Adjusted down from the tracked time; never above it. */
  minutes: number;
};

export async function stopSovrano(input: StopSovranoInput) {
  const timer = await db.sovranoTimer.findUnique({ where: { id: "singleton" } });
  if (!timer) return { ok: false as const, error: "No Sovrano session is running." };
  if (!isPlatform(input.platform)) return { ok: false as const, error: "Pick Sovrano or DataAnnotation." };
  const newName = input.newProject?.trim().slice(0, 80);
  if (!input.projectId && !newName) return { ok: false as const, error: "Pick a project, or name a new one." };

  const endedAt = new Date();
  const rawMinutes = Math.round(studiedMs(timer, endedAt) / 60000);
  // Down-only, clamped rather than rejected: a stale form can't inflate it.
  const minutes = Math.max(0, Math.min(Math.round(input.minutes), rawMinutes));

  const session = await db.$transaction(async (tx) => {
    const projectId = newName
      ? // Typing a name that already exists means that project, not a clash.
        (await tx.sovranoProject.upsert({ where: { name: newName }, update: {}, create: { name: newName } })).id
      : input.projectId!;
    const created = await tx.sovranoSession.create({
      data: {
        name: input.name.trim().slice(0, 200) || "Work session",
        projectId,
        platform: input.platform,
        startedAt: timer.startedAt,
        endedAt,
        minutes,
        rawMinutes,
      },
    });
    await tx.sovranoTimer.deleteMany({ where: { id: "singleton" } });
    return created;
  });
  refresh();
  return { ok: true as const, id: session.id, minutes };
}

export type LogSovranoInput = Omit<StopSovranoInput, "minutes"> & { minutes: number; startedAt: Date };

/** Longest stretch `:log` takes in one go - a typo guard, not a rule about work. */
const MAX_LOGGED_MINUTES = 16 * 60;

/**
 * Log work that wasn't timed (`:log` on the page) - forgot to press ⌥W,
 * or worked away from the machine. There's no tracked time to trim from, so
 * the length is taken as given, within reason, and can't end in the future.
 */
export async function logSovrano(input: LogSovranoInput) {
  if (!isPlatform(input.platform)) return { ok: false as const, error: "Pick Sovrano or DataAnnotation." };
  const newName = input.newProject?.trim().slice(0, 80);
  if (!input.projectId && !newName) return { ok: false as const, error: "Pick a project, or name a new one." };
  const minutes = Math.round(input.minutes);
  if (!Number.isFinite(minutes) || minutes < 1) return { ok: false as const, error: "How long was it? Try 45, 1h20 or 1:20." };
  if (minutes > MAX_LOGGED_MINUTES) return { ok: false as const, error: "That's over 16 hours - log it as more than one session." };
  const startedAt = new Date(input.startedAt);
  if (Number.isNaN(startedAt.getTime())) return { ok: false as const, error: "Pick when it started." };
  const endedAt = new Date(startedAt.getTime() + minutes * 60_000);
  if (endedAt.getTime() > Date.now() + 60_000) return { ok: false as const, error: "That would end in the future - pick an earlier start." };

  const session = await db.$transaction(async (tx) => {
    const projectId = newName
      ? (await tx.sovranoProject.upsert({ where: { name: newName }, update: {}, create: { name: newName } })).id
      : input.projectId!;
    return tx.sovranoSession.create({
      data: { name: input.name.trim().slice(0, 200) || "Work session", projectId, platform: input.platform, startedAt, endedAt, minutes, rawMinutes: minutes },
    });
  });
  // A new project belongs in the bar's dialog too.
  if (newName) refresh();
  return { ok: true as const, session, project: await db.sovranoProject.findUniqueOrThrow({ where: { id: session.projectId } }) };
}

/* ── The page ──────────────────────────────────────────────────────────
   The table edits optimistically and swaps in what these return, like the
   other Livio boards - so these don't revalidate the page under an edit. */

export type SovranoRow = SovSession & { createdAt: Date };
export type SovranoProjectRow = { id: string; name: string; rateCents: number | null; createdAt: Date };

export async function listSovrano(): Promise<{ sessions: SovranoRow[]; projects: SovranoProjectRow[] }> {
  const [sessions, projects] = await Promise.all([
    db.sovranoSession.findMany({ orderBy: { startedAt: "desc" } }),
    db.sovranoProject.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { sessions, projects };
}

export type SovranoPatch = Partial<{ name: string; projectId: string; platform: Platform; minutes: number }>;

export async function updateSovranoSession(id: string, patch: SovranoPatch): Promise<SovranoRow> {
  const s = await db.sovranoSession.findUniqueOrThrow({ where: { id } });
  const data: SovranoPatch = {};
  if (patch.name !== undefined) data.name = patch.name.trim().slice(0, 200) || s.name;
  if (patch.projectId !== undefined && (await db.sovranoProject.count({ where: { id: patch.projectId } }))) data.projectId = patch.projectId;
  if (patch.platform !== undefined && isPlatform(patch.platform)) data.platform = patch.platform;
  // Still down-only: never past what was tracked.
  if (patch.minutes !== undefined && Number.isFinite(patch.minutes)) data.minutes = Math.max(0, Math.min(Math.round(patch.minutes), s.rawMinutes));
  return db.sovranoSession.update({ where: { id }, data });
}

export async function deleteSovranoSession(id: string) {
  await db.sovranoSession.deleteMany({ where: { id } });
}

/** Undo a delete: put it back exactly as it was. */
export async function restoreSovranoSession(row: SovranoRow): Promise<SovranoRow> {
  return db.sovranoSession.create({ data: row });
}

/**
 * Mark sessions paid (or not). Paying freezes each one's value at its
 * project's rate right now; unpaying lets it follow the rate again. A
 * session whose project has no rate is paid at $0 - so it's refused, and
 * the reason given, rather than recorded as worthless.
 */
export async function setSovranoPaid(ids: string[], paid: boolean) {
  const sessions = await db.sovranoSession.findMany({ where: { id: { in: ids } }, include: { project: { select: { rateCents: true, name: true } } } });
  if (!paid) {
    await db.sovranoSession.updateMany({ where: { id: { in: ids } }, data: { paidAt: null, paidCents: null } });
    return { ok: true as const, rows: (await listSovrano()).sessions };
  }
  const unrated = [...new Set(sessions.filter((s) => !s.paidAt && s.project.rateCents == null).map((s) => s.project.name))];
  if (unrated.length) return { ok: false as const, error: `Give ${unrated.join(", ")} a rate first (:rate).` };
  const now = new Date();
  await db.$transaction(
    sessions
      .filter((s) => !s.paidAt)
      .map((s) => db.sovranoSession.update({ where: { id: s.id }, data: { paidAt: now, paidCents: centsFor(s.minutes, s.project.rateCents!) } })),
  );
  return { ok: true as const, rows: (await listSovrano()).sessions };
}

export async function setSovranoRate(projectId: string, rateCents: number | null) {
  if (rateCents != null && (!Number.isFinite(rateCents) || rateCents < 0)) throw new Error("A rate is dollars an hour.");
  return db.sovranoProject.update({ where: { id: projectId }, data: { rateCents } });
}

export async function createSovranoProject(name: string, rateCents: number | null = null) {
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false as const, error: "Name the project." };
  if (await db.sovranoProject.findUnique({ where: { name: n } })) return { ok: false as const, error: `There's already a project called ${n}.` };
  const project = await db.sovranoProject.create({ data: { name: n, rateCents } });
  refresh();
  return { ok: true as const, project };
}

export async function renameSovranoProject(id: string, name: string) {
  const n = name.trim().slice(0, 80);
  if (!n) return { ok: false as const, error: "Name the project." };
  const clash = await db.sovranoProject.findUnique({ where: { name: n } });
  if (clash && clash.id !== id) return { ok: false as const, error: `There's already a project called ${n}.` };
  const project = await db.sovranoProject.update({ where: { id }, data: { name: n } });
  refresh();
  return { ok: true as const, project };
}

/** Only a project with no sessions can go - its history stays otherwise. */
export async function deleteSovranoProject(id: string) {
  const used = await db.sovranoSession.count({ where: { projectId: id } });
  if (used) return { ok: false as const, error: `It has ${used} ${used === 1 ? "session" : "sessions"} - move or delete those first.` };
  await db.sovranoProject.delete({ where: { id } });
  refresh();
  return { ok: true as const };
}

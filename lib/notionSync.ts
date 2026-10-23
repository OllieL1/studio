import { db } from "./db";
import { explainNotionError, queryUnsynced, setStatus, setSynced } from "./notion";
import { triageFromTitle } from "./livio/todo";
import { visibleCourseWhere } from "./types";

/**
 * Notion ⇄ Livio. Tasks jotted into Notion land in an inbox; entering one
 * makes it a real task and ticks Synced in Notion; ticking that task off -
 * in Livio or Studio - writes Done back.
 *
 * Notion being unreachable is never an error worth more than a line: the
 * stick is often on a train.
 */

/** How long a pull is good for before opening Livio pulls again. */
export const PULL_EVERY_MS = 5 * 60_000;

export type PullResult =
  | { ok: true; added: number; removed: number; skipped?: boolean }
  | { ok: false; error: string };

export async function pullNotion(force = false): Promise<PullResult> {
  const auth = await db.notionAuth.findUnique({ where: { id: "singleton" } });
  if (!auth) return { ok: false, error: "Notion isn't connected." };
  if (!force && auth.lastPulledAt && Date.now() - auth.lastPulledAt.getTime() < PULL_EVERY_MS) {
    return { ok: true, added: 0, removed: 0, skipped: true };
  }

  let pages;
  try {
    pages = await queryUnsynced(auth.token, auth.dataSourceId);
  } catch (e) {
    return { ok: false, error: explainNotionError(e) };
  }

  // Already entered, but the Synced tick didn't reach Notion last time: tick
  // it now rather than offer the task a second time.
  const entered = new Set(
    (await db.task.findMany({ where: { notionPageId: { in: pages.map((p) => p.pageId) } }, select: { notionPageId: true } }))
      .map((t) => t.notionPageId),
  );
  for (const p of pages.filter((p) => entered.has(p.pageId))) {
    await setSynced(auth.token, p.pageId, true).catch(() => {});
  }

  // Finished on the phone before it ever got here: nothing left to do.
  const fresh = pages.filter((p) => !entered.has(p.pageId) && p.status !== "Done");
  const existing = new Set((await db.notionInboxItem.findMany({ select: { pageId: true } })).map((i) => i.pageId));
  const toAdd = fresh.filter((p) => !existing.has(p.pageId));
  const courses = toAdd.length
    ? await db.course.findMany({ where: visibleCourseWhere(), select: { id: true, shortName: true, code: true, name: true } })
    : [];
  for (const p of toAdd) {
    // "problem sheet @fp fri !" typed on the phone arrives already triaged.
    const t = triageFromTitle(p.title, courses);
    await db.notionInboxItem.create({
      data: { pageId: p.pageId, title: t.title, dueAt: p.dueAt ?? t.dueAt, courseId: t.courseId, priority: t.priority },
    });
  }

  // Gone from Notion, ticked there, or finished: drop it from the inbox too.
  const keep = fresh.map((p) => p.pageId);
  const removed = await db.notionInboxItem.deleteMany({ where: { pageId: { notIn: keep } } });

  const statusType = pages[0]?.statusType ?? auth.statusType;
  await db.notionAuth.update({ where: { id: "singleton" }, data: { lastPulledAt: new Date(), statusType } });
  return { ok: true, added: toAdd.length, removed: removed.count };
}

/** Turn an inbox item into a task, then tick Synced in Notion. */
export async function enterInboxItem(id: string): Promise<{ taskId: string; toCalendar: boolean; dueAt: Date | null } | null> {
  const item = await db.notionInboxItem.findUnique({ where: { id } });
  if (!item) return null;
  const task = await db.task.create({
    data: {
      title: item.title,
      kind: "OTHER",
      courseId: item.courseId,
      dueAt: item.dueAt,
      priority: item.priority ? 1 : 0,
      notionPageId: item.pageId,
    },
  });
  await db.notionInboxItem.delete({ where: { id } });

  const auth = await db.notionAuth.findUnique({ where: { id: "singleton" } });
  // If this fails the next pull sees the page still unsynced, finds the task
  // already made, and ticks it then.
  if (auth) await setSynced(auth.token, item.pageId, true).catch(() => {});
  return { taskId: task.id, toCalendar: item.toCalendar, dueAt: item.dueAt };
}

export type InboxItem = Awaited<ReturnType<typeof db.notionInboxItem.findUniqueOrThrow>>;

/** Not worth a task: tick it Synced in Notion and let it go. */
export async function dismissInboxItem(id: string): Promise<InboxItem | null> {
  const item = await db.notionInboxItem.findUnique({ where: { id } });
  if (!item) return null;
  await db.notionInboxItem.delete({ where: { id } });
  const auth = await db.notionAuth.findUnique({ where: { id: "singleton" } });
  if (auth) await setSynced(auth.token, item.pageId, true).catch(() => {});
  return item;
}

/** Undo a dismiss: back in the inbox, and unticked in Notion. */
export async function restoreInboxItem(item: InboxItem): Promise<void> {
  const { id, ...data } = item;
  await db.notionInboxItem.upsert({ where: { pageId: item.pageId }, update: data, create: { id, ...data } });
  const auth = await db.notionAuth.findUnique({ where: { id: "singleton" } });
  if (auth) await setSynced(auth.token, item.pageId, false).catch(() => {});
}

/**
 * After a task is ticked or unticked anywhere: if it came from Notion, say
 * so there. Quietly does nothing for every other task, or offline.
 */
export async function notionDoneSync(taskId: string): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { notionPageId: true, doneAt: true } });
  if (!task?.notionPageId) return;
  const auth = await db.notionAuth.findUnique({ where: { id: "singleton" } });
  if (!auth) return;
  await setStatus(auth.token, task.notionPageId, auth.statusType, task.doneAt ? "Done" : "Not Started").catch(() => {});
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseLocalDate } from "@/lib/dates";
import { blockView } from "@/lib/planData";
import { syncPlanRange } from "@/lib/planSync";

function refresh() {
  revalidatePath("/", "layout");
}

export type BlockInput = {
  title: string;
  courseId: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** Minutes from midnight. */
  start: number;
  end: number;
};

function times(input: BlockInput) {
  const day = parseLocalDate(input.date);
  const at = (min: number) => new Date(day.getTime() + min * 60_000);
  const start = Math.max(0, Math.min(input.start, 24 * 60 - 5));
  const end = Math.max(start + 5, Math.min(input.end, 24 * 60));
  return { startAt: at(start), endAt: at(end) };
}

function clean(input: BlockInput) {
  const title = input.title.trim().slice(0, 200);
  return title ? { title, courseId: input.courseId, ...times(input) } : null;
}

export async function createBlock(input: BlockInput) {
  const data = clean(input);
  if (!data) return { ok: false as const, error: "Give it a name." };
  const b = await db.planBlock.create({ data });
  refresh();
  return { ok: true as const, block: await blockView(b.id) };
}

export async function updateBlock(id: string, input: BlockInput) {
  const data = clean(input);
  if (!data) return { ok: false as const, error: "Give it a name." };
  await db.planBlock.update({ where: { id }, data });
  refresh();
  return { ok: true as const, block: await blockView(id) };
}

/**
 * Take a block off the schedule. If it's on Google it's kept, marked
 * removed, until the next sync deletes the event; otherwise it just goes.
 */
export async function deleteBlock(id: string) {
  const b = await db.planBlock.findUnique({ where: { id } });
  if (!b) return { ok: true as const };
  if (b.calendarEventId) await db.planBlock.update({ where: { id }, data: { deletedAt: new Date() } });
  else await db.planBlock.delete({ where: { id } });
  refresh();
  return { ok: true as const };
}

/** Undo a delete: un-remove it if it's still held for sync, else re-create it. */
export async function restoreBlock(id: string, input: BlockInput) {
  const held = await db.planBlock.findUnique({ where: { id } });
  if (held) {
    await db.planBlock.update({ where: { id }, data: { deletedAt: null } });
    refresh();
    return { ok: true as const, block: await blockView(id) };
  }
  return createBlock(input);
}

/** Leave a fixed event off the schedule, or put it back. Never touches the event. */
export async function setHidden(key: string, hidden: boolean) {
  if (hidden) await db.planHidden.upsert({ where: { key }, update: {}, create: { key } });
  else await db.planHidden.deleteMany({ where: { key } });
  refresh();
  return { ok: true as const };
}

export async function setPlanCalendar(calendarId: string) {
  await db.googleAuth.update({ where: { id: "singleton" }, data: { planCalendarId: calendarId } });
  refresh();
}

/** Make Google match the schedule for a range. See lib/planSync.ts. */
export async function syncRange(fromISO: string, days: number) {
  const res = await syncPlanRange(parseLocalDate(fromISO), days);
  refresh();
  return res;
}

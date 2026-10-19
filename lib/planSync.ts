import { db } from "./db";
import { addDays } from "./dates";
import { deleteEvent, upsertEvent } from "./google";
import { blockHash, eventSummary, syncPlan, type SyncBlock } from "./plan";
import { planCalendar } from "./planData";

/**
 * Make Google match the schedule for a range: create what's new, patch what
 * changed, delete what was removed. Each block remembers its event and what
 * Google was last sent, so running it twice changes nothing.
 *
 * Kept out of the server action so it can be tested without a request.
 */
export async function syncPlanRange(from: Date, days: number) {
  const target = await planCalendar({ lookup: true });
  if (!target) {
    return { ok: false as const, error: "Choose a calendar for the schedule in Settings → Google Calendar." };
  }

  const rows = await db.planBlock.findMany({
    where: { startAt: { gte: from, lt: addDays(from, days) } },
    include: { course: { select: { shortName: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const blocks: SyncBlock[] = rows.map((r) => ({ ...r, courseShort: r.course?.shortName ?? null }));
  // A block written to a calendar that's no longer the target moves: it's
  // re-created in the new one and deleted from the old.
  const ops = syncPlan(blocks.map((b) => {
    const row = byId.get(b.id)!;
    return row.calendarEventId && row.calendarId && row.calendarId !== target.id && !row.deletedAt
      ? { ...b, syncedHash: null }
      : b;
  }));

  let created = 0, updated = 0, removed = 0;
  const errors: string[] = [];

  try {
    for (const b of [...ops.create, ...ops.update]) {
      const row = byId.get(b.id)!;
      const moving = !!row.calendarEventId && !!row.calendarId && row.calendarId !== target.id;
      const res = await upsertEvent(
        { summary: eventSummary(b), description: "Planned in Studio", start: b.startAt, end: b.endAt, allDay: false },
        moving ? null : row.calendarEventId,
        target.id,
      );
      if (!res.ok) { errors.push(res.error); continue; }
      if (moving) await deleteEvent(row.calendarEventId!, row.calendarId!);
      await db.planBlock.update({
        where: { id: b.id },
        data: { calendarEventId: res.eventId, calendarId: target.id, syncedHash: blockHash(b) },
      });
      if (row.calendarEventId && !moving) updated++; else created++;
    }

    for (const b of ops.remove) {
      const row = byId.get(b.id)!;
      const ok = await deleteEvent(row.calendarEventId!, row.calendarId ?? target.id);
      if (!ok) { errors.push("Google wouldn't delete an event."); continue; }
      await db.planBlock.delete({ where: { id: b.id } });
      removed++;
    }
  } catch {
    // No network at all: whatever synced before the drop is recorded, the
    // rest is still pending and goes next time.
    errors.push("Couldn't reach Google - check your connection.");
  }

  return {
    ok: errors.length === 0,
    created, updated, removed,
    error: errors.length ? `${errors.length} change${errors.length === 1 ? "" : "s"} didn't sync: ${errors[0]}` : null,
  } as const;
}

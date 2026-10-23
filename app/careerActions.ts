"use server";

import { db } from "@/lib/db";
import { startOfDay } from "@/lib/dates";
import {
  isCareerType, isStatus, newEntryDefaults, normaliseLink, parseContact, SENDING, statusForType, statusesFor,
  type CareerStatus, type CareerType,
} from "@/lib/careers";

/*
 * Livio careers. The table edits optimistically and swaps in what these
 * return, so nothing here revalidates: a refresh landing mid-edit would put
 * the old value back under the cursor. Livio's pages are dynamic, so the
 * next visit to any of them reads fresh anyway.
 */

export type CareerRow = {
  id: string;
  type: CareerType;
  company: string;
  role: string | null;
  contactName: string | null;
  contactEmail: string | null;
  status: CareerStatus;
  statusChangedAt: Date | null;
  sentAt: Date | null;
  link: string | null;
  deadline: Date | null;
  notesMd: string | null;
  createdAt: Date;
};

export type CareerPatch = Partial<{
  type: string;
  company: string;
  role: string;
  /** "Jane Doe jane@acme.com" - split by parseContact. */
  contact: string;
  status: string;
  sentAt: Date | null;
  deadline: Date | null;
  link: string;
  notesMd: string;
}>;

const blank = (s: string | undefined) => (s?.trim() ? s.trim() : null);

function toRow(e: Awaited<ReturnType<typeof db.careerEntry.findUniqueOrThrow>>): CareerRow {
  return {
    ...e,
    type: isCareerType(e.type) ? e.type : "COLD_EMAIL",
    status: isStatus(e.status) ? e.status : "TODO",
  };
}

export async function listCareers(): Promise<CareerRow[]> {
  const rows = await db.careerEntry.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toRow);
}

export async function createCareer(type: string, company = ""): Promise<CareerRow> {
  if (!isCareerType(type)) throw new Error(`Unknown type ${type}`);
  const now = new Date();
  const { status, sentAt } = newEntryDefaults(type, startOfDay(now));
  const row = await db.careerEntry.create({ data: { type, company: company.trim(), status, sentAt } });
  return toRow(row);
}

/**
 * One edit from the table. The server keeps the rules: a status must fit the
 * type, a type change carries the status across, moving status restarts the
 * stale clock, and marking something sent fills an empty Sent date.
 */
export async function updateCareer(id: string, patch: CareerPatch): Promise<CareerRow> {
  const current = toRow(await db.careerEntry.findUniqueOrThrow({ where: { id } }));
  const data: Record<string, unknown> = {};
  let type = current.type;
  let status = current.status;

  if (patch.type !== undefined && isCareerType(patch.type) && patch.type !== type) {
    type = patch.type;
    data.type = type;
    // Deadlines belong to applications.
    if (type === "COLD_EMAIL") data.deadline = null;
  }
  if (patch.status !== undefined && isStatus(patch.status) && statusesFor(type).includes(patch.status)) {
    status = patch.status;
  }
  status = statusForType(status, type);
  if (status !== current.status) {
    data.status = status;
    data.statusChangedAt = new Date();
    if (SENDING.includes(status) && !current.sentAt && patch.sentAt === undefined) data.sentAt = startOfDay(new Date());
  }

  if (patch.company !== undefined) data.company = patch.company.trim();
  if (patch.role !== undefined) data.role = blank(patch.role);
  if (patch.contact !== undefined) Object.assign(data, parseContact(patch.contact));
  if (patch.link !== undefined) data.link = normaliseLink(patch.link);
  if (patch.notesMd !== undefined) data.notesMd = blank(patch.notesMd);
  if (patch.sentAt !== undefined) data.sentAt = patch.sentAt;
  if (patch.deadline !== undefined && type === "APPLICATION") data.deadline = patch.deadline;

  const row = await db.careerEntry.update({ where: { id }, data });
  return toRow(row);
}

export async function deleteCareer(id: string) {
  await db.careerEntry.deleteMany({ where: { id } });
}

/** Undo for a delete: the row comes back exactly as it was, id and all. */
export async function restoreCareer(row: CareerRow): Promise<CareerRow> {
  const { id, type, company, role, contactName, contactEmail, status, statusChangedAt, sentAt, link, deadline, notesMd, createdAt } = row;
  const data = { type, company, role, contactName, contactEmail, status, statusChangedAt, sentAt, link, deadline, notesMd, createdAt };
  const restored = await db.careerEntry.upsert({ where: { id }, update: data, create: { id, ...data } });
  return toRow(restored);
}

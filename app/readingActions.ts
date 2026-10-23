"use server";

import { db } from "@/lib/db";
import { lookupPaper } from "@/lib/papers";
import { normaliseLink } from "@/lib/careers";
import {
  authorLine, datesForStatus, guessType, isReadingStatus, isReadingType,
  type ReadingStatus, type ReadingType,
} from "@/lib/reading";
import { startOfDay } from "@/lib/dates";

/*
 * Livio's reading list. As with careers, the table edits optimistically and
 * swaps in what these return; nothing here revalidates.
 */

export type ReadingRow = {
  id: string;
  title: string;
  author: string | null;
  type: ReadingType;
  status: ReadingStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  rating: number | null;
  link: string | null;
  takeaway: string | null;
  notesMd: string | null;
  createdAt: Date;
};

export type ReadingPatch = Partial<{
  title: string;
  author: string;
  type: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  rating: number | null;
  link: string;
  takeaway: string;
  notesMd: string;
}>;

const blank = (s: string | undefined) => (s?.trim() ? s.trim() : null);

function toRow(r: Awaited<ReturnType<typeof db.readingItem.findUniqueOrThrow>>): ReadingRow {
  return {
    ...r,
    type: isReadingType(r.type) ? r.type : "ARTICLE",
    status: isReadingStatus(r.status) ? r.status : "WANT",
  };
}

export async function listReading(): Promise<ReadingRow[]> {
  return (await db.readingItem.findMany({ orderBy: { createdAt: "desc" } })).map(toRow);
}

/** What a link says about itself: a title, who wrote it, and what kind of thing it is. */
async function describeLink(url: string): Promise<{ title: string | null; author: string | null; type: ReadingType } | null> {
  const res = await lookupPaper(url);
  if (!res.ok) return null;
  const scholarly = !!(res.meta.doi || res.meta.arxivId) || res.meta.kind === "article" || res.meta.kind === "inproceedings";
  return {
    title: res.meta.title || null,
    author: authorLine(res.meta.authors),
    type: res.meta.kind === "book" ? "BOOK" : guessType(url, scholarly && res.meta.kind !== "web"),
  };
}

const looksLikeLink = (s: string) => /^(https?:\/\/|www\.)\S+$|^[^\s/]+\.[a-z]{2,}\/\S*$/i.test(s.trim());

/**
 * Something new. A link fills itself in - title, author, type - unless a type
 * was asked for; plain words become the title. New things start as being read
 * today, unless they're only wanted.
 */
export async function createReading(input: { text: string; type?: string; status?: string }): Promise<ReadingRow> {
  const text = input.text.trim();
  const status: ReadingStatus = isReadingStatus(input.status) ? input.status : "READING";
  let data: { title: string; author: string | null; type: ReadingType; link: string | null } = {
    title: text,
    author: null,
    type: isReadingType(input.type) ? input.type : "BOOK",
    link: null,
  };
  if (text && looksLikeLink(text)) {
    const link = normaliseLink(text)!;
    const meta = await describeLink(link);
    data = {
      title: meta?.title ?? "",
      author: meta?.author ?? null,
      type: isReadingType(input.type) ? input.type : meta?.type ?? "ARTICLE",
      link,
    };
  }
  const dates = datesForStatus(status, { startedAt: null, finishedAt: null }, new Date());
  return toRow(await db.readingItem.create({ data: { ...data, status, ...dates } }));
}

/**
 * One edit. A status change stamps whichever dates it implies and are still
 * empty; a link pasted onto something without a title or author fills them.
 */
export async function updateReading(id: string, patch: ReadingPatch): Promise<ReadingRow> {
  const current = toRow(await db.readingItem.findUniqueOrThrow({ where: { id } }));
  const data: Record<string, unknown> = {};

  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.author !== undefined) data.author = blank(patch.author);
  if (patch.type !== undefined && isReadingType(patch.type)) data.type = patch.type;
  if (patch.takeaway !== undefined) data.takeaway = blank(patch.takeaway);
  if (patch.notesMd !== undefined) data.notesMd = blank(patch.notesMd);
  if (patch.rating !== undefined) data.rating = patch.rating == null ? null : Math.min(5, Math.max(0.5, Math.round(patch.rating * 2) / 2));
  if (patch.startedAt !== undefined) data.startedAt = patch.startedAt && startOfDay(patch.startedAt);
  if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt && startOfDay(patch.finishedAt);

  if (patch.status !== undefined && isReadingStatus(patch.status) && patch.status !== current.status) {
    data.status = patch.status;
    Object.assign(data, datesForStatus(patch.status, {
      startedAt: (data.startedAt as Date | null | undefined) ?? current.startedAt,
      finishedAt: (data.finishedAt as Date | null | undefined) ?? current.finishedAt,
    }, new Date()));
  }

  if (patch.link !== undefined) {
    const link = normaliseLink(patch.link);
    data.link = link;
    if (link && (!current.title || !current.author)) {
      const meta = await describeLink(link);
      if (meta?.title && !current.title) data.title = meta.title;
      if (meta?.author && !current.author) data.author = meta.author;
    }
  }

  return toRow(await db.readingItem.update({ where: { id }, data }));
}

export async function deleteReading(id: string) {
  await db.readingItem.deleteMany({ where: { id } });
}

export async function restoreReading(row: ReadingRow): Promise<ReadingRow> {
  const { id, ...data } = row;
  return toRow(await db.readingItem.upsert({ where: { id }, update: data, create: { id, ...data } }));
}

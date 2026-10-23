import { addDays, startOfDay } from "./dates";

/**
 * Livio's reading list: what's being read, what's been read, how long it took
 * and how much it was enjoyed. Pure, so the page, the stats, the exports and
 * tests share one set of rules.
 */

export const READING_TYPES = ["BOOK", "ARTICLE", "BLOG", "WEBSITE", "PAPER"] as const;
export type ReadingType = (typeof READING_TYPES)[number];

export const READING_TYPE_LABEL: Record<ReadingType, string> = {
  BOOK: "Book",
  ARTICLE: "Article",
  BLOG: "Blog",
  WEBSITE: "Website",
  PAPER: "Paper",
};

/** In the order they're lived: wanted, then read, then over one way or the other. */
export const READING_STATUSES = ["READING", "WANT", "FINISHED", "ABANDONED"] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  WANT: "Want to read",
  READING: "Reading",
  FINISHED: "Finished",
  ABANDONED: "Abandoned",
};

export function isReadingType(v: unknown): v is ReadingType {
  return READING_TYPES.includes(v as ReadingType);
}

export function isReadingStatus(v: unknown): v is ReadingStatus {
  return READING_STATUSES.includes(v as ReadingStatus);
}

/** Over, whichever way it went: it has an end date. */
export function isEnded(status: string): boolean {
  return status === "FINISHED" || status === "ABANDONED";
}

/**
 * The dates a status change implies, for whatever's still empty: starting
 * something stamps today as its start; finishing or abandoning stamps today
 * as its end (and its start, if it never had one - read in one sitting).
 */
export function datesForStatus(
  status: ReadingStatus,
  current: { startedAt: Date | null; finishedAt: Date | null },
  now: Date,
): { startedAt?: Date; finishedAt?: Date } {
  const today = startOfDay(now);
  const out: { startedAt?: Date; finishedAt?: Date } = {};
  if ((status === "READING" || isEnded(status)) && !current.startedAt) out.startedAt = today;
  if (isEnded(status) && !current.finishedAt) out.finishedAt = today;
  return out;
}

/**
 * A rating from a number key. 4 gives four stars; 4 again takes it down half
 * to 3.5, and once more back to 4. So 5 5 is 4.5 and 1 1 is half a star -
 * every rating from ½ to 5 is two presses at most. 0 clears it.
 */
export function ratingFromKey(current: number | null, key: number): number | null {
  if (key === 0) return null;
  return current === key ? key - 0.5 : key;
}

/** ★★★★½ - full stars, a half if there is one, nothing for the rest. */
export function stars(rating: number | null): string {
  if (rating == null) return "";
  const full = Math.floor(rating);
  return "★".repeat(full) + (rating - full >= 0.5 ? "½" : "");
}

/** How many days it took, counting both ends: started and finished on the same day is one. */
export function daysToRead(i: { startedAt: Date | null; finishedAt: Date | null }): number | null {
  if (!i.startedAt || !i.finishedAt) return null;
  return Math.round((startOfDay(i.finishedAt).getTime() - startOfDay(i.startedAt).getTime()) / 86_400_000) + 1;
}

/** How far into something you are: started today is day 1. */
export function dayOf(startedAt: Date | null, now: Date): number | null {
  if (!startedAt) return null;
  return Math.max(1, Math.round((startOfDay(now).getTime() - startOfDay(startedAt).getTime()) / 86_400_000) + 1);
}

/**
 * The type a link most likely is, by where it lives. A guess - it's one key
 * to change - but it saves the key most of the time.
 */
export function guessType(url: string, scholarly: boolean): ReadingType {
  if (scholarly) return "PAPER";
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return "ARTICLE";
  }
  if (/(^|\.)(goodreads\.com|openlibrary\.org|bookshop\.org|waterstones\.com)$/.test(host) || /books\.google\./.test(host)) return "BOOK";
  if (/(^|\.)amazon\.[a-z.]+$/.test(host) && /\/(dp|gp\/product)\//.test(path)) return "BOOK";
  if (/(^|\.)(substack\.com|medium\.com|ghost\.io|wordpress\.com|blogspot\.com|bearblog\.dev)$/.test(host) || /^blog\.|\/blog\//.test(host + path)) return "BLOG";
  if (path === "/" || path === "") return "WEBSITE";
  return "ARTICLE";
}

/** "Doe, Jane" → "Jane Doe": the reading list names people the way you'd say them. */
export function displayAuthor(name: string): string {
  const m = /^([^,]+),\s*(.+)$/.exec(name.trim());
  return m ? `${m[2]} ${m[1]}` : name.trim();
}

/** Up to two names, then "et al." */
export function authorLine(authors: string[]): string | null {
  const names = authors.map(displayAuthor).filter(Boolean);
  if (!names.length) return null;
  return names.length > 2 ? `${names[0]} et al.` : names.join(" & ");
}

type StatsItem = {
  type: string;
  status: string;
  rating: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type ReadingStats = {
  finishedThisYear: number;
  averageRating: number | null;
  averageDays: number | null;
  /** Finished this year, by type, largest first. */
  byType: { type: ReadingType; count: number }[];
  /** The last twelve months, oldest first. */
  perMonth: { month: Date; count: number }[];
  /** How many finished things got each rating, ½ to 5. */
  ratings: { rating: number; count: number }[];
};

export function readingStats(items: StatsItem[], now: Date): ReadingStats {
  const finished = items.filter((i) => i.status === "FINISHED" && i.finishedAt);
  const thisYear = finished.filter((i) => i.finishedAt!.getFullYear() === now.getFullYear());
  const rated = finished.filter((i) => i.rating != null);
  const days = finished.map(daysToRead).filter((d): d is number => d != null);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const byType = READING_TYPES.map((type) => ({ type, count: thisYear.filter((i) => i.type === type).length }))
    .filter((t) => t.count)
    .sort((a, b) => b.count - a.count);

  const first = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const perMonth = Array.from({ length: 12 }, (_, k) => {
    const month = new Date(first.getFullYear(), first.getMonth() + k, 1);
    const count = finished.filter(
      (i) => i.finishedAt!.getFullYear() === month.getFullYear() && i.finishedAt!.getMonth() === month.getMonth(),
    ).length;
    return { month, count };
  });

  const ratings = Array.from({ length: 10 }, (_, k) => (k + 1) / 2).map((rating) => ({
    rating,
    count: rated.filter((i) => i.rating === rating).length,
  }));

  return {
    finishedThisYear: thisYear.length,
    averageRating: avg(rated.map((i) => i.rating!)),
    averageDays: avg(days),
    byType,
    perMonth,
    ratings,
  };
}

/** The default order: what you're reading, then what you want to, then the log, newest first. */
export function defaultOrder<T extends StatsItem & { createdAt: Date }>(items: T[]): T[] {
  const rank = (s: string) => READING_STATUSES.indexOf(s as ReadingStatus);
  const when = (i: T) => (isEnded(i.status) ? i.finishedAt : i.status === "READING" ? i.startedAt : i.createdAt)?.getTime() ?? 0;
  return [...items].sort((a, b) => rank(a.status) - rank(b.status) || when(b) - when(a));
}

type ExportItem = StatsItem & { title: string; author: string | null; link: string | null; takeaway: string | null };

const fmt = (d: Date) => `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getFullYear()}`;

/** A list worth pasting anywhere markdown goes - a gist, Notion, a message. */
export function toMarkdown(items: ExportItem[], heading: string): string {
  const lines = [`# ${heading}`, ""];
  for (const i of items) {
    const title = i.link ? `[${i.title || "Untitled"}](${i.link})` : i.title || "Untitled";
    const by = i.author ? ` - ${i.author}` : "";
    const rating = i.rating != null ? ` ${stars(i.rating)}` : "";
    lines.push(`- **${title}**${by}${rating}`);
    const facts = [
      READING_TYPE_LABEL[i.type as ReadingType] ?? i.type,
      READING_STATUS_LABEL[i.status as ReadingStatus] ?? i.status,
      i.finishedAt && isEnded(i.status) ? fmt(i.finishedAt) : null,
    ].filter(Boolean).join(" · ");
    lines.push(`  ${facts}`);
    if (i.takeaway) lines.push(`  > ${i.takeaway}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Thirty days ago, for "finished lately". */
export const lately = (now: Date) => addDays(startOfDay(now), -30);

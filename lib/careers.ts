/**
 * Livio careers: cold emails and job applications.
 *
 * Pure, so the table, the server actions, Livio's home and tests all share
 * one idea of which statuses exist, which belong to which type, and when a
 * cold email has gone quiet long enough to chase.
 */

export const CAREER_TYPES = ["COLD_EMAIL", "APPLICATION"] as const;
export type CareerType = (typeof CAREER_TYPES)[number];

export const TYPE_LABEL: Record<CareerType, string> = {
  COLD_EMAIL: "Cold email",
  APPLICATION: "Application",
};

/** In pipeline order, which is also the sort order. */
export const STATUSES = [
  "TODO", "EMAIL_SENT", "APPLIED", "BACK_AND_FORTH", "WAITING", "INTERVIEW", "OFFERED", "REJECTED",
] as const;
export type CareerStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<CareerStatus, string> = {
  TODO: "To Do",
  EMAIL_SENT: "Email Sent",
  APPLIED: "Applied",
  BACK_AND_FORTH: "Back and Forth",
  WAITING: "Waiting",
  INTERVIEW: "Interview",
  OFFERED: "Offered",
  REJECTED: "Rejected",
};

const SHARED: CareerStatus[] = ["TODO", "OFFERED", "REJECTED"];
const OWN: Record<CareerType, CareerStatus[]> = {
  COLD_EMAIL: ["EMAIL_SENT", "BACK_AND_FORTH", "WAITING", "INTERVIEW"],
  APPLICATION: ["APPLIED", "INTERVIEW"],
};

/** The statuses a row of this type can have, in pipeline order. */
export function statusesFor(type: CareerType): CareerStatus[] {
  const allowed = new Set([...SHARED, ...OWN[type]]);
  return STATUSES.filter((s) => allowed.has(s));
}

export function isCareerType(v: unknown): v is CareerType {
  return CAREER_TYPES.includes(v as CareerType);
}

export function isStatus(v: unknown): v is CareerStatus {
  return STATUSES.includes(v as CareerStatus);
}

/** Finished either way: dimmed and sunk to the bottom of the table. */
export function isClosed(status: string): boolean {
  return status === "OFFERED" || status === "REJECTED";
}

/** Where a row lands when its type changes and its status no longer fits. */
export function statusForType(status: CareerStatus, type: CareerType): CareerStatus {
  if (statusesFor(type).includes(status)) return status;
  // Something was sent, so it's still sent - just under the other name.
  return type === "APPLICATION" ? "APPLIED" : "EMAIL_SENT";
}

/** Statuses that mean "I've sent it", so an empty Sent date gets filled. */
export const SENDING: CareerStatus[] = ["EMAIL_SENT", "APPLIED"];

/** What a new row starts as. A cold email is logged once it's gone; an
 *  application is usually logged before you've written it. */
export function newEntryDefaults(type: CareerType, now: Date): { status: CareerStatus; sentAt: Date | null } {
  return type === "COLD_EMAIL" ? { status: "EMAIL_SENT", sentAt: now } : { status: "TODO", sentAt: null };
}

export const STALE_DAYS = 14;
const DAY = 86_400_000;

type StaleInput = {
  type: string;
  status: string;
  statusChangedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

/**
 * Days since a cold email last saw any movement - the last status change,
 * or the day it was sent if it never moved - while it's still waiting on a
 * reply. Null when it isn't the kind of row that can go stale.
 */
export function quietDays(e: StaleInput, now: Date = new Date()): number | null {
  if (e.type !== "COLD_EMAIL") return null;
  if (e.status !== "EMAIL_SENT" && e.status !== "WAITING") return null;
  const since = e.statusChangedAt ?? e.sentAt ?? e.createdAt;
  return Math.floor((now.getTime() - since.getTime()) / DAY);
}

/** Quiet for two weeks or more: time to chase. */
export function isStale(e: StaleInput, now: Date = new Date()): boolean {
  const d = quietDays(e, now);
  return d !== null && d >= STALE_DAYS;
}

/** "Jane Doe jane@acme.com" → name and email, in either order. */
export function parseContact(text: string): { contactName: string | null; contactEmail: string | null } {
  const email = /[^\s<>()]+@[^\s<>()]+\.[^\s<>()]+/.exec(text)?.[0] ?? null;
  const name = (email ? text.replace(email, "") : text).replace(/[<>()]/g, " ").replace(/\s+/g, " ").trim();
  return { contactName: name || null, contactEmail: email };
}

export function formatContact(name: string | null, email: string | null): string {
  return [name, email].filter(Boolean).join(" ");
}

/** A pasted link, made clickable: "acme.com/jobs" gains its https://. */
export function normaliseLink(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  return /^[^\s/]+\.[^\s/]+/.test(t) ? `https://${t}` : t;
}

/** "jobs.acme.com/123" → "jobs.acme.com", for a compact cell. */
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

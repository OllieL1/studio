import { startOfWeek } from "./dates";
import { parseDuration } from "./ultraFocus";

/**
 * Sovrano - paid annotation work, timed in Livio. Pure, so the page, the
 * exports and the tests share one set of rules for what time is worth.
 *
 * Money is held in US cents, never floats. A session's value is its minutes
 * at the project's *current* rate until it's marked paid; marking it paid
 * freezes what it was worth then (`paidCents`), so changing a rate later
 * moves only what's still owed.
 */

export const PLATFORMS = ["SOVRANO", "DATAANNOTATION"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  SOVRANO: "Sovrano",
  DATAANNOTATION: "DataAnnotation",
};

/** Short enough for a table cell or a chip. */
export const PLATFORM_SHORT: Record<Platform, string> = {
  SOVRANO: "Sovrano",
  DATAANNOTATION: "DA",
};

export const isPlatform = (v: unknown): v is Platform => typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);

/** ⌥W - "work". Shown in titles and the help sheet. */
export const SOVRANO_KEY = "⌥W";

/** Dispatched on window to open the log dialog (⌥W with a session running). */
export const OPEN_SOVRANO_LOG_EVENT = "open-sovrano-log";

export type SovProject = { id: string; name: string; rateCents: number | null };
export type SovSession = {
  id: string;
  name: string;
  projectId: string;
  platform: string;
  startedAt: Date;
  endedAt: Date;
  minutes: number;
  rawMinutes: number;
  paidAt: Date | null;
  paidCents: number | null;
};

/** What `minutes` at `rateCents` an hour comes to, in cents. */
export const centsFor = (minutes: number, rateCents: number) => Math.round((minutes * rateCents) / 60);

/**
 * What a session is worth: what was paid, once it's paid; otherwise its
 * minutes at the project's rate - or null when the project has no rate yet.
 */
export function sessionCents(s: Pick<SovSession, "minutes" | "paidAt" | "paidCents">, project: Pick<SovProject, "rateCents"> | undefined): number | null {
  if (s.paidAt && s.paidCents != null) return s.paidCents;
  if (project?.rateCents == null) return null;
  return centsFor(s.minutes, project.rateCents);
}

/** "$1,234.50" - always two places, the way a payslip reads. */
export function fmtUSD(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** "12.5 h" - hours to a tenth, for totals where minutes would be noise. */
export function fmtHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/**
 * A typed rate in dollars an hour to cents: "24.5", "$24.50", "24.50/h".
 * Empty clears it (null); anything else unreadable is undefined.
 */
export function parseRate(text: string): number | null | undefined {
  const t = text.trim().replace(/^\$/, "").replace(/\s*(\/\s*h(ou)?r?|an hour|ph)$/i, "").replace(/,/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}

export type ProjectTotals = {
  id: string;
  name: string;
  rateCents: number | null;
  minutes: number;
  unpaidMinutes: number;
  /** Owed at the current rate; null when there's unpaid time and no rate. */
  unpaidCents: number | null;
  paidCents: number;
  sessions: number;
  lastWorked: Date | null;
};

export type SovranoTotals = {
  minutes: number;
  weekMinutes: number;
  monthMinutes: number;
  unpaidMinutes: number;
  /** Owed across every project that has a rate. */
  unpaidCents: number;
  paidCents: number;
  /** Unpaid minutes on projects with no rate - money the totals can't count yet. */
  unratedMinutes: number;
  perPlatform: Record<Platform, number>;
  /** Most recently worked first; projects never worked come last, by name. */
  projects: ProjectTotals[];
};

export function sovranoTotals(sessions: SovSession[], projects: SovProject[], now = new Date()): SovranoTotals {
  const week = startOfWeek(now).getTime();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const byId = new Map(projects.map((p) => [p.id, p]));
  const rows = new Map<string, ProjectTotals>(
    projects.map((p) => [p.id, { id: p.id, name: p.name, rateCents: p.rateCents, minutes: 0, unpaidMinutes: 0, unpaidCents: 0, paidCents: 0, sessions: 0, lastWorked: null }]),
  );
  const t: SovranoTotals = {
    minutes: 0, weekMinutes: 0, monthMinutes: 0, unpaidMinutes: 0, unpaidCents: 0, paidCents: 0, unratedMinutes: 0,
    perPlatform: { SOVRANO: 0, DATAANNOTATION: 0 },
    projects: [],
  };

  for (const s of sessions) {
    const p = byId.get(s.projectId);
    const row = rows.get(s.projectId);
    const at = s.startedAt.getTime();
    t.minutes += s.minutes;
    if (at >= week) t.weekMinutes += s.minutes;
    if (at >= month) t.monthMinutes += s.minutes;
    if (isPlatform(s.platform)) t.perPlatform[s.platform] += s.minutes;
    if (row) {
      row.minutes += s.minutes;
      row.sessions++;
      if (!row.lastWorked || s.startedAt > row.lastWorked) row.lastWorked = s.startedAt;
    }

    if (s.paidAt) {
      const paid = sessionCents(s, p) ?? 0;
      t.paidCents += paid;
      if (row) row.paidCents += paid;
      continue;
    }
    t.unpaidMinutes += s.minutes;
    if (row) row.unpaidMinutes += s.minutes;
    const owed = sessionCents(s, p);
    if (owed == null) {
      t.unratedMinutes += s.minutes;
      if (row) row.unpaidCents = null;
    } else {
      t.unpaidCents += owed;
      if (row && row.unpaidCents != null) row.unpaidCents += owed;
    }
  }

  t.projects = [...rows.values()].sort((a, b) => {
    if (a.lastWorked && b.lastWorked) return b.lastWorked.getTime() - a.lastWorked.getTime();
    if (a.lastWorked || b.lastWorked) return a.lastWorked ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return t;
}

/** The platform a project was last worked under - the dialog's default for it. */
export function lastPlatform(sessions: Pick<SovSession, "projectId" | "platform" | "startedAt">[], projectId: string): Platform | null {
  let best: { at: number; platform: string } | null = null;
  for (const s of sessions) {
    if (s.projectId !== projectId) continue;
    if (!best || s.startedAt.getTime() > best.at) best = { at: s.startedAt.getTime(), platform: s.platform };
  }
  return best && isPlatform(best.platform) ? best.platform : null;
}

/**
 * The JSON export: every session with its project and value spelled out, so
 * the file stands on its own - and the totals it adds up to.
 */
export function sovranoJson(sessions: SovSession[], projects: SovProject[], exportedAt = new Date()) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const used = projects.filter((p) => sessions.some((s) => s.projectId === p.id));
  const totals = sovranoTotals(sessions, used, exportedAt);
  const dollars = (c: number | null) => (c == null ? null : c / 100);
  return {
    exportedAt: exportedAt.toISOString(),
    currency: "USD",
    totals: {
      sessions: sessions.length,
      hours: round2(totals.minutes / 60),
      unpaidHours: round2(totals.unpaidMinutes / 60),
      unpaidUsd: dollars(totals.unpaidCents),
      paidUsd: dollars(totals.paidCents),
      unratedUnpaidHours: round2(totals.unratedMinutes / 60),
    },
    projects: totals.projects.map((p) => ({
      name: p.name,
      rateUsdPerHour: dollars(p.rateCents),
      hours: round2(p.minutes / 60),
      unpaidHours: round2(p.unpaidMinutes / 60),
      unpaidUsd: dollars(p.unpaidCents),
      paidUsd: dollars(p.paidCents),
    })),
    sessions: [...sessions]
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((s) => {
        const p = byId.get(s.projectId);
        return {
          name: s.name,
          project: p?.name ?? null,
          platform: isPlatform(s.platform) ? PLATFORM_LABEL[s.platform] : s.platform,
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt.toISOString(),
          minutes: s.minutes,
          trackedMinutes: s.rawMinutes,
          valueUsd: dollars(sessionCents(s, p)),
          paid: !!s.paidAt,
          paidAt: s.paidAt?.toISOString() ?? null,
        };
      }),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `:log 1h20 rubric batch` → 80 minutes, "rubric batch". The length is the
 * longest run of leading words that reads as one ("1h 20", "1 hour 20
 * minutes"); without one it's all name, and the dialog asks.
 */
export function splitLog(arg: string): { minutes: number | null; name: string } {
  const words = arg.trim().split(/\s+/).filter(Boolean);
  for (let k = Math.min(4, words.length); k > 0; k--) {
    const m = parseDuration(words.slice(0, k).join(" "));
    if (m != null && m > 0) return { minutes: m, name: words.slice(k).join(" ") };
  }
  return { minutes: null, name: words.join(" ") };
}

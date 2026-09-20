import { startOfDay, isoDayOfWeek, DAY_SHORT } from "./dates";
import { STUDY_LOCATIONS, locationLabel } from "./types";

/** Analytics computed in memory from the session log. The dataset is a year of
 *  one person's study sessions — small enough that aggregating in JS is
 *  simpler and more flexible than SQL, and keeps the queries portable. */

export type StatSession = {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
  minutes: number;
  rawMinutes: number;
  focus: number;
  courses: { courseId: string; minutes: number }[];
  tasks: { taskId: string }[];
  location?: string | null;
  locationNote?: string | null;
};

/** A session can span hours; attribute its minutes to each hour it actually
 *  covered rather than dumping all of it on the start hour. That's what makes
 *  "best time of day" trustworthy. */
export function byHourOfDay(sessions: StatSession[]) {
  const mins = new Array(24).fill(0);
  const focusWeighted = new Array(24).fill(0);

  for (const s of sessions) {
    // Scale wall-clock spread to the adjusted duration so an adjusted-down
    // session doesn't over-report the hours it touched.
    const wall = Math.max(1, (s.endedAt.getTime() - s.startedAt.getTime()) / 60000);
    const scale = s.minutes / wall;

    let cursor = new Date(s.startedAt);
    let remaining = wall;
    while (remaining > 0.01) {
      const hour = cursor.getHours();
      const nextHour = new Date(cursor);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);
      const chunk = Math.min(remaining, (nextHour.getTime() - cursor.getTime()) / 60000);
      const attributed = chunk * scale;
      mins[hour] += attributed;
      focusWeighted[hour] += s.focus * attributed;
      remaining -= chunk;
      cursor = nextHour;
    }
  }

  return mins.map((m, hour) => ({
    hour,
    minutes: m,
    focus: m > 0 ? focusWeighted[hour] / m : null,
  }));
}

export function byDayOfWeek(sessions: StatSession[]) {
  const mins = new Array(7).fill(0);
  const focusWeighted = new Array(7).fill(0);
  const daysSeen: Array<Set<number>> = Array.from({ length: 7 }, () => new Set());

  for (const s of sessions) {
    const i = isoDayOfWeek(s.startedAt) - 1;
    mins[i] += s.minutes;
    focusWeighted[i] += s.focus * s.minutes;
    daysSeen[i].add(startOfDay(s.startedAt).getTime());
  }

  return mins.map((m, i) => ({
    day: i,
    label: DAY_SHORT[i],
    minutes: m,
    // Average per occurrence of that weekday, so a term with 9 Mondays and
    // 10 Tuesdays doesn't make Tuesday look better than it is.
    avgMinutes: daysSeen[i].size > 0 ? m / daysSeen[i].size : 0,
    occurrences: daysSeen[i].size,
    focus: m > 0 ? focusWeighted[i] / m : null,
  }));
}

export function bySubject(
  sessions: StatSession[],
  courses: { id: string; shortName: string; name: string; colour: string }[],
) {
  const mins = new Map<string, number>();
  const focusWeighted = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const s of sessions) {
    if (s.courses.length === 0) continue;
    // Each subject carries its own recorded slice of the session, so the
    // subject totals always sum back to the true total time — whether the
    // session was split evenly, by percentage or by hand.
    for (const { courseId, minutes } of s.courses) {
      mins.set(courseId, (mins.get(courseId) ?? 0) + minutes);
      focusWeighted.set(courseId, (focusWeighted.get(courseId) ?? 0) + s.focus * minutes);
      counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
    }
  }

  return courses
    .map((c) => {
      const m = mins.get(c.id) ?? 0;
      return {
        courseId: c.id,
        shortName: c.shortName,
        name: c.name,
        colour: c.colour,
        minutes: m,
        sessions: counts.get(c.id) ?? 0,
        focus: m > 0 ? (focusWeighted.get(c.id) ?? 0) / m : null,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}

/** Focus bucketed into bands, for the focus distribution panel. */
export function focusDistribution(sessions: StatSession[]) {
  const bands = [
    { label: "0–39", lo: 0, hi: 39 },
    { label: "40–59", lo: 40, hi: 59 },
    { label: "60–74", lo: 60, hi: 74 },
    { label: "75–89", lo: 75, hi: 89 },
    { label: "90–100", lo: 90, hi: 100 },
  ];
  return bands.map((b) => {
    const inBand = sessions.filter((s) => s.focus >= b.lo && s.focus <= b.hi);
    return {
      ...b,
      sessions: inBand.length,
      minutes: inBand.reduce((s, x) => s + x.minutes, 0),
    };
  });
}

/** Does a longer session mean worse focus? Correlates session length against
 *  focus so the app can say something useful about ideal session length. */
export function focusByLength(sessions: StatSession[]) {
  const buckets = [
    { label: "<30m", lo: 0, hi: 29 },
    { label: "30–59m", lo: 30, hi: 59 },
    { label: "1–2h", lo: 60, hi: 119 },
    { label: "2–3h", lo: 120, hi: 179 },
    { label: "3h+", lo: 180, hi: Infinity },
  ];
  return buckets.map((b) => {
    const inB = sessions.filter((s) => s.minutes >= b.lo && s.minutes <= b.hi);
    const total = inB.reduce((s, x) => s + x.minutes, 0);
    return {
      label: b.label,
      sessions: inB.length,
      minutes: total,
      focus: total > 0 ? inB.reduce((s, x) => s + x.focus * x.minutes, 0) / total : null,
    };
  });
}

export type Headline = {
  totalMinutes: number;
  sessions: number;
  activeDays: number;
  avgPerActiveDay: number;
  avgSessionLength: number;
  avgFocus: number;
  bestDay: { label: string; avgMinutes: number } | null;
  worstDay: { label: string; avgMinutes: number } | null;
  bestHour: { hour: number; minutes: number } | null;
  adjustedDownMinutes: number;
};

export function headline(sessions: StatSession[]): Headline {
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);
  const activeDays = new Set(sessions.map((s) => startOfDay(s.startedAt).getTime())).size;
  const dow = byDayOfWeek(sessions).filter((d) => d.occurrences > 0);
  const hours = byHourOfDay(sessions).filter((h) => h.minutes > 0);

  const sorted = [...dow].sort((a, b) => b.avgMinutes - a.avgMinutes);
  const bestHour = [...hours].sort((a, b) => b.minutes - a.minutes)[0] ?? null;

  return {
    totalMinutes,
    sessions: sessions.length,
    activeDays,
    avgPerActiveDay: activeDays > 0 ? totalMinutes / activeDays : 0,
    avgSessionLength: sessions.length > 0 ? totalMinutes / sessions.length : 0,
    avgFocus:
      totalMinutes > 0
        ? sessions.reduce((s, x) => s + x.focus * x.minutes, 0) / totalMinutes
        : 0,
    bestDay: sorted[0] ? { label: sorted[0].label, avgMinutes: sorted[0].avgMinutes } : null,
    worstDay:
      sorted.length > 1
        ? { label: sorted[sorted.length - 1].label, avgMinutes: sorted[sorted.length - 1].avgMinutes }
        : null,
    bestHour: bestHour ? { hour: bestHour.hour, minutes: bestHour.minutes } : null,
    adjustedDownMinutes: sessions.reduce((s, x) => s + Math.max(0, x.rawMinutes - x.minutes), 0),
  };
}

/** Rolling mean, used to draw a trend line over the noisy daily series. */
export function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    if (slice.length === 0) return null;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/**
 * Where the time goes. Sessions logged before locations existed (or left
 * blank) are reported separately rather than folded into a preset, so the
 * shares are honest about what's actually known.
 *
 * "Other" is one bucket however it was labelled - the free-text place is for
 * the session row, not for splitting the stats into one-offs.
 */
export function byLocation(sessions: StatSession[]) {
  const mins = new Map<string, number>();
  const counts = new Map<string, number>();
  const focusWeighted = new Map<string, number>();
  const days = new Map<string, Set<number>>();
  let unknownMinutes = 0;
  let unknownSessions = 0;

  for (const s of sessions) {
    const key = STUDY_LOCATIONS.find((l) => l.key === s.location)?.key;
    if (!key) {
      unknownMinutes += s.minutes;
      unknownSessions++;
      continue;
    }
    mins.set(key, (mins.get(key) ?? 0) + s.minutes);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    focusWeighted.set(key, (focusWeighted.get(key) ?? 0) + s.focus * s.minutes);
    const seen = days.get(key) ?? new Set<number>();
    seen.add(startOfDay(s.startedAt).getTime());
    days.set(key, seen);
  }

  const known = STUDY_LOCATIONS.map((l) => {
    const m = mins.get(l.key) ?? 0;
    const n = counts.get(l.key) ?? 0;
    return {
      key: l.key,
      label: l.label,
      minutes: m,
      sessions: n,
      days: days.get(l.key)?.size ?? 0,
      avgSession: n > 0 ? m / n : 0,
      focus: m > 0 ? (focusWeighted.get(l.key) ?? 0) / m : null,
    };
  })
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const totalKnown = known.reduce((s, r) => s + r.minutes, 0);
  return {
    rows: known.map((r) => ({ ...r, share: totalKnown > 0 ? r.minutes / totalKnown : 0 })),
    totalKnownMinutes: totalKnown,
    unknownMinutes,
    unknownSessions,
    /** Best focus among places with enough time to mean anything. */
    bestFocus: known.filter((r) => r.minutes >= 60 && r.focus != null).sort((a, b) => b.focus! - a.focus!)[0] ?? null,
  };
}

/** One session's place, for display. Re-exported so pages have a single import. */
export { locationLabel };

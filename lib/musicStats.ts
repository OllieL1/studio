/**
 * What music does to study sessions.
 *
 * Only sessions recorded while Spotify capture was on count here. A tracked
 * session with no plays genuinely means "studied in silence"; an untracked one
 * only means "we don't know", and mixing the two would bias every comparison.
 *
 * Focus is time-weighted by session length throughout, matching the rest of
 * the stats page. Comparisons need MIN_COMPARE sessions on each side before
 * they report a difference — with two sessions a side, the "effect" is noise.
 */

export const MIN_COMPARE = 3;
/** An artist needs this many sessions before it appears in focus-by-artist. */
export const MIN_ARTIST_SESSIONS = 2;

export type MusicTrack = {
  spotifyId: string | null;
  kind: string;
  title: string;
  artist: string;
  minutes: number;
  startedAt: Date;
};

export type MusicSession = {
  id: string;
  focus: number;
  minutes: number;
  rawMinutes: number;
  startedAt: Date;
  musicTracked: boolean;
  tracks: MusicTrack[];
};

/**
 * Spread a span of time across the clock hours (and weekdays) it covers, so a
 * session from 23:30 to 01:00 counts half an hour on one day and an hour on
 * the next — not ninety minutes at 23:00.
 */
function spread(start: Date, minutes: number, add: (hour: number, weekday: number, mins: number) => void) {
  let cursor = new Date(start);
  let remaining = minutes;
  let guard = 0;
  while (remaining > 1e-6 && guard++ < 48 * 7) {
    const next = new Date(cursor);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    const chunk = Math.min(remaining, (next.getTime() - cursor.getTime()) / 60000);
    add(cursor.getHours(), (cursor.getDay() + 6) % 7, chunk);
    remaining -= chunk;
    cursor = next;
  }
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Group = { sessions: number; minutes: number; focus: number | null };

function group(sessions: MusicSession[]): Group {
  const minutes = sessions.reduce((s, x) => s + x.minutes, 0);
  return {
    sessions: sessions.length,
    minutes,
    focus: minutes > 0 ? sessions.reduce((s, x) => s + x.focus * x.minutes, 0) / minutes : null,
  };
}

/** Difference in focus, only when both sides have enough sessions to mean something. */
function compare(a: Group, b: Group): number | null {
  if (a.sessions < MIN_COMPARE || b.sessions < MIN_COMPARE) return null;
  if (a.focus == null || b.focus == null) return null;
  return a.focus - b.focus;
}

export function musicStats(all: MusicSession[]) {
  const tracked = all.filter((s) => s.musicTracked);
  const withMusic = tracked.filter((s) => s.tracks.length > 0);
  const silent = tracked.filter((s) => s.tracks.length === 0);

  const listeningMinutes = withMusic.reduce((s, x) => s + x.tracks.reduce((t, p) => t + p.minutes, 0), 0);
  const trackedWallMinutes = tracked.reduce((s, x) => s + x.rawMinutes, 0);

  const music = group(withMusic);
  const quiet = group(silent);

  // ── Artists: listening minutes, sessions featured in, and the focus of those
  // sessions weighted by how much of that artist was in each.
  const artists = new Map<string, { minutes: number; sessions: Set<string>; focusWeighted: number }>();
  for (const s of withMusic) {
    for (const t of s.tracks) {
      const a = artists.get(t.artist) ?? { minutes: 0, sessions: new Set<string>(), focusWeighted: 0 };
      a.minutes += t.minutes;
      a.sessions.add(s.id);
      a.focusWeighted += s.focus * t.minutes;
      artists.set(t.artist, a);
    }
  }
  const artistRows = [...artists.entries()].map(([artist, a]) => ({
    artist,
    minutes: a.minutes,
    sessions: a.sessions.size,
    focus: a.minutes > 0 ? a.focusWeighted / a.minutes : null,
  }));

  // ── Variety: distinct artists per hour of listening. Normalised by time, so a
  // three-hour session isn't "more varied" just for being longer.
  const bands = [
    { key: "few", label: "1–2 artists / hr", test: (r: number) => r <= 2 },
    { key: "some", label: "3–6 artists / hr", test: (r: number) => r > 2 && r <= 6 },
    { key: "many", label: "7+ artists / hr", test: (r: number) => r > 6 },
  ];
  const variety = bands.map((b) => {
    const members = withMusic.filter((s) => {
      const listenHours = s.tracks.reduce((t, p) => t + p.minutes, 0) / 60;
      if (listenHours <= 0) return false;
      const rate = new Set(s.tracks.map((t) => t.artist)).size / listenHours;
      return b.test(rate);
    });
    return { label: b.label, ...group(members) };
  });

  // ── When music plays: share of tracked study time with something on, by
  // hour of day and day of week. A share, not raw minutes — raw listening
  // minutes would mostly just echo when you study.
  const hourMusic = new Array(24).fill(0), hourStudy = new Array(24).fill(0);
  const dayMusic = new Array(7).fill(0), dayStudy = new Array(7).fill(0);
  for (const s of tracked) {
    spread(s.startedAt, s.rawMinutes, (h, d, m) => { hourStudy[h] += m; dayStudy[d] += m; });
    for (const t of s.tracks) {
      spread(t.startedAt, t.minutes, (h, d, m) => { hourMusic[h] += m; dayMusic[d] += m; });
    }
  }
  const share = (music: number, study: number) => (study > 0 ? Math.min(1, music / study) : null);
  const byHour = hourStudy.map((study, hour) => ({
    hour, studyMinutes: study, musicMinutes: hourMusic[hour], share: share(hourMusic[hour], study),
  }));
  const byWeekday = dayStudy.map((study, i) => ({
    label: WEEKDAYS[i], studyMinutes: study, musicMinutes: dayMusic[i], share: share(dayMusic[i], study),
  }));

  return {
    trackedSessions: tracked.length,
    untrackedSessions: all.length - tracked.length,
    listeningMinutes,
    /** Share of tracked study time with something playing, 0–1. */
    share: trackedWallMinutes > 0 ? Math.min(1, listeningMinutes / trackedWallMinutes) : 0,
    music,
    silent: quiet,
    musicVsSilence: compare(music, quiet),
    topArtists: [...artistRows].sort((a, b) => b.minutes - a.minutes).slice(0, 10),
    focusByArtist: artistRows
      .filter((a) => a.sessions >= MIN_ARTIST_SESSIONS && a.focus != null)
      .sort((a, b) => b.focus! - a.focus!)
      .slice(0, 10),
    variety,
    byHour,
    byWeekday,
  };
}

export type MusicStats = ReturnType<typeof musicStats>;

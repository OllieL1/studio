/**
 * Reconstructing what played during a study session.
 *
 * Two sources, neither complete on its own:
 *
 * - **Samples** — now-playing readings taken while the timer runs. Accurate
 *   (they carry playback position and paused/playing), include podcasts, but
 *   only exist while the app is open.
 * - **History** — Spotify's recently-played list, fetched when the session
 *   stops. Covers time the app was closed, but has no podcasts, no position,
 *   and one timestamp per track whose meaning the docs don't pin down (start
 *   or finish). Used only to fill gaps the samples didn't cover.
 *
 * Listening time comes from how far playback *position* advanced, not wall
 * time — so a track paused for ten minutes doesn't count ten minutes.
 */

export type TrackMeta = {
  spotifyId: string | null;
  kind: "track" | "episode";
  title: string;
  artist: string;
  artists: string;
  album: string | null;
  imageUrl: string | null;
  url: string | null;
  durationMs: number;
};

export type Sample = TrackMeta & { at: Date; progressMs: number; isPlaying: boolean };
export type HistoryEntry = TrackMeta & { playedAt: Date };

export type Play = TrackMeta & {
  startedAt: Date;
  minutes: number;
  source: "samples" | "history";
};

/** Samples of one track closer than this in position are the same play. */
const REWIND_TOLERANCE_MS = 5_000;
/** How close a history entry must be to a sampled play to be the same play. */
const MATCH_TOLERANCE_MS = 90_000;
/** Ignore anything that played for less than this. */
const MIN_MS = 15_000;

const keyOf = (m: Pick<TrackMeta, "spotifyId" | "title" | "artist">) =>
  m.spotifyId ?? `${m.title} :: ${m.artist}`;

type SampledPlay = {
  meta: TrackMeta;
  key: string;
  firstAt: number;
  firstProgress: number;
  lastAt: number;
  lastProgress: number;
  lastPlaying: boolean;
  anyPlaying: boolean;
  /** Estimated moment playback of this track began. */
  start: number;
};

export function buildListening({
  samples,
  history,
  start,
  end,
}: {
  samples: Sample[];
  history: HistoryEntry[];
  start: Date;
  end: Date;
}): Play[] {
  const S = start.getTime();
  const E = end.getTime();
  if (E <= S) return [];

  // ── 1. Fold samples into plays. Same track with position not going
  // backwards means it's still the same play (pauses included); a jump back
  // means it restarted or looped.
  const sampled: SampledPlay[] = [];
  const sortedSamples = [...samples].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const s of sortedSamples) {
    const key = keyOf(s);
    const at = s.at.getTime();
    const cur = sampled[sampled.length - 1];
    if (cur && cur.key === key && s.progressMs >= cur.lastProgress - REWIND_TOLERANCE_MS) {
      cur.lastAt = at;
      cur.lastProgress = Math.max(cur.lastProgress, s.progressMs);
      cur.lastPlaying = s.isPlaying;
      cur.anyPlaying ||= s.isPlaying;
    } else {
      sampled.push({
        meta: pickMeta(s),
        key,
        firstAt: at,
        firstProgress: s.progressMs,
        lastAt: at,
        lastProgress: s.progressMs,
        lastPlaying: s.isPlaying,
        anyPlaying: s.isPlaying,
        start: at - s.progressMs,
      });
    }
  }

  // ── 2. History entries the samples didn't already see. Whether playedAt
  // marks the start or the end of the play, it must sit within a tolerance of
  // one of those two points on a sampled play to be a duplicate.
  const fromHistory: { meta: TrackMeta; start: number }[] = [];
  for (const h of history) {
    const key = keyOf(h);
    const t = h.playedAt.getTime();
    const covered = sampled.some(
      (p) =>
        p.key === key &&
        (Math.abs(p.start - t) <= MATCH_TOLERANCE_MS ||
          Math.abs(p.start + h.durationMs - t) <= MATCH_TOLERANCE_MS),
    );
    if (covered) continue;
    // Uncovered: assume the timestamp marks the end of the play, which is when
    // Spotify records it. The minutes are clipped to the session either way.
    fromHistory.push({ meta: pickMeta(h), start: t - h.durationMs });
  }

  // ── 3. Lay every play on one timeline so each can be cut off by the next.
  type Slot =
    | { kind: "sampled"; p: SampledPlay; start: number }
    | { kind: "history"; meta: TrackMeta; start: number };
  const slots: Slot[] = [
    ...sampled.map((p) => ({ kind: "sampled" as const, p, start: p.start })),
    ...fromHistory.map((h) => ({ kind: "history" as const, meta: h.meta, start: h.start })),
  ].sort((a, b) => a.start - b.start);

  const plays: Play[] = [];
  slots.forEach((slot, i) => {
    const nextStart = slots[i + 1]?.start ?? Infinity;
    let ms: number;
    let meta: TrackMeta;
    let source: Play["source"];

    if (slot.kind === "sampled") {
      const p = slot.p;
      meta = p.meta;
      source = "samples";
      if (!p.anyPlaying) return; // paused the whole time: nothing played

      // Before the first sample: it had been playing up to firstProgress —
      // but only the part inside the session counts.
      const before = Math.min(p.firstProgress, Math.max(0, p.firstAt - S));
      // Between samples: how far the position actually moved (pauses excluded).
      const during = Math.max(0, p.lastProgress - p.firstProgress);
      // After the last sample: if still playing, assume it carried on until
      // the track ended, the next play began, or the session stopped.
      const after = p.lastPlaying
        ? Math.max(0, Math.min(p.meta.durationMs - p.lastProgress, nextStart - p.lastAt, E - p.lastAt))
        : 0;
      ms = before + during + after;
    } else {
      meta = slot.meta;
      source = "history";
      const playEnd = Math.min(slot.start + meta.durationMs, nextStart, E);
      ms = Math.max(0, playEnd - Math.max(slot.start, S));
    }

    if (ms < MIN_MS) return;
    plays.push({ ...meta, startedAt: new Date(Math.max(slot.start, S)), minutes: ms / 60_000, source });
  });

  // ── 4. Never report more listening than the session lasted.
  const total = plays.reduce((s, p) => s + p.minutes, 0);
  const cap = (E - S) / 60_000;
  if (total > cap) for (const p of plays) p.minutes *= cap / total;

  return plays;
}

function pickMeta(m: TrackMeta): TrackMeta {
  return {
    spotifyId: m.spotifyId,
    kind: m.kind,
    title: m.title,
    artist: m.artist,
    artists: m.artists,
    album: m.album,
    imageUrl: m.imageUrl,
    url: m.url,
    durationMs: m.durationMs,
  };
}

/** Reconstructing listening from now-playing samples and Spotify history. */
import assert from "node:assert/strict";
import { buildListening, type Sample, type HistoryEntry, type TrackMeta } from "../lib/music";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const approx = (a: number, b: number, m: string, tol = 0.05) =>
  assert.ok(Math.abs(a - b) <= tol, `${m} — expected ${b}, got ${a.toFixed(3)}`);

const T0 = new Date(2026, 9, 1, 14, 0, 0).getTime();
const at = (min: number, sec = 0) => new Date(T0 + min * 60_000 + sec * 1000);
const MIN = 60_000;

const track = (id: string, durMin: number, artist = "Artist " + id): TrackMeta => ({
  spotifyId: id, kind: "track", title: "Track " + id, artist, artists: artist,
  album: null, imageUrl: null, url: null, durationMs: durMin * MIN,
});
const sample = (t: TrackMeta, when: Date, progressMin: number, isPlaying = true): Sample => ({
  ...t, at: when, progressMs: progressMin * MIN, isPlaying,
});
const hist = (t: TrackMeta, when: Date): HistoryEntry => ({ ...t, playedAt: when });
const session = { start: at(0), end: at(60) };

test("a track sampled throughout counts its full length", () => {
  const a = track("a", 4);
  const plays = buildListening({ ...session, history: [], samples: [
    sample(a, at(10), 0.25), sample(a, at(11), 1.25), sample(a, at(12), 2.25), sample(a, at(13), 3.25),
  ]});
  assert.equal(plays.length, 1);
  approx(plays[0].minutes, 4, "0.25 before + 3 between + 0.75 after");
});

test("time spent paused doesn't count as listening", () => {
  const a = track("a", 4);
  // Plays 1 min, pauses at 1:00 for ten minutes, resumes and finishes.
  const plays = buildListening({ ...session, history: [], samples: [
    sample(a, at(10), 0), sample(a, at(11), 1), sample(a, at(15), 1, false), sample(a, at(21), 1, true), sample(a, at(22), 2),
  ]});
  assert.equal(plays.length, 1, "a pause doesn't split the play");
  approx(plays[0].minutes, 4, "4 min of track, despite 13 min of wall time");
});

test("a track paused the whole time contributes nothing", () => {
  const a = track("a", 4);
  const plays = buildListening({ ...session, history: [], samples: [
    sample(a, at(5), 2, false), sample(a, at(20), 2, false),
  ]});
  assert.equal(plays.length, 0);
});

test("a skip cuts the track off where the next begins", () => {
  const a = track("a", 5), b = track("b", 3);
  const plays = buildListening({ ...session, history: [], samples: [
    sample(a, at(10), 0), sample(a, at(11), 1),
    sample(b, at(12), 0), sample(b, at(13), 1),
  ]});
  approx(plays.find((p) => p.spotifyId === "a")!.minutes, 2, "skipped at 2 min");
  approx(plays.find((p) => p.spotifyId === "b")!.minutes, 3, "b plays out");
});

test("a track already playing when the session started counts only the in-session part", () => {
  const a = track("a", 4);
  const plays = buildListening({ ...session, history: [], samples: [sample(a, at(0, 30), 3)] });
  // 3 min in at 00:30 — only the 30s since the session began, plus the remaining minute.
  approx(plays[0].minutes, 1.5, "0.5 in-session before + 1 after");
});

test("playing past the end of the session is clipped to the session", () => {
  const a = track("a", 10);
  const plays = buildListening({ ...session, history: [], samples: [sample(a, at(58), 0)] });
  approx(plays[0].minutes, 2, "session ends at 60");
});

test("a track played twice in a row is two plays", () => {
  const a = track("a", 3);
  const plays = buildListening({ ...session, history: [], samples: [
    sample(a, at(10), 0.5), sample(a, at(12), 2.5),
    sample(a, at(13, 30), 0.5), sample(a, at(15), 2),
  ]});
  assert.equal(plays.length, 2, "position jumping back means it looped");
});

test("history fills in time the app wasn't sampling", () => {
  const a = track("a", 4), b = track("b", 3);
  const plays = buildListening({ ...session,
    samples: [sample(a, at(10), 1), sample(a, at(12), 3)],
    history: [hist(b, at(30))], // the app was closed while b played
  });
  assert.equal(plays.length, 2);
  const pb = plays.find((p) => p.spotifyId === "b")!;
  assert.equal(pb.source, "history");
  approx(pb.minutes, 3, "full length of b");
});

test("a history entry for a sampled play isn't double-counted — if it marks the end", () => {
  const a = track("a", 4);
  const plays = buildListening({ ...session,
    samples: [sample(a, at(10), 0), sample(a, at(12), 2)],
    history: [hist(a, at(14))], // started 10:00, finished 14:00
  });
  assert.equal(plays.length, 1);
});

test("…or if it marks the start", () => {
  const a = track("a", 4);
  const plays = buildListening({ ...session,
    samples: [sample(a, at(10), 0), sample(a, at(12), 2)],
    history: [hist(a, at(10))],
  });
  assert.equal(plays.length, 1);
});

test("podcast episodes come through from samples", () => {
  const ep: TrackMeta = { ...track("ep", 45, "Some Show"), kind: "episode" };
  const plays = buildListening({ ...session, history: [], samples: [sample(ep, at(5), 0), sample(ep, at(20), 15)] });
  assert.equal(plays[0].kind, "episode");
});

test("tracks without a Spotify id are matched by title and artist", () => {
  const local: TrackMeta = { ...track("x", 3), spotifyId: null };
  const plays = buildListening({ ...session, history: [], samples: [sample(local, at(5), 0), sample(local, at(6), 1)] });
  assert.equal(plays.length, 1);
});

test("very short plays are ignored", () => {
  const a = track("a", 3), b = track("b", 3);
  const plays = buildListening({ ...session, history: [], samples: [
    sample(a, at(10), 0), sample(b, at(10, 5), 0), sample(b, at(11), 0.9),
  ]});
  assert.equal(plays.filter((p) => p.spotifyId === "a").length, 0, "5 seconds of a is noise");
});

test("listening never exceeds the session length", () => {
  const s = { start: at(0), end: at(10) };
  const history = Array.from({ length: 8 }, (_, i) => hist(track(`h${i}`, 4), at(i * 1.2 + 4)));
  const plays = buildListening({ ...s, samples: [], history });
  const total = plays.reduce((x, p) => x + p.minutes, 0);
  assert.ok(total <= 10 + 1e-9, `total ${total} > 10`);
});

test("nothing played means no plays", () => {
  assert.deepEqual(buildListening({ ...session, samples: [], history: [] }), []);
});

test("an empty or inverted session returns nothing", () => {
  const a = track("a", 3);
  assert.deepEqual(buildListening({ start: at(10), end: at(10), samples: [sample(a, at(10), 0)], history: [] }), []);
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

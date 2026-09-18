/** Music-vs-focus statistics. */
import assert from "node:assert/strict";
import { musicStats, MIN_COMPARE, type MusicSession, type MusicTrack } from "../lib/musicStats";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);
const approx = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 0.01, `${m} — expected ${b}, got ${a}`);

let n = 0;
const T = new Date(2026, 9, 5, 10, 0); // Monday 10:00
const t = (artist: string, minutes: number, extra: Partial<MusicTrack> = {}): MusicTrack => ({
  spotifyId: `${artist}-${minutes}-${extra.title ?? ""}`, kind: "track", title: extra.title ?? `${artist} song`,
  artist, minutes, startedAt: T, ...extra,
});
const s = (focus: number, minutes: number, tracks: MusicTrack[], musicTracked = true, startedAt = T): MusicSession => ({
  id: `s${n++}`, focus, minutes, rawMinutes: minutes, startedAt, musicTracked, tracks,
});

test("untracked sessions are kept out of music-vs-silence", () => {
  const stats = musicStats([
    s(90, 60, [], false), // before capture existed — unknown, not silent
    s(50, 60, []),
    s(70, 60, [t("A", 50)]),
  ]);
  assert.equal(stats.trackedSessions, 2);
  assert.equal(stats.untrackedSessions, 1);
  assert.equal(stats.silent.sessions, 1, "only the tracked, silent one");
  approx(stats.silent.focus!, 50, "the untracked 90 doesn't leak in");
});

test("no comparison is reported below the minimum sample size", () => {
  const few = [s(90, 60, [t("A", 50)]), s(40, 60, [])];
  assert.equal(musicStats(few).musicVsSilence, null);
});

test("music vs silence difference once there's enough data", () => {
  const sessions = [
    ...Array.from({ length: MIN_COMPARE }, () => s(80, 60, [t("A", 55)])),
    ...Array.from({ length: MIN_COMPARE }, () => s(60, 60, [])),
  ];
  approx(musicStats(sessions).musicVsSilence!, 20, "80 − 60");
});

test("focus is weighted by session length", () => {
  const stats = musicStats([s(100, 30, []), s(40, 90, [])]);
  approx(stats.silent.focus!, (100 * 30 + 40 * 90) / 120, "time-weighted");
});

test("share of study time with music", () => {
  const stats = musicStats([s(70, 60, [t("A", 45)]), s(70, 60, [])]);
  approx(stats.share, 45 / 120, "45 of 120 tracked minutes");
});

test("share never exceeds 100%", () => {
  const stats = musicStats([s(70, 30, [t("A", 45)])]);
  assert.ok(stats.share <= 1);
});

test("top artists rank by listening time", () => {
  const stats = musicStats([s(70, 60, [t("A", 10), t("B", 40)]), s(70, 60, [t("A", 20)])]);
  assert.deepEqual(stats.topArtists.map((a) => a.artist), ["B", "A"]);
  approx(stats.topArtists.find((a) => a.artist === "A")!.minutes, 30, "A summed across sessions");
});

test("focus by artist is weighted by how much of that artist each session had", () => {
  // A dominates a 90-focus session and is a sliver of a 30-focus one.
  const stats = musicStats([s(90, 60, [t("A", 50)]), s(30, 60, [t("A", 10), t("B", 45)])]);
  const a = stats.focusByArtist.find((x) => x.artist === "A")!;
  approx(a.focus!, (90 * 50 + 30 * 10) / 60, "leans towards the session A mostly soundtracked");
});

test("artists heard in only one session are left out of focus-by-artist", () => {
  const stats = musicStats([s(90, 60, [t("Once", 50)]), s(70, 60, [t("Twice", 20)]), s(60, 60, [t("Twice", 20)])]);
  assert.deepEqual(stats.focusByArtist.map((a) => a.artist), ["Twice"]);
});

test("variety is artists per hour of listening, not per session", () => {
  // Two artists over two hours is 1/hr — a focused session, despite two artists.
  const long = s(80, 120, [t("A", 60), t("B", 60)]);
  // Eight artists in one hour is 8/hr.
  const busy = s(50, 60, ["A", "B", "C", "D", "E", "F", "G", "H"].map((a) => t(a, 7)));
  const stats = musicStats([long, busy]);
  assert.equal(stats.variety.find((v) => v.label.startsWith("1–2"))!.sessions, 1);
  assert.equal(stats.variety.find((v) => v.label.startsWith("7+"))!.sessions, 1);
});

test("music share by hour: an hour of study with 30 minutes of music is 50%", () => {
  const stats = musicStats([s(70, 60, [t("A", 30, { startedAt: new Date(2026, 9, 5, 10, 0) })])]);
  const ten = stats.byHour[10];
  assert.equal(ten.studyMinutes, 60);
  assert.equal(ten.musicMinutes, 30);
  approx(ten.share!, 0.5, "half the hour had music");
});

test("hours with no study have no share rather than 0%", () => {
  const stats = musicStats([s(70, 60, [t("A", 30)])]);
  assert.equal(stats.byHour[3].share, null, "never studied at 3am — unknown, not silent");
});

test("a session across midnight is split between the two hours and days", () => {
  const late = new Date(2026, 9, 5, 23, 30); // Monday 23:30
  const stats = musicStats([s(70, 90, [t("A", 90, { startedAt: late })], true, late)]);
  approx(stats.byHour[23].studyMinutes, 30, "30 min at 23:00");
  approx(stats.byHour[0].studyMinutes, 60, "60 min at 00:00");
  approx(stats.byWeekday[0].studyMinutes, 30, "Monday gets 30");
  approx(stats.byWeekday[1].studyMinutes, 60, "Tuesday gets 60");
});

test("music by weekday is a share of that weekday's study", () => {
  const mon = new Date(2026, 9, 5, 14, 0), tue = new Date(2026, 9, 6, 14, 0);
  const stats = musicStats([
    s(70, 60, [t("A", 60, { startedAt: mon })], true, mon),
    s(70, 60, [], true, tue),
  ]);
  approx(stats.byWeekday[0].share!, 1, "Monday: all music");
  approx(stats.byWeekday[1].share!, 0, "Tuesday: studied in silence");
  assert.equal(stats.byWeekday[2].share, null, "Wednesday: no study");
});

test("untracked sessions don't count towards music-by-time either", () => {
  const stats = musicStats([s(70, 60, [], false)]);
  assert.equal(stats.byHour[10].studyMinutes, 0);
});

test("no sessions at all gives empty, not NaN", () => {
  const stats = musicStats([]);
  assert.equal(stats.share, 0);
  assert.equal(stats.music.focus, null);
  assert.equal(stats.musicVsSilence, null);
  assert.deepEqual(stats.topArtists, []);
  assert.ok(stats.byHour.every((h) => h.share === null));
});

let passed = 0, failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[31m${(e as Error).message}\x1b[0m`); }
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

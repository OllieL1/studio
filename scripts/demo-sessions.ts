/**
 * Generates plausible demo study sessions so the stats page can be previewed
 * before you've logged real work.
 *
 *   npx tsx scripts/demo-sessions.ts          # add ~6 weeks of demo sessions
 *   npx tsx scripts/demo-sessions.ts --clear  # remove them again
 *
 * Demo sessions are tagged in `notes` so --clear only ever removes these and
 * never touches anything you logged yourself.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TAG = "[demo]";

async function main() {
  if (process.argv.includes("--clear")) {
    const { count } = await db.session.deleteMany({ where: { notes: { startsWith: TAG } } });
    console.log(`\n  Removed ${count} demo session(s).\n`);
    return;
  }

  const courses = await db.course.findMany({ where: { archived: false } });
  if (courses.length === 0) {
    console.log("No courses — run `npm run seed` first.");
    return;
  }

  // Deterministic pseudo-random, so re-running gives the same demo data.
  let seed = 20262027;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  // Fictional artists — obviously demo, never mistaken for your real listening.
  // "calm" ones skew towards high-focus sessions so the music stats have
  // something to show.
  const CALM = ["Low Tide Collective", "Paper Satellites", "Moss & Static", "The Quiet Engines"];
  const BUSY = ["Neon Parade", "Velvet Riot", "Sugarglass", "Loud Weather"];
  const SHOW = "The Study Hour (podcast)";

  const NAMES = [
    "Lecture notes write-up", "Past paper practice", "Reading + annotation",
    "Coursework draft", "Tutorial problems", "Lab write-up",
    "Revision cards", "Essay planning", "Debugging exercise",
  ];

  const rows: Parameters<typeof db.session.create>[0]["data"][] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = 41; d >= 0; d--) {
    const day = new Date(today);
    day.setDate(day.getDate() - d);
    const dow = ((day.getDay() + 6) % 7) + 1;

    // Fewer, shorter sessions at weekends; occasional rest day.
    const weekend = dow >= 6;
    if (rnd() < (weekend ? 0.55 : 0.18)) continue;
    const count = weekend ? 1 : 1 + Math.floor(rnd() * 2.4);

    for (let i = 0; i < count; i++) {
      // Late-morning and evening peaks, which is what most people look like.
      const startHour = rnd() < 0.5 ? 9 + Math.floor(rnd() * 4) : 17 + Math.floor(rnd() * 5);
      const startedAt = new Date(day);
      startedAt.setHours(startHour, Math.floor(rnd() * 60), 0, 0);

      const rawMinutes = 25 + Math.floor(rnd() * 130);
      const trimmed = rnd() < 0.3 ? Math.floor(rnd() * 12) : 0;
      const minutes = Math.max(10, rawMinutes - trimmed);

      // Focus drifts down with length and late hours — gives the analytics
      // something real to find.
      const lengthPenalty = Math.min(22, Math.max(0, (minutes - 75) / 6));
      const latePenalty = startHour >= 21 ? 12 : 0;
      const focus = Math.round(
        Math.max(25, Math.min(100, 84 - lengthPenalty - latePenalty + (rnd() * 20 - 10))),
      );

      const subject = pick(courses);
      const second = rnd() < 0.15 ? pick(courses) : null;
      const courseIds = [...new Set([subject.id, ...(second ? [second.id] : [])])];

      // Split shared sessions unevenly — a realistic 60/40-ish rather than a
      // tidy 50/50 — so the split feature has something to show.
      const slices =
        courseIds.length === 1
          ? [minutes]
          : (() => {
              const first = Math.round(minutes * (0.55 + rnd() * 0.3));
              return [first, minutes - first];
            })();

      // ~70% of sessions have music. Calm artists lean towards focused sessions.
      const tracks: {
        spotifyId: string; kind: string; title: string; artist: string; artists: string;
        startedAt: Date; minutes: number;
      }[] = [];
      if (rnd() < 0.7) {
        const podcast = rnd() < 0.12;
        const pool = focus >= 75 ? (rnd() < 0.8 ? CALM : BUSY) : (rnd() < 0.7 ? BUSY : CALM);
        const loop = rnd() < 0.15;
        let t = startedAt.getTime();
        const stop = t + rawMinutes * 60000 * (0.6 + rnd() * 0.4);
        let i = 0;
        while (t < stop) {
          const artist = podcast ? SHOW : pick(pool);
          const len = podcast ? 30 + rnd() * 25 : 2.5 + rnd() * 2.5;
          const title = podcast ? `Episode ${1 + Math.floor(rnd() * 90)}` : loop ? "Deep Current" : `Track ${1 + Math.floor(rnd() * 12)}`;
          const played = Math.min(len, (stop - t) / 60000);
          tracks.push({
            spotifyId: `demo-${artist}-${title}`, kind: podcast ? "episode" : "track",
            title, artist, artists: artist, startedAt: new Date(t), minutes: Math.round(played * 100) / 100,
          });
          t += played * 60000;
          if (++i > 80) break;
        }
      }

      rows.push({
        name: pick(NAMES),
        startedAt,
        endedAt: new Date(startedAt.getTime() + rawMinutes * 60000),
        minutes,
        rawMinutes,
        focus,
        musicTracked: true,
        tracks: { create: tracks },
        notes: `${TAG} generated sample session`,
        courses: { create: courseIds.map((courseId, i) => ({ courseId, minutes: slices[i] })) },
      });
    }
  }

  for (const data of rows) await db.session.create({ data });
  const mins = rows.reduce((s, r) => s + (r.minutes as number), 0);
  console.log(
    `\n  Created ${rows.length} demo sessions (${Math.round(mins / 60)}h).\n` +
      `  Remove them with: npx tsx scripts/demo-sessions.ts --clear\n`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

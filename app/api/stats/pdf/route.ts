import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { visibleCourseWhere } from "@/lib/types";
import { getDailySeries, getSessions } from "@/lib/queries";
import {
  byDayOfWeek, byHourOfDay, byLocation, bySubject, focusByLength,
  focusDistribution, headline, rollingMean, type StatSession,
} from "@/lib/stats";
import { musicStats } from "@/lib/musicStats";
import { isSpotifyConfigured } from "@/lib/spotify";
import { buildStatsPdf } from "@/lib/pdf/stats";
import { addDays, startOfDay, toISODate } from "@/lib/dates";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

const RANGE_LABEL: Record<string, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  all: "All time",
};

/**
 * The stats page as a PDF. `?range=7|30|90` matches the picker on screen;
 * anything else is all time.
 */
export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "all";
  const days = range === "7" ? 7 : range === "30" ? 30 : range === "90" ? 90 : null;

  const [raw, courses, daily, spotifyAuth] = await Promise.all([
    getSessions(days ?? undefined),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, colour: true },
    }),
    getDailySeries(days ?? 60),
    isSpotifyConfigured() ? db.spotifyAuth.findUnique({ where: { id: "singleton" }, select: { id: true } }) : null,
  ]);

  const sessions: StatSession[] = raw;
  if (sessions.length === 0) return new Response("No sessions to report on yet.", { status: 404 });

  const musicSessions = await db.session.findMany({
    where: days ? { startedAt: { gte: startOfDay(addDays(new Date(), -days)) } } : undefined,
    select: {
      id: true, focus: true, minutes: true, rawMinutes: true, startedAt: true, musicTracked: true,
      tracks: { select: { spotifyId: true, kind: true, title: true, artist: true, minutes: true, startedAt: true } },
    },
  });

  const pdf = await buildStatsPdf({
    rangeLabel: RANGE_LABEL[range] ?? RANGE_LABEL.all,
    generatedAt: new Date(),
    headline: headline(sessions),
    byHour: byHourOfDay(sessions),
    byDay: byDayOfWeek(sessions),
    daily,
    focusTrend: rollingMean(daily.map((d) => d.focus), 7),
    focusBands: focusDistribution(sessions),
    focusByLength: focusByLength(sessions),
    subjects: bySubject(sessions, courses),
    places: byLocation(sessions),
    music: spotifyAuth ? musicStats(musicSessions) : null,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="studio-stats-${toISODate(new Date())}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

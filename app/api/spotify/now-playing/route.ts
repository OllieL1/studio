import { NextResponse } from "next/server";
import { getNowPlaying, isSpotifyConfigured, recordSampleIfStudying } from "@/lib/spotify";

/** Polled by the now-playing widget. Never errors — the widget just hides. */
export async function GET() {
  if (!isSpotifyConfigured()) return NextResponse.json({ state: "disconnected" });
  try {
    const np = await getNowPlaying();
    // While the timer runs, every poll also records what's playing.
    await recordSampleIfStudying(np).catch(() => {});
    return NextResponse.json(np, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ state: "idle" });
  }
}

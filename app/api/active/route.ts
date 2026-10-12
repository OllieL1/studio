import { NextResponse } from "next/server";
import { getActiveNow } from "@/lib/calendarData";

/** Polled by the header's live badge. Never errors — the badge just hides. */
export async function GET() {
  try {
    const active = await getActiveNow();
    return NextResponse.json(active, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(null);
  }
}

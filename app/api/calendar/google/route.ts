import { NextResponse, type NextRequest } from "next/server";
import { getGoogleCalendarItems } from "@/lib/calendarData";
import type { CalendarItem } from "@/lib/calendar";

export type GoogleItemsResponse = { items: CalendarItem[]; error: string | null };

/** A month view plus its spill into the neighbouring weeks is ~6 weeks; anything much past that isn't the calendar asking. */
const MAX_DAYS = 70;

/**
 * Google's events for the calendar's visible range. They're the slow part of
 * the calendar - a round trip to Google per calendar - so the page doesn't
 * wait for them: it opens with everything this app holds and asks here
 * afterwards. Never errors; a failure comes back as `error` for the page to say.
 */
export async function GET(req: NextRequest) {
  const start = new Date(req.nextUrl.searchParams.get("start") ?? "");
  const end = new Date(req.nextUrl.searchParams.get("end") ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || end.getTime() - start.getTime() > MAX_DAYS * 86_400_000) {
    return NextResponse.json({ items: [], error: "Bad range." } satisfies GoogleItemsResponse, { status: 400 });
  }
  try {
    const { items, error } = await getGoogleCalendarItems(start, end);
    return NextResponse.json({ items, error } satisfies GoogleItemsResponse, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { items: [], error: "Google Calendar is unreachable - showing everything else." } satisfies GoogleItemsResponse,
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

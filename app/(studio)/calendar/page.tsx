import { db } from "@/lib/db";
import { visibleCourseWhere } from "@/lib/types";
import { parseLocalDate, toISODate } from "@/lib/dates";
import { viewRange, type CalendarView } from "@/lib/calendar";
import { getCalendarSidebar, getLocalCalendarItems } from "@/lib/calendarData";
import { CalendarShell } from "@/components/calendar/CalendarShell";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const view: CalendarView = params.view === "month" ? "month" : "week";
  const anchor =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? parseLocalDate(params.date) : new Date();

  const range = viewRange(view, anchor);

  // Only what this app holds: Google's events are a round trip to Google per
  // calendar, so the page doesn't wait for them. The shell fetches them from
  // /api/calendar/google once it's up and they appear as they arrive.
  const [{ items, googleConnected }, sidebar, courses] = await Promise.all([
    getLocalCalendarItems(range.start, range.end),
    getCalendarSidebar(),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, colour: true },
    }),
  ]);

  return (
    <CalendarShell
      view={view}
      anchor={toISODate(anchor)}
      items={items}
      sidebar={sidebar}
      courses={courses}
      googleConnected={googleConnected}
      rangeStart={range.start.toISOString()}
      rangeEnd={range.end.toISOString()}
    />
  );
}

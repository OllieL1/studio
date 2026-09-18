import { db } from "@/lib/db";
import { visibleCourseWhere } from "@/lib/types";
import { parseLocalDate, toISODate } from "@/lib/dates";
import { viewRange, type CalendarView } from "@/lib/calendar";
import { getCalendarItems, getCalendarSidebar } from "@/lib/calendarData";
import { CalendarShell } from "@/components/calendar/CalendarShell";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const view: CalendarView = params.view === "week" ? "week" : "month";
  const anchor =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? parseLocalDate(params.date) : new Date();

  const range = viewRange(view, anchor);

  const [{ items, googleConnected, googleError }, sidebar, courses] = await Promise.all([
    getCalendarItems(range.start, range.end),
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
      googleError={googleError}
    />
  );
}

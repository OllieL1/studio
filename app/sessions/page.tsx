import { db } from "@/lib/db";
import { visibleCourseWhere } from "@/lib/types";
import { fmtDuration } from "@/lib/dates";
import { Card, Eyebrow, EmptyState } from "@/components/ui";
import { SessionList } from "@/components/SessionList";
import { ManualLog } from "@/components/ManualLog";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const [sessions, courses] = await Promise.all([
    db.session.findMany({
      orderBy: { startedAt: "desc" },
      take: 200,
      include: {
        courses: { include: { course: { select: { id: true, shortName: true, colour: true } } } },
        tasks: { include: { task: { select: { id: true, title: true } } } },
      },
    }),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, colour: true, code: true },
    }),
  ]);

  const total = sessions.reduce((s, x) => s + x.minutes, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>History</Eyebrow>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
            Sessions
          </h1>
        </div>
        <p className="font-num text-[13px] text-n-500">
          {sessions.length} logged · {fmtDuration(total)} total
        </p>
      </div>

      <ManualLog courses={courses} />

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing logged yet."
            body="Use the timer at the bottom of the screen, or add a session by hand above if you studied away from the laptop."
          />
        </Card>
      ) : (
        <SessionList
          sessions={sessions.map((s) => ({
            id: s.id,
            name: s.name,
            startedAt: s.startedAt.toISOString(),
            minutes: s.minutes,
            rawMinutes: s.rawMinutes,
            focus: s.focus,
            notes: s.notes,
            courses: s.courses.map((c) => ({ ...c.course, minutes: c.minutes })),
            tasks: s.tasks.map((t) => t.task),
          }))}
        />
      )}
    </div>
  );
}

import { db } from "@/lib/db";
import { computeTaskMetrics, attributedMinutes } from "@/lib/taskStats";
import { fmtDate, fmtDayDate, fmtDuration, fmtHM, fmtRelative } from "@/lib/dates";
import { Card, Eyebrow, EmptyState, Stat } from "./ui";
import { BarChart } from "./charts/BarChart";
import { focusColour } from "@/lib/focus";

/**
 * Time tracked against one task, plus the sessions it came from.
 * Shared by the task page and the lecture page.
 *
 * A session tagged to several tasks is shared evenly between them
 * (lib/taskStats.ts), so no time is ever counted twice.
 */
export async function TaskTime({
  taskId,
  showWeekday = true,
  emptyHint = "When you stop the timer, tag this task under “Tasks worked on” and its time and focus show up here.",
}: {
  taskId: string;
  /** The weekday chart is useful for long-running coursework, noise for a lecture. */
  showWeekday?: boolean;
  emptyHint?: string;
}) {
  const links = await db.sessionTask.findMany({
    where: { taskId },
    include: {
      session: {
        include: {
          _count: { select: { tasks: true } },
          courses: { include: { course: { select: { shortName: true, colour: true } } } },
        },
      },
    },
  });

  const sessions = links
    .map((l) => l.session)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const metrics = computeTaskMetrics(
    sessions.map((s) => ({
      id: s.id, name: s.name, startedAt: s.startedAt,
      minutes: s.minutes, focus: s.focus, taskCount: s._count.tasks,
    })),
  );

  return (
    <>
      <Card className="p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <Eyebrow>Time tracked</Eyebrow>
          {metrics.hasSharedSessions && (
            <span className="text-[11px] text-n-400">Sessions tagged to several tasks are shared evenly</span>
          )}
        </div>

        {metrics.sessions === 0 ? (
          <EmptyState title="No time logged yet." body={emptyHint} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat label="Total" value={fmtDuration(metrics.minutes)} sub={`${metrics.sessions} session${metrics.sessions === 1 ? "" : "s"}`} />
              <Stat label="Per session" value={fmtDuration(metrics.avgSessionMinutes ?? 0)} sub={`${metrics.activeDays} day${metrics.activeDays === 1 ? "" : "s"} active`} />
              <Stat
                label="Avg focus"
                value={metrics.avgFocus != null ? metrics.avgFocus.toFixed(0) : "-"}
                unit={metrics.avgFocus != null ? "%" : undefined}
                tone={metrics.avgFocus != null ? focusColour(metrics.avgFocus) : undefined}
              />
              <Stat
                label="Last worked"
                value={metrics.lastWorked ? fmtRelative(metrics.lastWorked) : "-"}
                sub={metrics.firstWorked ? `Started ${fmtDate(metrics.firstWorked)}` : undefined}
              />
            </div>

            {showWeekday && (
              <div className="mt-5 border-t border-n-100 pt-4">
                <Eyebrow className="mb-3">By weekday</Eyebrow>
                <BarChart
                  bars={metrics.byWeekday.map((d) => ({ label: d.label, value: d.minutes }))}
                  height={90}
                  format="duration"
                  highlight="max"
                />
              </div>
            )}
          </>
        )}
      </Card>

      {sessions.length > 0 && (
        <Card>
          <div className="border-b border-n-100 px-4 py-2.5">
            <Eyebrow>Work history</Eyebrow>
          </div>
          {sessions.map((s) => {
            const share = attributedMinutes({ ...s, taskCount: s._count.tasks });
            return (
              <div key={s.id} className="flex items-start gap-3 border-b border-n-100 px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-n-800">{s.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-n-500">
                    <span className="font-num">{fmtDayDate(s.startedAt)} · {fmtHM(s.startedAt)}</span>
                    {s.courses.map((c) => (
                      <span key={c.courseId} style={{ color: c.course.colour }} className="font-medium">
                        {c.course.shortName}
                      </span>
                    ))}
                    {s._count.tasks > 1 && (
                      <span className="text-n-400">
                        shared with {s._count.tasks - 1} other task{s._count.tasks === 2 ? "" : "s"}
                      </span>
                    )}
                  </p>
                </div>
                <span className="font-num shrink-0 text-[11.5px] font-semibold" style={{ color: focusColour(s.focus) }}>
                  {s.focus}%
                </span>
                <span className="font-num w-16 shrink-0 text-right text-[13px] font-semibold text-n-800">
                  {fmtDuration(share)}
                  {s._count.tasks > 1 && (
                    <span className="block text-[10.5px] font-normal text-n-400">of {fmtDuration(s.minutes)}</span>
                  )}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}

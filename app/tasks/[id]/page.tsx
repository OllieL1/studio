import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { visibleCourseWhere, TASK_KIND_LABEL } from "@/lib/types";
import { taskRatio, isTaskDone } from "@/lib/progress";
import { fmtDateLong, fmtRelative, fmtTime, toISODate, urgencyOf, fmtHM } from "@/lib/dates";
import { isGoogleConfigured } from "@/lib/google";
import { Eyebrow, Pill, ProgressBar } from "@/components/ui";
import { TaskEditButton } from "@/components/TaskEditModal";
import { TaskTime } from "@/components/TaskTime";
import { SubtaskPanel } from "@/components/SubtaskPanel";
import { DependencyEditor } from "@/components/DependencyEditor";
import { CalendarButton } from "@/components/CalendarButton";

export const dynamic = "force-dynamic";

/** Everything about one task: its detail, checklist, dependencies and the work logged against it. */
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const task = await db.task.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      course: true,
      dependsOn: { include: { prerequisite: { include: { items: true, course: true } } } },
      dependents: { include: { dependent: { include: { items: true, course: true } } } },
    },
  });
  if (!task) notFound();

  const visible = await db.course.findMany({
    where: visibleCourseWhere(),
    orderBy: { position: "asc" },
    select: { id: true, name: true, shortName: true, colour: true },
  });
  // The task's own course must always be selectable, even if it's hidden
  // (a semester-2 course before January) — otherwise the editor would show
  // "No course" for a task that has one.
  const courses =
    task.course && !visible.some((c) => c.id === task.course!.id)
      ? [...visible, { id: task.course.id, name: task.course.name, shortName: task.course.shortName, colour: task.course.colour }]
      : visible;

  const done = isTaskDone(task);
  const ratio = taskRatio(task);
  const urgency = urgencyOf(task.dueAt, done);
  const isClass = ["LECTURE", "LAB", "SEMINAR"].includes(task.kind);

  const prereqs = task.dependsOn.map((d) => d.prerequisite);
  const prereqsDone = prereqs.filter((p) => isTaskDone(p)).length;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {task.course ? (
            <Link href={`/courses/${task.course.id}`} className="font-medium hover:underline" style={{ color: task.course.colour }}>
              ← {task.course.name}
            </Link>
          ) : (
            <Link href="/" className="font-medium text-n-500 hover:text-rust-600">← Home</Link>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {task.course && (
              <span aria-hidden className="mt-1.5 h-9 w-[5px] shrink-0 rounded-full" style={{ background: task.course.colour }} />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Eyebrow>{TASK_KIND_LABEL[task.kind] ?? task.kind}</Eyebrow>
                {done && <Pill tone="ok">Complete</Pill>}
                {task.cancelled && <Pill tone="neutral">Cancelled</Pill>}
                {task.priority > 0 && !done && <Pill tone="rust">Priority</Pill>}
                {urgency === "overdue" && <Pill tone="danger">Overdue</Pill>}
                {urgency === "soon" && <Pill tone="warn">Due soon</Pill>}
              </div>
              <h1 className="font-display mt-1 text-[32px] leading-10 font-semibold tracking-tight text-n-900">
                {task.title}
              </h1>
              <p className="mt-1 text-[13px] text-n-500">
                {task.dueAt ? (
                  <>
                    {fmtDateLong(task.dueAt)}
                    {task.startMin != null
                      ? ` · ${fmtTime(task.startMin)}${task.endMin != null ? `–${fmtTime(task.endMin)}` : ""}`
                      : ` · ${fmtHM(task.dueAt)}`}
                    {!done && <span className="text-n-400"> · {fmtRelative(task.dueAt)}</span>}
                  </>
                ) : task.examDiet ? (
                  task.examDiet
                ) : (
                  "No date"
                )}
                {task.gradeWeight != null && (
                  <span className="font-num text-n-400"> · {task.gradeWeight}% of grade</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TaskEditButton
              task={{
                id: task.id,
                title: task.title,
                courseId: task.courseId,
                kind: task.kind,
                notes: task.notes,
                dueDate: task.dueAt ? toISODate(task.dueAt) : "",
                dueTime: task.dueAt
                  ? `${String(task.dueAt.getHours()).padStart(2, "0")}:${String(task.dueAt.getMinutes()).padStart(2, "0")}`
                  : "",
                startTime: task.startMin != null ? fmtTime(task.startMin) : "",
                endTime: task.endMin != null ? fmtTime(task.endMin) : "",
                gradeWeight: task.gradeWeight,
                priority: task.priority > 0,
                cancelled: task.cancelled,
                examDiet: task.examDiet,
              }}
              courses={courses}
            />
            {isClass && (
              <Link
                href={`/lectures/${task.id}`}
                className="rounded-md border border-n-200 bg-n-0 px-3 py-1.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
              >
                Notes
              </Link>
            )}
            {isGoogleConfigured() && task.dueAt && (
              <span className="flex items-center gap-1 rounded-md border border-n-200 bg-n-0 pl-2.5 text-[12px] font-semibold text-n-600">
                {task.calendarEventId ? "On calendar" : "Add to calendar"}
                <CalendarButton taskId={task.id} onCalendar={!!task.calendarEventId} hasDate compact />
              </span>
            )}
          </div>
        </div>

        {task.items.length > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar value={ratio * 100} colour={task.course?.colour} height={7} className="flex-1" />
            <span className="font-num shrink-0 text-[13px] font-semibold text-n-700">
              {Math.round(ratio * 100)}%
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ── Main column ──────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <SubtaskPanel
            taskId={task.id}
            kind={task.kind}
            done={!!task.doneAt}
            items={task.items.map((i) => ({ id: i.id, label: i.label, done: !!i.doneAt }))}
          />

          <TaskTime taskId={task.id} />
        </div>

        {/* ── Side column ──────────────────────────────────────────────── */}
        <aside className="space-y-5">

          <DependencyEditor
            taskId={task.id}
            courseId={task.courseId}
            prerequisites={prereqs.map((p) => ({
              id: p.id, title: p.title, done: isTaskDone(p),
              colour: p.course?.colour ?? null, courseShort: p.course?.shortName ?? null,
            }))}
            dependents={task.dependents.map((d) => ({
              id: d.dependent.id, title: d.dependent.title, done: isTaskDone(d.dependent),
              colour: d.dependent.course?.colour ?? null, courseShort: d.dependent.course?.shortName ?? null,
            }))}
            readiness={prereqs.length > 0 ? { done: prereqsDone, total: prereqs.length } : null}
          />
        </aside>
      </div>
    </div>
  );
}

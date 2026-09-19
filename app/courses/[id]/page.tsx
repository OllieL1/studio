import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { computeCourseProgress, readinessFor } from "@/lib/progress";
import { revisionProgress } from "@/lib/tasks";
import { fmtDuration, fmtRelative, addWeeks } from "@/lib/dates";
import { TERM_START, TERM_WEEKS } from "@/lib/types";
import { parseLocalDate } from "@/lib/dates";
import { Card, Eyebrow, ProgressBar, SectionHeading, Stat, Pill } from "@/components/ui";
import { WeightEditor } from "@/components/WeightEditor";
import { RevisionToggle } from "@/components/RevisionToggle";
import { CourseTabs } from "@/components/CourseTabs";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const course = await db.course.findUnique({
    where: { id },
    include: {
      tasks: {
        include: { items: { orderBy: { position: "asc" } } },
        orderBy: [{ dueAt: "asc" }, { title: "asc" }],
      },
      slots: true,
    },
  });
  if (!course) notFound();
  // The project has its own workspace; its course page would be a thinner copy.
  if (course.isProject) redirect("/project");

  const deps = await db.taskDependency.findMany({
    where: { dependent: { courseId: course.id } },
    include: { prerequisite: { include: { items: true } } },
  });

  // Each row is this course's own slice of the session, so an unevenly-split
  // session contributes only the time actually spent on this subject.
  const time = await db.sessionCourse.findMany({
    where: { courseId: course.id },
    include: { session: { select: { focus: true } } },
  });
  const minutes = time.reduce((s, x) => s + x.minutes, 0);
  const avgFocus =
    minutes > 0
      ? time.reduce((s, x) => s + x.session.focus * x.minutes, 0) / minutes
      : 0;

  const progress = computeCourseProgress(course, course.tasks);
  const revision = await revisionProgress(db, course.id);
  const lectureCount = course.tasks.filter(
    (t) => ["LECTURE", "SEMINAR"].includes(t.kind) && !t.cancelled,
  ).length;
  // Revision only makes sense ahead of an exam. A course already in revision
  // keeps the control, so it can always be switched back off.
  const hasExam = course.tasks.some((t) => t.kind === "EXAM" && !t.cancelled);
  const showRevision = hasExam || course.revisionMode;
  const withCourse = course.tasks.map((t) => ({
    ...t,
    course: { id: course.id, shortName: course.shortName, colour: course.colour, name: course.name },
  }));

  const classes = withCourse.filter((t) => ["LECTURE", "LAB", "SEMINAR"].includes(t.kind));
  const assessments = withCourse.filter((t) => ["COURSEWORK", "QUIZ"].includes(t.kind));
  const exams = withCourse.filter((t) => t.kind === "EXAM");
  const other = withCourse.filter((t) => t.kind === "OTHER");

  // Group classes by teaching week so the term reads as a term.
  const termStart = parseLocalDate(TERM_START);
  const weeks = Array.from({ length: TERM_WEEKS }, (_, i) => {
    const start = addWeeks(termStart, i);
    const end = addWeeks(start, 1);
    return {
      n: i + 1,
      start,
      tasks: classes.filter((t) => t.dueAt && t.dueAt >= start && t.dueAt < end),
    };
  }).filter((w) => w.tasks.length > 0);

  const unscheduled = classes.filter(
    (t) => !t.dueAt || t.dueAt < termStart || t.dueAt >= addWeeks(termStart, TERM_WEEKS),
  );

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <Link href="/" className="text-[12px] font-medium text-n-500 hover:text-rust-600">
          ← Home
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="h-9 w-[5px] shrink-0 rounded-full"
              style={{ background: course.colour }}
            />
            <div>
              <Eyebrow>{course.code}</Eyebrow>
              <h1 className="font-display mt-0.5 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
                {course.name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
          {lectureCount > 0 && (
            <Link
              href={`/lectures?course=${course.id}`}
              className="rounded-md border border-n-200 bg-n-0 px-3 py-1.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
            >
              Lecture notes
            </Link>
          )}
          <span className="font-num text-[40px] font-semibold leading-none text-n-900">
            {progress.percent.toFixed(1)}
            <span className="text-[18px] text-n-400">%</span>
          </span>
          </div>
        </div>
        <ProgressBar value={progress.percent} colour={course.colour} className="mt-4" height={8} />
      </div>

      {/* ── Breakdown ──────────────────────────────────────────────────── */}
      <Card className="animate-fade-up p-5" style={{ animationDelay: "40ms" }}>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Eyebrow className="mb-3">Weighted breakdown</Eyebrow>
            <div className="space-y-3">
              {progress.categories.map((c) => (
                <div key={c.category} className={c.present ? "" : "opacity-40"}>
                  <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                    <span className="font-medium capitalize text-n-700">
                      {c.category === "assessment" ? "Assessed work" : `${c.category}s`}
                      {!c.present && <span className="ml-1.5 text-n-400">- none</span>}
                    </span>
                    <span className="font-num text-n-500">
                      {c.present && (
                        <>
                          <span className="text-n-700">{(c.ratio * 100).toFixed(0)}%</span>
                          <span className="mx-1.5 text-n-300">·</span>
                          <span>{c.weight.toFixed(0)}% of bar</span>
                          <span className="mx-1.5 text-n-300">·</span>
                          <span>{c.itemsDone}/{c.itemsTotal}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <ProgressBar
                    value={c.present ? c.ratio * 100 : 0}
                    colour={course.colour}
                    height={6}
                  />
                </div>
              ))}
            </div>
            {progress.categories.some((c) => !c.present && c.configuredWeight > 0) && (
              <p className="mt-3 text-[11px] leading-4 text-n-400">
                Categories with no tasks are excluded and their weight is redistributed across the rest.
              </p>
            )}
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Tasks done" value={`${progress.tasksDone}`} sub={`of ${progress.tasksTotal}`} />
              <Stat label="Time logged" value={fmtDuration(minutes)} sub={`${time.length} sessions`} />
            </div>
            {avgFocus > 0 && (
              <Stat
                label="Avg focus"
                value={avgFocus.toFixed(0)}
                unit="%"
                tone={avgFocus >= 75 ? "var(--color-ok)" : avgFocus >= 50 ? "var(--color-warn)" : "var(--color-danger)"}
              />
            )}
            {showRevision && (
            <RevisionToggle
              courseId={course.id}
              on={course.revisionMode}
              lectureCount={lectureCount}
              revised={revision.revised}
              total={revision.total}
              colour={course.colour}
            />
            )}

            <WeightEditor
              courseId={course.id}
              lecture={course.lectureWeight}
              lab={course.labWeight}
              assessment={course.assessmentWeight}
              credits={course.credits}
              colour={course.colour}
            />
          </div>
        </div>
      </Card>

      {/* ── Exams ──────────────────────────────────────────────────────── */}
      {exams.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: "80ms" }}>
          <SectionHeading title="Exam" sub="Excluded from the progress bar - tracked by readiness." />
          <div className="grid gap-4 sm:grid-cols-2">
            {exams.map((e) => {
              const prereqs = deps.filter((d) => d.dependentId === e.id).map((d) => d.prerequisite);
              const r = readinessFor(e, course, prereqs, course.tasks);
              return (
                <Card key={e.id} accent={course.colour} className="p-4 pl-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-n-800">{e.title}</p>
                      <p className="mt-0.5 text-[12px] text-n-500">
                        {e.examDiet ?? (e.dueAt ? fmtRelative(e.dueAt) : "Date TBC")}
                        {e.gradeWeight != null && (
                          <span className="font-num ml-2 text-n-400">{e.gradeWeight}% of grade</span>
                        )}
                      </p>
                    </div>
                    <Pill tone={r.ratio >= 0.999 ? "ok" : "neutral"}>
                      {Math.round(r.ratio * 100)}%
                    </Pill>
                  </div>
                  <div className="mt-3.5">
                    <div className="mb-1.5 flex items-baseline justify-between text-[11.5px]">
                      <span className="text-n-500">{r.basis === "tasks" ? "Project tasks done" : "Prerequisite lectures"}</span>
                      <span className="font-num text-n-600">{r.ready}/{r.total}</span>
                    </div>
                    <ProgressBar value={r.ratio * 100} colour={course.colour} height={5} />
                    <p className="mt-2 text-[11px] leading-4 text-n-400">
                      Advisory only - you can tick the exam off whenever you like.
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Work ───────────────────────────────────────────────────────── */}
      <CourseTabs
        assessments={assessments}
        weeks={weeks.map((w) => ({ n: w.n, start: w.start.toISOString(), tasks: w.tasks }))}
        unscheduled={unscheduled}
        other={other}
      />
    </div>
  );
}

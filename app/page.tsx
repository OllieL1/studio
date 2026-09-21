import type { Route } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { courseHref, visibleCourseWhere } from "@/lib/types";
import {
  getCourses, getOverall, getDayTasks, getUpcoming, getOverdue,
  getHeadlineStats, getDailySeries,
} from "@/lib/queries";
import { fmtDateLong, fmtDuration, fmtRelative, daysUntil } from "@/lib/dates";
import { Card, Eyebrow, EmptyState, ProgressBar, SectionHeading, Stat, Pill } from "@/components/ui";
import { QuickAdd } from "@/components/QuickAdd";
import { TaskRow } from "@/components/TaskRow";
import { Sparkbar } from "@/components/charts/Sparkbar";
import { isGoogleConfigured } from "@/lib/google";
import { cssColour } from "@/lib/palette";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const now = new Date();
  const [courses, todayTasks, upcoming, overdue, stats, daily, composerCourses] =
    await Promise.all([
      getCourses(),
      getDayTasks(now),
      getUpcoming(),
      getOverdue(),
      getHeadlineStats(),
      getDailySeries(21),
      db.course.findMany({
        where: visibleCourseWhere(),
        orderBy: { position: "asc" },
        select: { id: true, name: true, shortName: true, code: true, colour: true },
      }),
    ]);

  const overall = getOverall(courses);
  const calendarConnected =
    isGoogleConfigured() &&
    !!(await db.googleAuth.findUnique({ where: { id: "singleton" }, select: { id: true } }));
  const classes = todayTasks.filter((t) => t.startMin != null);
  const dueToday = todayTasks.filter((t) => t.startMin == null);

  const allExams = courses
    .flatMap((c) => c.exams.map((e) => ({ ...e, course: c })))
    .sort((a, b) => (a.examDiet ?? "").localeCompare(b.examDiet ?? ""));

  return (
    <div className="space-y-10">
      {/* ── Greeting + overall ─────────────────────────────────────────── */}
      <section className="animate-fade-up">
        <Eyebrow>{fmtDateLong(now)}</Eyebrow>
        <h1 className="font-display mt-1 text-[38px] leading-[44px] font-semibold tracking-tight text-n-900">
          {greeting(now)}, Ollie.
        </h1>

        <Card className="mt-6 p-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-[200px] flex-1">
              <Eyebrow>Overall progress</Eyebrow>
              <p className="mt-1.5 flex items-baseline gap-2">
                <span className="font-num text-[44px] leading-[48px] font-semibold tracking-tight text-n-900">
                  {overall.toFixed(1)}
                </span>
                <span className="font-num text-[18px] font-medium text-n-400">%</span>
              </p>
              <ProgressBar value={overall} className="mt-3" height={8} />
              <p className="mt-2 text-[12px] text-n-500">
                Weighted by credits across {courses.filter((c) => c.progress.tasksTotal > 0).reduce((n, c) => n + c.credits, 0)} credits of active courses ·
                exams excluded
              </p>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
              <Stat
                label="Today"
                value={fmtDuration(stats.todayMinutes)}
                sub={`${stats.todaySessions} session${stats.todaySessions === 1 ? "" : "s"}`}
              />
              <Stat
                label="This week"
                value={fmtDuration(stats.weekMinutes)}
                sub={`${stats.weekSessions} session${stats.weekSessions === 1 ? "" : "s"}`}
              />
              <Stat
                label="Streak"
                value={String(stats.streak)}
                unit={stats.streak === 1 ? "day" : "days"}
                sub={stats.streak > 0 ? "Keep it going" : "Start one today"}
              />
              <Stat
                label="Avg focus"
                value={stats.avgFocus > 0 ? stats.avgFocus.toFixed(0) : "-"}
                unit={stats.avgFocus > 0 ? "%" : undefined}
                sub={`${stats.totalSessions} sessions logged`}
              />
            </div>
          </div>

          {daily.some((d) => d.minutes > 0) && (
            <div className="mt-6 border-t border-n-100 pt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <Eyebrow>Last 21 days</Eyebrow>
                <Link href="/stats" className="text-[12px] font-medium text-rust-600 hover:text-rust-700">
                  Full stats →
                </Link>
              </div>
              <Sparkbar data={daily.map((d) => ({ label: d.date.toISOString(), value: d.minutes }))} />
            </div>
          )}
        </Card>
      </section>

      {/* ── Quick add ──────────────────────────────────────────────────── */}
      <section className="animate-fade-up" style={{ animationDelay: "40ms" }}>
        <SectionHeading
          title="Add something"
          sub="Type it in one line - press / from anywhere to jump here."
        />
        <QuickAdd courses={composerCourses} calendarConnected={calendarConnected} />
      </section>

      {/* ── Today ──────────────────────────────────────────────────────── */}
      <section className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <SectionHeading
          title="Today"
          sub={
            classes.length + dueToday.length === 0
              ? "Nothing scheduled."
              : `${classes.length} class${classes.length === 1 ? "" : "es"} · ${dueToday.length} due`
          }
        />

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Card>
            {classes.length === 0 && dueToday.length === 0 ? (
              <EmptyState
                title="A clear day."
                body="No classes and nothing due. Good time to get ahead on something with a deadline."
              />
            ) : (
              <>
                {classes.length > 0 && (
                  <div>
                    <div className="border-b border-n-100 px-4 py-2.5">
                      <Eyebrow>Scheduled</Eyebrow>
                    </div>
                    {classes.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </div>
                )}
                {dueToday.length > 0 && (
                  <div>
                    <div className="border-b border-n-100 px-4 py-2.5">
                      <Eyebrow>Due today</Eyebrow>
                    </div>
                    {dueToday.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          <div className="space-y-4">
            {overdue.length > 0 && (
              <Card>
                <div className="flex items-center justify-between border-b border-n-100 px-4 py-2.5">
                  <Eyebrow className="text-danger">Overdue</Eyebrow>
                  <Pill tone="danger">{overdue.length}</Pill>
                </div>
                {overdue.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </Card>
            )}

            <Card>
              <div className="border-b border-n-100 px-4 py-2.5">
                <Eyebrow>Next 3 weeks</Eyebrow>
              </div>
              {upcoming.length === 0 ? (
                <EmptyState title="Nothing due soon." body="Your next three weeks are clear." />
              ) : (
                upcoming.map((t) => <TaskRow key={t.id} task={t} />)
              )}
            </Card>
          </div>
        </div>
      </section>

      {/* ── Courses ────────────────────────────────────────────────────── */}
      <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <SectionHeading title="Courses" sub="Lecture, lab and assessment progress - weighted per course." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      </section>

      {/* ── Exams ──────────────────────────────────────────────────────── */}
      {allExams.length > 0 && (
        <section className="animate-fade-up" style={{ animationDelay: "160ms" }}>
          <SectionHeading
            title="Exams"
            sub="Kept out of the progress bars - tracked here by readiness instead."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {allExams.map((e) => (
              <Card key={e.id} accent={cssColour(e.course.colour)} className="p-4 pl-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-n-800">{e.course.name}</p>
                    <p className="mt-0.5 text-[12px] text-n-500">
                      {e.examDiet ?? (e.dueAt ? fmtRelative(new Date(e.dueAt)) : "Date TBC")}
                    </p>
                  </div>
                  <Pill tone={e.readiness.ratio >= 0.999 ? "ok" : "neutral"}>
                    {Math.round(e.readiness.ratio * 100)}%
                  </Pill>
                </div>
                <div className="mt-3.5">
                  <div className="mb-1.5 flex items-baseline justify-between text-[11.5px]">
                    <span className="text-n-500">{e.readiness.basis === "tasks" ? "Project tasks done" : "Lectures covered"}</span>
                    <span className="font-num text-n-600">
                      {e.readiness.ready}/{e.readiness.total}
                    </span>
                  </div>
                  <ProgressBar value={e.readiness.ratio * 100} colour={e.course.colour} height={5} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: Awaited<ReturnType<typeof getCourses>>[number] }) {
  const cats = course.progress.categories.filter((c) => c.present);

  return (
    <Card accent={cssColour(course.colour)} className="flex flex-col p-4 pl-5">
      <Link href={courseHref(course) as Route} className="group">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[14.5px] font-semibold text-n-800 transition-colors duration-[120ms] group-hover:text-rust-700">
              {course.name}
            </h3>
            <p className="font-num mt-0.5 text-[11px] text-n-400">{course.code}</p>
          </div>
          <span className="font-num shrink-0 text-[22px] font-semibold leading-none text-n-900">
            {course.progress.percent.toFixed(0)}
            <span className="text-[13px] text-n-400">%</span>
          </span>
        </div>

        <ProgressBar value={course.progress.percent} colour={course.colour} className="mt-3" />
      </Link>

      {cats.length > 0 && (
        <div className="mt-3.5 space-y-2">
          {cats.map((c) => (
            <div key={c.category} className="flex items-center gap-2.5">
              <span className="w-[68px] shrink-0 text-[11px] capitalize text-n-500">
                {c.category === "assessment" ? "Assessed" : c.category}
              </span>
              <ProgressBar
                value={c.ratio * 100}
                colour={course.colour}
                height={4}
                className="flex-1"
              />
              <span className="font-num w-[46px] shrink-0 text-right text-[10.5px] text-n-400">
                {c.itemsDone}/{c.itemsTotal}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3.5 text-[11.5px]">
        {course.nextDue?.dueAt ? (
          <span className="min-w-0 truncate text-n-500">
            Next: <span className="text-n-700">{course.nextDue.title}</span>{" "}
            <span className={daysUntil(new Date(course.nextDue.dueAt)) <= 3 ? "text-warn" : "text-n-400"}>
              · {fmtRelative(new Date(course.nextDue.dueAt))}
            </span>
          </span>
        ) : (
          <span className="text-n-400">Nothing scheduled</span>
        )}
        {course.minutes > 0 && (
          <span className="font-num shrink-0 text-n-400">{fmtDuration(course.minutes)}</span>
        )}
      </div>
    </Card>
  );
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

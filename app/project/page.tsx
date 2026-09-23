import type { Route } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projectData";
import { visibleCourseWhere } from "@/lib/types";
import { fmtDateLong, fmtDayDate, fmtDuration, fmtHM, fmtRelative, fmtTime, toISODate, addDays } from "@/lib/dates";
import { isTaskDone } from "@/lib/progress";
import { isGoogleConfigured } from "@/lib/google";
import { PROJECT_DEADLINE } from "@/lib/project";
import { Card, Eyebrow, EmptyState, Pill, ProgressBar, Stat } from "@/components/ui";
import { Timeline } from "@/components/project/Timeline";
import { PaperLibrary } from "@/components/project/PaperLibrary";
import { MeetingButton, type MeetingDraft } from "@/components/project/MeetingDialog";
import { RepoLink } from "@/components/project/RepoLink";
import { MoodleLink } from "@/components/MoodleLink";
import { QuickAdd } from "@/components/QuickAdd";
import { TaskRow } from "@/components/TaskRow";
import { Sparkbar } from "@/components/charts/Sparkbar";
import { BarChart } from "@/components/charts/BarChart";
import { WeightEditor } from "@/components/WeightEditor";
import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "meetings", label: "Meetings" },
  { key: "research", label: "Research" },
  { key: "tasks", label: "Tasks" },
] as const;

export default async function ProjectPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : "overview";
  const data = await getProject();

  if (!data) {
    return (
      <Card>
        <EmptyState title="No project course yet." body="Mark your dissertation course as the project (run npm run seed) and it'll appear here." />
      </Card>
    );
  }

  const googleConnected =
    isGoogleConfigured() && !!(await db.googleAuth.findUnique({ where: { id: "singleton" }, select: { id: true } }));
  const { course, pace, meetings, papers, tasks, progress } = data;
  const next = meetings.upcoming[0] ?? null;
  const daysLeft = Math.max(0, Math.ceil((PROJECT_DEADLINE.getTime() - Date.now()) / 86_400_000));

  const newMeeting: MeetingDraft = {
    id: null, title: "Supervisor meeting", date: toISODate(new Date()),
    startTime: "14:00", endTime: "14:30", location: "", syncToGoogle: googleConnected,
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="animate-fade-up">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-10 w-[5px] rounded-full" style={{ background: cssColour(course.colour) }} />
            <div>
              <Eyebrow>{course.code} · MSci project · {course.credits} credits</Eyebrow>
              <h1 className="font-display mt-0.5 text-[34px] leading-10 font-semibold tracking-tight text-n-900">Project</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WeightEditor
              courseId={course.id}
              lecture={course.lectureWeight}
              lab={course.labWeight}
              assessment={course.assessmentWeight}
              credits={course.credits}
              colour={course.colour}
            />
            <MoodleLink courseId={course.id} url={course.moodleUrl} />
            <RepoLink url={course.repoUrl} />
            <MeetingButton draft={newMeeting} googleConnected={googleConnected} label="New meeting" />
          </div>
        </div>
        <p className="mt-2 text-[13px] text-n-500">
          Final submission <span className="font-medium text-n-700">{fmtDateLong(PROJECT_DEADLINE)}</span>
          <span className="font-num text-n-400"> · {daysLeft} days to go</span>
        </p>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-0.5 border-b border-n-200">
        {TABS.map((t) => {
          const count = t.key === "meetings" ? meetings.all.length : t.key === "research" ? papers.length : t.key === "tasks" ? tasks.filter((x) => !isTaskDone(x)).length : null;
          return (
            <Link
              key={t.key}
              href={`/project?tab=${t.key}` as Route}
              scroll={false}
              className={clsx(
                "-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors duration-[120ms]",
                tab === t.key ? "border-rust-500 text-n-900" : "border-transparent text-n-500 hover:text-n-800",
              )}
            >
              {t.label}
              {count != null && count > 0 && <span className="font-num ml-1.5 text-[11px] font-normal text-n-400">{count}</span>}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* Pace */}
            <Card className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <Eyebrow>Hours against {course.hoursTarget}h</Eyebrow>
                <Pill tone={pace.status === "on-track" || pace.status === "done" ? "ok" : pace.status === "behind" ? "warn" : "neutral"}>
                  {{ "on-track": "On track", done: "Target reached", behind: "Behind pace", early: "Early days", "not-started": "Not started" }[pace.status]}
                </Pill>
              </div>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-num text-[40px] font-semibold leading-none text-n-900">{pace.loggedHours.toFixed(1)}</span>
                <span className="font-num text-[15px] text-n-400">/ {course.hoursTarget}h</span>
              </p>
              <ProgressBar value={pace.share * 100} colour={course.colour} height={8} className="mt-3" />
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Stat label="Needed / week" value={pace.neededPerWeek != null ? pace.neededPerWeek.toFixed(1) : "-"} unit="h" sub={`${pace.weeksLeft.toFixed(0)} weeks left`} />
                <Stat label="Recent / week" value={pace.recentPerWeek.toFixed(1)} unit="h" sub="last 4 full weeks" />
                <Stat label="Progress" value={progress.percent.toFixed(0)} unit="%" sub="of project tasks" />
              </div>
              {/* Only once there's a trend to see - one week is a single bar. */}
              {data.weeklyMinutes.length >= 3 && data.weeklyMinutes.some((m) => m > 0) && (
                <div className="mt-4 border-t border-n-100 pt-3">
                  <Eyebrow className="mb-2">Hours per week</Eyebrow>
                  <Sparkbar data={data.weeklyMinutes.map((v, i) => ({ label: addDays(data.weeklyStart, i * 7).toISOString(), value: v }))} />
                </div>
              )}
              <p className="mt-3 text-[11px] leading-4 text-n-400">
                40 credits is about 400 hours of work. Time counts when a study session is tagged with Project.
              </p>
            </Card>

            {/* Next meeting */}
            <Card className="flex flex-col p-5">
              <Eyebrow>Next meeting</Eyebrow>
              {next ? (
                <Link href={`/project/meetings/${next.id}` as Route} className="group mt-2 block">
                  <p className="font-display text-[20px] font-semibold text-n-900 group-hover:text-rust-700">{next.title}</p>
                  <p className="mt-0.5 text-[13px] text-n-600">
                    {fmtDayDate(next.startAt)} · {fmtHM(next.startAt)}–{fmtHM(next.endAt)}
                    <span className="text-n-400"> · {fmtRelative(next.startAt)}</span>
                  </p>
                  {next.location && <p className="text-[12px] text-n-500">{next.location}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Pill tone={next.prep.every((p) => isTaskDone(p.task)) ? "ok" : "warn"}>
                      Prep {next.prep.filter((p) => isTaskDone(p.task)).length}/{next.prep.length}
                    </Pill>
                    <Pill tone={next.agenda ? "ok" : "neutral"}>{next.agenda ? "Agenda ready" : "No agenda yet"}</Pill>
                  </div>
                </Link>
              ) : (
                <div className="mt-2 flex-1">
                  <p className="text-[13px] text-n-500">No meeting booked.</p>
                  <div className="mt-3"><MeetingButton draft={newMeeting} googleConnected={googleConnected} label="Book one" variant="secondary" /></div>
                </div>
              )}
              <div className="mt-auto grid grid-cols-3 gap-3 border-t border-n-100 pt-3 text-center">
                <MiniStat n={papers.filter((p) => p.status === "read").length} label="papers read" />
                <MiniStat n={papers.filter((p) => p.status !== "read").length} label="to read" />
                <MiniStat n={tasks.filter((t) => t.fromMeetingId && !isTaskDone(t)).length} label="open actions" />
              </div>
            </Card>
          </div>

          {/* Schedule */}
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <Eyebrow>Schedule to {fmtDayDate(PROJECT_DEADLINE)}</Eyebrow>
              <a href="/api/project/schedule/pdf" target="_blank" rel="noreferrer" className="rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[12px] font-semibold text-n-600 hover:bg-n-50">
                Export PDF
              </a>
            </div>
            <Timeline
              items={data.timeline.items}
              from={data.timeline.from.toISOString()}
              to={data.timeline.to.toISOString()}
              colour={course.colour}
            />
            <p className="mt-2 text-[11px] text-n-400">
              Diamonds are meetings, flags are graded deadlines, bars are tasks with a planned start (set it when editing a task).
            </p>
          </Card>

          <ProjectTime time={data.time} />
        </div>
      )}

      {tab === "meetings" && (
        <div className="space-y-5">
          <MeetingList title="Upcoming" meetings={meetings.upcoming} empty="Nothing booked." />
          <MeetingList title="Past" meetings={meetings.past} empty="No meetings yet." />
        </div>
      )}

      {tab === "research" && (
        <PaperLibrary
          papers={papers.map((p) => ({
            id: p.id, title: p.title, authors: p.authors, year: p.year, venue: p.venue, url: p.url,
            doi: p.doi, arxivId: p.arxivId, kind: p.kind, status: p.status, tags: p.tags, notes: p.notes, citeKey: p.citeKey,
          }))}
        />
      )}

      {tab === "tasks" && <ProjectTasks courseId={course.id} tasks={tasks} googleConnected={googleConnected} />}
    </div>
  );
}

/** Time tracking for the project alone - every figure uses the project's slice of each session. */
function ProjectTime({ time }: { time: Awaited<ReturnType<typeof getProject>> extends infer D ? D extends { time: infer T } ? T : never : never }) {
  const h = time.headline;
  return (
    <section className="space-y-4 pt-2">
      <div>
        <h2 className="font-display text-[20px] font-semibold text-n-800">Time on the project</h2>
        <p className="text-[12px] text-n-500">
          Only the project&apos;s share of each session counts - a session split with another course gives the project its slice.
        </p>
      </div>
      {h.sessions === 0 ? (
        <Card>
          <EmptyState title="No project time yet." body="Tag a study session with Project when you stop the timer and it'll show up here." />
        </Card>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total" value={fmtDuration(h.totalMinutes)} sub={`${h.sessions} session${h.sessions === 1 ? "" : "s"}`} />
            <Stat label="Per active day" value={fmtDuration(h.avgPerActiveDay)} sub={`${h.activeDays} day${h.activeDays === 1 ? "" : "s"}`} />
            <Stat label="Avg session" value={fmtDuration(h.avgSessionLength)} />
            <Stat
              label="Avg focus"
              value={h.avgFocus.toFixed(0)}
              unit="%"
              sub="Weighted by minutes"
              tone={h.avgFocus >= 75 ? "var(--color-ok)" : h.avgFocus >= 50 ? "var(--color-warn)" : "var(--color-danger)"}
            />
            <Stat label="Best day" value={h.bestDay?.label ?? "-"} sub={h.bestDay ? `${fmtDuration(h.bestDay.avgMinutes)} avg` : undefined} />
            <Stat label="Best hour" value={h.bestHour ? fmtTime(h.bestHour.hour * 60) : "-"} sub={h.bestHour ? `${fmtDuration(h.bestHour.minutes)} total` : undefined} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card className="p-4">
              <Eyebrow className="mb-3.5">By hour of day</Eyebrow>
              <BarChart
                bars={time.byHour.map((x) => ({
                  label: x.hour % 3 === 0 ? String(x.hour).padStart(2, "0") : "",
                  value: x.minutes,
                  secondary: x.focus != null ? `${x.focus.toFixed(0)}% focus` : undefined,
                }))}
                format="duration"
                highlight="max"
                emptyLabel="No sessions yet"
              />
            </Card>
            <Card className="p-4">
              <Eyebrow className="mb-3.5">By day of week</Eyebrow>
              <BarChart
                bars={time.byDay.map((d) => ({
                  label: d.label,
                  value: d.avgMinutes,
                  secondary: d.focus != null ? `${d.focus.toFixed(0)}% focus` : undefined,
                }))}
                format="duration"
                highlight="max"
                emptyLabel="No sessions yet"
              />
              <p className="mt-2 text-[11px] leading-4 text-n-400">Average per occurrence of that weekday.</p>
            </Card>
          </div>

          <Card>
            <div className="border-b border-n-100 px-4 py-2.5"><Eyebrow>Recent project sessions</Eyebrow></div>
            {time.recent.map((s) => (
              <div key={s.id} className="flex items-center gap-4 border-b border-n-100 px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-n-800">{s.name}</p>
                  <p className="text-[11.5px] text-n-500">
                    {fmtDayDate(s.startedAt)} · {fmtHM(s.startedAt)}
                    {s.shared && <span className="text-n-400"> · shared with another course</span>}
                  </p>
                </div>
                <span className="font-num text-[12px] text-n-500">{s.focus}% focus</span>
                <span className="font-num w-16 text-right text-[13px] font-semibold text-n-800">{fmtDuration(s.minutes)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </section>
  );
}

function MiniStat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="font-num text-[20px] font-semibold text-n-900">{n}</p>
      <p className="text-[10.5px] text-n-500">{label}</p>
    </div>
  );
}

type Meetings = Awaited<ReturnType<typeof getProject>> extends infer D ? D extends { meetings: { all: infer M } } ? M : never : never;

function MeetingList({ title, meetings, empty }: { title: string; meetings: Meetings; empty: string }) {
  return (
    <section>
      <h2 className="font-display mb-2.5 text-[20px] font-semibold text-n-800">{title}</h2>
      <Card>
        {meetings.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-n-400">{empty}</p>
        ) : (
          meetings.map((m) => {
            const prepDone = m.prep.filter((p) => isTaskDone(p.task)).length;
            const openActions = m.actions.filter((t) => !isTaskDone(t)).length;
            return (
              <Link key={m.id} href={`/project/meetings/${m.id}` as Route} className="flex items-center gap-4 border-b border-n-100 px-4 py-3 last:border-b-0 hover:bg-n-25">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-n-400">{fmtDayDate(m.startAt).split(" ")[0]}</p>
                  <p className="font-num text-[20px] font-semibold leading-6 text-n-900">{m.startAt.getDate()}</p>
                  <p className="text-[10.5px] text-n-400">{fmtDayDate(m.startAt).split(" ")[2]}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-n-800">{m.title}</p>
                  <p className="text-[12px] text-n-500">
                    {fmtHM(m.startAt)}–{fmtHM(m.endAt)}{m.location && ` · ${m.location}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {m.prep.length > 0 && <Pill tone={prepDone === m.prep.length ? "ok" : "neutral"}>Prep {prepDone}/{m.prep.length}</Pill>}
                  {m.notes && <Pill tone="info">Notes</Pill>}
                  {m.actions.length > 0 && <Pill tone={openActions ? "warn" : "ok"}>{openActions ? `${openActions} open action${openActions === 1 ? "" : "s"}` : "Actions done"}</Pill>}
                </div>
              </Link>
            );
          })
        )}
      </Card>
    </section>
  );
}

async function ProjectTasks({
  courseId, tasks, googleConnected,
}: {
  courseId: string;
  tasks: Awaited<ReturnType<typeof getProject>> extends infer D ? D extends { tasks: infer T } ? T : never : never;
  googleConnected: boolean;
}) {
  const courses = await db.course.findMany({
    where: visibleCourseWhere(),
    orderBy: { position: "asc" },
    select: { id: true, name: true, shortName: true, code: true, colour: true },
  });
  const course = courses.find((c) => c.id === courseId);
  const open = tasks.filter((t) => !isTaskDone(t));
  const done = tasks.filter((t) => isTaskDone(t));
  const row = (t: (typeof tasks)[number]) => ({ ...t, course: course ? { id: course.id, shortName: course.shortName, colour: course.colour, name: course.name } : null });

  return (
    <div className="space-y-4">
      <QuickAdd
        courses={courses}
        calendarConnected={googleConnected}
        defaultCourseId={courseId}
        placeholder="Add a project task - e.g. “build auth prototype fri”"
      />
      <Card>
        {open.length === 0 ? (
          <EmptyState title="No open project tasks." body="Add one above, or turn a meeting's action items into tasks." />
        ) : (
          open.map((t) => <TaskRow key={t.id} task={row(t)} showCourse={false} />)
        )}
      </Card>
      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none px-1 text-[12.5px] font-semibold text-n-500 hover:text-n-800">
            {done.length} completed
          </summary>
          <Card className="mt-2">{done.map((t) => <TaskRow key={t.id} task={row(t)} showCourse={false} />)}</Card>
        </details>
      )}
      <p className="px-1 text-[11.5px] text-n-400">
        Open a task to set a planned start - it then appears as a bar on the schedule.
      </p>
    </div>
  );
}

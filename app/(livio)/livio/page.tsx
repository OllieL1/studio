import type { Route } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { listCareers } from "@/app/careerActions";
import { getCalendarItems } from "@/lib/calendarData";
import { getCourses, getDailySeries, getHeadlineStats, getOverall, getOverdue } from "@/lib/queries";
import { addDays, fmtAgo, fmtDate, fmtDateLong, fmtDuration, fmtHM, greeting, startOfDay } from "@/lib/dates";
import { attention, careersSummary, dailyAverage, splitDay } from "@/lib/livio/home";
import { isTaskDone } from "@/lib/progress";
import { cssColour } from "@/lib/palette";
import { hasTime } from "@/lib/livio/todo";
import { clsx } from "@/lib/clsx";
import type { CalendarItem } from "@/lib/calendar";
import { Card, Eyebrow, ProgressBar } from "@/components/ui";
import { StudioLink } from "@/components/livio/StudioLink";

export const dynamic = "force-dynamic";

const CLASS_KINDS = ["LECTURE", "LAB", "SEMINAR"];

/**
 * Livio's home: a greeting, what needs a look (only when something does), and
 * then today, the study and the job hunt - each boiled down to what's worth
 * reading at a glance, every line a way in.
 */
export default async function LivioHome() {
  const now = new Date();
  const today = startOfDay(now);
  const in48h = new Date(now.getTime() + 48 * 3_600_000);

  const [day, careers, overdue, overdueTodos, soon, inbox, stats, series, courses, sessions] = await Promise.all([
    getCalendarItems(today, addDays(today, 1), { withPlan: false }),
    listCareers(),
    getOverdue(),
    db.task.count({ where: { courseId: null, cancelled: false, doneAt: null, dueAt: { lt: today } } }),
    db.task.findMany({
      where: { cancelled: false, kind: { notIn: CLASS_KINDS }, dueAt: { gt: now, lte: in48h } },
      include: { items: { select: { doneAt: true } } },
    }),
    db.notionInboxItem.count(),
    getHeadlineStats(),
    getDailySeries(29),
    getCourses(),
    db.session.findMany({
      orderBy: { startedAt: "desc" },
      take: 3,
      select: { id: true, name: true, minutes: true, startedAt: true, courses: { select: { course: { select: { shortName: true, colour: true } } } } },
    }),
  ]);

  const c = careersSummary(careers, now);
  const dueSoon = soon.filter((t) => !isTaskDone(t)).length + careers.filter(
    (r) => r.type === "APPLICATION" && r.status === "TODO" && r.deadline && r.deadline > now && r.deadline <= in48h,
  ).length;
  const flags = attention({
    overdueTodos,
    overdueStudio: overdue.filter((t) => t.courseId).length,
    stale: c.stale.length,
    dueSoon,
    inbox,
  });
  const { allDay, timed, nowAt } = splitDay(day.items, now);
  const average = dailyAverage(series, now);
  const overall = getOverall(courses);
  const last14 = series.slice(-14);
  const peak = Math.max(1, ...last14.map((d) => d.minutes));

  return (
    <div className="space-y-8">
      <section className="animate-fade-up">
        <Eyebrow>{fmtDateLong(now)}</Eyebrow>
        <h1 className="font-display mt-1 text-[38px] leading-[44px] font-semibold tracking-tight text-n-900">
          {greeting(now)}, Ollie.
        </h1>
        {flags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {flags.map((f) => {
              const chip = (
                <>
                  <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", f.tone === "danger" ? "bg-danger" : f.tone === "warn" ? "bg-warn" : "bg-rust-500")} />
                  {f.label}
                </>
              );
              const cls = "flex items-center gap-2 rounded-full border border-n-200 bg-n-0 px-3 py-1 text-[12.5px] text-n-700 transition-colors hover:border-rust-300 hover:text-n-900";
              return f.studio
                ? <StudioLink key={f.key} href={f.href} className={cls}>{chip}</StudioLink>
                : <Link key={f.key} href={f.href as Route} className={cls}>{chip}</Link>;
            })}
          </div>
        ) : (
          <p className="mt-2 text-[13.5px] text-n-500">Nothing needs you right now.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ── Today ───────────────────────────────────────────────────── */}
        <Card className="p-5 lg:self-start">
          <div className="mb-4 flex items-baseline justify-between">
            <Eyebrow>Today</Eyebrow>
            {day.googleError && <span className="text-[11.5px] text-n-400">Google Calendar didn&apos;t answer</span>}
          </div>

          {allDay.length > 0 && (
            <ul className="mb-4 space-y-1">
              {allDay.map((i) => (
                <li key={i.id} className="flex items-center gap-3 text-[13px]">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.colour ? cssColour(i.colour) : "var(--color-rust-500)" }} />
                  <ItemLink item={i} className={clsx("min-w-0 flex-1 truncate", i.done ? "text-n-400 line-through" : "text-n-800")} />
                  <span className="shrink-0 text-[11.5px] text-n-400">
                    {i.source === "deadline" && hasTime(new Date(i.start)) ? `due ${fmtHM(new Date(i.start))}` : i.source === "deadline" ? "due today" : "all day"}
                    {" · "}
                    {i.courseShort ?? (i.source === "google" ? "Google" : i.source === "deadline" ? "Livio" : "")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {timed.length > 0 ? (
            <ol className="relative">
              {timed.map((i, k) => (
                <li key={i.id}>
                  {k === nowAt && <NowLine now={now} />}
                  <div className={clsx("flex items-start gap-3 py-2", new Date(i.end) <= now && "opacity-45")}>
                    <span className="w-[86px] shrink-0 pt-px font-num text-[12px] text-n-500">
                      {fmtHM(new Date(i.start))}–{fmtHM(new Date(i.end))}
                    </span>
                    <span aria-hidden className="mt-1 h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: i.colour ? cssColour(i.colour) : "var(--color-n-300)" }} />
                    <span className="min-w-0 flex-1">
                      <ItemLink item={i} className="block truncate text-[13.5px] font-medium text-n-800" />
                      {(i.location || i.courseShort) && (
                        <span className="block truncate text-[12px] text-n-500">{[i.courseShort, i.location].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
              {nowAt === timed.length && <NowLine now={now} />}
            </ol>
          ) : (
            !allDay.length && <p className="py-6 text-center text-[13px] text-n-500">Nothing on today.</p>
          )}
        </Card>

        <div className="space-y-6">
          {/* ── Studio ──────────────────────────────────────────────── */}
          <Card className="p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <Eyebrow>Studio</Eyebrow>
              <StudioLink href="/stats" className="text-[12px] font-medium text-rust-600 hover:underline">Stats →</StudioLink>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {/* Against the average only once there is one: "avg 0m" says nothing. */}
              <Figure label="Today" value={fmtDuration(stats.todayMinutes)}
                sub={average ? `avg ${fmtDuration(average)}` : undefined}
                tone={average && stats.todayMinutes >= average ? "ok" : undefined} />
              <Figure label="This week" value={fmtDuration(stats.weekMinutes)} sub={`${stats.weekSessions} ${stats.weekSessions === 1 ? "session" : "sessions"}`} />
              <Figure label="Courses" value={`${overall.toFixed(0)}%`} sub={stats.streak ? `${stats.streak}-day streak` : undefined} />
            </div>
            <ProgressBar value={overall} className="mt-4" height={6} />

            {/* The last fortnight, a day per column - one series, no legend. */}
            <div className="mt-4 flex h-10 items-end gap-[3px]" role="img" aria-label="Study minutes per day, last 14 days">
              {last14.map((d) => (
                <span
                  key={d.date.toISOString()}
                  title={`${fmtDate(d.date)}: ${fmtDuration(d.minutes)}`}
                  className="flex-1 rounded-t-[3px]"
                  style={{
                    height: d.minutes ? `${Math.max(8, (d.minutes / peak) * 100)}%` : 2,
                    background: d.minutes ? "var(--color-rust-500)" : "var(--color-n-200)",
                    opacity: startOfDay(d.date).getTime() === today.getTime() ? 1 : 0.75,
                  }}
                />
              ))}
            </div>
            <p className="mt-1 flex justify-between text-[10.5px] text-n-400"><span>2 weeks ago</span><span>today</span></p>

            {sessions.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-n-100 pt-3">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="flex shrink-0 gap-0.5">
                      {s.courses.slice(0, 3).map((sc) => (
                        <span key={sc.course.shortName} aria-hidden className="h-2 w-2 rounded-full" style={{ background: cssColour(sc.course.colour) }} />
                      ))}
                    </span>
                    <StudioLink href="/sessions" className="min-w-0 flex-1 truncate text-n-700 hover:text-n-900">{s.name}</StudioLink>
                    <span className="shrink-0 font-num text-[11.5px] text-n-500">{fmtDuration(s.minutes)}</span>
                    <span className="w-[56px] shrink-0 text-right text-[11.5px] text-n-400">{fmtAgo(s.startedAt, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── Careers ─────────────────────────────────────────────── */}
          <Card className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <Eyebrow>Careers</Eyebrow>
              <Link href={"/livio/careers" as Route} className="text-[12px] font-medium text-rust-600 hover:underline">Open →</Link>
            </div>
            {c.open === 0 ? (
              <p className="text-[13px] text-n-500">Nothing in play yet.</p>
            ) : (
              <>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-n-600">
                  {c.pipeline.map((p) => (
                    <Link key={p.status} href={`/livio/careers?status=${p.status}` as Route} className="hover:text-n-900">
                      <span className="font-num font-semibold text-n-800">{p.count}</span> {p.label.toLowerCase()}
                    </Link>
                  ))}
                </p>
                {c.stale.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-warn">To chase</p>
                    <ul className="space-y-1">
                      {c.stale.slice(0, 4).map((s) => (
                        <li key={s.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                          <Link href={`/livio/careers?q=${encodeURIComponent(s.company)}` as Route} className="truncate text-n-800 hover:underline">{s.company}</Link>
                          <span className="shrink-0 font-num text-[11.5px] text-n-500">{s.days}d quiet</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.deadlines.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-n-400">Due this week</p>
                    <ul className="space-y-1">
                      {c.deadlines.map((d) => (
                        <li key={d.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                          <Link href={`/livio/careers?q=${encodeURIComponent(d.company)}` as Route} className="min-w-0 truncate text-n-800 hover:underline">
                            {d.company}{d.role && <span className="text-n-500"> · {d.role}</span>}
                          </Link>
                          <span className="shrink-0 font-num text-[11.5px] text-n-500">{fmtDate(d.deadline)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-n-400">{label}</p>
      <p className="mt-1 font-num text-[20px] font-semibold leading-6 text-n-900">{value}</p>
      {sub && <p className={clsx("mt-0.5 truncate text-[11.5px]", tone === "ok" ? "text-ok" : "text-n-500")}>{sub}</p>}
    </div>
  );
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="flex items-center gap-3 py-1" aria-label={`Now, ${fmtHM(now)}`}>
      <span className="w-[86px] shrink-0 font-num text-[11px] font-semibold text-rust-600">Now {fmtHM(now)}</span>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-rust-500" />
      <span aria-hidden className="h-px flex-1 bg-rust-300" />
    </div>
  );
}

/** Where an item on today's list leads: Google's own page, Livio's todo
 *  list for a course-less task, or Studio for everything else. */
function ItemLink({ item, className }: { item: CalendarItem; className?: string }) {
  if (item.source === "google" && item.href) {
    return <a href={item.href} target="_blank" rel="noreferrer" className={clsx(className, "hover:underline")}>{item.title}</a>;
  }
  if (item.source === "deadline" && !item.courseId) {
    return <Link href={"/livio/todo" as Route} className={clsx(className, "hover:underline")}>{item.title}</Link>;
  }
  if (item.href) return <StudioLink href={item.href} className={clsx(className, "hover:underline")}>{item.title}</StudioLink>;
  return <span className={className}>{item.title}</span>;
}

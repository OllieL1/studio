import { db } from "@/lib/db";
import { visibleCourseWhere } from "@/lib/types";
import { getSessions, getDailySeries } from "@/lib/queries";
import {
  byDayOfWeek, byHourOfDay, bySubject, focusByLength,
  focusDistribution, headline, rollingMean, type StatSession,
} from "@/lib/stats";
import { fmtDuration, fmtTime, fmtDate } from "@/lib/dates";
import { Card, Eyebrow, EmptyState, SectionHeading, Stat, ProgressBar } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { HBarChart } from "@/components/charts/HBarChart";
import { LineChart } from "@/components/charts/LineChart";
import { RangePicker } from "@/components/RangePicker";
import { MusicSection } from "@/components/MusicSection";
import { musicStats } from "@/lib/musicStats";
import { hasHistoryScope, isSpotifyConfigured } from "@/lib/spotify";
import { addDays, startOfDay } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const days = range === "7" ? 7 : range === "30" ? 30 : range === "90" ? 90 : null;

  const [raw, courses, daily] = await Promise.all([
    getSessions(days ?? undefined),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, colour: true },
    }),
    getDailySeries(days ?? 60),
  ]);

  const sessions: StatSession[] = raw;

  // Music: the same sessions, with what played in each.
  const [musicSessions, spotifyAuth] = await Promise.all([
    db.session.findMany({
      where: days ? { startedAt: { gte: startOfDay(addDays(new Date(), -days)) } } : undefined,
      select: {
        id: true, focus: true, minutes: true, rawMinutes: true, startedAt: true, musicTracked: true,
        tracks: { select: { spotifyId: true, kind: true, title: true, artist: true, minutes: true, startedAt: true } },
      },
    }),
    isSpotifyConfigured() ? db.spotifyAuth.findUnique({ where: { id: "singleton" }, select: { id: true } }) : null,
  ]);
  const music = musicStats(musicSessions);
  const historyScope = spotifyAuth ? await hasHistoryScope() : false;
  const h = headline(sessions);
  const hours = byHourOfDay(sessions);
  const dow = byDayOfWeek(sessions);
  const subjects = bySubject(sessions, courses);
  const focusBands = focusDistribution(sessions);
  const focusLen = focusByLength(sessions);

  const focusSeries = daily.map((d) => ({
    label: fmtDate(d.date),
    value: d.focus,
  }));
  const focusTrend = rollingMean(focusSeries.map((p) => p.value), 7);

  const bestDayAvg = Math.max(...dow.map((d) => d.avgMinutes));
  const worstActive = dow.filter((d) => d.occurrences > 0);
  const minDayAvg = worstActive.length ? Math.min(...worstActive.map((d) => d.avgMinutes)) : 0;

  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader range={range} />
        <Card>
          <EmptyState
            title="No sessions yet."
            body="Hit “Start studying” at the bottom of the screen. Once a few sessions are logged, this page fills with your daily averages, best hours, strongest weekdays and focus trends."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader range={range} />

      {/* ── Headline ───────────────────────────────────────────────────── */}
      <Card className="animate-fade-up grid grid-cols-2 gap-x-6 gap-y-6 p-6 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total tracked" value={fmtDuration(h.totalMinutes)} sub={`${h.sessions} sessions`} />
        <Stat label="Per active day" value={fmtDuration(h.avgPerActiveDay)} sub={`${h.activeDays} days studied`} />
        <Stat label="Avg session" value={fmtDuration(h.avgSessionLength)} sub="Time-weighted" />
        <Stat
          label="Avg focus"
          value={h.avgFocus.toFixed(0)}
          unit="%"
          sub="Weighted by minutes"
          tone={h.avgFocus >= 75 ? "var(--color-ok)" : h.avgFocus >= 50 ? "var(--color-warn)" : "var(--color-danger)"}
        />
        <Stat
          label="Best day"
          value={h.bestDay?.label ?? "-"}
          sub={h.bestDay ? `${fmtDuration(h.bestDay.avgMinutes)} avg` : undefined}
        />
        <Stat
          label="Best hour"
          value={h.bestHour ? fmtTime(h.bestHour.hour * 60) : "-"}
          sub={h.bestHour ? `${fmtDuration(h.bestHour.minutes)} total` : undefined}
        />
      </Card>

      {/* ── Time ───────────────────────────────────────────────────────── */}
      <section className="animate-fade-up" style={{ animationDelay: "40ms" }}>
        <SectionHeading title="When you work" sub="Every session is spread across the hours it actually covered." />
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Panel
            title="By hour of day"
            note={h.bestHour ? `Peak at ${fmtTime(h.bestHour.hour * 60)}` : undefined}
          >
            <BarChart
              bars={hours.map((x) => ({
                label: x.hour % 3 === 0 ? String(x.hour).padStart(2, "0") : "",
                value: x.minutes,
                secondary: x.focus != null ? `${x.focus.toFixed(0)}% focus` : undefined,
              }))}
              format="duration"
              highlight="max"
              emptyLabel="No sessions yet"
            />
          </Panel>

          <Panel
            title="By day of week"
            note={
              h.bestDay && h.worstDay
                ? `${h.bestDay.label} strongest · ${h.worstDay.label} weakest`
                : undefined
            }
          >
            <BarChart
              bars={dow.map((d) => ({
                label: d.label,
                value: d.avgMinutes,
                secondary:
                  d.occurrences > 0
                    ? `${d.occurrences} ${d.label}${d.occurrences === 1 ? "" : "s"}`
                    : undefined,
                note:
                  d.avgMinutes === bestDayAvg && bestDayAvg > 0
                    ? "best"
                    : d.avgMinutes === minDayAvg && d.occurrences > 0
                      ? "worst"
                      : undefined,
              }))}
              format="duration"
              highlight="note"
              emptyLabel="No sessions yet"
            />
            <p className="mt-2 text-[11px] leading-4 text-n-400">
              Average per occurrence of that weekday, so an uneven term doesn't skew it.
            </p>
          </Panel>
        </div>
      </section>

      {/* ── Focus ──────────────────────────────────────────────────────── */}
      <section className="animate-fade-up" style={{ animationDelay: "80ms" }}>
        <SectionHeading title="Focus" sub="Your self-reported rating, weighted by how long each session ran." />
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Panel title="Focus over time" note="Thick line is a 7-day rolling mean">
            <LineChart points={focusSeries} trend={focusTrend} />
          </Panel>

          <div className="space-y-4">
            <Panel title="How long before focus drops?">
              <div className="space-y-2.5">
                {focusLen.map((b) => (
                  <div key={b.label}>
                    <div className="mb-1 flex items-baseline justify-between text-[12px]">
                      <span className="text-n-600">{b.label}</span>
                      <span className="font-num text-n-500">
                        {b.focus != null ? `${b.focus.toFixed(0)}%` : "-"}
                        <span className="ml-1.5 text-n-400">
                          {b.sessions > 0 ? `${b.sessions}×` : ""}
                        </span>
                      </span>
                    </div>
                    <ProgressBar
                      value={b.focus ?? 0}
                      height={5}
                      colour={
                        b.focus == null
                          ? "var(--color-n-200)"
                          : b.focus >= 75
                            ? "var(--color-ok)"
                            : b.focus >= 50
                              ? "var(--color-warn)"
                              : "var(--color-danger)"
                      }
                    />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Focus distribution">
              <BarChart
                bars={focusBands.map((b) => ({
                  label: b.label,
                  value: b.sessions,
                  secondary: fmtDuration(b.minutes),
                }))}
                height={90}
                format="count"
                emptyLabel="No sessions yet"
              />
            </Panel>
          </div>
        </div>
      </section>

      {/* ── Subjects ───────────────────────────────────────────────────── */}
      <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <SectionHeading
          title="By subject"
          sub="A session covering two subjects splits its time evenly between them."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Time invested">
            <HBarChart
              rows={subjects.map((s) => ({
                label: s.name,
                value: s.minutes,
                colour: s.colour,
                secondary: s.sessions > 0 ? `${s.sessions}×` : undefined,
              }))}
              format="duration"
              emptyLabel="No time logged against a subject yet"
            />
          </Panel>

          <Panel title="Focus by subject">
            <HBarChart
              rows={subjects
                .filter((s) => s.focus != null)
                .map((s) => ({ label: s.name, value: s.focus!, colour: s.colour }))}
              format="percent"
              emptyLabel="No focus ratings yet"
            />
          </Panel>
        </div>
      </section>

      <MusicSection stats={music} connected={!!spotifyAuth} historyScope={historyScope} />

      {/* ── Honesty ────────────────────────────────────────────────────── */}
      {h.adjustedDownMinutes > 0 && (
        <Card className="animate-fade-up p-4">
          <p className="text-[12.5px] text-n-500">
            You've trimmed{" "}
            <span className="font-num font-semibold text-n-700">
              {fmtDuration(h.adjustedDownMinutes)}
            </span>{" "}
            off tracked time across {h.sessions} sessions - every figure on this page uses the
            adjusted number, not the raw clock.
          </p>
        </Card>
      )}
    </div>
  );
}

function PageHeader({ range }: { range?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Eyebrow>Analytics</Eyebrow>
        <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
          Stats
        </h1>
      </div>
      <RangePicker current={range ?? "all"} />
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {note && <span className="text-[11px] text-n-400">{note}</span>}
      </div>
      {children}
    </Card>
  );
}

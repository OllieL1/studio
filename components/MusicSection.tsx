import Link from "next/link";
import type { MusicStats, Group } from "@/lib/musicStats";
import { MIN_ARTIST_SESSIONS, MIN_COMPARE } from "@/lib/musicStats";
import { fmtDuration } from "@/lib/dates";
import { Card, Eyebrow, SectionHeading, Stat } from "./ui";
import { HBarChart } from "./charts/HBarChart";
import { BarChart } from "./charts/BarChart";
import { focusColour } from "@/lib/focus";
import { clsx } from "@/lib/clsx";

/**
 * Music on the stats page.
 *
 * Artists are a single-series magnitude, so they use one hue with names
 * written on the bars — not a colour per artist. Music vs silence is shown as
 * numbers side by side rather than a chart, and says so plainly when there
 * isn't enough data yet to mean anything.
 */
export function MusicSection({
  stats,
  connected,
  historyScope,
}: {
  stats: MusicStats;
  connected: boolean;
  historyScope: boolean;
}) {
  const header = (
    <SectionHeading
      title="Music"
      sub="What you listen to while you study, and how it lines up with focus."
    />
  );

  if (stats.trackedSessions === 0) {
    return (
      <section className="animate-fade-up">
        {header}
        <Card className="p-6">
          <p className="font-display text-[18px] font-semibold text-n-800">
            {connected ? "No sessions with music tracking yet." : "Connect Spotify to see music stats."}
          </p>
          <p className="mt-1 max-w-[60ch] text-[13px] leading-5 text-n-500">
            {connected
              ? "Whatever plays while the timer runs is logged with the session. After a few sessions this fills in: how much of your study has music, your study artists, and whether music - or silence - helps you focus."
              : "Once it's connected, whatever plays while the timer runs is logged with each session."}
          </p>
          {connected && !historyScope && <ReconnectHint />}
          {!connected && (
            <Link href="/settings" className="mt-3 inline-block text-[12.5px] font-semibold text-rust-600 hover:text-rust-700">
              Connect in Settings →
            </Link>
          )}
        </Card>
      </section>
    );
  }

  const top = stats.topArtists[0];

  return (
    <section className="animate-fade-up space-y-4">
      {header}

      {connected && !historyScope && (
        <Card className="p-3.5"><ReconnectHint /></Card>
      )}

      <Card className="grid grid-cols-2 gap-x-6 gap-y-6 p-6 lg:grid-cols-4">
        <Stat
          label="With music"
          value={`${Math.round(stats.share * 100)}`}
          unit="%"
          sub="of tracked study time"
        />
        <Stat
          label="Music vs silence"
          value={stats.musicVsSilence == null ? "-" : `${stats.musicVsSilence > 0 ? "+" : ""}${stats.musicVsSilence.toFixed(0)}`}
          unit={stats.musicVsSilence == null ? undefined : "pts"}
          tone={stats.musicVsSilence == null ? undefined : stats.musicVsSilence >= 0 ? "var(--color-ok)" : "var(--color-danger)"}
          sub={
            stats.musicVsSilence == null
              ? `Needs ${MIN_COMPARE}+ sessions of each`
              : `Focus with music, vs without`
          }
        />
        <Stat label="Listened" value={fmtDuration(stats.listeningMinutes)} sub={`across ${stats.music.sessions} session${stats.music.sessions === 1 ? "" : "s"}`} />
        <Stat
          text
          label="Top study artist"
          value={top ? top.artist : "-"}
          sub={top ? `${fmtDuration(top.minutes)} · ${top.sessions} session${top.sessions === 1 ? "" : "s"}` : undefined}
        />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="Focus by artist" note={`Artists from ${MIN_ARTIST_SESSIONS}+ sessions`}>
          <HBarChart
            rows={stats.focusByArtist.map((a) => ({
              label: a.artist,
              value: a.focus!,
              colour: "var(--color-rust-500)",
              secondary: `${fmtDuration(a.minutes)} · ${a.sessions}×`,
            }))}
            format="percent"
            domainMax={100}
            emptyLabel="Appears once an artist features in two sessions"
          />
          <p className="mt-3 text-[11px] leading-4 text-n-400">
            Average focus of the sessions each artist played in, weighted by how much of the
            session they soundtracked.
          </p>
        </Panel>

        <div className="space-y-4">
          <Compare label="Music" left={stats.music} right={stats.silent} rightLabel="Silence" delta={stats.musicVsSilence} />

          <Panel title="Variety vs focus" note="Artists per hour">
            <BarChart
              bars={stats.variety.map((v) => ({
                label: v.label.replace(" / hr", "/hr"),
                value: v.focus ?? 0,
                secondary: `${v.sessions} session${v.sessions === 1 ? "" : "s"}`,
              }))}
              height={120}
              format="percent"
              domainMax={100}
              showValues
              emptyLabel="Not enough sessions with music yet"
            />
            <p className="mt-2.5 text-[11px] leading-4 text-n-400">
              Does sticking with one artist beat shuffling? Per hour of listening, so long
              sessions aren&apos;t counted as more varied.
            </p>
          </Panel>
        </div>
      </div>

      {/* When music is on — as a share of study time, not raw minutes, which
          would mostly just echo when you study. */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Music by time of day" note="Share of study time with music on">
          <BarChart
            bars={stats.byHour.map((h) => ({
              label: h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : "",
              value: h.share == null ? 0 : h.share * 100,
              secondary:
                h.studyMinutes > 0
                  ? `${fmtDuration(h.musicMinutes)} of ${fmtDuration(h.studyMinutes)}`
                  : "no study at this hour",
            }))}
            format="percent"
            domainMax={100}
            emptyLabel="No tracked sessions yet"
          />
        </Panel>

        <Panel title="Music by day of week" note="Share of study time with music on">
          <BarChart
            bars={stats.byWeekday.map((d) => ({
              label: d.label,
              value: d.share == null ? 0 : d.share * 100,
              secondary:
                d.studyMinutes > 0
                  ? `${fmtDuration(d.musicMinutes)} of ${fmtDuration(d.studyMinutes)}`
                  : "no study",
            }))}
            format="percent"
            domainMax={100}
            showValues
            emptyLabel="No tracked sessions yet"
          />
        </Panel>
      </div>

      {stats.untrackedSessions > 0 && (
        <p className="text-[11.5px] leading-5 text-n-400">
          {stats.untrackedSessions} session{stats.untrackedSessions === 1 ? " was" : "s were"} logged before music tracking
          and {stats.untrackedSessions === 1 ? "is" : "are"} left out here - whether they had music is unknown, so counting
          them as silent would skew the comparison.
        </p>
      )}
    </section>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
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

function Compare({
  label, left, right, rightLabel, delta,
}: {
  label: string; left: Group; right: Group; rightLabel: string; delta: number | null;
}) {
  const cell = (g: Group, name: string) => (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-n-500">{name}</p>
      <p className="font-num text-[18px] font-semibold leading-6" style={{ color: g.focus != null ? focusColour(g.focus) : "var(--color-n-300)" }}>
        {g.focus != null ? `${g.focus.toFixed(0)}%` : "-"}
      </p>
      <p className="font-num text-[10.5px] text-n-400">{g.sessions} session{g.sessions === 1 ? "" : "s"}</p>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-n-700">
          {label} <span className="font-normal text-n-400">vs {rightLabel.toLowerCase()}</span>
        </p>
        <span
          className={clsx(
            "font-num shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            delta == null ? "bg-n-50 text-n-400" : delta >= 0 ? "bg-ok-soft text-[#3f5c38]" : "bg-danger-soft text-[#7a3245]",
          )}
        >
          {delta == null ? `needs ${MIN_COMPARE}+ each` : `${delta > 0 ? "+" : ""}${delta.toFixed(0)} pts`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cell(left, label)}
        {cell(right, rightLabel)}
      </div>
    </Card>
  );
}

function ReconnectHint() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[12px] text-n-600">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
      Reconnect Spotify to also capture what played while this app was closed.
      <a href="/api/spotify/auth" className="font-semibold text-rust-600 hover:text-rust-700">Reconnect →</a>
    </p>
  );
}

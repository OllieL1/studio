"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { stackRows, timelinePosition, timelineWeeks } from "@/lib/project";
import { fmtDayDate, startOfDay } from "@/lib/dates";
import type { TimelineItem } from "@/lib/projectData";
import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";

const ROW_LABEL = { meeting: "Meetings", deadline: "Deadlines", task: "Tasks" } as const;
const LANE = 26; // px per stacked lane in the task row

/**
 * The project runway: weeks left to right from the start of term to the
 * final deadline. Meetings are diamonds, deadlines are flags, tasks with a
 * planned start are bars (stacked so none overlap), today is a line.
 */
export function Timeline({
  items,
  from,
  to,
  colour,
  print = false,
}: {
  items: TimelineItem[];
  from: string;
  to: string;
  colour: string;
  print?: boolean;
}) {
  const weeks = useMemo(() => timelineWeeks(new Date(from), new Date(to)), [from, to]);
  const [hover, setHover] = useState<TimelineItem | null>(null);
  // The day, not the millisecond: the server and the browser render a moment
  // apart, and an exact "now" put the line in two slightly different places
  // (a hydration error). A week-scale timeline can't show finer than a day.
  const now = startOfDay(new Date());
  const pos = (iso: string | Date) => timelinePosition(typeof iso === "string" ? new Date(iso) : iso, weeks) * 100;

  const meetings = items.filter((i) => i.row === "meeting");
  const deadlines = items.filter((i) => i.row === "deadline");
  const tasks = items.filter((i) => i.row === "task");
  const taskRows = stackRows(tasks.map((t) => ({ start: new Date(t.start).getTime(), end: Math.max(new Date(t.end).getTime(), new Date(t.start).getTime() + 3 * 86_400_000) })));
  const taskLanes = Math.max(1, ...taskRows.map((r) => r + 1));
  const todayPct = pos(now);
  const showToday = todayPct > 0 && todayPct < 100;

  const Marker = ({ item, children, className, style }: { item: TimelineItem; children: React.ReactNode; className?: string; style?: React.CSSProperties }) =>
    print ? (
      <span className={className} style={style}>{children}</span>
    ) : (
      <Link
        href={item.href as Route}
        className={className}
        style={style}
        onMouseEnter={() => setHover(item)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(item)}
        onBlur={() => setHover(null)}
        aria-label={`${item.title}, ${fmtDayDate(new Date(item.end))}`}
      >
        {children}
      </Link>
    );

  return (
    <div className="relative">
      <div className={clsx(!print && "overflow-x-auto")}>
        <div className={clsx("relative", !print && "min-w-[860px]")}>
          {/* Month + week header */}
          <div className="grid grid-cols-[92px_1fr] border-b border-n-200">
            <div />
            <div className="relative h-9">
              {weeks.map((w, i) => (
                <div key={i} className="absolute top-0 h-full" style={{ left: `${(i / weeks.length) * 100}%`, width: `${100 / weeks.length}%` }}>
                  {w.monthLabel && (
                    <span className="absolute left-0.5 top-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-n-600">{w.monthLabel}</span>
                  )}
                  <span className="font-num absolute bottom-1 left-0.5 text-[9.5px] text-n-400">{w.start.getDate()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {(["meeting", "deadline", "task"] as const).map((row) => {
            const height = row === "task" ? taskLanes * LANE + 12 : 40;
            const rowItems = row === "meeting" ? meetings : row === "deadline" ? deadlines : tasks;
            return (
              <div key={row} className="grid grid-cols-[92px_1fr] border-b border-n-100 last:border-b-0">
                <div className="flex items-center px-1 text-[11px] font-semibold text-n-500">
                  {ROW_LABEL[row]}
                  <span className="font-num ml-1.5 font-normal text-n-400">{rowItems.length}</span>
                </div>
                <div className="relative" style={{ height }}>
                  {/* week grid */}
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      aria-hidden
                      className={clsx("absolute inset-y-0 border-l", w.monthLabel ? "border-n-200" : "border-n-100/70")}
                      style={{ left: `${(i / weeks.length) * 100}%` }}
                    />
                  ))}

                  {row === "meeting" && meetings.map((m) => (
                    <Marker key={m.id} item={m} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-1" style={{ left: `${pos(m.start)}%` }}>
                      <span
                        className={clsx("block h-[11px] w-[11px] rotate-45 rounded-[2px] transition-transform duration-[120ms] hover:scale-125", m.done ? "opacity-45" : "")}
                        style={{ background: "var(--color-rust-600)" }}
                      />
                    </Marker>
                  ))}

                  {row === "deadline" && deadlines.map((d) => {
                    const flipped = pos(d.end) > 82;
                    return (
                    <Marker key={d.id} item={d} className="absolute bottom-2 top-2 -translate-x-[1px]" style={{ left: `${pos(d.end)}%` }}>
                      <span className={clsx("absolute inset-y-0 left-0 w-[2px] rounded-full", d.done ? "bg-n-300" : "bg-n-800")} />
                      <span className={clsx("absolute top-0 whitespace-nowrap px-1 text-[9.5px] font-semibold leading-[14px]", flipped ? "right-0 rounded-l-[3px]" : "left-0 rounded-r-[3px]", d.done ? "bg-n-100 text-n-400 line-through" : "bg-n-800 text-n-0")}>
                        {d.title.length > 18 ? d.title.slice(0, 17) + "…" : d.title}
                      </span>
                    </Marker>
                    );
                  })}

                  {row === "task" && tasks.map((t, i) => {
                    const left = pos(t.start);
                    const width = Math.max(pos(t.end) - left, 0);
                    const isPoint = width < 0.8;
                    return (
                      <Marker
                        key={t.id}
                        item={t}
                        className={clsx(
                          "absolute flex h-[20px] items-center overflow-hidden whitespace-nowrap rounded-[4px] px-1.5 text-[10.5px] font-semibold transition-[filter] duration-[120ms] hover:brightness-95",
                          t.done ? "text-n-500 line-through opacity-60" : "text-n-900",
                        )}
                        style={{
                          top: 6 + taskRows[i] * LANE,
                          left: `${left}%`,
                          width: isPoint ? undefined : `${width}%`,
                          minWidth: isPoint ? undefined : 8,
                          background: `color-mix(in oklab, ${cssColour(colour)} ${t.done ? 12 : 22}%, var(--color-n-0))`,
                          borderLeft: `3px solid ${cssColour(colour)}`,
                        }}
                      >
                        {t.title}
                      </Marker>
                    );
                  })}

                  {rowItems.length === 0 && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-n-300">
                      {row === "meeting" ? "No meetings yet" : row === "deadline" ? "No deadlines" : "Give tasks a planned start to see them as bars"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Today */}
          {showToday && (
            <div aria-hidden className="pointer-events-none absolute bottom-0 top-9 grid w-full grid-cols-[92px_1fr]">
              <div />
              <div className="relative">
                <div className="absolute inset-y-0 w-[2px] bg-rust-500" style={{ left: `${todayPct}%` }}>
                  <span className="absolute -top-[18px] -translate-x-1/2 rounded-full bg-rust-500 px-1.5 text-[9px] font-bold uppercase tracking-[0.05em] text-white">Today</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!print && hover && (
        <div className="animate-fade-in pointer-events-none absolute right-2 top-1 z-10 max-w-[280px] rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[11.5px] shadow-[var(--shadow-pop)]">
          <p className="truncate font-semibold text-n-800">{hover.title}</p>
          <p className="text-n-500">
            {hover.start !== hover.end && hover.row === "task" ? `${fmtDayDate(new Date(hover.start))} → ` : ""}
            {fmtDayDate(new Date(hover.end))}
            {hover.weight != null && ` · ${hover.weight}%`}
            {hover.done && " · done"}
          </p>
        </div>
      )}
    </div>
  );
}

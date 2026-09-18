"use client";

import Link from "next/link";
import { daysUntil, fmtRelative, startOfWeek, fmtDate, fmtDayNum } from "@/lib/dates";
import { BIG_WEIGHT_THRESHOLD } from "@/lib/calendar";
import { clsx } from "@/lib/clsx";
import { Card, ProgressBar } from "../ui";
import { hatch, tint } from "./chips";

export type SidebarData = {
  upcoming: {
    id: string; title: string; dueAt: string; kind: string; gradeWeight: number | null;
    blocked: boolean; colour: string | null; courseShort: string | null;
    subtasksDone: number; subtasksTotal: number;
  }[];
  exams: {
    id: string; title: string; dueAt: string | null; examDiet: string | null;
    colour: string | null; courseName: string | null; courseShort: string | null;
    ready: number; total: number;
  }[];
  windowWeeks: number;
};

/**
 * What's coming, independent of the month you're looking at: open deadlines
 * for the next few weeks grouped by week, heavyweights pulled out, and exams
 * with how ready you are for each.
 */
export function CalendarSidebar({ data }: { data: SidebarData }) {
  const thisWeek = startOfWeek(new Date());
  const groups = new Map<string, SidebarData["upcoming"]>();

  for (const t of data.upcoming) {
    const w = startOfWeek(new Date(t.dueAt));
    const diff = Math.round((w.getTime() - thisWeek.getTime()) / (7 * 86_400_000));
    const label =
      diff <= 0 ? "This week"
        : diff === 1 ? "Next week"
        : `w/b ${fmtDate(w)}`;
    groups.set(label, [...(groups.get(label) ?? []), t]);
  }

  const heavy = data.upcoming.filter((t) => t.blocked);

  return (
    <aside className="space-y-4">
      {/* Heavyweights first — they're what the rest of the schedule bends around. */}
      {heavy.length > 0 && (
        <Card className="p-3.5">
          <p className="eyebrow mb-2.5">Big deadlines</p>
          <div className="space-y-2">
            {heavy.map((t) => {
              const n = daysUntil(new Date(t.dueAt));
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="block rounded-md border-l-[4px] p-2.5 transition-[filter] duration-[120ms] hover:brightness-[0.97]"
                  style={{
                    borderColor: t.colour ?? "var(--color-n-500)",
                    backgroundColor: tint(t.colour, 10),
                    backgroundImage: hatch(t.colour, 12),
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-n-900">{t.title}</span>
                    <span className="font-num shrink-0 rounded bg-n-900/80 px-1 text-[9.5px] font-bold text-white">
                      {t.gradeWeight}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium" style={{ color: t.colour ?? undefined }}>{t.courseShort}</span>
                    <span className={clsx("font-num", n <= 3 ? "font-semibold text-danger" : n <= 10 ? "text-warn" : "text-n-500")}>
                      {fmtRelative(new Date(t.dueAt))}
                    </span>
                  </div>
                  {t.subtasksTotal > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar value={(t.subtasksDone / t.subtasksTotal) * 100} height={3} colour={t.colour ?? undefined} className="flex-1" track="var(--color-n-0)" />
                      <span className="font-num text-[10px] text-n-500">{t.subtasksDone}/{t.subtasksTotal}</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
          <p className="mt-2.5 text-[10.5px] leading-4 text-n-400">
            Exams and coursework worth {BIG_WEIGHT_THRESHOLD}%+ are blocked out on the calendar.
          </p>
        </Card>
      )}

      <Card className="p-3.5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="eyebrow">Up next</p>
          <span className="text-[10.5px] text-n-400">{data.windowWeeks} weeks</span>
        </div>

        {data.upcoming.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-n-400">Nothing due in the next {data.windowWeeks} weeks.</p>
        ) : (
          <div className="space-y-3">
            {[...groups.entries()].map(([label, list]) => (
              <div key={label}>
                <p className="mb-1 text-[10.5px] font-semibold text-n-400">{label}</p>
                <div className="space-y-0.5">
                  {list.map((t) => {
                    const d = new Date(t.dueAt);
                    const n = daysUntil(d);
                    return (
                      <Link
                        key={t.id}
                        href={`/tasks/${t.id}`}
                        className="group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-[120ms] hover:bg-n-50"
                      >
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.colour ?? "var(--color-n-300)" }} />
                        <span className={clsx("min-w-0 flex-1 truncate text-[12px]", t.blocked ? "font-semibold text-n-900" : "text-n-700")}>
                          {t.title}
                        </span>
                        <span className={clsx("font-num shrink-0 text-[10.5px]", n <= 3 ? "font-semibold text-danger" : "text-n-400")}>
                          {fmtDayNum(d)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {data.exams.length > 0 && (
        <Card className="p-3.5">
          <p className="eyebrow mb-2.5">Exams</p>
          <div className="space-y-3">
            {data.exams.map((e) => (
              <Link key={e.id} href={`/tasks/${e.id}`} className="block rounded-md transition-opacity hover:opacity-80">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] font-semibold text-n-800">{e.courseName ?? e.title}</span>
                  <span className="shrink-0 text-[10.5px] text-n-500">
                    {e.dueAt
                      ? fmtDate(new Date(e.dueAt))
                      : e.examDiet ?? "TBC"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <ProgressBar value={e.total ? (e.ready / e.total) * 100 : 0} height={4} colour={e.colour ?? undefined} className="flex-1" />
                  <span className="font-num shrink-0 text-[10px] text-n-500">{e.ready}/{e.total}</span>
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-2.5 text-[10.5px] leading-4 text-n-400">Lectures covered, per exam.</p>
        </Card>
      )}
    </aside>
  );
}

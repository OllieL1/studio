"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "@/app/actions";
import { fmtDuration, startOfDay } from "@/lib/dates";
import { Card, Eyebrow } from "./ui";
import { focusColour } from "./StopDialog";

type S = {
  id: string;
  name: string;
  startedAt: string;
  minutes: number;
  rawMinutes: number;
  focus: number;
  notes: string | null;
  courses: { id: string; shortName: string; colour: string; minutes: number }[];
  tasks: { id: string; title: string }[];
};

/** Session history, grouped by day with a per-day total. */
export function SessionList({ sessions }: { sessions: S[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const groups = new Map<number, S[]>();
  for (const s of sessions) {
    const k = startOfDay(new Date(s.startedAt)).getTime();
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, items]) => {
        const total = items.reduce((s, x) => s + x.minutes, 0);
        return (
          <Card key={day}>
            <div className="flex items-baseline justify-between border-b border-n-100 px-4 py-2.5">
              <Eyebrow>
                {new Date(day).toLocaleDateString("en-GB", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </Eyebrow>
              <span className="font-num text-[11.5px] font-semibold text-n-600">
                {fmtDuration(total)}
              </span>
            </div>

            {items.map((s) => (
              <div
                key={s.id}
                className="group flex items-start gap-3 border-b border-n-100 px-4 py-3 last:border-b-0 hover:bg-n-25"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-n-800">{s.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-n-500">
                    <span className="font-num">
                      {new Date(s.startedAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    {s.courses.map((c) => (
                      <span key={c.id} className="font-medium" style={{ color: c.colour }}>
                        {c.shortName}
                        {/* Only worth showing the slice when it was shared. */}
                        {s.courses.length > 1 && (
                          <span className="font-num ml-1 font-normal text-n-400">
                            {fmtDuration(c.minutes)}
                          </span>
                        )}
                      </span>
                    ))}
                    {s.tasks.length > 0 && (
                      <span className="truncate text-n-400">
                        {s.tasks.map((t) => t.title).join(", ")}
                      </span>
                    )}
                    {s.rawMinutes > s.minutes && (
                      <span className="text-n-400">
                        trimmed {fmtDuration(s.rawMinutes - s.minutes)}
                      </span>
                    )}
                  </div>
                  {s.notes && (
                    <p className="mt-1.5 border-l-2 border-n-200 pl-2 text-[12px] leading-5 text-n-500">
                      {s.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className="font-num text-[11.5px] font-semibold"
                    style={{ color: focusColour(s.focus) }}
                  >
                    {s.focus}%
                  </span>
                  <span className="font-num w-14 text-right text-[13px] font-semibold text-n-800">
                    {fmtDuration(s.minutes)}
                  </span>
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${s.name}"?`)) return;
                      startTransition(async () => {
                        await deleteSession(s.id);
                        router.refresh();
                      });
                    }}
                    disabled={pending}
                    aria-label={`Delete session ${s.name}`}
                    className="rounded-md p-1.5 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M2.5 3.5h7M5 3.5V2.6h2v.9M3.4 3.5l.4 6h4.4l.4-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}

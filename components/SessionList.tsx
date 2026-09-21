"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "@/app/actions";
import { fmtDuration, startOfDay, fmtDateLong, fmtHM } from "@/lib/dates";
import { Card, Eyebrow } from "./ui";
import { SessionEditor } from "./SessionEditor";
import { locationLabel } from "@/lib/types";
import { focusColour } from "@/lib/focus";
import { cssColour } from "@/lib/palette";

type S = {
  id: string;
  name: string;
  startedAt: string;
  minutes: number;
  rawMinutes: number;
  focus: number;
  notes: string | null;
  location: string | null;
  locationNote: string | null;
  courses: { id: string; shortName: string; colour: string; minutes: number }[];
  tasks: { id: string; title: string }[];
  music: { topArtist: string; others: number; minutes: number; share: number | null; podcast: boolean } | null;
};

type CourseLink = { id: string; name: string; shortName: string; colour: string; code: string };

/** Session history, grouped by day with a per-day total. */
export function SessionList({ sessions, courses }: { sessions: S[]; courses: CourseLink[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<S | null>(null);

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
                {fmtDateLong(new Date(day))}
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
                      {fmtHM(new Date(s.startedAt))}
                    </span>
                    {s.courses.map((c) => (
                      <span key={c.id} className="font-medium" style={{ color: cssColour(c.colour) }}>
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
                    {locationLabel(s.location, s.locationNote) && (
                      <span className="text-n-500">{locationLabel(s.location, s.locationNote)}</span>
                    )}
                    {s.rawMinutes > s.minutes && (
                      <span className="text-n-400">
                        trimmed {fmtDuration(s.rawMinutes - s.minutes)}
                      </span>
                    )}
                  </div>
                  {s.music && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-n-500">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0 text-rust-500">
                          <path d="M4.5 9.2V2.6l5-1v6.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="3.3" cy="9.3" r="1.3" stroke="currentColor" strokeWidth="1.3" />
                          <circle cx="8.3" cy="8.3" r="1.3" stroke="currentColor" strokeWidth="1.3" />
                        </svg>
                        <span className="text-n-400">Top artist</span>
                        <span className="truncate font-medium text-n-700">{s.music.topArtist}</span>
                        {s.music.others > 0 && (
                          <span className="shrink-0 text-n-400">+{s.music.others} other{s.music.others === 1 ? "" : "s"}</span>
                        )}
                      </span>
                      <span className="text-n-300">·</span>
                      <span className="shrink-0">
                        <span className="font-num font-medium text-n-700">{fmtDuration(s.music.minutes)}</span>{" "}
                        <span className="text-n-400">listening</span>
                        {s.music.share != null && (
                          <span className="font-num text-n-400"> ({Math.round(s.music.share * 100)}%)</span>
                        )}
                      </span>
                      {s.music.podcast && <span className="shrink-0 text-n-400">· podcast</span>}
                    </p>
                  )}
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
                    onClick={() => setEditing(s)}
                    aria-label={`Edit session ${s.name}`}
                    className="rounded-md p-1.5 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-n-100 hover:text-n-700 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path d="M8.2 1.9 10.1 3.8M2 10l.5-2.1 5.3-5.3 1.9 1.9-5.3 5.3L2 10Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
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

      {editing && (
        <SessionEditor
          session={{
            id: editing.id,
            name: editing.name,
            startedAt: editing.startedAt,
            minutes: editing.minutes,
            focus: editing.focus,
            notes: editing.notes,
            location: editing.location,
            locationNote: editing.locationNote,
            courses: editing.courses.map((c) => ({ id: c.id, minutes: c.minutes })),
          }}
          courses={courses}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

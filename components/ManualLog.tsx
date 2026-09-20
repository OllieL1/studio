"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logManualSession } from "@/app/actions";
import { toISODate } from "@/lib/dates";
import { resolveSplit, type SplitMode } from "@/lib/split";
import { clsx } from "@/lib/clsx";
import { Card, Eyebrow } from "./ui";
import { SubjectSplit } from "./SubjectSplit";
import { LocationPicker } from "./LocationPicker";
import type { StudyLocation } from "@/lib/types";

type C = { id: string; name: string; shortName: string; colour: string; code: string };

/** For study that happened away from the laptop. Collapsed by default — the
 *  timer is the primary path and shouldn't have to compete with a form. */
export function ManualLog({ courses }: { courses: C[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [minutes, setMinutes] = useState(60);
  const [focus, setFocus] = useState(75);
  const [location, setLocation] = useState<StudyLocation | null>(null);
  const [locationNote, setLocationNote] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (courseIds.length === 0) {
      setError("Pick at least one subject.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const split = resolveSplit(splitMode, minutes, courseIds.map((id) => weights[id] ?? 0));
      await logManualSession({
        name, date, startTime, minutes, focus,
        courses: courseIds.map((courseId, i) => ({ courseId, minutes: split[i] })),
        taskIds: [], notes: null, location, locationNote: locationNote || null,
      });
      setName("");
      setCourseIds([]);
      setWeights({});
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-n-200 py-3 text-[13px] font-medium text-n-500 transition-colors duration-[120ms] hover:border-n-300 hover:bg-n-25 hover:text-n-700"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M6 2.2v7.6M2.2 6h7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Log a session by hand
      </button>
    );
  }

  return (
    <Card className="animate-fade-in p-4">
      <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_0.8fr_0.8fr]">
        <label className="block">
          <Eyebrow className="mb-1">What</Eyebrow>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Session name"
            className="h-9 w-full rounded-sm border border-n-200 px-2.5 text-[13px] outline-none focus:border-rust-400"
          />
        </label>
        <label className="block">
          <Eyebrow className="mb-1">Date</Eyebrow>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="font-num h-9 w-full rounded-sm border border-n-200 px-2.5 text-[13px] outline-none focus:border-rust-400"
          />
        </label>
        <label className="block">
          <Eyebrow className="mb-1">Start</Eyebrow>
          <input
            type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="font-num h-9 w-full rounded-sm border border-n-200 px-2.5 text-[13px] outline-none focus:border-rust-400"
          />
        </label>
        <label className="block">
          <Eyebrow className="mb-1">Minutes</Eyebrow>
          <input
            type="number" min={1} value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
            className="font-num h-9 w-full rounded-sm border border-n-200 px-2.5 text-[13px] outline-none focus:border-rust-400"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {courses.map((c) => {
          const on = courseIds.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() =>
                setCourseIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
              }
              aria-pressed={on}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
                on ? "border-transparent text-white" : "border-n-200 text-n-600 hover:bg-n-50",
              )}
              style={on ? { background: c.colour } : undefined}
            >
              {c.shortName}
            </button>
          );
        })}
      </div>

      {courseIds.length > 1 && (
        <div className="mt-3">
          <SubjectSplit
            courses={courses}
            selected={courseIds}
            totalMinutes={minutes}
            mode={splitMode}
            weights={weights}
            onModeChange={setSplitMode}
            onWeightChange={(id, v) => setWeights((w) => ({ ...w, [id]: v }))}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Eyebrow>Where</Eyebrow>
        <LocationPicker
          value={location}
          note={locationNote}
          onChange={(v, n) => { setLocation(v); setLocationNote(n); }}
          compact
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Eyebrow>Focus</Eyebrow>
        <input
          type="range" min={0} max={100} value={focus}
          onChange={(e) => setFocus(Number(e.target.value))}
          className="h-[18px] max-w-[220px] flex-1"
          aria-label="Focus rating"
        />
        <span className="font-num w-10 text-[13px] font-semibold text-n-700">{focus}%</span>

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-[12px] text-danger">{error}</span>}
          <button
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-n-600 hover:bg-n-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Log session"}
          </button>
        </div>
      </div>
    </Card>
  );
}

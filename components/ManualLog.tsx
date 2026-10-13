"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logManualSession } from "@/app/actions";
import { addDays, fmtDayDate, fmtDuration, parseLocalDate, toISODate } from "@/lib/dates";
import { resolveSplit, type SplitMode } from "@/lib/split";
import { clsx } from "@/lib/clsx";
import { Card, Eyebrow } from "./ui";
import { SubjectSplit } from "./SubjectSplit";
import { LocationPicker } from "./LocationPicker";
import type { StudyLocation } from "@/lib/types";
import { cssColour } from "@/lib/palette";

type C = { id: string; name: string; shortName: string; colour: string; code: string };

const PRESETS = [15, 30, 45, 60, 90, 120];
const MAX_MINUTES = 16 * 60;

/** "90", "1h", "1h30", "1h 30m", "1:30", "1.5h", "45m" → minutes, or 0 if it
 *  isn't a duration. A bare number is minutes. */
export function parseDuration(text: string): number {
  const s = text.trim().toLowerCase();
  if (!s) return 0;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m?(?:in(?:ute)?s?)?)?$/);
  if (m) return Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0));
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)?$/);
  if (m) return Math.round(Number(m[1]));
  return 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:00" + 90 → "10:30" (with "+1" when it runs past midnight). */
function endClock(start: string, minutes: number): string {
  const [h, m] = start.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const t = h * 60 + m + minutes;
  const clock = `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
  return t >= 24 * 60 ? `${clock} +1` : clock;
}

const field =
  "font-num h-10 w-full rounded-md border border-n-200 bg-white px-3 text-[13.5px] text-n-800 outline-none transition-colors placeholder:text-n-400 hover:border-n-300 focus:border-rust-400 focus:ring-2 focus:ring-rust-100";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors duration-[120ms]",
        on
          ? "border-rust-200 bg-rust-100 text-rust-700"
          : "border-n-200 text-n-600 hover:border-n-300 hover:bg-n-50",
      )}
    >
      {children}
    </button>
  );
}

/** For study that happened away from the laptop. Collapsed by default — the
 *  timer is the primary path and shouldn't have to compete with a form. */
export function ManualLog({ courses }: { courses: C[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  // Held as text so the field can be emptied and retyped freely.
  const [durText, setDurText] = useState("60");
  const [focus, setFocus] = useState(75);
  const [location, setLocation] = useState<StudyLocation | null>(null);
  const [locationNote, setLocationNote] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const minutes = Math.min(MAX_MINUTES, parseDuration(durText));
  const todayISO = toISODate(new Date());
  const yesterdayISO = toISODate(addDays(new Date(), -1));
  const dateLabel = useMemo(() => (date ? fmtDayDate(parseLocalDate(date)) : ""), [date]);

  const bump = (delta: number) => setDurText(String(Math.max(5, (minutes || 0) + delta)));

  const submit = () => {
    if (courseIds.length === 0) return setError("Pick at least one subject.");
    if (minutes < 1) return setError("Enter how long you studied.");
    if (!date || !startTime) return setError("Set a date and start time.");
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
      setDurText("60");
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
    <Card
      className="animate-fade-in"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div className="flex items-center justify-between border-b border-n-100 px-5 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-n-800">Log a session</h3>
          <p className="text-[12px] text-n-500">For study away from the timer.</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-md text-n-500 hover:bg-n-100 hover:text-n-700"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 2.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="space-y-5 p-5">
        {/* What + subjects */}
        <div className="space-y-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What did you work on?  (optional)"
            aria-label="Session name"
            className={clsx(field, "!font-sans h-11 text-[14.5px]")}
          />
          <div>
            <Eyebrow className="mb-2">Subjects</Eyebrow>
            <div className="flex flex-wrap items-center gap-1.5">
              {courses.map((c) => {
                const on = courseIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setCourseIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))
                    }
                    aria-pressed={on}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-all duration-[180ms]",
                      on ? "border-transparent text-white" : "border-n-200 text-n-600 hover:bg-n-50",
                    )}
                    style={on ? { background: cssColour(c.colour) } : undefined}
                  >
                    {c.shortName}
                  </button>
                );
              })}
            </div>
          </div>
          {courseIds.length > 1 && (
            <SubjectSplit
              courses={courses}
              selected={courseIds}
              totalMinutes={minutes}
              mode={splitMode}
              weights={weights}
              onModeChange={setSplitMode}
              onWeightChange={(id, v) => setWeights((w) => ({ ...w, [id]: v }))}
            />
          )}
        </div>

        {/* When + how long */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Eyebrow>When</Eyebrow>
              <div className="flex gap-1.5">
                <Chip on={date === todayISO} onClick={() => setDate(todayISO)}>Today</Chip>
                <Chip on={date === yesterdayISO} onClick={() => setDate(yesterdayISO)}>Yesterday</Chip>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
              <input
                type="date" value={date} aria-label="Date"
                onChange={(e) => setDate(e.target.value)}
                className={field}
              />
              <input
                type="time" value={startTime} aria-label="Start time"
                onChange={(e) => setStartTime(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div>
            <Eyebrow className="mb-2">How long</Eyebrow>
            <div className="flex items-stretch gap-2">
              <button
                type="button" aria-label="5 minutes less" onClick={() => bump(-5)}
                className="grid w-10 place-items-center rounded-md border border-n-200 text-n-600 hover:bg-n-50"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              <input
                value={durText}
                onChange={(e) => setDurText(e.target.value)}
                inputMode="text"
                placeholder="e.g. 90 or 1h30"
                aria-label="Duration"
                className={clsx(field, "text-center")}
              />
              <button
                type="button" aria-label="5 minutes more" onClick={() => bump(5)}
                className="grid w-10 place-items-center rounded-md border border-n-200 text-n-600 hover:bg-n-50"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Chip key={p} on={minutes === p} onClick={() => setDurText(String(p))}>
                  {fmtDuration(p)}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* Where + focus */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Eyebrow className="mb-2">Where</Eyebrow>
            <LocationPicker
              value={location}
              note={locationNote}
              onChange={(v, n) => { setLocation(v); setLocationNote(n); }}
              compact
            />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <Eyebrow>Focus</Eyebrow>
              <span className="font-num text-[13px] font-semibold text-n-700">{focus}%</span>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={focus}
              onChange={(e) => setFocus(Number(e.target.value))}
              className="h-[18px] w-full"
              aria-label="Focus rating"
            />
          </div>
        </div>
      </div>

      {/* Summary + actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-n-100 bg-n-25 px-5 py-3">
        <p className="font-num min-w-0 flex-1 text-[12.5px] text-n-500">
          {minutes >= 1 ? (
            <>
              <span className="font-semibold text-n-800">{fmtDuration(minutes)}</span>
              {" · "}{startTime}–{endClock(startTime, minutes)}
              {dateLabel && <> · {dateLabel}</>}
              {parseDuration(durText) > MAX_MINUTES && <span className="text-warn"> (capped at 16h)</span>}
            </>
          ) : (
            "Enter a duration, e.g. 90, 1h30 or 1.5h"
          )}
        </p>
        {error && <span className="text-[12px] text-danger">{error}</span>}
        <button
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-[12.5px] font-semibold text-n-600 hover:bg-n-100"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={pending || minutes < 1 || courseIds.length === 0}
          className="rounded-md bg-rust-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Log session"}
        </button>
      </div>
    </Card>
  );
}

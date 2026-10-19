"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";
import { fmtLength, fmtMinutes, parseEntry, resolveSlot, type PlanCourse } from "@/lib/plan";

export type ComposerCourse = PlanCourse & { colour: string };

export type ComposerResult = { title: string; courseId: string | null; start: number; end: number };

/**
 * The one-line entry box. Type "FP exercise 3 9-11" and press Enter; with no
 * time it slots in beside the entry it was opened from. The parse is shown
 * live underneath, and the times and course can be set by hand (Tab to
 * reach them) - Enter saves from anywhere in it, Esc backs out.
 */
export function Composer({
  courses,
  anchor,
  direction,
  initial,
  clashesWith,
  onSave,
  onCancel,
}: {
  courses: ComposerCourse[];
  anchor: { start: number; end: number } | null;
  direction: "below" | "above";
  /** Editing an existing block. */
  initial?: ComposerResult;
  /** Titles of anything on the day the proposed slot overlaps. */
  clashesWith: (slot: { start: number; end: number }) => string[];
  onSave: (r: ComposerResult) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.title ?? "");
  // Set by hand, these win over the typed line until a new time or course
  // is typed into it.
  const [manualTime, setManualTime] = useState<{ start: number; end: number } | null>(
    initial ? { start: initial.start, end: initial.end } : null,
  );
  const [manualCourse, setManualCourse] = useState<{ id: string | null } | null>(
    initial ? { id: initial.courseId } : null,
  );

  // Opened below the fold, or under the floating timer: bring it into view.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "nearest" }); }, []);

  const parsed = useMemo(() => parseEntry(text, courses), [text, courses]);
  const typedTime = parsed.start !== null || parsed.duration !== null;
  const slot = manualTime && !typedTime ? manualTime : resolveSlot(parsed, anchor, direction);
  const courseId = manualCourse && parsed.courseId === null ? manualCourse.id : parsed.courseId;
  const course = courses.find((c) => c.id === courseId) ?? null;
  // Sentence case: "FP exercise 3" leaves "exercise 3" once FP is read off.
  const title = capitalise(parsed.title) || course?.name || "";
  const clashes = clashesWith(slot);

  const save = () => {
    if (!title.trim()) return;
    onSave({ title, courseId, start: slot.start, end: slot.end });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.stopPropagation(); save(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };

  const setTime = (which: "start" | "end", v: number) => {
    const next = { ...slot, [which]: v };
    if (which === "start" && next.end <= v) next.end = Math.min(v + (slot.end - slot.start), 24 * 60);
    if (next.end > next.start) {
      setManualTime(next);
      // A time set by hand replaces one typed in the line.
      if (typedTime) setText(stripMatched(text, parsed.matched, ["time", "duration"]));
    }
  };

  return (
    <div
      ref={ref}
      onKeyDown={onKey}
      className="animate-scale-in relative my-1 scroll-mb-36 scroll-mt-24 rounded-[10px] border border-rust-300 bg-n-0 shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <span className="font-num w-[92px] shrink-0 text-[12.5px] font-semibold text-rust-600">
          {fmtMinutes(slot.start)}–{fmtMinutes(slot.end)}
        </span>
        <span
          aria-hidden
          className="h-[13px] w-[13px] shrink-0 rounded-[4px] border-[1.5px]"
          style={{ borderColor: course ? cssColour(course.colour) : "var(--color-n-300)" }}
        />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={initial ? "Rename, or type a new time" : "What and when - e.g. “FP exercise 3 9-11”"}
          aria-label="Entry"
          className="h-8 min-w-0 flex-1 bg-transparent text-[14px] font-medium text-n-900 outline-none placeholder:font-normal placeholder:text-n-400"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-2.5 pl-[119px] pt-1 max-sm:pl-3">
        <span className="font-num text-[11px] text-n-500">{fmtLength(slot.end - slot.start)}</span>
        {course && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: cssColour(course.colour), background: `color-mix(in oklab, ${cssColour(course.colour)} 10%, var(--color-n-0))` }}>
            {course.shortName}
          </span>
        )}
        {clashes.length > 0 && (
          <span className="text-[11px] font-medium text-warn">Overlaps {clashes.slice(0, 2).join(", ")}{clashes.length > 2 ? "…" : ""}</span>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          <TimeField label="Start" value={slot.start} onChange={(v) => setTime("start", v)} />
          <span className="text-n-300">–</span>
          <TimeField label="End" value={slot.end} onChange={(v) => setTime("end", v)} />
          <select
            value={courseId ?? ""}
            onChange={(e) => {
              setManualCourse({ id: e.target.value || null });
              if (parsed.courseId) setText(stripMatched(text, parsed.matched, ["course"]));
            }}
            aria-label="Course"
            className="h-7 rounded-sm border border-n-200 bg-n-0 px-1.5 text-[11.5px] text-n-700 outline-none focus:border-rust-400"
          >
            <option value="">No course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
          </select>
          <span className="hidden pl-1 text-[10.5px] text-n-400 sm:inline">
            <Key>↵</Key> save · <Key>esc</Key>
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * A 24-hour time box - typed, not a browser time picker, which shows
 * 12-hour clocks in some locales and is clumsy from the keyboard. Takes
 * "14", "14:30", "1430" or "2.30pm"; anything else waits until it parses.
 */
function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      inputMode="numeric"
      value={text ?? fmtMinutes(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setText(e.target.value);
        const v = readTime(e.target.value);
        if (v !== null) onChange(v);
      }}
      onBlur={() => setText(null)}
      aria-label={label}
      className="font-num h-7 w-[54px] rounded-sm border border-n-200 bg-n-0 px-1.5 text-center text-[11.5px] text-n-700 outline-none focus:border-rust-400"
    />
  );
}

function readTime(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h <= 24 && min < 60 && h * 60 + min <= 24 * 60 ? h * 60 + min : null;
}

function capitalise(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-num rounded border border-n-200 bg-n-50 px-1 py-px text-[10px] font-medium text-n-600">{children}</kbd>
  );
}

/** The line with the parsed pieces of the given types taken out. */
function stripMatched(text: string, matched: { text: string; type: string }[], types: string[]) {
  let out = text;
  for (const m of matched) if (types.includes(m.type)) out = out.replace(m.text, " ");
  return out.replace(/\s+/g, " ").trim();
}

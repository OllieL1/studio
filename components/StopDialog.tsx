"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { stopTimer } from "@/app/actions";
import { fmtDuration } from "@/lib/dates";
import { resolveSplit, type SplitMode } from "@/lib/split";
import { clsx } from "@/lib/clsx";
import { Eyebrow } from "./ui";
import { SubjectSplit } from "./SubjectSplit";

type CourseLink = { id: string; name: string; shortName: string; colour: string; code: string };
type TaskOption = { id: string; title: string; courseId: string | null; kind: string };

/**
 * Shown when the timer stops. Collects everything AIM.md asks for: a name,
 * the subject(s), an optional task link, a downward-only duration adjustment
 * and a focus rating out of 100.
 */
export function StopDialog({
  elapsedMinutes,
  initialName,
  courses,
  onClose,
  onSaved,
}: {
  elapsedMinutes: number;
  initialName: string;
  courses: CourseLink[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(elapsedMinutes);
  const [focus, setFocus] = useState(75);
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Task options are scoped to the chosen subjects — picking a subject first
  // keeps the task list short and relevant.
  useEffect(() => {
    if (courseIds.length === 0) {
      setTasks([]);
      return;
    }
    const q = new URLSearchParams({ courseIds: courseIds.join(","), open: "1" });
    fetch(`/api/tasks?${q}`)
      .then((r) => r.json())
      .then((d: TaskOption[]) => setTasks(d))
      .catch(() => setTasks([]));
  }, [courseIds]);

  // Drop any selected task that no longer belongs to a selected subject.
  useEffect(() => {
    setTaskIds((ids) => ids.filter((id) => tasks.some((t) => t.id === id)));
  }, [tasks]);

  // Seed the weights from the current even split, so switching to percent or
  // minutes starts from something sensible rather than zeros.
  useEffect(() => {
    if (courseIds.length < 2) return;
    setWeights((prev) => {
      const next: Record<string, number> = {};
      const even = resolveSplit("equal", minutes, courseIds.map(() => 1));
      courseIds.forEach((id, i) => {
        next[id] =
          prev[id] ??
          (splitMode === "percent" ? Math.round(100 / courseIds.length) : even[i]);
      });
      return next;
    });
  }, [courseIds, splitMode, minutes]);

  // Re-seed on a mode change so the numbers mean what the labels say.
  const changeMode = (m: SplitMode) => {
    setSplitMode(m);
    const even = resolveSplit("equal", minutes, courseIds.map(() => 1));
    const current = resolveSplit(
      splitMode,
      minutes,
      courseIds.map((id) => weights[id] ?? 0),
    );
    const base = splitMode === "equal" ? even : current;
    const next: Record<string, number> = {};
    courseIds.forEach((id, i) => {
      next[id] =
        m === "percent"
          ? minutes > 0
            ? Math.round((base[i] / minutes) * 100)
            : Math.round(100 / courseIds.length)
          : base[i];
    });
    setWeights(next);
  };

  const adjusted = elapsedMinutes - minutes;

  const submit = () => {
    if (courseIds.length === 0) {
      setError("Pick at least one subject.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const split = resolveSplit(
        splitMode,
        minutes,
        courseIds.map((id) => weights[id] ?? 0),
      );
      const res = await stopTimer({
        name,
        courses: courseIds.map((courseId, i) => ({ courseId, minutes: split[i] })),
        taskIds,
        minutes,
        focus,
        notes: notes || null,
      });
      if (res.ok) onSaved();
      else setError(res.error);
    });
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-n-900/25 p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Log study session"
    >
      <div
        className="animate-scale-in w-full max-w-[520px] overflow-hidden rounded-lg border border-n-200 bg-n-0"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="flex items-baseline justify-between border-b border-n-100 px-5 py-4">
          <h2 className="font-display text-[20px] font-semibold text-n-900">Log this session</h2>
          <span className="font-num text-[13px] text-n-500">{fmtDuration(elapsedMinutes)} tracked</span>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
          {/* Name */}
          <Field label="What did you work on?">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monad notes, ch.4"
              className="h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[14px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>

          {/* Subjects */}
          <Field label="Subjects" hint="Pick two or more to divide the session between them.">
            <div className="flex flex-wrap gap-1.5">
              {courses.map((c) => {
                const on = courseIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setCourseIds((ids) =>
                        on ? ids.filter((x) => x !== c.id) : [...ids, c.id],
                      )
                    }
                    className={clsx(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
                      on
                        ? "border-transparent text-white"
                        : "border-n-200 text-n-600 hover:border-n-300 hover:bg-n-50",
                    )}
                    style={on ? { background: c.colour } : undefined}
                    aria-pressed={on}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: on ? "rgba(255,255,255,.85)" : c.colour }}
                    />
                    {c.shortName}
                  </button>
                );
              })}
            </div>
          </Field>

          <SubjectSplit
            courses={courses}
            selected={courseIds}
            totalMinutes={minutes}
            mode={splitMode}
            weights={weights}
            onModeChange={changeMode}
            onWeightChange={(id, v) => setWeights((w) => ({ ...w, [id]: v }))}
          />

          {/* Tasks */}
          {tasks.length > 0 && (
            <Field label="Tasks worked on" hint="Optional — lets stats show time per task.">
              <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-sm border border-n-100 p-1">
                {tasks.map((t) => {
                  const on = taskIds.includes(t.id);
                  const course = courses.find((c) => c.id === t.courseId);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setTaskIds((ids) =>
                          on ? ids.filter((x) => x !== t.id) : [...ids, t.id],
                        )
                      }
                      className={clsx(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] transition-colors duration-[120ms]",
                        on ? "bg-rust-50 text-rust-800" : "text-n-600 hover:bg-n-50",
                      )}
                      aria-pressed={on}
                    >
                      <Tick on={on} />
                      <span className="truncate">{t.title}</span>
                      {course && (
                        <span className="ml-auto shrink-0 text-[11px] text-n-400">
                          {course.shortName}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Duration — down only */}
          <Field
            label="Duration"
            hint={
              adjusted > 0
                ? `Trimmed by ${fmtDuration(adjusted)}. Can only be adjusted down.`
                : "Can only be adjusted down from the tracked time."
            }
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={elapsedMinutes}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="h-[18px] flex-1"
                aria-label="Adjusted duration in minutes"
              />
              <div className="flex items-baseline gap-1 rounded-sm border border-n-200 px-2 py-1">
                <input
                  type="number"
                  min={0}
                  max={elapsedMinutes}
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(
                      Math.max(0, Math.min(elapsedMinutes, Number(e.target.value) || 0)),
                    )
                  }
                  className="font-num w-12 bg-transparent text-right text-[14px] font-semibold text-n-900 outline-none"
                />
                <span className="text-[12px] text-n-400">min</span>
              </div>
            </div>
          </Field>

          {/* Focus */}
          <Field label="Focus" hint="How well did that go? Feeds the focus analytics.">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={focus}
                onChange={(e) => setFocus(Number(e.target.value))}
                className="h-[18px] flex-1"
                aria-label="Focus rating out of 100"
              />
              <span
                className="font-num w-14 text-right text-[18px] font-semibold"
                style={{ color: focusColour(focus) }}
              >
                {focus}%
              </span>
            </div>
          </Field>

          <Field label="Notes" hint="Optional.">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything worth remembering about this session"
              className="w-full resize-none rounded-sm border border-n-200 bg-n-0 px-2.5 py-2 text-[13px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400"
            />
          </Field>

          {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-n-100 bg-n-25 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-2 text-[13px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-100"
          >
            Back
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-rust-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-50"
          >
            {pending ? "Saving…" : `Log ${fmtDuration(minutes)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Eyebrow className="mb-1.5">{label}</Eyebrow>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-4 text-n-400">{hint}</p>}
    </div>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={clsx(
        "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-[180ms]",
        on ? "border-rust-500 bg-rust-500" : "border-n-300",
      )}
    >
      {on && (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function focusColour(focus: number): string {
  if (focus >= 75) return "var(--color-ok)";
  if (focus >= 50) return "var(--color-warn)";
  return "var(--color-danger)";
}

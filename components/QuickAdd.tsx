"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/app/actions";
import { parseTask, type ParseCourse } from "@/lib/parse";
import { DEFAULT_ITEMS, TASK_KINDS, TASK_KIND_LABEL } from "@/lib/types";
import { fmtDate, fmtRelative, parseLocalDate } from "@/lib/dates";
import { clsx } from "@/lib/clsx";
import { Eyebrow } from "./ui";

/**
 * One line in, a whole task out.
 *
 * The brief was explicit that this shouldn't feel like an endless form, so
 * everything is typed into a single field and parsed live — course, kind,
 * date, time, priority and grade weight all come out of the sentence. The
 * parse is shown back as chips, and every chip is clickable if you'd rather
 * point than type. Detail (subtasks, notes) is one keystroke away, never
 * in your face.
 */
type ComposerCourse = ParseCourse & { colour: string };

export function QuickAdd({ courses }: { courses: ComposerCourse[] }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState<{ courseId?: string; kind?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseTask(raw, courses), [raw, courses]);
  const courseId = override.courseId ?? parsed.courseId;
  const kind = override.kind ?? parsed.kind ?? "COURSEWORK";

  // "/" focuses the composer from anywhere — this is the app's main verb.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const defaultChecklist = DEFAULT_ITEMS[kind] ?? [];

  const reset = () => {
    setRaw("");
    setSubtasks([]);
    setSubtaskDraft("");
    setNotes("");
    setOverride({});
    setExpanded(false);
  };

  const submit = () => {
    if (!parsed.title.trim()) {
      setError("Give the task a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createTask({
        title: parsed.title,
        courseId: courseId ?? null,
        kind,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        gradeWeight: parsed.gradeWeight,
        notes: notes || null,
        priority: parsed.priority,
        items: subtasks,
        dependsOn: [],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(parsed.title);
      setTimeout(() => setSaved(null), 2600);
      reset();
      router.refresh();
      inputRef.current?.focus();
    });
  };

  return (
    <div className="card overflow-visible">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          aria-hidden
          className="ml-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-rust-100"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 2.2v7.6M2.2 6h7.6" stroke="var(--color-rust-600)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>

        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape") { reset(); inputRef.current?.blur(); }
          }}
          placeholder="Add a task — try “FP programming exercise fri 5pm 20%”"
          className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-n-800 outline-none placeholder:text-n-400"
          aria-label="New task"
        />

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={clsx(
            "shrink-0 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors duration-[120ms]",
            expanded ? "bg-n-100 text-n-700" : "text-n-500 hover:bg-n-50",
          )}
        >
          Detail
        </button>
        <button
          onClick={submit}
          disabled={pending || !parsed.title.trim()}
          className="shrink-0 rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* Live parse — always visible, so the guess is never a surprise. */}
      {(raw.trim() || expanded) && (
        <div className="animate-fade-in flex flex-wrap items-center gap-1.5 border-t border-n-100 px-3 py-2.5">
          <ChipGroup label="Course">
            {courses.map((c) => (
              <Chip
                key={c.id}
                on={courseId === c.id}
                colour={c.colour}
                onClick={() =>
                  setOverride((o) => ({ ...o, courseId: courseId === c.id ? undefined : c.id }))
                }
              >
                {c.shortName}
              </Chip>
            ))}
          </ChipGroup>

          <Divider />

          <ChipGroup label="Type">
            {TASK_KINDS.filter((k) => k !== "SEMINAR").map((k) => (
              <Chip key={k} on={kind === k} onClick={() => setOverride((o) => ({ ...o, kind: k }))}>
                {TASK_KIND_LABEL[k]}
              </Chip>
            ))}
          </ChipGroup>

          {(parsed.dueDate || parsed.priority || parsed.gradeWeight != null) && <Divider />}

          {parsed.dueDate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rust-200 bg-rust-50 px-2 py-1 text-[11.5px] font-semibold text-rust-700">
              {fmtDate(parseLocalDate(parsed.dueDate))}
              {parsed.dueTime && <span className="font-num">{parsed.dueTime}</span>}
              <span className="font-normal text-rust-500">
                · {fmtRelative(parseLocalDate(parsed.dueDate))}
              </span>
            </span>
          )}
          {parsed.priority && (
            <span className="rounded-full border border-warn-soft bg-warn-soft px-2 py-1 text-[11.5px] font-semibold text-[#7a5f16]">
              Priority
            </span>
          )}
          {parsed.gradeWeight != null && (
            <span className="font-num rounded-full border border-n-200 px-2 py-1 text-[11.5px] font-semibold text-n-600">
              {parsed.gradeWeight}% of grade
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="animate-fade-in space-y-4 border-t border-n-100 px-4 py-4">
          <div>
            <Eyebrow className="mb-1.5">
              Subtasks
              {subtasks.length === 0 && defaultChecklist.length > 0 && (
                <span className="ml-1.5 font-normal normal-case tracking-normal text-n-400">
                  — defaults to {defaultChecklist.join(" · ")}
                </span>
              )}
            </Eyebrow>
            <div className="space-y-1">
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px] text-n-700">
                  <span className="h-[13px] w-[13px] shrink-0 rounded-[4px] border border-n-300" />
                  <span className="flex-1">{s}</span>
                  <button
                    onClick={() => setSubtasks((a) => a.filter((_, j) => j !== i))}
                    className="rounded p-1 text-n-300 transition-colors hover:bg-danger-soft hover:text-danger"
                    aria-label={`Remove subtask ${s}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <input
              value={subtaskDraft}
              onChange={(e) => setSubtaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && subtaskDraft.trim()) {
                  e.preventDefault();
                  setSubtasks((a) => [...a, subtaskDraft.trim()]);
                  setSubtaskDraft("");
                }
              }}
              placeholder="Add a subtask, press Enter"
              className="mt-1.5 h-8 w-full rounded-sm border border-n-200 px-2.5 text-[13px] outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400"
            />
          </div>

          <div>
            <Eyebrow className="mb-1.5">Notes</Eyebrow>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything else worth recording"
              className="w-full resize-none rounded-sm border border-n-200 px-2.5 py-2 text-[13px] outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400"
            />
          </div>

          <p className="text-[11px] leading-4 text-n-400">
            Typing shortcuts: <Kbd>FP</Kbd> course · <Kbd>lab</Kbd> type ·{" "}
            <Kbd>fri</Kbd> <Kbd>24/11</Kbd> <Kbd>in 3d</Kbd> date · <Kbd>5pm</Kbd> time ·{" "}
            <Kbd>!</Kbd> priority · <Kbd>20%</Kbd> weight
          </p>
        </div>
      )}

      {error && (
        <p className="border-t border-n-100 px-4 py-2 text-[12.5px] font-medium text-danger">{error}</p>
      )}
      {saved && (
        <p className="animate-fade-in border-t border-n-100 px-4 py-2 text-[12.5px] text-ok">
          Added “{saved}”.
        </p>
      )}
    </div>
  );
}

function ChipGroup({
  label,
  children,
}: {
  label: string;
  active?: string;
  colour?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-400">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  on,
  colour,
  onClick,
  children,
}: {
  on: boolean;
  colour?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        "rounded-full border px-2 py-[3px] text-[11.5px] font-medium transition-all duration-[180ms]",
        on
          ? "border-transparent bg-n-800 text-white"
          : "border-n-200 text-n-500 hover:border-n-300 hover:bg-n-50 hover:text-n-700",
      )}
      style={on && colour ? { background: colour } : undefined}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-n-200" />;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-num rounded border border-n-200 bg-n-50 px-1 py-0.5 text-[10px] font-medium text-n-600">
      {children}
    </kbd>
  );
}

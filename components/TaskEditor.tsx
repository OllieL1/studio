"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTask, deleteTask } from "@/app/actions";
import { TASK_KINDS, TASK_KIND_LABEL } from "@/lib/types";
import { clsx } from "@/lib/clsx";

type Editable = {
  id: string;
  title: string;
  courseId: string | null;
  kind: string;
  notes: string | null;
  dueDate: string;
  dueTime: string;
  startTime: string;
  endTime: string;
  gradeWeight: number | null;
  priority: boolean;
  cancelled: boolean;
  examDiet: string | null;
  startDate: string;
};

/**
 * Every property of a task, editable in one panel.
 *
 * Edits are held locally and saved together, rather than on every keystroke,
 * so changing a date and a time doesn't fire two half-finished saves (and two
 * Google Calendar updates). Unsaved changes are obvious and can be discarded.
 */
export function TaskEditor({
  task,
  courses,
  onClose,
}: {
  task: Editable;
  courses: { id: string; name: string; shortName: string; colour: string }[];
  /** Called after a clean save, and by Cancel. */
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(task);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);

  // Re-sync when the server copy changes (e.g. after a save + refresh).
  useEffect(() => setDraft(task), [task]);

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(task);
  const isClass = ["LECTURE", "LAB", "SEMINAR"].includes(draft.kind);
  const isExam = draft.kind === "EXAM";
  const kindChanged = draft.kind !== task.kind;

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await updateTask(task.id, {
        title: draft.title,
        courseId: draft.courseId,
        kind: draft.kind,
        notes: draft.notes,
        dueDate: draft.dueDate || null,
        dueTime: draft.dueTime || null,
        startTime: isClass ? draft.startTime || null : null,
        endTime: isClass ? draft.endTime || null : null,
        gradeWeight: draft.gradeWeight,
        priority: draft.priority,
        cancelled: draft.cancelled,
        examDiet: isExam ? draft.examDiet : draft.examDiet ?? null,
        startDate: isClass ? undefined : draft.startDate || null,
      });
      if (!res.ok) {
        setMessage({ tone: "bad", text: res.error });
        return;
      }
      router.refresh();
      if (res.calendarWarning) {
        // Saved, but Google didn't take it — say so before closing.
        setMessage({ tone: "warn", text: res.calendarWarning });
        setTimeout(onClose, 3000);
      } else {
        onClose();
      }
    });
  };

  return (
    <div>
      <div className="max-h-[calc(100vh-220px)] space-y-3.5 overflow-y-auto px-5 py-4">
        <Field label="Title">
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Course">
          <select
            value={draft.courseId ?? ""}
            onChange={(e) => set("courseId", e.target.value || null)}
            className={inputCls}
          >
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Type"
          hint={kindChanged ? "Changing type keeps the existing checklist - edit subtasks to match." : undefined}
        >
          <div className="flex flex-wrap gap-1">
            {TASK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("kind", k)}
                aria-pressed={draft.kind === k}
                className={clsx(
                  "rounded-full border px-2 py-[3px] text-[11.5px] font-medium transition-all duration-[180ms]",
                  draft.kind === k
                    ? "border-transparent bg-n-800 text-white"
                    : "border-n-200 text-n-500 hover:bg-n-50",
                )}
              >
                {TASK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <Field label="Date">
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              className={clsx(inputCls, "font-num")}
            />
          </Field>
          {!isClass && (
            <Field label="Time">
              <input
                type="time"
                value={draft.dueTime}
                onChange={(e) => set("dueTime", e.target.value)}
                disabled={!draft.dueDate}
                className={clsx(inputCls, "font-num disabled:opacity-40")}
              />
            </Field>
          )}
        </div>

        {!isClass && (
          <Field label="Planned start" hint="Optional. Shows the task as a bar on the project timeline.">
            <input
              type="date"
              value={draft.startDate}
              max={draft.dueDate || undefined}
              onChange={(e) => set("startDate", e.target.value)}
              className={clsx(inputCls, "font-num")}
            />
          </Field>
        )}

        {isClass && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts">
              <input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} className={clsx(inputCls, "font-num")} />
            </Field>
            <Field label="Ends">
              <input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} className={clsx(inputCls, "font-num")} />
            </Field>
          </div>
        )}

        {isExam && (
          <Field label="Exam diet" hint="Used when the exam has no fixed date yet.">
            <input
              value={draft.examDiet ?? ""}
              onChange={(e) => set("examDiet", e.target.value || null)}
              placeholder="e.g. April/May 2027"
              className={inputCls}
            />
          </Field>
        )}

        <Field label="Grade weight" hint="Percentage of the final course mark. Leave blank if unknown.">
          <div className="flex items-baseline gap-1.5">
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={draft.gradeWeight ?? ""}
              onChange={(e) => set("gradeWeight", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="-"
              className={clsx(inputCls, "font-num w-24")}
            />
            <span className="text-[12px] text-n-400">%</span>
          </div>
        </Field>

        <Field label="Notes">
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            rows={3}
            placeholder="Anything worth remembering"
            className={clsx(inputCls, "h-auto resize-y py-2")}
          />
        </Field>

        <div className="flex flex-col gap-2 border-t border-n-100 pt-3">
          <Toggle label="Priority" checked={draft.priority} onChange={(v) => set("priority", v)} />
          <Toggle
            label="Cancelled"
            hint="Excluded from progress without deleting it."
            checked={draft.cancelled}
            onChange={(v) => set("cancelled", v)}
          />
        </div>
      </div>

      {message && (
        <p
          className={clsx(
            "animate-fade-in px-5 pb-2 text-[12px] font-medium",
            message.tone === "ok" && "text-ok",
            message.tone === "warn" && "text-warn",
            message.tone === "bad" && "text-danger",
          )}
        >
          {message.text}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-n-100 bg-n-25 px-5 py-3">
        <button
          onClick={() => {
            if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
            startTransition(async () => {
              await deleteTask(task.id);
              router.push("/");
            });
          }}
          className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-n-400 transition-colors duration-[120ms] hover:bg-danger-soft hover:text-danger"
        >
          Delete
        </button>
        <div className="flex items-center gap-1.5">
          {dirty && <span className="mr-1 text-[11px] font-medium text-warn">Unsaved</span>}
          <button
            onClick={() => {
              if (dirty && !confirm("Discard your changes?")) return;
              onClose();
            }}
            className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-n-500 hover:bg-n-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!dirty || pending}
            className="rounded-md bg-rust-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[13px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-4 text-n-400">{hint}</span>}
    </label>
  );
}

function Toggle({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-[12.5px] font-medium text-n-700">{label}</span>
        {hint && <span className="block text-[10.5px] text-n-400">{hint}</span>}
      </span>
      <span
        className={clsx(
          "relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-[180ms]",
          checked ? "bg-rust-500" : "bg-n-200",
        )}
      >
        <span
          className={clsx(
            "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform duration-[180ms]",
            checked ? "translate-x-[16px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}

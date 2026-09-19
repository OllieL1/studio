"use client";

import { useRef, useState, useTransition } from "react";
import { createUniEvent, deleteUniEvent, updateUniEvent } from "@/app/actions";
import { clsx } from "@/lib/clsx";
import { backdropProps, Portal, useModal } from "@/lib/hooks/useModal";

export type EventDraft = {
  /** null when creating. */
  id: string | null;
  title: string;
  date: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  courseId: string | null;
  syncToGoogle: boolean;
};

/** Create or edit a uni event — a meeting, a talk, anything that isn't a task. */
export function EventDialog({
  draft: initial,
  courses,
  googleConnected,
  onClose,
  onSaved,
}: {
  draft: EventDraft;
  courses: { id: string; name: string; shortName: string; colour: string }[];
  googleConnected: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const editing = initial.id !== null;

  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  useModal({ onClose, initialFocus: titleRef });

  // Keep the end time after the start when the start moves past it.
  const setStart = (v: string) => {
    setD((x) => {
      if (!v || !x.endTime || x.endTime > v) return { ...x, startTime: v };
      const [h, m] = v.split(":").map(Number);
      const end = Math.min(h * 60 + m + 60, 23 * 60 + 59);
      return {
        ...x,
        startTime: v,
        endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
      };
    });
  };

  const submit = () => {
    setError(null);
    setWarning(null);
    const payload = {
      title: d.title,
      date: d.date,
      endDate: d.allDay ? d.endDate || d.date : null,
      startTime: d.allDay ? null : d.startTime,
      endTime: d.allDay ? null : d.endTime,
      allDay: d.allDay,
      location: d.location || null,
      notes: d.notes || null,
      courseId: d.courseId,
      syncToGoogle: googleConnected && d.syncToGoogle,
    };
    startTransition(async () => {
      const res = editing ? await updateUniEvent(initial.id!, payload) : await createUniEvent(payload);
      if (!res.ok) { setError(res.error); return; }
      if (res.warning) { setWarning(res.warning); setTimeout(onSaved, 2200); return; }
      onSaved();
    });
  };

  const course = courses.find((c) => c.id === d.courseId);

  return (
    <Portal>
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-n-900/25 p-4 backdrop-blur-[2px] sm:items-center"
      {...backdropProps(onClose)}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit event" : "New event"}
    >
      <div
        className="animate-scale-in w-full max-w-[480px] overflow-hidden rounded-lg border border-n-200 bg-n-0"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="h-1 transition-colors duration-[180ms]" style={{ background: course?.colour ?? "var(--color-rust-500)" }} />

        <div className="space-y-4 px-5 pb-4 pt-4">
          <input
            ref={titleRef}
            value={d.title}
            onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={editing ? "Event title" : "e.g. Project supervisor meeting"}
            className="font-display w-full bg-transparent text-[21px] font-semibold text-n-900 outline-none placeholder:font-normal placeholder:text-n-300"
            aria-label="Title"
          />

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>When</Label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-n-600">
                <input type="checkbox" checked={d.allDay} onChange={(e) => set("allDay", e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-rust-500)]" />
                All day
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={d.date}
                onChange={(e) => setD((x) => ({ ...x, date: e.target.value, endDate: x.endDate < e.target.value ? e.target.value : x.endDate }))}
                className={clsx(input, "font-num w-[150px]")}
                aria-label="Date"
              />
              {d.allDay ? (
                <>
                  <span className="text-[12px] text-n-400">to</span>
                  <input
                    type="date"
                    min={d.date}
                    value={d.endDate}
                    onChange={(e) => set("endDate", e.target.value)}
                    className={clsx(input, "font-num w-[150px]")}
                    aria-label="End date"
                  />
                </>
              ) : (
                <>
                  <input type="time" value={d.startTime} onChange={(e) => setStart(e.target.value)} className={clsx(input, "font-num w-[104px]")} aria-label="Start time" />
                  <span className="text-[12px] text-n-400">–</span>
                  <input type="time" value={d.endTime} onChange={(e) => set("endTime", e.target.value)} className={clsx(input, "font-num w-[104px]")} aria-label="End time" />
                </>
              )}
            </div>
          </div>

          <div>
            <Label>Course</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <CourseChip on={!d.courseId} onClick={() => set("courseId", null)}>None</CourseChip>
              {courses.map((c) => (
                <CourseChip key={c.id} on={d.courseId === c.id} colour={c.colour} onClick={() => set("courseId", c.id)}>
                  {c.shortName}
                </CourseChip>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5">
            <input value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="Location - room, building or link" className={input} aria-label="Location" />
            <textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes" rows={2} className={clsx(input, "h-auto resize-none py-2")} aria-label="Notes" />
          </div>

          <div className="rounded-sm border border-n-100 bg-n-25 px-3 py-2.5">
            {googleConnected ? (
              <button
                type="button"
                role="switch"
                aria-checked={d.syncToGoogle}
                onClick={() => set("syncToGoogle", !d.syncToGoogle)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-[12.5px] font-medium text-n-700">Sync to Google Calendar</span>
                  <span className="block text-[10.5px] text-n-400">
                    {editing && initial.syncToGoogle && !d.syncToGoogle
                      ? "Turning this off removes it from Google."
                      : "Edits here update the Google copy."}
                  </span>
                </span>
                <span className={clsx("relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-[180ms]", d.syncToGoogle ? "bg-rust-500" : "bg-n-200")}>
                  <span className={clsx("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform duration-[180ms]", d.syncToGoogle ? "translate-x-[16px]" : "translate-x-[2px]")} />
                </span>
              </button>
            ) : (
              <p className="flex items-center justify-between gap-3 text-[12px] text-n-500">
                Google Calendar isn&apos;t connected.
                <a href="/settings" className="shrink-0 font-semibold text-rust-600 hover:text-rust-700">Connect →</a>
              </p>
            )}
          </div>

          {error && <p className="text-[12.5px] font-medium text-danger">{error}</p>}
          {warning && <p className="text-[12.5px] font-medium text-warn">{warning}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-n-100 bg-n-25 px-5 py-3">
          {editing ? (
            <button
              onClick={() => {
                if (!confirm(`Delete "${initial.title}"?${initial.syncToGoogle ? " It will also be removed from Google Calendar." : ""}`)) return;
                startTransition(async () => { await deleteUniEvent(initial.id!); onSaved(); });
              }}
              disabled={pending}
              className="rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-n-400 hover:bg-danger-soft hover:text-danger"
            >
              Delete
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-2 text-[12.5px] font-semibold text-n-600 hover:bg-n-100">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={pending || !d.title.trim()}
              className="rounded-md bg-rust-500 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-40"
            >
              {pending ? "Saving…" : editing ? "Save" : "Create event"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

const input =
  "h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[13px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-500">{children}</span>;
}

function CourseChip({
  on, colour, onClick, children,
}: { on: boolean; colour?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-all duration-[180ms]",
        on ? "border-n-800 bg-n-800 text-white" : "border-n-200 text-n-500 hover:bg-n-50",
      )}
    >
      {colour && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colour }} />}
      {children}
    </button>
  );
}

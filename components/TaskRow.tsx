"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleItem, toggleTask, deleteTask, addItem, deleteItem } from "@/app/actions";
import { fmtRelative, fmtTime, urgencyOf } from "@/lib/dates";
import { TASK_KIND_LABEL, canAddSubtasks } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { Pill } from "./ui";
import { CalendarButton } from "./CalendarButton";

export type TaskRowData = {
  id: string;
  title: string;
  kind: string;
  dueAt: Date | string | null;
  startMin: number | null;
  endMin: number | null;
  priority: number;
  doneAt: Date | string | null;
  notes: string | null;
  gradeWeight: number | null;
  items: { id: string; label: string; doneAt: Date | string | null }[];
  calendarEventId?: string | null;
  course?: { id: string; shortName: string; colour: string; name: string } | null;
};

/**
 * One task. Collapsed it shows title, course, timing and a compact
 * parts-completed indicator; expanded it reveals the checklist. Ticking a
 * part updates progress bars across the whole app.
 */
export function TaskRow({
  task,
  showCourse = true,
  defaultOpen = false,
  onDeleted,
}: {
  task: TaskRowData;
  showCourse?: boolean;
  defaultOpen?: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);

  const due = task.dueAt ? new Date(task.dueAt) : null;
  const doneCount = task.items.filter((i) => i.doneAt).length;
  const total = task.items.length;
  const done = total > 0 ? doneCount === total : !!task.doneAt;
  const partial = total > 0 && doneCount > 0 && doneCount < total;
  const urgency = urgencyOf(due, done);
  // Coursework and friends can be broken down even before they have any
  // subtasks, so the row stays expandable with an empty checklist.
  const expandable = total > 0 || canAddSubtasks(task.kind);

  const submitDraft = () => {
    const label = draft.trim();
    if (!label) return;
    setDraft("");
    startTransition(async () => {
      await addItem(task.id, label);
      router.refresh();
    });
    // Keep focus in the field so several subtasks can be typed in a row.
    requestAnimationFrame(() => draftRef.current?.focus());
  };

  return (
    <div
      className={clsx(
        "group relative border-b border-n-100 last:border-b-0 transition-colors duration-[120ms]",
        done && "opacity-55",
      )}
    >
      {task.course && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: task.course.colour }}
        />
      )}

      <div className="flex items-start gap-3 py-2.5 pl-4 pr-3 hover:bg-n-25">
        <button
          onClick={() =>
            startTransition(async () => {
              await toggleTask(task.id);
              router.refresh();
            })
          }
          disabled={pending}
          aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          className={clsx(
            "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-[180ms]",
            done
              ? "border-ok bg-ok"
              : partial
                ? "border-rust-400 bg-rust-50"
                : "border-n-300 hover:border-n-400",
          )}
        >
          {done && (
            <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path
                d="M1.5 5.2 4 7.5 8.5 2.5"
                stroke="white" strokeWidth="1.9"
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="12" strokeDashoffset="12"
                style={{ animation: "draw-check 180ms var(--ease-out-soft) forwards" }}
              />
            </svg>
          )}
          {partial && <span className="h-[7px] w-[7px] rounded-[2px] bg-rust-500" />}
        </button>

        <div
          onClick={() => expandable && setOpen((v) => !v)}
          className={clsx("min-w-0 flex-1 text-left", expandable && "cursor-pointer")}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              href={`/tasks/${task.id}`}
              onClick={(e) => e.stopPropagation()}
              className={clsx(
                "text-[14px] font-medium text-n-800 decoration-rust-300 underline-offset-2 hover:text-rust-700 hover:underline",
                done && "line-through decoration-n-400",
              )}
            >
              {task.title}
            </Link>
            {task.priority > 0 && !done && (
              <Pill tone="rust">Priority</Pill>
            )}
            {task.gradeWeight != null && (
              <span className="font-num text-[11px] font-medium text-n-400">
                {task.gradeWeight}%
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] leading-4 text-n-500">
            {showCourse && task.course && (
              <span className="font-medium" style={{ color: task.course.colour }}>
                {task.course.shortName}
              </span>
            )}
            <span className="text-n-400">{TASK_KIND_LABEL[task.kind] ?? task.kind}</span>
            {task.startMin != null && (
              <span className="font-num">
                {fmtTime(task.startMin)}
                {task.endMin != null && `–${fmtTime(task.endMin)}`}
              </span>
            )}
            {due && !done && (
              <span
                className={clsx(
                  "font-medium",
                  urgency === "overdue" && "text-danger",
                  urgency === "soon" && "text-warn",
                )}
              >
                {fmtRelative(due)}
              </span>
            )}
            {total > 0 && (
              <span className="font-num text-n-400">
                {doneCount}/{total}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <CalendarButton
            taskId={task.id}
            onCalendar={!!task.calendarEventId}
            hasDate={!!task.dueAt}
            compact
          />
          {expandable && (
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Collapse checklist" : "Expand checklist"}
              aria-expanded={open}
              className="rounded-md p-1.5 text-n-400 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-600"
            >
              <svg
                width="11" height="11" viewBox="0 0 10 10" fill="none"
                className={clsx("transition-transform duration-[180ms]", open && "rotate-180")}
              >
                <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
              startTransition(async () => {
                await deleteTask(task.id);
                onDeleted?.();
                router.refresh();
              });
            }}
            aria-label={`Delete ${task.title}`}
            className="rounded-md p-1.5 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 3.5h7M5 3.5V2.6h2v.9M3.4 3.5l.4 6h4.4l.4-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {open && expandable && (
        <div className="animate-fade-in space-y-0.5 pb-3 pl-[46px] pr-3">
          {task.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-1 rounded-md transition-colors duration-[120ms] hover:bg-n-50"
            >
              <button
                onClick={() =>
                  startTransition(async () => {
                    await toggleItem(item.id);
                    router.refresh();
                  })
                }
                disabled={pending}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left"
              >
                <span
                  className={clsx(
                    "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-[180ms]",
                    item.doneAt ? "border-ok bg-ok" : "border-n-300",
                  )}
                >
                  {item.doneAt && (
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                      <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span
                  className={clsx(
                    "truncate text-[13px] text-n-600",
                    item.doneAt && "text-n-400 line-through decoration-n-300",
                  )}
                >
                  {item.label}
                </span>
              </button>

              <button
                onClick={() =>
                  startTransition(async () => {
                    await deleteItem(item.id);
                    router.refresh();
                  })
                }
                disabled={pending}
                aria-label={`Remove subtask ${item.label}`}
                className="mr-1 shrink-0 rounded p-1 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2.5 px-2 pt-1">
            <span
              aria-hidden
              className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border border-dashed border-n-300"
            >
              <svg width="7" height="7" viewBox="0 0 12 12" fill="none">
                <path d="M6 2.2v7.6M2.2 6h7.6" stroke="var(--color-n-400)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              ref={draftRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitDraft(); }
                if (e.key === "Escape") setDraft("");
              }}
              onBlur={submitDraft}
              placeholder={total === 0 ? "Break this down into subtasks…" : "Add a subtask"}
              aria-label={`Add a subtask to ${task.title}`}
              className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-n-700 outline-none placeholder:text-n-400"
            />
            {total > 0 && (
              <span className="font-num shrink-0 pr-1 text-[10.5px] text-n-400">
                equal weight
              </span>
            )}
          </div>

          {task.notes && (
            <p className="mt-2 border-l-2 border-n-200 pl-2.5 text-[12px] leading-5 text-n-500">
              {task.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

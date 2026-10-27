"use client";

import { fmtWeight } from "@/lib/format";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleItem, toggleTask, deleteTask, addItem, deleteItem } from "@/app/actions";
import { setTaskBacklog } from "@/app/projectActions";
import { fmtRelative, fmtTime, urgencyOf } from "@/lib/dates";
import { TASK_KIND_LABEL, canAddSubtasks } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { Pill } from "./ui";
import { Tick, useShown } from "./Tick";
import { CalendarButton } from "./CalendarButton";
import { cssColour } from "@/lib/palette";

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
  backlog?: boolean;
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
  backlogToggle = false,
  backlogPill = true,
  onDeleted,
}: {
  task: TaskRowData;
  showCourse?: boolean;
  defaultOpen?: boolean;
  /** Offer "push to backlog" / "bring back" - project tasks only. */
  backlogToggle?: boolean;
  /** Tag backlogged rows - off where a heading already says so. */
  backlogPill?: boolean;
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
  const [shown, setShown] = useShown(done);
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
        // The fade waits a beat, so the tick's burst is seen at full strength.
        "group relative border-b border-n-100 last:border-b-0 transition-[opacity,background-color] duration-[400ms] delay-200",
        shown && "opacity-55",
      )}
    >
      {task.course && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: cssColour(task.course.colour) }}
        />
      )}

      <div className="flex items-start gap-3 py-2.5 pl-4 pr-3 hover:bg-n-25">
        <Tick
          done={shown}
          partial={partial}
          disabled={pending}
          className="mt-0.5"
          label={shown ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          onToggle={() => {
            setShown(!shown);
            startTransition(async () => {
              await toggleTask(task.id);
              router.refresh();
            });
          }}
        />

        <div
          onClick={() => expandable && setOpen((v) => !v)}
          className={clsx("min-w-0 flex-1 text-left", expandable && "cursor-pointer")}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              href={`/tasks/${task.id}`}
              onClick={(e) => e.stopPropagation()}
              data-done={shown}
              className="tick-text text-[14px] font-medium text-n-800 decoration-rust-300 underline-offset-2 hover:text-rust-700 hover:underline"
            >
              <span className="tick-words">{task.title}</span>
            </Link>
            {task.priority > 0 && !done && (
              <Pill tone="rust">Priority</Pill>
            )}
            {backlogPill && task.backlog && !done && <Pill>Backlog</Pill>}
            {task.gradeWeight != null && (
              <span className="font-num text-[11px] font-medium text-n-400">
                {fmtWeight(task.gradeWeight)}%
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] leading-4 text-n-500">
            {showCourse && task.course && (
              <span className="font-medium" style={{ color: cssColour(task.course.colour) }}>
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
          {backlogToggle && !done && (
            <button
              onClick={() =>
                startTransition(async () => {
                  await setTaskBacklog(task.id, !task.backlog);
                  router.refresh();
                })
              }
              disabled={pending}
              aria-label={task.backlog ? `Bring ${task.title} back from the backlog` : `Push ${task.title} to the backlog`}
              title={task.backlog ? "Bring back - it'll carry to the next meeting again" : "Push to backlog - it won't carry to the next meeting"}
              className="rounded-md p-1.5 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-n-100 hover:text-n-600 focus-visible:opacity-100 group-hover:opacity-100"
            >
              {task.backlog ? (
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M5 8.5V2M2.2 4.6 5 1.8l2.8 2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M5 1.5V8M2.2 5.4 5 8.2l2.8-2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
            </button>
          )}
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
              <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5">
                <Tick
                  id={`item-${item.id}`}
                  size="sm"
                  done={!!item.doneAt}
                  disabled={pending}
                  label={item.doneAt ? `Untick ${item.label}` : `Tick ${item.label}`}
                  onToggle={() =>
                    startTransition(async () => {
                      await toggleItem(item.id);
                      router.refresh();
                    })
                  }
                />
                {/* A label, so the words tick it too - as the whole row used to. */}
                <label htmlFor={`item-${item.id}`} data-done={!!item.doneAt} className="tick-text cursor-pointer truncate text-[13px] text-n-600">
                  <span className="tick-words">{item.label}</span>
                </label>
              </div>

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

"use client";

import { useEffect, useState } from "react";
import { clsx } from "@/lib/clsx";

type TaskOption = { id: string; title: string; courseId: string | null; kind: string };

/**
 * The open tasks of the chosen subjects, for linking a session to what it
 * was spent on - the same whether it came off the timer or was logged by
 * hand. Picking a subject first keeps the list short and relevant; a task
 * whose subject is unpicked drops out of the selection.
 */
export function useSubjectTasks(courseIds: string[], setTaskIds: (f: (ids: string[]) => string[]) => void) {
  const [tasks, setTasks] = useState<TaskOption[]>([]);

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

  useEffect(() => {
    setTaskIds((ids) => ids.filter((id) => tasks.some((t) => t.id === id)));
  }, [tasks, setTaskIds]);

  return tasks;
}

export function TaskChecklist({
  tasks,
  courses,
  selected,
  onChange,
}: {
  tasks: TaskOption[];
  courses: { id: string; shortName: string }[];
  selected: string[];
  onChange: (f: (ids: string[]) => string[]) => void;
}) {
  return (
    <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-sm border border-n-100 p-1">
      {tasks.map((t) => {
        const on = selected.includes(t.id);
        const course = courses.find((c) => c.id === t.courseId);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange((ids) => (on ? ids.filter((x) => x !== t.id) : [...ids, t.id]))}
            className={clsx(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] transition-colors duration-[120ms]",
              on ? "bg-rust-50 text-rust-800" : "text-n-600 hover:bg-n-50",
            )}
            aria-pressed={on}
          >
            <Tick on={on} />
            <span className="truncate">{t.title}</span>
            {course && <span className="ml-auto shrink-0 text-[11px] text-n-400">{course.shortName}</span>}
          </button>
        );
      })}
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

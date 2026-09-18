"use client";

import { useEffect, useRef, useState } from "react";
import { backdropProps, Portal, useModal } from "@/lib/hooks/useModal";
import { TaskEditor } from "./TaskEditor";

type EditorProps = Omit<React.ComponentProps<typeof TaskEditor>, "onClose">;

/**
 * The task editor, kept behind an Edit button so the task page leads with
 * the work rather than a wall of form fields. E opens it from anywhere on
 * the page.
 */
export function TaskEditButton(props: EditorProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edit task (E)"
        className="flex items-center gap-1.5 rounded-md border border-n-200 bg-n-0 px-3 py-1.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-800"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M8.2 1.8l2 2L4 10H2v-2l6.2-6.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        Edit
      </button>
      {open && <TaskEditModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function TaskEditModal({ onClose, ...props }: EditorProps & { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useModal({ onClose, initialFocus: panel });

  return (
    <Portal>
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-n-900/25 p-4 backdrop-blur-[2px] sm:items-center"
      {...backdropProps(onClose)}
      role="dialog"
      aria-modal="true"
      aria-label="Edit task"
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="animate-scale-in w-full max-w-[460px] overflow-hidden rounded-lg border border-n-200 bg-n-0 outline-none"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="flex items-baseline justify-between border-b border-n-100 px-5 py-3.5">
          <h2 className="font-display text-[19px] font-semibold text-n-900">Edit task</h2>
          <span className="text-[11px] text-n-400">Esc to close</span>
        </div>
        <TaskEditor {...props} onClose={onClose} />
      </div>
    </div>
    </Portal>
  );
}

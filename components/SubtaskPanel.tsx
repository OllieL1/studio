"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addItem, deleteItem, renameItem, toggleItem, toggleTask } from "@/app/actions";
import { clsx } from "@/lib/clsx";
import { Card, Eyebrow } from "./ui";

type Item = { id: string; label: string; done: boolean };

/** The task's checklist, with add, rename (double-click), tick and remove. */
export function SubtaskPanel({
  taskId,
  kind,
  done,
  items,
}: {
  taskId: string;
  kind: string;
  done: boolean;
  items: Item[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const addRef = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    setDraft("");
    run(() => addItem(taskId, label));
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const commitRename = (id: string) => {
    const label = editValue.trim();
    setEditing(null);
    const original = items.find((i) => i.id === id)?.label;
    if (label && label !== original) run(() => renameItem(id, label));
  };

  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Eyebrow>{["LECTURE", "LAB", "SEMINAR"].includes(kind) ? "Parts" : "Subtasks"}</Eyebrow>
        {items.length > 0 ? (
          <span className="font-num text-[11.5px] text-n-500">
            {doneCount}/{items.length} · equal weight
          </span>
        ) : (
          <button
            onClick={() => run(() => toggleTask(taskId))}
            disabled={pending}
            className={clsx(
              "rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-[120ms]",
              done ? "bg-ok-soft text-[#3f5c38] hover:bg-n-100" : "bg-rust-500 text-white hover:bg-rust-600",
            )}
          >
            {done ? "✓ Complete — undo" : "Mark complete"}
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-1 rounded-md transition-colors duration-[120ms] hover:bg-n-50"
          >
            <button
              onClick={() => run(() => toggleItem(item.id))}
              disabled={pending}
              aria-label={item.done ? `Untick ${item.label}` : `Tick ${item.label}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center"
            >
              <span
                className={clsx(
                  "flex h-[16px] w-[16px] items-center justify-center rounded-[4px] border transition-colors duration-[180ms]",
                  item.done ? "border-ok bg-ok" : "border-n-300",
                )}
              >
                {item.done && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>

            {editing === item.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitRename(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(item.id);
                  if (e.key === "Escape") setEditing(null);
                }}
                className="h-7 min-w-0 flex-1 rounded-sm border border-rust-300 bg-n-0 px-2 text-[13.5px] outline-none"
              />
            ) : (
              <span
                onDoubleClick={() => { setEditing(item.id); setEditValue(item.label); }}
                title="Double-click to rename"
                className={clsx(
                  "min-w-0 flex-1 cursor-text truncate py-1.5 text-[13.5px]",
                  item.done ? "text-n-400 line-through decoration-n-300" : "text-n-700",
                )}
              >
                {item.label}
              </span>
            )}

            <button
              onClick={() => { setEditing(item.id); setEditValue(item.label); }}
              aria-label={`Rename ${item.label}`}
              className="shrink-0 rounded p-1.5 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-n-100 hover:text-n-600 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M8.2 1.8l2 2L4 10H2v-2l6.2-6.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => run(() => deleteItem(item.id))}
              disabled={pending}
              aria-label={`Remove ${item.label}`}
              className="mr-1 shrink-0 rounded p-1.5 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className={clsx("flex items-center gap-2 px-2", items.length > 0 && "mt-1 pt-1")}>
        <span
          aria-hidden
          className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border border-dashed border-n-300"
        >
          <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
            <path d="M6 2.2v7.6M2.2 6h7.6" stroke="var(--color-n-400)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={addRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
            if (e.key === "Escape") setDraft("");
          }}
          placeholder={items.length === 0 ? "Break this down into subtasks…" : "Add a subtask"}
          className="h-8 min-w-0 flex-1 bg-transparent pl-1.5 text-[13.5px] text-n-700 outline-none placeholder:text-n-400"
          aria-label="Add a subtask"
        />
      </div>
    </Card>
  );
}

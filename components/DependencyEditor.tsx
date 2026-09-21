"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDependency, removeDependency } from "@/app/actions";
import { clsx } from "@/lib/clsx";
import { Card, Eyebrow, ProgressBar } from "./ui";
import { cssColour } from "@/lib/palette";

type Linked = { id: string; title: string; done: boolean; colour: string | null; courseShort: string | null };
type Option = { id: string; title: string; courseId: string | null; kind: string };

/**
 * What should be done before this task, and what's waiting on it.
 * Advisory only — nothing here ever blocks ticking a task off.
 */
export function DependencyEditor({
  taskId,
  courseId,
  prerequisites,
  dependents,
  readiness,
}: {
  taskId: string;
  courseId: string | null;
  prerequisites: Linked[];
  dependents: Linked[];
  readiness: { done: number; total: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [showAllCourses, setShowAllCourses] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!adding) return;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (courseId && !showAllCourses) params.set("courseIds", courseId);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tasks?${params}`);
      const data = (await res.json()) as Option[];
      const taken = new Set([taskId, ...prerequisites.map((p) => p.id)]);
      setOptions(data.filter((o) => !taken.has(o.id)).slice(0, 12));
    }, 120);
    return () => clearTimeout(t);
  }, [adding, q, courseId, showAllCourses, taskId, prerequisites]);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Eyebrow>Do these first</Eyebrow>
        {readiness && (
          <span className="font-num text-[11.5px] text-n-500">
            {readiness.done}/{readiness.total} ready
          </span>
        )}
      </div>

      {readiness && (
        <ProgressBar value={(readiness.done / readiness.total) * 100} height={4} className="mb-3" />
      )}

      {prerequisites.length === 0 && !adding && (
        <p className="mb-2 text-[12px] leading-5 text-n-400">
          Nothing needs to come before this.
        </p>
      )}

      <div className="max-h-64 space-y-0.5 overflow-y-auto">
        {prerequisites.map((p) => (
          <div key={p.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-n-50">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.done ? "var(--color-ok)" : "var(--color-n-300)" }}
            />
            <Link
              href={`/tasks/${p.id}`}
              className={clsx(
                "min-w-0 flex-1 truncate text-[12.5px] hover:underline",
                p.done ? "text-n-400 line-through decoration-n-300" : "text-n-700",
              )}
            >
              {p.title}
            </Link>
            {p.courseShort && (
              <span className="shrink-0 text-[10.5px] font-medium" style={{ color: cssColour(p.colour) || undefined }}>
                {p.courseShort}
              </span>
            )}
            <button
              onClick={() => run(() => removeDependency(taskId, p.id))}
              disabled={pending}
              aria-label={`Remove ${p.title} as a prerequisite`}
              className="shrink-0 rounded p-1 text-n-300 opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="animate-fade-in mt-2 rounded-sm border border-n-200">
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setQ(""))}
            placeholder="Find a task…"
            className="h-8 w-full border-b border-n-100 bg-transparent px-2.5 text-[12.5px] outline-none placeholder:text-n-400"
          />
          <div className="max-h-48 overflow-y-auto p-1">
            {options.length === 0 ? (
              <p className="px-2 py-2 text-[11.5px] text-n-400">No matching tasks.</p>
            ) : (
              options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { run(() => addDependency(taskId, o.id)); setQ(""); }}
                  disabled={pending}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-[12.5px] text-n-700 hover:bg-rust-50"
                >
                  {o.title}
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-n-100 px-2 py-1.5">
            {courseId ? (
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-n-500">
                <input
                  type="checkbox"
                  checked={showAllCourses}
                  onChange={(e) => setShowAllCourses(e.target.checked)}
                  className="h-3 w-3 accent-[var(--color-rust-500)]"
                />
                All courses
              </label>
            ) : <span />}
            <button
              onClick={() => { setAdding(false); setQ(""); }}
              className="text-[11px] font-semibold text-n-500 hover:text-n-800"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-n-200 py-1.5 text-[12px] font-medium text-n-500 transition-colors duration-[120ms] hover:border-n-300 hover:bg-n-25 hover:text-n-700"
        >
          + Add prerequisite
        </button>
      )}

      {dependents.length > 0 && (
        <div className="mt-4 border-t border-n-100 pt-3">
          <Eyebrow className="mb-2">Waiting on this</Eyebrow>
          <div className="space-y-0.5">
            {dependents.map((d) => (
              <Link
                key={d.id}
                href={`/tasks/${d.id}`}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] text-n-700 hover:bg-n-50"
              >
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: cssColour(d.colour) || "var(--color-n-300)" }} />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

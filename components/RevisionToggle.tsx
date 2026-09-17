"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRevisionMode } from "@/app/actions";
import { ProgressBar } from "./ui";
import { clsx } from "@/lib/clsx";

/**
 * Mark a course for revision.
 *
 * Adds an unticked "Revised" part to every lecture, so the course re-opens for
 * exam prep without unticking attendance/notes or duplicating tasks. Turning
 * it off removes those parts and restores the course exactly.
 */
export function RevisionToggle({
  courseId,
  on,
  lectureCount,
  revised,
  total,
  colour,
}: {
  courseId: string;
  on: boolean;
  lectureCount: number;
  revised: number;
  total: number;
  colour: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const apply = (next: boolean) => {
    setConfirming(false);
    startTransition(async () => {
      await setRevisionMode(courseId, next);
      router.refresh();
    });
  };

  if (lectureCount === 0) return null;

  if (!on) {
    return (
      <div className="rounded-md border border-n-100 bg-n-25 p-3">
        {confirming ? (
          <div className="animate-fade-in">
            <p className="text-[12.5px] leading-5 text-n-700">
              Add a <strong>Revised</strong> step to all {lectureCount} lectures?
            </p>
            <p className="mt-1 text-[11px] leading-4 text-n-500">
              Attendance and notes stay ticked. The course re-opens so you can work
              through it again for the exam. Reversible at any time.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => apply(true)}
                disabled={pending}
                className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white transition-opacity duration-[120ms] disabled:opacity-50"
                style={{ background: colour }}
              >
                {pending ? "Working…" : "Mark for revision"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-n-500 hover:bg-n-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-500">
                Revision
              </span>
              <span className="mt-0.5 block text-[11.5px] text-n-400">
                Re-open all {lectureCount} lectures for exam prep
              </span>
            </span>
            <span className="shrink-0 rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[11.5px] font-semibold text-n-600">
              Start
            </span>
          </button>
        )}
      </div>
    );
  }

  const pct = total > 0 ? (revised / total) * 100 : 0;

  return (
    <div className="rounded-md border border-rust-200 bg-rust-50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-rust-700">
          <span aria-hidden className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-rust-500" />
          In revision
        </span>
        <span className="font-num text-[11.5px] font-semibold text-rust-700">
          {revised}/{total}
        </span>
      </div>

      <ProgressBar
        value={pct}
        colour="var(--color-rust-500)"
        track="var(--color-rust-200)"
        height={5}
        className="mt-2.5"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] leading-4 text-rust-700">
          {revised === total
            ? "Every lecture revised."
            : `${total - revised} lecture${total - revised === 1 ? "" : "s"} still to revise.`}
        </p>
        <button
          onClick={() => apply(false)}
          disabled={pending}
          className="shrink-0 rounded-md border border-rust-200 bg-n-0 px-2.5 py-1.5 text-[11.5px] font-semibold text-rust-700 transition-colors duration-[120ms] hover:bg-rust-100 disabled:opacity-50"
        >
          {pending ? "Working…" : "End revision"}
        </button>
      </div>
    </div>
  );
}

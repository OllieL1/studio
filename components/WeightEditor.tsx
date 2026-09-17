"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCourseWeights } from "@/app/actions";
import { normaliseWeights } from "@/lib/progress";
import { Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";

/** Per-course weights. Always normalised to 100 so the bar stays meaningful. */
export function WeightEditor({
  courseId,
  lecture,
  lab,
  assessment,
  colour,
}: {
  courseId: string;
  lecture: number;
  lab: number;
  assessment: number;
  colour: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({ lecture, lab, assessment });
  const [pending, startTransition] = useTransition();

  const preview = normaliseWeights(vals.lecture, vals.lab, vals.assessment);
  const dirty =
    preview.lecture !== lecture || preview.lab !== lab || preview.assessment !== assessment;

  return (
    <div className="rounded-md border border-n-100 bg-n-25 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <Eyebrow>Progress weights</Eyebrow>
        <span className="font-num text-[11px] text-n-500">
          {lecture} / {lab} / {assessment}
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={clsx("ml-1.5 inline transition-transform duration-[180ms]", open && "rotate-180")}
          >
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="animate-fade-in mt-3 space-y-2.5">
          {(["lecture", "lab", "assessment"] as const).map((k) => (
            <div key={k} className="flex items-center gap-2.5">
              <span className="w-[74px] shrink-0 text-[11.5px] capitalize text-n-600">
                {k === "assessment" ? "Assessed" : k}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={vals[k]}
                onChange={(e) => setVals((v) => ({ ...v, [k]: Number(e.target.value) }))}
                className="h-[18px] flex-1"
                aria-label={`${k} weight`}
              />
              <span className="font-num w-8 shrink-0 text-right text-[11.5px] font-semibold text-n-700">
                {preview[k]}
              </span>
            </div>
          ))}

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[10.5px] leading-4 text-n-400">
              Normalised to 100. Exams are never counted.
            </p>
            <button
              disabled={!dirty || pending}
              onClick={() =>
                startTransition(async () => {
                  await updateCourseWeights(courseId, vals.lecture, vals.lab, vals.assessment);
                  router.refresh();
                })
              }
              className="shrink-0 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white transition-opacity duration-[120ms] disabled:opacity-40"
              style={{ background: colour }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

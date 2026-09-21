"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCourseWeights } from "@/app/actions";
import { normaliseWeights } from "@/lib/progress";
import { Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";

/** Per-course weights. Always normalised to 100 so the bar stays meaningful. */
export function WeightEditor({
  courseId,
  lecture,
  lab,
  assessment,
  credits,
  colour,
}: {
  courseId: string;
  lecture: number;
  lab: number;
  assessment: number;
  credits: number;
  colour: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState({ lecture, lab, assessment });
  const [cr, setCr] = useState(credits);
  const [pending, startTransition] = useTransition();

  const preview = normaliseWeights(vals.lecture, vals.lab, vals.assessment);
  const dirty =
    preview.lecture !== lecture || preview.lab !== lab || preview.assessment !== assessment || cr !== credits;

  return (
    <div className="rounded-md border border-n-100 bg-n-25 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <Eyebrow>Progress weights</Eyebrow>
        <span className="font-num text-[11px] text-n-500">
          {credits} cr · {lecture} / {lab} / {assessment}
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
          <div className="flex items-center gap-2.5 border-b border-n-100 pb-2.5">
            <span className="w-[74px] shrink-0 text-[11.5px] text-n-600">Credits</span>
            <input
              type="number"
              min={1}
              max={200}
              value={cr}
              onChange={(e) => setCr(Number(e.target.value) || 0)}
              aria-label="Credits"
              className="font-num h-7 w-16 rounded-sm border border-n-200 bg-n-0 px-2 text-[12px] font-semibold text-n-800 outline-none focus:border-rust-400"
            />
            <span className="text-[10.5px] leading-4 text-n-400">Weights this course in overall progress.</span>
          </div>
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
                  await updateCourseWeights(courseId, vals.lecture, vals.lab, vals.assessment, cr);
                  router.refresh();
                })
              }
              className="shrink-0 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white transition-opacity duration-[120ms] disabled:opacity-40"
              style={{ background: cssColour(colour) }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

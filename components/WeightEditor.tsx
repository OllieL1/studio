"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Portal } from "@/lib/hooks/useModal";
import { useRouter } from "next/navigation";
import { updateCourseWeights } from "@/app/actions";
import { normaliseWeights } from "@/lib/progress";
import { Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";

/**
 * Per-course weights. Always normalised to 100 so the bar stays meaningful.
 *
 * Sits in a page header as just the numbers - "40 cr · 0 / 0 / 100" - and
 * opens the editor as a dropdown, so it takes no more room than a button.
 * The dropdown renders into <body> at fixed coordinates, like the editor's
 * menus, so a card's overflow or a later sibling can't clip or cover it.
 */
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

  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Under the button, right edges aligned; kept there on scroll and resize.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = root.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  // Close on a click elsewhere or Escape, like the nav's menus.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Progress weights: ${credits} credits, lecture ${lecture}, lab ${lab}, assessed ${assessment}`}
        title="Credits · lecture / lab / assessed weights"
        className={clsx(
          "font-num flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-[120ms]",
          open ? "border-n-300 bg-n-50 text-n-800" : "border-n-200 bg-n-0 text-n-600 hover:bg-n-50 hover:text-n-800",
        )}
      >
        {credits} cr <span className="text-n-300">·</span> {lecture} / {lab} / {assessment}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={clsx("text-n-400 transition-transform duration-[180ms]", open && "rotate-180")}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && pos && (
        <Portal>
          <div
            ref={panel}
            style={{ top: pos.top, right: pos.right }}
            className="animate-scale-in fixed z-50 w-80 origin-top-right space-y-2.5 rounded-lg border border-n-100 bg-n-0 p-3.5 shadow-[var(--shadow-pop)]"
          >
            <Eyebrow>Progress weights</Eyebrow>
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
                    setOpen(false);
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
        </Portal>
      )}
    </div>
  );
}

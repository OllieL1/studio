"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMoodleUrl } from "@/app/actions";
import { Portal } from "@/lib/hooks/useModal";
import { Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";
import { MoodleIcon, MOODLE_ORANGE } from "./MoodleIcon";

/**
 * A course's Moodle page: one click to open it, and a small editor to set it.
 * Courses without a link show a quiet "Add Moodle" instead of an empty button.
 *
 * The editor is a dropdown like the progress-weights one - rendered into
 * <body> at fixed coordinates under the button - so opening it never moves the
 * content around it.
 */
export function MoodleLink({ courseId, url }: { courseId: string; url: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openEditor = () => {
    setValue(url ?? "");
    setError(null);
    setOpen((v) => !v);
  };

  const save = () =>
    startTransition(async () => {
      const res = await updateMoodleUrl(courseId, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setOpen(false);
      router.refresh();
    });

  const editor =
    open && pos ? (
      <Portal>
        <div
          ref={panel}
          style={{ top: pos.top, right: pos.right }}
          className="animate-scale-in fixed z-50 w-80 origin-top-right space-y-2.5 rounded-lg border border-n-100 bg-n-0 p-3.5 shadow-[var(--shadow-pop)]"
        >
          <Eyebrow>Moodle link</Eyebrow>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder="https://moodle.gla.ac.uk/course/view.php?id=…"
            aria-label="Moodle link"
            className="h-8 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[12px] text-n-800 outline-none focus:border-rust-400"
          />
          {error && <p className="text-[11px] text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <p className="text-[10.5px] leading-4 text-n-400">Leave empty to remove the link.</p>
            <button
              disabled={pending || value.trim() === (url ?? "")}
              onClick={save}
              className="shrink-0 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white transition-opacity duration-[120ms] disabled:opacity-40"
              style={{ background: MOODLE_ORANGE }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Portal>
    ) : null;

  if (!url) {
    return (
      <div ref={root} className="relative">
        <button
          onClick={openEditor}
          aria-expanded={open}
          className="rounded-md border border-dashed border-n-200 px-3 py-1.5 text-[12px] font-medium text-n-500 transition-colors duration-[120ms] hover:border-n-300 hover:bg-n-25 hover:text-n-700"
        >
          Add Moodle
        </button>
        {editor}
      </div>
    );
  }

  return (
    <div ref={root} className="relative">
      {/* The pencil lives inside the button, hidden off its right edge until
          hover or keyboard focus, so the button never changes size and the gaps
          to its neighbours stay even. The label shifts left to make room. Same
          box as its neighbours: 1px border, 12px sides, 6px top and bottom. */}
      <span
        style={{ background: MOODLE_ORANGE }}
        className="group/moodle relative flex overflow-hidden rounded-md border border-transparent text-[12px] font-semibold text-white shadow-sm"
      >
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center px-3 py-1.5 transition-[filter] duration-[120ms] hover:brightness-95"
        >
          <span className={clsx("flex items-center gap-1.5 transition-transform duration-[180ms] group-hover/moodle:-translate-x-[11px] group-focus-within/moodle:-translate-x-[11px]", open && "-translate-x-[11px]")}>
            <MoodleIcon size={18} rounded="" />
            Moodle
          </span>
        </a>
        <button
          onClick={openEditor}
          aria-label="Change the Moodle link"
          aria-expanded={open}
          title="Change the Moodle link"
          className={clsx("absolute inset-y-0 right-0 flex w-[24px] items-center justify-center bg-black/15 transition-[transform,background-color] duration-[180ms] hover:bg-black/25 focus-visible:translate-x-0 group-hover/moodle:translate-x-0 group-focus-within/moodle:translate-x-0", open ? "translate-x-0" : "translate-x-full")}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M8.2 1.9 10.1 3.8M2 10l.5-2.1 5.3-5.3 1.9 1.9-5.3 5.3L2 10Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>
      {editor}
    </div>
  );
}

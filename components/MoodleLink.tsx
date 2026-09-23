"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMoodleUrl } from "@/app/actions";

/**
 * A course's Moodle page: one click to open it, and an inline field to set it
 * the first time. Courses without a link show a quiet "Add Moodle" instead of
 * an empty button.
 */
export function MoodleLink({ courseId, url }: { courseId: string; url: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await updateMoodleUrl(courseId, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setEditing(false);
      router.refresh();
    });

  if (editing) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder="https://moodle.gla.ac.uk/course/view.php?id=…"
          aria-label="Moodle link"
          className="h-8 w-[290px] rounded-sm border border-n-200 bg-n-0 px-2.5 text-[12.5px] outline-none focus:border-rust-400"
        />
        <button
          onClick={save}
          disabled={pending}
          className="rounded-md bg-rust-500 px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-n-500 hover:bg-n-100"
        >
          Cancel
        </button>
        {error && <span className="text-[11.5px] text-danger">{error}</span>}
      </span>
    );
  }

  if (!url) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded-md border border-dashed border-n-200 px-2.5 py-1.5 text-[12px] font-medium text-n-500 transition-colors duration-[120ms] hover:border-n-300 hover:bg-n-25 hover:text-n-700"
      >
        Add Moodle
      </button>
    );
  }

  return (
    <span className="group/moodle flex items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-800"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 6.5v3h7v-3M6 1.5v6M3.8 3.7 6 1.5l2.2 2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Moodle
      </a>
      <button
        onClick={() => setEditing(true)}
        aria-label="Change the Moodle link"
        className="rounded p-1 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-n-100 hover:text-n-700 focus-visible:opacity-100 group-hover/moodle:opacity-100"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M8.2 1.9 10.1 3.8M2 10l.5-2.1 5.3-5.3 1.9 1.9-5.3 5.3L2 10Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  );
}

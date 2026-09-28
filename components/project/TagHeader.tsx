"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { renameTag } from "@/app/nexusActions";

/** The tag's name, renameable in place. A rename follows it everywhere. */
export function TagHeader({ id, name, count }: { id: string; name: string; count: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await renameTag(id, value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      setError(null);
      router.replace(`/project/tags/${encodeURIComponent(value.trim().toLowerCase())}` as Route);
      router.refresh();
    });

  return editing ? (
    // Its own row, centred: an input, a button and a caption don't share a
    // baseline convincingly, and the count is just noise mid-rename.
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label="Tag name"
        className="font-display h-9 w-[240px] rounded-md border border-n-200 bg-n-0 px-2 text-[24px] font-semibold text-n-900 outline-none focus:border-rust-400"
      />
      <button
        onClick={save}
        disabled={pending}
        className="h-9 rounded-md bg-rust-500 px-3 text-[12px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => setEditing(false)}
        className="h-9 rounded-md px-2.5 text-[12px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-n-100"
      >
        Cancel
      </button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </div>
  ) : (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <h1 className="font-display text-[32px] leading-none font-semibold tracking-tight text-n-900">
        <span className="text-n-300">#</span>
        {name}
      </h1>
      <button
        onClick={() => setEditing(true)}
        className="h-7 rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
      >
        Rename
      </button>
      <span className="font-num text-[12px] text-n-400">{count} filed</span>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectSettings } from "@/app/projectActions";
import { GitHubMark } from "@/components/GitHubMark";

/**
 * The project's GitHub link. A placeholder for deeper GitHub integration
 * later - for now, one click to the repo from the project page.
 */
export function RepoLink({ url }: { url: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await updateProjectSettings({ repoUrl: value });
      if (!res.ok) { setError(res.error); return; }
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
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          placeholder="https://github.com/you/your-project"
          aria-label="Repository link"
          className="h-8 w-72 rounded-sm border border-n-200 px-2.5 text-[12.5px] outline-none focus:border-rust-400"
        />
        <button onClick={save} disabled={pending} className="rounded-md bg-rust-500 px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">Save</button>
        <button onClick={() => setEditing(false)} className="rounded-md px-2 py-1.5 text-[12px] font-semibold text-n-500 hover:bg-n-100">Cancel</button>
        {error && <span className="w-full text-[11.5px] text-danger">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-md border border-n-200 bg-n-0 px-3 py-1.5 text-[12.5px] font-semibold text-n-700 hover:bg-n-50">
          <GitHubMark />
          {url.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, "") || "Repository"}
        </a>
      ) : (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-md border border-dashed border-n-300 px-3 py-1.5 text-[12.5px] font-medium text-n-500 hover:bg-n-50 hover:text-n-700">
          <GitHubMark /> Link GitHub repo
        </button>
      )}
      {url && (
        <button onClick={() => setEditing(true)} aria-label="Change repository link" className="rounded p-1.5 text-n-400 hover:bg-n-100 hover:text-n-700">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M8.2 1.8l2 2L4 10H2v-2l6.2-6.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

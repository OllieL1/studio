"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProjectSettings } from "@/app/projectActions";

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

function GitHubMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

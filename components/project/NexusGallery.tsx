"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createNote } from "@/app/nexusActions";
import { fmtRelative } from "@/lib/dates";
import { Card, EmptyState } from "../ui";
import { clsx } from "@/lib/clsx";

export type NexusCard = {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: Date;
  tags: string[];
  excerpt: string;
  words: number;
};

/**
 * Nexus: the project's notebook as a gallery.
 *
 * Flat by design - pinning and tags do the organising, so there are no
 * folders to keep tidy. Filtering happens here rather than on the server
 * because the whole set is small and it keeps typing instant.
 */
export function NexusGallery({ notes, tags }: { notes: NexusCard[]; tags: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter((n) => {
      if (tag && !n.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return false;
      if (!q) return true;
      return `${n.title} ${n.excerpt} ${n.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [notes, query, tag]);

  const add = () =>
    startTransition(async () => {
      const res = await createNote();
      if (res.ok) router.push(`/project/nexus/${res.id}` as Route);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={add}
          disabled={pending}
          className="rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-50"
        >
          {pending ? "Creating…" : "+ New note"}
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="h-8 w-[220px] rounded-md border border-n-200 bg-n-0 px-2.5 text-[12.5px] outline-none focus:border-rust-400"
        />
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag((cur) => (cur === t ? null : t))}
              aria-pressed={tag === t}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-[120ms]",
                tag === t
                  ? "border-transparent bg-n-800 text-n-0"
                  : "border-n-200 text-n-600 hover:bg-n-50",
              )}
            >
              #{t}
            </button>
          ))}
        </div>
        <span className="font-num ml-auto text-[11.5px] text-n-400">
          {shown.length} note{shown.length === 1 ? "" : "s"}
        </span>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title={notes.length === 0 ? "Nexus is empty." : "Nothing matches."}
            body={
              notes.length === 0
                ? "Make a note for anything that isn't a paper or a task - links, reading plans, half-formed ideas. Mention papers, tags and tasks with @ to tie them together."
                : "Try a different search, or clear the tag filter."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <Link
              key={n.id}
              href={`/project/nexus/${n.id}` as Route}
              className="card group flex min-h-[132px] flex-col p-4 transition-colors duration-[120ms] hover:border-n-200 hover:bg-n-25"
            >
              <div className="flex items-baseline gap-2">
                <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-n-800 group-hover:text-rust-700">
                  {n.title}
                </h3>
                {n.pinned && (
                  <span aria-label="Pinned" title="Pinned" className="shrink-0 text-[11px] text-rust-500">
                    ●
                  </span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-3 flex-1 text-[12px] leading-[18px] text-n-500">
                {n.excerpt || "Empty note."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {n.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full bg-info-soft px-1.5 py-px text-[10.5px] font-medium text-info">
                    #{t}
                  </span>
                ))}
                <span className="font-num ml-auto text-[10.5px] text-n-400">{fmtRelative(n.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

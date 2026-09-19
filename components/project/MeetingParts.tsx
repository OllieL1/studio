"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMeetingAction, draftAgendaFor, saveMeetingText, setMeetingPrep } from "@/app/projectActions";
import { toggleTask } from "@/app/actions";
import { clsx } from "@/lib/clsx";
import { MarkdownField } from "../MarkdownField";

type PrepTask = { id: string; title: string; done: boolean };

/** Tasks to finish before the meeting. Advisory, like task prerequisites. */
export function PrepList({ meetingId, courseId, prep }: { meetingId: string; courseId: string | null; prep: PrepTask[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!adding) return;
    const params = new URLSearchParams({ open: "1" });
    if (courseId) params.set("courseIds", courseId);
    if (q.trim()) params.set("q", q.trim());
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tasks?${params}`);
      const data = (await res.json()) as { id: string; title: string }[];
      setOptions(data.filter((o) => !prep.some((p) => p.id === o.id)).slice(0, 10));
    }, 120);
    return () => clearTimeout(t);
  }, [adding, q, courseId, prep]);

  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); router.refresh(); });

  return (
    <div>
      {prep.length === 0 && !adding && <p className="mb-2 text-[12.5px] text-n-400">Nothing to prepare yet.</p>}
      <div className="space-y-0.5">
        {prep.map((t) => (
          <div key={t.id} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-n-50">
            <button
              onClick={() => run(() => toggleTask(t.id))}
              disabled={pending}
              aria-label={t.done ? `Untick ${t.title}` : `Tick ${t.title}`}
              className={clsx("flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border", t.done ? "border-ok bg-ok" : "border-n-300")}
            >
              {t.done && (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <Link href={`/tasks/${t.id}` as Route} className={clsx("min-w-0 flex-1 truncate text-[13px] hover:underline", t.done ? "text-n-400 line-through" : "text-n-700")}>
              {t.title}
            </Link>
            <button
              onClick={() => run(() => setMeetingPrep(meetingId, t.id, false))}
              aria-label={`Remove ${t.title} from prep`}
              className="rounded p-1 text-n-300 opacity-0 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="animate-fade-in mt-2 rounded-sm border border-n-200">
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder="Find a project task…"
            className="h-8 w-full border-b border-n-100 bg-transparent px-2.5 text-[12.5px] outline-none"
          />
          <div className="max-h-48 overflow-y-auto p-1">
            {options.length === 0 ? (
              <p className="px-2 py-2 text-[11.5px] text-n-400">No open tasks match. Create one on the Tasks tab.</p>
            ) : options.map((o) => (
              <button key={o.id} onClick={() => { run(() => setMeetingPrep(meetingId, o.id, true)); setQ(""); }}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-[12.5px] text-n-700 hover:bg-rust-50">
                {o.title}
              </button>
            ))}
          </div>
          <div className="border-t border-n-100 px-2 py-1.5 text-right">
            <button onClick={() => setAdding(false)} className="text-[11px] font-semibold text-n-500 hover:text-n-800">Done</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-md border border-dashed border-n-200 py-1.5 text-[12px] font-medium text-n-500 hover:bg-n-25 hover:text-n-700">
          + Add prep task
        </button>
      )}
    </div>
  );
}

/** Agenda with a "draft it for me" button. */
export function AgendaField({ meetingId, initial }: { meetingId: string; initial: string }) {
  const [drafting, startDraft] = useTransition();
  return (
    <MarkdownField
      initial={initial}
      save={(md) => saveMeetingText(meetingId, "agenda", md)}
      placeholder="What do you want to cover? Or draft it from your recent work."
      minHeight={220}
      toolbar={({ setValue, value }) => (
        <button
          type="button"
          disabled={drafting}
          onClick={() => {
            if (value.trim() && !confirm("Replace the current agenda with a fresh draft?")) return;
            startDraft(async () => setValue(await draftAgendaFor(meetingId)));
          }}
          className="rounded-md border border-rust-200 bg-rust-50 px-2 py-0.5 text-[11.5px] font-semibold text-rust-700 hover:bg-rust-100 disabled:opacity-50"
        >
          {drafting ? "Drafting..." : "Draft from recent work"}
        </button>
      )}
    />
  );
}

export function NotesField({ meetingId, initial }: { meetingId: string; initial: string }) {
  return (
    <MarkdownField
      initial={initial}
      save={(md) => saveMeetingText(meetingId, "notes", md)}
      placeholder="What was discussed, decisions made, feedback…"
      minHeight={200}
    />
  );
}

/** Add an action item - it becomes a project task linked to this meeting. */
export function AddAction({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () => {
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await addMeetingAction(meetingId, title, due || null);
      if (!res.ok) { setError(res.error); return; }
      setTitle(""); setDue(""); setError(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-n-100 px-3 py-2.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="New action - becomes a task"
        aria-label="New action"
        className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-n-400"
      />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" className="font-num h-8 rounded-sm border border-n-200 px-2 text-[12px] outline-none focus:border-rust-400" />
      <button onClick={add} disabled={pending || !title.trim()} className="rounded-md bg-rust-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rust-600 disabled:opacity-40">
        Add
      </button>
      {error && <p className="w-full text-[12px] text-danger">{error}</p>}
    </div>
  );
}

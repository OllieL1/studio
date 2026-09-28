"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteNote, setNoteTags, updateNote } from "@/app/nexusActions";
import { LiveEditor } from "../editor/LiveEditor";
import { TagPicker } from "./TagPicker";
import { clsx } from "@/lib/clsx";

/**
 * One Nexus note: a title, its tags, and the same editor the lectures use -
 * so `[` inserts blocks and `@` mentions papers, tags, tasks and meetings.
 */
export function NoteEditor({
  note,
  initialHtml,
  allTags,
}: {
  note: { id: string; title: string; body: string; pinned: boolean; tags: string[] };
  initialHtml: string[];
  allTags: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [pinned, setPinned] = useState(note.pinned);
  const titleBeforeEdit = useRef(note.title);
  const [raw, setRaw] = useState(false);
  const [saved, setSaved] = useState(true);
  const [, startTransition] = useTransition();

  const save = (patch: Parameters<typeof updateNote>[1]) =>
    startTransition(async () => {
      await updateNote(note.id, patch);
      router.refresh();
    });

  const startEditingTitle = () => {
    titleBeforeEdit.current = title;
    setEditingTitle(true);
  };

  /** Blur or Enter commits; Escape has already put the old title back. */
  const commitTitle = () => {
    setEditingTitle(false);
    // updateNote falls back to "Untitled" for an empty title, so show that too.
    const next = title.trim() || "Untitled";
    if (next !== title) setTitle(next);
    if (next !== titleBeforeEdit.current) save({ title: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setTitle(titleBeforeEdit.current);
                setEditingTitle(false);
              }
            }}
            placeholder="Untitled"
            aria-label="Note title"
            className="font-display h-9 min-w-0 flex-1 rounded-md border border-n-200 bg-n-0 px-2 text-[24px] font-semibold tracking-tight text-n-900 outline-none focus:border-rust-400"
          />
        ) : (
          <>
            <h1
              onDoubleClick={startEditingTitle}
              className="font-display min-w-0 flex-1 truncate text-[26px] leading-9 font-semibold tracking-tight text-n-900"
            >
              {title}
            </h1>
            <button
              onClick={startEditingTitle}
              className="h-8 shrink-0 rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
            >
              Edit
            </button>
          </>
        )}
        <button
          onClick={() => {
            setPinned((p) => !p);
            save({ pinned: !pinned });
          }}
          aria-pressed={pinned}
          title="Pin to the top of Nexus"
          className={clsx(
            "h-8 shrink-0 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors duration-[120ms]",
            pinned ? "border-transparent bg-rust-500 text-white" : "border-n-200 bg-n-0 text-n-600 hover:bg-n-50",
          )}
        >
          {pinned ? "Pinned" : "Pin"}
        </button>
        <span className="flex items-center gap-1.5 text-[11px] text-n-400">
          <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", saved ? "bg-ok" : "bg-warn")} />
          {saved ? "Saved" : "Saving…"}
        </span>
        <div className="flex h-8 items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5" role="group" aria-label="Editing mode">
          {([["Live", false], ["Markdown", true]] as const).map(([label, mode]) => (
            <button
              key={label}
              onClick={() => setRaw(mode)}
              aria-pressed={raw === mode}
              className={clsx(
                "flex h-full items-center rounded-[5px] px-2 text-[11px] font-semibold transition-colors duration-[120ms]",
                raw === mode ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <a
          href={`/api/project/notes/pdf?ids=${note.id}`}
          target="_blank"
          rel="noreferrer"
          title="Export this note to PDF"
          className="flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
        >
          PDF
        </a>
        <button
          onClick={() => {
            if (!confirm(`Delete "${title}"?`)) return;
            startTransition(async () => {
              await deleteNote(note.id);
              router.push("/project?tab=nexus");
            });
          }}
          className="h-8 shrink-0 rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-danger-soft hover:text-danger"
        >
          Delete
        </button>
      </div>

      <TagPicker
        selected={note.tags}
        all={allTags}
        onChange={(tags) =>
          startTransition(async () => {
            await setNoteTags(note.id, tags);
            router.refresh();
          })
        }
      />

      <div className="card px-3 py-3 sm:px-5">
        <LiveEditor
          initial={note.body}
          initialHtml={initialHtml}
          onSave={async (body) => { await updateNote(note.id, { body }); }}
          onSavedChange={setSaved}
          raw={raw}
          onRawChange={setRaw}
          placeholder="Write here. [ inserts blocks, @ mentions a paper, tag, task, note or meeting."
        />
      </div>
    </div>
  );
}

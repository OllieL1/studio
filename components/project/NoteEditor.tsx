"use client";

import type { Route } from "next";
import { isModeToggle, MODE_SHORTCUT } from "@/lib/editor/shortcuts";
import { pdfTab } from "@/lib/pdfTab";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteNote, setNoteTags, updateNote } from "@/app/nexusActions";
import { LiveEditor } from "../editor/LiveEditor";
import { TagPicker } from "./TagPicker";
import { clsx } from "@/lib/clsx";

/**
 * One note - in Nexus or on a task: a title, its tags, and the same editor
 * the lectures use - so `[` inserts blocks and `@` mentions papers, tags,
 * tasks and meetings.
 *
 * It borrows the lectures' two shortcuts as well: ⌥M flips between Live and
 * Markdown, and ⌘. is focus mode - the note alone, full screen, with the
 * title and controls tucked into a strip that appears when the pointer
 * nears the top.
 */
export function NoteEditor({
  note,
  initialHtml,
  allTags,
  backHref = "/project?tab=nexus",
  showPin = true,
}: {
  note: { id: string; title: string; body: string; pinned: boolean; tags: string[] };
  initialHtml: string[];
  allTags: string[];
  /** Where deleting the note leaves you. */
  backHref?: string;
  /** Pinning orders the Nexus gallery; a task's notes have no use for it. */
  showPin?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [pinned, setPinned] = useState(note.pinned);
  const titleBeforeEdit = useRef(note.title);
  const [raw, setRaw] = useState(false);
  const [saved, setSaved] = useState(true);
  const [minimal, setMinimal] = useState(false);
  const [barHovered, setBarHovered] = useState(false);
  const [, startTransition] = useTransition();

  const toggleMinimal = useCallback(() => setMinimal((m) => !m), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === ".") {
        e.preventDefault();
        toggleMinimal();
      }
      // ⌥M (or ⌘⇧M where the browser allows) - lib/editor/shortcuts.ts.
      if (isModeToggle(e)) {
        e.preventDefault();
        setRaw((r) => !r);
      }
      // Escape leaves focus mode, but not from inside a block: there it
      // exits the block first. Listening in the capture phase matters - the
      // editor blurs the block on this same keypress, and by the time a
      // bubbling listener ran it would find nothing focused and leave too.
      if (e.key === "Escape" && document.activeElement?.tagName !== "TEXTAREA") setMinimal(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleMinimal]);

  // The title input goes with the header; an unmounted input never fires blur,
  // so commit what was typed rather than leaving it "editing" on the way back.
  useEffect(() => {
    if (minimal && editingTitle) commitTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimal]);

  // The page behind shouldn't scroll while the full-screen layer is up.
  useEffect(() => {
    if (!minimal) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [minimal]);

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

  const status = (
    <span className="flex items-center gap-1.5 text-[11px] text-n-400">
      <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", saved ? "bg-ok" : "bg-warn")} />
      {saved ? "Saved" : "Saving…"}
    </span>
  );

  const modeToggle = (
    <div className="flex h-8 items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5" role="group" aria-label="Editing mode">
      {([["Live", false], ["Markdown", true]] as const).map(([label, mode]) => (
        <button
          key={label}
          onClick={() => setRaw(mode)}
          aria-pressed={raw === mode}
          title={`${label} (${MODE_SHORTCUT})`}
          className={clsx(
            "flex h-full items-center rounded-[5px] px-2 text-[11px] font-semibold transition-colors duration-[120ms]",
            raw === mode ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-800",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const focusButton = (
    <button
      onClick={toggleMinimal}
      title="Minimal mode (⌘.)"
      className="flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
    >
      {minimal ? "Exit" : "Focus"}
    </button>
  );

  const pdfLink = (
    <a
      href={pdfTab(`/api/project/notes/pdf?ids=${note.id}`, title || "Note")}
      target="_blank"
      rel="noreferrer"
      title="Export this note to PDF"
      className="flex h-8 shrink-0 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
    >
      PDF
    </a>
  );

  return (
    // One tree for both layouts - only classes change - so the editor is never
    // remounted (and what was typed since the page loaded never lost).
    <div className={clsx(minimal ? "animate-fade-in fixed inset-0 z-[60] overflow-y-auto bg-n-0" : "space-y-4")}>
      {minimal && (
        // Ultra-minimal: the bar is a 12px strip until the pointer nears it.
        <div
          onMouseEnter={() => setBarHovered(true)}
          onMouseLeave={() => setBarHovered(false)}
          className="sticky top-0 z-20 h-3"
        >
          <div
            className={clsx(
              "flex items-center gap-3 border-b border-n-100 bg-n-0/95 px-5 py-2.5 backdrop-blur transition-all duration-[180ms]",
              barHovered ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
            )}
          >
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-n-800">{title}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              {status}
              {modeToggle}
              {pdfLink}
              {focusButton}
            </div>
          </div>
        </div>
      )}
      {!minimal && <div className="flex flex-wrap items-center gap-2">
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
            className="font-display -mx-2 h-9 min-w-0 flex-1 rounded-md border border-n-200 bg-n-0 px-[7px] text-[26px] font-semibold tracking-tight text-n-900 outline-none focus:border-rust-400"
          />
        ) : (
          // The title is its own edit button: click it (or Enter on it) and it
          // becomes the input, in the same place and size so nothing jumps.
          <h1
            tabIndex={0}
            onClick={startEditingTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                startEditingTitle();
              }
            }}
            title="Click to rename"
            className="font-display -mx-2 min-w-0 flex-1 cursor-text truncate rounded-md border border-transparent px-[7px] text-[26px] leading-[34px] font-semibold tracking-tight text-n-900 outline-none transition-colors duration-[120ms] hover:bg-n-50 focus-visible:border-rust-400"
          >
            {title}
          </h1>
        )}
        {showPin && <button
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
        </button>}
        {status}
        {modeToggle}
        {focusButton}
        {pdfLink}
        <button
          onClick={() => {
            if (!confirm(`Delete "${title}"?`)) return;
            startTransition(async () => {
              await deleteNote(note.id);
              router.push(backHref as Route);
            });
          }}
          className="h-8 shrink-0 rounded-md border border-n-200 bg-n-0 px-2.5 text-[11.5px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-danger-soft hover:text-danger"
        >
          Delete
        </button>
      </div>}

      {!minimal && (
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
      )}

      <div className={clsx(minimal ? "mx-auto w-full max-w-[760px] px-5 py-8" : "card px-3 py-3 sm:px-5")}>
        <LiveEditor
          initial={note.body}
          initialHtml={initialHtml}
          minimal={minimal}
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

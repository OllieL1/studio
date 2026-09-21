"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveEditor } from "./LiveEditor";
import { Attachments, type AttachedFile } from "./Attachments";
import { LectureChecklist } from "../LectureChecklist";
import { NotebookLocation } from "../NotebookLocation";
import { clsx } from "@/lib/clsx";

/**
 * The lecture workspace: properties on top, the note below, time in a drawer.
 *
 * Minimal mode restyles the editor's own container instead of rendering the
 * editor somewhere else in the tree: React would remount it, and everything
 * typed since the page loaded would vanish from the screen.
 */
export function LectureWorkspace({
  taskId,
  title,
  meta,
  initial,
  initialHtml,
  items,
  notebook,
  notebookPages,
  files,
  time,
}: {
  taskId: string;
  title: string;
  /** Course, date - shown in the minimal-mode bar. */
  meta: string;
  initial: string;
  initialHtml: string[];
  items: { id: string; label: string; done: boolean; isRevision: boolean }[];
  notebook: string | null;
  notebookPages: string | null;
  files: AttachedFile[];
  /** Server-rendered time panel. */
  time: React.ReactNode;
}) {
  const [minimal, setMinimal] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [openProps, setOpenProps] = useState(false);
  // Live is the default and stays the default; raw markdown is the detour.
  const [raw, setRaw] = useState(false);
  const [saved, setSaved] = useState(true);
  const surface = useRef<HTMLDivElement>(null);

  const done = items.filter((i) => i.done).length;

  const toggleMinimal = useCallback(() => setMinimal((m) => !m), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Caps Lock reports an upper-case key; shortcuts shouldn't care.
      if (mod && e.key === ".") {
        e.preventDefault();
        toggleMinimal();
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setShowTime((s) => !s);
      }
      if (mod && e.key === "/") {
        e.preventDefault();
        setRaw((r) => !r);
      }
      // Escape leaves minimal mode, but only when nothing else is open and the
      // caret isn't in a block (there, Escape exits the block first).
      if (e.key === "Escape" && document.activeElement?.tagName !== "TEXTAREA") {
        setShowTime(false);
        setMinimal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMinimal]);

  // The page behind shouldn't scroll while the full-screen layer is up.
  useEffect(() => {
    if (!minimal) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [minimal]);

  const editor = (
    <LiveEditor
      taskId={taskId}
      initial={initial}
      initialHtml={initialHtml}
      minimal={minimal}
      raw={raw}
      onRawChange={setRaw}
      onSavedChange={setSaved}
      placeholder="Start typing. Press [ for headings, lists, tables, equations and code."
    />
  );

  const status = (
    <span className="flex items-center gap-1.5 text-[11px] text-n-400">
      <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", saved ? "bg-ok" : "bg-warn")} />
      {saved ? "Up to date" : "Saving…"}
    </span>
  );

  /** Live is first and highlighted when active, so the default is obvious. */
  const modeToggle = (
    <div className="flex items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5" role="group" aria-label="Editing mode">
      {([["Live", false], ["Markdown", true]] as const).map(([label, value]) => (
        <button
          key={label}
          onClick={() => setRaw(value)}
          aria-pressed={raw === value}
          title={`${label} (⌘/)`}
          className={clsx(
            "rounded-[5px] px-2 py-[3px] text-[11px] font-semibold transition-colors duration-[120ms]",
            raw === value ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-800",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-1.5">
      {status}
      {modeToggle}
      <button
        onClick={() => setShowTime(true)}
        className="rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
        title="Time on this lecture (⌘⇧T)"
      >
        Time
      </button>
      <a
        href={`/api/lectures/pdf?id=${taskId}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
      >
        PDF
      </a>
      <button
        onClick={toggleMinimal}
        className="rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[11.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
        title="Minimal mode (⌘.)"
      >
        {minimal ? "Exit" : "Focus"}
      </button>
    </div>
  );

  return (
    <>
      {/* ── Properties ───────────────────────────────────────────────────── */}
      {!minimal && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
            <button
              onClick={() => setOpenProps((o) => !o)}
              aria-expanded={openProps}
              className="flex items-center gap-2 text-[11.5px] font-semibold text-n-500 transition-colors duration-[120ms] hover:text-n-800"
            >
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden
                className={clsx("transition-transform duration-[180ms]", openProps && "rotate-90")}
              >
                <path d="M3.5 2 6.5 5l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Properties
            </button>

            <Chip label="Completion" value={`${done}/${items.length}`} tone={done === items.length && items.length > 0 ? "ok" : "plain"} />
            <Chip label="Handwritten" value={notebook ? `${notebook}${notebookPages ? ` pp. ${notebookPages}` : ""}` : "Not recorded"} tone={notebook ? "ok" : "plain"} />
            <Chip label="Slides" value={files.length === 0 ? "None" : `${files.length} PDF${files.length === 1 ? "" : "s"}`} tone={files.length ? "ok" : "plain"} />

            <div className="ml-auto">{toolbar}</div>
          </div>

          {openProps && (
            <div className="animate-fade-in grid gap-4 border-t border-n-100 px-3 py-3 sm:grid-cols-3">
              <Field label="Completion">
                <LectureChecklist items={items} />
              </Field>
              <Field label="Handwritten notes">
                <NotebookLocation taskId={taskId} notebook={notebook} pages={notebookPages} compact />
              </Field>
              <Field label="Lecture PDF">
                <Attachments taskId={taskId} files={files} />
              </Field>
            </div>
          )}
        </div>
      )}

      {/* ── The note ─────────────────────────────────────────────────────────
          One editor instance, moved between layouts by class rather than by
          branch: rendering it in two places would remount it and throw away
          everything typed since the page loaded. */}
      <div
        className={clsx(
          minimal
            ? "animate-fade-in fixed inset-0 z-[60] overflow-y-auto bg-n-0"
            : "card px-3 py-3 sm:px-5",
        )}
      >
        {minimal && (
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-n-100 bg-n-0/90 px-5 py-2.5 backdrop-blur">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-n-800">{title}</p>
              <p className="truncate text-[11px] text-n-400">{meta}</p>
            </div>
            <div className="ml-auto shrink-0">{toolbar}</div>
          </div>
        )}
        <div ref={surface} className={clsx(minimal && "mx-auto w-full max-w-[760px] px-5 py-8")}>
          {editor}
        </div>
      </div>

      {/* ── Time drawer ──────────────────────────────────────────────────── */}
      {showTime && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Time on this lecture">
          <div className="animate-fade-in absolute inset-0 bg-[var(--scrim)] backdrop-blur-[1px]" onClick={() => setShowTime(false)} />
          <div className="animate-slide-in absolute inset-y-0 right-0 w-full max-w-[420px] overflow-y-auto border-l border-n-100 bg-n-25 p-4 shadow-[var(--shadow-pop)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[18px] font-semibold text-n-900">Time on this lecture</h2>
              <button
                onClick={() => setShowTime(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-n-400 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-700"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {time}
          </div>
        </div>
      )}
    </>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone: "ok" | "plain" }) {
  return (
    <span className="flex items-baseline gap-1.5 text-[11.5px]">
      <span className="text-n-400">{label}</span>
      <span className={clsx("font-medium", tone === "ok" ? "text-n-700" : "text-n-500")}>{value}</span>
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-n-400">{label}</p>
      {children}
    </div>
  );
}
